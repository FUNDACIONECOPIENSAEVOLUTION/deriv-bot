import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as pause} from 'node:timers/promises';
import {createDemoTrading} from '../demo-trading.mjs';
import {createDemoBurst} from '../demo-burst.mjs';
import {dispatchMcp} from '../mcp-local.mjs';

function setup(){
 const db=new DatabaseSync(':memory:');
 const account={accountId:'DOT-DEMO-123',currency:'USD',balance:10000,checkedAt:Math.floor(Date.now()/1000)};
 const m={symbol:'R_100',direction:'CALL',fresh:true,epoch:Math.floor(Date.now()/1000),
  ageReceivedMs:150,rsi14:58,sma8:101,sma21:100,available:true,ready:true,candleCount:60};
 const logs=[];
 const trading=createDemoTrading({db,getAccount:()=>account,getCredentials:async()=>({accountId:account.accountId}),
  brokerHeaders:()=>({}),accountLookup:async()=>account,otpLookup:async()=>{throw Error('NETWORK_MUST_NOT_RUN')},
  marketSnapshot:s=>s==='R_100'?m:null,audit:(type,detail)=>logs.push([type,detail]),getVersion:()=> '13.6'});
 return {db,account,m,trading,logs};
}
test('DEMO intent stores a pending order without sending a broker BUY',()=>{
 const {db,trading,logs}=setup();
 const intent=trading.requestIntent({symbol:'R_100',direction:'CALL',stakeCents:50,source:'LOCAL_OWNER'});
 assert.equal(intent.state,'PENDING_APPROVAL');
 assert.equal(intent.brokerOrders,0);
 assert.equal(trading.canUpdate(),false);
 assert.equal(trading.getSummary().awaitingApproval,1);
 const pending=[intent];
 for(let i=0;i<4;i++)pending.push(trading.requestIntent({symbol:'R_100',direction:'CALL',stakeCents:50,source:'LOCAL_OWNER'}));
 assert.equal(trading.getSummary().maxConcurrent,5);
 assert.equal(trading.getSummary().awaitingApproval,5);
 assert.throws(()=>trading.requestIntent({symbol:'R_100',direction:'CALL',stakeCents:50,source:'LOCAL_OWNER'}),/DEMO_CONCURRENCY_LIMIT/);
 for(const record of pending)assert.equal(trading.cancel(record.id).brokerOrders,0);
 assert.equal(trading.canUpdate(),true);
 assert.equal(trading.getSummary().campaignPurchases,0);
 assert.match(trading.exportCsv('all'),/R_100/);
 db.close();
});
test('DEMO risk blocks stale or opposing signals, unverified account, 10,000-to-9,900 stop',()=>{
 const {db,trading,m,account}=setup();
 assert.throws(()=>trading.requestIntent({symbol:'R_100',direction:'PUT',stakeCents:50,source:'LOCAL_OWNER'}),/DEMO_SIGNAL_STALE/);
 m.ageReceivedMs=1900;
 assert.throws(()=>trading.requestIntent({symbol:'R_100',direction:'CALL',stakeCents:50,source:'LOCAL_OWNER'}),/DEMO_SIGNAL_STALE/);
 m.ageReceivedMs=150;account.balance=9900.25;
 assert.throws(()=>trading.requestIntent({symbol:'R_100',direction:'CALL',stakeCents:50,source:'LOCAL_OWNER'}),/DEMO_LOSS_STOP/);
 db.close();
});
test('Burst of three supports parallel DEMO approvals without real broker BUY',async()=>{
 const db=new DatabaseSync(':memory:');
 // El motor real crea esta tabla antes de construir createDemoBurst.
 db.exec("CREATE TABLE demo_local_orders(id TEXT PRIMARY KEY,batch_id TEXT,state TEXT,pnl_cents INTEGER)");
 const calls=[],account={accountId:'DOT-D',currency:'USD',balance:10000};
 let inFlight=0,peak=0;
 const trading={canUpdate:()=>true,requestIntent:input=>{calls.push(['request',input]);return {id:'i'+calls.length}},
  markBatch:(id,batch)=>calls.push(['batch',id,batch]),
  approve:async(id,confirmation)=>{
   assert.equal(confirmation,'CONFIRMAR COMPRA DEMO');
   inFlight++;peak=Math.max(peak,inFlight);
   await pause(15);
   calls.push(['approve',id]);inFlight--;
   return {state:'SETTLED'};
  }};
 const runner=createDemoBurst({db,trading,
  marketSnapshot:symbol=>({symbol,direction:'CALL',fresh:true,available:true,ready:true,candleCount:60,
   epoch:Math.floor(Date.now()/1000),ageReceivedMs:30,rsi14:60,signalStrength:60,
   tickHorizonModels:[{durationTicks:10,direction:'CALL',selectedPolicy:'MOMENTUM_20',
    conservativeWinRateLower95:.7,readyForProposal:true}]}),
  refreshAccount:async()=>account,getAccount:()=>account,audit:()=>{}});
 const p=runner.start({count:3,stakeCents:50,symbol:'AUTO',concurrency:3,confirmation:'CONFIRMAR TANDA DEMO'});
 assert.equal(p.accountType,'demo');
 for(let i=0;i<40&&runner.status().running;i++)await pause(10);
 assert.equal(runner.status().batches[0].state,'COMPLETED');
 assert.equal(runner.status().batches[0].completed,3);
 assert.equal(calls.filter(x=>x[0]==='approve').length,3);
 assert.ok(peak>=2,'at least two DEMO approvals must overlap');
 assert.equal(calls.filter(x=>x[0]==='request').length,3);
 assert.ok(calls.filter(x=>x[0]==='request').every(x=>
  x[1].durationTicks===10&&x[1].modelMode==='PREDICTIVE_5_10'));

 assert.equal(p.concurrent,3);
 assert.equal(p.realEnabled,false);
 assert.throws(()=>runner.start({count:11,stakeCents:50,symbol:'AUTO',concurrency:3,confirmation:'CONFIRMAR TANDA DEMO'}),/DEMO_BURST_PARAMETERS/);
 assert.throws(()=>runner.start({count:5,stakeCents:50,symbol:'AUTO',concurrency:6,confirmation:'CONFIRMAR TANDA DEMO'}),/DEMO_BURST_PARAMETERS/);
 db.close();
});
test('MCP tools can only queue DEMO review, never directly buy or use REAL',async()=>{
 let requests=0;
 const handlers={version:()=> '11.8',status:()=>({connected:true,realEnabled:false}),
  signals:()=>[],training:()=>({trainingModel:'NO_ENTRENADO'}),orders:()=>({orders:[]}),
  request:async args=>{requests++;return {state:'PENDING_APPROVAL',brokerOrders:0,...args}}};
 const manifest=await dispatchMcp({jsonrpc:'2.0',id:1,method:'tools/list'},handlers);
 assert.ok(!manifest.result.tools.some(x=>/buy_contract|real_trade|withdraw|sell/.test(x.name)));
 const response=await dispatchMcp({jsonrpc:'2.0',id:2,method:'tools/call',
  params:{name:'request_demo_buy_review',arguments:{symbol:'R_100',direction:'CALL',stakeCents:50}}},handlers);
 assert.equal(requests,1);assert.match(response.result.content[0].text,/PENDING_APPROVAL/);
 const forbidden=await dispatchMcp({jsonrpc:'2.0',id:3,method:'tools/call',
  params:{name:'buy_real',arguments:{}}},handlers);
 assert.equal(forbidden.error.code,-32602);
});

