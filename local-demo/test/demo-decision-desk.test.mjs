import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildProfitabilityResearch} from '../learning-profitability.mjs';
import {buildDemoDecisionDesk} from '../demo-decision-desk.mjs';

const trade=(i,profit,symbol='1HZ10V',h=5,policy='MOMENTUM_10',direction='CALL')=>({
 state:'SETTLED',pnl_cents:profit,stake_cents:100,app_version:'18.6',
 bought_at_ms:100000+i*20000,settled_at_ms:110000+i*20000,
 symbol,duration_ticks:h,prediction_policy:policy,direction
});
const model=(symbol,h=5,policy='MOMENTUM_10',direction='CALL')=>({
 durationTicks:h,direction,policy,trainTickCases:68,
 trainingDecisions:68,validationDecisions:30,validationHitRate:.63,
 strictValidated:false,exploratoryEligible:true,
 riskVeto:false,riskReason:null
});
const sources=(raw,overrides={})=>({
 profitability:buildProfitabilityResearch(raw),
 shadow:{readOnly:true,samplesStored:120,results:[
  {symbol:'1HZ10V',horizonTicks:5,policy:'RSI14_REVERSAL',n:100,correct:59},
  {symbol:'1HZ10V',horizonTicks:10,policy:'RSI14_REVERSAL',n:100,correct:52},
  {symbol:'1HZ10V',horizonTicks:5,policy:'EMA_8_21',n:100,correct:48}
 ]},
 selection:{readOnly:true,subscribedSymbols:['1HZ10V'],
  excludedAdvertisedSymbols:['1HZ90V'],rows:[
   {symbol:'1HZ10V',fresh:true,models:[model('1HZ10V')]}
  ]},
 risk:{dailyLossStopActive:false},
 ...overrides
});
test('Cruza resultados liquidados con índice/horizonte/política/dirección, sin usar rechazos',()=>{
 const rows=[];
 for(let i=0;i<100;i++)rows.push(trade(i,i%4===0?-100:88));
 rows.push({...trade(999,-100),state:'REJECTED'});
 const x=buildDemoDecisionDesk(sources(rows));
 assert.equal(x.readOnly,true);
 assert.equal(x.realEnabled,false);
 assert.equal(x.brokerOrders,0);
 assert.equal(x.autoTradeEnabled,false);
 assert.equal(x.eligibleToBuyNow,0);
 assert.equal(x.sampleSources.officialSettled,100);
 assert.equal(x.candidateRanking.length,1);
 const c=x.candidateRanking[0];
 assert.equal(c.officialContracts,100);
 assert.equal(c.officialHoldoutN,30);
 assert.equal(c.symbol,'1HZ10V');
 assert.equal(c.durationTicks,5);
 assert.equal(c.direction,'CALL');
 assert.equal(c.eligibleForImmediateBuy,false);
 assert.equal(c.brokerQuoteValidated,false);
 assert.equal(c.reason,'STATISTICAL_EDGE_NOT_VALIDATED');
 assert.equal(x.shadowPolicyComparison[0].brokerPnlUsd,null);
 assert.equal(x.shadowPolicyComparison.find(x=>x.policy==='RSI14_REVERSAL'&&x.durationTicks===5).directionalHitRatePct,59);
});
test('Los modelos estrictos siguen requiriendo propuesta broker y confirmación local',()=>{
 const m=model('1HZ10V');m.strictValidated=true;
 const x=buildDemoDecisionDesk(sources(Array.from({length:100},(_,i)=>
  trade(i,i%10===0?-100:88)),{selection:{readOnly:true,
  subscribedSymbols:['1HZ10V'],rows:[{symbol:'1HZ10V',fresh:true,models:[m]}]}}));
 const c=x.candidateRanking[0];
 assert.equal(c.reason,'OFFICIAL_QUOTE_AND_OWNER_REVIEW_REQUIRED');
 assert.equal(c.eligibleForImmediateBuy,false);
 assert.equal(x.eligibleToBuyNow,0);
 assert.equal(x.quoteChecked,false);
});
test('Ni modelos de otro índice ni índices no autorizados se incluyen como comprables',()=>{
 const x=buildDemoDecisionDesk(sources(Array.from({length:80},(_,i)=>trade(i,88,'1HZ90V')),{
  selection:{readOnly:true,subscribedSymbols:['1HZ10V'],rows:[
   {symbol:'1HZ90V',fresh:true,models:[model('1HZ90V')]},
   {symbol:'1HZ10V',fresh:false,models:[model('1HZ10V',10,'REVERSION_5','PUT')]}
  ]}
 }));
 assert.equal(x.candidateRanking.length,1);
 assert.equal(x.candidateRanking[0].symbol,'1HZ10V');
 assert.equal(x.candidateRanking[0].officialContracts,0);
 assert.equal(x.candidateRanking[0].reason,'PUBLIC_TICK_FEED_NOT_FRESH');
 assert.equal(x.excludedMarkets.includes('1HZ90V'),true);
});
test('NO aceptar fuentes no validadas ni datos del lado broker inexistentes',()=>{
 assert.throws(()=>buildDemoDecisionDesk({profitability:{},shadow:{readOnly:true},selection:{readOnly:true}}),
  /REQUIRES_READ_ONLY_SOURCES/);
 const x=buildDemoDecisionDesk(sources([]));
 assert.equal(x.allTimeOfficial.n,0);
 assert.equal(x.allTimeOfficial.roiPct,null);
 assert.equal(x.sampleSources.officialSettled,0);
 assert.equal(x.eligibleToBuyNow,0);
});
