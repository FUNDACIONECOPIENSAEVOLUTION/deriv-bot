import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computeTickMicrostructure} from '../tick-microstructure.mjs';
import {computeMarketAnalysis} from '../market-analysis.mjs';
import {captureCandleContext} from '../candle-patterns.mjs';

test('Una secuencia creciente alcanza ER 1 sin conceder permiso de BUY',()=>{
 const data=Array.from({length:11},(_,i)=>100+i);
 const r=computeTickMicrostructure(data);
 assert.equal(r.ready,true);
 assert.equal(r.efficiencyRatio,1);
 assert.equal(r.direction,'UP');
 assert.equal(r.alignmentCount,4);
 assert.equal(r.reversals,0);
 assert.equal(r.researchOnly,true);
 assert.equal(r.usedFutureTicks,false);
 assert.equal(r.readyForProposal,undefined);
});
test('Serie serrucho de 10 pasos presenta ER cero, sin asumir predictibilidad',()=>{
 const data=Array.from({length:11},(_,i)=>100+(i%2));
 const r=computeTickMicrostructure(data);
 assert.equal(r.efficiencyRatio,0);
 assert.equal(r.direction,'FLAT');
 assert.equal(r.alignmentCount,0);
 assert.equal(r.reversals,9);
});
test('Muestras insuficientes o invalidas no arrojan certeza falsa',()=>{
 assert.equal(computeTickMicrostructure([100,101]).ready,false);
 assert.equal(computeTickMicrostructure(Array(11).fill(0)).ready,false);
 assert.equal(computeTickMicrostructure(Array(11).fill(100)).efficiencyRatio,0);
 assert.throws(()=>computeTickMicrostructure([100,101],{period:1}),/INVALID_MICROSTRUCTURE_WINDOW/);
});
test('Solo usa los ultimos 11 ticks presentes y se expone como telemetria informativa',()=>{
 const now=Math.floor(Date.now()/1000);
 const d=Array.from({length:660},(_,i)=>({price:100+i*.001,epoch:now-50+Math.floor(i/20)}));
 const a=computeMarketAnalysis(d,{connected:true,ageReceivedMs:100});
 const raw=d.map(x=>x.price);
 assert.equal(a.microstructure.efficiencyRatio,1);
 assert.deepEqual(a.microstructure,computeTickMicrostructure(raw));
 assert.deepEqual(computeTickMicrostructure(raw),computeTickMicrostructure([1,2,3,...raw]));
 assert.equal(a.microstructure.researchOnly,true);
});
test('La huella de compra archiva microestructura anterior a la compra',()=>{
 const now=Date.now(),base=Math.floor(now/1000)-30;
 const candles=Array.from({length:20},(_,i)=>({
  open:100+i,high:101+i,low:99+i,close:100.5+i,epoch:base+i
 }));
 const snap={symbol:'1HZ100V',candles,lastPrices:Array.from({length:90},(_,i)=>100+i*.001),
  microstructure:{ready:true,period:10,lastMoves:4,efficiencyRatio:.64,
   direction:'UP',alignmentCount:3,reversals:2,meanAbsoluteMove:.002},
  ema20:100,ema50:99,rsi14:56,atr14:1,quote:100,epoch:base+19};
 const record=captureCandleContext(snap,{atMs:now,count:20});
 assert.ok(record);
 assert.equal(record.tickMicrostructure.efficiencyRatio,.64);
 assert.equal(record.tickMicrostructure.researchOnly,true);
 assert.equal(record.schema,1);
});
