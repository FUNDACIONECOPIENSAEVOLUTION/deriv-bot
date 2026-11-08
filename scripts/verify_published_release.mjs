#!/usr/bin/env node
// Runs ONLY after deployment. Never claims a release is live from Git state alone.
import {readFileSync} from 'node:fs';
const {version}=JSON.parse(readFileSync(new URL('../release.json',import.meta.url),'utf8'));
if(!/^\d+\.[0-9]$/.test(version))throw Error('RELEASE_VERSION_INVALID');
const targets=[
  {name:'GitHub Pages',url:'https://fundacionecopiensaevolution.github.io/deriv-bot/release.json',
   expected:version,valid:data=>data?.version===version},
  {name:'Cloudflare DEMO',url:'https://ecopiensa-paper-10.instructor-andrade-dcc.workers.dev/api/health',
   expected:version+'.0',valid:data=>data?.status==='ok'&&data?.version===version+'.0'},
  {name:'Cloudflare PAPER/DEMO storage',url:'https://ecopiensa-paper-10.instructor-andrade-dcc.workers.dev/api/health/dependencies',
   expected:version+'.0',valid:data=>data?.version===version+'.0'&&
     data?.paper==='ready'&&data?.demo==='ready'&&data?.brokerAuthorization==='not_checked'},
];
let failures=0;
for(const target of targets){
  let seen='sin respuesta',ok=false;
  for(let attempt=1;attempt<=18;attempt++){
    try{
      const u=new URL(target.url);u.searchParams.set('release_audit',Date.now().toString());
      const response=await fetch(u,{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('HTTP_'+response.status);
      const data=await response.json();
      seen=String(data?.version??'sin versión');
      if(target.valid(data)){ok=true;break;}
    }catch(error){seen=error instanceof Error?error.message:'ERROR';}
    if(attempt<18)await new Promise(resolve=>setTimeout(resolve,5000));
  }
  if(ok)console.log('PUBLICATION_VERIFIED '+target.name+' v'+target.expected+' '+target.url);
  else{failures++;console.error('PUBLICATION_MISMATCH '+target.name+' expected='+target.expected+' got='+seen+' '+target.url);}
}
if(failures)process.exitCode=1;
