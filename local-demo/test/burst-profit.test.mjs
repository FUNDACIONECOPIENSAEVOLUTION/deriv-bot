import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createDemoBurst,inspectSignalAvailability} from '../demo-burst.mjs';
import {diagnoseTrade} from '../trade-analysis.mjs';

test('Tanda con 5 ganancias y 3 pérdidas conserva US$0.50 netos y separa rechazos',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE demo_local_orders(id TEXT PRIMARY KEY,batch_id TEXT,state TEXT,pnl_cents INTEGER)");
 const runner=createDemoBurst({
  db,trading:{canUpdate:()=>true},marketSnapshot:()=>null,
  refreshAccount:async()=>null,getAccount:()=>null,audit:()=>{}
 });
 db.prepare("INSERT INTO demo_bursts(id,created_at,updated_at,state,count_requested,stake_cents,symbol,completed,concurrent) VALUES(?,?,?,?,?,?,?,?,?)")
  .run('batch-win-50',1794180000,1794181000,'COMPLETED',8,35,'AUTO',8,5);
 const add=db.prepare("INSERT INTO demo_local_orders(id,batch_id,state,pnl_cents) VALUES(?,?,?,?)");
 for(let i=0;i<5;i++)add.run('won'+i,'batch-win-50','SETTLED',31);
 for(let i=0;i<3;i++)add.run('lost'+i,'batch-win-50','SETTLED',-35);
 for(let i=0;i<12;i++)add.run('rejected'+i,'batch-win-50','REJECTED',null);
 const row=runner.status().batches[0];
 assert.equal(row.state,'COMPLETED');
 assert.equal(row.executed,8);
 assert.equal(row.settled,8);
 assert.equal(row.wins,5);
 assert.equal(row.losses,3);
 assert.equal(row.rejected,12);
 assert.equal(row.grossWinCents,155);
 assert.equal(row.grossLossCents,105);
 assert.equal(row.netCents,50);
 db.close();
});

test('Resumen histórico no se limita a las últimas 60 filas y retiene pérdida neta',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE demo_local_orders(id TEXT PRIMARY KEY,batch_id TEXT,state TEXT,pnl_cents INTEGER)");
 const runner=createDemoBurst({db,trading:{canUpdate:()=>true},marketSnapshot:()=>null,
  refreshAccount:async()=>null,getAccount:()=>null,audit:()=>{}});
 db.prepare("INSERT INTO demo_bursts(id,created_at,updated_at,state,count_requested,stake_cents,symbol,completed,concurrent) VALUES(?,?,?,?,?,?,?,?,?)")
 .run('many',1794180000,1794181000,'COMPLETED',10,35,'AUTO',10,5);
 const insert=db.prepare("INSERT INTO demo_local_orders(id,batch_id,state,pnl_cents) VALUES(?,?,?,?)");
 for(let i=0;i<10;i++)insert.run('loss'+i,'many','SETTLED',-35);
 for(let i=0;i<80;i++)insert.run('reject'+i,'many','REJECTED',null);
 const row=runner.status().batches[0];
 assert.equal(row.netCents,-350);
 assert.equal(row.grossLossCents,350);
 assert.equal(row.executed,10);
 assert.equal(row.rejected,80);
 db.close();
});

test('Diagnóstico no inventa la causa si faltan precios antiguos',()=>{
 assert.equal(diagnoseTrade({state:'SETTLED',direction:'PUT',pnlCents:-35,entryTick:null,exitTick:null}).code,'PERDIDA_SIN_SPOTS');
 assert.equal(diagnoseTrade({state:'REJECTED',errorCode:'DEMO_QUOTE_STALE'}).code,'NO_EJECUTADA');
 assert.equal(diagnoseTrade({state:'SETTLED',direction:'CALL',pnlCents:-35,entryTick:123,exitTick:122}).code,'MOVIMIENTO_CONTRARIO');
 assert.equal(diagnoseTrade({state:'SETTLED',direction:'PUT',pnlCents:-35,entryTick:123,exitTick:123}).code,'PRECIO_SIN_CAMBIO');
 assert.equal(diagnoseTrade({state:'SETTLED',direction:'PUT',pnlCents:31,entryTick:123,exitTick:122}).code,'DIRECCION_FAVORABLE');
});

test('No se habilita trading real en el resumen de tandas',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE demo_local_orders(id TEXT PRIMARY KEY,batch_id TEXT,state TEXT,pnl_cents INTEGER)");
 const runner=createDemoBurst({db,trading:{canUpdate:()=>true},marketSnapshot:()=>null,
  refreshAccount:async()=>null,getAccount:()=>null,audit:()=>{}});
 assert.equal(runner.status().realEnabled,false);
 db.close();
});

test('Una tanda 0/10 pausada se exporta con su motivo, aunque no exista ninguna compra',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE demo_local_orders(id TEXT PRIMARY KEY,batch_id TEXT,state TEXT,pnl_cents INTEGER)");
 const runner=createDemoBurst({db,trading:{canUpdate:()=>true},marketSnapshot:()=>null,
  refreshAccount:async()=>null,getAccount:()=>null,audit:()=>{}});
 db.prepare("INSERT INTO demo_bursts(id,created_at,updated_at,state,count_requested,stake_cents,symbol,completed,concurrent,stop_reason,inspection_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
 .run('zero-buy',1794190000,1794190000,'PAUSED',10,100,'AUTO',0,5,
  'NO_DISTINCT_FRESH_SIGNAL_WITHIN_40_SECONDS',
  JSON.stringify({checkedSymbols:2,counts:{NO_MARKET_DATA:2},details:[{symbol:'R_10',reason:'NO_MARKET_DATA'}]}));
 const report=runner.status().batches[0];
 assert.equal(report.executed,0);
 assert.equal(report.requested,10);
 assert.equal(report.inspection.counts.NO_MARKET_DATA,2);
 const csv=runner.exportBatchesCsv();
 assert.match(csv,/zero-buy/);
 assert.match(csv,/NO_DISTINCT_FRESH_SIGNAL_WITHIN_40_SECONDS/);
 assert.match(csv,/NO_MARKET_DATA/);
 db.close();
});
test('Inspector muestra si faltan velas, hay señal obsoleta o se reutilizó la vela',()=>{
 const now=1794190200000;
 const snap={
  R_10:null,
  R_25:{symbol:'R_25',available:true,ready:false,candleCount:32},
  R_50:{symbol:'R_50',available:true,ready:true,candleCount:60,fresh:false},
  R_75:{symbol:'R_75',available:true,ready:true,candleCount:60,fresh:true,
   epoch:1794190200,ageReceivedMs:100,direction:'ESPERAR'},
  R_100:{symbol:'R_100',available:true,ready:true,candleCount:60,fresh:true,
   epoch:1794190200,ageReceivedMs:100,direction:'PUT',candles:[{epoch:1794190190}]}
 };
 const reason=inspectSignalAvailability(Object.keys(snap),s=>snap[s],new Map([['R_100',1794190190]]),
  ()=>({blocked:false}),now);
 assert.equal(reason.counts.NO_MARKET_DATA,1);
 assert.equal(reason.counts.OHLC_INCOMPLETE,1);
 assert.equal(reason.counts.TICK_OR_PRICE_STALE,1);
 assert.equal(reason.counts.NO_CONFIRMED_DIRECTION,1);
 assert.equal(reason.counts.CANDLE_ALREADY_USED,1);
 assert.equal(reason.counts.READY||0,0);
});
