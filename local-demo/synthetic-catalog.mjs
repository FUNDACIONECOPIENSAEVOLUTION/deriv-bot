import {normalizeActiveSymbols} from './market-protocol.mjs';

// El proveedor debe anunciar cada código: no se inventan índices ni contratos.
export const MAX_VOLATILITY_FEEDS=20;
export function isVolatilitySymbol(symbol){
 return typeof symbol==='string'&&(/^(?:R_[1-9][0-9]{1,2}|1HZ[1-9][0-9]{1,2}V)$/.test(symbol));
}
export function discoverVolatilitySymbols(records,max=MAX_VOLATILITY_FEEDS){
 const candidates=normalizeActiveSymbols(records).filter(x=>
  isVolatilitySymbol(x.symbol)&&(/volatility/i.test(x.name)||
   /^(?:R_|1HZ)/.test(x.symbol)));
 const unique=[...new Map(candidates.map(x=>[x.symbol,x])).values()];
 unique.sort((a,b)=>{
  const av=Number((a.symbol.match(/[0-9]+/)||[])[0]),bv=Number((b.symbol.match(/[0-9]+/)||[])[0]);
  return av-bv||a.symbol.localeCompare(b.symbol);
 });
 return unique.slice(0,Math.max(1,Math.min(MAX_VOLATILITY_FEEDS,max))).map(x=>x.symbol);
}
