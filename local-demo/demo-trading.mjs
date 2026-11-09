// Compras EXCLUSIVAMENTE en cuenta Deriv DEMO, con aprobación humana en la ventana local.
// Jamás conectar /ws/real, jamás reintentar BUY ambiguo. Persistencia SQLite local.
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {diagnoseTrade} from './trade-analysis.mjs';
import {isVolatilitySymbol} from './synthetic-catalog.mjs';
import {captureCandleContext} from './candle-patterns.mjs';
import {conservativeQuoteDecision} from './tick-horizon-model.mjs';

const SYMBOLS=new Set(['R_10','R_25','R_50','R_75','R_100',
 '1HZ10V','1HZ50V','1HZ75V','1HZ100V','1HZ500V','R_500']);
const STAKES=new Set([35,50,75,90,100,200,500,1000]);
const STOP_BALANCE_CENTS=990000; // DEMO 10000 USD: parada con pérdida de 100 USD.
// Compras DEMO autorizadas sin límite acumulativo.
const MAX_DAILY_NET_LOSS_CENTS=10000; // Parada por P&L neto liquidado, US$100.
const MAX_CONCURRENT=5; // SOLO cinco contratos DEMO en paralelo; REAL bloqueada.
const TERMINAL=new Set(['SETTLED','REJECTED','CANCELLED','EXPIRED']);
const epoch=()=>Math.floor(Date.now()/1000);
const cents=value=>Math.round(Number(value)*100);
const cleanError=error=>String(error?.message||'DEMO_BROKER_ERROR').replace(/[^A-Za-z0-9_]/g,'').slice(0,80);
const optionalNumber=x=>x===undefined||x===null||x===''?null:Number.isFinite(Number(x))?Number(x):null;
// Deriv v2 renamed entry_tick/exit_tick -> entry_spot/exit_spot.
const settlementFields=c=>[optionalNumber(c?.entry_spot??c?.entry_tick),
 optionalNumber(c?.exit_spot??c?.exit_tick),
 optionalNumber(c?.entry_spot_time??c?.entry_tick_time),
 optionalNumber(c?.exit_spot_time??c?.exit_tick_time)];

