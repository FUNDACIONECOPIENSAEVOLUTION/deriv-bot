import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';

test('New underlying_symbol response produces 60 candles and prices in local API',async()=>{
 const cwd=fileURLToPath(new URL('../',import.meta.url));
 const server=fileURLToPath(new URL('../server.mjs',import.meta.url));
 // --import needs file:// URL on Windows, not D:\\filesystem path.
 const mock=new URL('./mock-public-websocket.mjs',import.meta.url).href;
 const data=mkdtempSync(join(tmpdir(),'ecopiensa-test-feed-'));
 const port=22000+Math.floor(Math.random()*3000);
 const child=spawn(process.execPath,['--import',mock,server],{
  env:{...process.env,PORT:String(port),ECOPIENSA_DATA_DIR:data,ECOPIENSA_NO_MARKET:'0'},
  stdio:'pipe',cwd});
 let stderr='';child.stderr.on('data',part=>{stderr=(stderr+String(part)).slice(-4000);});
 const base='http://127.0.0.1:'+port;
 try{
  let result=null,details=null;
  for(let i=0;i<95;i++){
   if(child.exitCode!==null)break;
   try{
    const d=await (await fetch(base+'/api/market/diagnostic')).json();
    const markets=await (await fetch(base+'/api/markets')).json();
    const m=markets.markets.find(x=>x.symbol==='R_100');
    if(d.connected&&d.activeMarkets>=2&&d.ticksReceived>=2&&m?.candleCount===60){
     result={d,m};details=markets;break;
    }
   }catch{}
   await pause(100);
  }
  assert.ok(result, 'Market must load mocked official response. '+stderr);
  assert.ok(result.d.symbolsReceived>=3);
  assert.ok(result.d.historyLoaded>=1);
  assert.equal(result.d.realEnabled,false);
  assert.equal(result.m.available,true);
  assert.equal(result.m.ready,true);
  assert.equal(result.m.candles.length,60);
  assert.ok(Number.isFinite(result.m.quote)&&result.m.quote>0);
  assert.equal(details.connected,true);
  const external=await (await fetch(base+'/api/watchlist')).json();
  assert.ok(external.assets.some(x=>x.name==='EUR/USD'&&x.available));
  const status=await (await fetch(base+'/api/status')).json();
  assert.equal(status.realEnabled,false);
  assert.equal(status.buyEnabled,false);
  const digits=await (await fetch(base+'/api/learning/digits')).json();
  assert.equal(digits.readOnly,true);
  assert.equal(digits.affectsBuy,false);
  assert.equal(digits.brokerOrders,0);
  assert.equal(digits.netProfitAvailable,false);
  assert.ok(digits.ticksObserved>=1);
 }finally{
  child.kill();
  if(child.exitCode===null)await Promise.race([
   new Promise(resolve=>child.once('exit',resolve)),pause(2000)
  ]);
  rmSync(data,{recursive:true,force:true,maxRetries:12,retryDelay:100});
 }
});