test('CSV completo conserva más de 60 liquidaciones; interfaz limita solo la vista',()=>{
 const {db,trading}=setup();
 const insert=db.prepare(`INSERT INTO demo_local_orders
  (id,created_at,updated_at,state,source,symbol,direction,stake_cents,pnl_cents)
  VALUES (?,?,?,?,?,?,?,?,?)`);
 for(let i=0;i<75;i++){
  insert.run('historic-'+i,1794190000+i,1794190000+i,'SETTLED',
   'LOCAL_OWNER','R_100','CALL',50,i%2?31:-50);
 }
 const csv=trading.exportCsv('all');
 assert.ok(csv.startsWith('\uFEFF'));
 const rows=csv.trim().split(/\r?\n/);
 assert.equal(rows.length,76,'header + 75 contratos: CSV no se puede truncar');
 assert.equal(trading.getSummary().orders.length,60,'la lista visual puede limitarse a 60');
 db.close();
});

test('DEMO no tiene límite histórico: 75 contratos anteriores permiten iniciar la siguiente tanda',()=>{
 const {db,trading}=setup();
 const insert=db.prepare(`INSERT INTO demo_local_orders
  (id,created_at,updated_at,state,source,symbol,direction,stake_cents,pnl_cents)
  VALUES (?,?,?,?,?,?,?,?,?)`);
 for(let i=0;i<75;i++){
  insert.run('older'+i,1794180000+i,1794180000+i,'SETTLED',
   'LOCAL_OWNER','R_100','CALL',50,31);
 }
 assert.equal(trading.getSummary().campaignPurchases,75);
 assert.equal(trading.getSummary().maxPurchases,null);
 assert.equal(trading.getSummary().unlimitedOwnerAuthorizedDemo,true);
 const intent=trading.requestIntent({symbol:'R_100',direction:'CALL',stakeCents:50,source:'LOCAL_OWNER'});
 assert.equal(intent.state,'PENDING_APPROVAL');
 const newRow=trading.getSummary().orders.find(x=>x.id===intent.id);
 assert.equal(newRow.appVersion,'13.6');
 assert.equal(newRow.strategyVersion,'EMA20_EMA50_RSI14_ATR14_OHLC10_V1');
 const csv=trading.exportCsv('all');
 assert.match(csv,/appVersion,strategyVersion/);
 assert.match(csv,/13\.6/);
 assert.equal(csv.trim().split(/\r?\n/).length,77);
 trading.cancel(intent.id);
 assert.equal(trading.canUpdate(),true);
 db.close();
});

