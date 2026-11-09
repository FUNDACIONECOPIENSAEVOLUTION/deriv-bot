// Tandas DEMO para Windows: máximo 10 contratos, uno a uno, con selección de señal.
// Nunca usa /ws/real; jamás retoma una tanda tras reinicio, ni reenvía un BUY incierto.
import {randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {isVolatilitySymbol} from './synthetic-catalog.mjs';

const SYMBOLS=['R_10','R_25','R_50','R_75','R_100',
 '1HZ10V','1HZ50V','1HZ75V','1HZ100V','1HZ500V','R_500'];
const STAKES=[35,50,75,90,100,200,500,1000];
const MAX_BATCH_COMMITTED_CENTS=10000;
const MAX_PARALLEL=5;
const epoch=()=>Math.floor(Date.now()/1000);
/** Never place duplicate contracts on one index AND one closed candle. */
export function selectDistinctCandidates(candidates,limit,usedCandleEpoch=new Map()){
 const picks=[],unique=new Set();
 for(const item of candidates){
  if(!item||typeof item.symbol!=='string'||unique.has(item.symbol))continue;
  const candleEpoch=item.candles?.at(-1)?.epoch??item.epoch;
  if(!Number.isInteger(candleEpoch)||candleEpoch<=0)continue;
  if((usedCandleEpoch.get(item.symbol)??-1)>=candleEpoch)continue;
  unique.add(item.symbol);
  picks.push({...item,selectedCandleEpoch:candleEpoch});
  if(picks.length>=limit)break;
 }
 return picks;
}

/** Explain why no DEMO BUY is eligible, without contacting the broker.
 * For an empty/paused burst the returned counters are evidence, not guesses.
 */
export function inspectSignalAvailability(symbols,marketSnapshot,usedCandleEpoch=new Map(),
 getAdaptiveVerdict=()=>({blocked:false}),nowMs=Date.now()){
 const counts={};
 const details=[];
 const count=reason=>{counts[reason]=(counts[reason]||0)+1;return reason;};
 for(const symbol of symbols){
  let reason='READY';
  const m=marketSnapshot(symbol);
  if(!m)reason='NO_MARKET_DATA';
  else if(m.available===false)reason='MARKET_UNAVAILABLE';
  else if(m.ready!==true||m.candleCount<60)reason='OHLC_INCOMPLETE';
  else if(!m.fresh||!Number.isFinite(m.ageReceivedMs)||m.ageReceivedMs>1500||
   !Number.isInteger(m.epoch)||Math.abs(nowMs-m.epoch*1000)>2500)
    reason='TICK_OR_PRICE_STALE';
  else if(!['CALL','PUT'].includes(m.direction))reason='NO_CONFIRMED_DIRECTION';
  else if(getAdaptiveVerdict(m.symbol,m.direction).blocked)reason='ADAPTIVE_RISK_VETO';
  else{
   const candleEpoch=m.candles?.at(-1)?.epoch??m.epoch;
   if(!Number.isInteger(candleEpoch)||candleEpoch<=0)reason='INVALID_CANDLE_EPOCH';
   else if((usedCandleEpoch.get(symbol)??-1)>=candleEpoch)reason='CANDLE_ALREADY_USED';
  }
  details.push({symbol,reason:count(reason)});
 }
 return {checkedSymbols:symbols.length,counts,details};
}

export function createDemoBurst({db,trading,marketSnapshot,refreshAccount,getAccount,audit,
 getSymbols=()=>SYMBOLS,getAdaptiveVerdict=()=>({blocked:false}),
 getVersion=()=>null,getStrategyVersion=()=>null,onSignalSelection=()=>null}){
 db.exec("CREATE TABLE IF NOT EXISTS demo_bursts(id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,state TEXT NOT NULL,count_requested INTEGER NOT NULL,stake_cents INTEGER NOT NULL,symbol TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0,stop_reason TEXT)");
 db.prepare("UPDATE demo_bursts SET state='INTERRUPTED',updated_at=?,stop_reason='PROCESS_RESTART' WHERE state IN ('RUNNING','STOP_REQUESTED')").run(epoch());
 const fields=new Set(db.prepare('PRAGMA table_info(demo_bursts)').all().map(x=>x.name));
 if(!fields.has('concurrent'))db.exec('ALTER TABLE demo_bursts ADD COLUMN concurrent INTEGER NOT NULL DEFAULT 1');
 if(!fields.has('app_version'))db.exec('ALTER TABLE demo_bursts ADD COLUMN app_version TEXT');
 if(!fields.has('strategy_version'))db.exec('ALTER TABLE demo_bursts ADD COLUMN strategy_version TEXT');
 if(!fields.has('inspection_json'))db.exec('ALTER TABLE demo_bursts ADD COLUMN inspection_json TEXT');
 if(!fields.has('program_id'))db.exec('ALTER TABLE demo_bursts ADD COLUMN program_id TEXT');
 const insert=db.prepare('INSERT INTO demo_bursts(id,created_at,updated_at,state,count_requested,stake_cents,symbol,concurrent,app_version,strategy_version,program_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
 const update=db.prepare('UPDATE demo_bursts SET state=?,updated_at=?,completed=?,stop_reason=? WHERE id=?');
 const saveInspection=db.prepare('UPDATE demo_bursts SET inspection_json=? WHERE id=?');
 // Totales durables desde TODAS las órdenes SQLite de cada tanda (sin límite de 60 filas UI).
 const latest=db.prepare(`SELECT b.id,b.created_at AS createdAt,b.state,
 b.count_requested AS requested,b.stake_cents AS stakeCents,b.symbol,b.concurrent,
 b.app_version AS appVersion,b.strategy_version AS strategyVersion,b.program_id AS programId,
 b.completed,b.stop_reason AS stopReason,b.inspection_json AS inspectionJson,
 COUNT(CASE WHEN o.state IN ('OPEN','SETTLED') THEN 1 END) AS executed,
 COUNT(CASE WHEN o.state='SETTLED' THEN 1 END) AS settled,
 COUNT(CASE WHEN o.state='REJECTED' THEN 1 END) AS rejected,
 COUNT(CASE WHEN o.state='UNKNOWN' THEN 1 END) AS unknown,
 COUNT(CASE WHEN o.state='SETTLED' AND o.pnl_cents>0 THEN 1 END) AS wins,
 COUNT(CASE WHEN o.state='SETTLED' AND o.pnl_cents<0 THEN 1 END) AS losses,
 COALESCE(SUM(CASE WHEN o.state='SETTLED' AND o.pnl_cents>0 THEN o.pnl_cents ELSE 0 END),0) AS grossWinCents,
 COALESCE(SUM(CASE WHEN o.state='SETTLED' AND o.pnl_cents<0 THEN -o.pnl_cents ELSE 0 END),0) AS grossLossCents,
 COALESCE(SUM(CASE WHEN o.state='SETTLED' THEN o.pnl_cents ELSE 0 END),0) AS netCents
 FROM demo_bursts AS b LEFT JOIN demo_local_orders AS o ON o.batch_id=b.id
 GROUP BY b.id ORDER BY b.created_at DESC,b.id DESC LIMIT 12`);
 const allBatches=db.prepare(`SELECT b.id,b.created_at AS createdAt,b.updated_at AS updatedAt,
 b.state,b.count_requested AS requested,b.stake_cents AS stakeCents,b.symbol,
 b.concurrent,b.app_version AS appVersion,b.strategy_version AS strategyVersion,b.program_id AS programId,
 b.stop_reason AS stopReason,b.inspection_json AS inspectionJson,
 COUNT(CASE WHEN o.state IN ('OPEN','SETTLED') THEN 1 END) AS executed,
 COUNT(CASE WHEN o.state='SETTLED' THEN 1 END) AS settled,
 COUNT(CASE WHEN o.state='REJECTED' THEN 1 END) AS rejected,
 COUNT(CASE WHEN o.state='SETTLED' AND o.pnl_cents>0 THEN 1 END) AS wins,
 COUNT(CASE WHEN o.state='SETTLED' AND o.pnl_cents<0 THEN 1 END) AS losses,
 COALESCE(SUM(CASE WHEN o.state='SETTLED' THEN o.pnl_cents ELSE 0 END),0) AS netCents
 FROM demo_bursts b LEFT JOIN demo_local_orders o ON o.batch_id=b.id
 GROUP BY b.id ORDER BY b.created_at DESC,b.id DESC`);
 const withInspection=row=>{
  let inspection=null;
  try{inspection=row.inspectionJson?JSON.parse(row.inspectionJson):null;}catch{}
  const {inspectionJson,...publicRow}=row;
  return {...publicRow,inspection};
 };
 let active=null;
 function status(){return {running:!!active,stopRequested:!!active?.stopRequested,
  inFlight:active?.inFlight||0,liveId:active?.id||null,batches:latest.all().map(withInspection),
  maxConcurrent:MAX_PARALLEL,risk:trading.getRiskStatus?.()??null,realEnabled:false,demoOnly:true};}
 function select(symbol,limit,batch){
  const allowed=symbol==='AUTO'?getSymbols():[symbol];
  const eligible=allowed.map(s=>marketSnapshot(s)).filter(x=>
   x&&x.available!==false&&x.ready===true&&x.candleCount>=60&&x.fresh&&
   ['CALL','PUT'].includes(x.direction)&&Number.isFinite(x.ageReceivedMs)&&
   x.ageReceivedMs<=1500&&Number.isInteger(x.epoch)&&
   Math.abs(Date.now()-x.epoch*1000)<=2500&&
   !getAdaptiveVerdict(x.symbol,x.direction).blocked);
  // Señal de mayor intensidad descriptiva, no probabilidad de acierto.
  eligible.sort((a,b)=>(b.signalStrength||0)-(a.signalStrength||0)||
   a.ageReceivedMs-b.ageReceivedMs);
  batch.lastEligible=eligible;
  return selectDistinctCandidates(eligible,limit,batch.usedCandleEpoch);
 }
 async function run(batch){
  let executed=0,settled=0,attempts=0,state='RUNNING',reason=null;
  const maxAttempts=batch.count*3;
  const purchase=async chosen=>{
   let pending=null;
   try{
    if(batch.stopRequested)return {state:'STOPPED',brokerOrders:0};
    pending=trading.requestIntent({symbol:chosen.symbol,direction:chosen.direction,
     stakeCents:batch.stakeCents,source:'LOCAL_OWNER'});
    trading.markBatch(pending.id,batch.id);
    if(batch.stopRequested){
     trading.cancel(pending.id);return {state:'STOPPED',brokerOrders:0};
    }
    return await trading.approve(pending.id,'CONFIRMAR COMPRA DEMO');
   }catch(e){
    if(pending){try{trading.cancel(pending.id);}catch{}}
    return {state:'REJECTED',brokerOrders:0,
     error:String(e?.message||'DEMO_BATCH_ERROR').replace(/[^A-Za-z0-9_]/g,'').slice(0,90)};
   }
  };
  try{
   while(executed<batch.count&&attempts<maxAttempts){
    if(batch.stopRequested){state='STOPPED';reason='OWNER_STOP_REQUESTED';break;}
    let picks=[];
    for(let poll=0;poll<160;poll++){
     if(batch.stopRequested)break;
     picks=select(batch.symbol,Math.min(batch.concurrency,batch.count-executed),batch);
     if(picks.length)break;
     await pause(250);
    }
    if(batch.stopRequested){state='STOPPED';reason='OWNER_STOP_REQUESTED';break;}
    if(!picks.length){
     state='PAUSED';reason='NO_DISTINCT_FRESH_SIGNAL_WITHIN_40_SECONDS';
     const allowed=batch.symbol==='AUTO'?getSymbols():[batch.symbol];
     saveInspection.run(JSON.stringify(inspectSignalAvailability(allowed,marketSnapshot,
      batch.usedCandleEpoch,getAdaptiveVerdict)),batch.id);
     break;
    }
    await refreshAccount();
    if(!getAccount()){state='HALTED';reason='DEMO_ACCOUNT_UNAVAILABLE';break;}
    // Medición en sombra de alternativas conocidas ANTES del BUY;
    // no cambia la selección ni permite al modelo ejecutar órdenes.
    try{onSignalSelection({batchId:batch.id,eligible:batch.lastEligible||[],selected:picks});}
    catch(error){audit('DEMO_SHADOW_TELEMETRY_ERROR',String(error?.message||'SHADOW_ERROR').slice(0,80));}
    // Reservar esta señal/vela antes de solicitar BUY (también si luego es rechazada).
    for(const pick of picks)batch.usedCandleEpoch.set(pick.symbol,pick.selectedCandleEpoch);
    batch.inFlight=picks.length;
    // Órdenes paralelas independientes; cada aprobación coteja saldo y señal nuevamente.
    // Se esperan todas las liquidaciones de la ola antes de abrir una nueva.
    const outcomes=await Promise.all(picks.map(purchase));
    batch.inFlight=0;attempts+=outcomes.length;
    let safeRejects=0;
    for(const o of outcomes){
     if(o.state==='SETTLED'){executed++;settled++;continue;}
     if(o.state==='OPEN'){executed++;state='PAUSED';reason='CONTRACT_OPEN_AWAITING_RECONCILIATION';continue;}
     if(o.state==='UNKNOWN'){state='HALTED';reason='BUY_ACK_UNKNOWN_RECONCILE_WITH_BROKER';continue;}
     if(o.state==='STOPPED')continue;
     if(o.state==='REJECTED'&&o.brokerOrders===0){
      safeRejects++;reason=o.error||'SAFE_REJECTED_BEFORE_BUY';continue;
     }
     state='HALTED';reason=o.error||'DEMO_BROKER_REJECTION';
    }
    update.run('RUNNING',epoch(),settled,null,batch.id);
    audit('DEMO_BURST_PROGRESS',batch.id+' executed='+executed+
     ' settled='+settled+' safeRejects='+safeRejects);
    if(state!=='RUNNING')break;
    if(executed<batch.count)await pause(350);
   }
   if(state==='RUNNING')state=executed===batch.count?'COMPLETED':'PAUSED';
   if(state==='COMPLETED')reason=null; // Rechazos previos se reportan en 'rejected'; no son un fallo de tanda completada.
   if(state==='PAUSED'&&!reason)reason='SAFE_MAX_ATTEMPTS_REACHED';
  }catch(e){
   state='HALTED';
   reason=String(e?.message||'DEMO_BATCH_ERROR').replace(/[^A-Za-z0-9_]/g,'').slice(0,90);
  }finally{
   batch.inFlight=0;
   update.run(state,epoch(),settled,reason,batch.id);
   audit('DEMO_BURST_'+state,batch.id+' executed='+executed+
    ' settled='+settled+' '+(reason||''));
   if(active?.id===batch.id)active=null;
  }
 }
 function start({count,stakeCents,symbol,confirmation,concurrency=1,programId=null,usedCandleEpoch=null}){
  if(confirmation!=='CONFIRMAR TANDA DEMO')throw Error('DEMO_BURST_APPROVAL_REQUIRED');
  if(!Number.isSafeInteger(count)||count<1||count>10||
   !Number.isSafeInteger(concurrency)||concurrency<1||concurrency>Math.min(count,MAX_PARALLEL)||
   !STAKES.includes(stakeCents)||!(symbol==='AUTO'||(isVolatilitySymbol(symbol)&&getSymbols().includes(symbol))))
   throw Error('DEMO_BURST_PARAMETERS_INVALID');
  if(active)throw Error('DEMO_BURST_ALREADY_RUNNING');
  if(!trading.canUpdate())throw Error('DEMO_ORDER_REQUIRES_RECONCILIATION');
  if(!getAccount())throw Error('DEMO_ACCOUNT_NOT_VERIFIED');
  if(count*stakeCents>MAX_BATCH_COMMITTED_CENTS)throw Error('DEMO_BURST_MAX_100USD');
  // Si el día ya superó el máximo de pérdidas, no guardar una tanda ilusoria
  // ni intentar BUY. El usuario podrá iniciar otra cuando termine el bloqueo.
  const risk=trading.getRiskStatus?.();
  if(risk?.dailyLossStopActive)throw Error('DEMO_DAILY_NET_LOSS_STOP');
  if(risk?.accountFloorStopActive)throw Error('DEMO_LOSS_STOP_100USD');
  if(risk&&risk.dailyRemainingRiskCents<stakeCents)throw Error('DEMO_DAILY_NET_LOSS_EXPOSURE');
  const id=randomUUID(),batch={id,count,stakeCents,symbol,concurrency,inFlight:0,stopRequested:false,usedCandleEpoch:usedCandleEpoch instanceof Map?usedCandleEpoch:new Map()};
  insert.run(id,epoch(),epoch(),'RUNNING',count,stakeCents,symbol,concurrency,getVersion(),getStrategyVersion(),programId);
  active=batch;
  audit('DEMO_BURST_AUTHORIZED','Count '+count+' stake '+stakeCents+' DEMO only');
  void run(batch);
  return {id,state:'RUNNING',requested:count,stakeCents,symbol,accountType:'demo',
   realEnabled:false,concurrent:concurrency,maxGrossCents:count*stakeCents};
 }
 function stop(){
  if(!active)return {stopped:false,reason:'NO_ACTIVE_BURST'};
  active.stopRequested=true;
  const record=latest.all().find(x=>x.id===active.id);
  update.run('STOP_REQUESTED',epoch(),record?.completed||0,'OWNER_STOP_REQUESTED',active.id);
  return {stopped:true,reason:'AFTER_CURRENT_WAVE',id:active.id};
 }
 function exportBatchesCsv(){
  const headers=['id','createdAt','updatedAt','appVersion','strategyVersion',
   'state','requested','executed','settled','rejected','wins','losses','netCents','programId',
   'stopReason','inspection'];
  const safe=v=>'"'+String(v??'').replace(/"/g,'""').replace(/^[=+@-]/,match=>'_'+match)+'"';
  return '\uFEFF'+headers.join(',')+'\r\n'+allBatches.all().map(raw=>{
   const row=withInspection(raw);
   return headers.map(key=>safe(key==='inspection'?JSON.stringify(row.inspection??{}):row[key])).join(',');
  }).join('\r\n')+'\r\n';
 }
 return {start,stop,status,exportBatchesCsv,canUpdate:()=>!active};
}
