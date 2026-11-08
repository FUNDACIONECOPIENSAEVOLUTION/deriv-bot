// Tandas DEMO para Windows: máximo 10 contratos, uno a uno, con selección de señal.
// Nunca usa /ws/real; jamás retoma una tanda tras reinicio, ni reenvía un BUY incierto.
import {randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';

const SYMBOLS=['R_10','R_25','R_50','R_75','R_100',
 '1HZ10V','1HZ50V','1HZ75V','1HZ100V','1HZ500V','R_500'];
const STAKES=[35,50,75,90,100];
const MAX_PARALLEL=5;
const epoch=()=>Math.floor(Date.now()/1000);
export function createDemoBurst({db,trading,marketSnapshot,refreshAccount,getAccount,audit}){
 db.exec("CREATE TABLE IF NOT EXISTS demo_bursts(id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,state TEXT NOT NULL,count_requested INTEGER NOT NULL,stake_cents INTEGER NOT NULL,symbol TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0,stop_reason TEXT)");
 db.prepare("UPDATE demo_bursts SET state='INTERRUPTED',updated_at=?,stop_reason='PROCESS_RESTART' WHERE state IN ('RUNNING','STOP_REQUESTED')").run(epoch());
 const fields=new Set(db.prepare('PRAGMA table_info(demo_bursts)').all().map(x=>x.name));
 if(!fields.has('concurrent'))db.exec('ALTER TABLE demo_bursts ADD COLUMN concurrent INTEGER NOT NULL DEFAULT 1');
 const insert=db.prepare('INSERT INTO demo_bursts(id,created_at,updated_at,state,count_requested,stake_cents,symbol,concurrent) VALUES(?,?,?,?,?,?,?,?)');
 const update=db.prepare('UPDATE demo_bursts SET state=?,updated_at=?,completed=?,stop_reason=? WHERE id=?');
 const latest=db.prepare('SELECT id,created_at AS createdAt,state,count_requested AS requested,stake_cents AS stakeCents,symbol,concurrent,completed,stop_reason AS stopReason FROM demo_bursts ORDER BY created_at DESC LIMIT 12');
 let active=null;
 function status(){return {running:!!active,stopRequested:!!active?.stopRequested,
  inFlight:active?.inFlight||0,liveId:active?.id||null,batches:latest.all(),
  maxConcurrent:MAX_PARALLEL,realEnabled:false,demoOnly:true};}
 function select(symbol,limit){
  const allowed=symbol==='AUTO'?SYMBOLS:[symbol];
  const eligible=allowed.map(s=>marketSnapshot(s)).filter(x=>
   x&&x.available!==false&&x.ready===true&&x.candleCount>=60&&x.fresh&&
   ['CALL','PUT'].includes(x.direction)&&Number.isFinite(x.ageReceivedMs)&&
   x.ageReceivedMs<=1500&&Number.isInteger(x.epoch)&&
   Math.abs(Date.now()-x.epoch*1000)<=2500);
  // Señal de mayor intensidad descriptiva, no probabilidad de acierto.
  eligible.sort((a,b)=>(b.signalStrength||0)-(a.signalStrength||0)||
   a.ageReceivedMs-b.ageReceivedMs);
  const picks=[];
  // Máximo dos posiciones del mismo índice por ola para reducir concentración.
  for(let repeat=0;repeat<2&&picks.length<limit;repeat++){
   for(const item of eligible){
    if(picks.length>=limit)break;
    picks.push(item);
   }
  }
  return picks;
 }
 async function run(batch){
  let executed=0,settled=0,attempts=0,state='RUNNING',reason=null;
  const maxAttempts=batch.count*3;
  const purchase=async chosen=>{
   let pending=null;
   try{
    if(batch.stopRequested)return {state:'STOPPED',brokerOrders:0};
    pending=trading.requestIntent({symbol:chosen.symbol,direction:chosen.direction,
     stakeCents:batch.stakeCents,source:'LOCAL_OWNER'});
    trading.markBatch(pending.id,batch.id);
    if(batch.stopRequested){
     trading.cancel(pending.id);return {state:'STOPPED',brokerOrders:0};
    }
    return await trading.approve(pending.id,'CONFIRMAR COMPRA DEMO');
   }catch(e){
    if(pending){try{trading.cancel(pending.id);}catch{}}
    return {state:'REJECTED',brokerOrders:0,
     error:String(e?.message||'DEMO_BATCH_ERROR').replace(/[^A-Za-z0-9_]/g,'').slice(0,90)};
   }
  };
  try{
   while(executed<batch.count&&attempts<maxAttempts){
    if(batch.stopRequested){state='STOPPED';reason='OWNER_STOP_REQUESTED';break;}
    let picks=[];
    for(let poll=0;poll<80;poll++){
     if(batch.stopRequested)break;
     picks=select(batch.symbol,Math.min(batch.concurrency,batch.count-executed));
     if(picks.length)break;
     await pause(250);
    }
    if(batch.stopRequested){state='STOPPED';reason='OWNER_STOP_REQUESTED';break;}
    if(!picks.length){state='PAUSED';reason='NO_FRESH_SIGNAL_WITHIN_20_SECONDS';break;}
    await refreshAccount();
    if(!getAccount()){state='HALTED';reason='DEMO_ACCOUNT_UNAVAILABLE';break;}
    batch.inFlight=picks.length;
    // Órdenes paralelas independientes; cada aprobación coteja saldo y señal nuevamente.
    // Se esperan todas las liquidaciones de la ola antes de abrir una nueva.
    const outcomes=await Promise.all(picks.map(purchase));
    batch.inFlight=0;attempts+=outcomes.length;
    let safeRejects=0;
    for(const o of outcomes){
     if(o.state==='SETTLED'){executed++;settled++;continue;}
     if(o.state==='OPEN'){executed++;state='PAUSED';reason='CONTRACT_OPEN_AWAITING_RECONCILIATION';continue;}
     if(o.state==='UNKNOWN'){state='HALTED';reason='BUY_ACK_UNKNOWN_RECONCILE_WITH_BROKER';continue;}
     if(o.state==='STOPPED')continue;
     if(o.state==='REJECTED'&&o.brokerOrders===0){
      safeRejects++;reason=o.error||'SAFE_REJECTED_BEFORE_BUY';continue;
     }
     state='HALTED';reason=o.error||'DEMO_BROKER_REJECTION';
    }
    update.run('RUNNING',epoch(),settled,null,batch.id);
    audit('DEMO_BURST_PROGRESS',batch.id+' executed='+executed+
     ' settled='+settled+' safeRejects='+safeRejects);
    if(state!=='RUNNING')break;
    if(executed<batch.count)await pause(350);
   }
   if(state==='RUNNING')state=executed===batch.count?'COMPLETED':'PAUSED';
   if(state==='PAUSED'&&!reason)reason='SAFE_MAX_ATTEMPTS_REACHED';
  }catch(e){
   state='HALTED';
   reason=String(e?.message||'DEMO_BATCH_ERROR').replace(/[^A-Za-z0-9_]/g,'').slice(0,90);
  }finally{
   batch.inFlight=0;
   update.run(state,epoch(),settled,reason,batch.id);
   audit('DEMO_BURST_'+state,batch.id+' executed='+executed+
    ' settled='+settled+' '+(reason||''));
   if(active?.id===batch.id)active=null;
  }
 }
 function start({count,stakeCents,symbol,confirmation,concurrency=1}){
  if(confirmation!=='CONFIRMAR TANDA DEMO')throw Error('DEMO_BURST_APPROVAL_REQUIRED');
  if(!Number.isSafeInteger(count)||count<1||count>10||
   !Number.isSafeInteger(concurrency)||concurrency<1||concurrency>Math.min(count,MAX_PARALLEL)||
   !STAKES.includes(stakeCents)||!(symbol==='AUTO'||SYMBOLS.includes(symbol)))
   throw Error('DEMO_BURST_PARAMETERS_INVALID');
  if(active)throw Error('DEMO_BURST_ALREADY_RUNNING');
  if(!trading.canUpdate())throw Error('DEMO_ORDER_REQUIRES_RECONCILIATION');
  if(!getAccount())throw Error('DEMO_ACCOUNT_NOT_VERIFIED');
  if(count*stakeCents>1000)throw Error('DEMO_BURST_MAX_10USD');
  const id=randomUUID(),batch={id,count,stakeCents,symbol,concurrency,inFlight:0,stopRequested:false};
  insert.run(id,epoch(),epoch(),'RUNNING',count,stakeCents,symbol,concurrency);
  active=batch;
  audit('DEMO_BURST_AUTHORIZED','Count '+count+' stake '+stakeCents+' DEMO only');
  void run(batch);
  return {id,state:'RUNNING',requested:count,stakeCents,symbol,accountType:'demo',
   realEnabled:false,concurrent:concurrency,maxGrossCents:count*stakeCents};
 }
 function stop(){
  if(!active)return {stopped:false,reason:'NO_ACTIVE_BURST'};
  active.stopRequested=true;
  const record=latest.all().find(x=>x.id===active.id);
  update.run('STOP_REQUESTED',epoch(),record?.completed||0,'OWNER_STOP_REQUESTED',active.id);
  return {stopped:true,reason:'AFTER_CURRENT_WAVE',id:active.id};
 }
 return {start,stop,status,canUpdate:()=>!active};
}