test('Tandas DEMO registran versiones y el historial previo se preserva',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE demo_local_orders(id TEXT PRIMARY KEY,batch_id TEXT,state TEXT,pnl_cents INTEGER)");
 const account={accountId:'DEMO-TEST',currency:'USD',balance:10000};
 const trading={canUpdate:()=>true,requestIntent:()=>({id:'test'}),markBatch:()=>{},
  approve:async()=>({state:'SETTLED'})};
 const burst=createDemoBurst({db,trading,marketSnapshot:()=>null,
  refreshAccount:async()=>account,getAccount:()=>account,audit:()=>{},
  getVersion:()=> '13.6',getStrategyVersion:()=> 'EMA20_EMA50_RSI14_ATR14_OHLC10_V1'});
 const next=burst.start({count:10,stakeCents:50,symbol:'AUTO',concurrency:5,confirmation:'CONFIRMAR TANDA DEMO'});
 const row=db.prepare('SELECT app_version AS appVersion,strategy_version AS strategyVersion,count_requested AS requested FROM demo_bursts WHERE id=?').get(next.id);
 assert.equal(row.appVersion,'13.6');
 assert.equal(row.requested,10);
 assert.equal(row.strategyVersion,'TICK_5_10_VALIDATED_V1');
 burst.stop();
 for(let i=0;i<20&&burst.status().running;i++)await pause(30);
 assert.equal(burst.status().running,false);
 // No se crean órdenes durante la prueba.
 db.close();
});

