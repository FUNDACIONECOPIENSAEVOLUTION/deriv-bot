import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computeMarketAnalysis,HISTORY_TICKS} from '../market-analysis.mjs';
const now=Math.floor(Date.now()/1000);
const ticks=Array.from({length:HISTORY_TICKS},(_,i)=>({
 price:100+Math.sin(i/7)*.01+i*.000025,epoch:now-30+Math.floor(i/25)
}));
test('60 complete OHLC candles are available after historical backfill',()=>{
 const s=computeMarketAnalysis(ticks,{connected:true,ageReceivedMs:100});
 assert.equal(s.candleCount,60);
 assert.equal(s.candles.length,60);
 assert.equal(s.requiredCandles,60);
 assert.equal(s.ticksAnalyzed,HISTORY_TICKS);
 assert.ok(Number.isFinite(s.ema20));
 assert.ok(Number.isFinite(s.ema50));
 assert.ok(Number.isFinite(s.atr14));
 assert.ok(s.candles.every(x=>x.high>=x.low&&x.open>=x.low&&x.open<=x.high));
});
test('Insufficient history never creates a trading signal',()=>{
 const s=computeMarketAnalysis(ticks.slice(-200),{connected:true,ageReceivedMs:80});
 assert.equal(s.direction,'ESPERAR');
 assert.equal(s.ready,false);
 assert.equal(s.candleCount,20);
});
test('Stale prices are never traded even with a full history',()=>{
 const s=computeMarketAnalysis(ticks,{connected:false,ageReceivedMs:9999});
 assert.equal(s.direction,'ESPERAR');
 assert.equal(s.reason,'PRECIOS_NO_FRESCOS');
 assert.equal(s.fresh,false);
});
test('No success rate or probability is inferred from candle history',()=>{
 const s=computeMarketAnalysis(ticks,{connected:true,ageReceivedMs:100});
 assert.equal(s.successProbability,undefined);
 assert.equal(s.predictedAccuracy,undefined);
});

test('Projection has a comparable out-of-sample MAE and never drives an automatic BUY',()=>{
 const result=computeMarketAnalysis(ticks,{connected:true,ageReceivedMs:100});
 assert.ok(Number.isFinite(result.projectedNextTick));
 assert.ok(Number.isFinite(result.modelMae));
 assert.ok(Number.isFinite(result.naiveMae));
 assert.equal(result.projectionIsResearchOnly,true);
});
