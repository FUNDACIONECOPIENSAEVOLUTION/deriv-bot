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


it('keeps the DEMO proposal fixed at USD 1 for CALL R_100 at 5 ticks and never sends buy',()=>{
  expect(DEMO_QUOTE_REQUEST).toEqual({proposal:1,amount:1,basis:'stake',contract_type:'CALL',
    currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_100',req_id:1});
  expect(JSON.stringify(DEMO_QUOTE_REQUEST)).not.toContain('"buy"');
  expect(JSON.stringify(DEMO_QUOTE_REQUEST)).not.toContain('"sell"');
});
it('parses only valid broker quotes, omits the actionable proposal id and never increases rejected stakes',()=>{
  const accepted=parseDemoQuote({msg_type:'proposal',req_id:1,
    proposal:{id:'do-not-expose-this-id',ask_price:'1.00',payout:1.80}});
  expect(accepted).toMatchObject({accepted:true,stake:1,durationTicks:5,askPrice:1,payout:1.80,potentialProfit:0.80});
  expect(JSON.stringify(accepted)).not.toContain('do-not-expose-this-id');
  const denied=parseDemoQuote({msg_type:'proposal',req_id:1,error:{code:'ContractTooSmall',message:'Raise amount'}});
  expect(denied).toEqual({accepted:false,code:'ContractTooSmall',stake:1,durationTicks:5,symbol:'R_100',contractType:'CALL'});
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
it('keeps public contracts diagnostic behind private owner authentication and strict POST control',async()=>{
  expect((await request('/api/deriv/market-check')).r.status).toBe(401);
  expect((await request('/api/deriv/market-check',{method:'GET',headers})).r.status).toBe(404);
  expect((await request('/api/deriv/market-check',{method:'POST',headers:{
    ...headers,Origin:'https://attacker.example'
  },body:'{}'})).r.status).toBe(403);
  expect(calls).toEqual([]);
});
it('allows quote requests only to the owner and never quotes without a connected demo',async()=>{
  expect((await request('/api/deriv/quote')).r.status).toBe(401);
  expect((await request('/api/deriv/quote',{method:'GET',headers})).r.status).toBe(404);
  expect((await request('/api/deriv/quote',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'})).r.status).toBe(403);
  const isolated=env.DERIV_DEMO.getByName('quote-not-connected');
  expect(await errorFrom(isolated,instance=>instance.quote())).toBe('DERIV_DEMO_REQUIRED');
  expect(calls).toEqual([]);
});

it('accepts current 35/50/75/100-cent DEMO stakes at the HTTP boundary and rejects obsolete stakes',async()=>{
  for(const stakeCents of [35,50,75,90,100]){
    const result=await request('/api/deriv/quote',{method:'POST',headers,
      body:JSON.stringify({direction:'UP',stakeCents})});
    // No DEMO OAuth in test: reaches the broker-only guard rather than rejecting the stake.
    expect(result.r.status).not.toBe(400);
    expect(JSON.parse(result.body).error).not.toBe('Importe virtual no permitido');
  }
  for(const stakeCents of [10,25,30,200]){
    const result=await request('/api/deriv/quote',{method:'POST',headers,
      body:JSON.stringify({direction:'UP',stakeCents})});
    expect(result.r.status).toBe(400);
    expect(JSON.parse(result.body).error).toBe('Importe virtual no permitido');
  }
  expect(calls).not.toContain('buy');
});
it('permits owner-only manual DEMO after OAuth while blocking unauthenticated calls',async()=>{
  const status=await env.DERIV_DEMO.getByName('safety-state').status();
  // Miniflare intentionally leaves DEMO_BUY_ENABLED unset to test fail-closed behavior.
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
it('audits ten virtual purchases per tranche before the next of five tranches',async()=>{
  const stub=env.DERIV_DEMO.getByName('five-batches-audit');
  await runInDurableObject(stub,(_instance,ctx)=>{
    for(let i=0;i<10;i++)ctx.storage.sql.exec(
      "INSERT INTO demo_trades(date,created_at,state,contract_id,buy_cents,payout_cents,pnl_cents) VALUES('2026-11-07',?,'SETTLED',?,100,?,?)",
      100+i,1000+i,i<6?180:0,i<6?80:-100
    );
    for(let i=0;i<10;i++)ctx.storage.sql.exec(
      "INSERT INTO demo_trades(date,created_at,state,contract_id,buy_cents) VALUES('2026-11-07',?,'OPEN',?,100)",
      200+i,2000+i
    );
  });
  const report=(await stub.status()).tradeReport;
  expect(report).toMatchObject({pilotPurchases:20,pilotRemainingPurchases:30,
    pilotCommittedCents:2000,batchCount:5,batchNumber:3,
    batchSettlementPending:true,openCount:10});
  expect(report.batches[0]).toMatchObject({number:1,purchases:10,settled:10,
    wins:6,losses:4,pnlCents:80,complete:true});
  expect(report.batches[1]).toMatchObject({number:2,purchases:10,settled:0,complete:false});
  expect(report.batches[2]).toMatchObject({number:3,purchases:0,settled:0,complete:false});
  await runInDurableObject(stub,(_instance,ctx)=>{
    ctx.storage.sql.exec("UPDATE demo_trades SET state='SETTLED',pnl_cents=-100,payout_cents=0 WHERE state='OPEN'");
  });
  const reviewed=(await stub.status()).tradeReport;
  expect(reviewed.batchSettlementPending).toBe(false);
  expect(reviewed.batches[1]).toMatchObject({settled:10,pnlCents:-1000,complete:true});
  expect(reviewed.unknownCount).toBe(0);
});
it('supports all experimental quote values without purchasing',()=>{
 for(const stakeCents of [35,50,75,90,100]){
   const q=demoQuoteRequest('DOWN',stakeCents);
   expect(q).toMatchObject({proposal:1,contract_type:'PUT',amount:stakeCents/100});
   expect(q).not.toHaveProperty('buy');
 }
 expect(()=>demoQuoteRequest('UP',200)).toThrow('DEMO_STAKE_INVALID');
});

it('blocks unauthenticated browser DEMO session endpoints and invalid stakes before any OTP',async()=>{
  const anon=await request('/api/deriv/demo/browser/begin',{
    method:'POST',headers:{'Content-Type':'application/json','X-Paper-Control':'1'},body:'{}'});
  expect(anon.r.status).toBe(401);
  const obsolete=await request('/api/deriv/demo/browser/begin',{
    method:'POST',headers,body:JSON.stringify({signal:'UP',stakeCents:10})});
  expect(obsolete.r.status).toBe(400);
  const malformed=await request('/api/deriv/demo/browser/reserve',{
    method:'POST',headers,body:JSON.stringify({nonce:'invalid',signal:'UP',stakeCents:35})});
  expect(malformed.r.status).toBe(400);
  const executionOff=await request('/api/deriv/demo/browser/begin',{
    method:'POST',headers,body:JSON.stringify({signal:'UP',stakeCents:35})});
  expect(executionOff.r.status).toBe(503);
  expect(JSON.parse(executionOff.body).code).toBe('DEMO_EXECUTION_DISABLED');
  expect(calls).not.toContain('buy');
});

it('browser-reported public prices are analyzed as CALL/PUT/HOLD without connecting to a broker',async()=>{
  const stub=env.DERIV_DEMO.getByName('market-only-mcp-1');
  const now=Math.floor(Date.now()/1000);
  const prices=Array.from({length:150},(_,i)=>550+i*0.03);
  const times=Array.from({length:150},(_,i)=>now-149+i);
  const result=await stub.analyzeBrowserPrices({symbol:'R_100',prices,times});
  expect(['UP','DOWN','HOLD']).toContain(result.direction);
  expect(result.verifiedIndependently).toBe(false);
  const cached=await stub.getBrowserSignal();
  expect(cached.source).toBe('OWNER_BROWSER_REPORTED_PUBLIC_R_100');
  expect(cached.verifiedIndependently).toBe(false);
  expect(calls).not.toContain('buy');
});
it('new MCP endpoint stays closed until configured with its own secret and protects browser signal endpoint',async()=>{
  const health=await request('/api/health/mcp');
  expect(health.r.status).toBe(200);
  expect(JSON.parse(health.body).mode).toBe('MCP_STAGING_DEMO_ONLY');
  const mcp=await request('/mcp',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
  expect(mcp.r.status).toBe(503);
  expect(JSON.parse(mcp.body).code).toBe('MCP_NOT_CONFIGURED');
  const signal=await request('/api/deriv/demo/signal',{method:'POST',
    headers:{'Content-Type':'application/json','X-Paper-Control':'1'},body:'{}'});
  expect(signal.r.status).toBe(401);
  expect(calls).not.toContain('buy');
});

it('one manual US$0.90 override is accepted after fresh DEMO balance, without changing auto-rotation',async()=>{
  const stub=env.DERIV_DEMO.getByName('demo-manual-custom-90');
  const start=await stub.begin('app-123','https://paper.example');
  await stub.complete(start.state,'fixture-code');
  await stub.refresh();
  const original=await stub.status();
  expect(original.nextManualStakeCents).toBe(35);
  const selected=await stub.setNextManualStakeCents(90);
  expect(selected).toMatchObject({mode:'DEMO_MANUAL_STAKE_SET',
    stakeCents:90,scope:'ONE_MANUAL_DEMO_BUY',noBrokerOrders:true,
    automaticRotationUnchanged:true});
  const current=await stub.status();
  expect(current.nextManualStakeCents).toBe(90);
  expect(current.allowedManualStakesCents).toContain(90);
  expect(current.maxBrowserConcurrent).toBe(1);
  expect(calls).not.toContain('buy');
});
it('manual stake controls deny unsupported amounts, unauthorized access and real-account operations',async()=>{
  const unauth=await request('/api/deriv/demo/manual-stake',{method:'POST',
    headers:{'Content-Type':'application/json','X-Paper-Control':'1'},
    body:JSON.stringify({stakeCents:90})});
  expect(unauth.r.status).toBe(401);
  for(const stakeCents of [10,25,30,101,1000]){
    const forbidden=await request('/api/deriv/demo/manual-stake',{method:'POST',headers,
      body:JSON.stringify({stakeCents})});
    expect(forbidden.r.status).toBe(400);
  }
  expect(calls).not.toContain('buy');
});

it('private CSV routes never expose the DEMO ledger without owner authentication',async()=>{
 for(const path of ['/api/deriv/demo/trades.csv','/api/deriv/demo/burst.csv']){
  const denied=await request(path);
  expect(denied.r.status).toBe(401);
  const ok=await request(path,{headers});
  expect(ok.r.status).toBe(200);
  expect(ok.r.headers.get('Content-Type')).toContain('text/csv');
  expect(ok.r.headers.get('Content-Disposition')).toContain('attachment');
  expect(ok.body).toContain('"fuente"');
  expect(ok.body).not.toContain('fixture-demo-access');
 }
});
it('ten independent DEMO contracts require owner auth, cannot use 100, and never open on page load',async()=>{
 const unauthorized=await request('/api/deriv/demo/burst/status');
 expect(unauthorized.r.status).toBe(401);
 const missing=await request('/api/deriv/demo/burst/begin',{method:'POST',
  headers:{'Content-Type':'application/json','X-Paper-Control':'1'},
  body:JSON.stringify({count:10,signal:'UP'})});
 expect(missing.r.status).toBe(401);
 for(const count of [0,11,20,100]){
  const invalid=await request('/api/deriv/demo/burst/begin',{method:'POST',
   headers,body:JSON.stringify({count,signal:'UP'})});
  expect(invalid.r.status).toBe(400);
 }
 const empty=await request('/api/deriv/demo/burst/status',{headers});
 expect(empty.r.status).toBe(200);
 const state=JSON.parse(empty.body);
 expect(state).toMatchObject({status:'EMPTY',accountType:'demo',confirmed:0,brokerOrders:0});
 expect(calls).not.toContain('buy');
});
it('broker DEMO burst cannot be started without an up-to-date real bot CALL or PUT signal',async()=>{
 const stub=env.DERIV_DEMO.getByName('demo-burst-without-signal');
 const oauth=await stub.begin('app-123','https://paper.example');
 await stub.complete(oauth.state,'fixture-code');
 await stub.refresh();
 const state=await stub.status();
 expect(state.demoBurst.status).toBe('EMPTY');
 expect(state.demoBurstPlan.maxAllowedNow).toBe(10);
 expect(await errorFrom(stub,async instance=>{
  // Tests run with buying disabled by default. Enable only this local fixture.
  (instance as unknown as {env:{DEMO_BUY_ENABLED:string}}).env.DEMO_BUY_ENABLED='true';
  return instance.beginDemoBurst({count:10,signal:'UP'});
 })).toBe('DEMO_BURST_FRESH_SIGNAL_REQUIRED');
 expect((await stub.demoBurstStatus()).confirmed).toBe(0);
 expect(calls).not.toContain('buy');
});

it('records ten distinct confirmed broker DEMO contract IDs, one buy reservation per contract, and all ten settlements',async()=>{
 const stub=env.DERIV_DEMO.getByName('demo-burst-ten-confirmed-fixture');
 const oauth=await stub.begin('app-123','https://paper.example');
 await stub.complete(oauth.state,'fixture-code');
 await stub.refresh();
 const now=Math.floor(Date.now()/1000);
 await runInDurableObject(stub,(_instance,ctx)=>{
  ctx.storage.sql.exec(
   "INSERT INTO demo_connection(slot,data) VALUES(?,?)",
   'demo-browser-signal',JSON.stringify({
    direction:'UP',reason:'TREND_AND_MOMENTUM',quoteAgeSeconds:0,
    at:now,source:'OWNER_BROWSER_REPORTED_PUBLIC_R_100',
    verifiedIndependently:false,valid:true,
    indicator:{fast:551,slow:550,rsi:59,volatility:0.02}
   }));
 });
 network.use(http.post('https://api.derivws.com/trading/v1/options/accounts/DOT12345/otp',
  ()=>{calls.push('otp');return HttpResponse.json({
    data:{url:'wss://api.derivws.com/trading/v1/options/ws/demo?otp=fixture-only'}});}));
 const session=await runInDurableObject(stub,async instance=>{
  // The standalone Vitest Worker has DEMO_BUY_ENABLED unset intentionally.
  // Do not change global defaults: this fixture verifies the guarded DEMO flow only.
  (instance as unknown as {env:{DEMO_BUY_ENABLED:string}}).env.DEMO_BUY_ENABLED='true';
  return instance.beginDemoBurst({count:10,signal:'UP'});
 });
 expect(session.mode).toBe('DEMO_BROWSER_BURST');
 expect(session.accountType).toBe('demo');
 expect(session.stakeCents).toBe(100);
 expect(session.autoRetry).toBe(false);
 expect(session.wsUrl).toContain('/ws/demo?otp=');
 // An old browser-reported tick must not reserve a demo order.
 await runInDurableObject(stub,(_instance,ctx)=>{
  ctx.storage.sql.exec('UPDATE demo_connection SET data=? WHERE slot=?',
    JSON.stringify({direction:'UP',reason:'TREND_AND_MOMENTUM',
      quoteAgeSeconds:5,at:now-5,source:'OWNER_BROWSER_REPORTED_PUBLIC_R_100',
      verifiedIndependently:false,valid:true,
      indicator:{fast:551,slow:550,rsi:59,volatility:0.02}}),'demo-browser-signal');
 });
 expect(await errorFrom(stub,instance=>instance.reserveDemoBurst({
   nonce:session.nonce,proposalId:'0'.repeat(36),askPrice:1,payout:1.80
 }))).toBe('DEMO_BURST_SIGNAL_STALE_OR_REVERSED');
 expect((await stub.demoBurstStatus()).confirmed).toBe(0);
 await runInDurableObject(stub,(_instance,ctx)=>{
  ctx.storage.sql.exec('UPDATE demo_connection SET data=? WHERE slot=?',
    JSON.stringify({direction:'UP',reason:'TREND_AND_MOMENTUM',
      quoteAgeSeconds:0,at:Math.floor(Date.now()/1000),
      source:'OWNER_BROWSER_REPORTED_PUBLIC_R_100',
      verifiedIndependently:false,valid:true,
      indicator:{fast:551,slow:550,rsi:59,volatility:0.02}}),'demo-browser-signal');
 });
 // If newer market data invalidates a proposal, cancel UNSENT buy reservation.
 const unsent=await stub.reserveDemoBurst({
  nonce:session.nonce,proposalId:'9'.repeat(36),askPrice:1,payout:1.80
 });
 expect((await stub.cancelUnsentDemoBurst({nonce:session.nonce,id:unsent.id})))
  .toMatchObject({mode:'DEMO_BURST_PREBUY_CANCELLED',brokerOrders:0,confirmed:0});
 expect(await errorFrom(stub,x=>x.cancelUnsentDemoBurst({nonce:session.nonce,id:unsent.id})))
  .toBe('DEMO_PREBUY_CANCEL_NOT_ALLOWED');
 expect((await stub.status()).tradeReport.unknownCount).toBe(0);
 for(let i=0;i<10;i++){
  // Browser refreshes public ticks for EACH purchase; the fixture must as well.
  await runInDurableObject(stub,(_instance,ctx)=>{
   ctx.storage.sql.exec('UPDATE demo_connection SET data=? WHERE slot=?',
     JSON.stringify({direction:'UP',reason:'TREND_AND_MOMENTUM',
       quoteAgeSeconds:0,at:Math.floor(Date.now()/1000),
       source:'OWNER_BROWSER_REPORTED_PUBLIC_R_100',verifiedIndependently:false,
       valid:true,indicator:{fast:551,slow:550,rsi:59,volatility:0.02}}),
     'demo-browser-signal');
  });
  const reservation=await stub.reserveDemoBurst({
   nonce:session.nonce,proposalId:String(i+1).padStart(36,'0'),
   askPrice:1,payout:1.80,
   evidence:{reason:'TREND_AND_MOMENTUM',fast:551,slow:550,rsi:59,volatility:0.02}
  });
  expect(reservation).toMatchObject({mode:'DEMO_BURST_RESERVED',accountType:'demo',
    request:{price:1,req_id:2}});
  const ack=await stub.acknowledgeDemoBurst({
   nonce:session.nonce,id:reservation.id,
   timing:{preBuyAgeMs:220,reserveRttMs:140,buyAckRttMs:360},
   response:{msg_type:'buy',req_id:2,buy:{contract_id:900000+i,
     buy_price:1,purchase_time:now}}
  });
  expect(ack).toMatchObject({accepted:true,confirmed:i+1,
    contractId:900000+i,accountType:'demo'});
 }
 const status=await stub.demoBurstStatus();
 expect(status).toMatchObject({requested:10,confirmed:10,opened:10,
  settled:0,commitmentCents:1000,status:'RECONCILING'});
 expect(new Set(status.contracts?.map(x=>x.contractId)).size).toBe(10);
 const risk=(await stub.status()).tradeReport;
 expect(risk.openCount).toBe(10);
 expect(risk.activeExposureCents).toBe(1000);
 expect(risk.batchSettlementPending).toBe(true);
 expect(await errorFrom(stub,instance=>instance.beginBrowserPilot('UP',100)))
  .toBe('DEMO_BURST_ALREADY_ACTIVE');
 for(let i=0;i<10;i++){
  const row=status.contracts![i];
  const reply=await stub.settleDemoBurst({nonce:session.nonce,id:row.id,
   response:{msg_type:'proposal_open_contract',req_id:3,
    proposal_open_contract:{contract_id:row.contractId,is_sold:true,
     contract_type:'CALL',currency:'USD',underlying_symbol:'R_100',
     buy_price:1,payout:1.80,profit:0.80,entry_spot:550,exit_spot:551}}});
  expect(reply.state).toBe('SETTLED');
 }
 const final=await stub.demoBurstStatus();
 expect(final).toMatchObject({status:'COMPLETE',confirmed:10,opened:0,
  settled:10,commitmentCents:1000,realizedPnlCents:800});
 const batchCsv=await stub.exportDemoCsv('last-burst');
 expect(batchCsv.count).toBe(10);
 expect(batchCsv.csv).toContain('"DERIV_DEMO"');
 expect(batchCsv.csv).toContain('"900000"');
 expect(batchCsv.csv).toContain('"edad_senal_antes_buy_ms"');
 expect(batchCsv.csv).toContain('"latencia_reserva_ms"');
 expect(batchCsv.csv).toContain('"latencia_acuse_deriv_ms"');
 expect(batchCsv.csv).toContain('"220"');
 expect(batchCsv.csv).toContain('"360"');
 expect(batchCsv.csv).not.toContain('"PAPER"');
 expect(batchCsv.csv.split(/\r?\n/).filter(x=>x.includes('"DERIV_DEMO"')).length).toBe(10);
 const allCsv=await stub.exportDemoCsv('all');
 expect(allCsv.count).toBe(11); // ten BUYs and one canceled UNSENT attempt
 expect(allCsv.csv).toContain('"PREBUY_STALE_NOT_SENT"');
 expect(allCsv.csv).toContain('"TREND_AND_MOMENTUM"');
 expect(calls).not.toContain('buy');
});
