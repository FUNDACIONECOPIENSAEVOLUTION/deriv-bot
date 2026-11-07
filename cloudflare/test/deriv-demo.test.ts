import { env } from 'cloudflare:workers';
import { abortAllDurableObjects, reset, runInDurableObject, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { setupNetwork } from '@msw/cloudflare';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, afterAll, expect, it } from 'vitest';
import worker from '../src/index';
import { selectDemo, DerivDemoConnection, DEMO_QUOTE_REQUEST, parseDemoQuote, demoQuoteRequest, demoSocketUrl } from '../src/deriv-demo';
import { dayAt } from '../../runtime/core.mjs';

const token='test-only-token-with-at-least-32-characters';
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json','X-Paper-Control':'1'};
const demo={account_id:'DOT12345',account_type:'demo',currency:'USD',status:'active',balance:10000};
const real={account_id:'REAL12345',account_type:'real',currency:'USD',status:'active',balance:4321.99};
const network=setupNetwork();let onlyReal=false,calls:string[]=[];
beforeAll(()=>{network.enable();network.use(
  http.post('https://auth.deriv.com/oauth2/token',async({request})=>{
    calls.push('token');const form=new URLSearchParams(await request.text());
    expect(form.get('grant_type')).toBe('authorization_code');expect(form.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    return HttpResponse.json({access_token:'fixture-demo-access',expires_in:3600,token_type:'Bearer'});
  }),
  http.get('https://api.derivws.com/trading/v1/options/accounts',({request})=>{
    calls.push('accounts');expect(request.headers.get('Authorization')).toBe('Bearer fixture-demo-access');
    return HttpResponse.json({data:onlyReal?[real]:[real,demo]});
  }),
  http.get('https://api.derivws.com/trading/v1/options/legacy/migration-status',()=>HttpResponse.json({data:{status:'pending'}})),
  http.all('*',()=>{throw Error('UNEXPECTED_DEMO_NETWORK_REQUEST');})
);});
afterAll(()=>network.disable());
afterEach(async()=>{onlyReal=false;calls=[];await abortAllDurableObjects();await reset();});
async function request(path:string,init:RequestInit={}){
  const ctx=createExecutionContext();const r=await worker.fetch(new Request('https://paper.example'+path,init),env,ctx);
  const body=await r.text();await waitOnExecutionContext(ctx);return {r,body};
}
async function errorFrom(stub:DurableObjectStub,action:(instance:DerivDemoConnection)=>Promise<unknown>){
  // Catch expected domain failures inside the object, before the RPC transport logs them.
  return runInDurableObject(stub,async(instance:DerivDemoConnection)=>{try{await action(instance);return 'NO_ERROR';}catch(error){return error instanceof Error?error.message:'UNKNOWN';}});
}

it('selects only active USD demo accounts and refuses real, inactive and malformed accounts',()=>{
  expect(selectDemo({data:[real,demo]})).toEqual({account_id:'DOT12345',account_type:'demo',currency:'USD',balance:10000});
  for(const data of [[real],[{...demo,account_type:undefined}],[{...demo,status:'inactive'}],[{...demo,currency:'EUR'}],[{...demo,balance:-1}]])expect(()=>selectDemo({data})).toThrow('DERIV_DEMO_USD_REQUIRED');
  expect(()=>selectDemo({data:[demo]},'another-account')).toThrow('DERIV_DEMO_USD_REQUIRED');
});
it('normalizes the live decimal-string balance format without allowing real accounts or malformed money',()=>{
  for(const balance of ['10000','10000.00','10000.00000000',10000])expect(selectDemo({data:[{...demo,balance}]}).balance).toBe(10000);
  expect(selectDemo({data:[{...demo,balance:'0.29'}]}).balance).toBe(0.29);
  for(const balance of ['1e4','NaN','Infinity','-1','10,000.00','10000.001',' 10000 ',null,Infinity,-1])expect(()=>selectDemo({data:[{...demo,balance}]})).toThrow('DERIV_DEMO_USD_REQUIRED');
  expect(()=>selectDemo({data:[{...real,balance:'10000.00'}]})).toThrow('DERIV_DEMO_USD_REQUIRED');
});
it('uses PKCE and only the trade scope, consumes authorization once and stores credentials encrypted across eviction',async()=>{
  const stub=env.DERIV_DEMO.getByName('demo-1');
  const start=await stub.begin('app-123','https://paper.example'),url=new URL(start.url);
  expect(url.origin+url.pathname).toBe('https://auth.deriv.com/oauth2/auth');
  expect(url.searchParams.get('scope')).toBe('trade');expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(url.searchParams.get('redirect_uri')).toBe('https://paper.example/api/deriv/callback');
  const status=await stub.complete(start.state,'fixture-code');expect(status.connected).toBe(true);expect(status.executionEnabled).toBe(false);expect(status.account?.balance).toBe(10000);
  expect(JSON.stringify(status)).not.toContain('fixture-demo-access');expect(JSON.stringify(status)).not.toContain('REAL12345');
  const stored=await runInDurableObject(stub,(_instance,ctx)=>JSON.stringify(ctx.storage.sql.exec('SELECT * FROM demo_connection').toArray()));
  expect(stored).not.toContain('fixture-demo-access');expect(stored).not.toContain('fixture-code');
  expect(await errorFrom(stub,instance=>instance.complete(start.state,'fixture-code'))).toBe('DERIV_OAUTH_STATE_INVALID');
  await abortAllDurableObjects();const recovered=env.DERIV_DEMO.getByName('demo-1');expect((await recovered.status()).connected).toBe(true);
  expect((await recovered.refresh()).account?.type).toBe('demo');expect(calls).toEqual(['token','accounts','accounts']);
});
it('rejects a real-only authorization without storing a connected balance',async()=>{
  onlyReal=true;const stub=env.DERIV_DEMO.getByName('demo-real');const start=await stub.begin('app-123','https://paper.example');
  expect(await errorFrom(stub,instance=>instance.complete(start.state,'fixture-code'))).toBe('DERIV_DEMO_USD_REQUIRED');
  expect((await stub.status()).connected).toBe(false);expect((await stub.status()).account).toBeNull();
  expect((await stub.status()).discovery?.migration).toBe('pending');
  expect((await stub.status()).discovery?.activeDemoUsd).toBe(0);
  expect(JSON.stringify(await stub.status())).not.toContain('4321.99');
});
it('guards the demo routes with owner auth, same-origin controls and a browser-bound OAuth state cookie',async()=>{
  for(const path of ['/api/deriv/status','/api/deriv/callback','/api/deriv/connect','/api/deriv/refresh'])expect((await request(path)).r.status).toBe(401);
  expect((await request('/api/deriv/connect',{method:'POST',headers:{...headers,Origin:'https://other.example'},body:'{}'})).r.status).toBe(403);
  const start=await request('/api/deriv/connect',{method:'POST',headers,body:JSON.stringify({clientId:'app-123'})});
  expect(start.r.status).toBe(200);const cookie=start.r.headers.get('Set-Cookie')!;expect(cookie).toContain('HttpOnly');expect(cookie).toContain('Secure');
  const url=new URL(JSON.parse(start.body).url),state=url.searchParams.get('state')!;
  const callback='/api/deriv/callback?state='+state+'&code=fixture-code';
  expect((await request(callback,{headers})).r.status).toBe(400);expect(calls).toEqual([]);
  expect((await request(callback,{headers:{...headers,Cookie:cookie.split(';')[0]}})).r.status).toBe(303);
  const status=JSON.parse((await request('/api/deriv/status',{headers})).body);
  expect(status.connected).toBe(true);expect(status.aiConnected).toBe(false);expect(status.executionEnabled).toBe(false);
});
it('bounds request bodies and refuses invalid ids, overwritten state and arbitrary callback origins',async()=>{
  expect((await request('/api/deriv/connect',{method:'POST',headers,body:'x'.repeat(2000)})).r.status).toBe(413);
  expect((await request('/api/deriv/connect',{method:'POST',headers,body:JSON.stringify({clientId:'https://evil.example'})})).r.status).toBe(400);
  const stub=env.DERIV_DEMO.getByName('overwritten');
  expect(await errorFrom(stub,instance=>instance.begin('app-123','http://paper.example'))).toBe('DERIV_INVALID_ORIGIN');
  const first=await stub.begin('app-123','https://paper.example');await stub.begin('app-123','https://paper.example');
  expect(await errorFrom(stub,instance=>instance.complete(first.state,'fixture-code'))).toBe('DERIV_OAUTH_STATE_INVALID');expect(calls).toEqual([]);
});


it('keeps the DEMO proposal fixed at USD 1 for CALL R_100 at 20 ticks and never sends buy',()=>{
  expect(DEMO_QUOTE_REQUEST).toEqual({proposal:1,amount:1,basis:'stake',contract_type:'CALL',
    currency:'USD',duration:20,duration_unit:'t',underlying_symbol:'R_100',req_id:1});
  expect(JSON.stringify(DEMO_QUOTE_REQUEST)).not.toContain('"buy"');
  expect(JSON.stringify(DEMO_QUOTE_REQUEST)).not.toContain('"sell"');
});
it('parses only valid broker quotes, omits the actionable proposal id and never increases rejected stakes',()=>{
  const accepted=parseDemoQuote({msg_type:'proposal',req_id:1,
    proposal:{id:'do-not-expose-this-id',ask_price:'1.00',payout:1.80}});
  expect(accepted).toMatchObject({accepted:true,stake:1,durationTicks:20,askPrice:1,payout:1.80,potentialProfit:0.80});
  expect(JSON.stringify(accepted)).not.toContain('do-not-expose-this-id');
  const denied=parseDemoQuote({msg_type:'proposal',req_id:1,error:{code:'ContractTooSmall',message:'Raise amount'}});
  expect(denied).toEqual({accepted:false,code:'ContractTooSmall',stake:1,durationTicks:20,symbol:'R_100',contractType:'CALL'});
  expect(JSON.stringify(denied)).not.toContain('Raise amount');
  for(const price of ['NaN','1e5','0.000000001',-1,null]) {
    expect(()=>parseDemoQuote({msg_type:'proposal',proposal:{ask_price:price,payout:0.2}})).toThrow('DERIV_QUOTE_INVALID_RESPONSE');
  }
  expect(()=>parseDemoQuote({msg_type:'proposal',req_id:2,proposal:{ask_price:0.1,payout:0.2}})).toThrow('DERIV_QUOTE_WRONG_REQUEST');
});
it('accepts OTP WebSocket URLs only for the official demo endpoint, never for real or unrelated hosts',()=>{
  expect(demoSocketUrl({data:{url:'wss://api.derivws.com/trading/v1/options/ws/demo?otp=example-otp'}}))
    .toBe('wss://api.derivws.com/trading/v1/options/ws/demo?otp=example-otp');
  for(const url of ['wss://api.derivws.com/trading/v1/options/ws/real?otp=xxx',
    'wss://evil.example/trading/v1/options/ws/demo?otp=xxx','https://api.derivws.com/trading/v1/options/ws/demo?otp=xxx',
    'wss://api.derivws.com/trading/v1/options/ws/demo?otp=xxx&redirect=evil',
    'wss://api.derivws.com/trading/v1/options/ws/demo']) {
    expect(()=>demoSocketUrl({data:{url}})).toThrow();
  }
});
it('allows quote requests only to the owner and never quotes without a connected demo',async()=>{
  expect((await request('/api/deriv/quote')).r.status).toBe(401);
  expect((await request('/api/deriv/quote',{method:'GET',headers})).r.status).toBe(404);
  expect((await request('/api/deriv/quote',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'})).r.status).toBe(403);
  const isolated=env.DERIV_DEMO.getByName('quote-not-connected');
  expect(await errorFrom(isolated,instance=>instance.quote())).toBe('DERIV_DEMO_REQUIRED');
  expect(calls).toEqual([]);
});

it('keeps all broker orders disabled by default and blocks unauthenticated calls',async()=>{
  const status=await env.DERIV_DEMO.getByName('safety-state').status();
  expect(status.demoTradingEnabled).toBe(false);
  expect(status.tradeReport.settled).toBe(0);
  expect(status.tradeReport.unresolved).toBeNull();
  expect((await request('/api/deriv/demo/buy-once',{method:'POST'})).r.status).toBe(401);
  expect((await request('/api/deriv/demo/check',{method:'POST'})).r.status).toBe(401);
  expect((await request('/api/deriv/demo/buy-once',{method:'POST',headers,body:'{}'})).r.status).toBe(403);
  expect(await errorFrom(env.DERIV_DEMO.getByName('safety-state'),d=>d.buyDemoOnce('UP')))
    .toBe('DEMO_EXECUTION_DISABLED');
  expect(calls).toEqual([]);
});
it('persists virtual settlement reports separately from PAPER while leaving unresolved orders blocked',async()=>{
  const stub=env.DERIV_DEMO.getByName('ledger-state');
  await runInDurableObject(stub,(_instance,ctx)=>{
    ctx.storage.sql.exec("INSERT INTO demo_trades(date,created_at,state,contract_id,buy_cents,payout_cents,pnl_cents) VALUES('2026-11-07',100,'SETTLED',123,100,180,80)");
    ctx.storage.sql.exec("INSERT INTO demo_trades(date,created_at,state,contract_id,buy_cents,payout_cents,pnl_cents) VALUES('2026-11-07',101,'SETTLED',124,100,0,-100)");
    ctx.storage.sql.exec("INSERT INTO demo_trades(date,created_at,state,buy_cents) VALUES('2026-11-07',102,'UNKNOWN',100)");
  });
  const report=(await stub.status()).tradeReport;
  expect(report).toMatchObject({settled:2,wins:1,losses:1,pnlCents:-20,winRatePct:50});
  expect(report.unresolved?.state).toBe('UNKNOWN');
  expect((await stub.checkDemoSettlement()).state).toBe('BUY_OUTCOME_UNKNOWN');
  expect(calls).toEqual([]);
});

it('issues distinct CALL and PUT quotes without buying any contract',()=>{
  expect(demoQuoteRequest('UP')).toMatchObject({proposal:1,contract_type:'CALL',amount:1});
  expect(demoQuoteRequest('DOWN')).toMatchObject({proposal:1,contract_type:'PUT',amount:1});
  expect(demoQuoteRequest('DOWN')).not.toHaveProperty('buy');
  expect(parseDemoQuote({msg_type:'proposal',req_id:1,proposal:{ask_price:'1.00',payout:'1.80'}},
    'DOWN')).toMatchObject({accepted:true,contractType:'PUT',potentialProfit:0.80});
});
it('does not enable unsupervised DEMO execution when server switches are off',async()=>{
  const stub=env.DERIV_DEMO.getByName('auto-disabled');
  expect((await stub.status()).demoAutomationRequested).toBe(false);
  expect((await stub.status()).demoAutomationAvailable).toBe(false);
  expect(await errorFrom(stub,x=>x.setDemoAutomation(true))).toBe('DEMO_AUTO_DISABLED');
  expect((await stub.setDemoAutomation(false)).autoEnabled).toBe(false);
  expect(await stub.isDemoAutoEnabled()).toBe(false);
  expect(calls).toEqual([]);
});

it('preflight is read-only and refuses access without a DEMO OAuth connection',async()=>{
  const stub=env.DERIV_DEMO.getByName('preflight-requires-demo');
  expect(await errorFrom(stub,x=>x.preflightDemo('UP',10))).toBe('DERIV_DEMO_REQUIRED');
  expect(await errorFrom(stub,x=>x.preflightDemo('DOWN',100))).toBe('DERIV_DEMO_REQUIRED');
  expect(calls).toEqual([]);
});
it('keeps demo account risk unverified until an official balance is received',async()=>{
  const stub=env.DERIV_DEMO.getByName('risk-not-authorized');
  const report=(await stub.status()).tradeReport;
  expect(report.brokerBalanceCents).toBeNull();
  expect(report.risk).toBeNull();
  expect(report.lossHalt).toBe(false);
  expect(report.quoteAcceptance).toEqual([]);
});
it('records virtual results separately by the four stakes without fabricating account balances',async()=>{
  const stub=env.DERIV_DEMO.getByName('stake-report');
  await runInDurableObject(stub,(_instance,ctx)=>{
    ctx.storage.sql.exec("INSERT INTO demo_trades(date,created_at,state,contract_id,buy_cents,payout_cents,pnl_cents) VALUES('2026-11-07',100,'SETTLED',21,10,18,8)");
    ctx.storage.sql.exec("INSERT INTO demo_trades(date,created_at,state,contract_id,buy_cents,payout_cents,pnl_cents) VALUES('2026-11-07',101,'SETTLED',22,25,0,-25)");
    ctx.storage.sql.exec("INSERT INTO demo_quote_checks(at,stake_cents,contract_type,accepted,code) VALUES(102,10,'CALL',0,'StakeTooSmall')");
  });
  const report=(await stub.status()).tradeReport;
  expect(report).toMatchObject({settled:2,wins:1,losses:1,pnlCents:-17});
  expect(report.byStake).toEqual([
    {stakeCents:10,settled:1,wins:1,netCents:8,winRatePct:100},
    {stakeCents:25,settled:1,wins:0,netCents:-25,winRatePct:0}
  ]);
  expect(report.quoteAcceptance[0]).toMatchObject({stakeCents:10,rejections:1});
  expect(report.brokerBalanceCents).toBeNull();
});
it('supports all experimental quote values without purchasing',()=>{
 for(const stakeCents of [10,25,50,100]){
   const q=demoQuoteRequest('DOWN',stakeCents);
   expect(q).toMatchObject({proposal:1,contract_type:'PUT',amount:stakeCents/100});
   expect(q).not.toHaveProperty('buy');
 }
 expect(()=>demoQuoteRequest('UP',200)).toThrow('DEMO_STAKE_INVALID');
});
