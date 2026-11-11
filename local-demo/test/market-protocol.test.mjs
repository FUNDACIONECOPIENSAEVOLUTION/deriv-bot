import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeActiveSymbols,decodePublicHistory,decodePublicTick,findWatchSymbol} from '../market-protocol.mjs';

test('New Deriv active_symbols exposes underlying_symbol (not legacy symbol)',()=>{
 const records=[{underlying_symbol:'R_100',underlying_symbol_name:'Volatility 100 Index',pip_size:2},
  {underlying_symbol:'1HZ100V',underlying_symbol_name:'Volatility 100 (1s)'},
  {underlying_symbol:'frxEURUSD',underlying_symbol_name:'EUR/USD'}];
 const active=normalizeActiveSymbols(records);
 assert.deepEqual(active.map(x=>x.symbol),['R_100','1HZ100V','frxEURUSD']);
 assert.equal(findWatchSymbol(active,/EUR\/USD/).symbol,'frxEURUSD');
 assert.ok(new Set(active.map(x=>x.symbol)).has('R_100'));
});
test('Legacy symbols also supported for old response fixtures',()=>{
 const active=normalizeActiveSymbols([{symbol:'R_75',display_name:'Volatility 75'}]);
 assert.equal(active[0].symbol,'R_75');
 assert.equal(active[0].name,'Volatility 75');
});
test('Invalid symbols cannot be subscribed to',()=>{
 const active=normalizeActiveSymbols([{underlying_symbol:'R_100'}, {underlying_symbol:'../../config'},
  {underlying_symbol:null},{underlying_symbol:'R_100'}]);
 assert.deepEqual(active.map(x=>x.symbol),['R_100']);
});
test('Deriv official history is parsed into ordered price/timestamp pairs',()=>{
 const fixture={echo_req:{ticks_history:'1HZ100V'},
  history:{prices:[100.1,100.2,100.3],times:[1762637001,1762637002,1762637003]}};
 const result=decodePublicHistory(fixture,'1HZ100V');
 const mismatched=decodePublicHistory(fixture,'R_10');
 assert.equal(mismatched.valid,false);
 assert.equal(mismatched.reason,'HISTORY_SYMBOL_MISMATCH');
 assert.equal(result.symbol,'1HZ100V');
 assert.equal(result.valid,true);
 assert.equal(result.rows.length,3);
 assert.equal(result.rows.at(-1).price,100.3);
});
test('Deriv tick parses quote and fallback echo symbol',()=>{
 assert.deepEqual(decodePublicTick({msg_type:'tick',tick:{symbol:'R_100',quote:200.5,epoch:1762637000}}),
  {symbol:'R_100',price:200.5,epoch:1762637000});
 assert.equal(decodePublicTick({tick:{quote:null,epoch:1762637000}}),null);
 assert.deepEqual(decodePublicTick({tick:{symbol:'R_100',quote:200.5,epoch:1762637000,pip_size:3}}),
  {symbol:'R_100',price:200.5,epoch:1762637000,pipSize:3});
});
