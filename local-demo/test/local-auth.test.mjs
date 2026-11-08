import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';

const home=new URL('../',import.meta.url);
const file=new URL('../server.mjs',import.meta.url);
async function boot(fn){
 const data=mkdtempSync(join(tmpdir(),'ecopiensa-test-'));
 const port=18400+Math.floor(Math.random()*2000);
 const child=spawn(process.execPath,[file.pathname],{
  env:{...process.env,PORT:String(port),ECOPIENSA_DATA_DIR:data,ECOPIENSA_NO_MARKET:'1'},
  stdio:'pipe'
 });
 const base=`http://localhost:${port}`;
 try{
  let ok=false;
  for(let i=0;i<60;i++){
   try{const r=await fetch(base+'/api/health');if(r.ok){ok=true;break;}}catch{}
   if(child.exitCode!==null)break;
   await pause(100);
  }
  assert.ok(ok,'server must start without Cloudflare or PAT network requests');
  await fn({base,data,child});
 }finally{
  child.kill();
  rmSync(data,{recursive:true,force:true});
 }
}
test('OAuth link is official PKCE URL while panel remains local',async()=>boot(async({base,child})=>{
 const p=await fetch(base+'/api/auth/start',{method:'POST',headers:{'Content-Type':'application/json','X-Ecopiensa-Local':'1',Origin:base},body:JSON.stringify({appId:'12345'})});
 assert.equal(p.status,200);
 const d=await p.json(),u=new URL(d.redirectUrl);
 assert.equal(u.origin,'https://auth.deriv.com');
 assert.equal(u.pathname,'/oauth2/auth');
 assert.equal(u.searchParams.get('redirect_uri'),base+'/api/oauth/callback');
 assert.equal(u.searchParams.get('code_challenge_method'),'S256');
 assert.equal(u.searchParams.get('response_type'),'code');
 assert.ok(u.searchParams.get('state')?.length>=32);
 assert.ok(u.searchParams.get('code_challenge')?.length>=32);
 const page=await (await fetch(base+'/')).text();
 assert.match(page,/conectar con PAT/i);
 assert.equal(child.exitCode,null,'server must stay alive after OAuth is initiated');
 assert.equal((await (await fetch(base+'/api/status')).json()).connected,false);
}));
test('Reject invalid PAT without storing authorization; preserve data directory',async()=>boot(async({base,data})=>{
 const p=await fetch(base+'/api/auth/pat',{method:'POST',headers:{'Content-Type':'application/json','X-Ecopiensa-Local':'1',Origin:base},body:JSON.stringify({appId:'12345',patToken:'invalid'})});
 assert.equal(p.status,400);
 assert.equal((await p.json()).error,'TOKEN_PAT_INVALIDO');
 assert.equal((await (await fetch(base+'/api/status')).json()).connected,false);
 assert.equal((await (await fetch(base+'/api/health')).json()).readOnly,true);
 assert.match(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),/window\.open\('about:blank','_blank'\)/);
}));

test('Local and GitHub pc-local version displayed without sending an order',async()=>boot(async({base,data})=>{
 const m=JSON.parse(readFileSync(new URL('../local-release.json',import.meta.url),'utf8'));
 const html=await (await fetch(base+'/')).text();
 assert.match(html,new RegExp('v'+m.version.replace('.','\\.')));
 const state=await (await fetch(base+'/api/status')).json();
 assert.equal(state.version,'v'+m.version);
 assert.equal(state.buyEnabled,false);
 assert.equal(state.realEnabled,false);
 assert.equal(state.githubVersion,null);
}));