test('Se pueden preparar contratos DEMO de US$10 sin llamadas al broker y mantienen límite de riesgo',()=>{
 const {db,trading}=setup();
 const intent=trading.requestIntent({symbol:'R_100',direction:'CALL',stakeCents:1000,source:'LOCAL_OWNER'});
 assert.equal(intent.stakeCents,1000);
 assert.equal(intent.state,'PENDING_APPROVAL');
 assert.equal(trading.getRiskStatus().pendingExposureCents,1000);
 assert.equal(trading.cancel(intent.id).brokerOrders,0);
 assert.equal(trading.canUpdate(),true);
 db.close();
});
test('Autorización de 10 x US$10 = US$100 por tanda, sin ejecutar BUY',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE demo_local_orders(id TEXT PRIMARY KEY,batch_id TEXT,state TEXT,pnl_cents INTEGER)");
 const account={accountId:'DEMO-ONLY',currency:'USD',balance:10000};
 let calls=0;
 const runner=createDemoBurst({db,trading:{
   canUpdate:()=>true,getRiskStatus:()=>({dailyLossStopActive:false,accountFloorStopActive:false,dailyRemainingRiskCents:10000}),
   requestIntent:()=>{calls++;throw Error('NO_BUY_IN_TEST')}
  },marketSnapshot:()=>null,refreshAccount:async()=>account,
  getAccount:()=>account,audit:()=>{}});
 const batch=runner.start({count:10,stakeCents:1000,symbol:'AUTO',concurrency:5,confirmation:'CONFIRMAR TANDA DEMO'});
 assert.equal(batch.maxGrossCents,10000);
 assert.equal(batch.realEnabled,false);
 runner.stop();
 for(let i=0;i<15&&runner.status().running;i++)await pause(20);
 assert.equal(calls,0);
 db.close();
});

test('Intencion predictiva de 10 ticks exige muestra validada y conserva vencimiento por orden',()=>{
 const {db,trading,m}=setup();
 m.tickHorizonModels=[{durationTicks:10,direction:'PUT',selectedPolicy:'MOMENTUM_20',
  conservativeWinRateLower95:.72,readyForProposal:true}];
 const intent=trading.requestIntent({symbol:'R_100',direction:'PUT',stakeCents:50,
  durationTicks:10,modelMode:'PREDICTIVE_5_10',source:'LOCAL_OWNER'});
 assert.equal(intent.durationTicks,10);
 const saved=db.prepare('SELECT duration_ticks,prediction_mode,prediction_policy,prediction_lower95 FROM demo_local_orders WHERE id=?').get(intent.id);
 assert.equal(saved.duration_ticks,10);
 assert.equal(saved.prediction_mode,'PREDICTIVE_5_10');
 assert.equal(saved.prediction_policy,'MOMENTUM_20');
 assert.equal(saved.prediction_lower95,.72);
 trading.cancel(intent.id);
 assert.throws(()=>trading.requestIntent({symbol:'R_100',direction:'PUT',stakeCents:50,
  durationTicks:10,source:'LOCAL_OWNER'}),/DEMO_LEGACY_DURATION_INVALID/);
 m.tickHorizonModels=[];
 assert.throws(()=>trading.requestIntent({symbol:'R_100',direction:'PUT',stakeCents:50,
  durationTicks:10,modelMode:'PREDICTIVE_5_10',source:'LOCAL_OWNER'}),/DEMO_SIGNAL_STALE/);
 db.close();
});

