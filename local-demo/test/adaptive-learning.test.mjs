import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isVolatilitySymbol,discoverVolatilitySymbols} from '../synthetic-catalog.mjs';
import {buildAdaptiveReport,adaptiveVerdict,independentOutcomes} from '../adaptive-learning.mjs';

test('Only Deriv-announced volatility symbols are selectable; no invented index 20',()=>{
 const symbols=discoverVolatilitySymbols([
  {underlying_symbol:'R_10',underlying_symbol_name:'Volatility 10 Index'},
  {underlying_symbol:'R_20',underlying_symbol_name:'Volatility 20 Index'},
  {underlying_symbol:'R_100',underlying_symbol_name:'Volatility 100 Index'},
  {underlying_symbol:'1HZ150V',underlying_symbol_name:'Volatility 150 (1s) Index'},
  {underlying_symbol:'frxEURUSD',underlying_symbol_name:'EUR/USD'},
  {underlying_symbol:'CRASH500',underlying_symbol_name:'Crash 500 Index'}
 ]);
 assert.deepEqual(symbols.sort(),['1HZ150V','R_10','R_100','R_20'].sort());
 assert.ok(isVolatilitySymbol('R_20'));
 assert.equal(isVolatilitySymbol('frxEURUSD'),false);
 assert.equal(isVolatilitySymbol('../../secrets'),false);
 assert.equal(discoverVolatilitySymbols([{underlying_symbol:'R_10'}]).length,1);
 assert.equal(discoverVolatilitySymbols([]).length,0);
});
test('Duplicated purchases on one candle count as one independent observation',()=>{
 const rows=[
  {state:'SETTLED',symbol:'R_75',direction:'PUT',pnl_cents:-50,stake_cents:50,candle_epoch:100,bought_at_ms:100200},
  {state:'SETTLED',symbol:'R_75',direction:'PUT',pnl_cents:-50,stake_cents:50,candle_epoch:100,bought_at_ms:100300},
  {state:'REJECTED',symbol:'R_75',direction:'PUT',pnl_cents:null,stake_cents:50,candle_epoch:110,bought_at_ms:110000},
  {state:'SETTLED',symbol:'R_75',direction:'CALL',pnl_cents:40,stake_cents:50,candle_epoch:110,bought_at_ms:111000}
 ];
 const independent=independentOutcomes(rows);
 assert.equal(independent.length,2);
 assert.equal(buildAdaptiveReport(rows).groups.find(x=>x.direction==='PUT').independent,1);
 assert.equal(buildAdaptiveReport(rows).blocked,0);
});
test('Small history never blocks new DEMO signals, even after several losses',()=>{
 const rows=Array.from({length:8},(_,i)=>({state:'SETTLED',symbol:'R_75',direction:'PUT',
  pnl_cents:-50,stake_cents:50,candle_epoch:100+i*10,bought_at_ms:100000+i*10000}));
 const rep=buildAdaptiveReport(rows);
 assert.equal(rep.independent,8);
 assert.equal(adaptiveVerdict(rep,'R_75','PUT').blocked,false);
 assert.equal(rep.groups[0].status,'MUESTRA_INSUFICIENTE');
});
test('Confirmed persistent negative holdout can veto DEMO; no direction inversion',()=>{
 const losses=Array.from({length:60},(_,i)=>({state:'SETTLED',symbol:'R_100',direction:'PUT',
  pnl_cents:-50,stake_cents:50,candle_epoch:100+i*10,bought_at_ms:100000+i*10000}));
 const rep=buildAdaptiveReport(losses);
 assert.equal(rep.independent,60);
 assert.equal(rep.groups[0].holdoutCount,18);
 assert.equal(adaptiveVerdict(rep,'R_100','PUT').blocked,true);
 assert.equal(adaptiveVerdict(rep,'R_100','CALL').blocked,false);
 assert.equal(rep.realEnabled,false);
});
test('Winning historical results do not increase stake or auto-force a BUY',()=>{
 const rows=Array.from({length:60},(_,i)=>({state:'SETTLED',symbol:'1HZ75V',direction:'CALL',
  pnl_cents:30,stake_cents:50,candle_epoch:100+i*10,bought_at_ms:100000+i*10000}));
 const rep=buildAdaptiveReport(rows);
 assert.equal(rep.groups[0].blocked,false);
 assert.equal(rep.groups[0].status,'VALIDADO_SIN_VETO');
 assert.equal(rep.stakeMultiplier,undefined);
 assert.equal(rep.buyRecommendation,undefined);
});
