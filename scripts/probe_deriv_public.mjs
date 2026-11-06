/**
 * Exercise the actual public-only feed: validated history AND fresh live ticks.
 * No account tokens, balances, proposals, purchases, or withdrawals.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PublicFeed} from '../runtime/feed.mjs';

export function probePublicFeed({socketFactory,now=()=>Date.now(),timeoutMs=20000,sampleTicks=3}={}) {
  if(!Number.isInteger(sampleTicks)||sampleTicks<1||sampleTicks>10)throw Error('Invalid sample size');
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw Error('Invalid probe timeout');
  const started=now();
  return new Promise(resolveResult=>{
    let settled=false,historyTicks=0,liveTicks=0,lastEpoch=null;
    let feed;
    const finish=(ok,code)=>{
      if(settled)return;
      settled=true;clearTimeout(timer);
      const result={status:ok?'OK':'FAIL',code,source:'Deriv Options public WebSocket',
        symbol:'R_100',history_ticks:historyTicks,live_ticks:liveTicks,
        last_epoch:lastEpoch,elapsed_ms:Math.max(0,now()-started)};
      // start() may still be setting up its watchdog when a synchronous
      // connection failure occurs. Stop after start has returned.
      queueMicrotask(()=>{feed?.stop();resolveResult(result);});
    };
    const timer=setTimeout(()=>finish(false,'PUBLIC_WS_TIMEOUT'),timeoutMs);
    feed=new PublicFeed({
      symbol:'R_100',socketFactory,now,
      onHistory:prices=>{historyTicks=prices.length;},
      onTick:tick=>{
        liveTicks++;lastEpoch=tick.epoch;
        if(historyTicks===150&&liveTicks>=sampleTicks)finish(true,'PUBLIC_HISTORY_AND_LIVE_TICKS_VALIDATED');
      },
      onStatus:status=>{
        if(status.state==='disconnected')finish(false,status.code||'PUBLIC_WS_DISCONNECTED');
      },
    });
    try{feed.start();}catch{finish(false,'PUBLIC_WS_CLIENT_ERROR');}
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const result=await probePublicFeed();
  console.log(JSON.stringify(result));
  process.exitCode=result.status==='OK'?0:1;
}
