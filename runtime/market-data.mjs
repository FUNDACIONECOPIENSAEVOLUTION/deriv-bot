/** Public prices only. This module contains no account, signing or order API. */
export const CANDLE_LIMIT=180;
export const PROVIDERS=Object.freeze([
  Object.freeze({id:'deriv',name:'Deriv',symbol:'R_100',capability:'PAPER',url:'https://app.deriv.com/'}),
  Object.freeze({id:'binance',name:'Binance',symbol:'BTCUSDT',capability:'MARKET_DATA_ONLY',url:'https://www.binance.com/'}),
  Object.freeze({id:'coinbase',name:'Coinbase',symbol:'BTC-USD',capability:'MARKET_DATA_ONLY',url:'https://www.coinbase.com/'}),
]);
export function validateCandles(rows,now=Math.floor(Date.now()/1000)){
  if(!Array.isArray(rows)||!rows.length||rows.length>300)throw Error('INVALID_CANDLES');
  let previous=-1;
  const candles=rows.map(row=>{
    const {time,open,high,low,close}=row;
    if(!Number.isSafeInteger(time)||time%60!==0||time<=previous||time>Math.floor(now/60)*60||
      ![open,high,low,close].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0)||
      high<Math.max(open,close)||low>Math.min(open,close)||high<low)throw Error('INVALID_CANDLES');
    previous=time;return {time,open,high,low,close,partial:row.partial===true||time+60>now};
  });
  return candles.slice(-CANDLE_LIMIT);
}
export function addCandleTick(candles,{epoch,quote}){
  if(!Number.isSafeInteger(epoch)||epoch<=0||!Number.isFinite(quote)||quote<=0)throw Error('INVALID_CHART_TICK');
  const time=Math.floor(epoch/60)*60,last=candles.at(-1);
  if(last&&time<last.time)return candles;
  if(last&&time===last.time)return [...candles.slice(0,-1),{...last,high:Math.max(last.high,quote),low:Math.min(last.low,quote),close:quote}];
  // Missing minutes stay missing. A bar built from collected ticks may be partial.
  return [...candles,{time,open:quote,high:quote,low:quote,close:quote,partial:true}].slice(-CANDLE_LIMIT);
}
export function mergeCandleHistory(current,history){
  if(!history.length)return current;
  const end=history.at(-1).time,tail=current.filter(c=>c.time>=end);
  const merged=history.map(c=>({...c}));
  for(const old of tail){
    if(old.time===end){const bar=merged.at(-1);merged[merged.length-1]={...bar,high:Math.max(bar.high,old.high),low:Math.min(bar.low,old.low),close:old.close};}
    else merged.push(old);
  }
  return merged.slice(-CANDLE_LIMIT);
}
export function equityPoints(trades,balanceCents){
  const closed=trades.filter(t=>t.status==='CLOSED'&&Number.isSafeInteger(t.pnlCents)&&Number.isSafeInteger(t.exitEpoch))
    .sort((a,b)=>a.exitEpoch-b.exitEpoch||a.entryEpoch-b.entryEpoch||a.id.localeCompare(b.id));
  if(!closed.length)return [];
  let value=balanceCents-closed.reduce((sum,t)=>sum+t.pnlCents,0);
  return [{time:closed[0].entryEpoch,value},...closed.map(t=>({time:t.exitEpoch,value:value+=t.pnlCents}))];
}
const endpoints=Object.freeze({
  binance:'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=180',
  coinbase:'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60',
});
async function boundedJson(response){
  if(!response.ok)throw Error('PUBLIC_MARKET_HTTP_'+response.status);
  if(!response.body)throw Error('EMPTY_MARKET_RESPONSE');
  const reader=response.body.getReader(),parts=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>150_000)throw Error('MARKET_RESPONSE_TOO_LARGE');parts.push(value);}
  }catch(error){await reader.cancel();throw error;}
  const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function publicMarketSnapshot(provider,{fetcher=fetch,now=Math.floor(Date.now()/1000)}={}){
  if(!Object.hasOwn(endpoints,provider))throw Error('UNSUPPORTED_PUBLIC_PROVIDER');
  const url=new URL(endpoints[provider]);
  if(provider==='coinbase'){
    url.searchParams.set('start',new Date((Math.floor(now/60)*60-179*60)*1000).toISOString());
    url.searchParams.set('end',new Date(now*1000).toISOString());
  }
  // Workers supports manual redirects, not Fetch's error mode. Non-2xx responses
  // are rejected below, so a provider can never redirect this fetch elsewhere.
  const response=await fetcher(url.href,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(4500)});
  const raw=await boundedJson(response);
  if(!Array.isArray(raw)||!raw.length||raw.length>500||raw.some(row=>!Array.isArray(row)||row.length<6))throw Error('INVALID_MARKET_RESPONSE');
  const rows=raw.map(row=>provider==='binance'
    ?{time:Number(row[0])/1000,open:Number(row[1]),high:Number(row[2]),low:Number(row[3]),close:Number(row[4])}
    :{time:Number(row[0]),low:Number(row[1]),high:Number(row[2]),open:Number(row[3]),close:Number(row[4])});
  if(provider==='coinbase')rows.sort((a,b)=>a.time-b.time);
  const candles=validateCandles(rows.slice(-CANDLE_LIMIT),now),last=candles.at(-1);
  return {provider,symbol:PROVIDERS.find(p=>p.id===provider).symbol,capability:'MARKET_DATA_ONLY',
    intervalSeconds:60,candles,fetchedAt:now,latestCandleTime:last.time,
    state:now-last.time<=120?'recent':'stale',source:provider==='binance'?'Binance public REST klines':'Coinbase Exchange public REST candles'};
}
