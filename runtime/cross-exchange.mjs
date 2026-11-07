/**
 * Cross-exchange research ONLY. No credentials, orders, transfers, or private account APIs.
 * Compares BTC/USDT (Binance Spot) with BTC/USD (Coinbase Exchange) using a
 * separate actual USDT/USD book for conversion. Treats all results as
 * indications, never executable arbitrage or guaranteed returns.
 */
export const ARB_SOURCES=Object.freeze({
  binance:'https://data-api.binance.vision/api/v3/depth?symbol=BTCUSDT&limit=5',
  coinbaseBTC:'https://api.exchange.coinbase.com/products/BTC-USD/book?level=1',
  coinbaseUSDT:'https://api.exchange.coinbase.com/products/USDT-USD/book?level=1'
});
const allowed=new Set(Object.values(ARB_SOURCES));
const finite=(v)=>{const x=Number(v);return Number.isFinite(x)&&x>0?x:null;};
const assume=Object.freeze({takerBpsEach:10,fxBps:10,slippageBpsEach:5});
const bps=value=>Math.round(value*100)/100;
export function validateTopBook(raw,provider,receivedAt=Date.now()){
  if(!Number.isSafeInteger(receivedAt)||receivedAt<=0)throw Error('ARB_INVALID_TIME');
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('ARB_BOOK_INVALID');
  let bid,ask;
  if(provider==='binance'){
    if(!Number.isSafeInteger(raw.lastUpdateId)||!Array.isArray(raw.bids)||!Array.isArray(raw.asks))throw Error('ARB_BOOK_INVALID');
    [bid,ask]=[raw.bids[0],raw.asks[0]];
  }else if(provider==='coinbase'){
    if(!Array.isArray(raw.bids)||!Array.isArray(raw.asks)||raw.sequence===undefined)throw Error('ARB_BOOK_INVALID');
    [bid,ask]=[raw.bids[0],raw.asks[0]];
  }else throw Error('ARB_PROVIDER_UNKNOWN');
  const bidPrice=finite(bid?.[0]),bidQty=finite(bid?.[1]),askPrice=finite(ask?.[0]),askQty=finite(ask?.[1]);
  if([bidPrice,bidQty,askPrice,askQty].some(x=>x===null)||bidPrice>askPrice)throw Error('ARB_BOOK_INVALID');
  let sourceTime=null;
  if(provider==='coinbase'&&typeof raw.time==='string'){
    const stamp=Date.parse(raw.time);if(Number.isFinite(stamp))sourceTime=stamp;
  }
  return {bid:bidPrice,ask:askPrice,bidQty,askQty,receivedAt,sourceTime};
}
export function compareExecutableSides(books,{budgetUsd=10,
  takerBpsEach=assume.takerBpsEach,fxBps=assume.fxBps,slippageBpsEach=assume.slippageBpsEach,
  maxReceptionSkewMs=3000,nowMs=Date.now()}={}){
  if(!books||!books.binance||!books.coinbaseBTC||!books.coinbaseUSDT)throw Error('ARB_BOOKS_MISSING');
  if(!Number.isFinite(budgetUsd)||budgetUsd<=0||budgetUsd>10)throw Error('ARB_BUDGET_INVALID');
  if(![takerBpsEach,fxBps,slippageBpsEach].every(v=>Number.isFinite(v)&&v>=0&&v<=500))throw Error('ARB_FEE_INVALID');
  const b=books.binance,c=books.coinbaseBTC,fx=books.coinbaseUSDT;
  const times=[b.receivedAt,c.receivedAt,fx.receivedAt];
  if(times.some(t=>!Number.isSafeInteger(t)||nowMs-t>10000||t>nowMs+1000))throw Error('ARB_SNAPSHOT_STALE');
  const skewMs=Math.max(...times)-Math.min(...times);
  if(skewMs>maxReceptionSkewMs)throw Error('ARB_SNAPSHOT_OUT_OF_SYNC');
  const scenarios=[
    {route:'BINANCE_TO_COINBASE',buyUsd:b.ask*fx.ask,sellUsd:c.bid,buyQty:b.askQty,sellQty:c.bidQty,fxQty:fx.askQty},
    {route:'COINBASE_TO_BINANCE',buyUsd:c.ask,sellUsd:b.bid*fx.bid,buyQty:c.askQty,sellQty:b.bidQty,fxQty:fx.bidQty}
  ];
  const estimates=scenarios.map(s=>{
    const qty=Math.min(budgetUsd/s.buyUsd,s.buyQty,s.sellQty,s.fxQty/Math.max(b.ask,b.bid));
    if(!Number.isFinite(qty)||qty<=0)throw Error('ARB_LIQUIDITY_INSUFFICIENT');
    const invested=qty*s.buyUsd,proceeds=qty*s.sellUsd;
    const gross=proceeds-invested;
    const fee=invested*takerBpsEach/10000+proceeds*takerBpsEach/10000+
      (s.route==='BINANCE_TO_COINBASE'?invested:proceeds)*fxBps/10000;
    const slippage=(invested+proceeds)*slippageBpsEach/10000;
    const net=gross-fee-slippage;
    return {route:s.route,baseQty:qty,notionalUsd:invested,buyUsdPerBtc:s.buyUsd,sellUsdPerBtc:s.sellUsd,
      grossUsd:gross,grossBps:bps(gross/invested*10000),
      estimatedCostsUsd:fee+slippage,estimatedNetUsd:net,estimatedNetBps:bps(net/invested*10000),
      positiveAfterAssumptions:net>0};
  });
  return {status:'RESEARCH_ONLY',pair:'BTC',capitalLimitUsd:budgetUsd,
    quoteCurrencies:['USDT','USD'],usdtUsd:{bid:fx.bid,ask:fx.ask},
    caution:'Snapshot: not an executable quote. Exchange-time/fees, balances and fills are not verified.',
    exchangeTimestampsVerified:false,receptionSkewMs:skewMs,
    assumptionBps:{takerEach:takerBpsEach,fx:fxBps,slippageEach:slippageBpsEach},
    snapshots:books,estimates};
}
async function boundedJson(response){
  if(!response.ok)throw Error('ARB_HTTP_'+response.status);
  if(!response.body)throw Error('ARB_EMPTY_RESPONSE');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>32000)throw Error('ARB_RESPONSE_TOO_LARGE');chunks.push(value);}
  }finally{await reader.cancel();}
  const bytes=new Uint8Array(size);let at=0;
  for(const part of chunks){bytes.set(part,at);at+=part.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('ARB_INVALID_JSON');}
}
export async function readPublicArbitrageSnapshot({fetcher=fetch,now=()=>Date.now(),budgetUsd=10}={}){
  const data=await Promise.all(Object.entries(ARB_SOURCES).map(async([key,url])=>{
    if(!allowed.has(url)||new URL(url).protocol!=='https:')throw Error('ARB_ENDPOINT_NOT_ALLOWED');
    const response=await fetcher(url,{method:'GET',redirect:'manual',
      headers:{Accept:'application/json'},signal:AbortSignal.timeout(4500)});
    const raw=await boundedJson(response);
    return [key,validateTopBook(raw,key==='binance'?'binance':'coinbase',now())];
  }));
  return compareExecutableSides(Object.fromEntries(data),{nowMs:now(),budgetUsd});
}
