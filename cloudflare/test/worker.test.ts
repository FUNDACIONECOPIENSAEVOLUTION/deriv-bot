import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext, runInDurableObject, evictDurableObject, runDurableObjectAlarm, abortAllDurableObjects, reset } from 'cloudflare:test';
import { setupNetwork } from '@msw/cloudflare';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, afterAll, expect, it } from 'vitest';
import worker from '../src/index';
import release from '../../release.json';
import { PublicSocket } from '../src/public-socket';
import { PUBLIC_ENDPOINT } from '../../runtime/feed.mjs';
import { publicMarketSnapshot } from '../../runtime/market-data.mjs';

const token='test-only-token-with-at-least-32-characters';
const headers={Authorization:'Bearer '+token};
const network=setupNetwork();
beforeAll(()=>{
  network.enable();
  network.use(http.all('*',()=>new HttpResponse('offline fixture',{status:503})));
});
afterAll(()=>network.disable());
afterEach(async()=>{await abortAllDurableObjects();await reset();});
async function request(path:string,init:RequestInit={},bindings=env) {
  const ctx=createExecutionContext();
  const response=await worker.fetch(new Request('https://paper.example'+path,init),bindings,ctx);
  const body=await response.text();await waitOnExecutionContext(ctx);
  return {response,body};
}

it('reports the public upgrade rejection and keeps the endpoint restricted',async()=>{
  const ctx=createExecutionContext();
  expect(()=>new PublicSocket('wss://unrelated.example/',ctx)).toThrow('PUBLIC_ENDPOINT_ONLY');
  const socket=new PublicSocket(PUBLIC_ENDPOINT,ctx);
  await waitOnExecutionContext(ctx);
  expect(socket.errorCode).toBe('UPGRADE_HTTP_503');
  expect(socket.errorDetail).toContain('public market endpoint');
  expect(socket.readyState).toBe(3);
});

it('reports only a bounded public market error code when a crypto source rejects a request',async()=>{
  const {response,body}=await request('/api/market?provider=binance',{headers});
  expect(response.status).toBe(503);
  expect(JSON.parse(body).code).toBe('PUBLIC_MARKET_HTTP_503');
  expect(body).not.toContain(token);
});

it('constructs crypto requests using a redirect mode supported by the real Workers runtime',async()=>{
  const time=Math.floor(Date.now()/60000)*60000;
  const result=await publicMarketSnapshot('binance',{fetcher:async(url,init)=>{
    const nativeRequest=new Request(url,init);
    expect(nativeRequest.redirect).toBe('manual');
    return Response.json([[time,'100','101','99','100.5','1']]);
  }});
  expect(result.candles).toHaveLength(1);
  expect(result.provider).toBe('binance');
});

