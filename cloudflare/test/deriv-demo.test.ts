import { env } from 'cloudflare:workers';
import { abortAllDurableObjects, reset, runInDurableObject, evictDurableObject, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { setupNetwork } from '@msw/cloudflare';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, afterAll, expect, it } from 'vitest';
import worker from '../src/index';
import { selectDemo } from '../src/deriv-demo';

const token='test-only-token-with-at-least-32-characters';
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json','X-Paper-Control':'1'};
const demo={account_id:'DOT12345',account_type:'demo',currency:'USD',status:'active',balance:10000};
const real={account_id:'REAL12345',account_type:'real',currency:'USD',status:'active',balance:77.92};
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
  http.all('*',()=>{throw Error('UNEXPECTED_DEMO_NETWORK_REQUEST');})
);});
afterAll(()=>network.disable());
afterEach(async()=>{onlyReal=false;calls=[];await abortAllDurableObjects();await reset();});
async function request(path:string,init:RequestInit={}){
  const ctx=createExecutionContext();const r=await worker.fetch(new Request('https://paper.example'+path,init),env,ctx);
  const body=await r.text();await waitOnExecutionContext(ctx);return {r,body};
}

it('selects only active USD demo accounts and refuses real, inactive and malformed accounts',()=>{
  expect(selectDemo({data:[real,demo]})).toEqual({account_id:'DOT12345',account_type:'demo',currency:'USD',balance:10000});
  for(const data of [[real],[{...demo,account_type:undefined}],[{...demo,status:'inactive'}],[{...demo,currency:'EUR'}],[{...demo,balance:-1}]])expect(()=>selectDemo({data})).toThrow('DERIV_DEMO_USD_REQUIRED');
  expect(()=>selectDemo({data:[demo]},'another-account')).toThrow('DERIV_DEMO_USD_REQUIRED');
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
  await expect(stub.complete(start.state,'fixture-code')).rejects.toThrow('DERIV_OAUTH_STATE_INVALID');
  await evictDurableObject(stub);expect((await stub.status()).connected).toBe(true);
  expect((await stub.refresh()).account?.type).toBe('demo');expect(calls).toEqual(['token','accounts','accounts']);
});
it('rejects a real-only authorization without storing a connected balance',async()=>{
  onlyReal=true;const stub=env.DERIV_DEMO.getByName('demo-real');const start=await stub.begin('app-123','https://paper.example');
  await expect(stub.complete(start.state,'fixture-code')).rejects.toThrow('DERIV_DEMO_USD_REQUIRED');
  expect((await stub.status()).connected).toBe(false);expect((await stub.status()).account).toBeNull();
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
  await expect(stub.begin('app-123','http://paper.example')).rejects.toThrow('DERIV_INVALID_ORIGIN');
  const first=await stub.begin('app-123','https://paper.example');await stub.begin('app-123','https://paper.example');
  await expect(stub.complete(first.state,'fixture-code')).rejects.toThrow('DERIV_OAUTH_STATE_INVALID');expect(calls).toEqual([]);
});
