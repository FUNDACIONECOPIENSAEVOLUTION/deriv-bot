import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fiveTickDirectionStudy,computeMarketAnalysis} from '../market-analysis.mjs';
test('Five-tick retrospective validation uses non-overlapping forward windows only',()=>{
 const prices=Array.from({length:320},(_,i)=>100+0.001*i+Math.sin(i/10)*.02);
 const study=fiveTickDirectionStudy(prices);
 assert.equal(study.horizonTicks,5);
 assert.ok(study.independentObservations>45);
 assert.ok(study.holdoutCount>=15);
 assert.ok(study.hitRate>=0&&study.hitRate<=1);
 assert.equal(study.validatedForTrading,false);
 const ticks=prices.map((price,i)=>({price,epoch:Math.floor(Date.now()/1000)-320+i}));
 const snapshot=computeMarketAnalysis(ticks,{connected:true,ageReceivedMs:100});
 assert.equal(snapshot.fiveTickStudy.horizonTicks,5);
 assert.ok(Number.isFinite(snapshot.tickRsi14));
 assert.ok(Number.isFinite(snapshot.fiveTickMomentum));
});
test('Too little history leaves five-tick test uncalibrated',()=>{
 const study=fiveTickDirectionStudy([100,101,100]);
 assert.equal(study.holdoutCount,0);
 assert.equal(study.hitRate,null);
});
