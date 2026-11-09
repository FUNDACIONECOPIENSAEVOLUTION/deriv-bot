import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as pause} from 'node:timers/promises';
import {createDemoProgram} from '../demo-program.mjs';

const validRisk=()=>({dailyLossStopActive:false,accountFloorStopActive:false,
 pendingOrders:0,unresolvedOrders:0,dailyRemainingRiskCents:10000});
function setup({risk=validRisk(),state='COMPLETED',settled=10}={}){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE demo_bursts(id TEXT PRIMARY KEY,program_id TEXT,state TEXT);
 CREATE TABLE demo_local_orders(id TEXT PRIMARY KEY,batch_id TEXT,state TEXT,pnl_cents INTEGER)`);
 let seq=0,stopped=0,riskNow=risk;
 const trading={canUpdate:()=>true,getRiskStatus:()=>riskNow};
 const bursts={
  status:()=>({running:false,batches:seq?[{id:'b'+seq,state,settled,unknown:0,stopReason:state==='COMPLETED'?null:'NO_SIGNAL'}]:[]}),
  start:args=>{
   seq++;
   db.prepare('INSERT INTO demo_bursts(id,program_id,state) VALUES(?,?,?)').run('b'+seq,args.programId,state);
   if(state==='COMPLETED'){
    const add=db.prepare('INSERT INTO demo_local_orders(id,batch_id,state,pnl_cents) VALUES(?,?,?,?)');
    for(let i=0;i<10;i++)add.run('x'+seq+'-'+i,'b'+seq,'SETTLED',i<6?80:-100);
   }
   return {id:'b'+seq,state:'RUNNING'};
  },
  stop:()=>{stopped++;return {stopped:true};}
 };
 const program=createDemoProgram({db,bursts,trading,audit:()=>{},settlePollMs:1,betweenRoundsMs:1});
 return {db,program,bursts,trading,counts:()=>({seq,stopped}),
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
 symbol:'AUTO',concurrency:5,confirmation:'CONFIRMAR PROGRAMA DEMO 10X10'});

test('10 rondas DEMO se autorizan una vez y se ejecutan estrictamente en secuencia',async()=>{
 const {db,program,counts}=setup();
 const started=program.start(request());
 assert.equal(started.maxCommittedCents,10000);
 assert.equal(started.realEnabled,false);
 await done(program);
 assert.equal(counts().seq,10);
 const row=program.status().programs[0];
 assert.equal(row.roundsCompleted,10);
 assert.equal(row.burstsStarted,10);
 assert.equal(row.purchasesExecuted,100);
 assert.equal(row.state,'COMPLETED');
 assert.equal(row.netCents,10*(6*80-4*100));
 assert.equal(program.canUpdate(),true);
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
