import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as pause} from 'node:timers/promises';
import {createDemoProgram} from '../demo-program.mjs';

const validRisk=()=>({dailyLossStopActive:false,accountFloorStopActive:false,
 pendingOrders:0,unresolvedOrders:0,dailyRemainingRiskCents:10000});
function setup({risk=validRisk(),state='COMPLETED',settled=10,wins=6}={}){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE demo_bursts(id TEXT PRIMARY KEY,program_id TEXT,state TEXT,
 created_at INTEGER,count_requested INTEGER,stop_reason TEXT);
 CREATE TABLE demo_local_orders(id TEXT PRIMARY KEY,batch_id TEXT,state TEXT,pnl_cents INTEGER,stake_cents INTEGER)`);
 let seq=0,stopped=0,riskNow=risk;const modes=[];
 const trading={canUpdate:()=>true,getRiskStatus:()=>riskNow};
 const bursts={
  status:()=>({running:false,batches:seq?[{id:'b'+seq,state,settled,unknown:0,stopReason:state==='COMPLETED'?null:'NO_SIGNAL'}]:[]}),
  start:args=>{
   modes.push(args.mode);seq++;
   db.prepare('INSERT INTO demo_bursts(id,program_id,state,created_at,count_requested) VALUES(?,?,?,?,?)').run('b'+seq,args.programId,state,1794190000+seq,10);
   if(state==='COMPLETED'){
    const add=db.prepare('INSERT INTO demo_local_orders(id,batch_id,state,pnl_cents,stake_cents) VALUES(?,?,?,?,?)');
    for(let i=0;i<10;i++)add.run('x'+seq+'-'+i,'b'+seq,'SETTLED',i<wins?80:-100,100);
   }
   return {id:'b'+seq,state:'RUNNING'};
  },
  stop:()=>{stopped++;return {stopped:true};}
 };
 const program=createDemoProgram({db,bursts,trading,audit:()=>{},settlePollMs:1,betweenRoundsMs:1});
 return {db,program,bursts,trading,modes,counts:()=>({seq,stopped}),
  setRisk:r=>riskNow=r};
}
async function done(program){
 for(let i=0;i<200;i++){
  if(!program.isRunning())return;
  await pause(10);
 }
 throw Error('PROGRAM_DID_NOT_FINISH');
}
const request=()=>({rounds:10,perRound:10,stakeCents:100,
 symbol:'AUTO',concurrency:5,mode:'RESEARCH_DEMO',confirmation:'CONFIRMAR PROGRAMA DEMO 10X10'});

test('10 rondas DEMO se autorizan una vez y se ejecutan estrictamente en secuencia',async()=>{
 const {db,program,counts,modes}=setup();
 const started=program.start(request());
 assert.equal(started.maxCommittedCents,10000);
 assert.equal(started.mode,'RESEARCH_DEMO');
 assert.equal(started.realEnabled,false);
 await done(program);
 assert.equal(counts().seq,10);
 assert.ok(modes.every(m=>m==='RESEARCH_DEMO'));
 const row=program.status().programs[0];
 assert.equal(row.roundsCompleted,10);
 assert.equal(row.burstsStarted,10);
 assert.equal(row.purchasesExecuted,100);
 assert.equal(row.state,'COMPLETED');
 assert.equal(row.netCents,10*(6*80-4*100));
 assert.equal(row.settled,100);
 assert.equal(row.wins,60);
 assert.equal(row.losses,40);
 assert.equal(row.winRatePct,60);
 assert.equal(row.roiPct,8);
 assert.equal(row.stakedCents,10000);
 assert.equal(row.batches.length,10);
 assert.ok(row.batches.every(b=>b.winRatePct===60&&b.roiPct===8));
 const csv=program.exportResultsCsv();
 assert.match(csv,/winRatePct/);
 assert.match(csv,/roiPct/);
 assert.match(csv,/programId,round,batchId/);
 assert.equal(csv.trim().split(/\r?\n/).length,11);
 assert.equal(program.canUpdate(),true);
 db.close();
});

test('Corte automático tras tanda 5 ganadas / 5 perdidas con neto negativo',async()=>{
 const {db,program,counts}=setup({wins:5});
 program.start(request());
 await done(program);
 const row=program.status().programs[0];
 assert.equal(row.state,'PAUSED');
 assert.equal(row.roundsCompleted,1);
 assert.equal(row.burstsStarted,1);
 assert.equal(counts().seq,1);
 assert.equal(row.wins,5);
 assert.equal(row.losses,5);
 assert.equal(row.netCents,-100);
 assert.equal(row.stopReason,'DEMO_PERFORMANCE_STOP_NEGATIVE_ROUND');
 assert.equal(program.status().realEnabled,false);
 db.close();
});
test('Corte automático tras tanda 4 ganadas / 6 perdidas con neto negativo',async()=>{
 const {db,program,counts}=setup({wins:4});
 program.start(request());
 await done(program);
 const row=program.status().programs[0];
 assert.equal(row.state,'PAUSED');
 assert.equal(row.roundsCompleted,1);
 assert.equal(counts().seq,1);
 assert.equal(row.netCents,-280);
 assert.equal(row.stopReason,'DEMO_PERFORMANCE_STOP_NEGATIVE_ROUND');
 db.close();
});
test('Bloqueo neto antes de iniciar impide las 100 órdenes y no crea programa',()=>{
 const {db,program,counts}=setup({risk:{...validRisk(),dailyLossStopActive:true}});
 assert.throws(()=>program.start(request()),/DEMO_DAILY_NET_LOSS_STOP/);
 assert.equal(counts().seq,0);
 assert.equal(program.status().programs.length,0);
 db.close();
});
test('Ningún programa se inicia si parámetros cambian o no hay aprobación local',()=>{
 const {db,program}=setup();
 assert.throws(()=>program.start({...request(),confirmation:'OMITIR'}),/LOCAL_APPROVAL_REQUIRED/);
 assert.throws(()=>program.start({...request(),stakeCents:1000}),/PARAMETERS_INVALID/);
 assert.throws(()=>program.start({...request(),rounds:50}),/PARAMETERS_INVALID/);
 assert.throws(()=>program.start({...request(),concurrency:10}),/PARAMETERS_INVALID/);
 assert.equal(program.status().running,false);
 db.close();
});
test('Tanda pausada interrumpe inmediatamente el programa sin completar otras tandas',async()=>{
 const {db,program,counts}=setup({state:'PAUSED',settled:0});
 program.start(request());
 await done(program);
 const row=program.status().programs[0];
 assert.equal(row.state,'PAUSED');
 assert.equal(row.roundsCompleted,0);
 assert.equal(counts().seq,1);
 assert.match(row.stopReason,/BURST_PAUSED/);
 db.close();
});
test('Un programa RUNNING guardado se marca INTERRUPTED y jamás se reanuda al iniciar de nuevo',()=>{
 const {db,program,bursts,trading,counts}=setup();
 const add=db.prepare(`INSERT INTO demo_programs(id,created_at,updated_at,state,
 rounds_requested,count_per_round,stake_cents,concurrency,symbol) VALUES(?,?,?,?,?,?,?,?,?)`);
 add.run('old',1,1,'RUNNING',10,10,100,5,'AUTO');
 const restored=createDemoProgram({db,bursts,trading,audit:()=>{},settlePollMs:1,betweenRoundsMs:1});
 assert.equal(restored.status().programs[0].state,'INTERRUPTED');
 assert.equal(counts().seq,0);
 assert.equal(restored.status().programs[0].stopReason,'PROCESS_RESTART_NO_AUTO_RESUME');
 db.close();
});

// Un modo explicito permite investigar hasta diez rondas DEMO a pesar de
// rondas 5/5 negativas. El modo por defecto mantiene la parada protectora.
test('10x10 extendido con autorizacion explicita sigue tras 5/5 negativos',async()=>{
 const {db,program,counts,modes}=setup({wins:5});
 const started=program.start({...request(),continueAfterNegativeRound:true});
 assert.equal(started.continueAfterNegativeRound,true);
 await done(program);
 const row=program.status().programs[0];
 assert.equal(row.state,'COMPLETED');
 assert.equal(row.continueOnNegativeRound,1);
 assert.equal(row.roundsCompleted,10);
 assert.equal(counts().seq,10);
 assert.equal(row.purchasesExecuted,100);
 assert.equal(row.netCents,-1000);
 assert.ok(modes.every(mode=>mode==='RESEARCH_DEMO'));
 assert.match(program.exportResultsCsv(),/continueOnNegativeRound/);
 db.close();
});
test('El modo extendido no permite REAL, tipos invalidos ni modo conservador',()=>{
 const {db,program}=setup();
 assert.throws(()=>program.start({...request(),continueAfterNegativeRound:'true'}),
  /DEMO_CONTINUE_AFTER_NEGATIVE_BOOLEAN_REQUIRED/);
 assert.throws(()=>program.start({...request(),mode:'VALIDATED_ONLY',
  continueAfterNegativeRound:true}),/DEMO_CONTINUE_AFTER_NEGATIVE_RESEARCH_ONLY/);
 assert.equal(program.status().programs.length,0);
 db.close();
});
test('Programa extendido aun se detiene cuando el limite diario se activa',async()=>{
 const {db,program,counts,setRisk}=setup({wins:5});
 program.start({...request(),continueAfterNegativeRound:true});
 setRisk({...validRisk(),dailyLossStopActive:true});
 await done(program);
 const row=program.status().programs[0];
 assert.equal(row.state,'PAUSED');
 assert.equal(row.stopReason,'DEMO_DAILY_NET_LOSS_STOP');
 assert.ok(counts().seq<=1);
 db.close();
});
