import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computeMarketAnalysis,trimTickHistory,MAX_TICKS,TICKS_PER_CANDLE} from '../market-analysis.mjs';
import {selectDistinctCandidates} from '../demo-burst.mjs';

test('700 ticks and one new tick do not repaint previous 60 OHLC candles',()=>{
 const now=Math.floor(Date.now()/1000);
 const ticks=Array.from({length:700},(_,i)=>({price:4600+Math.sin(i/6)+i*.03,epoch:now-699+i}));
 const before=computeMarketAnalysis(ticks,{connected:true,ageReceivedMs:100});
 assert.equal(before.candles.length,60);
 ticks.push({price:4699.05,epoch:now+1});
 trimTickHistory(ticks);
 assert.equal(ticks.length,691);
 const after=computeMarketAnalysis(ticks,{connected:true,ageReceivedMs:100});
 assert.deepEqual(after.candles,before.candles,
  'one live tick should not change closed 10-tick candles or RSI');
 assert.equal(after.rsi14,before.rsi14);
 assert.equal(after.ema20,before.ema20);
});
test('New completed candle shifts only one previous closed candle',()=>{
 const now=Math.floor(Date.now()/1000),ticks=Array.from({length:700},(_,i)=>({
  price:4500+(i*.004),epoch:now-699+i
 }));
 const old=computeMarketAnalysis(ticks).candles;
 for(let i=1;i<=TICKS_PER_CANDLE;i++){
  ticks.push({price:4503+i*.004,epoch:now+i});
  trimTickHistory(ticks);
 }
 assert.equal(ticks.length,MAX_TICKS);
 const current=computeMarketAnalysis(ticks).candles;
 assert.deepEqual(current.slice(0,-1),old.slice(1));
 assert.notEqual(current.at(-1).epoch,old.at(-1).epoch);
});
test('Identical PUT signal may not open twice in the same wave or candle',()=>{
 const candleEpoch=1794183732;
 const same={symbol:'1HZ75V',direction:'PUT',signalStrength:48,epoch:candleEpoch+1,
  candles:[{epoch:candleEpoch}]};
 const other={symbol:'R_25',direction:'PUT',signalStrength:47,epoch:candleEpoch+1,
  candles:[{epoch:candleEpoch}]};
 const used=new Map();
 const first=selectDistinctCandidates([same,same,other],5,used);
 assert.deepEqual(first.map(x=>x.symbol),['1HZ75V','R_25']);
 for(const c of first)used.set(c.symbol,c.selectedCandleEpoch);
 assert.equal(selectDistinctCandidates([same,other],5,used).length,0);
 const renewed={...same,candles:[{epoch:candleEpoch+10}],epoch:candleEpoch+11};
 assert.deepEqual(selectDistinctCandidates([renewed,other],5,used).map(x=>x.symbol),['1HZ75V']);
});
test('Continuar comprando diferentes índices simultáneamente no requiere señales duplicadas',()=>{
 const candidates=Array.from({length:7},(_,i)=>({
  symbol:'R_'+(i*10+10),epoch:1794183712+i,signalStrength:60-i
 }));
 const chosen=selectDistinctCandidates(candidates,5,new Map());
 assert.equal(chosen.length,5);
 assert.equal(new Set(chosen.map(x=>x.symbol)).size,5);
});
