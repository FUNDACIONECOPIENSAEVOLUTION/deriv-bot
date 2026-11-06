import test from 'node:test';
import assert from 'node:assert/strict';
import {probePublicFeed} from '../scripts/probe_deriv_public.mjs';
import {PUBLIC_ENDPOINT} from '../runtime/feed.mjs';

const epoch=1793901600;
function fixture({mode='ok'}={}) {
  const sent=[],sockets=[];
  class Socket extends EventTarget {
    constructor(url) {
      super();assert.equal(url,PUBLIC_ENDPOINT);this.readyState=0;sockets.push(this);
      queueMicrotask(()=>{
        if(this.readyState===3)return;
        if(mode==='network'){this.dispatchEvent(new Event('error'));return;}
        this.readyState=1;this.dispatchEvent(new Event('open'));
      });
    }
    message(data){if(this.readyState===1)this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(data)}));}
    send(raw) {
      const request=JSON.parse(raw);sent.push(request);
      assert.ok(Object.keys(request).every(key=>['ticks_history','ticks','count','end','style','req_id','subscribe','ping'].includes(key)));
      if(request.ticks_history)queueMicrotask(()=>{
        const end=mode==='stale'?epoch-1000:epoch;
        this.message({msg_type:'history',req_id:mode==='identity'?999:request.req_id,
          echo_req:{ticks_history:'R_100'},history:{
            prices:Array.from({length:150},(_,i)=>100+i/1000),
            times:Array.from({length:150},(_,i)=>end-(149-i)*2)}});
      });
      if(request.ticks&&mode!=='history-only')queueMicrotask(()=>{
        for(let i=0;i<3;i++)this.message({msg_type:'tick',
          tick:{symbol:'R_100',quote:100+i/100,epoch:mode==='bad-tick'&&i===1?epoch-40:epoch}});
      });
    }
    close(){this.readyState=3;this.dispatchEvent(new Event('close'));}
  }
  return {sent,sockets,socketFactory:url=>new Socket(url)};
}
test('requires validated history plus three fresh streamed ticks and closes the connection',async()=>{
  const f=fixture();
  const result=await probePublicFeed({socketFactory:f.socketFactory,now:()=>epoch*1000});
  assert.equal(result.status,'OK');
  assert.equal(result.history_ticks,150);assert.equal(result.live_ticks,3);
  assert.equal(f.sockets.length,1);assert.equal(f.sockets[0].readyState,3);
  assert.deepEqual(f.sent.map(x=>Object.hasOwn(x,'ticks_history')?'history':'ticks'),['history','ticks']);
});
test('history alone cannot report a successful Deriv integration',async()=>{
  const f=fixture({mode:'history-only'});
  const result=await probePublicFeed({socketFactory:f.socketFactory,now:()=>epoch*1000,timeoutMs:20});
  assert.equal(result.status,'FAIL');assert.equal(result.code,'PUBLIC_WS_TIMEOUT');
  assert.equal(result.history_ticks,150);assert.equal(result.live_ticks,0);
  assert.equal(f.sockets[0].readyState,3);
});
for(const [mode,code] of [['network','NETWORK_ERROR'],['stale','INVALID_OR_STALE_HISTORY'],['identity','HISTORY_IDENTITY_MISMATCH'],['bad-tick','INVALID_OR_STALE_TICK']]) {
  test('rejects '+mode+' and releases the socket',async()=>{
    const f=fixture({mode});
    const result=await probePublicFeed({socketFactory:f.socketFactory,now:()=>epoch*1000});
    assert.equal(result.status,'FAIL');assert.equal(result.code,code);
    assert.equal(f.sockets[0].readyState,3);
  });
}
test('bounds timeout and sample configuration before opening a connection',()=>{
  assert.throws(()=>probePublicFeed({sampleTicks:0}));
  assert.throws(()=>probePublicFeed({sampleTicks:100}));
  assert.throws(()=>probePublicFeed({timeoutMs:0}));
});
