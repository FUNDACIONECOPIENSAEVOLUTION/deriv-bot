import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as pause} from 'node:timers/promises';
import {createDemoBurst} from '../demo-burst.mjs';
import {createDemoProgram} from '../demo-program.mjs';

function setupBurst(pnls){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE demo_local_orders(id TEXT PRIMARY KEY,batch_id TEXT,state TEXT,pnl_cents INTEGER)');
 let count=0,snapshotReads=0;const stakes=[];
 const account={accountId:'DEMO-TEST',balance:10000,currency:'USD'};
 const model={durationTicks:5,direction:'CALL',selectedPolicy:'MOMENTUM_5',
  trainingDecisions:50,validationDecisions:30,observedValidationHitRate:.62,
  conservativeWinRateLower95:.42,readyForProposal:false};
 const risk=()=>({dailyLossStopActive:false,accountFloorStopActive:false,
  pendingOrders:0,unresolvedOrders:0,dailyRemainingRiskCents:10000});
 const trading={canUpdate:()=>true,getRiskStatus:risk,
  requestIntent:x=>{
   stakes.push(x.stakeCents);
   const id='a'+(++count);
   db.prepare("INSERT INTO demo_local_orders(id,state) VALUES(?,'PENDING_APPROVAL')").run(id);
   return {id};
  },
  markBatch:(id,batch)=>db.prepare('UPDATE demo_local_orders SET batch_id=? WHERE id=?').run(batch,id),
  approve:async id=>{
   const index=Number(id.slice(1))-1,pnl=pnls[index];
   if(!Number.isFinite(pnl))throw Error('UNEXPECTED_EXTRA_ORDER');
   db.prepare("UPDATE demo_local_orders SET state='SETTLED',pnl_cents=? WHERE id=?").run(pnl,id);
   return {state:'SETTLED',brokerOrders:1,pnlCents:pnl};
  }
 };
 const burst=createDemoBurst({db,trading,audit:()=>{},
  getSymbols:()=>['R_10','R_25','R_100','R_75'],
  marketSnapshot:symbol=>({symbol,available:true,ready:true,candleCount:60,
   fresh:true,ageReceivedMs:20,epoch:Math.floor(Date.now()/1000),
   candles:[{epoch:Math.floor(Date.now()/1000)-1000+Math.floor(snapshotReads++/4)}],
   tickHorizonModels:[model]}),
  refreshAccount:async()=>account,getAccount:()=>account,signalPollMs:1});
 return {db,burst,orders:()=>count,stakes:()=>stakes};
}
async function wait(runner){
 for(let i=0;i<450&&runner.status().running;i++)await pause(20);
 if(runner.status().running)throw Error('SIMULATED_BURST_TIMEOUT');
 return runner.status().batches[0];
}
const args={count:10,stakeCents:100,symbol:'AUTO',concurrency:1,
 mode:'RESEARCH_DEMO',programId:'p1',
 profitTargetCents:50,lossCapCents:0,
 confirmation:'CONFIRMAR TANDA DEMO'};
