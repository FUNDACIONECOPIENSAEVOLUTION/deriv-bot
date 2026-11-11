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
  assert.ok(result.d.ignoredTradingSymbols.includes('R_20'));
  assert.ok(result.d.ignoredTradingSymbols.includes('1HZ90V'));
  assert.ok(!details.markets.some(x=>['R_20','1HZ90V'].includes(x.symbol)));
  const symbolAudit=await (await fetch(base+'/api/market/selection-audit')).json();
  assert.equal(symbolAudit.readOnly,true);
  assert.equal(symbolAudit.realEnabled,false);
  assert.ok(symbolAudit.excludedAdvertisedSymbols.includes('R_20'));
  assert.ok(symbolAudit.excludedAdvertisedSymbols.includes('1HZ90V'));
  assert.ok(symbolAudit.subscribedSymbols.every(x=>
   symbolAudit.authorizedUniverse.includes(x)));
  assert.ok(symbolAudit.rows.every(x=>x.models.every(m=>
   [5,10].includes(m.durationTicks)&&m.quotedProfitabilityVerified===false)));
  assert.equal(symbolAudit.historyResets,1);
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
  const lab=await (await fetch(base+'/api/lab/bots')).json();
  assert.equal(lab.readOnly,true);
  assert.equal(lab.bots.length,4);
  assert.equal(lab.plannedTotalUsd,400);
  assert.equal(lab.budgetsEnforced,false);
  assert.equal(lab.parallelBuyEnabled,false);
  assert.equal(lab.bots[3].status,'SEPARATE_MT5_DEMO_REQUIRED');
  assert.equal(lab.bots[0].autonomousTradingEnabled,false);
  const horizons=await (await fetch(base+'/api/lab/horizons')).json();
  assert.equal(horizons.readOnly,true);
  assert.equal(horizons.realEnabled,false);
  assert.equal(horizons.canIssueOrders,false);
  assert.deepEqual(horizons.groups.map(x=>x.key),
   ['TICK_5','TICK_10','UNLABELED','OTHER']);
  assert.equal(horizons.groups[0].settled,0);
  assert.equal(horizons.groups[1].settled,0);
  const unified=await (await fetch(base+'/api/lab/multibot-program')).json();
  assert.equal(unified.realEnabled,false);
  assert.equal(unified.maxPerBot,100);
  assert.equal(unified.bots[0].state,'NOT_STARTED');
  assert.equal(unified.bots[2].tradeEnabledWhenAuthorized,false);
  const denied=await fetch(base+'/api/lab/multibot-program/start',{
   method:'POST',headers:{Origin:'http://localhost:'+port,'X-Ecopiensa-Local':'1',
    'Content-Type':'application/json'},
   body:JSON.stringify({confirmation:'INCORRECTA'})
  });
  assert.equal(denied.ok,false);
  assert.equal((await denied.json()).error,'MULTIBOT_LOCAL_APPROVAL_REQUIRED');
  const deniedNoAccount=await fetch(base+'/api/lab/multibot-program/start',{
   method:'POST',headers:{Origin:'http://localhost:'+port,'X-Ecopiensa-Local':'1',
    'Content-Type':'application/json'},
   body:JSON.stringify({confirmation:'AUTORIZAR MULTIBOT DEMO 10X10 A Y SOMBRA B'})
  });
  assert.equal(deniedNoAccount.ok,false);
  assert.equal((await deniedNoAccount.json()).error,'DEMO_OPTIONS_ACCOUNT_REQUIRED');
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
