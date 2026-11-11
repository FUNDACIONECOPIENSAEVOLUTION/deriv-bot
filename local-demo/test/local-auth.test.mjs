import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';

const home=new URL('../',import.meta.url);
const file=new URL('../server.mjs',import.meta.url);
async function boot(fn){
 const data=mkdtempSync(join(tmpdir(),'ecopiensa-test-'));
 const port=18400+Math.floor(Math.random()*2000);
 // URL.pathname is not a valid filesystem path on Windows (it starts with /C:/).
 const child=spawn(process.execPath,[fileURLToPath(file)],{
  env:{...process.env,PORT:String(port),ECOPIENSA_DATA_DIR:data,ECOPIENSA_NO_MARKET:'1'},
  stdio:'pipe'
 });
 // The listener is IPv4-only; the OAuth redirect still uses localhost.
 const base=`http://127.0.0.1:${port}`;
 const originBase=`http://localhost:${port}`;
 let stderr='';
 child.stderr.on('data',part=>{stderr=(stderr+String(part)).slice(-4096);});
 try{
  let ok=false;
  for(let i=0;i<100;i++){
   try{const r=await fetch(base+'/api/health');if(r.ok){ok=true;break;}}catch{}
   if(child.exitCode!==null)break;
   await pause(100);
  }
  assert.ok(ok,`server must start without Cloudflare or PAT network requests; exit=${child.exitCode}; stderr=${stderr}`);
  await fn({base,originBase,data,child});
 }finally{
  child.kill();
  if(child.exitCode===null)await Promise.race([
   new Promise(resolve=>child.once('exit',resolve)),pause(3000)
  ]);
  rmSync(data,{recursive:true,force:true,maxRetries:20,retryDelay:100});
 }
}
test('OAuth link is official PKCE URL while panel remains local',async()=>boot(async({base,originBase,child})=>{
 const p=await fetch(base+'/api/auth/start',{method:'POST',headers:{'Content-Type':'application/json','X-Ecopiensa-Local':'1',Origin:originBase},body:JSON.stringify({appId:'12345'})});
 assert.equal(p.status,200);
 const d=await p.json(),u=new URL(d.redirectUrl);
 assert.equal(u.origin,'https://auth.deriv.com');
 assert.equal(u.pathname,'/oauth2/auth');
 assert.equal(u.searchParams.get('redirect_uri'),originBase+'/api/oauth/callback');
 assert.equal(u.searchParams.get('code_challenge_method'),'S256');
 assert.equal(u.searchParams.get('response_type'),'code');
 assert.ok(u.searchParams.get('state')?.length>=32);
 assert.ok(u.searchParams.get('code_challenge')?.length>=32);
 const page=await (await fetch(base+'/')).text();
 assert.match(page,/conectar con PAT/i);
 assert.equal(child.exitCode,null,'server must stay alive after OAuth is initiated');
 assert.equal((await (await fetch(base+'/api/status')).json()).connected,false);
}));
test('Reject invalid PAT without storing authorization; preserve data directory',async()=>boot(async({base,originBase,data})=>{
 const p=await fetch(base+'/api/auth/pat',{method:'POST',headers:{'Content-Type':'application/json','X-Ecopiensa-Local':'1',Origin:originBase},body:JSON.stringify({appId:'12345',patToken:'invalid'})});
 assert.equal(p.status,400);
 assert.equal((await p.json()).error,'TOKEN_PAT_INVALIDO');
 assert.equal((await (await fetch(base+'/api/status')).json()).connected,false);
 assert.equal((await (await fetch(base+'/api/health')).json()).readOnly,true);
 assert.match(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),/window\.open\('about:blank','_blank'\)/);
}));

