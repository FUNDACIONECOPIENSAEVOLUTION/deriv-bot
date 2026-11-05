import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {readConfig,initialState,seedHistory,onTick,invalidatePosition,entryBlock,signal,dayAt} from '../runtime/core.mjs';
import {Store} from '../runtime/store.mjs';
import {PublicFeed,PUBLIC_ENDPOINT,encodePublicRequest} from '../runtime/feed.mjs';
import {startService} from '../runtime/service.mjs';
const now=1793880000;
const config=readConfig({PAPER_ENABLED:'true',HORIZON_TICKS:'2',COOLDOWN_TICKS:'1'});
function series(){let p=100;return Array.from({length:150},(_,i)=>p+=[.02,-.01,.02,-.01,.01][i%5]);}
function sample(){return seedHistory(initialState(config,now),series());}
function position(id='test'){return {id,symbol:'R_100',direction:1,entryEpoch:now,entryQuote:100,ticksHeld:1,stakeCents:10,payoutPct:80,costCents:0};}
function temp(t){const dir=mkdtempSync(join(tmpdir(),'ecopiensa-paper-'));t.after(()=>{if(dirname(resolve(dir))!==resolve(tmpdir())||!basename(dir).startsWith('ecopiensa-paper-'))throw Error('Destino temporal inesperado');rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});});return dir;}

