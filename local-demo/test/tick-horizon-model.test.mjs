import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateTickHorizons,conservativeQuoteDecision} from '../tick-horizon-model.mjs';
import {computeMarketAnalysis} from '../market-analysis.mjs';
const rising=Array.from({length:660},(_,i)=>100+i*.001);
test('Predicciones independientes de exactamente 5 y 10 ticks usando ventanas 5/10/20',()=>{
 const models=evaluateTickHorizons(rising);
 assert.deepEqual(models.map(x=>x.durationTicks),[5,10]);
 assert.ok(models.every(x=>x.lookbacksTicks.join(',')==='5,10,20'));
 assert.ok(models.every(x=>x.validationDecisions>=20));
 assert.ok(models.every(x=>x.direction==='CALL'));
 assert.ok(models.every(x=>x.predictionUsesFutureTicks===false));
 assert.ok(models.every(x=>x.realTradingAllowed===false));
});
test('Modelo no usa precios posteriores para predecir el mismo corte temporal',()=>{
 const a=evaluateTickHorizons(rising.slice(0,600));
 const changed=rising.slice(0,600).concat(Array.from({length:60},(_,i)=>300+i));
 const b=evaluateTickHorizons(changed.slice(0,600));
 const statisticalFields=x=>x.map(({computeMs,computedAtMs,...decision})=>decision);
 assert.deepEqual(statisticalFields(a),statisticalFields(b));
 assert.ok(a.every(x=>Number.isFinite(x.computeMs)&&Number.isFinite(x.computedAtMs)));
});
test('Pago insuficiente cancela BUY incluso con una prediccion aparente perfecta',()=>{
 const candidate={durationTicks:5,readyForProposal:true,conservativeWinRateLower95:.65};
 assert.equal(conservativeQuoteDecision(candidate,1,1.4).approved,false);
 assert.equal(conservativeQuoteDecision(candidate,1,1.88).approved,true);
 assert.equal(conservativeQuoteDecision({...candidate,readyForProposal:false},1,1.88).approved,false);
});
test('Sin historial o sin diferencia de precios nunca asegura una entrada rentable',()=>{
 assert.ok(evaluateTickHorizons([100]).every(x=>x.readyForProposal===false));
 assert.ok(evaluateTickHorizons(Array(660).fill(100)).every(x=>x.readyForProposal===false));
});
test('Analisis principal conserva 60 velas pero expone un evaluador multi horizonte',()=>{
 const now=Math.floor(Date.now()/1000);
 const ticks=rising.map((price,i)=>({price,epoch:now-660+i}));
 const m=computeMarketAnalysis(ticks,{connected:true,ageReceivedMs:100});
 assert.equal(m.candleCount,60);
 assert.equal(m.tickHorizonAudit.trendContextTicks,600);
 assert.equal(m.tickHorizonAudit.momentum5CandlesLookbackTicks,50);
 assert.equal(m.tickHorizonModels[0].durationTicks,5);
 assert.equal(m.tickHorizonModels[1].durationTicks,10);
});
