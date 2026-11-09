import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildTradeQualityReport} from '../learning-quality.mjs';

const mock=(i,{version='13.6',symbol='R_100',dir='CALL',pnl=44}={})=>({
 state:'SETTLED',symbol,direction:dir,pnl_cents:pnl,stake_cents:50,
 app_version:version,strategy_version:'EMA20_EMA50_RSI14_ATR14_OHLC10_V1',
 created_at:1794190000+i,bought_at_ms:1794190000000+i*10000,
 signal_age_ms:200+i,proposal_latency_ms:180,buy_latency_ms:245,
 entry_tick:100,exit_tick:pnl>0?100.1:99.9,signal_quote:99.95,
 projection_model_mae:.3,projection_naive_mae:.2,
});
test('Historial por versión distingue 60 resultados y las dos mitades',()=>{
 const rows=[
  ...Array.from({length:50},(_,i)=>mock(i,{version:null,pnl:i<30?44:-50})),
  ...Array.from({length:60},(_,i)=>mock(60+i,{pnl:i%30<19?44:-50}))
 ];
 const r=buildTradeQualityReport(rows);
 assert.equal(r.settled.n,110);
 assert.equal(r.latestVersion,'13.6');
 assert.equal(r.latest.n,60);
 assert.equal(r.latest.wins,38);
 assert.equal(r.latest.losses,22);
 assert.equal(r.firstHalf.wins,19);
 assert.equal(r.secondHalf.wins,19);
 assert.equal(r.projection.modelWorse,60);
 assert.equal(r.projection.modelBetter,0);
 assert.equal(r.predictionAltersBuy,false);
 assert.equal(r.realEnabled,false);
 assert.equal(r.versions.find(v=>v.version==='SIN_VERSION_HISTORICA').n,50);
 assert.equal(r.latestCI95.lower<.6333,true);
 assert.equal(r.latestCI95.upper>.6333,true);
});
test('Rechazos no se cuentan como pérdidas ni contaminan la evaluación',()=>{
 const r=buildTradeQualityReport([mock(0,{pnl:-50}),
  {state:'REJECTED',error_code:'DEMO_QUOTE_STALE',pnl_cents:null},
  {state:'REJECTED',error_code:'DEMO_SIGNAL_STALE_OR_CONTRARY',pnl_cents:null}]);
 assert.equal(r.settled.n,1);
 assert.equal(r.settled.losses,1);
 assert.equal(r.rejected.DEMO_QUOTE_STALE,1);
 assert.equal(r.rejected.DEMO_SIGNAL_STALE_OR_CONTRARY,1);
 assert.equal(r.shadow.evaluated,0);
});
test('Learning uses no future labels for its own online shadow forecast',()=>{
 // Dos series con igual primer tramo dan idénticas puntuaciones online
 // durante ese tramo, aunque los resultados finales difieran.
 const a=Array.from({length:12},(_,i)=>mock(i,{pnl:i<8?44:-50}));
 const b=[...a.slice(0,11),mock(11,{pnl:44})];
 const r1=buildTradeQualityReport(a),r2=buildTradeQualityReport(b);
 assert.equal(r1.shadow.evaluated,7);
 assert.equal(r2.shadow.evaluated,7);
 // Ambos estimadores evalúan el último contrato solo con resultados previos;
 // cuando el último resultado cambia, cambia el Brier, nunca el BUY.
 assert.notEqual(r1.shadow.brier,r2.shadow.brier);
 assert.equal(r1.shadow.usedForBuy,false);
 assert.equal(r2.shadow.usedForBuy,false);
});
test('Diagnóstico separa latencias, movimiento contrario y proyección',()=>{
 const r=buildTradeQualityReport([
  mock(0,{pnl:44}),
  {...mock(1,{pnl:-50}),signal_age_ms:850,buy_latency_ms:230},
 ]);
 assert.equal(r.latency.winners.signalAgeMedianMs,200);
 assert.equal(r.latency.losers.signalAgeMedianMs,850);
 assert.equal(r.lossExamples[0].code,'MOVIMIENTO_CONTRARIO');
 assert.equal(r.projection.modelWorse,2);
 assert.equal(r.quoteToEntry.observed,2);
});
