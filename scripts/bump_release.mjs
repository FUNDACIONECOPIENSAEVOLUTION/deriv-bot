#!/usr/bin/env node
/**
 * GitHub/Cloudflare shared release clock.
 * Advances exactly one tenth per code-publication run, never per page view.
 * Uses last release.json commit as baseline so duplicate/empty runs are ignored.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

export function nextVersion(version){
  const m=/^(0|[1-9][0-9]*)\.([0-9])$/.exec(version);
  if(!m)throw new Error('Version must have exactly one decimal digit (e.g. 1.5)');
  const n=Number(m[1])*10+Number(m[2])+1;
  if(!Number.isSafeInteger(n))throw new Error('Version exceeds safe integer');
  return String(Math.floor(n/10))+'.'+String(n%10);
}
function sh(...args){
  return execFileSync('git',args,{encoding:'utf8'}).trim();
}
const verify=process.argv.includes('--verify');
if(verify){
  const expected=[['1.5','1.6'],['1.8','1.9'],['1.9','2.0'],['2.9','3.0'],['9.9','10.0']];
  for(const [a,b] of expected)if(nextVersion(a)!==b)throw Error('Version increment mismatch: '+a);
  const data=JSON.parse(readFileSync('release.json','utf8'));
  if(!/^\d+\.[0-9]$/.test(data.version)||!Array.isArray(data.changes))
    throw Error('Invalid release.json');
  console.log('Versioning rule verified at v'+data.version);
  process.exit(0);
}
const release=JSON.parse(readFileSync('release.json','utf8'));
const base=sh('log','-1','--format=%H','--','release.json');
if(!base)throw Error('Initial release commit is missing');
const recent=sh('log','--no-merges','--format=%s',base+'..HEAD')
  .split('\n').map(x=>x.trim()).filter(Boolean);
if(!recent.length){
  console.log('No new commits since last release; version unchanged');
  process.exit(0);
}
const sanitize=x=>x.replace(/[\r\n\x00-\x1f<>#\[\]{}]/g,' ').replace(/\s+/g,' ').slice(0,180);
const changes=recent.filter(x=>!/^\[auto-version\]/i.test(x))
  .map(sanitize).filter(Boolean).slice(0,12);
if(!changes.length){
  console.log('No versionable modifications; version unchanged');
  process.exit(0);
}
const previous=release.version;
const version=nextVersion(previous);
const stamp=new Date().toISOString();
const sourceCommit=sh('rev-parse','HEAD');
release.version=version;
release.updatedAt=stamp;
release.summary=changes[0];
release.changes=changes;
release.sourceCommit=sourceCommit;
writeFileSync('release.json',JSON.stringify(release,null,2)+'\n');
const pkg=JSON.parse(readFileSync('package.json','utf8'));
pkg.version=version+'.0';
writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
const path='docs/HISTORIAL_VERSIONES.md';
const old=readFileSync(path,'utf8');
const ix=old.indexOf('\n## v');
if(ix<0)throw Error('Changelog missing initial version section');
const entry='\n## v'+version+' — '+stamp.slice(0,10)+'\n\n'+
  '- **Actualizado:** '+stamp+' (UTC).\n'+
  '- **Commit de origen:** `'+sourceCommit.slice(0,12)+'`.\n'+
  changes.map(x=>'- '+x).join('\n')+'\n';
writeFileSync(path,old.slice(0,ix)+'\n'+entry+old.slice(ix));
console.log('Release v'+previous+' -> v'+version+'; '+changes.length+' recorded changes');