it('health is public but the dashboard, status, CSV and controls require credentials',async()=>{
  const health=await request('/api/health');
  expect(health.response.status).toBe(200);
  expect(JSON.parse(health.body)).toMatchObject({status:'ok',mode:'PAPER',version:release.version+'.0',release:'cloudflare-deriv-demo-panel-v'+release.version,lastUpdated:release.updatedAt,demoBuyingEnabled:false,demoAutomationEnabled:false});
  for(const path of ['/','/api/status','/api/trades.csv','/api/market?provider=binance','/api/start','/api/stop']) {
    const {response}=await request(path,{method:path==='/api/start'||path==='/api/stop'?'POST':'GET'});
    expect(response.status).toBe(401);expect(response.headers.get('WWW-Authenticate')).toContain('Basic');
  }
});
it('public dependency health checks both PAPER and broker DEMO without exposing account data',async()=>{
 const {response,body}=await request('/api/health/dependencies');
 expect(response.status).toBe(200);
 const d=JSON.parse(body);
 expect(d).toMatchObject({version:release.version+'.0',paper:'ready',demo:'ready',
   brokerAuthorization:'not_checked',noOrders:true});
 for(const secret of ['credentials','accessToken','accountId','balance','account'])
  expect(body).not.toContain('"'+secret+'"');
});
it('dependency health reports unavailable PAPER without hiding healthy DEMO storage',async()=>{
 const broken={...env,PAPER:{getByName(){throw Error('TEST_PAPER_UNAVAILABLE');}}};
 const {response,body}=await request('/api/health/dependencies',{},broken as unknown as typeof env);
 // DEMO remains available when optional PAPER storage fails.
 expect(response.status).toBe(200);
 expect(JSON.parse(body)).toMatchObject({paper:'unavailable',demo:'ready',
   brokerAuthorization:'not_checked'});
});
it('private dashboard embeds this exact release and escapes changelog placeholders',async()=>{
  const {response,body}=await request('/',{headers});
  expect(response.status).toBe(200);
  expect(body).toContain('CLOUDFLARE DEMO v'+release.version);
  expect(body).toContain(release.updatedAt);
  expect(body).not.toContain('__RELEASE_VERSION__');
  expect(body).not.toContain('__RELEASE_CHANGES__');
});
it('fails closed when the owner secret is missing or too short',async()=>{
  expect((await request('/api/status',{headers},{...env,ADMIN_TOKEN:''})).response.status).toBe(503);
  expect((await request('/api/status',{headers},{...env,ADMIN_TOKEN:'short'})).response.status).toBe(503);
  expect((await request('/api/status',{headers:{Authorization:'Bearer wrong'}})).response.status).toBe(401);
});
it('serves the private panel with nonce protection and accepts browser Basic auth',async()=>{
  const {response,body}=await request('/',{headers:{Authorization:'Basic '+btoa('owner:'+token)}});
  expect(response.status).toBe(200);expect(body).toContain('Iniciar simulación');
  expect(body).not.toContain('__NONCE__');expect(body).not.toContain(token);
  expect(response.headers.get('Content-Security-Policy')).toContain("connect-src 'self'");
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});
it('rejects cross-site changes and requests without the control header',async()=>{
  const base={...headers,'Content-Type':'application/json','X-Paper-Control':'1'};
  expect((await request('/api/start',{method:'POST',headers:{...base,Origin:'https://other.example'}})).response.status).toBe(403);
  expect((await request('/api/start',{method:'POST',headers})).response.status).toBe(403);
  expect((await request('/api/stop',{method:'POST',headers:{...base,Origin:'https://paper.example'}})).response.status).toBe(200);
});
it('initializes USD 10 in pause and keeps different experiments independent',async()=>{
  const a=env.PAPER.getByName('a'),b=env.PAPER.getByName('b');
  expect((await a.status()).balanceCents).toBe(1000);
  await runInDurableObject(a,(_instance,ctx)=>{
    const row=ctx.storage.sql.exec<{data:string}>('SELECT data FROM experiment WHERE id=1').one();
    const saved=JSON.parse(row.data);saved.state.balanceCents=1234;
    ctx.storage.sql.exec('UPDATE experiment SET data=? WHERE id=1',JSON.stringify(saved));
  });
  await evictDurableObject(a);
  expect((await a.status()).balanceCents).toBe(1234);
  expect((await b.status()).balanceCents).toBe(1000);
  expect((await a.status()).running).toBe(false);
});
it('keeps chart candles across eviction without reviving the simulation or accepting arbitrary market URLs',async()=>{
  const stub=env.PAPER.getByName('chart');await stub.status();
  const time=Math.floor(Date.now()/60000)*60-60;
  await runInDurableObject(stub,(_instance,ctx)=>{
    const saved=JSON.parse(ctx.storage.sql.exec<{data:string}>('SELECT data FROM experiment WHERE id=1').one().data);
    saved.candles=[{time,open:100,high:103,low:99,close:102,partial:false}];
    ctx.storage.sql.exec('UPDATE experiment SET data=? WHERE id=1',JSON.stringify(saved));
  });
  await evictDurableObject(stub);
  const status=await stub.status();expect(status.chart.candles).toHaveLength(1);expect(status.chart.candles[0].close).toBe(102);
  expect(status.running).toBe(false);expect(status.providers.map(p=>p.id)).toEqual(['deriv','binance','coinbase']);
  expect((await request('/api/market?provider=https://other.example',{headers})).response.status).toBe(400);
});
it('preserves accounting and invalidates a persisted open position exactly once after eviction',async()=>{
  const stub=env.PAPER.getByName('recover');await stub.status();
  await runInDurableObject(stub,(_instance,ctx)=>{
    const saved=JSON.parse(ctx.storage.sql.exec<{data:string}>('SELECT data FROM experiment WHERE id=1').one().data);
    saved.state.balanceCents=1234;
    saved.state.position={id:'recovery-1',symbol:'R_100',direction:1,entryEpoch:Math.floor(Date.now()/1000)-10,
      entryQuote:100,ticksHeld:2,stakeCents:10,payoutPct:80,costCents:0};
    ctx.storage.sql.exec('UPDATE experiment SET data=? WHERE id=1',JSON.stringify(saved));
    ctx.storage.sql.exec('INSERT INTO trades VALUES(?,?,?)','recovery-1',saved.state.position.entryEpoch,JSON.stringify({...saved.state.position,status:'OPEN'}));
  });
  await evictDurableObject(stub);
  const recovered=await stub.status();
  expect(recovered.balanceCents).toBe(1234);expect(recovered.position).toBeNull();expect(recovered.voided).toBe(1);
  expect(recovered.trades[0].status).toBe('VOID');expect(recovered.trades[0].pnlCents).toBe(0);
  expect(recovered.trades[0].reason).toBe('OBJECT_RESTART');
  await evictDurableObject(stub);expect((await stub.status()).voided).toBe(1);
});
it('schedules recovery on start and removes the alarm on pause',async()=>{
  const stub=env.PAPER.getByName('alarm');
  await stub.start();
  expect(await runInDurableObject(stub,(_instance,ctx)=>ctx.storage.getAlarm())).not.toBeNull();
  await stub.stop();
  expect(await runInDurableObject(stub,(_instance,ctx)=>ctx.storage.getAlarm())).toBeNull();
  expect(await runDurableObjectAlarm(stub)).toBe(false);
  expect((await stub.status()).running).toBe(false);
});
it('exports all rows across more than one page and streams the owner CSV',async()=>{
  const stub=env.PAPER.getByName('owner-usd10-v1');await stub.status();
  await runInDurableObject(stub,(_instance,ctx)=>{
    ctx.storage.transactionSync(()=>{for(let i=0;i<205;i++){
      const id='export-'+String(i).padStart(4,'0');
      ctx.storage.sql.exec('INSERT INTO trades VALUES(?,?,?)',id,i,JSON.stringify({id,status:'CLOSED',entryEpoch:i,symbol:'R_100',pnlCents:0}));
    }});
  });
  const first=await stub.exportPage(),second=await stub.exportPage(first.next);
  expect(first.trades.length).toBe(200);expect(second.trades.length).toBe(5);expect(second.next).toBeNull();
  const {response,body}=await request('/api/trades.csv',{headers});
  expect(response.status).toBe(200);expect(body.trim().split('\n')).toHaveLength(206);
});


