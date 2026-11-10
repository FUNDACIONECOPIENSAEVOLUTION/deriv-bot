import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildHorizonDeskReport} from '../horizon-desk.mjs';
import {inspectSignalAvailability} from '../demo-burst.mjs';
const settled=(duration_ticks,pnl_cents,extra={})=>({
 duration_ticks,state:'SETTLED',pnl_cents,stake_cents:100,
 bought_at_ms:1794260000000,settled_at_ms:1794260010000,
 prediction_policy:'MOMENTUM_10',...extra
});
test('Separar P&L 5/10 y no asignar horizonte a historico antiguo',()=>{
 const rows=[settled(5,88),settled(5,-100),settled(10,-100),
 settled(null,88),{duration_ticks:10,state:'REJECTED',pnl_cents:null},
 {duration_ticks:5,state:'OPEN',pnl_cents:null},
 {duration_ticks:10,state:'UNKNOWN',pnl_cents:null}];
 const r=buildHorizonDeskReport(rows,{connected:true,programRunning:false});
 assert.deepEqual(r.groups.map(x=>x.key),['TICK_5','TICK_10','UNLABELED','OTHER']);
 const a=r.groups[0],b=r.groups[1],un=r.groups[2];
 assert.equal(a.settled,2);assert.equal(a.wins,1);
 assert.equal(a.netCents,-12);assert.equal(a.open,1);
 assert.equal(b.settled,1);assert.equal(b.rejected,1);
 assert.equal(b.unknown,1);assert.equal(b.netCents,-100);
 assert.equal(un.settled,1);assert.equal(un.netCents,88);
 assert.equal(r.liveExecutionConfirmed,false);
 assert.equal(r.canIssueOrders,false);
 assert.equal(r.realEnabled,false);
});
test('Sin un BUY confirmado, no se declara ejecucion aunque haya rechazos',()=>{
 const r=buildHorizonDeskReport([{duration_ticks:10,state:'REJECTED',
   bought_at_ms:null,pnl_cents:null}],{connected:false});
 assert.equal(r.groups[1].settled,0);
 assert.equal(r.groups[1].winRatePct,null);
 assert.equal(r.lastBrokerBuyMs,null);
 assert.equal(r.currentBuyClaim,'NO_DIRECT_PC_CONNECTION');
});
test('La inspeccion de modo 10 ticks no permite solo señales de 5 ticks',()=>{
 const nowMs=1794260000000,epoch=Math.floor(nowMs/1000);
 const candidate=(durationTicks)=>({durationTicks,direction:'CALL',
  selectedPolicy:'MOMENTUM_10',trainingDecisions:45,
  validationDecisions:32,observedValidationHitRate:.57,
  readyForProposal:false});
 const base={symbol:'R_10',available:true,ready:true,candleCount:60,
  fresh:true,ageReceivedMs:50,epoch,
  candles:[{epoch}],tickHorizonModels:[candidate(5)]};
 const onlyFive=inspectSignalAvailability(['R_10'],()=>base,new Map(),
  ()=>({blocked:false}),nowMs,true,'RESEARCH_TEN_ONLY');
 assert.equal(onlyFive.counts.NO_RESEARCH_TICK_EVIDENCE,1);
 const onlyTen=inspectSignalAvailability(['R_10'],()=>({...base,
  tickHorizonModels:[candidate(10)]}),new Map(),
  ()=>({blocked:false}),nowMs,true,'RESEARCH_TEN_ONLY');
 assert.equal(onlyTen.counts.READY,1);
 const rejectTenInFive=inspectSignalAvailability(['R_10'],()=>({...base,
  tickHorizonModels:[candidate(10)]}),new Map(),
  ()=>({blocked:false}),nowMs,true,'RESEARCH_FIVE_ONLY');
 assert.equal(rejectTenInFive.counts.NO_RESEARCH_TICK_EVIDENCE,1);
});