test('Update button is visible; tests never start a real Windows updater',async()=>boot(async({base,originBase})=>{
 const page=await (await fetch(base+'/')).text();
 assert.match(page,/id="update-now"/);
 // On Windows this endpoint would launch the real scheduled updater.
 // The test must never trigger it on the user's PC or a CI runner.
 if(process.platform!=='win32'){
  const r=await fetch(base+'/api/system/update-now',{method:'POST',
   headers:{'Content-Type':'application/json','X-Ecopiensa-Local':'1',Origin:originBase},body:'{}'});
  assert.equal(r.status,400);
  assert.equal((await r.json()).error,'UPDATE_ONLY_WINDOWS');
 }
 const health=await (await fetch(base+'/api/health')).json();
 assert.equal(health.realEnabled,undefined);
 assert.equal(health.safeToUpdate,true);
}));
test('Local and GitHub pc-local version displayed without sending an order',async()=>boot(async({base,data})=>{
 const m=JSON.parse(readFileSync(new URL('../local-release.json',import.meta.url),'utf8'));
 const html=await (await fetch(base+'/')).text();
 assert.match(html,/id="version-title"/); // La versión se carga dinámicamente desde /api/status.
 assert.match(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),/loadedVersion/);
 const state=await (await fetch(base+'/api/status')).json();
 assert.equal(state.version,'v'+m.version);
 assert.equal(state.buyEnabled,false);
 assert.equal(state.realEnabled,false);
 assert.equal(state.githubVersion,null);
}));

// La simulación de arranque nunca necesita tokens ni acceso a mercados externos.
test('Market watchlist and new UI remain read-only without any public connection',async()=>boot(async({base})=>{
 const markets=await (await fetch(base+'/api/markets')).json();
 assert.ok(markets.markets.length>=9, 'offline placeholder symbols; live catalogue is discovered from Deriv');
 assert.ok(markets.markets.every(x=>x.direction==='ESPERAR'));
 const external=await (await fetch(base+'/api/watchlist')).json();
 assert.equal(external.assets.length,6);
 assert.ok(external.assets.some(x=>x.name==='Plata (XAG/USD)'&&x.tradableFromThisPanel===false));
 assert.equal(external.realEnabled,false);
 assert.ok(external.assets.every(x=>x.tradableFromThisPanel===false));
 const html=await (await fetch(base+'/')).text();
 assert.match(html,/id="burst-concurrency"/);
 assert.match(html,/id="market-analysis"/);
 assert.match(html,/id="watchlist"/);
}));

test('Piloto multindice exige consentimiento local, demo conectada y no puede ejecutar REAL',async()=>boot(async({base,originBase})=>{
 const initial=await (await fetch(base+'/api/lab/multiindex-micro')).json();
 assert.equal(initial.realEnabled,false);
 assert.equal(initial.running,false);
 assert.equal(initial.stakeCents,10);
 assert.equal(initial.maximumNominalCents,200);
 assert.equal(initial.brokerOrders,0);
 const wrong=await fetch(base+'/api/lab/multiindex-micro/start',{
  method:'POST',headers:{Origin:originBase,'X-Ecopiensa-Local':'1','Content-Type':'application/json'},
  body:JSON.stringify({confirmation:'COMPRAR REAL'})});
 assert.equal(wrong.status,400);
 assert.equal((await wrong.json()).error,'MICRO_OWNER_APPROVAL_REQUIRED');
 const noDemo=await fetch(base+'/api/lab/multiindex-micro/start',{
  method:'POST',headers:{Origin:originBase,'X-Ecopiensa-Local':'1','Content-Type':'application/json'},
  body:JSON.stringify({confirmation:'AUTORIZAR DEMO MULTIINDICE 0.10 MAXIMO 2 USD'})});
 assert.equal(noDemo.status,400);
 assert.equal((await noDemo.json()).error,'DEMO_OPTIONS_ACCOUNT_REQUIRED');
 const again=await (await fetch(base+'/api/lab/multiindex-micro')).json();
 assert.equal(again.brokerOrders,0);
 assert.equal(again.running,false);
 const html=await (await fetch(base+'/')).text();
 assert.match(html,/id="micro-multiindex-start"/);
 assert.match(html,/id="micro-multiindex-consent"/);
}));
