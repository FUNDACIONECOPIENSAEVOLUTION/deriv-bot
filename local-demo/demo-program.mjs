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
 const fields=new Set(db.prepare('PRAGMA table_info(demo_programs)').all().map(x=>x.name));
 if(!fields.has('signal_mode'))db.exec("ALTER TABLE demo_programs ADD COLUMN signal_mode TEXT DEFAULT 'VALIDATED_ONLY'");
 if(!fields.has('continue_on_negative_round'))
  db.exec("ALTER TABLE demo_programs ADD COLUMN continue_on_negative_round INTEGER NOT NULL DEFAULT 0");
 const now=()=>Math.floor(Date.now()/1000);
 db.prepare("UPDATE demo_programs SET state='INTERRUPTED',updated_at=?,stop_reason='PROCESS_RESTART_NO_AUTO_RESUME' WHERE state IN ('RUNNING','STOP_REQUESTED')").run(now());
 const add=db.prepare('INSERT INTO demo_programs(id,created_at,updated_at,state,rounds_requested,count_per_round,stake_cents,concurrency,symbol,signal_mode,continue_on_negative_round) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
 const save=db.prepare('UPDATE demo_programs SET state=?,updated_at=?,rounds_completed=?,stop_reason=? WHERE id=?');
 const recent=db.prepare(`SELECT p.id,p.created_at AS createdAt,p.updated_at AS updatedAt,p.state,
 p.rounds_requested AS roundsRequested,p.rounds_completed AS roundsCompleted,
 p.count_per_round AS countPerRound,p.stake_cents AS stakeCents,p.concurrency,p.symbol,
 p.signal_mode AS signalMode,p.continue_on_negative_round AS continueOnNegativeRound,
 p.stop_reason AS stopReason,
 (SELECT COUNT(*) FROM demo_bursts b WHERE b.program_id=p.id) AS burstsStarted,
 (SELECT COALESCE(SUM(CASE WHEN o.state IN ('OPEN','SETTLED') THEN 1 ELSE 0 END),0)
 FROM demo_bursts b JOIN demo_local_orders o ON o.batch_id=b.id WHERE b.program_id=p.id) AS purchasesExecuted,
 (SELECT COALESCE(SUM(CASE WHEN o.state='SETTLED' THEN o.pnl_cents ELSE 0 END),0)
 FROM demo_bursts b JOIN demo_local_orders o ON o.batch_id=b.id WHERE b.program_id=p.id) AS netCents
 FROM demo_programs p ORDER BY p.created_at DESC,p.id DESC LIMIT 5`);
 const results=db.prepare(`SELECT b.id AS batchId,b.program_id AS programId,
  b.created_at AS createdAt,b.state AS state,
  b.count_requested AS requested,b.stop_reason AS stopReason,
  COUNT(CASE WHEN o.state IN ('OPEN','SETTLED') THEN 1 END) AS executed,
  COUNT(CASE WHEN o.state='SETTLED' THEN 1 END) AS settled,
  COUNT(CASE WHEN o.state='SETTLED' AND o.pnl_cents>0 THEN 1 END) AS wins,
  COUNT(CASE WHEN o.state='SETTLED' AND o.pnl_cents<0 THEN 1 END) AS losses,
  COUNT(CASE WHEN o.state='REJECTED' THEN 1 END) AS rejected,
  COALESCE(SUM(CASE WHEN o.state='SETTLED' THEN o.stake_cents ELSE 0 END),0) AS stakedCents,
  COALESCE(SUM(CASE WHEN o.state='SETTLED' AND o.pnl_cents>0 THEN o.pnl_cents ELSE 0 END),0) AS grossWinCents,
  COALESCE(SUM(CASE WHEN o.state='SETTLED' AND o.pnl_cents<0 THEN -o.pnl_cents ELSE 0 END),0) AS grossLossCents,
  COALESCE(SUM(CASE WHEN o.state='SETTLED' THEN o.pnl_cents ELSE 0 END),0) AS netCents
  FROM demo_bursts b LEFT JOIN demo_local_orders o ON o.batch_id=b.id
  WHERE b.program_id IS NOT NULL GROUP BY b.id ORDER BY b.created_at,b.id`);
 const percent=(num,den)=>den>0?Number((100*num/den).toFixed(2)):null;
 function getReport(){
  const all=results.all(),byId=new Map();
  for(const b of all){
   const a=byId.get(b.programId)||[];
   a.push({...b,round:a.length+1,winRatePct:percent(b.wins,b.settled),
    roiPct:percent(b.netCents,b.stakedCents)});
   byId.set(b.programId,a);
  }
  return recent.all().map(p=>{
   const batches=byId.get(p.id)||[],totals=batches.reduce((v,b)=>{
    for(const k of ['executed','settled','wins','losses','rejected','stakedCents','grossWinCents','grossLossCents','netCents'])v[k]+=b[k]||0;
    return v;
   },{executed:0,settled:0,wins:0,losses:0,rejected:0,stakedCents:0,grossWinCents:0,grossLossCents:0,netCents:0});
   return {...p,...totals,winRatePct:percent(totals.wins,totals.settled),
    roiPct:percent(totals.netCents,totals.stakedCents),batches};
  });
 }
 let current=null;
 const status=()=>({running:!!current,id:current?.id||null,
  stopRequested:current?.stopRequested||false,round:current?.round||0,
  programs:getReport(),realEnabled:false,demoOnly:true,
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
     programId:session.id,usedCandleEpoch:session.usedCandleEpoch,
     mode:session.mode});
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
    // Cortacircuito solicitado: nunca avanzar una serie 10x10 tras una tanda
    // de 5/5 (o peor) y P&L neto negativo. NO modifica CALL/PUT.
    const settledRound=getReport().find(p=>p.id===session.id)
     ?.batches.find(b=>b.batchId===burst.id);
    if(!settledRound||settledRound.settled!==10){
     state='HALTED';reason='DEMO_ROUND_RESULTS_NOT_VERIFIED';break;
    }
    if(settledRound.netCents<0&&settledRound.wins<=settledRound.losses){
     if(!session.continueAfterNegativeRound){
      state='PAUSED';reason='DEMO_PERFORMANCE_STOP_NEGATIVE_ROUND';
      audit('DEMO_PERFORMANCE_STOP',burst.id+' netCents='+settledRound.netCents+
       ' wins='+settledRound.wins+' losses='+settledRound.losses);
      break;
     }
     // Continuar solo por autorizacion expresa del usuario en el panel local.
     // El stop diario, el saldo minimo, las ordenes UNKNOWN y señales frescas
     // siguen bloqueando las siguientes tandas al ejecutar riskStop().
     audit('DEMO_RESEARCH_CONTINUE_AFTER_NEGATIVE_ROUND',
      burst.id+' netCents='+settledRound.netCents+' optIn=true');
    }
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
  symbol='AUTO',mode='VALIDATED_ONLY',continueAfterNegativeRound=false,
  confirmation}={}){
  if(confirmation!=='CONFIRMAR PROGRAMA DEMO 10X10')
   throw Error('DEMO_PROGRAM_LOCAL_APPROVAL_REQUIRED');
  if(!['VALIDATED_ONLY','RESEARCH_DEMO','RESEARCH_FIVE_ONLY'].includes(mode))
   throw Error('DEMO_PROGRAM_SIGNAL_MODE_INVALID');
  if(typeof continueAfterNegativeRound!=='boolean')
   throw Error('DEMO_CONTINUE_AFTER_NEGATIVE_BOOLEAN_REQUIRED');
  if(continueAfterNegativeRound&&!['RESEARCH_DEMO','RESEARCH_FIVE_ONLY'].includes(mode))
   throw Error('DEMO_CONTINUE_AFTER_NEGATIVE_RESEARCH_ONLY');
  // Cap estricto de esta función. Nunca expandir a órdenes ilimitadas o REAL.
  if(rounds!==10||perRound!==10||stakeCents!==100||symbol!=='AUTO'||
   !Number.isSafeInteger(concurrency)||concurrency<1||concurrency>5)
   throw Error('DEMO_PROGRAM_PARAMETERS_INVALID');
  if(current||bursts.status().running)throw Error('DEMO_PROGRAM_OR_BURST_ALREADY_RUNNING');
  const blocked=riskStop();
  if(blocked)throw Error(blocked);
  const id=randomUUID();
  add.run(id,now(),now(),'RUNNING',10,10,100,concurrency,'AUTO',mode,
   continueAfterNegativeRound?1:0);
  const session={id,concurrency,mode,continueAfterNegativeRound,
   round:0,roundsCompleted:0,stopRequested:false,
   usedCandleEpoch:new Map()};
  current=session;
  audit('DEMO_PROGRAM_AUTHORIZED',id+' 10x10xUS$1, '+mode+
   ' continueNegative='+continueAfterNegativeRound+' DEMO ONLY');
  void run(session);
  return {id,state:'RUNNING',mode,continueAfterNegativeRound,
   roundsRequested:10,perRound:10,stakeCents:100,
   maxCommittedCents:10000,maxConcurrent:concurrency,realEnabled:false};
 }
 function stop(){
  if(!current)return {stopped:false,reason:'NO_RUNNING_PROGRAM'};
  current.stopRequested=true;
  bursts.stop();
  return {stopped:true,reason:'STOP_AFTER_ACTIVE_BURST',id:current.id};
 }
 function exportResultsCsv(){
  const keys=['programId','round','batchId','state','requested','executed','settled','wins',
   'losses','rejected','winRatePct','stakedCents','grossWinCents','grossLossCents',
   'netCents','roiPct','continueOnNegativeRound','stopReason'];
  const rows=getReport().flatMap(p=>p.batches.map(b=>({
   ...b,continueOnNegativeRound:p.continueOnNegativeRound})));
  const safe=v=>typeof v==='number'&&Number.isFinite(v)?String(v):
   '"'+String(v??'').replace(/"/g,'""').replace(/^[=+@-]/,m=>'_'+m)+'"';
  return '\uFEFF'+keys.join(',')+'\r\n'+rows.map(r=>
   keys.map(k=>safe(r[k])).join(',')).join('\r\n')+'\r\n';
 }
 return {start,stop,status,exportResultsCsv,isRunning:()=>!!current,canUpdate:()=>!current};
}
