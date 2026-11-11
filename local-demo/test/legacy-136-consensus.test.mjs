import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {legacy136Direction,legacy136AgreesWithModel,modeAllowsHorizon,
 LEGACY136_FIVE,LEGACY136_TEN,isResearchMode} from '../legacy-136-consensus.mjs';
import {inspectSignalAvailability} from '../demo-burst.mjs';
import {createStrategyComparisonShadow} from '../strategy-comparison-shadow.mjs';

const epoch=Math.floor(Date.now()/1000);
const classic={symbol:'1HZ10V',available:true,ready:true,fresh:true,
 candleCount:60,ageReceivedMs:100,epoch,candles:[{epoch}],
 ema20:110,ema50:100,rsi14:60,atr14:4,momentum5:.02,slope10:3,
 direction:'CALL',reason:'TENDENCIA_ALCISTA_MULTIFACTOR'};
const model=(h,dir='CALL')=>({durationTicks:h,direction:dir,
 selectedPolicy:'MOMENTUM_10',trainingDecisions:65,validationDecisions:35,
 observedValidationHitRate:.60,readyForProposal:false});

test('Reglas reproducibles EMA/RSI/momentum v13.6: contrarias o incompletas no compran',()=>{
 assert.equal(legacy136Direction(classic),'CALL');
 const down={...classic,ema20:90,ema50:100,rsi14:43,
  momentum5:-.1,slope10:-1,direction:'PUT',
  reason:'TENDENCIA_BAJISTA_MULTIFACTOR'};
 assert.equal(legacy136Direction(down),'PUT');
 for(const change of [{rsi14:70},{momentum5:0},{slope10:0},
  {atr14:0},{fresh:false},{direction:'PUT'},{ema50:120},
  {reason:'SIN_CONSENSO'},{candleCount:59}]){
  assert.equal(legacy136Direction({...classic,...change}),null,JSON.stringify(change));
 }
 assert.equal(legacy136AgreesWithModel(classic,model(5)),true);
 assert.equal(legacy136AgreesWithModel(classic,model(10)),true);
 assert.equal(legacy136AgreesWithModel(classic,model(5,'PUT')),false);
 assert.equal(legacy136AgreesWithModel(classic,{durationTicks:60,direction:'CALL'}),false);
});

test('Modos nuevos exigen exactamente horizonte elegido y no habilitan REAL',()=>{
 assert.equal(isResearchMode(LEGACY136_FIVE),true);
 assert.equal(isResearchMode(LEGACY136_TEN),true);
 assert.equal(modeAllowsHorizon(LEGACY136_FIVE,5),true);
 assert.equal(modeAllowsHorizon(LEGACY136_FIVE,10),false);
 assert.equal(modeAllowsHorizon(LEGACY136_TEN,5),false);
 assert.equal(modeAllowsHorizon(LEGACY136_TEN,10),true);
 const snap={...classic,tickHorizonModels:[model(5),model(10)]};
 const veto=()=>({blocked:false});
 const five=inspectSignalAvailability(['1HZ10V'],()=>snap,new Map(),veto,
  epoch*1000,true,LEGACY136_FIVE);
 const ten=inspectSignalAvailability(['1HZ10V'],()=>snap,new Map(),veto,
  epoch*1000,true,LEGACY136_TEN);
 assert.equal(five.counts.READY,1);
 assert.equal(ten.counts.READY,1);
 const disagree=inspectSignalAvailability(['1HZ10V'],()=>({...snap,
  tickHorizonModels:[model(5,'PUT'),model(10,'PUT')]}),new Map(),veto,
  epoch*1000,true,LEGACY136_FIVE);
 assert.equal(disagree.counts.LEGACY_136_TICK_CONSENSUS_MISSING,1);
 const badTen=inspectSignalAvailability(['1HZ10V'],()=>({...snap,
  tickHorizonModels:[model(5)]}),new Map(),veto,epoch*1000,true,LEGACY136_TEN);
 assert.equal(badTen.counts.LEGACY_136_TICK_CONSENSUS_MISSING,1);
});

test('A/B v13.6 vs tick actual vs consenso espera cinco y diez ticks futuros sin BUY',()=>{
 const db=new DatabaseSync(':memory:');
 const study=createStrategyComparisonShadow({db,getVersion:()=> '18.5',
  sampleIntervalTicks:100});
 const analyses={...classic,tickHorizonModels:[model(5),model(10)]};
 for(let seq=1;seq<=64;seq++){
  study.onTick({symbol:'1HZ10V',seq,epoch:1800000000+seq,
   price:100+seq*.005,marketAnalysis:analyses});
 }
 assert.equal(study.status().results.some(r=>r.policy==='LEGACY_136_EMA_RSI'),false);
 for(let seq=65;seq<=70;seq++){
  study.onTick({symbol:'1HZ10V',seq,epoch:1800000000+seq,
   price:100+seq*.005,marketAnalysis:analyses});
 }
 const r=study.status();
 for(const p of ['LEGACY_136_EMA_RSI','CURRENT_TICK_MODEL',
  'LEGACY_136_AND_CURRENT_CONSENSUS']){
  const rows=r.results.filter(x=>x.policy===p);
  assert.ok(rows.some(x=>x.horizonTicks===5),p+' 5');
  assert.ok(rows.some(x=>x.horizonTicks===10),p+' 10');
 }
 assert.equal(r.brokerOrders,0);
 assert.equal(r.realEnabled,false);
 assert.equal(r.changesBuy,false);
 assert.ok(r.results.every(x=>x.brokerPnlUsd===null));
 db.close();
});
