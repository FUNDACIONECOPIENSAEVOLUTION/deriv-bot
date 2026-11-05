// Integración Docker: datos sintéticos, volúmenes temporales, sin acceso a red.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,chmodSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const image=process.argv[2]||'ecopiensa-paper:test',id='paper-check-'+randomUUID();
const volumes=[id+'-data',id+'-restore'],containers=[id,id+'-restored'];
const directory=mkdtempSync(join(tmpdir(),id+'-'));
function docker(...args){return execFileSync('docker',args,{encoding:'utf8',timeout:90000,stdio:['ignore','pipe','pipe']}).trim();}
function code(container,source){return docker('exec',container,'node','--input-type=module','-e',source);}
const mount=volume=>'type=volume,source='+volume+',target=/data';
function run(container,volume){
  docker('run','-d','--name',container,'--network','none','--read-only','--tmpfs','/tmp',
    '--cap-drop','ALL','--security-opt','no-new-privileges:true','--env','PAPER_ENABLED=true',
    '--mount',mount(volume),image);
}
function status(container){
  return JSON.parse(code(container,"const r=await fetch('http://127.0.0.1:8789/api/status');if(!r.ok)throw Error('HTTP '+r.status);console.log(JSON.stringify(await r.json()));"));
}
async function ready(container){
  let error;
  for(let i=0;i<40;i++){
    try{return status(container);}catch(e){error=e;await delay(250);}
  }
  throw error;
}
const fixture=[
  "import {Store} from './runtime/store.mjs';",
  "import {readConfig,onTick} from './runtime/core.mjs';",
  "const epoch=Math.floor(Date.now()/1000),config=readConfig({PAPER_ENABLED:'true'});",
  "const store=new Store('/data/paper.sqlite',config,epoch);",
  "try {",
  "const state=store.load();",
  "state.position={id:'container-synthetic-fixture',symbol:'R_100',direction:1,entryEpoch:epoch-20,entryQuote:100,ticksHeld:19,stakeCents:10,payoutPct:80,costCents:0};",
  "state.daily.opened=1;",
  "store.commit(state,[{type:'paper_opened',epoch:epoch-20,trade:{...state.position,status:'OPEN'}}]);",
  "const tick={symbol:'R_100',quote:101,epoch};",
  "const result=onTick(state,config,tick,{nowEpoch:epoch});",
  "store.commit(result.state,result.events,tick);",
  "}finally{store.close();}"
].join('\n');
function retained(s){
  assert.equal(s.mode,'PAPER');assert.equal(s.balanceCents,1008);
  assert.equal(s.acceptedTicks,1);assert.equal(s.completed,1);assert.equal(s.wins,1);
  assert.equal(s.trades[0].id,'container-synthetic-fixture');
  assert.equal(s.trades[0].status,'CLOSED');assert.equal(s.trades[0].pnlCents,8);
}
try {
  for(const volume of volumes)docker('volume','create',volume);
  run(containers[0],volumes[0]);
  const initial=await ready(containers[0]);
  assert.equal(initial.balanceCents,1000);assert.equal(initial.config.enabled,true);
  const inspect=JSON.parse(docker('inspect',containers[0]))[0];
  assert.equal(inspect.Config.User,'node');assert.equal(inspect.HostConfig.ReadonlyRootfs,true);
  assert.equal(inspect.HostConfig.NetworkMode,'none');assert.deepEqual(inspect.HostConfig.CapDrop,['ALL']);
  assert.equal(code(containers[0],"console.log((await fetch('http://127.0.0.1:8789/api/status',{method:'POST'})).status)"),'405');
  docker('stop','--time','15',containers[0]);
  docker('run','--rm','--network','none','--env','PAPER_ENABLED=true','--mount',mount(volumes[0]),
    '--entrypoint','node',image,'--input-type=module','-e',fixture);
  docker('start',containers[0]);retained(await ready(containers[0]));
  assert.match(code(containers[0],"console.log(await (await fetch('http://127.0.0.1:8789/api/trades.csv')).text())"),/container-synthetic-fixture/);
  const backupOutput=docker('exec',containers[0],'node','runtime/backup.mjs');
  const backupPath=backupOutput.split('Copia SQLite consistente: ')[1];
  assert.ok(backupPath?.startsWith('/data/backups/paper-')&&backupPath.endsWith('.sqlite'));
  docker('cp',containers[0]+':'+backupPath,join(directory,'paper.sqlite'));
  chmodSync(directory,0o755);chmodSync(join(directory,'paper.sqlite'),0o644);
  docker('run','--rm','--network','none','--mount',mount(volumes[1]),
    '--mount','type=bind,source='+directory+',target=/snapshot,readonly','--entrypoint','node',image,
    '--input-type=module','-e',"import {copyFileSync} from 'node:fs';copyFileSync('/snapshot/paper.sqlite','/data/paper.sqlite');");
  run(containers[1],volumes[1]);retained(await ready(containers[1]));
  assert.equal(code(containers[1],"import {DatabaseSync} from 'node:sqlite';const d=new DatabaseSync('/data/paper.sqlite',{readOnly:true});console.log(d.prepare('PRAGMA integrity_check').get().integrity_check);d.close();"),'ok');
  console.log(JSON.stringify({result:'PASS',architecture:code(containers[1],"console.log(process.arch)"),
    syntheticData:true,network:'none',checks:['non-root','read-only-filesystem','HTTP-read-only',
      'restart-retains-state','CSV','online-backup','restore-to-new-volume','SQLite-integrity'],
    note:'Comprueba instalación y recuperación; no mide rentabilidad ni disponibilidad de Oracle.'}));
}catch(error){
  for(const container of containers){try{console.error(docker('logs','--tail','30',container));}catch{}}
  throw error;
}finally{
  // Únicamente los recursos con nombres únicos creados por este ensayo.
  for(const container of containers){try{docker('rm','-f',container);}catch{}}
  for(const volume of volumes){try{docker('volume','rm',volume);}catch{}}
  rmSync(join(directory,'paper.sqlite'),{force:true});rmdirSync(directory);
}