test('CSV e intencion predictiva conservan tiempos de seleccion y transferencia local',()=>{
 const {db,trading,m}=setup();
 m.tickHorizonModels=[{durationTicks:10,direction:'PUT',selectedPolicy:'MOMENTUM_20',
  conservativeWinRateLower95:.72,readyForProposal:true}];
 const selectedAtMs=Date.now()-3;
 const intent=trading.requestIntent({symbol:'R_100',direction:'PUT',stakeCents:50,
  durationTicks:10,modelMode:'PREDICTIVE_5_10',source:'LOCAL_OWNER',
  selectionTelemetry:{selectedAtMs,analysisCompletedAtMs:selectedAtMs-2,
   feedReceivedAtMs:selectedAtMs-10,analysisComputeMs:1.12,
   analyzer5Ms:0.32,analyzer10Ms:0.47,analyzerStudy5Ms:0.12}});
 const row=db.prepare(`SELECT telemetry_selected_at_ms AS selectedAt,
  telemetry_select_to_intent_ms AS toIntent,telemetry_analysis_to_selection_ms AS toSelect,
  telemetry_analyzer5_ms AS model5,telemetry_analyzer10_ms AS model10
  FROM demo_local_orders WHERE id=?`).get(intent.id);
 assert.equal(row.selectedAt,selectedAtMs);
 assert.ok(row.toIntent>=0);
 assert.equal(row.toSelect,2);
 assert.equal(row.model5,.32);
 assert.equal(row.model10,.47);
 assert.match(trading.exportCsv('all'),/analyzer10ComputeMs/);
 trading.cancel(intent.id);db.close();
});

test('Tanda investigacion DEMO permite 10 ticks sin cota Wilson validada y conserva controles',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE demo_local_orders(id TEXT PRIMARY KEY,batch_id TEXT,state TEXT,pnl_cents INTEGER)");
 const requests=[],account={accountId:'DEMO-TEST',currency:'USD',balance:10000};
 const trading={canUpdate:()=>true,requestIntent:input=>{
  requests.push(input);return {id:'research-'+requests.length};
 },markBatch:()=>{},approve:async()=>({state:'SETTLED'})};
 const runner=createDemoBurst({db,trading,
  getSymbols:()=>['R_10','R_25','R_100'],
  marketSnapshot:symbol=>({symbol,available:true,ready:true,candleCount:60,fresh:true,
   epoch:Math.floor(Date.now()/1000),ageReceivedMs:20,
   tickHorizonModels:[{durationTicks:10,direction:'CALL',selectedPolicy:'MOMENTUM_20',
    trainingDecisions:41,validationDecisions:26,observedValidationHitRate:.577,
    conservativeWinRateLower95:.36,readyForProposal:false}]}),
  refreshAccount:async()=>account,getAccount:()=>account,audit:()=>{}
 });
 assert.throws(()=>runner.start({count:1,stakeCents:200,symbol:'AUTO',
  concurrency:1,mode:'RESEARCH_DEMO',confirmation:'CONFIRMAR TANDA DEMO'}),/DEMO_EXPLORATORY_MAX_1USD/);
 const started=runner.start({count:3,stakeCents:100,symbol:'AUTO',
  concurrency:3,mode:'RESEARCH_DEMO',confirmation:'CONFIRMAR TANDA DEMO'});
 assert.equal(started.mode,'RESEARCH_DEMO');
 for(let i=0;i<100&&runner.status().running;i++)await pause(10);
 assert.equal(runner.status().batches[0].state,'COMPLETED');
 assert.equal(requests.length,3);
 assert.ok(requests.every(x=>x.modelMode==='DEMO_EXPLORATORY_5_10'&&
  x.durationTicks===10&&x.stakeCents===100));
 assert.equal(runner.status().batches[0].signalMode,'RESEARCH_DEMO');
 db.close();
});

