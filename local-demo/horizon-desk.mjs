// Auditoria por horizonte de contratos REALES de la cuenta DEMO (solo SQLite local).
// Nunca compra, nunca infiere que una cuenta esta ejecutando por la version GitHub.
const val=n=>typeof n==='number'&&Number.isFinite(n)?n:null;
const fmt=n=>val(n)===null?null:Number(n.toFixed(4));
function getHorizon(r){
 const x=Number(r.duration_ticks);
 return r.duration_ticks===null||r.duration_ticks===undefined?'UNLABELED':
  x===5?'TICK_5':x===10?'TICK_10':'OTHER';
}
function totals(rows,label){
 const settled=rows.filter(r=>r.state==='SETTLED'&&val(r.pnl_cents)!==null);
 const w=settled.filter(r=>r.pnl_cents>0).length;
 const loss=settled.filter(r=>r.pnl_cents<0).length;
 const gross=settled.reduce((a,r)=>a+(val(r.stake_cents)||0),0);
 const net=settled.reduce((a,r)=>a+r.pnl_cents,0);
 const last=rows.filter(r=>val(r.bought_at_ms)!==null).reduce((a,r)=>Math.max(a,r.bought_at_ms),0)||null;
 const lastSettled=settled.reduce((a,r)=>Math.max(a,val(r.settled_at_ms)||0),0)||null;
 const policies={};
 for(const r of settled){
  const key=r.prediction_policy||'SIN_POLITICA';
  const item=policies[key]||(policies[key]={settled:0,wins:0,netCents:0});
  item.settled++;item.wins+=Number(r.pnl_cents>0);item.netCents+=r.pnl_cents;
 }
 return {key:label,settled:settled.length,wins:w,losses:loss,
  winRatePct:settled.length?fmt(100*w/settled.length):null,
  netCents:net,stakedCents:gross,roiPct:gross?fmt(100*net/gross):null,
  rejected:rows.filter(r=>r.state==='REJECTED').length,
  open:rows.filter(r=>r.state==='OPEN').length,
  unknown:rows.filter(r=>r.state==='UNKNOWN').length,
  awaiting:rows.filter(r=>r.state==='PENDING_APPROVAL').length,
  lastBrokerBuyMs:last,lastOfficialSettlementMs:lastSettled,
  policies:Object.entries(policies).map(([name,p])=>({name,...p})).sort((a,b)=>b.settled-a.settled)};
}
export function buildHorizonDeskReport(orders,{
 nowMs=Date.now(),connected=false,programRunning=false,burstRunning=false,latestBurstMode=null
}={}){
 if(!Array.isArray(orders)||orders.length>100000)throw Error('HORIZON_ROWS_INVALID');
 const groups=['TICK_5','TICK_10','UNLABELED','OTHER'].map(key=>
  totals(orders.filter(r=>getHorizon(r)===key),key));
 const last=groups.map(x=>x.lastBrokerBuyMs).filter(x=>x!==null);
 const recent=last.length?Math.max(...last):null;
 return {mode:'HORIZON_SEPARATION_DEMO_ONLY',readOnly:true,
  realEnabled:false,canIssueOrders:false,connectedDemoAccount:connected,
  programRunning:Boolean(programRunning),burstRunning:Boolean(burstRunning),
  latestBurstMode:latestBurstMode||null,
  lastBrokerBuyMs:recent,
  latestBuyAgeMinutes:recent!==null?fmt(Math.max(0,nowMs-recent)/60000):null,
  liveExecutionConfirmed:false,
  currentBuyClaim:'NO_DIRECT_PC_CONNECTION',
  groups,
  risks:['Los modelos 5 y 10 tienen decisiones independientes, pero comparten saldo, exposicion, controles diarios y conciliacion.',
   'Una orden OPEN o UNKNOWN se investiga antes de abrir otras, nunca repetir un BUY automaticamente.',
   'Las operaciones etiquetadas UNLABELED son historicas: no inventarles horizonte.',
   'Los datos proceden de SQLite y pueden estar desactualizados si no se consulta la instalacion activa del PC.'],
  note:'El modo 5 ONLY o 10 ONLY filtra la duracion ANTES de seleccionar una senal. AUTO puede mezclar horizontes; comparar modos en pruebas separadas y sin aumentar riesgo.'};
}
