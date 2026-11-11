// Programa experimental OPCIONES DEMO exclusivamente, opt-in en el PC.
// Maximo una compra por par indice/horizonte, 10 centavos por contrato,
// NUNCA aumenta importe, nunca usa indice sin autorizacion, nunca REAL.
// Quote preflight independiente; el broker vuelve a cotizar al aprobar.
import {randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {isExploratoryCandidate} from './tick-horizon-model.mjs';
import {legacy136Direction} from './legacy-136-consensus.mjs';

export const MICRO_STAKE_CENTS=10;
export const MICRO_MAX_CONTRACTS=20;
export const MICRO_MAX_COMMITTED_CENTS=200;
export const MICRO_STOP_LOSS_CENTS=50;
export const MICRO_STOP_PROFIT_CENTS=25;
export const MICRO_APPROVAL='AUTORIZAR DEMO MULTIINDICE 0.10 MAXIMO 2 USD';

export function microCandidate(snapshot,horizon){
 if(!snapshot?.available||!snapshot.ready||!snapshot.fresh||
  !Number.isFinite(snapshot.ageReceivedMs)||snapshot.ageReceivedMs>1250||
  ![5,10].includes(horizon))return null;
 const direction=legacy136Direction(snapshot);
 if(!direction)return null;
 const prediction=snapshot.tickHorizonModels?.find(x=>
  x.durationTicks===horizon&&x.direction===direction&&
  isExploratoryCandidate(x));
 if(!prediction)return null;
 return {direction,policy:prediction.selectedPolicy,horizon,
  reason:'LEGACY_136_AND_TICK_MODEL_AGREE'};
}
const errorCode=e=>{
 const s=String(e?.message||e||'UNKNOWN');
 return /^[A-Z][A-Z0-9_]{2,70}$/.test(s)?s:'PILOT_REJECTED';
};
export function createMultiIndexMicroPilot({
 db,trading,getSymbols,marketSnapshot,getRiskVerdict,
 quoteReadOnly,refreshAccount,isConnected,isBusy,audit=()=>{},
 getVersion=()=>null,pollMs=3000,timeoutMs=30*60*1000
}={}){
 if(!db?.prepare||!trading?.requestIntent||!trading?.approve||
  !trading?.getRiskStatus||!getSymbols||!marketSnapshot||
  !quoteReadOnly||!refreshAccount||!isConnected||!isBusy||
  !Number.isInteger(pollMs)||pollMs<1||!Number.isInteger(timeoutMs)||timeoutMs<20)
  throw Error('MICRO_PILOT_DEPENDENCIES_INVALID');
 db.exec(`CREATE TABLE IF NOT EXISTS demo_micro_pilot_runs (
  id TEXT PRIMARY KEY,created_ms INTEGER NOT NULL,ended_ms INTEGER,
  state TEXT NOT NULL,stop_reason TEXT,version TEXT
 );
 CREATE TABLE IF NOT EXISTS demo_micro_pilot_pairs (
  run_id TEXT NOT NULL,symbol TEXT NOT NULL,horizon INTEGER NOT NULL,
  state TEXT NOT NULL,reason TEXT,policy TEXT,direction TEXT,
  order_id TEXT,broker_pnl_cents INTEGER,quote_ask REAL,quote_payout REAL,
  updated_ms INTEGER NOT NULL,
  PRIMARY KEY(run_id,symbol,horizon)
 );
 CREATE INDEX IF NOT EXISTS idx_micro_pilot_pairs_run
 ON demo_micro_pilot_pairs(run_id,state);`);
 db.prepare("UPDATE demo_micro_pilot_runs SET state='INTERRUPTED',stop_reason='PC_RESTART_NO_AUTO_RESUME',ended_ms=? WHERE state='RUNNING'")
  .run(Date.now());
 const createRun=db.prepare("INSERT INTO demo_micro_pilot_runs (id,created_ms,state,version) VALUES(?,?,'RUNNING',?)");
 const createPair=db.prepare("INSERT INTO demo_micro_pilot_pairs (run_id,symbol,horizon,state,updated_ms) VALUES(?,?,?,'WAITING_SIGNAL',?)");
 const updatePair=db.prepare(`UPDATE demo_micro_pilot_pairs SET state=?,reason=?,policy=?,
  direction=?,order_id=?,broker_pnl_cents=?,quote_ask=?,quote_payout=?,updated_ms=?
  WHERE run_id=? AND symbol=? AND horizon=?`);
 const updateRun=db.prepare("UPDATE demo_micro_pilot_runs SET state=?,stop_reason=?,ended_ms=? WHERE id=?");
 const getPairs=db.prepare(`SELECT p.symbol,p.horizon,p.state,p.reason,p.policy,
  p.direction,p.updated_ms AS updatedAt,p.order_id AS orderId,p.broker_pnl_cents AS pnlCents,
  o.buy_cents AS buyCents,p.quote_ask AS askPrice,p.quote_payout AS payout
  FROM demo_micro_pilot_pairs p LEFT JOIN demo_local_orders o ON o.id=p.order_id
  WHERE p.run_id=? ORDER BY p.symbol,p.horizon`);
 const terminal=new Set(['SETTLED','REJECTED','SKIPPED_BROKER_MINIMUM','UNKNOWN','OPEN','SKIPPED_RISK']);
 let active=null,finished=null;
 function report(){
  const a=active||finished,rows=a?getPairs.all(a.id):[];
  const settled=rows.filter(x=>x.state==='SETTLED');
  const wins=settled.filter(x=>x.pnlCents>0).length;
  const losses=settled.filter(x=>x.pnlCents<0).length;
  const netCents=settled.reduce((t,x)=>t+x.pnlCents,0);
  const attempted=rows.filter(x=>x.orderId).length;
  const stakedCents=settled.reduce((a,x)=>a+(x.buyCents||0),0);
  const brokerOrders=rows.filter(x=>['SETTLED','OPEN'].includes(x.state)).length;
  const unknownOrders=rows.filter(x=>x.state==='UNKNOWN').length;
  return {mode:'OWNER_AUTHORIZED_MICRO_MULTIINDEX_DEMO_V1',
   running:!!active,state:a?.state||'NOT_STARTED',runId:a?.id??null,
   stopReason:a?.stopReason||null,realEnabled:false,ownerClickRequired:true,
   stakeCents:MICRO_STAKE_CENTS,noStakeFallback:true,
   maximumContracts:MICRO_MAX_CONTRACTS,maximumNominalCents:MICRO_MAX_COMMITTED_CENTS,
   stopLossCents:MICRO_STOP_LOSS_CENTS,stopProfitCents:MICRO_STOP_PROFIT_CENTS,
   candidates:rows.length,attempted,brokerOrders,unknownOrders,settled:settled.length,
   wins,losses,winRatePct:settled.length?Number((100*wins/settled.length).toFixed(2)):null,
   netCents,stakedCents,roiPct:stakedCents?
    Number((100*netCents/stakedCents).toFixed(2)):null,
   positivePnlCents:settled.filter(x=>x.pnlCents>0).reduce((a,b)=>a+b.pnlCents,0),
   negativePnlCents:settled.filter(x=>x.pnlCents<0).reduce((a,b)=>a-b.pnlCents,0),
   rows,
   note:'Solo pares anunciados/autorizados, maximo un BUY por indice/horizonte y maximo USD 0.10. Cotizacion oficial debe aceptar el importe. Si no existe, no se compra. Ni la estrategia ni la parada en verde garantizan beneficio.'};
 }
 function mutate(a,pair,{state,reason=null,policy=null,direction=null,orderId=null,pnlCents=null,askPrice=null,payout=null}){
  updatePair.run(state,reason,policy,direction,orderId,pnlCents,askPrice,payout,Date.now(),
   a.id,pair.symbol,pair.horizon);
 }
 function end(a,state,reason){
  a.state=state;a.stopReason=reason;
  updateRun.run(state,reason,Date.now(),a.id);
  if(active===a)active=null;
  finished=a;
  audit('MICRO_PILOT_'+state,a.id+' '+reason);
 }
 function getRiskStop(a){
  const risk=trading.getRiskStatus();
  if(risk?.dailyLossStopActive)return 'DEMO_DAILY_NET_LOSS_STOP';
  if(risk?.accountFloorStopActive)return 'DEMO_ACCOUNT_FLOOR_STOP';
  if(risk?.pendingOrders||risk?.unresolvedOrders||
     (typeof trading.canUpdate==='function'&&!trading.canUpdate()))
   return 'DEMO_OPEN_OR_UNKNOWN_ORDERS';
  const rows=getPairs.all(a.id),settled=rows.filter(x=>x.state==='SETTLED')
    .sort((a,b)=>a.updatedAt-b.updatedAt);
  const net=settled.reduce((t,x)=>t+x.pnlCents,0);
  const streak=settled.slice(-3);
  if(net<=-MICRO_STOP_LOSS_CENTS)return 'PILOT_NET_STOP_LOSS';
  if(net>=MICRO_STOP_PROFIT_CENTS)return 'PILOT_TAKE_PROFIT';
  if(streak.length===3&&streak.every(x=>x.pnlCents<0))return 'PILOT_THREE_CONSECUTIVE_LOSSES';
  return null;
 }
 async function scan(a){
  while(active===a&&!a.stopRequested){
   if(Date.now()-a.startedMs>timeoutMs){end(a,'COMPLETED','WINDOW_EXPIRED');return;}
   if(isBusy()||!isConnected()){end(a,'PAUSED','DEMO_ACCOUNT_OR_ANOTHER_PROGRAM_NOT_AVAILABLE');return;}
   const riskStop=getRiskStop(a);
   if(riskStop){end(a,'PAUSED',riskStop);return;}
   const rows=getPairs.all(a.id);
   if(rows.every(p=>terminal.has(p.state))){end(a,'COMPLETED','ALL_PAIRS_EVALUATED');return;}
   let attemptedThisCycle=false;
   // Poner primero los pares con precios oficiales listos, sin priorizar
   // promesas de rentabilidad ni índices no autorizados.
   for(const pair of rows){
    if(a.stopRequested||active!==a)break;
    if(terminal.has(pair.state))continue;
    const available=getSymbols();
    if(!available.includes(pair.symbol)){
     mutate(a,pair,{state:'SKIPPED_RISK',reason:'NO_LONGER_AUTHORIZED'});
     continue;
    }
    const market=marketSnapshot(pair.symbol);
    const proposal=microCandidate(market,pair.horizon);
    if(!proposal)continue;
    if(getRiskVerdict?.(pair.symbol,proposal.direction,pair.horizon)?.blocked)continue;
    attemptedThisCycle=true;
    try{
     // Comprobar el minimum contractual; la cotizacion NO se reutiliza para BUY.
     const quote=await quoteReadOnly({symbol:pair.symbol,
      direction:proposal.direction,horizon:pair.horizon,amount:0.10});
     if(!quote||!quote.accepted||!Number.isFinite(quote.askPrice)||
        quote.askPrice<=0||quote.askPrice>0.10||
        !Number.isFinite(quote.payout)||quote.payout<=quote.askPrice){
      mutate(a,pair,{state:'SKIPPED_BROKER_MINIMUM',
       reason:'QUOTE_010_NOT_ACCEPTED',policy:proposal.policy,
       direction:proposal.direction});continue;
     }
     if(a.stopRequested||active!==a)break;
     if(getRiskStop(a))break;
     await refreshAccount();
     // Se rehace la señal y las protecciones en requestIntent y approve.
     const intent=trading.requestIntent({symbol:pair.symbol,
      direction:proposal.direction,stakeCents:10,source:'LOCAL_OWNER_MULTIINDEX_010',
      durationTicks:pair.horizon,modelMode:'DEMO_136_CONSENSUS_5_10'});
     mutate(a,pair,{state:'INTENT',orderId:intent.id,
      policy:proposal.policy,direction:proposal.direction,
      askPrice:quote.askPrice,payout:quote.payout});
     const result=await trading.approve(intent.id,'CONFIRMAR COMPRA DEMO');
     const accepted=['SETTLED','REJECTED','OPEN','UNKNOWN'].includes(result.state);
     mutate(a,pair,{state:accepted?result.state:'UNKNOWN',
      reason:result.error||null,orderId:intent.id,
      policy:proposal.policy,direction:proposal.direction,
      pnlCents:result.state==='SETTLED'?result.pnlCents:null,
      askPrice:quote.askPrice,payout:quote.payout});
     if(!['SETTLED','REJECTED'].includes(result.state)){
      end(a,'PAUSED','BROKER_OPEN_OR_UNKNOWN_RECONCILE_FIRST');return;
     }
     const rs=getRiskStop(a);
     if(rs){end(a,'PAUSED',rs);return;}
    }catch(e){
     // Puede haber un intento PENDING o compra enviada ambigua. No reintentar.
     const latest=getPairs.all(a.id).find(x=>x.symbol===pair.symbol&&x.horizon===pair.horizon);
     if(latest?.state==='INTENT'){
      mutate(a,pair,{state:'UNKNOWN',reason:errorCode(e),orderId:latest.orderId,
       policy:proposal.policy,direction:proposal.direction});
      end(a,'PAUSED','INTENT_MAY_HAVE_REACHED_BROKER');return;
     }
     mutate(a,pair,{state:'REJECTED',reason:errorCode(e),
      policy:proposal.policy,direction:proposal.direction});
     if(['DEMO_DAILY_NET_LOSS_STOP','DEMO_ACCOUNT_FLOOR_STOP',
       'DEMO_OPEN_OR_UNKNOWN_ORDERS'].includes(errorCode(e))){
      end(a,'PAUSED',errorCode(e));return;
     }
    }
    // La API es deliberadamente secuencial, nunca mas de un BUY del piloto.
    break;
   }
   if(active!==a||a.stopRequested)break;
   await pause(attemptedThisCycle?pollMs:Math.max(200,pollMs));
  }
  if(active===a)end(a,'STOPPED','OWNER_STOP_REQUESTED');
 }
 function start({confirmation}={}){
  if(confirmation!==MICRO_APPROVAL)throw Error('MICRO_OWNER_APPROVAL_REQUIRED');
  if(active)throw Error('MICRO_PILOT_ALREADY_RUNNING');
  if(isBusy())throw Error('DEMO_PROGRAM_OR_BURST_ALREADY_RUNNING');
  if(!isConnected())throw Error('DEMO_OPTIONS_ACCOUNT_REQUIRED');
  if(!trading.canUpdate())throw Error('DEMO_OPEN_OR_UNKNOWN_ORDERS');
  const risk=trading.getRiskStatus();
  if(risk.dailyLossStopActive||risk.accountFloorStopActive)
   throw Error('DEMO_RISK_STOP');
  const symbols=[...new Set(getSymbols())].filter(s=>
   /^[A-Z0-9_]{3,30}$/.test(s)).slice(0,10);
  if(!symbols.length)throw Error('NO_AUTHORIZED_INDEXES_AVAILABLE');
  const id=randomUUID(),a={id,startedMs:Date.now(),state:'RUNNING',
   stopRequested:false,stopReason:null};
  createRun.run(id,a.startedMs,getVersion());
  for(const symbol of symbols)for(const h of [5,10])
   createPair.run(id,symbol,h,Date.now());
  active=a;finished=a;
  audit('MICRO_PILOT_OWNER_AUTHORIZED',id+' maxUSD=2 stakeUSD=0.10 DEMO_ONLY');
  void scan(a).catch(e=>{
   if(active===a)end(a,'PAUSED',errorCode(e));
  });
  return report();
 }
 function stop(){
  if(!active)return {stopped:false};
  active.stopRequested=true;
  return {stopped:true,reason:'NO_FURTHER_BUYS_AFTER_CURRENT',realEnabled:false};
 }
 return {start,stop,status:report,isRunning:()=>!!active};
}