export function createDemoTrading({db,getAccount,getCredentials,brokerHeaders,accountLookup,otpLookup,marketSnapshot,audit,getVersion=()=>null}) {
 db.exec("CREATE TABLE IF NOT EXISTS demo_local_orders (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, state TEXT NOT NULL, source TEXT NOT NULL, symbol TEXT NOT NULL, direction TEXT NOT NULL, stake_cents INTEGER NOT NULL, contract_id TEXT, buy_cents INTEGER, pnl_cents INTEGER, error_code TEXT)");
 const columns=new Set(db.prepare("PRAGMA table_info(demo_local_orders)").all().map(x=>x.name));
 for(const [name,sqlType] of Object.entries({batch_id:'TEXT',created_at_ms:'INTEGER',bought_at_ms:'INTEGER',
  settled_at_ms:'INTEGER',proposal_latency_ms:'INTEGER',buy_latency_ms:'INTEGER',
  signal_age_ms:'INTEGER',signal_rsi:'REAL',signal_sma_fast:'REAL',signal_sma_slow:'REAL',
  signal_ema20:'REAL',signal_ema50:'REAL',signal_atr14:'REAL',signal_momentum5:'REAL',
  signal_strength:'INTEGER',proposal_payout_cents:'INTEGER',signal_quote:'REAL',
  entry_tick:'REAL',exit_tick:'REAL',entry_tick_epoch:'INTEGER',exit_tick_epoch:'INTEGER',
  candle_open:'REAL',candle_high:'REAL',candle_low:'REAL',candle_close:'REAL',candle_epoch:'INTEGER',
  projected_next_tick:'REAL',projection_model_mae:'REAL',projection_naive_mae:'REAL',app_version:'TEXT',strategy_version:'TEXT',
   signal_five_tick_momentum:'REAL',signal_tick_rsi14:'REAL',
   five_tick_study_hit_rate:'REAL',five_tick_study_n:'INTEGER',
   signal_snapshot_epoch:'INTEGER',signal_reason:'TEXT',
   duration_ticks:'INTEGER',prediction_mode:'TEXT',prediction_policy:'TEXT',
   prediction_lower95:'REAL',prediction_quote_edge:'REAL',
   telemetry_selected_at_ms:'INTEGER',telemetry_analysis_completed_at_ms:'INTEGER',
   telemetry_feed_received_at_ms:'INTEGER',telemetry_analysis_compute_ms:'REAL',
   telemetry_analyzer5_ms:'REAL',telemetry_analyzer10_ms:'REAL',
   telemetry_study5_ms:'REAL',telemetry_select_to_intent_ms:'INTEGER',
   telemetry_analysis_to_selection_ms:'INTEGER',telemetry_intent_received_at_ms:'INTEGER',
   telemetry_account_lookup_ms:'REAL',telemetry_otp_lookup_ms:'REAL',
   telemetry_ws_connect_ms:'REAL',telemetry_proposal_sent_at_ms:'INTEGER',
   telemetry_proposal_received_at_ms:'INTEGER',
   telemetry_prebuy_validation_ms:'REAL',telemetry_buy_attempt_at_ms:'INTEGER',
   telemetry_buy_ack_at_ms:'INTEGER',telemetry_buy_attempt_rtt_ms:'REAL',
   telemetry_buy_feed_received_at_ms:'INTEGER',telemetry_buy_feed_age_ms:'REAL',
   candle_context_json:'TEXT',candle_context_captured_ms:'INTEGER',candle_pattern_version:'TEXT'})){
  if(!columns.has(name))db.exec('ALTER TABLE demo_local_orders ADD COLUMN '+name+' '+sqlType);
 }
 const STRATEGY_VERSION='EMA20_EMA50_RSI14_ATR14_OHLC10_V1';
 // Any interrupted BUY may have reached the broker. Do NOT send another until reconciled.
 db.prepare("UPDATE demo_local_orders SET state='UNKNOWN',updated_at=? WHERE state IN ('PREPARING','SENDING')").run(epoch());
 // Las intenciones de tanda no enviadas de una ejecución interrumpida se cancelan;
 // UNKNOWN / OPEN permanecen para conciliación y nunca se reenvía BUY.
 db.prepare("UPDATE demo_local_orders SET state='CANCELLED',updated_at=?,error_code='BATCH_INTERRUPTED' WHERE state='PENDING_APPROVAL' AND batch_id IS NOT NULL").run(epoch());
 const one=db.prepare('SELECT * FROM demo_local_orders WHERE id=?');
 const summary=db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(stake_cents),0) AS gross FROM demo_local_orders WHERE state IN ('SENDING','UNKNOWN','OPEN','SETTLED')");
 const active=db.prepare("SELECT COUNT(*) AS n FROM demo_local_orders WHERE state IN ('PENDING_APPROVAL','PREPARING','SENDING','UNKNOWN','OPEN')");
 const unresolved=db.prepare("SELECT COUNT(*) AS n FROM demo_local_orders WHERE state IN ('PREPARING','SENDING','UNKNOWN','OPEN')");
 const unknown=db.prepare("SELECT COUNT(*) AS n FROM demo_local_orders WHERE state='UNKNOWN'");
 const exposure=db.prepare("SELECT COALESCE(SUM(stake_cents),0) AS gross FROM demo_local_orders WHERE state IN ('PENDING_APPROVAL','PREPARING','SENDING','UNKNOWN','OPEN') AND id<>?");
 // Resultados por fecha de LIQUIDACION UTC, no por fecha de apertura.
 // Registros antiguos conservan updated_at como respaldo de fecha.
 const resultEpoch="COALESCE(CAST(settled_at_ms/1000 AS INTEGER),updated_at,created_at)";
 const dayResults=db.prepare("SELECT COUNT(*) AS settled,COALESCE(SUM(CASE WHEN pnl_cents<0 THEN -pnl_cents ELSE 0 END),0) AS grossLoss,COALESCE(SUM(CASE WHEN pnl_cents>0 THEN pnl_cents ELSE 0 END),0) AS grossWin,COALESCE(SUM(pnl_cents),0) AS net FROM demo_local_orders WHERE state='SETTLED' AND "+resultEpoch+">=? AND "+resultEpoch+"<?");
 const listSql=`SELECT id,created_at AS createdAt,created_at_ms AS createdAtMs,bought_at_ms AS boughtAtMs,settled_at_ms AS settledAtMs,batch_id AS batchId,state,source,symbol,direction,stake_cents AS stakeCents,contract_id AS contractId,buy_cents AS buyCents,pnl_cents AS pnlCents,error_code AS errorCode,proposal_latency_ms AS proposalLatencyMs,buy_latency_ms AS buyLatencyMs,signal_age_ms AS signalAgeMs,signal_rsi AS rsi,signal_sma_fast AS smaFast,signal_sma_slow AS smaSlow,
  signal_ema20 AS ema20,signal_ema50 AS ema50,signal_atr14 AS atr14,
  signal_momentum5 AS momentum5,signal_strength AS signalStrength,
  proposal_payout_cents AS proposalPayoutCents,signal_quote AS signalQuote,
  entry_tick AS entryTick,exit_tick AS exitTick,
  entry_tick_epoch AS entryTickEpoch,exit_tick_epoch AS exitTickEpoch,
  candle_open AS candleOpen,candle_high AS candleHigh,candle_low AS candleLow,
  candle_close AS candleClose,candle_epoch AS candleEpoch,
  projected_next_tick AS projectedNextTick,projection_model_mae AS modelMae,
  projection_naive_mae AS naiveMae,app_version AS appVersion,strategy_version AS strategyVersion,
   signal_five_tick_momentum AS fiveTickMomentum,signal_tick_rsi14 AS tickRsi14,
   five_tick_study_hit_rate AS fiveTickStudyHitRate,five_tick_study_n AS fiveTickStudyN,
   signal_snapshot_epoch AS snapshotEpoch,signal_reason AS signalReason,
   duration_ticks AS durationTicks,prediction_mode AS predictionMode,
   prediction_policy AS predictionPolicy,prediction_lower95 AS predictionLower95,
   prediction_quote_edge AS predictionQuoteEdge,
   telemetry_selected_at_ms AS selectedAtMs,
   telemetry_analysis_completed_at_ms AS analysisCompletedAtMs,
   telemetry_feed_received_at_ms AS feedReceivedAtMs,
   telemetry_analysis_compute_ms AS analysisComputeMs,
   telemetry_analyzer5_ms AS analyzer5ComputeMs,
   telemetry_analyzer10_ms AS analyzer10ComputeMs,
   telemetry_study5_ms AS analyzerStudy5ComputeMs,
   telemetry_select_to_intent_ms AS selectToIntentMs,
   telemetry_analysis_to_selection_ms AS analysisToSelectionMs,
   telemetry_intent_received_at_ms AS intentReceivedAtMs,
   telemetry_account_lookup_ms AS accountLookupMs,
   telemetry_otp_lookup_ms AS otpLookupMs,
   telemetry_ws_connect_ms AS wsConnectMs,
   telemetry_proposal_sent_at_ms AS proposalSentAtMs,
   telemetry_proposal_received_at_ms AS proposalReceivedAtMs,
   telemetry_prebuy_validation_ms AS preBuyValidationMs,
   telemetry_buy_attempt_at_ms AS buyAttemptAtMs,
   telemetry_buy_ack_at_ms AS buyAckAtMs,
   telemetry_buy_attempt_rtt_ms AS buyAttemptRttMs,
   telemetry_buy_feed_received_at_ms AS buyFeedReceivedAtMs,
   telemetry_buy_feed_age_ms AS buyFeedAgeMs FROM demo_local_orders ORDER BY created_at DESC,id DESC`;
 const list=db.prepare(listSql+' LIMIT 60');
 const csvList=db.prepare(listSql);
 const insert=db.prepare('INSERT INTO demo_local_orders(id,created_at,updated_at,state,source,symbol,direction,stake_cents,app_version,strategy_version,duration_ticks,prediction_mode,prediction_policy,prediction_lower95) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 const change=db.prepare('UPDATE demo_local_orders SET state=?,updated_at=?,error_code=? WHERE id=?');
 const recordBuy=db.prepare(`UPDATE demo_local_orders SET state='OPEN',updated_at=?,contract_id=?,buy_cents=?,bought_at_ms=?,proposal_latency_ms=?,buy_latency_ms=?,signal_age_ms=?,signal_rsi=?,signal_sma_fast=?,signal_sma_slow=?,signal_ema20=?,signal_ema50=?,signal_atr14=?,signal_momentum5=?,signal_strength=?,proposal_payout_cents=?,signal_quote=?,candle_open=?,candle_high=?,candle_low=?,candle_close=?,candle_epoch=?,projected_next_tick=?,projection_model_mae=?,projection_naive_mae=?,
   signal_five_tick_momentum=?,signal_tick_rsi14=?,five_tick_study_hit_rate=?,
   five_tick_study_n=?,signal_snapshot_epoch=?,signal_reason=? WHERE id=?`);
 const recordPredictionQuote=db.prepare('UPDATE demo_local_orders SET prediction_quote_edge=? WHERE id=?');
 const recordSelectionTelemetry=db.prepare(`UPDATE demo_local_orders SET
  telemetry_selected_at_ms=?,telemetry_analysis_completed_at_ms=?,
  telemetry_feed_received_at_ms=?,telemetry_analysis_compute_ms=?,
  telemetry_analyzer5_ms=?,telemetry_analyzer10_ms=?,
  telemetry_study5_ms=?,telemetry_select_to_intent_ms=?,
  telemetry_analysis_to_selection_ms=?,telemetry_intent_received_at_ms=? WHERE id=?`);
 const recordAccountTiming=db.prepare('UPDATE demo_local_orders SET telemetry_account_lookup_ms=? WHERE id=?');
 const recordConnectionTiming=db.prepare(`UPDATE demo_local_orders SET
  telemetry_otp_lookup_ms=?,telemetry_ws_connect_ms=? WHERE id=?`);
 const recordProposalTiming=db.prepare(`UPDATE demo_local_orders SET
  proposal_latency_ms=?,telemetry_proposal_sent_at_ms=?,
  telemetry_proposal_received_at_ms=? WHERE id=?`);
 const recordBeforeBuyTiming=db.prepare(`UPDATE demo_local_orders SET
  telemetry_prebuy_validation_ms=?,telemetry_buy_attempt_at_ms=?,
  telemetry_buy_feed_received_at_ms=?,telemetry_buy_feed_age_ms=? WHERE id=?`);
 const recordBuyResponseTiming=db.prepare(`UPDATE demo_local_orders SET
  telemetry_buy_ack_at_ms=?,telemetry_buy_attempt_rtt_ms=? WHERE id=?`);
 const recordCandleContext=db.prepare(`UPDATE demo_local_orders
 SET candle_context_json=?,candle_context_captured_ms=?,candle_pattern_version=?
 WHERE id=?`);
 const markBatch=db.prepare("UPDATE demo_local_orders SET batch_id=? WHERE id=?");
 const purchasedAt=db.prepare("UPDATE demo_local_orders SET created_at_ms=? WHERE id=?");
 const recordSettlement=db.prepare("UPDATE demo_local_orders SET state='SETTLED',updated_at=?,pnl_cents=?,settled_at_ms=?,entry_tick=COALESCE(?,entry_tick),exit_tick=COALESCE(?,exit_tick),entry_tick_epoch=COALESCE(?,entry_tick_epoch),exit_tick_epoch=COALESCE(?,exit_tick_epoch) WHERE id=?");

 // Estado de protección de riesgo para la interfaz y la admisión de tandas.
 // La fecha de corte es 00:00 UTC: misma ventana que riskCheck(). No mueve
 // el límite ni altera las órdenes para poder operar después de una pérdida.
 function getRiskStatus(){
  const at=epoch(),dayStart=Math.floor(at/86400)*86400;
  const d=dayResults.get(dayStart,dayStart+86400),account=getAccount();
  const balance=account&&Number.isFinite(account.balance)?cents(account.balance):null;
  const grossLossCents=Number(d.grossLoss)||0;
  const dailyNetCents=Number(d.net)||0;
  const dailyNetLossCents=Math.max(0,-dailyNetCents);
  const dailyLossStopActive=dailyNetCents<=-MAX_DAILY_NET_LOSS_CENTS;
  const pendingExposureCents=Number(exposure.get('').gross)||0;
  const dailyRemainingRiskCents=Math.max(0,MAX_DAILY_NET_LOSS_CENTS+dailyNetCents-pendingExposureCents);
  const accountFloorStopActive=balance!==null&&balance<=STOP_BALANCE_CENTS;
  const unresolvedOrders=unresolved.get().n;
  const pendingOrders=active.get().n;
  const stopReason=dailyLossStopActive?'DEMO_DAILY_NET_LOSS_STOP':
   accountFloorStopActive?'DEMO_LOSS_STOP_100USD':
   unresolvedOrders>0?'DEMO_UNKNOWN_BUY_REQUIRES_RECONCILIATION':
   pendingOrders>0?'DEMO_ORDER_REQUIRES_RECONCILIATION':null;
  return {
   demoOnly:true,realEnabled:false,nowEpoch:at,dayStartEpoch:dayStart,
   nextDailyResetEpoch:dayStart+86400,
   dailyGrossLossCents:grossLossCents,dailyGrossWinCents:Number(d.grossWin)||0,
   dailyNetCents,dailyNetLossCents,dailySettled:Number(d.settled)||0,
   dailyLossLimitCents:MAX_DAILY_NET_LOSS_CENTS,dailyLossMethod:'NET_SETTLED_PNL_UTC',
   pendingExposureCents,dailyRemainingRiskCents,
   dailyLossStopActive,accountFloorStopActive,
   balanceCents:balance,minimumBalanceCents:STOP_BALANCE_CENTS,
   pendingOrders,unresolvedOrders,stopReason,
   canStartNewBatch:stopReason===null&&balance!==null
  };
 }
 function getSummary(){
  const stats=summary.get(),rows=list.all().map(row=>({...row,diagnosis:diagnoseTrade(row)})),closed=rows.filter(x=>x.state==='SETTLED');
  const group=new Map();
  for(const row of rows){
   if(!row.batchId)continue;
   if(!group.has(row.batchId))group.set(row.batchId,{id:row.batchId,orders:0,settled:0,wins:0,losses:0,stakeCents:0,netCents:0});
   const b=group.get(row.batchId);if(!['CANCELLED','REJECTED','EXPIRED'].includes(row.state))b.orders++;
   b.stakeCents+=row.stakeCents||0;
   if(row.state==='SETTLED'){b.settled++;b.netCents+=row.pnlCents||0;if(row.pnlCents>0)b.wins++;if(row.pnlCents<0)b.losses++;}
  }
  return {mode:'DEMO_ONLY',realEnabled:false,maxConcurrent:MAX_CONCURRENT,
   settled:closed.length,wins:closed.filter(x=>x.pnlCents>0).length,
   losses:closed.filter(x=>x.pnlCents<0).length,
   netCents:closed.reduce((a,x)=>a+(x.pnlCents||0),0),
   batches:[...group.values()].sort((a,b)=>b.id.localeCompare(a.id)),
   campaignPurchases:stats.n,campaignGrossCents:stats.gross,maxPurchases:null,
   unlimitedOwnerAuthorizedDemo:true,strategyVersion:STRATEGY_VERSION,
   pendingOrOpen:unresolved.get().n,awaitingApproval:active.get().n-unresolved.get().n,
   orders:rows,canUpdate:active.get().n===0,
   warning:'Los contratos UNKNOWN requieren conciliación; jamás se repite un BUY sin confirmación.'};
 }
 function signalValid(symbol,direction,durationTicks=5,modelMode='LEGACY_60_CANDLES'){
  const s=marketSnapshot(symbol);
  if(!(s&&s.available!==false&&s.ready===true&&s.candleCount>=60&&s.fresh&&
    s.ageReceivedMs!==null&&s.ageReceivedMs<=1500&&Number.isInteger(s.epoch)&&
    Math.abs(Date.now()-s.epoch*1000)<=2000))return false;
  if(modelMode==='PREDICTIVE_5_10')
   return !!s.tickHorizonModels?.some(x=>x.durationTicks===durationTicks&&
    x.direction===direction&&x.readyForProposal);
  return modelMode==='LEGACY_60_CANDLES'&&durationTicks===5&&s.direction===direction;
 }
 function riskCheck(symbol,direction,stakeCents,balanceCents,ownId=null,durationTicks=5,modelMode='LEGACY_60_CANDLES'){
  if(!isVolatilitySymbol(symbol)||!['CALL','PUT'].includes(direction)||!STAKES.has(stakeCents))
    throw Error('DEMO_PARAMETERS_INVALID');
  const a=getAccount();
  if(!a||a.currency!=='USD'||typeof a.accountId!=='string')throw Error('DEMO_ACCOUNT_NOT_VERIFIED');
  // Reservar el peor caso para todas las compras pendientes / abiertas.
  if(balanceCents<STOP_BALANCE_CENTS||
     balanceCents-exposure.get(ownId||'').gross-stakeCents<STOP_BALANCE_CENTS)
    throw Error('DEMO_LOSS_STOP_100USD');
  const risk=getRiskStatus();
  if(risk.dailyLossStopActive)throw Error('DEMO_DAILY_NET_LOSS_STOP');
  // Reserva el peor escenario de los contratos todavía pendientes.
  // ownId excluye el contrato actual cuando está siendo confirmado.
  if(risk.dailyNetCents-exposure.get(ownId||'').gross-stakeCents<
     -MAX_DAILY_NET_LOSS_CENTS)throw Error('DEMO_DAILY_NET_LOSS_EXPOSURE');
  // Sin tope histórico; conservar protecciones de saldo, pérdidas y señal.
  if(!signalValid(symbol,direction,durationTicks,modelMode))throw Error('DEMO_SIGNAL_STALE_OR_CONTRARY');
 }
 function requestIntent({symbol,direction,stakeCents,source='LOCAL_OWNER',durationTicks=5,modelMode='LEGACY_60_CANDLES',selectionTelemetry=null}){
  if(!['LOCAL_OWNER','MCP_OWNER_REVIEW'].includes(source))throw Error('DEMO_SOURCE_INVALID');
  if(modelMode==='PREDICTIVE_5_10'){
   if(![5,10].includes(durationTicks)||source!=='LOCAL_OWNER')
    throw Error('DEMO_PREDICTIVE_DURATION_INVALID');
  }else if(modelMode!=='LEGACY_60_CANDLES'||durationTicks!==5)
   throw Error('DEMO_LEGACY_DURATION_INVALID');
  const a=getAccount();
  if(!a||!Number.isFinite(a.balance)||epoch()-a.checkedAt>20)
    throw Error('DEMO_BALANCE_MUST_BE_REFRESHED');
  if(unknown.get().n>0)throw Error('DEMO_UNKNOWN_BUY_REQUIRES_RECONCILIATION');
  if(active.get().n>=MAX_CONCURRENT)throw Error('DEMO_CONCURRENCY_LIMIT');
  riskCheck(symbol,direction,stakeCents,cents(a.balance),null,durationTicks,modelMode);
  const prediction=modelMode==='PREDICTIVE_5_10'?
   marketSnapshot(symbol)?.tickHorizonModels?.find(x=>x.durationTicks===durationTicks&&
    x.direction===direction&&x.readyForProposal):null;
  if(modelMode==='PREDICTIVE_5_10'&&!prediction)throw Error('DEMO_PREDICTIVE_EVIDENCE_MISSING');
  const id=randomUUID();
  insert.run(id,epoch(),epoch(),'PENDING_APPROVAL',source,symbol,direction,stakeCents,
   getVersion(),prediction?'TICK_HORIZON_5_10_WALK_FORWARD_V1':STRATEGY_VERSION,
   durationTicks,modelMode,prediction?.selectedPolicy||null,
   prediction?.conservativeWinRateLower95??null);
  const receivedAtMs=Date.now();
  purchasedAt.run(receivedAtMs,id);
  // La entrega entre analizador y ejecutor es LOCAL (no red).
  const selection=modelMode==='PREDICTIVE_5_10'&&source==='LOCAL_OWNER'?
   selectionTelemetry:null;
  const metric=x=>Number.isFinite(x)&&x>=0?x:null;
  const elapsed=(end,start)=>Number.isFinite(end)&&Number.isFinite(start)&&
   end>=start?end-start:null;
  const snapshot=selection?null:marketSnapshot(symbol);
  const selectedAt=metric(selection?.selectedAtMs);
  const completedAt=metric(selection?.analysisCompletedAtMs)??metric(snapshot?.analysisGeneratedAtMs);
  const feedAt=metric(selection?.feedReceivedAtMs)??metric(snapshot?.feedReceivedAtMs);
  recordSelectionTelemetry.run(selectedAt,completedAt,feedAt,
   metric(selection?.analysisComputeMs)??metric(snapshot?.analysisTelemetry?.computeTotalMs),
   metric(selection?.analyzer5Ms)??metric(snapshot?.analysisTelemetry?.analyzer5Ms),
   metric(selection?.analyzer10Ms)??metric(snapshot?.analysisTelemetry?.analyzer10Ms),
   metric(selection?.analyzerStudy5Ms)??metric(snapshot?.analysisTelemetry?.fiveTickStudyMs),
   elapsed(receivedAtMs,selectedAt),elapsed(selectedAt,completedAt),receivedAtMs,id);
  audit('DEMO_REVIEW_REQUEST','Solicitud pendiente. No se envió ningún BUY.');
  return {id,state:'PENDING_APPROVAL',accountType:'demo',symbol,direction,stakeCents,
   durationTicks,modelMode,expiresAt:epoch()+45,
   brokerOrders:0,requiresOwnerConfirmation:true};
 }
 function cancel(id){
  const row=one.get(id);
  if(!row||row.state!=='PENDING_APPROVAL')throw Error('DEMO_INTENT_NOT_PENDING');
  change.run('CANCELLED',epoch(),null,id);
  return {state:'CANCELLED',brokerOrders:0};
 }
 function socketConnect(url){
  return new Promise((resolve,reject)=>{
   const socket=new WebSocket(url);let done=false;
   const t=setTimeout(()=>finish(Error('DEMO_SOCKET_TIMEOUT')),8000);
   function finish(error){if(done)return;done=true;clearTimeout(t);
    socket.removeEventListener('open',opened);socket.removeEventListener('error',failed);
    if(error){try{socket.close();}catch{}reject(error);}else resolve(socket);}
   const opened=()=>finish(null),failed=()=>finish(Error('DEMO_SOCKET_ERROR'));
   socket.addEventListener('open',opened);socket.addEventListener('error',failed);
  });
 }
 function sendAndWait(socket,request,expected,timeoutMs=8000){
  return new Promise((resolve,reject)=>{
   let ended=false;
   const t=setTimeout(()=>finish(Error('DEMO_RESPONSE_TIMEOUT')),timeoutMs);
   function finish(err,data){if(ended)return;ended=true;clearTimeout(t);
    socket.removeEventListener('message',onMessage);socket.removeEventListener('close',onClose);
    socket.removeEventListener('error',onError);
    if(err)reject(err);else resolve(data);}
   function onMessage(event){
    try{if(typeof event.data!=='string'||event.data.length>65536)throw Error('DEMO_REPLY_INVALID');
     const msg=JSON.parse(event.data);
     if(msg.req_id!==request.req_id)return;
     if(msg.error||msg.errors)throw Error('DEMO_BROKER_REJECTED');
     if(msg.msg_type===expected)finish(null,msg);
    }catch(error){finish(error);}
   }
   const onClose=()=>finish(Error('DEMO_SOCKET_CLOSED')),onError=()=>finish(Error('DEMO_SOCKET_ERROR'));
   socket.addEventListener('message',onMessage);socket.addEventListener('close',onClose);socket.addEventListener('error',onError);
   try{socket.send(JSON.stringify(request));}catch(e){finish(Error('DEMO_SEND_FAILED'));}
  });
 }
 async function readSettlement(socket,contractId){
  return new Promise((resolve,reject)=>{
   let done=false;const timer=setTimeout(()=>finish(null,{settled:false}),45000);
   function finish(err,val){if(done)return;done=true;clearTimeout(timer);
    socket.removeEventListener('message',onMsg);socket.removeEventListener('close',onClose);
    socket.removeEventListener('error',onError);if(err)reject(err);else resolve(val);}
   function onMsg(e){try{if(typeof e.data!=='string')return;const m=JSON.parse(e.data);
    if(m.error||m.errors){if(m.req_id===806)throw Error('DEMO_SETTLEMENT_REJECTED');return;}
    const c=m.proposal_open_contract;if(m.msg_type!=='proposal_open_contract'||!c)return;
    if(String(c.contract_id)!==String(contractId))return;
    if(c.is_sold===1||c.is_sold===true){
     const profit=Number(c.profit);
     if(!Number.isFinite(profit))throw Error('DEMO_SETTLEMENT_MONEY_INVALID');
     finish(null,{settled:true,pnlCents:cents(profit),fields:settlementFields(c)});
    }
   }catch(err){finish(err);}}
   const onClose=()=>finish(null,{settled:false}),onError=()=>finish(null,{settled:false});
   socket.addEventListener('message',onMsg);socket.addEventListener('close',onClose);socket.addEventListener('error',onError);
   try{socket.send(JSON.stringify({proposal_open_contract:1,contract_id:Number(contractId),subscribe:1,req_id:806}));}
   catch{finish(null,{settled:false});}
  });
 }
 async function approve(id,confirmation){
  if(confirmation!=='CONFIRMAR COMPRA DEMO')throw Error('DEMO_CONFIRMATION_REQUIRED');
  const row=one.get(id);
  if(!row||row.state!=='PENDING_APPROVAL')throw Error('DEMO_INTENT_NOT_PENDING');
  if(epoch()-row.created_at>45){change.run('EXPIRED',epoch(),null,id);throw Error('DEMO_INTENT_EXPIRED');}
  const a=getAccount(),creds=await getCredentials();
  if(!a||a.accountId!==creds.accountId||a.currency!=='USD')throw Error('DEMO_ACCOUNT_MISMATCH');
  if(unknown.get().n>0)throw Error('DEMO_UNKNOWN_BUY_REQUIRES_RECONCILIATION');
  if(active.get().n>MAX_CONCURRENT)throw Error('DEMO_CONCURRENCY_LIMIT');
  // Must verify the official DEMO USD balance again immediately before purchase.
  const accountLookupStart=performance.now();
  const fresh=await accountLookup(creds,a.accountId);
  recordAccountTiming.run(Number((performance.now()-accountLookupStart).toFixed(3)),id);
  if(fresh.accountId!==a.accountId)throw Error('DEMO_ACCOUNT_MISMATCH');
  try{
   riskCheck(row.symbol,row.direction,row.stake_cents,cents(fresh.balance),id,
    row.duration_ticks||5,row.prediction_mode||'LEGACY_60_CANDLES');
  }catch(e){
   const code=cleanError(e);
   change.run('REJECTED',epoch(),code,id);
   return {id,state:'REJECTED',error:code,brokerOrders:0,accountType:'demo'};
  }
  change.run('PREPARING',epoch(),null,id);
  let socket=null,dispatched=false,acknowledged=false;
  try{
   const otpStart=performance.now();
   const url=await otpLookup(creds);
   const otpLookupMs=Number((performance.now()-otpStart).toFixed(3));
   if(new URL(url).pathname!=='/trading/v1/options/ws/demo')throw Error('DEMO_ONLY_REQUIRED');
   const wsStart=performance.now();
   socket=await socketConnect(url);
   recordConnectionTiming.run(otpLookupMs,Number((performance.now()-wsStart).toFixed(3)),id);
   const request={proposal:1,amount:row.stake_cents/100,basis:'stake',
    contract_type:row.direction,currency:'USD',duration:row.duration_ticks||5,duration_unit:'t',
    underlying_symbol:row.symbol,req_id:804};
   const proposalSentAtMs=Date.now(),t=performance.now();
   const quote=await sendAndWait(socket,request,'proposal');
   const proposalReceivedAtMs=Date.now();
   const proposalLatency=Math.round(performance.now()-t);
   recordProposalTiming.run(proposalLatency,proposalSentAtMs,proposalReceivedAtMs,id);
   const prebuyStart=performance.now();
   const proposal=quote.proposal||{};
   const price=Number(proposal.ask_price);
   if(typeof proposal.id!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(proposal.id)
     ||!Number.isFinite(price)||price<0||cents(price)>row.stake_cents)
     throw Error('DEMO_QUOTE_INVALID');
   if(performance.now()-t>2000||!signalValid(row.symbol,row.direction,
    row.duration_ticks||5,row.prediction_mode||'LEGACY_60_CANDLES'))throw Error('DEMO_QUOTE_STALE');
   if(row.prediction_mode==='PREDICTIVE_5_10'){
    const latest=marketSnapshot(row.symbol);
    const model=latest?.tickHorizonModels?.find(x=>x.durationTicks===row.duration_ticks&&
     x.direction===row.direction&&x.readyForProposal&&
     x.selectedPolicy===row.prediction_policy);
    const decision=conservativeQuoteDecision(model,price,Number(proposal.payout));
    if(!decision.approved)throw Error('DEMO_PREDICTIVE_NO_QUOTED_EDGE');
    recordPredictionQuote.run(decision.expectedNetReturnLower,id);
   }
   // Congelar el contexto de 20 velas cerradas ANTES de que se envíe BUY.
   // Se almacena incluso si posteriormente se pierde el acuse del broker.
   const observed=marketSnapshot(row.symbol);
   const candleContext=captureCandleContext(observed,{count:20,atMs:Date.now()});
   if(row.prediction_mode==='PREDICTIVE_5_10'&&!candleContext)
    throw Error('DEMO_PREDICTIVE_CONTEXT_MISSING');
   if(candleContext)recordCandleContext.run(JSON.stringify(candleContext),
    candleContext.capturedAtMs,'CANDLE_CONTEXT_V1',id);
   const buyAttemptAtMs=Date.now();
   recordBeforeBuyTiming.run(Number((performance.now()-prebuyStart).toFixed(3)),
    buyAttemptAtMs,observed?.feedReceivedAtMs??null,observed?.ageReceivedMs??null,id);
   change.run('SENDING',epoch(),null,id);
   const lastClosed=observed?.candles?.at(-1)||null;
   const buyStart=performance.now();
   // No automatic retries if the buy acknowledgement is lost.
   dispatched=true;
   const buy=await sendAndWait(socket,{buy:proposal.id,price,req_id:805},'buy',8000);
   recordBuyResponseTiming.run(Date.now(),Number((performance.now()-buyStart).toFixed(3)),id);
   if(!Number.isSafeInteger(Number(buy.buy?.contract_id))||Number(buy.buy.contract_id)<=0)
     throw Error('DEMO_BUY_ACK_INVALID');
   acknowledged=true;
   const contractId=String(buy.buy.contract_id),paid=Number(buy.buy.buy_price);
   recordBuy.run(epoch(),contractId,Number.isFinite(paid)?cents(paid):row.stake_cents,Date.now(),
    proposalLatency,Math.round(performance.now()-buyStart),
    observed?.ageReceivedMs??null,observed?.rsi14??null,observed?.sma8??null,observed?.sma21??null,
     observed?.ema20??null,observed?.ema50??null,observed?.atr14??null,
     observed?.momentum5??null,observed?.signalStrength??null,
     Number.isFinite(Number(proposal.payout))?cents(proposal.payout):null,
     observed?.quote??null,
     lastClosed?.open??null,lastClosed?.high??null,lastClosed?.low??null,
     lastClosed?.close??null,lastClosed?.epoch??null,
     observed?.projectedNextTick??null,observed?.modelMae??null,observed?.naiveMae??null,
     observed?.fiveTickMomentum??null,observed?.tickRsi14??null,
     observed?.fiveTickStudy?.hitRate??null,observed?.fiveTickStudy?.holdoutCount??null,
     observed?.epoch??null,observed?.reason??null,id);
   audit('DEMO_BUY_CONFIRMED','Contrato DEMO confirmado por broker');
   const result=await readSettlement(socket,contractId);
   if(result.settled){
    recordSettlement.run(epoch(),result.pnlCents,Date.now(),...(result.fields||[null,null,null,null]),id);audit('DEMO_SETTLED','Resultado DEMO verificado');
   }
   return {state:result.settled?'SETTLED':'OPEN',id,contractId,
    pnlCents:result.settled?result.pnlCents:null,accountType:'demo',brokerOrders:1};
  }catch(error){
   // Ante un BUY ambiguo no se inventa ACK ni una hora de recepcion del broker.
   if(dispatched&&!acknowledged){
    const sent=one.get(id)?.telemetry_buy_attempt_at_ms;
    if(sent!==null&&Number.isFinite(sent))
     recordBuyResponseTiming.run(null,Math.max(0,Date.now()-sent),id);
   }
   // Explicit broker rejection after BUY means no purchase; network/timeout is UNKNOWN.
   const code=cleanError(error);
   const outcome=dispatched&&!acknowledged?(code==='DEMO_BROKER_REJECTED'?'REJECTED':'UNKNOWN')
     :acknowledged?'OPEN': 'REJECTED';
   change.run(outcome,epoch(),code,id);
   audit('DEMO_BUY_'+outcome,code);
   return {id,state:outcome,error:code,accountType:'demo',
    brokerOrders:outcome==='REJECTED'?0:null,
    note:outcome==='UNKNOWN'?'Revisar el broker; no volver a enviar BUY.':null};
  }finally{try{socket?.close();}catch{}}
 }
 async function reconcile(id){
  const row=one.get(id);
  if(!row||row.state!=='OPEN'||!row.contract_id)throw Error('DEMO_RECONCILE_MANUAL_REQUIRED');
  const creds=await getCredentials(),url=await otpLookup(creds);
  const socket=await socketConnect(url);
  try{
   const res=await sendAndWait(socket,{proposal_open_contract:1,contract_id:Number(row.contract_id),req_id:806},'proposal_open_contract');
   const contract=res.proposal_open_contract;
   if(contract?.is_sold===1||contract?.is_sold===true){
    const profit=Number(contract.profit);
    if(!Number.isFinite(profit))throw Error('DEMO_PROFIT_INVALID');
    recordSettlement.run(epoch(),cents(profit),Date.now(),...settlementFields(contract),id);
    return {id,state:'SETTLED',pnlCents:cents(profit)};
   }
   return {id,state:'OPEN',note:'La liquidación no ha sido confirmada.'};
  }finally{socket.close();}
 }
 function exportCsv(scope='all'){
  // Exportar todo SQLite; el límite de 60 se usa SOLO para la interfaz.
  const rows=csvList.all();
  const chosen=scope==='last-burst'?(rows.find(r=>r.batchId)?.batchId||null):null;
  const selected=scope==='last-burst'?rows.filter(r=>r.batchId===chosen):rows;
  const headers=['id','batchId','createdAtMs','boughtAtMs','settledAtMs','state','symbol','direction','stakeCents','buyCents','pnlCents','contractId','proposalLatencyMs','buyLatencyMs','signalAgeMs','rsi','smaFast','smaSlow','ema20','ema50','atr14','momentum5','signalStrength','proposalPayoutCents','signalQuote','entryTick','exitTick','entryTickEpoch','exitTickEpoch','candleOpen','candleHigh','candleLow','candleClose','candleEpoch','projectedNextTick','modelMae','naiveMae','appVersion','strategyVersion','fiveTickMomentum','tickRsi14','fiveTickStudyHitRate','fiveTickStudyN','snapshotEpoch','signalReason',
   'durationTicks','predictionMode','predictionPolicy','predictionLower95','predictionQuoteEdge',
   'selectedAtMs','feedReceivedAtMs','analysisCompletedAtMs','analysisComputeMs',
   'analyzer5ComputeMs','analyzer10ComputeMs','analyzerStudy5ComputeMs',
   'analysisToSelectionMs','selectToIntentMs','intentReceivedAtMs','accountLookupMs',
   'otpLookupMs','wsConnectMs','proposalSentAtMs','proposalReceivedAtMs',
   'preBuyValidationMs','buyAttemptAtMs','buyAckAtMs','buyAttemptRttMs',
   'buyFeedReceivedAtMs','buyFeedAgeMs','intentToQuoteMs','quoteToBuyMs',
   'intentToBuyMs','buyFeedToBuyMs','buyAttemptToSettlementMs','buyAckToSettlementMs',
   'timingSchemaVersion','errorCode','diagnosisCode'];
   const escape=v=>'"'+String(v??'').replace(/"/g,'""').replace(/^[=+@-]/,match=>'_'+match)+'"';
  const delta=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&a>=b?a-b:null;
  const fields=row=>({
   ...row,timingSchemaVersion:1,
   intentToQuoteMs:delta(row.proposalSentAtMs,row.intentReceivedAtMs),
   quoteToBuyMs:delta(row.buyAttemptAtMs,row.proposalReceivedAtMs),
   intentToBuyMs:delta(row.buyAttemptAtMs,row.intentReceivedAtMs),
   buyFeedToBuyMs:delta(row.buyAttemptAtMs,row.buyFeedReceivedAtMs),
   buyAttemptToSettlementMs:row.state==='SETTLED'?
    delta(row.settledAtMs,row.buyAttemptAtMs):null,
   buyAckToSettlementMs:row.state==='SETTLED'?
    delta(row.settledAtMs,row.buyAckAtMs):null
  });
  return '\uFEFF'+headers.join(',')+'\r\n'+selected.map(raw=>{
   const row=fields(raw);
   return headers.map(h=>escape(h==='diagnosisCode'?diagnoseTrade(row).code:row[h])).join(',');
  }).join('\r\n')+'\r\n';
 }
 return {getSummary,requestIntent,cancel,approve,reconcile,markBatch:(id,batchId)=>markBatch.run(batchId,id),exportCsv,
  getStrategyVersion:()=>STRATEGY_VERSION,getRiskStatus,canUpdate:()=>active.get().n===0};
}
