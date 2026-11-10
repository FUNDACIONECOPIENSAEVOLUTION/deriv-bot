import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildProfitabilityResearch} from '../learning-profitability.mjs';
const mock=(i,pnl,more={})=>({state:'SETTLED',pnl_cents:pnl,stake_cents:100,
 bought_at_ms:100000+i*20000,settled_at_ms:110000+i*20000,
 direction:'CALL',symbol:'1HZ75V',prediction_policy:'MOMENTUM_10',
 duration_ticks:5,app_version:'17.5',signal_reason:'SIN_CONSENSO',...more});
test('No confunde rechazo con perdida; neto real, ROI y punto de equilibrio',()=>{
 const report=buildProfitabilityResearch([mock(0,-100),mock(1,88),
  {state:'REJECTED',pnl_cents:-100,stake_cents:100}]);
 assert.equal(report.total.n,2);
 assert.equal(report.total.netCents,-12);
 assert.equal(report.total.roi,-.06);
 assert.equal(report.total.breakEvenWinRate,.5319);
 assert.equal(report.realEnabled,false);
});
test('Una tasa historica de 80% con pocas observaciones NO autoriza operaciones',()=>{
 const arr=Array.from({length:10},(_,i)=>mock(i,i%5===0?-100:88));
 const r=buildProfitabilityResearch(arr);
 assert.equal(r.segmentation.policy[0].status,'INSUFFICIENT_CHRONOLOGICAL_SAMPLE');
 assert.equal(r.tradingAuthorized,false);
});
test('El holdout sigue el tiempo de compra, no la disposicion en SQL',()=>{
 const arr=Array.from({length:100},(_,i)=>mock(i,i<70?88:-100));
 const report=buildProfitabilityResearch(arr.reverse());
 const cohort=report.segmentation.policy[0];
 assert.equal(cohort.chronological.training.wins,70);
 assert.equal(cohort.chronological.holdout.losses,30);
 assert.equal(cohort.status,'NO_DEMONSTRATED_EDGE');
});
test('No usa contratos abiertos, timestamps invalidos ni PnL ausente',()=>{
 const arr=[mock(0,88),mock(1,-100,{state:'OPEN'}),mock(2,-100,{settled_at_ms:1}),
  mock(3,0,{pnl_cents:null}),mock(4,88,{stake_cents:0})];
 assert.equal(buildProfitabilityResearch(arr).total.n,1);
});
