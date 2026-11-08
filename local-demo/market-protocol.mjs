// Adaptadores de datos públicos Deriv (2026). No manejan credenciales ni BUY.
// active_symbols cambió 'symbol' por 'underlying_symbol' en la nueva API.
export function normalizeActiveSymbols(records){
 if(!Array.isArray(records))return [];
 const found=new Map();
 for(const record of records){
  const symbol=record?.underlying_symbol??record?.symbol;
  if(typeof symbol!=='string'||!/^[A-Za-z0-9_]{2,30}$/.test(symbol))continue;
  const name=String(record?.underlying_symbol_name??record?.display_name??symbol).slice(0,128);
  found.set(symbol,{symbol,name});
 }
 return [...found.values()];
}
export function decodePublicHistory(response,expectedSymbol){
 const symbol=String(response?.echo_req?.ticks_history??expectedSymbol??'');
 const p=response?.history?.prices,t=response?.history?.times;
 if(!Array.isArray(p)||!Array.isArray(t)||p.length!==t.length||p.length>1000)
  return {symbol,rows:[],valid:false};
 const rows=[];
 for(let i=0;i<p.length;i++){
  const price=Number(p[i]),epoch=Number(t[i]);
  if(Number.isFinite(price)&&price>0&&Number.isSafeInteger(epoch)&&epoch>0)
   rows.push({price,epoch});
 }
 return {symbol,rows,valid:rows.length>0};
}
export function decodePublicTick(response){
 const value=response?.tick||{};
 const symbol=value.symbol??value.underlying_symbol??response?.echo_req?.ticks;
 const price=Number(value.quote),epoch=Number(value.epoch);
 if(typeof symbol!=='string'||!Number.isFinite(price)||price<=0||
    !Number.isSafeInteger(epoch)||epoch<=0)return null;
 return {symbol,price,epoch};
}
export function findWatchSymbol(available,pattern){
 return available.find(x=>pattern.test(x.symbol)||pattern.test(x.name))||null;
}
