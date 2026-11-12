import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as pause} from 'node:timers/promises';
import {analyzeDemoVersions,researchLossBreak} from '../version-execution-audit.mjs';
import {createDemoBurst} from '../demo-burst.mjs';

const order=(version,id,state,pnl,{horizon=5,stake=100,code=null}={})=>({
 id,app_version:version,state,pnl_cents:pnl,stake_cents:stake,
 buy_cents:state==='SETTLED'?stake:null,bought_at_ms:1700000000000+Number(id.replace(/\D/g,''))*10000,
 created_at:1700000000,delivery:null,duration_ticks:horizon,
 prediction_mode:'DEMO_EXPLORATORY_5_10',error_code:code
});
test('Ranking usa PnL y tasa solamente de contratos liquidados; rechazos y UNKNOWN no se cuentan como derrotas',()=>{
 const rows=[];
 for(let i=0;i<60;i++)rows.push(order('13.6','a'+i,'SETTLED',i<38?35:-50,{stake:50}));
 for(let i=0;i<165;i++)rows.push(order('15.9','b'+i,'SETTLED',i<91?88:-100));
 for(let i=0;i<55;i++)rows.push(order('18.8','c'+i,'SETTLED',i<20?88:-100,{horizon:i%2?5:10}));
 rows.push(order('18.8','x7','REJECTED',null,{code:'DEMO_QUOTE_STALE'}));
 rows.push(order('18.8','x8','UNKNOWN',null,{code:'BROKER_ACK_LOST'}));
 rows.push(order('18.8','x9','OPEN',null));
 const r=analyzeDemoVersions(rows);
 assert.equal(r.readOnly,true);
 assert.equal(r.realEnabled,false);
 assert.equal(r.brokerOrdersSent,0);
 assert.equal(r.versions.length,3);
 assert.equal(r.bestObservedWinRate.version,'13.6');
 assert.equal(r.bestObservedNet.version,'15.9');
 const v=r.versions.find(x=>x.version==='18.8');
 assert.equal(v.attempts,58);
 assert.equal(v.settled,55);
 assert.equal(v.wins,20);
 assert.equal(v.losses,35);
 assert.equal(v.winRatePct,36.36);
 assert.equal(v.rejected,1);
 assert.equal(v.unknownNow,1);
 assert.equal(v.openNow,1);
 assert.equal(v.netUsd,-17.4);
 assert.equal(v.mostFrequentErrors[0].error,'DEMO_QUOTE_STALE');
 assert.equal(v.firstHalf.n+v.secondHalf.n,55);
});
test('Racha de pérdidas no inventa órdenes y se reinicia con victoria',()=>{
 assert.deepEqual(researchLossBreak([{pnlCents:-50},{pnlCents:-100},{pnlCents:-35}]).stop,true);
 assert.equal(researchLossBreak([{pnlCents:-100},{pnlCents:-100},{pnlCents:88},{pnlCents:-100}]).stop,false);
 assert.equal(researchLossBreak([{pnlCents:-100},{pnlCents:null}]).streak,0);
 assert.equal(researchLossBreak([{pnlCents:50},{pnlCents:-100},{pnlCents:-100}]).streak,2);
 assert.throws(()=>researchLossBreak(null),/LOSS_BREAK_INVALID/);
});
function fixture(kind='unknown'){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE demo_local_orders(id TEXT PRIMARY KEY,batch_id TEXT,state TEXT,pnl_cents INTEGER,stake_cents INTEGER)');
 const stats={buys:0,cancels:0,candleEpoch:Math.floor(Date.now()/1000)-4,events:[]};
 const epochNow=Math.floor(Date.now()/1000);
 const marketSnapshot=()=>({symbol:'R_10',available:true,ready:true,fresh:true,
  candleCount:60,ageReceivedMs:50,epoch:epochNow,
  candles:[{epoch:stats.candleEpoch}],tickHorizonModels:[{
   durationTicks:5,direction:'CALL',selectedPolicy:'MOMENTUM_10',
   trainingDecisions:70,validationDecisions:40,
   observedValidationHitRate:.63,readyForProposal:false
  }]
 });
 const getState=db.prepare('SELECT state,pnl_cents FROM demo_local_orders WHERE id=?');
 const trading={
  getRiskStatus:()=>({dailyLossStopActive:false,accountFloorStopActive:false,
   pendingOrders:0,unresolvedOrders:0,dailyRemainingRiskCents:10000}),
  canUpdate:()=>true,
  requestIntent:()=>({id:'req'+(++stats.buys)}),
  markBatch:(id,batchId)=>db.prepare('INSERT INTO demo_local_orders(id,batch_id,state,stake_cents) VALUES(?,?,?,100)')
   .run(id,batchId,'PENDING_APPROVAL'),
  getOrderState:id=>{
   const row=getState.get(id);
   return {id,state:row.state,pnlCents:row.pnl_cents};
  },
  cancel:id=>{stats.cancels++;db.prepare("UPDATE demo_local_orders SET state='CANCELLED' WHERE id=?").run(id);},
  async approve(id){
   if(kind==='unknown'){
    db.prepare("UPDATE demo_local_orders SET state='UNKNOWN' WHERE id=?").run(id);
    throw Error('SOCKET_TIMED_OUT_AFTER_BUY');
   }
   db.prepare("UPDATE demo_local_orders SET state='SETTLED',pnl_cents=-100 WHERE id=?").run(id);
   stats.candleEpoch++;
   return {id,state:'SETTLED',pnlCents:-100,brokerOrders:1};
  }
 };
 const runner=createDemoBurst({db,trading,marketSnapshot,
  refreshAccount:async()=>({balance:10000}),getAccount:()=>({balance:10000}),
  getSymbols:()=>['R_10'],getAdaptiveVerdict:()=>({blocked:false}),
  audit:(kind,msg)=>stats.events.push([kind,msg]),
  getVersion:()=> '18.9',getStrategyVersion:()=> 'STUDY',
  signalPollMs:1});
 return {db,runner,stats};
}
async function waitEnd(runner){
 for(let i=0;i<150;i++){
  if(!runner.status().running)return runner.status().batches[0];
  await pause(20);
 }
 throw Error('BURST_DID_NOT_END');
}
test('Una excepción tras BUY incierto nunca se convierte en rechazo seguro ni se reintenta',async()=>{
 const {db,runner,stats}=fixture('unknown');
 runner.start({count:10,stakeCents:100,symbol:'AUTO',
  concurrency:1,mode:'RESEARCH_FIVE_ONLY',confirmation:'CONFIRMAR TANDA DEMO'});
 const b=await waitEnd(runner);
 assert.equal(b.state,'HALTED');
 assert.equal(b.unknown,1);
 assert.equal(b.rejected,0);
 assert.equal(b.stopReason,'BUY_ACK_UNKNOWN_RECONCILE_WITH_BROKER');
 assert.equal(stats.buys,1);
 assert.equal(stats.cancels,0);
 assert.ok(stats.events.some(x=>x[0]==='DEMO_BURST_BUY_STATE_UNCERTAIN'));
 db.close();
});
test('Tres pérdidas oficiales consecutivas cortan la tanda, no se completan las diez por obligación',async()=>{
 const {db,runner,stats}=fixture('loss');
 runner.start({count:10,stakeCents:100,symbol:'AUTO',
  concurrency:1,mode:'RESEARCH_FIVE_ONLY',confirmation:'CONFIRMAR TANDA DEMO'});
 const b=await waitEnd(runner);
 assert.equal(b.state,'PAUSED');
 assert.equal(b.stopReason,'RESEARCH_CONSECUTIVE_SETTLED_LOSS_BREAK');
 assert.equal(b.settled,3);
 assert.equal(b.losses,3);
 assert.equal(b.netCents,-300);
 assert.equal(stats.buys,3);
 assert.equal(stats.cancels,0);
 db.close();
});