it('stores read-only Binance/Coinbase research separately from broker DEMO account balances',async()=>{
  const stub=env.PAPER.getByName('owner-usd10-v1');
  const empty=await request('/api/arbitrage',{headers});
  expect(empty.response.status).toBe(200);
  expect(JSON.parse(empty.body).hasData).toBe(false);
  const snapshot={status:'RESEARCH_ONLY',pair:'BTC',capitalLimitUsd:10,estimates:[
    {route:'BINANCE_TO_COINBASE',grossBps:15,estimatedNetBps:-20},
    {route:'COINBASE_TO_BINANCE',grossBps:-35,estimatedNetBps:-50}
  ]};
  await stub.recordArbitrage(snapshot);
  const data=JSON.parse((await request('/api/arbitrage',{headers})).body);
  expect(data.mode).toBe('READ_ONLY_RESEARCH');
  expect(data.hasData).toBe(true);
  expect(data.history[0].binanceToCoinbaseNetBps).toBe(-20);
  expect(data.snapshot.capitalLimitUsd).toBe(10);
  expect(JSON.stringify(data)).not.toContain('accessToken');
  expect(JSON.stringify(data)).not.toContain('buyContract');
});
it('keeps arbitrage refresh private and does not invent quotes on public API errors',async()=>{
  const noAuth=await request('/api/arbitrage/refresh',{method:'POST',body:'{}'});
  expect(noAuth.response.status).toBe(401);
  const invalid=await request('/api/arbitrage/refresh',{method:'POST',headers});
  expect(invalid.response.status).toBe(403);
  const before=JSON.parse((await request('/api/arbitrage',{headers})).body);
  const response=await request('/api/arbitrage/refresh',{method:'POST',headers:{
    ...headers,'Content-Type':'application/json','X-Paper-Control':'1'
  },body:'{}'});
  expect(response.response.status).toBe(503);
  const store=JSON.parse((await request('/api/arbitrage',{headers})).body);
  expect(store.observationsShown).toBe(before.observationsShown);
  expect(store.latestCapturedAt).toBe(before.latestCapturedAt);
});