test('configuración PAPER por defecto: USD 10, sin simulación activada accidentalmente',()=>{
 const c=readConfig();assert.equal(c.initialCents,1000);assert.equal(c.enabled,false);assert.equal(c.stakeCents,10);
 assert.throws(()=>readConfig({TRADING_MODE:'LIVE'}));
 assert.throws(()=>readConfig({SYMBOL:'INVALID'}));
 assert.throws(()=>readConfig({DAILY_LOSS_USD:'0.05'}));
 assert.throws(()=>readConfig({STAKE_USD:'0.001'}));
});
test('fechas diarias se agrupan por Colombia',()=>{
 assert.equal(dayAt(Date.parse('2026-11-05T02:00:00Z')/1000),'2026-11-04');
 assert.equal(dayAt(Date.parse('2026-11-05T06:00:00Z')/1000),'2026-11-05');
});
test('regla técnica determinista, con abstención para serie plana',()=>{
 assert.equal(signal(Array(50).fill(100)),0);assert.equal(signal(series()),1);
});
test('bloquea entrada cuyo riesgo excedería el presupuesto diario restante',()=>{
 const s=sample();s.daily.lossCents=21;assert.equal(entryBlock(s,config,now),'DAILY_LOSS_BUDGET');
 assert.equal(onTick(s,config,{symbol:'R_100',quote:101,epoch:now},{nowEpoch:now}).state.position,null);
});
test('liquidación hipotética suma centavos exactos y respeta pérdidas máximas reservadas',()=>{
 const s=sample();s.position=position();s.daily.lossCents=20;
 const out=onTick(s,config,{symbol:'R_100',quote:99,epoch:now},{nowEpoch:now});
 assert.equal(out.state.balanceCents,990);assert.equal(out.state.daily.lossCents,30);
 assert.equal(out.events[0].trade.pnlCents,-10);assert.equal(out.state.position,null);
 assert.equal(entryBlock(out.state,config,now),'DAILY_LOSS_BUDGET');
});
test('victoria hipotética con payout 80% devuelve USD 0,08 sobre USD 0,10',()=>{
 const s=sample();s.position=position();
 const out=onTick(s,config,{symbol:'R_100',quote:101,epoch:now},{nowEpoch:now});
 assert.equal(out.state.balanceCents,1008);assert.equal(out.events[0].trade.pnlCents,8);
});
test('rechaza mercado distinto, valores negativos, antigüedad y orden temporal inverso',()=>{
 const s=sample();const tick={symbol:'R_100',quote:100,epoch:now};
 for(const x of [{...tick,symbol:'R_75'},{...tick,quote:-1},{...tick,epoch:now-31},{...tick,epoch:now+31}])assert.throws(()=>onTick(s,config,x,{nowEpoch:now}));
 s.lastEpoch=now;assert.throws(()=>onTick(s,config,{...tick,epoch:now-1},{nowEpoch:now}));
});
test('un corte registra VOID, conserva saldo y no cuenta acierto ni operación liquidada',()=>{
 const s=sample();s.position=position();const out=invalidatePosition(s,'CONNECTION_CLOSED',now);
 assert.equal(out.state.balanceCents,1000);assert.equal(out.state.position,null);assert.equal(out.state.voided,1);
 assert.equal(out.events[0].trade.status,'VOID');assert.equal(out.state.completed,0);assert.equal(out.state.prices.length,0);
});
test('protocolo público impide claves de autorización y solicitudes de compra o venta',()=>{
 assert.equal(JSON.parse(encodePublicRequest({ticks:'R_100',subscribe:1})).ticks,'R_100');
 for(const x of [{buy:'x',price:1},{sell:1},{authorize:'secret'},{ticks:'R_100',token:'secret'},{ticks:'R_100',ping:1}])assert.throws(()=>encodePublicRequest(x));
});
test('SQLite restaura estado y ticks; los parámetros no se cambian silenciosamente',t=>{
 const dir=temp(t),file=join(dir,'paper.sqlite');let store=new Store(file,config,now);
 const s=sample();s.balanceCents=987;s.position=position();store.commit(s,[{type:'paper_opened',epoch:now,trade:{...s.position,status:'OPEN'}}],{epoch:now,symbol:'R_100',quote:100});
 store.close();store=new Store(file,config,now);assert.equal(store.load().balanceCents,987);assert.equal(store.load().position.id,'test');assert.equal(store.tickCount(),1);store.close();
 assert.throws(()=>new Store(file,{...config,initialCents:2000},now),/Configuración distinta/);
});
test('la escritura de estado y tick es atómica si SQLite rechaza un dato',t=>{
 const store=new Store(join(temp(t),'paper.sqlite'),config,now);
 try {const s=store.load();s.balanceCents=500;
 assert.throws(()=>store.commit(s,[],{epoch:now,symbol:null,quote:100}));
 assert.equal(store.load().balanceCents,1000);assert.equal(store.tickCount(),0);}finally{store.close();}
});
test('copia consistente SQLite recuperable sin cerrar el servicio',async t=>{
 const dir=temp(t),store=new Store(join(dir,'paper.sqlite'),config,now);
 try{const s=store.load();s.balanceCents=999;store.commit(s);await store.backup(join(dir,'copy.sqlite'));
 const copy=new Store(join(dir,'copy.sqlite'),config,now);assert.equal(copy.load().balanceCents,999);copy.close();
 await assert.rejects(()=>store.backup(join(dir,'copy.sqlite')),/ya existe/);}finally{store.close();}
});
class Socket extends EventTarget {
 constructor(){super();this.readyState=1;this.sent=[];}
 send(raw){this.sent.push(JSON.parse(raw));}
 close(){}
 message(data){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(data)}));}
}
test('historial de otro símbolo provoca desconexión y nunca llega al motor',()=>{
 const socket=new Socket(),statuses=[];let delivered=false;
 const feed=new PublicFeed({symbol:'R_100',onHistory:()=>{delivered=true},onTick(){},onStatus:s=>statuses.push(s),socketFactory:url=>{assert.equal(url,PUBLIC_ENDPOINT);return socket},now:()=>now*1000});
 feed.start();socket.dispatchEvent(new Event('open'));
 const req=socket.sent[0].req_id;
 socket.message({msg_type:'history',req_id:req,echo_req:{ticks_history:'R_75'},history:{prices:series(),times:Array(150).fill(now)}});
 assert.equal(delivered,false);assert.equal(statuses.at(-1).code,'HISTORY_IDENTITY_MISMATCH');feed.stop();
});
test('suscribe ticks solo después de validar historial; ignora conexión anterior',()=>{
 const socket=new Socket(),ticks=[];let history=[];
 const feed=new PublicFeed({symbol:'R_100',onHistory:p=>{history=p},onTick:t=>ticks.push(t),socketFactory:()=>socket,now:()=>now*1000});
 feed.start();socket.dispatchEvent(new Event('open'));const req=socket.sent[0].req_id;
 socket.message({msg_type:'history',req_id:req,echo_req:{ticks_history:'R_100'},history:{prices:series(),times:Array(150).fill(now)}});
 assert.equal(history.length,150);assert.equal(socket.sent.at(-1).ticks,'R_100');
 socket.message({msg_type:'tick',tick:{symbol:'R_100',epoch:now,quote:101}});assert.equal(ticks.length,1);
 feed.stop();socket.message({msg_type:'tick',tick:{symbol:'R_100',epoch:now,quote:102}});assert.equal(ticks.length,1);
});
test('HTTP de solo lectura y persistencia de posición al reiniciar',async t=>{
 const dir=temp(t),env={DATA_DIR:dir,PAPER_ENABLED:'true',HORIZON_TICKS:'2',COOLDOWN_TICKS:'1'};
 const cfg=readConfig(env),file=join(dir,'paper.sqlite'),store=new Store(file,cfg,now);
 const s=initialState(cfg,now);s.position=position();store.commit(s,[{type:'paper_opened',epoch:now,trade:{...s.position,status:'OPEN'}}]);store.close();
 const service=await startService({env,connect:false,listenPort:0,clock:()=>now});
 try{
   const r=await fetch(service.url+'/api/status'),body=await r.json();assert.equal(body.mode,'PAPER');assert.equal(body.balanceCents,1000);
   assert.equal(body.voided,1);assert.equal(body.trades[0].status,'VOID');assert.equal(body.position,null);
   assert.equal((await fetch(service.url+'/api/status',{method:'POST'})).status,405);
   const home=await fetch(service.url+'/');assert.match(home.headers.get('content-security-policy'),/nonce-/);assert.match(await home.text(),/SOLO DINERO VIRTUAL/);
   assert.match(await (await fetch(service.url+'/api/trades.csv')).text(),/"VOID"/);
 }finally{await service.stop();}
});

