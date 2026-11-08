// Tandas DEMO para Windows: máximo 10 contratos, uno a uno, con selección de señal.
// Nunca usa /ws/real; jamás retoma una tanda tras reinicio, ni reenvía un BUY incierto.
import {randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';

const SYMBOLS=['R_100','R_75','R_10','1HZ100V'];
const STAKES=[35,50,75,90,100];
const epoch=()=>Math.floor(Date.now()/1000);
export function createDemoBurst({db,trading,marketSnapshot,refreshAccount,getAccount,audit}){
 db.exec("CREATE TABLE IF NOT EXISTS demo_bursts(id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,state TEXT NOT NULL,count_requested INTEGER NOT NULL,stake_cents INTEGER NOT NULL,symbol TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0,stop_reason TEXT)");
 db.prepare("UPDATE demo_bursts SET state='INTERRUPTED',updated_at=?,stop_reason='PROCESS_RESTART' WHERE state IN ('RUNNING','STOP_REQUESTED')").run(epoch());
 const insert=db.prepare('INSERT INTO demo_bursts(id,created_at,updated_at,state,count_requested,stake_cents,symbol) VALUES(?,?,?,?,?,?,?)');
 const update=db.prepare('UPDATE demo_bursts SET state=?,updated_at=?,completed=?,stop_reason=? WHERE id=?');
 const latest=db.prepare('SELECT id,created_at AS createdAt,state,count_requested AS requested,stake_cents AS stakeCents,symbol,completed,stop_reason AS stopReason FROM demo_bursts ORDER BY created_at DESC LIMIT 12');
 let active=null;
 function status(){return {running:!!active,stopRequested:!!active?.stopRequested,liveId:active?.id||null,batches:latest.all(),realEnabled:false,demoOnly:true};}
 function select(symbol){
  const allowed=symbol==='AUTO'?SYMBOLS:[symbol];
  const selections=allowed.map(s=>marketSnapshot(s)).filter(x=>x&&x.fresh&&['CALL','PUT'].includes(x.direction)
   &&Number.isFinite(x.ageReceivedMs)&&x.ageReceivedMs<=1000&&Number.isInteger(x.epoch)
   &&Math.abs(Date.now()-x.epoch*1000)<=2000);
  selections.sort((a,b)=>Math.abs(b.rsi14-50)-Math.abs(a.rsi14-50)||a.ageReceivedMs-b.ageReceivedMs);
  return selections[0]||null;
 }
 async function run(batch){
  let completed=0,reason=null,state='RUNNING';
  try{
   for(let i=0;i<batch.count;i++){
    if(batch.stopRequested){state='STOPPED';reason='OWNER_STOP_REQUESTED';break;}
    let chosen=null;
    for(let poll=0;poll<80;poll++){
     if(batch.stopRequested)break;
     chosen=select(batch.symbol);
     if(chosen)break;
     await pause(250);
    }
    if(batch.stopRequested){state='STOPPED';reason='OWNER_STOP_REQUESTED';break;}
    if(!chosen){state='PAUSED';reason='NO_FRESH_SIGNAL_WITHIN_20_SECONDS';break;}
    await refreshAccount();
    if(!getAccount()){state='HALTED';reason='DEMO_ACCOUNT_UNAVAILABLE';break;}
    const intent=trading.requestIntent({symbol:chosen.symbol,direction:chosen.direction,stakeCents:batch.stakeCents,source:'LOCAL_OWNER'});
    trading.markBatch(intent.id,batch.id);
    const outcome=await trading.approve(intent.id,'CONFIRMAR COMPRA DEMO');
    if(outcome.state==='SETTLED'){
     completed++;update.run('RUNNING',epoch(),completed,null,batch.id);
     audit('DEMO_BURST_SETTLED',batch.id+' '+completed+'/'+batch.count);
     continue;
    }
    if(outcome.state==='OPEN'){state='PAUSED';reason='CONTRACT_OPEN_AWAITING_RECONCILIATION';break;}
    if(outcome.state==='UNKNOWN'){state='HALTED';reason='BUY_ACK_UNKNOWN_RECONCILE_WITH_BROKER';break;}
    state='HALTED';reason=outcome.error||'DEMO_BROKER_REJECTION';break;
   }
   if(state==='RUNNING')state=completed===batch.count?'COMPLETED':'PAUSED';
  }catch(e){
   state='HALTED';
   reason=String(e?.message||'DEMO_BATCH_ERROR').replace(/[^A-Za-z0-9_]/g,'').slice(0,90);
  }finally{
   update.run(state,epoch(),completed,reason,batch.id);
   audit('DEMO_BURST_'+state,batch.id+' '+completed+'/'+batch.count+' '+(reason||''));
   if(active?.id===batch.id)active=null;
  }
 }
 function start({count,stakeCents,symbol,confirmation}){
  if(confirmation!=='CONFIRMAR TANDA DEMO')throw Error('DEMO_BURST_APPROVAL_REQUIRED');
  if(!Number.isSafeInteger(count)||count<1||count>10||!STAKES.includes(stakeCents)||!(symbol==='AUTO'||SYMBOLS.includes(symbol)))
   throw Error('DEMO_BURST_PARAMETERS_INVALID');
  if(active)throw Error('DEMO_BURST_ALREADY_RUNNING');
  if(!trading.canUpdate())throw Error('DEMO_ORDER_REQUIRES_RECONCILIATION');
  if(!getAccount())throw Error('DEMO_ACCOUNT_NOT_VERIFIED');
  if(count*stakeCents>1000)throw Error('DEMO_BURST_MAX_10USD');
  const id=randomUUID(),batch={id,count,stakeCents,symbol,stopRequested:false};
  insert.run(id,epoch(),epoch(),'RUNNING',count,stakeCents,symbol);
  active=batch;
  audit('DEMO_BURST_AUTHORIZED','Count '+count+' stake '+stakeCents+' DEMO only');
  void run(batch);
  return {id,state:'RUNNING',requested:count,stakeCents,symbol,accountType:'demo',realEnabled:false,concurrent:1,maxGrossCents:count*stakeCents};
 }
 function stop(){
  if(!active)return {stopped:false,reason:'NO_ACTIVE_BURST'};
  active.stopRequested=true;
  const record=latest.all().find(x=>x.id===active.id);
  update.run('STOP_REQUESTED',epoch(),record?.completed||0,'OWNER_STOP_REQUESTED',active.id);
  return {stopped:true,reason:'AFTER_CURRENT_CONTRACT',id:active.id};
 }
 return {start,stop,status,canUpdate:()=>!active};
}
