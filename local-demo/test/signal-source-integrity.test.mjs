import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authorizeVolatilitySymbols,AUTHORIZED_VOLATILITY_SYMBOLS,
 discoverVolatilitySymbols} from '../synthetic-catalog.mjs';
import {decodePublicHistory,decodePublicTick,resetPublicMarketSeries} from '../market-protocol.mjs';
import {inspectSignalAvailability} from '../demo-burst.mjs';

test('AUTO no acepta indices 15, 20, 90, 150 o 500 aunque Deriv los anuncie',()=>{
 const records=['R_20','R_10','R_25','R_100','1HZ10V',
  '1HZ90V','1HZ150V','R_500','1HZ25V','1HZ50V','frxEURUSD']
  .map(underlying_symbol=>({underlying_symbol,
   underlying_symbol_name:'Volatility '+underlying_symbol}));
 const found=discoverVolatilitySymbols(records);
 assert.ok(found.includes('1HZ90V')&&found.includes('R_20'));
 const allowed=authorizeVolatilitySymbols(records);
 assert.deepEqual(allowed,['R_10','R_25','R_100','1HZ10V','1HZ25V','1HZ50V']);
 assert.ok(allowed.every(x=>AUTHORIZED_VOLATILITY_SYMBOLS.includes(x)));
 assert.ok(!allowed.includes('frxEURUSD')&&!allowed.includes('R_500'));
 assert.equal(authorizeVolatilitySymbols([{underlying_symbol:'R_20'}]).length,0);
});
test('Historia de otro simbolo o de tiempos desordenados no genera velas ni BUY',()=>{
 const history={msg_type:'history',echo_req:{ticks_history:'1HZ90V'},
  history:{times:[1800000000,1800000001,1800000002],prices:[100,101,102]}};
 const wrong=decodePublicHistory(history,'1HZ10V');
 assert.equal(wrong.valid,false);
 assert.equal(wrong.reason,'HISTORY_SYMBOL_MISMATCH');
 assert.equal(wrong.rows.length,0);
 const order=decodePublicHistory({echo_req:{ticks_history:'1HZ10V'},
  history:{times:[1800000000,1799999999],prices:[100,101]}},'1HZ10V');
 assert.equal(order.valid,false);
 assert.equal(order.reason,'HISTORY_TIME_DISORDERED');
 assert.equal(decodePublicTick({tick:{symbol:'R_10',quote:100,epoch:1800000001},
  echo_req:{ticks:'R_100'}}),null);
});
test('Reconexion destruye velas antiguas sin alterar etiqueta del indice',()=>{
 const old={symbol:'R_100',ticks:Array.from({length:660},(_,i)=>({price:100+i,
  epoch:1800000000+i})),epoch:1800000660,quote:760,receivedAtMs:999,
  feedReceivedAtMs:999,liveTickSeq:40,available:true};
 resetPublicMarketSeries(old,'R_100');
 assert.deepEqual(old.ticks,[]);
 assert.equal(old.epoch,0);
 assert.equal(old.quote,0);
 assert.equal(old.liveTickSeq,0);
 assert.equal(old.receivedAtMs,0);
 assert.equal(old.feedReceivedAtMs,null);
 assert.equal(old.symbol,'R_100');
 assert.equal(old.available,true);
});
test('Veto de un horizonte no contamina la elegibilidad del otro',()=>{
 const nowMs=1800000000000,epoch=1800000000;
 const model=h=>({durationTicks:h,direction:'CALL',
  trainingDecisions:80,validationDecisions:60,
  observedValidationHitRate:.61,selectedPolicy:'MOMENTUM_10',
  conservativeWinRateLower95:.51,readyForProposal:false});
 const market={symbol:'R_10',available:true,ready:true,candleCount:60,
  fresh:true,ageReceivedMs:10,epoch,candles:[{epoch}],
  tickHorizonModels:[model(5),model(10)]};
 const checked=[];
 const veto=(symbol,direction,duration)=>{
  checked.push([symbol,direction,duration]);
  return {blocked:duration===10};
 };
 const five=inspectSignalAvailability(['R_10'],()=>market,new Map(),veto,nowMs,
  true,'RESEARCH_FIVE_ONLY');
 const ten=inspectSignalAvailability(['R_10'],()=>market,new Map(),veto,nowMs,
  true,'RESEARCH_TEN_ONLY');
 assert.equal(five.counts.READY,1);
 assert.equal(ten.counts.NO_RESEARCH_TICK_EVIDENCE,1);
 assert.ok(checked.some(r=>r[2]===5));
 assert.ok(checked.some(r=>r[2]===10));
 assert.ok(checked.every(r=>[5,10].includes(r[2])));
});