test('un tick después de un hueco temporal no liquida una posición con datos incompletos',()=>{
 const socket=new Socket(),statuses=[];let epoch=now,received=0;
 const feed=new PublicFeed({symbol:'R_100',onHistory(){},onTick(){received++},onStatus:s=>statuses.push(s),socketFactory:()=>socket,now:()=>epoch*1000});
 feed.start();socket.dispatchEvent(new Event('open'));const req=socket.sent[0].req_id;
 socket.message({msg_type:'history',req_id:req,echo_req:{ticks_history:'R_100'},history:{prices:series(),times:Array(150).fill(epoch)}});
 epoch+=40;socket.message({msg_type:'tick',tick:{symbol:'R_100',epoch,quote:101}});
 assert.equal(received,0);assert.equal(statuses.at(-1).state,'disconnected');feed.stop();
});
test('reintenta conexión y una respuesta del socket anterior no cambia el estado',async()=>{
 const sockets=[];let received=0;
 const feed=new PublicFeed({symbol:'R_100',onHistory(){received++},onTick(){},socketFactory:()=>{const s=new Socket();sockets.push(s);return s},now:()=>now*1000});
 try {
  feed.start();const first=sockets[0];first.dispatchEvent(new Event('open'));first.dispatchEvent(new Event('close'));
  await new Promise(ok=>setTimeout(ok,1100));assert.equal(sockets.length,2);
  const second=sockets[1];second.dispatchEvent(new Event('open'));const req=second.sent[0].req_id;
  const message={msg_type:'history',req_id:req,echo_req:{ticks_history:'R_100'},history:{prices:series(),times:Array(150).fill(now)}};
  first.message(message);assert.equal(received,0);second.message(message);assert.equal(received,1);
 }finally{feed.stop();}
});