test('Beneficio real de +0.76 cierra la tanda tras 3 liquidaciones, no 10',async()=>{
 const {db,burst,orders}=setupBurst([-100,88,88,88]);
 try{
  const start=burst.start(args);
  assert.equal(start.profitTargetCents,50);
  const row=await wait(burst);
  assert.equal(row.state,'COMPLETED');
  assert.equal(row.stopReason,'TAKE_PROFIT_REACHED');
  assert.equal(row.settled,3);
  assert.equal(row.executed,3);
  assert.equal(row.netCents,76);
  assert.equal(orders(),3);
  assert.equal(row.concurrent,1);
 }finally{db.close();}
});
test('Dos derrotas iniciales no fuerzan cierre: puede recuperar antes de la décima compra DEMO',async()=>{
 const {db,burst,orders}=setupBurst([-100,-100,88,88,88,88]);
 try{
  const row=await (burst.start(args),wait(burst));
  assert.equal(row.state,'COMPLETED');
  assert.equal(row.stopReason,'TAKE_PROFIT_REACHED');
  assert.equal(row.netCents,64);
  assert.equal(row.settled,5);
  assert.equal(orders(),5);
 }finally{db.close();}
});
test('No se puede usar profit lock con cinco compras simultaneas o sin programa',()=>{
 const {db,burst}=setupBurst([88]);
 try{
  assert.throws(()=>burst.start({...args,concurrency:5}),
   /DEMO_PROFIT_LOCK_PARAMETERS_INVALID/);
  assert.throws(()=>burst.start({...args,programId:null}),
   /DEMO_PROFIT_LOCK_PARAMETERS_INVALID/);
  assert.throws(()=>burst.start({...args,lossCapCents:300}),
   /DEMO_PROFIT_LOCK_PARAMETERS_INVALID/);
 }finally{db.close();}
});
test('Programa encadena 10 tandas verdes de una compra, no 100 por fuerza',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE demo_bursts(id TEXT PRIMARY KEY,program_id TEXT,state TEXT,
  created_at INTEGER,count_requested INTEGER,stop_reason TEXT);
 CREATE TABLE demo_local_orders(id TEXT PRIMARY KEY,batch_id TEXT,state TEXT,
  pnl_cents INTEGER,stake_cents INTEGER)`);
 let seq=0;
 const risk=()=>({dailyLossStopActive:false,accountFloorStopActive:false,
  pendingOrders:0,unresolvedOrders:0,dailyRemainingRiskCents:10000});
 const trading={canUpdate:()=>true,getRiskStatus:risk};
 const burst={start:x=>{
  assert.equal(x.concurrency,1);
  assert.equal(x.profitTargetCents,50);
  assert.equal(x.lossCapCents,0);
  const id='batch'+(++seq);
  db.prepare('INSERT INTO demo_bursts(id,program_id,state,created_at,count_requested,stop_reason) VALUES(?,?,?,?,?,?)')
   .run(id,x.programId,'COMPLETED',1794200000+seq,10,'TAKE_PROFIT_REACHED');
  db.prepare('INSERT INTO demo_local_orders(id,batch_id,state,pnl_cents,stake_cents) VALUES(?,?,?,?,?)')
   .run('o'+seq,id,'SETTLED',88,100);
  return {id};
 },status:()=>({running:false,batches:seq?[{
  id:'batch'+seq,state:'COMPLETED',stopReason:'TAKE_PROFIT_REACHED',
  executed:1,settled:1,unknown:0}]:[]}),
 stop:()=>({stopped:true})};
 const program=createDemoProgram({db,bursts:burst,trading,audit:()=>{},
  settlePollMs:1,betweenRoundsMs:1});
 try{
  const started=program.start({rounds:10,perRound:10,stakeCents:100,symbol:'AUTO',
   concurrency:5,mode:'RESEARCH_DEMO',continueAfterNegativeRound:true,
   profitTargetCents:50,confirmation:'CONFIRMAR PROGRAMA DEMO 10X10'});
  assert.equal(started.maxConcurrent,1);
  for(let i=0;i<150&&program.isRunning();i++)await pause(20);
  assert.equal(program.isRunning(),false);
  const rep=program.status().programs[0];
  assert.equal(rep.state,'COMPLETED');
  assert.equal(rep.roundsCompleted,10);
  assert.equal(rep.purchasesExecuted,10);
  assert.equal(rep.netCents,880);
  assert.equal(rep.profitTargetCents,50);
  assert.ok(rep.batches.every(b=>b.settled===1));
  assert.match(program.exportResultsCsv(),/profitTargetCents/);
 }finally{db.close();}
});
test('Un objetivo no permitido es rechazado antes de autorizar la tanda',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE demo_bursts(id TEXT PRIMARY KEY,program_id TEXT,state TEXT,created_at INTEGER,count_requested INTEGER,stop_reason TEXT);CREATE TABLE demo_local_orders(id TEXT PRIMARY KEY,batch_id TEXT,state TEXT,pnl_cents INTEGER,stake_cents INTEGER)');
 const trading={canUpdate:()=>true,getRiskStatus:()=>({dailyLossStopActive:false,
  accountFloorStopActive:false,pendingOrders:0,unresolvedOrders:0,
  dailyRemainingRiskCents:10000})};
 const bursts={status:()=>({running:false}),stop:()=>{}};
 const program=createDemoProgram({db,bursts,trading,audit:()=>{}});
 assert.throws(()=>program.start({rounds:10,perRound:10,stakeCents:100,
  concurrency:1,symbol:'AUTO',mode:'RESEARCH_DEMO',profitTargetCents:500,
  confirmation:'CONFIRMAR PROGRAMA DEMO 10X10'}),
  /DEMO_PROGRAM_PROFIT_LOCK_INVALID/);
 db.close();
});

test('Diez pérdidas DEMO cierran la tanda en rojo sin repetir compras',async()=>{
 const {db,burst,orders}=setupBurst(Array(10).fill(-100));
 try{
  const started=burst.start(args);
  assert.equal(started.concurrent,1);
  const row=await wait(burst);
  assert.equal(row.state,'COMPLETED');
  assert.equal(row.stopReason,'TEN_BUYS_REACHED_WITHOUT_TARGET');
  assert.equal(row.netCents,-1000);
  assert.equal(row.settled,10);
  assert.equal(row.executed,10);
  assert.equal(orders(),10);
 }finally{db.close();}
});

// Ensayo mixto de programa: 1a tanda de 10 contratos en rojo, luego
// 9 tandas verdes de una compra. Solo la casilla extendida autoriza
// pasar a la siguiente; el resultado real rojo permanece en el reporte.
test('10x10 puede seguir tras tanda 10/10 roja, con consentimiento y riesgo vigente',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE demo_bursts(id TEXT PRIMARY KEY,program_id TEXT,state TEXT,
  created_at INTEGER,count_requested INTEGER,stop_reason TEXT);
 CREATE TABLE demo_local_orders(id TEXT PRIMARY KEY,batch_id TEXT,state TEXT,
  pnl_cents INTEGER,stake_cents INTEGER)`);
 let seq=0;
 const trading={canUpdate:()=>true,getRiskStatus:()=>({
  dailyLossStopActive:false,accountFloorStopActive:false,
  pendingOrders:0,unresolvedOrders:0,dailyRemainingRiskCents:10000})};
 const burst={start:a=>{
  assert.equal(a.concurrency,1);
  assert.equal(a.lossCapCents,0);
  assert.equal(a.profitTargetCents,50);
  const id='b'+(++seq),first=seq===1,settled=first?10:1;
  db.prepare('INSERT INTO demo_bursts(id,program_id,state,created_at,count_requested,stop_reason) VALUES(?,?,?,?,?,?)')
   .run(id,a.programId,'COMPLETED',1794200000+seq,10,first?
    'TEN_BUYS_REACHED_WITHOUT_TARGET':'TAKE_PROFIT_REACHED');
  const add=db.prepare('INSERT INTO demo_local_orders(id,batch_id,state,pnl_cents,stake_cents) VALUES(?,?,?,?,?)');
  for(let k=0;k<settled;k++)add.run(id+'-'+k,id,'SETTLED',first?-100:88,100);
  return {id};
 },status:()=>({running:false,batches:seq?[{id:'b'+seq,state:'COMPLETED',
  stopReason:seq===1?'TEN_BUYS_REACHED_WITHOUT_TARGET':'TAKE_PROFIT_REACHED',
  executed:seq===1?10:1,settled:seq===1?10:1,unknown:0}]:[]}),
 stop:()=>({stopped:true})};
 const program=createDemoProgram({db,bursts:burst,trading,audit:()=>{},
  settlePollMs:1,betweenRoundsMs:1});
 try{
  const p=program.start({rounds:10,perRound:10,stakeCents:100,symbol:'AUTO',
   concurrency:5,mode:'RESEARCH_DEMO',continueAfterNegativeRound:true,
   profitTargetCents:50,confirmation:'CONFIRMAR PROGRAMA DEMO 10X10'});
  assert.equal(p.lossCapCents,0);
  for(let i=0;i<200&&program.isRunning();i++)await pause(10);
  const report=program.status().programs[0];
  assert.equal(report.state,'COMPLETED');
  assert.equal(report.roundsCompleted,10);
  assert.equal(report.purchasesExecuted,19);
  assert.equal(report.netCents,-208);
  assert.equal(report.batches[0].netCents,-1000);
  assert.equal(report.batches[0].settled,10);
  assert.equal(report.batches[1].netCents,88);
 }finally{db.close();}
});

