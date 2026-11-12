import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildMathExplanation,wilson95Lower,HISTORICAL_HOLDOUT_START_MS} from '../math-explainability.mjs';

const base=(i,state,profit,{ms=HISTORICAL_HOLDOUT_START_MS-5000,
 direction='CALL',entry=100,exit=101,strength=60}={})=>({
 id:String(i),state,created_at_ms:ms+i,
 bought_at_ms:ms+i+50,pnl_cents:profit,stake_cents:100,buy_cents:100,
 proposal_payout_cents:188,signal_strength:strength,
 signal_quote:99.5,entry_tick:entry,exit_tick:exit,
 direction,symbol:'1HZ10V',duration_ticks:5
});
test('Fórmula real y signo de PUT/CALL coinciden con liquidación; REJECTED y UNKNOWN no cuentan como derrota',()=>{
 const rows=[
  base(1,'SETTLED',88),
  base(2,'SETTLED',-100,{entry:101,exit:100}),
  base(3,'SETTLED',88,{direction:'PUT',entry:100,exit:99,strength:40}),
  base(4,'REJECTED',null),
  base(5,'UNKNOWN',null),
  base(6,'OPEN',null)
 ];
 const d=buildMathExplanation(rows);
 assert.equal(d.readOnly,true);assert.equal(d.realEnabled,false);
 assert.equal(d.brokerOrdersSent,0);assert.equal(d.mayRecommendBuy,false);
 assert.equal(d.allTime.settled,3);
 assert.equal(d.allTime.wins,2);
 assert.equal(d.allTime.losses,1);
 assert.equal(d.allTime.netUsd,0.76);
 assert.equal(d.allTime.observedBreakEvenWinRatePct,53.19);
 assert.equal(d.operational.stateCounts.UNKNOWN,1);
 assert.equal(d.operational.stateCounts.REJECTED,1);
 assert.equal(d.operational.unresolvedNow,2);
 assert.equal(d.operational.uncertainBuyNow,1);
 assert.equal(d.operational.closedUnknownTransitionCount,null);
 assert.equal(d.settlementMechanics.verifiedDirectionOutcomes,3);
 assert.equal(d.settlementMechanics.matchedSettlementSign,3);
 assert.deepEqual(d.recentSettlementsExplained.map(x=>x.realizedMove),
  ['PUT','PUT','CALL']);
 assert.equal(d.recentSettlementsExplained.find(x=>x.realizedBrokerWin===false).explanation,
  'EL_MOVIMIENTO_REAL_FUE_CONTRARIO_A_LA_DIRECCION_COMPRADA');
});
test('Umbral observado en histórico no se convierte en recomendación automática',()=>{
 const rows=[];
 for(let i=0;i<571;i++)rows.push(base(i,'SETTLED',i<317?88:-100,{
  ms:HISTORICAL_HOLDOUT_START_MS-100000+i*100,strength:75}));
 for(let i=0;i<100;i++)rows.push(base(1000+i,'SETTLED',i<49?88:-100,{
  ms:HISTORICAL_HOLDOUT_START_MS+10000+i*100,strength:75}));
 const d=buildMathExplanation(rows);
 assert.equal(d.temporalValidation.earlier.high.settled,571);
 assert.equal(d.temporalValidation.earlier.high.winRatePct,55.52);
 assert.equal(d.temporalValidation.later.high.settled,100);
 assert.equal(d.temporalValidation.later.high.winRatePct,49);
 assert.equal(d.temporalValidation.later.high.netUsd,-7.88);
 assert.equal(d.temporalValidation.economicEvidence,'NOT_VALIDATED_OUT_OF_SAMPLE');
 assert.equal(d.mayRecommendBuy,false);
 assert.ok(d.temporalValidation.later.high.winRateLower95Pct<54);
});
test('Sin spots, sin datos o solo estados inciertos no inventa movimiento ni esperanza de ganancia',()=>{
 const d=buildMathExplanation([base(1,'UNKNOWN',null),base(2,'REJECTED',null)]);
 assert.equal(d.allTime.settled,0);
 assert.equal(d.allTime.winRatePct,null);
 assert.equal(d.settlementMechanics.matchingRatePct,null);
 assert.equal(d.temporalValidation.economicEvidence,'NOT_ENOUGH_FORWARD_HIGH_STRENGTH_SAMPLES');
 assert.equal(d.recentSettlementsExplained.length,0);
 assert.equal(wilson95Lower(0,0),null);
 assert.throws(()=>buildMathExplanation(null),/INVALID/);
 const noSpots=buildMathExplanation([base(5,'SETTLED',-100,{entry:null,exit:null})]);
 assert.equal(noSpots.recentSettlementsExplained[0].realizedMove,'DESCONOCIDO');
 assert.equal(noSpots.recentSettlementsExplained[0].formulaMatchesBroker,null);
});
test('La prueba del signo no utiliza precio observado antes del contrato como si fuera entrada',()=>{
 const d=buildMathExplanation([
  base(10,'SETTLED',88,{entry:100,exit:101}),
  base(11,'SETTLED',-100,{entry:102,exit:101}),
  base(12,'SETTLED',88,{entry:101,exit:100,direction:'PUT'})
 ]);
 assert.equal(d.settlementMechanics.verifiedDirectionOutcomes,3);
 assert.equal(d.settlementMechanics.matchedSettlementSign,3);
 assert.equal(d.settlementMechanics.preEntryAdverseDrift,2);
 assert.equal(d.settlementMechanics.preEntryFavorableDrift,0);
 assert.equal(d.sequenceCheck.n,3);
});
