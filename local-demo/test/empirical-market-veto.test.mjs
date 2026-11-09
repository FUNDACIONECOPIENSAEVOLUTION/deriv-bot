import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wilsonUpper,recentMarketRiskVerdict,recentIndependentSettlements,
 MARKET_VETO_POLICY} from '../empirical-market-veto.mjs';
const sample=(total,wins,offset=0)=>Array.from({length:total},(_,i)=>({
 state:'SETTLED',symbol:'1HZ90V',direction:i%2?'CALL':'PUT',
 pnl_cents:i<wins?88:-100,stake_cents:100,duration_ticks:i%2?5:10,
 bought_at_ms:1794250000000+offset+i*11000,candle_epoch:1794250000+offset/1000+i*11
}));
test('Persistente mercado adverso: solo veta tras muestra de liquidaciones',()=>{
 const verdict=recentMarketRiskVerdict(sample(30,7),{symbol:'1HZ90V'});
 assert.equal(verdict.policy,MARKET_VETO_POLICY);
 assert.equal(verdict.samples,30);assert.equal(verdict.wins,7);
 assert.equal(verdict.blocked,true);
 assert.ok(verdict.upperWinRate<verdict.referenceBreakEven);
 assert.equal(verdict.realEnabled,false);
});
test('Muestras pequenas y tasas razonables no son vetadas',()=>{
 assert.equal(recentMarketRiskVerdict(sample(20,0)).blocked,false);
 assert.equal(recentMarketRiskVerdict(sample(30,15)).blocked,false);
 assert.equal(recentMarketRiskVerdict(sample(30,22)).blocked,false);
 assert.equal(recentMarketRiskVerdict([]).blocked,false);
});
test('Dos operaciones de la misma vela no cuentan dos veces',()=>{
 const history=sample(27,0);
 history[0].candle_epoch=history[1].candle_epoch;
 history[2].candle_epoch=history[1].candle_epoch;
 assert.equal(recentIndependentSettlements(history).length,25);
 assert.equal(recentMarketRiskVerdict(history).samples,25);
});
test('El veto caduca cuando cambia la ventana de resultados recientes',()=>{
 const historical=sample(30,7);
 const newResults=sample(30,23,5000000);
 assert.equal(recentMarketRiskVerdict(historical).blocked,true);
 assert.equal(recentMarketRiskVerdict([...historical,...newResults]).blocked,false);
});
test('Wilson upper aumenta con numero de aciertos',()=>{
 assert.ok(wilsonUpper(5,30)<wilsonUpper(15,30));
 assert.equal(wilsonUpper(0,0),1);
});
