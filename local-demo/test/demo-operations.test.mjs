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
  ageReceivedMs:150,rsi14:58,sma8:101,sma21:100};
 const logs=[];
 const trading=createDemoTrading({db,getAccount:()=>account,getCredentials:async()=>({accountId:account.accountId}),
  brokerHeaders:()=>({}),accountLookup:async()=>account,otpLookup:async()=>{throw Error('NETWORK_MUST_NOT_RUN')},
  marketSnapshot:s=>s==='R_100'?m:null,audit:(type,detail)=>logs.push([type,detail])});
 return {db,account,m,trading,logs};
}
test('DEMO intent stores a pending order without sending a broker BUY',()=>{
 const {db,trading,logs}=setup();
 const intent=trading.requestIntent({symbol:'R_100',direction:'CALL',stakeCents:50,source:'LOCAL_OWNER'});
 assert.equal(intent.state,'PENDING_APPROVAL');
 assert.equal(intent.brokerOrders,0);
 assert.equal(trading.canUpdate(),false);
 assert.equal(trading.getSummary().awaitingApproval,1);
 assert.throws(()=>trading.requestIntent({symbol:'R_100',direction:'CALL',stakeCents:50,source:'LOCAL_OWNER'}),/DEMO_PENDING/);
 const result=trading.cancel(intent.id);
 assert.equal(result.brokerOrders,0);
 assert.equal(trading.canUpdate(),true);
 assert.equal(trading.getSummary().campaignPurchases,0);
 assert.match(trading.exportCsv('all'),/R_100/);
 db.close();
});
test('DEMO risk blocks stale or opposing signals, unverified account, 10,000-to-9,900 stop',()=>{
 const {db,trading,m,account}=setup();
 assert.throws(()=>trading.requestIntent({symbol:'R_100',direction:'PUT',stakeCents:50,source:'LOCAL_OWNER'}),/DEMO_SIGNAL_STALE/);
 m.ageReceivedMs=1200;
 assert.throws(()=>trading.requestIntent({symbol:'R_100',direction:'CALL',stakeCents:50,source:'LOCAL_OWNER'}),/DEMO_SIGNAL_STALE/);
 m.ageReceivedMs=150;account.balance=9900.25;
 assert.throws(()=>trading.requestIntent({symbol:'R_100',direction:'CALL',stakeCents:50,source:'LOCAL_OWNER'}),/DEMO_LOSS_STOP/);
 db.close();
});
test('Burst of three sends serial DEMO approvals only and stores a final summary',async()=>{
 const db=new DatabaseSync(':memory:');
 const calls=[],account={accountId:'DOT-D',currency:'USD',balance:10000};
 const trading={canUpdate:()=>true,requestIntent:input=>{calls.push(['request',input]);return {id:'i'+calls.length}},
  markBatch:(id,batch)=>calls.push(['batch',id,batch]),
  approve:async(id,confirmation)=>{assert.equal(confirmation,'CONFIRMAR COMPRA DEMO');calls.push(['approve',id]);return {state:'SETTLED'}}};
 const runner=createDemoBurst({db,trading,
  marketSnapshot:()=>({symbol:'R_100',direction:'CALL',fresh:true,epoch:Math.floor(Date.now()/1000),ageReceivedMs:30,rsi14:60}),
  refreshAccount:async()=>account,getAccount:()=>account,audit:()=>{}});
 const p=runner.start({count:3,stakeCents:50,symbol:'AUTO',confirmation:'CONFIRMAR TANDA DEMO'});
 assert.equal(p.accountType,'demo');
 for(let i=0;i<40&&runner.status().running;i++)await pause(10);
 assert.equal(runner.status().batches[0].state,'COMPLETED');
 assert.equal(runner.status().batches[0].completed,3);
 assert.equal(calls.filter(x=>x[0]==='approve').length,3);
 assert.throws(()=>runner.start({count:11,stakeCents:50,symbol:'AUTO',confirmation:'CONFIRMAR TANDA DEMO'}),/DEMO_BURST_PARAMETERS/);
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
