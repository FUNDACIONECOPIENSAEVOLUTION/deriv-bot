import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildTradeQualityReport} from '../learning-quality.mjs';

const mock=(i,{version='13.6',symbol='R_100',dir='CALL',pnl=44}={})=>({
 state:'SETTLED',symbol,direction:dir,pnl_cents:pnl,stake_cents:50,
 app_version:version,strategy_version:'EMA20_EMA50_RSI14_ATR14_OHLC10_V1',
 created_at:1794190000+i,bought_at_ms:1794190000000+i*10000,
 settled_at_ms:1794190000000+i*10000+6500,
 signal_strength:62,signal_rsi:43,signal_five_tick_momentum:-0.18,
 signal_tick_rsi14:48,five_tick_study_hit_rate:.52,five_tick_study_n:40,
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

test('Liquidaciones simultáneas NO alimentan predicciones anteriores al cierre',()=>{
 const rows=Array.from({length:12},(_,i)=>({
  ...mock(i,{pnl:i%2?44:-50}), bought_at_ms:1794190000000+i*100,
  settled_at_ms:1794190000000+20000+i*100,
 }));
 const report=buildTradeQualityReport(rows);
 assert.equal(report.shadow.evaluated,0,
  'Ninguno de los 12 contratos aún estaba liquidado antes de la siguiente compra');
 assert.equal(report.shadow.causalSettlementOnly,true);
});
test('La investigación a cinco ticks es independiente de la selección CALL/PUT',()=>{
 const samples=[mock(0,{pnl:44}),mock(1,{pnl:-50}),mock(2,{pnl:44})];
 samples[0].signal_five_tick_momentum=.1;
 samples[2].signal_five_tick_momentum=.2;
 const report=buildTradeQualityReport(samples);
 assert.equal(report.research.fiveTickRecorded,3);
 assert.equal(report.research.momentumAligned.n,2);
 assert.equal(report.research.momentumOpposed.n,1);
 assert.equal(report.research.studyIsHistoricalOnly,true);
 assert.equal(report.predictionAltersBuy,false);
 assert.equal(report.research.strengthBands.reduce((n,x)=>n+x.n,0),3);
});

test('Diagnóstico identifica rachas negativas sin bloquear automáticamente la compra',()=>{
 const losing=[
  ...Array.from({length:10},(_,i)=>({...mock(i,{version:'13.8',pnl:-100}),
   batch_id:'losing-1',stake_cents:100})),
  ...Array.from({length:10},(_,i)=>({...mock(10+i,{version:'13.8',pnl:i<2?88:-100}),
   batch_id:'losing-2',stake_cents:100}))
 ];
 const r=buildTradeQualityReport(losing);
 assert.equal(r.operationalWarnings.latestNegativeBatchStreak,2);
 assert.equal(r.operationalWarnings.latest10Loss,true);
 assert.equal(r.operationalWarnings.lastBatches.length,2);
 assert.equal(r.operationalWarnings.recommendedAction,'REVISAR_PERDIDAS_ANTES_DE_OTRA_TANDA_DEMO');
 assert.equal(r.operationalWarnings.operatingStrategyIsAdaptive,false);
 assert.equal(r.predictionAltersBuy,false);
 assert.equal(r.realEnabled,false);
});
test('Acierto de equilibrio se calcula con pago real de contratos positivos',()=>{
 const rows=Array.from({length:10},(_,i)=>({...mock(i,{version:'13.8',pnl:i<5?88:-100}),
  stake_cents:100,batch_id:'single-batch'}));
 const r=buildTradeQualityReport(rows);
 assert.ok(r.operationalWarnings.estimatedBreakEvenWinRate>.531);
 assert.ok(r.operationalWarnings.estimatedBreakEvenWinRate<.533);
 assert.equal(r.operationalWarnings.latest10Loss,true);
});
