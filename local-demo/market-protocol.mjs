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
 const announced=response?.echo_req?.ticks_history;
 const symbol=String(announced??expectedSymbol??'');
 // No atribuir historicos de otro indice al indice que hizo la peticion.
 if(expectedSymbol&&announced&&announced!==expectedSymbol)
  return {symbol:String(expectedSymbol),rows:[],valid:false,reason:'HISTORY_SYMBOL_MISMATCH'};
 const p=response?.history?.prices,t=response?.history?.times;
 if(!Array.isArray(p)||!Array.isArray(t)||p.length!==t.length||p.length>1000)
  return {symbol,rows:[],valid:false};
 const rows=[];
 for(let i=0;i<p.length;i++){
  const price=Number(p[i]),epoch=Number(t[i]);
  if(!Number.isFinite(price)||price<=0||!Number.isSafeInteger(epoch)||epoch<=0)
   return {symbol,rows:[],valid:false,reason:'HISTORY_ROW_INVALID'};
  rows.push({price,epoch});
 }
 // El calculo de velas exige orden cronologico: nunca ordenar silenciosamente
 // precios mezclados o datos mas antiguos bajo la misma etiqueta.
 if(rows.some((r,i)=>i>0&&r.epoch<rows[i-1].epoch))
  return {symbol,rows:[],valid:false,reason:'HISTORY_TIME_DISORDERED'};
 return {symbol,rows,valid:rows.length>0};
}
export function decodePublicTick(response){
 const value=response?.tick||{};
 const symbol=value.symbol??value.underlying_symbol??response?.echo_req?.ticks;
 if(value.symbol&&response?.echo_req?.ticks&&value.symbol!==response.echo_req.ticks)
  return null;
 const price=Number(value.quote),epoch=Number(value.epoch);
 if(typeof symbol!=='string'||!Number.isFinite(price)||price<=0||
    !Number.isSafeInteger(epoch)||epoch<=0)return null;
 const pip=Number(value.pip_size);
 // Los digitos solo son verificables con la precision oficial del broker.
 return value.pip_size!==undefined&&Number.isInteger(pip)&&pip>=0&&pip<=10?
  {symbol,price,epoch,pipSize:pip}:{symbol,price,epoch};
}
export function findWatchSymbol(available,pattern){
 return available.find(x=>pattern.test(x.symbol)||pattern.test(x.name))||null;
}

// Un nuevo WebSocket no puede reutilizar ticks ni velas de otro flujo desconectado.
export function resetPublicMarketSeries(m,symbol){
 if(!m||typeof symbol!=='string'||!/^[A-Za-z0-9_]{2,30}$/.test(symbol))
  throw Error('PUBLIC_MARKET_RESET_INVALID');
 Object.assign(m,{symbol,ticks:[],epoch:0,quote:0,receivedAtMs:0,
  feedReceivedAtMs:null,liveTickSeq:0,available:true});
 return m;
}
