import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as pause} from 'node:timers/promises';
import {createMultiIndexMicroPilot,MICRO_APPROVAL,
 microCandidate} from '../multi-index-micro-pilot.mjs';

const market=(symbol='1HZ10V')=>({
 symbol,available:true,ready:true,fresh:true,ageReceivedMs:30,
 candleCount:60,ema20:120,ema50:100,rsi14:60,atr14:2,momentum5:.03,
 slope10:.3,direction:'CALL',reason:'TENDENCIA_ALCISTA_MULTIFACTOR',
 tickHorizonModels:[5,10].map(durationTicks=>({
  durationTicks,direction:'CALL',selectedPolicy:'MOMENTUM_10',
  trainingDecisions:70,validationDecisions:40,
  observedValidationHitRate:.62,readyForProposal:false
 }))
});
function setup({symbols=['1HZ10V'],quotes=true,pnl=8,unknown=false}={}){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE demo_local_orders(id TEXT PRIMARY KEY,buy_cents INTEGER)`);
 let count=0,preflight=0,risk={dailyLossStopActive:false,
  accountFloorStopActive:false,pendingOrders:0,unresolvedOrders:0};
 const trading={
  requestIntent(args){
   assert.equal(args.source,'LOCAL_OWNER_MULTIINDEX_010');
   assert.equal(args.stakeCents,10);
   assert.equal(args.modelMode,'DEMO_136_CONSENSUS_5_10');
   count++;
   return {id:'sim-'+count};
  },
  async approve(id,confirmation){
   assert.equal(confirmation,'CONFIRMAR COMPRA DEMO');
   db.prepare('INSERT INTO demo_local_orders(id,buy_cents) VALUES(?,10)').run(id);
   return {state:unknown?'UNKNOWN':'SETTLED',id,pnlCents:pnl};
  },
  getRiskStatus:()=>risk,canUpdate:()=>true
 };
 const lab=createMultiIndexMicroPilot({db,trading,
  getSymbols:()=>symbols,marketSnapshot:s=>market(s),
  getRiskVerdict:()=>({blocked:false}),
  quoteReadOnly:async()=>{preflight++;return quotes?
   {accepted:true,askPrice:.10,payout:.18}:{accepted:false,askPrice:null,payout:null};},
  refreshAccount:async()=>({balance:10000}),isConnected:()=>true,
  isBusy:()=>false,getVersion:()=> '18.6',pollMs:1,timeoutMs:5000
 });
 return {db,lab,counters:()=>({count,preflight})};
}
async function finished(lab){
 for(let i=0;i<350;i++){
  if(!lab.isRunning())return lab.status();
  await pause(10);
 }
 throw Error('MICRO_PILOT_TEST_TIMEOUT');
}
test('La señal vieja y nuevo predictor deben coincidir por horizonte',()=>{
 assert.equal(microCandidate(market(),5).direction,'CALL');
 assert.equal(microCandidate(market(),10).direction,'CALL');
 assert.equal(microCandidate({...market(),rsi14:80},5),null);
 assert.equal(microCandidate({...market(),fresh:false},5),null);
 assert.equal(microCandidate({...market(),tickHorizonModels:[{
  durationTicks:5,direction:'PUT',trainingDecisions:50,validationDecisions:40,
  observedValidationHitRate:.65,selectedPolicy:'MOMENTUM_5'
 }]},5),null);
});
test('Deniega clic equivocado y no opera sin permisos de origen',()=>{
 const {db,lab,counters}=setup();
 assert.throws(()=>lab.start({confirmation:'COMPRAR REAL'}),/MICRO_OWNER_APPROVAL_REQUIRED/);
 assert.equal(lab.status().brokerOrders,0);
 assert.equal(counters().count,0);
 db.close();
});
test('Si cotizacion USD 0.10 no se acepta no hay BUY ni incremento de importe',async()=>{
 const {db,lab,counters}=setup({quotes:false});
 lab.start({confirmation:MICRO_APPROVAL});
 const s=await finished(lab);
 assert.equal(s.state,'COMPLETED');
 assert.equal(s.brokerOrders,0);
 assert.equal(s.settled,0);
 assert.equal(s.rows.filter(r=>r.state==='SKIPPED_BROKER_MINIMUM').length,2);
 assert.equal(counters().count,0);
 assert.equal(counters().preflight,2);
 assert.equal(s.maximumNominalCents,200);
 assert.equal(s.noStakeFallback,true);
 db.close();
});
test('Un clic puede ejecutar ambos horizontes 0.10 y registrar USD netos reales',async()=>{
 const {db,lab,counters}=setup();
 const start=lab.start({confirmation:MICRO_APPROVAL});
 assert.equal(start.realEnabled,false);
 assert.throws(()=>lab.start({confirmation:MICRO_APPROVAL}),/ALREADY_RUNNING/);
 const s=await finished(lab);
 assert.equal(s.state,'COMPLETED');
 assert.equal(counters().count,2);
 assert.equal(s.settled,2);
 assert.equal(s.wins,2);
 assert.equal(s.brokerOrders,2);
 assert.equal(s.netCents,16);
 assert.equal(s.stakedCents,20);
 assert.equal(s.roiPct,80);
 assert.ok(s.rows.every(r=>r.policy==='MOMENTUM_10'));
 assert.deepEqual(s.rows.map(r=>r.horizon),[5,10]);
 db.close();
});
test('Tres pérdidas liquidables detienen piloto antes de llenar otros indices',async()=>{
 const {db,lab,counters}=setup({symbols:['R_10','R_25','R_50'],pnl:-10});
 lab.start({confirmation:MICRO_APPROVAL});
 const s=await finished(lab);
 assert.equal(s.state,'PAUSED');
 assert.equal(s.stopReason,'PILOT_THREE_CONSECUTIVE_LOSSES');
 assert.equal(s.brokerOrders,3);
 assert.equal(s.losses,3);
 assert.equal(counters().count,3);
 db.close();
});
test('Orden incierta detiene sin reintentar ni comprar mas',async()=>{
 const {db,lab,counters}=setup({symbols:['R_10','R_25'],unknown:true});
 lab.start({confirmation:MICRO_APPROVAL});
 const s=await finished(lab);
 assert.equal(s.state,'PAUSED');
 assert.equal(s.stopReason,'BROKER_OPEN_OR_UNKNOWN_RECONCILE_FIRST');
 assert.equal(s.brokerOrders,0);
 assert.equal(s.unknownOrders,1);
 assert.equal(counters().count,1);
 db.close();
});
