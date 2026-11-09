import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createDemoTrading} from '../demo-trading.mjs';
import {createDemoBurst} from '../demo-burst.mjs';

const epoch=()=>Math.floor(Date.now()/1000);
function setup(){
 const db=new DatabaseSync(':memory:');
 const account={accountId:'VRTC-DEMO',currency:'USD',balance:10000,checkedAt:epoch()};
 let brokerCalls=0;
 const marketSnapshot=()=>({symbol:'R_100',available:true,ready:true,candleCount:60,
  epoch:epoch(),ageReceivedMs:120,fresh:true,direction:'CALL'});
 const trading=createDemoTrading({db,getAccount:()=>account,
  getCredentials:async()=>({accountId:account.accountId}),brokerHeaders:()=>({}),
  accountLookup:async()=>account,
  otpLookup:async()=>{brokerCalls++;throw Error('NO_REAL_NETWORK')},
  marketSnapshot,audit:()=>{},getVersion:()=> '13.9'});
 const burst=createDemoBurst({db,trading,marketSnapshot,
  refreshAccount:async()=>{brokerCalls++;throw Error('NO_REAL_NETWORK')},
  getAccount:()=>account,audit:()=>{}});
 const insert=db.prepare(`INSERT INTO demo_local_orders
 (id,created_at,updated_at,state,source,symbol,direction,stake_cents,pnl_cents)
 VALUES (?,?,?,?,?,?,?,?,?)`);
 return {db,trading,burst,account,insert,brokerCalls:()=>brokerCalls};
}
test('Límite US$100 de pérdidas brutas impide crear tanda 0/10 desde el inicio',()=>{
 const {db,trading,burst,insert,brokerCalls}=setup();
 for(let i=0;i<100;i++)insert.run('loss-'+i,epoch()-90+i%30,epoch(),
  'SETTLED','LOCAL_OWNER','R_100','CALL',100,-100);
 const risk=trading.getRiskStatus();
 assert.equal(risk.dailyGrossLossCents,10000);
 assert.equal(risk.dailyLossLimitCents,10000);
 assert.equal(risk.dailyNetCents,-10000);
 assert.equal(risk.dailyLossStopActive,true);
 assert.equal(risk.canStartNewBatch,false);
 assert.equal(risk.stopReason,'DEMO_DAILY_LOSS_STOP');
 assert.equal(risk.nextDailyResetEpoch-risk.dayStartEpoch,86400);
 assert.equal(burst.status().risk.stopReason,'DEMO_DAILY_LOSS_STOP');
 assert.throws(()=>burst.start({count:10,stakeCents:100,symbol:'AUTO',concurrency:5,
  confirmation:'CONFIRMAR TANDA DEMO'}),/DEMO_DAILY_LOSS_STOP/);
 assert.equal(burst.status().batches.length,0,'rechazo ANTES de persistir tanda RUNNING');
 assert.equal(brokerCalls(),0,'ninguna orden o petición al broker');
 assert.throws(()=>trading.requestIntent({symbol:'R_100',direction:'CALL',
  stakeCents:100,source:'LOCAL_OWNER'}),/DEMO_DAILY_LOSS_STOP/);
 db.close();
});
test('Parada diaria se calcula en ventana UTC; no se elimina el historial anterior',()=>{
 const {db,trading,burst,insert,brokerCalls}=setup();
 const dayStart=Math.floor(epoch()/86400)*86400;
 for(let i=0;i<100;i++)insert.run('prior-'+i,dayStart-1,dayStart-1,
  'SETTLED','LOCAL_OWNER','R_100','CALL',100,-100);
 const risk=trading.getRiskStatus();
 assert.equal(risk.dailyGrossLossCents,0);
 assert.equal(risk.dailyLossStopActive,false);
 assert.equal(risk.nextDailyResetEpoch,dayStart+86400);
 assert.equal(trading.getSummary().campaignPurchases,100,'historial íntegro en SQLite');
 assert.equal(brokerCalls(),0);
 assert.equal(burst.status().risk.canStartNewBatch,true);
 db.close();
});
test('Ganancias no ocultan pérdidas brutas de US$100 aunque el neto sea positivo',()=>{
 const {db,trading,insert}=setup();
 const dayStart=Math.floor(epoch()/86400)*86400;
 for(let i=0;i<100;i++)insert.run('neg-'+i,dayStart+1,dayStart+1,
  'SETTLED','LOCAL_OWNER','R_100','CALL',100,-100);
 for(let i=0;i<110;i++)insert.run('pos-'+i,dayStart+1,dayStart+1,
  'SETTLED','LOCAL_OWNER','R_100','CALL',100,100);
 const risk=trading.getRiskStatus();
 assert.equal(risk.dailyGrossLossCents,10000);
 assert.equal(risk.dailyGrossWinCents,11000);
 assert.equal(risk.dailyNetCents,1000);
 assert.equal(risk.dailyLossStopActive,true);
 db.close();
});
