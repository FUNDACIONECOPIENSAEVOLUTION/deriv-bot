import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateWalkForward} from '../shadow-walk-forward.mjs';

const base=1794190000000;
const row=(i,pnl=(i%3?84:-100))=>({
 id:'t'+i,state:'SETTLED',symbol:i%2?'R_10':'R_50',
 direction:i%4?'CALL':'PUT',stake_cents:100,pnl_cents:pnl,
 bought_at_ms:base+i*9000,settled_at_ms:base+i*9000+4900,
 candle_epoch:1794190000+i,
 signal_rsi:40+(i%7)*3,signal_tick_rsi14:35+(i%9)*4,
 signal_strength:24+(i%11)*6,
 signal_age_ms:100+(i%8)*80,
 signal_five_tick_momentum:(i%5-2)*.04,
});

test('Entrena solo liquidaciones anteriores y separa cinco pliegues posteriores',()=>{
 const rows=Array.from({length:150},(_,i)=>row(i));
 const report=evaluateWalkForward(rows);
 assert.equal(report.independentDecisions,150);
 assert.equal(report.scored.n,110);
 assert.equal(report.fullFolds,5);
 assert.equal(report.folds.length,6);
 assert.equal(report.folds[5].complete,false);
 assert.equal(report.folds[0].n,20);
 assert.equal(report.predictionAltersBuy,false);
 assert.equal(report.realEnabled,false);
 assert.equal(report.autoTradingAllowed,false);
 assert.equal(report.filterDeployed,false);
 assert.ok(Number.isFinite(report.scored.brierModel));
 assert.ok(Number.isFinite(report.scored.brierNeutral));
 assert.ok(Number.isFinite(report.scored.brierHistorical));
});

test('Etiquetas futuras no cambian la puntuación de un pliegue anterior',()=>{
 const initial=Array.from({length:135},(_,i)=>row(i));
 const changed=initial.map((r,i)=>i>=110?{...r,pnl_cents:-100}:r);
 const p=evaluateWalkForward(initial),q=evaluateWalkForward(changed);
 assert.equal(p.folds[0].brierModel,q.folds[0].brierModel);
 assert.equal(p.folds[1].brierModel,q.folds[1].brierModel);
 assert.notEqual(p.scored.netCents,q.scored.netCents);
});

test('Compras simultáneas no entrenan el modelo con liquidaciones futuras',()=>{
 const rows=Array.from({length:90},(_,i)=>({
  ...row(i),bought_at_ms:base,settled_at_ms:base+10000+i,
  candle_epoch:1794190000+i,
 }));
 const p=evaluateWalkForward(rows);
 assert.equal(p.independentDecisions,90);
 assert.equal(p.scored.n,0,'No existe entrenamiento anterior a ninguna compra');
 assert.equal(p.conclusion,'MUESTRA_FUERA_DE_MUESTRA_INSUFICIENTE');
});

test('Cuenta como una sola observación por señal/candle, descarta liquidaciones inciertas',()=>{
 const rows=[row(0),{...row(1),symbol:'R_50',direction:'PUT',candle_epoch:row(0).candle_epoch,symbol:'R_10',direction:row(0).direction},
  {...row(2),settled_at_ms:null},
  {...row(3),signal_strength:null,signal_rsi:null,signal_tick_rsi14:null,signal_five_tick_momentum:null}];
 const p=evaluateWalkForward(rows);
 assert.equal(p.independentDecisions,1);
 assert.equal(p.excludedDuplicates,1);
 assert.equal(p.excludedUnknownSettlementTime,1);
 assert.equal(p.excludedMissingFeatures,1);
});

test('No se permite afirmar rentabilidad aunque brier sea bajo',()=>{
 const rows=Array.from({length:160},(_,i)=>row(i,85));
 const p=evaluateWalkForward(rows);
 assert.equal(p.predictionAltersBuy,false);
 assert.equal(p.filterDeployed,false);
 assert.equal(p.realEnabled,false);
 assert.match(p.note,/no prueba/i);
});
