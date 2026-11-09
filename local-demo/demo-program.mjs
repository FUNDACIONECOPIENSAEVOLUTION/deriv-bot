// Programa de estudio: 10 tandas secuenciales x 10 contratos de US$1 SOLO DEMO.
// Una sola autorización local explícita. JAMÁS ejecuta REAL ni retoma tras reiniciar.
import {randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';

export function createDemoProgram({db,bursts,trading,audit,settlePollMs=250,betweenRoundsMs=200}){
 db.exec(`CREATE TABLE IF NOT EXISTS demo_programs(
  id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
  state TEXT NOT NULL,rounds_requested INTEGER NOT NULL,rounds_completed INTEGER NOT NULL DEFAULT 0,
  count_per_round INTEGER NOT NULL,stake_cents INTEGER NOT NULL,concurrency INTEGER NOT NULL,
  symbol TEXT NOT NULL,stop_reason TEXT)`);
 const now=()=>Math.floor(Date.now()/1000);
 db.prepare("UPDATE demo_programs SET state='INTERRUPTED',updated_at=?,stop_reason='PROCESS_RESTART_NO_AUTO_RESUME' WHERE state IN ('RUNNING','STOP_REQUESTED')").run(now());
 const add=db.prepare('INSERT INTO demo_programs(id,created_at,updated_at,state,rounds_requested,count_per_round,stake_cents,concurrency,symbol) VALUES(?,?,?,?,?,?,?,?,?)');
 const save=db.prepare('UPDATE demo_programs SET state=?,updated_at=?,rounds_completed=?,stop_reason=? WHERE id=?');
 const recent=db.prepare(`SELECT p.id,p.created_at AS createdAt,p.updated_at AS updatedAt,p.state,
 p.rounds_requested AS roundsRequested,p.rounds_completed AS roundsCompleted,
 p.count_per_round AS countPerRound,p.stake_cents AS stakeCents,p.concurrency,p.symbol,p.stop_reason AS stopReason,
 (SELECT COUNT(*) FROM demo_bursts b WHERE b.program_id=p.id) AS burstsStarted,
 (SELECT COALESCE(SUM(CASE WHEN o.state IN ('OPEN','SETTLED') THEN 1 ELSE 0 END),0)
 FROM demo_bursts b JOIN demo_local_orders o ON o.batch_id=b.id WHERE b.program_id=p.id) AS purchasesExecuted,
 (SELECT COALESCE(SUM(CASE WHEN o.state='SETTLED' THEN o.pnl_cents ELSE 0 END),0)
 FROM demo_bursts b JOIN demo_local_orders o ON o.batch_id=b.id WHERE b.program_id=p.id) AS netCents
 FROM demo_programs p ORDER BY p.created_at DESC,p.id DESC LIMIT 5`);
 let current=null;
 const status=()=>({running:!!current,id:current?.id||null,
  stopRequested:current?.stopRequested||false,round:current?.round||0,
  programs:recent.all(),realEnabled:false,demoOnly:true,
  authorization:'LOCAL_OWNER_ONLY'});
 const riskStop=()=>{
  const risk=trading.getRiskStatus?.();
  if(!risk) return 'DEMO_RISK_UNAVAILABLE';
  if(risk.dailyLossStopActive)return 'DEMO_DAILY_NET_LOSS_STOP';
  if(risk.accountFloorStopActive)return 'DEMO_ACCOUNT_FLOOR_STOP';
  if(risk.pendingOrders||risk.unresolvedOrders)return 'DEMO_OPEN_OR_UNKNOWN_ORDERS';
  if(risk.dailyRemainingRiskCents<100)return 'DEMO_DAILY_NET_LOSS_EXPOSURE';
  if(!trading.canUpdate())return 'DEMO_ORDER_REQUIRES_RECONCILIATION';
  return null;
 };
 async function run(session){
  let state='RUNNING',reason=null;
  try{
   for(let i=0;i<10;i++){
    if(session.stopRequested){state='STOPPED';reason='OWNER_STOP_REQUESTED';break;}
    const blocked=riskStop();
    if(blocked){state='PAUSED';reason=blocked;break;}
    // El programa no abre otra tanda mientras la anterior no esté liquidada.
    const burst=bursts.start({count:10,stakeCents:100,symbol:'AUTO',
     concurrency:session.concurrency,confirmation:'CONFIRMAR TANDA DEMO',
     programId:session.id,usedCandleEpoch:session.usedCandleEpoch});
    session.round=i+1;
    let terminal=null;
    for(let check=0;check<2400;check++){
     const snapshot=bursts.status();
     if(!snapshot.running){
      terminal=snapshot.batches.find(b=>b.id===burst.id)||null;
      break;
     }
     if(session.stopRequested)bursts.stop();
     await pause(settlePollMs);
    }
    if(!terminal){
     bursts.stop();
     state='HALTED';reason='BURST_STATUS_NOT_CONFIRMED';break;
    }
    if(terminal.state!=='COMPLETED'||terminal.settled!==10||terminal.unknown>0){
     state=terminal.state==='STOPPED'?'STOPPED':'PAUSED';
     reason='BURST_'+terminal.state+'_'+(terminal.stopReason||'INCOMPLETE');
     break;
    }
    session.roundsCompleted++;
    save.run('RUNNING',now(),session.roundsCompleted,null,session.id);
    audit('DEMO_PROGRAM_PROGRESS',session.id+' rounds='+session.roundsCompleted+'/10');
    // Cada siguiente tanda requiere análisis nuevo; evita un bucle de 100
    // órdenes sin dar al motor la oportunidad de refrescar datos.
    if(i<9)await pause(betweenRoundsMs);
   }
   if(state==='RUNNING')state=session.roundsCompleted===10?'COMPLETED':'PAUSED';
  }catch(error){
   state='HALTED';reason=String(error?.message||'PROGRAM_ERROR').replace(/[^A-Za-z0-9_]/g,'').slice(0,100);
  }finally{
   save.run(state,now(),session.roundsCompleted,reason,session.id);
   audit('DEMO_PROGRAM_'+state,session.id+' rounds='+session.roundsCompleted+' '+(reason||''));
   if(current?.id===session.id)current=null;
  }
 }
 function start({rounds=10,perRound=10,stakeCents=100,concurrency=5,
  symbol='AUTO',confirmation}={}){
  if(confirmation!=='CONFIRMAR PROGRAMA DEMO 10X10')
   throw Error('DEMO_PROGRAM_LOCAL_APPROVAL_REQUIRED');
  // Cap estricto de esta función. Nunca expandir a órdenes ilimitadas o REAL.
  if(rounds!==10||perRound!==10||stakeCents!==100||symbol!=='AUTO'||
   !Number.isSafeInteger(concurrency)||concurrency<1||concurrency>5)
   throw Error('DEMO_PROGRAM_PARAMETERS_INVALID');
  if(current||bursts.status().running)throw Error('DEMO_PROGRAM_OR_BURST_ALREADY_RUNNING');
  const blocked=riskStop();
  if(blocked)throw Error(blocked);
  const id=randomUUID();
  add.run(id,now(),now(),'RUNNING',10,10,100,concurrency,'AUTO');
  const session={id,concurrency,round:0,roundsCompleted:0,stopRequested:false,
   usedCandleEpoch:new Map()};
  current=session;
  audit('DEMO_PROGRAM_AUTHORIZED',id+' 10x10xUS$1, DEMO ONLY');
  void run(session);
  return {id,state:'RUNNING',roundsRequested:10,perRound:10,stakeCents:100,
   maxCommittedCents:10000,maxConcurrent:concurrency,realEnabled:false};
 }
 function stop(){
  if(!current)return {stopped:false,reason:'NO_RUNNING_PROGRAM'};
  current.stopRequested=true;
  bursts.stop();
  return {stopped:true,reason:'STOP_AFTER_ACTIVE_BURST',id:current.id};
 }
 return {start,stop,status,isRunning:()=>!!current,canUpdate:()=>!current};
}
