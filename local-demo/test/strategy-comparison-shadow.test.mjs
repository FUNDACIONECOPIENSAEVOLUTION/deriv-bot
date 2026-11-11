import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {describeResearchSignals,createStrategyComparisonShadow,
 SHADOW_POLICIES} from '../strategy-comparison-shadow.mjs';

function newLab(sampleIntervalTicks=20){
 const db=new DatabaseSync(':memory:');
 const lab=createStrategyComparisonShadow({db,getVersion:()=> '18.3',
  sampleIntervalTicks});
 return {db,lab};
}
const rising=Array.from({length:100},(_,i)=>100+i*.015);
test('Cinco indicadores de referencia y momento se calculan con solo 60 precios previos',()=>{
 const x=describeResearchSignals(rising.slice(0,60));
 assert.ok(x);
 assert.equal(x.directions.MOMENTUM_10,'CALL');
 assert.equal(x.directions.EMA_8_21,'CALL');
 assert.equal(x.directions.ER10_TREND,'CALL');
 assert.ok(SHADOW_POLICIES.includes('BOLLINGER20_REVERSAL'));
 assert.equal(x.directions.RSI14_REVERSAL,'PUT');
 assert.equal(x.regime,'DIRECTIONAL');
 assert.ok(x.indicators.rmsReturnBps>0);
 assert.equal(describeResearchSignals([100]),null);
});
test('Ninguna observacion se etiqueta antes del tick 5/10 futuro',()=>{
 const {db,lab}=newLab(600);
 for(let seq=1;seq<=64;seq++)lab.onTick({symbol:'1HZ10V',
  price:100+seq*.01,epoch:1800000000+seq,seq});
 assert.equal(lab.status().samplesStored,0);
 for(let seq=65;seq<=69;seq++)lab.onTick({symbol:'1HZ10V',
  price:100+seq*.01,epoch:1800000000+seq,seq});
 assert.ok(lab.status().samplesStored>0,'five ticks after first prediction');
 assert.equal(lab.status().results.every(x=>x.horizonTicks===5),true);
 lab.onTick({symbol:'1HZ10V',price:100.70,epoch:1800000070,seq:70});
 assert.ok(lab.status().results.some(x=>x.horizonTicks===10));
 assert.equal(lab.status().brokerOrders,0);
 assert.equal(lab.status().changesBuy,false);
 assert.equal(lab.status().realEnabled,false);
 assert.ok(lab.status().results.every(x=>x.brokerPnlUsd===null));
 db.close();
});
test('El estudio separa R_20 y 1HZ100V, y separa duraciones',()=>{
 const {db,lab}=newLab(600);
 for(let seq=1;seq<=70;seq++){
  lab.onTick({symbol:'R_20',price:110+seq*.1,epoch:1800000000+seq,seq});
  lab.onTick({symbol:'1HZ100V',price:220-seq*.1,epoch:1800000000+seq,seq});
 }
 const s=lab.status();
 assert.ok(s.results.some(x=>x.symbol==='R_20'));
 assert.ok(s.results.some(x=>x.symbol==='1HZ100V'));
 assert.ok(s.results.some(x=>x.horizonTicks===5));
 assert.ok(s.results.some(x=>x.horizonTicks===10));
 assert.deepEqual(s.liveSymbols.sort(),['1HZ100V','R_20'].sort());
 assert.equal(db.prepare('SELECT DISTINCT source FROM demo_strategy_comparison').get().source,'PUBLIC_TICKS_SHADOW');
 db.close();
});
test('Interrupcion y saltos no inventan respuestas ni mezclan sesiones',()=>{
 const {db,lab}=newLab(600);
 for(let seq=1;seq<=60;seq++)lab.onTick({symbol:'1HZ10V',price:100+seq*.1,
  epoch:1800000000+seq,seq});
 lab.onTick({symbol:'1HZ10V',price:112,epoch:1800000100,seq:75});
 assert.equal(lab.status().samplesStored,0);
 assert.equal(lab.status().gaps,1);
 lab.interrupt();
 assert.equal(lab.status().liveSymbols.length,0);
 for(let seq=1;seq<=10;seq++)lab.onTick({symbol:'1HZ10V',price:200+seq*.1,
  epoch:1800000200+seq,seq});
 assert.equal(lab.status().samplesStored,0);
 assert.equal(lab.status().interruptions,1);
 db.close();
});
test('No abre ordenes y rechaza simbolos invalidos',()=>{
 const {db,lab}=newLab();
 assert.equal(lab.onTick({symbol:'../../secrets',price:100,epoch:1800000000,seq:1}),0);
 assert.equal(lab.onTick({symbol:'R_20',price:-10,epoch:1800000000,seq:1}),0);
 assert.equal(lab.status().samplesStored,0);
 assert.ok(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='demo_local_orders'").get());
 db.close();
});
