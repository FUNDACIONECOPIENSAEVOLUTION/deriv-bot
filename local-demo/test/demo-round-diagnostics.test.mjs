import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeProgramRounds} from '../demo-round-diagnostics.mjs';
const program={id:'p1',state:'PAUSED',stopReason:'DEMO_PERFORMANCE_STOP_NEGATIVE_ROUND',
 continueOnNegativeRound:0,roundsRequested:10,roundsCompleted:2,
 batches:[{batchId:'b1',round:1},{batchId:'b2',round:2}]};
const orders=[];
for(const [batchId,wins,rejected] of [['b1',7,13],['b2',3,7]]){
 for(let i=0;i<10;i++)orders.push({programId:'p1',batchId,
  state:'SETTLED',symbol:i%2?'R_10':'1HZ50V',
  direction:i%2?'CALL':'PUT',durationTicks:i%2?5:10,
  predictionPolicy:i%2?'MOMENTUM_5':'REVERSION_5',
  predictionMode:'DEMO_EXPLORATORY_5_10',stakeCents:100,
  pnlCents:i<wins?88:-100,buyLatencyMs:250+i,
  proposalLatencyMs:180,signalAgeMs:120,intentToBuyMs:1550});
 for(let i=0;i<rejected;i++)orders.push({programId:'p1',batchId,
  state:'REJECTED',symbol:'R_25',direction:'PUT',
  durationTicks:5,errorCode:'DEMO_QUOTE_STALE',pnlCents:null});
}
test('Diagnostico dos rondas 7/3 y 3/7 conserva resultados y no confunde rechazos',()=>{
 const d=analyzeProgramRounds(program,orders);
 assert.equal(d.rounds.length,2);
 assert.equal(d.total.settled,20);
 assert.equal(d.total.wins,10);
 assert.equal(d.total.losses,10);
 assert.equal(d.total.rejected,20);
 assert.equal(d.total.netCents,-120);
 assert.equal(d.rounds[0].netCents,316);
 assert.equal(d.rounds[1].netCents,-436);
 assert.equal(d.rounds[0].rejected,13);
 assert.equal(d.rounds[1].rejected,7);
 assert.equal(d.rounds[0].byDuration.reduce((n,x)=>n+x.settled,0),10);
 assert.equal(d.rounds[1].byPolicy.reduce((n,x)=>n+x.settled,0),10);
 assert.equal(d.rounds[0].medianBuyLatencyMs,254.5);
 assert.equal(d.continueOnNegativeRound,false);
 assert.equal(d.stopReason,'DEMO_PERFORMANCE_STOP_NEGATIVE_ROUND');
});
test('Una compra desconocida no se presenta como derrota ni como victoria',()=>{
 const d=analyzeProgramRounds(program,[...orders,{programId:'p1',batchId:'b1',
  state:'UNKNOWN',pnlCents:null,symbol:'R_50',direction:'CALL'}]);
 assert.equal(d.total.settled,20);
 assert.equal(d.total.losses,10);
 assert.equal(d.rounds[0].rejected,13);
});
test('No atribuye un motivo de perdida por coincidir con indice o politica',()=>{
 const d=analyzeProgramRounds(program,orders);
 assert.equal(d.rounds[0].note,'DESCRIPTIVE_ONLY_NO_CAUSAL_INFERENCE');
 assert.ok(d.disclosure.includes('azar'));
 assert.throws(()=>analyzeProgramRounds(null,orders),/INVALID/);
});
