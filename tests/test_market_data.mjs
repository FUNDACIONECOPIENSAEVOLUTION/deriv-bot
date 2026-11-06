import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCandles,addCandleTick,mergeCandleHistory,equityPoints,publicMarketSnapshot} from '../runtime/market-data.mjs';
import {PublicFeed} from '../runtime/feed.mjs';
import {analyzeSignal,readConfig,initialState,seedHistory,onTick} from '../runtime/core.mjs';
const now=1_800_000_030,base=1_800_000_000;
const bar=(time=base,extra={})=>({time,open:100,high:103,low:99,close:102,...extra});
test('OHLC rejects impossible prices, duplicate minutes, future data and oversized histories',()=>{
  assert.equal(validateCandles([bar()],now)[0].partial,true);
  for(const rows of [[bar(base,{high:101})],[bar(base,{low:101})],[bar(base,{close:NaN})],
    [bar(base+1)],[bar(base+60)],[bar(),bar()],[null],Array(301).fill(bar())])assert.throws(()=>validateCandles(rows,now));
});
test('ticks retain all extrema and gaps without fabricating candles; late history preserves newer live close',()=>{
  let candles=addCandleTick([],{epoch:base+2,quote:100});
  candles=addCandleTick(candles,{epoch:base+4,quote:105});
  candles=addCandleTick(candles,{epoch:base+6,quote:98});
  assert.deepEqual(candles[0],{time:base,open:100,high:105,low:98,close:98,partial:true});
  candles=mergeCandleHistory(candles,validateCandles([bar(base-60),bar()],now));
  assert.equal(candles.at(-1).open,100);assert.equal(candles.at(-1).high,105);assert.equal(candles.at(-1).low,98);assert.equal(candles.at(-1).close,98);
  candles=addCandleTick(candles,{epoch:base+180,quote:110});
  assert.deepEqual(candles.map(c=>c.time),[base-60,base,base+180]);
  assert.deepEqual(addCandleTick(candles,{epoch:base+60,quote:99}),candles);
  for(let i=4;i<200;i++)candles=addCandleTick(candles,{epoch:base+i*60,quote:100});
  assert.equal(candles.length,180);
});
test('equity uses realized integer-cent outcomes and ignores VOID and open positions',()=>{
  const rows=[{id:'b',status:'CLOSED',entryEpoch:20,exitEpoch:30,pnlCents:-10},
    {id:'void',status:'VOID',entryEpoch:15,exitEpoch:25,pnlCents:999},
    {id:'a',status:'CLOSED',entryEpoch:5,exitEpoch:10,pnlCents:8},
    {id:'open',status:'OPEN',entryEpoch:35,pnlCents:800}];
  assert.deepEqual(equityPoints(rows,998),[{time:5,value:1000},{time:10,value:1008},{time:30,value:998}]);
  assert.equal(rows[0].id,'b');
});
test('crypto adapters normalize both public formats without sharing financial credentials',async()=>{
  for(const provider of ['binance','coinbase']){
    let called=false;
    const raw=provider==='binance'?[[base*1000,'100','103','99','102','1']]:[[base,99,103,100,102,1]];
    const snapshot=await publicMarketSnapshot(provider,{now,fetcher:async(url,init)=>{
      called=true;assert.equal(new URL(url).hostname,provider==='binance'?'data-api.binance.vision':'api.exchange.coinbase.com');
      assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.headers,undefined);
      return Response.json(raw);
    }});
    assert.ok(called);assert.equal(snapshot.capability,'MARKET_DATA_ONLY');assert.equal(snapshot.candles[0].close,102);
  }
  await assert.rejects(()=>publicMarketSnapshot('https://evil.example',{fetcher:()=>{throw Error('Must not fetch');}}),/UNSUPPORTED/);
  await assert.rejects(()=>publicMarketSnapshot('binance',{fetcher:async()=>new Response('restricted',{status:451})}),/HTTP_451/);
  await assert.rejects(()=>publicMarketSnapshot('binance',{fetcher:async()=>new Response('x'.repeat(150001))}),/TOO_LARGE/);
  const extra=await publicMarketSnapshot('coinbase',{now,fetcher:async()=>Response.json(Array.from({length:350},(_,i)=>[base-i*60,99,103,100,102,1]))});
  assert.equal(extra.candles.length,180);assert.equal(extra.candles.at(-1).time,base);
});
class Socket extends EventTarget{constructor(){super();this.readyState=1;this.sent=[];}send(raw){this.sent.push(JSON.parse(raw));}close(){}message(data){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(data)}));}}
test('Deriv candle responses need matching request, symbol, interval and valid OHLC',()=>{
  const socket=new Socket(),charts=[],chartStates=[];
  const feed=new PublicFeed({symbol:'R_100',onHistory(){},onTick(){},onCandles:c=>charts.push(c),onChartStatus:s=>chartStates.push(s),socketFactory:()=>socket,now:()=>now*1000});
  try{
    feed.start();socket.dispatchEvent(new Event('open'));const request=socket.sent[0].req_id;
    socket.message({msg_type:'history',req_id:request,echo_req:{ticks_history:'R_100'},history:{prices:Array(150).fill(100),times:Array.from({length:150},(_,i)=>now-298+i*2)}});
    const req=socket.sent.find(r=>r.style==='candles');assert.ok(req);assert.equal(req.granularity,60);
    const message={msg_type:'candles',req_id:req.req_id,echo_req:{ticks_history:'R_100',style:'candles',granularity:60},candles:[{epoch:base,open:100,high:103,low:99,close:102}]};
    socket.message({...message,echo_req:{...message.echo_req,ticks_history:'R_75'}});assert.equal(charts.length,0);
    socket.message({...message,candles:[{...message.candles[0],high:90}]});assert.equal(charts.length,0);
    socket.message(message);assert.equal(charts.length,1);assert.equal(chartStates.at(-1),'ready');
  }finally{feed.stop();}
});
test('an entry records the same indicators that determined its direction',()=>{
  let p=100;const prices=Array.from({length:150},(_,i)=>p+=[.02,-.01,.02,-.01,.01][i%5]);
  const config=readConfig({PAPER_ENABLED:'true'}),state=seedHistory(initialState(config,now),prices);
  const result=onTick(state,config,{symbol:'R_100',epoch:now,quote:prices.at(-1)},{nowEpoch:now});
  assert.ok(result.state.position);assert.deepEqual(result.state.position.decision,analyzeSignal(result.state.prices));
  assert.equal(result.state.position.decision.reason,'TREND_AND_MOMENTUM');
});