test('Integracion verde progresivo DEMO: GG R cierra en verde con solo tres BUY',async()=>{
 const {db,burst,orders}=setupBurst([88,88,-100,-100]);
 try{
  const b=burst.start({...args,exitPolicy:'TRAILING_GREEN'});
  assert.equal(b.exitPolicy,'TRAILING_GREEN');
  const row=await wait(burst);
  assert.equal(row.state,'COMPLETED');
  assert.equal(row.stopReason,'TRAILING_PROFIT_LOCKED');
  assert.equal(row.settled,3);
  assert.equal(row.netCents,76);
  assert.equal(orders(),3);
 }finally{db.close();}
});
test('Integracion G R G: recuperar en tercer BUY y terminar en verde',async()=>{
 const {db,burst,orders}=setupBurst([88,-100,88,-100]);
 try{
  const row=await (burst.start({...args,exitPolicy:'TRAILING_GREEN'}),wait(burst));
  assert.equal(row.state,'COMPLETED');
  assert.equal(row.stopReason,'TRAILING_RECOVERY_GREEN');
  assert.equal(row.settled,3);
  assert.equal(row.netCents,76);
  assert.equal(orders(),3);
 }finally{db.close();}
});
test('Una configuracion antigua del cap US$2 no se acepta en tandas nuevas',()=>{
 const {db,burst}=setupBurst([88]);
 try{
  assert.throws(()=>burst.start({...args,lossCapCents:200}),
   /DEMO_PROFIT_LOCK_PARAMETERS_INVALID/);
 }finally{db.close();}
});

test('US$1 al inicio, dos pérdidas cambian a US$0.50 hasta cerrar la tanda',async()=>{
 const {db,burst,orders,stakes}=setupBurst([-100,-100,44,44,44,44,44,44,44,44]);
 try{
  const row=await (burst.start({...args,downshiftAfterTwoLosses:true}),wait(burst));
  assert.equal(row.state,'COMPLETED');
  assert.equal(row.stopReason,'TAKE_PROFIT_REACHED');
  assert.equal(row.settled,8);
  assert.equal(row.netCents,64);
  assert.equal(orders(),8);
  assert.deepEqual(stakes(),[100,100,50,50,50,50,50,50]);
 }finally{db.close();}
});
test('Sin downshift la modalidad histórica conserva apuestas de US$1',async()=>{
 const {db,burst,stakes}=setupBurst([88,88]);
 try{
  const row=await (burst.start(args),wait(burst));
  assert.equal(row.settled,1);
  assert.deepEqual(stakes(),[100]);
 }finally{db.close();}
});