test('Piloto FIVE_ONLY prioriza 5 ticks aunque un modelo de 10 ticks tenga 80%',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE demo_local_orders(id TEXT PRIMARY KEY,batch_id TEXT,state TEXT,pnl_cents INTEGER)");
 const calls=[],account={accountId:'DEMO',currency:'USD',balance:10000};
 const trading={canUpdate:()=>true,requestIntent:x=>(calls.push(x),{id:'call'+calls.length}),
  markBatch:()=>{},approve:async()=>({state:'SETTLED'})};
 const mk=(durationTicks,rate)=>({durationTicks,direction:'CALL',
  selectedPolicy:'MOMENTUM_5',trainingDecisions:40,validationDecisions:24,
  observedValidationHitRate:rate,conservativeWinRateLower95:.4,readyForProposal:false});
 const runner=createDemoBurst({db,trading,
  getSymbols:()=>['R_10','R_25','R_100'],
  marketSnapshot:symbol=>({symbol,available:true,ready:true,candleCount:60,
   fresh:true,ageReceivedMs:30,epoch:Math.floor(Date.now()/1000),
   tickHorizonModels:[mk(10,.80),mk(5,.57)]}),
  refreshAccount:async()=>account,getAccount:()=>account,audit:()=>{}});
 const started=runner.start({count:3,stakeCents:100,symbol:'AUTO',concurrency:3,
  mode:'RESEARCH_FIVE_ONLY',confirmation:'CONFIRMAR TANDA DEMO'});
 assert.equal(started.mode,'RESEARCH_FIVE_ONLY');
 for(let i=0;i<100&&runner.status().running;i++)await pause(10);
 assert.equal(calls.length,3);
 assert.ok(calls.every(x=>x.durationTicks===5&&x.direction==='CALL'));
 assert.equal(runner.status().batches[0].signalMode,'RESEARCH_FIVE_ONLY');
 assert.throws(()=>runner.start({count:1,stakeCents:200,symbol:'AUTO',concurrency:1,
  mode:'RESEARCH_FIVE_ONLY',confirmation:'CONFIRMAR TANDA DEMO'}),/DEMO_EXPLORATORY_MAX_1USD/);
 db.close();
});

test('Programa DEMO reintenta rechazos sin ejecutar compra y obtiene 10 liquidaciones sin duplicar',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE demo_local_orders(id TEXT PRIMARY KEY,batch_id TEXT,state TEXT,pnl_cents INTEGER)');
 const account={accountId:'DEMO-TEST',currency:'USD',balance:10000};
 const calls=[],trading={canUpdate:()=>true,
  getRiskStatus:()=>({dailyLossStopActive:false,accountFloorStopActive:false,
   pendingOrders:0,unresolvedOrders:0,dailyRemainingRiskCents:10000}),
  requestIntent:x=>(calls.push(x),{id:'test-'+calls.length}),markBatch:()=>{},
  approve:async id=>Number(id.replace('test-',''))<=2?
   {state:'REJECTED',brokerOrders:0,error:'DEMO_SIGNAL_STALE_OR_CONTRARY'}:
   {state:'SETTLED',brokerOrders:1}
 };
 let tick=0;
 const model={durationTicks:5,direction:'CALL',selectedPolicy:'MOMENTUM_5',
  trainingDecisions:50,validationDecisions:30,observedValidationHitRate:.60,
  conservativeWinRateLower95:.43,readyForProposal:false};
 const runner=createDemoBurst({db,trading,
  getSymbols:()=>['R_10','R_25','R_100'],
  marketSnapshot:symbol=>({symbol,available:true,ready:true,candleCount:60,fresh:true,
   epoch:Math.floor(Date.now()/1000)+tick++,ageReceivedMs:20,
   tickHorizonModels:[model]}),
  refreshAccount:async()=>account,getAccount:()=>account,audit:()=>{}});
 const burst=runner.start({count:10,stakeCents:100,symbol:'AUTO',
  concurrency:3,mode:'RESEARCH_FIVE_ONLY',programId:'p1',
  confirmation:'CONFIRMAR TANDA DEMO'});
 assert.equal(burst.requested,10);
 for(let i=0;i<160&&runner.status().running;i++)await pause(10);
 const b=runner.status().batches[0];
 assert.equal(b.state,'COMPLETED');
 assert.equal(b.settled,10);
 assert.equal(calls.length,12);
 assert.equal(b.rejected,0); // fixture no persiste rechazos; la ejecución los descuenta
 assert.ok(calls.every(x=>x.durationTicks===5&&x.stakeCents===100));
 db.close();
});
