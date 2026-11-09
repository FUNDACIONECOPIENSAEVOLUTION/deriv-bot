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
test('Límite US$100 de pérdida NETA impide crear tanda 0/10 desde el inicio',()=>{
 const {db,trading,burst,insert,brokerCalls}=setup();
 for(let i=0;i<100;i++)insert.run('loss-'+i,Math.floor(epoch()/86400)*86400+1,epoch(),
  'SETTLED','LOCAL_OWNER','R_100','CALL',100,-100);
 const risk=trading.getRiskStatus();
 assert.equal(risk.dailyGrossLossCents,10000);
 assert.equal(risk.dailyLossLimitCents,10000);
 assert.equal(risk.dailyNetCents,-10000);
 assert.equal(risk.dailyNetLossCents,10000);
 assert.equal(risk.dailyLossMethod,'NET_SETTLED_PNL_UTC');
 assert.equal(risk.dailyLossStopActive,true);
 assert.equal(risk.canStartNewBatch,false);
 assert.equal(risk.stopReason,'DEMO_DAILY_NET_LOSS_STOP');
 assert.equal(risk.nextDailyResetEpoch-risk.dayStartEpoch,86400);
 assert.equal(burst.status().risk.stopReason,'DEMO_DAILY_NET_LOSS_STOP');
 assert.throws(()=>burst.start({count:10,stakeCents:100,symbol:'AUTO',concurrency:5,
  confirmation:'CONFIRMAR TANDA DEMO'}),/DEMO_DAILY_NET_LOSS_STOP/);
 assert.equal(burst.status().batches.length,0,'rechazo ANTES de persistir tanda RUNNING');
 assert.equal(brokerCalls(),0,'ninguna orden o petición al broker');
 assert.throws(()=>trading.requestIntent({symbol:'R_100',direction:'CALL',
  stakeCents:100,source:'LOCAL_OWNER'}),/DEMO_DAILY_NET_LOSS_STOP/);
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
test('Las ganancias compensan pérdidas brutas de US$100 si el neto es positivo',()=>{
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
 assert.equal(risk.dailyNetLossCents,0);
 assert.equal(risk.dailyLossStopActive,false);
 assert.equal(risk.dailyRemainingRiskCents,11000);
 const intent=trading.requestIntent({symbol:'R_100',direction:'CALL',stakeCents:100,source:'LOCAL_OWNER'});
 assert.equal(intent.state,'PENDING_APPROVAL');
 trading.cancel(intent.id);
 db.close();
});

test('Ganancia neta de tandas anteriores reduce la pérdida neta diaria',()=>{
 const {db,trading,insert}=setup();
 const t=Math.floor(epoch()/86400)*86400+2;
 const nums=[-400,600,-2000,800];
 for(let i=0;i<nums.length;i++)insert.run('round-'+i,t,t,'SETTLED','LOCAL_OWNER','R_100','CALL',100,nums[i]);
 let risk=trading.getRiskStatus();
 assert.equal(risk.dailyGrossLossCents,2400);
 assert.equal(risk.dailyGrossWinCents,1400);
 assert.equal(risk.dailyNetCents,-1000);
 assert.equal(risk.dailyNetLossCents,1000);
 assert.equal(risk.dailyRemainingRiskCents,9000);
 assert.equal(risk.dailyLossStopActive,false);
 insert.run('last',t,t,'SETTLED','LOCAL_OWNER','R_100','CALL',100,-9000);
 risk=trading.getRiskStatus();
 assert.equal(risk.dailyNetCents,-10000);
 assert.equal(risk.dailyLossStopActive,true);
 db.close();
});
test('Las compras sin liquidar reservan su pérdida potencial en el límite neto',()=>{
 const {db,trading,insert,brokerCalls}=setup();
 const t=Math.floor(epoch()/86400)*86400+3;
 insert.run('older',t,t,'SETTLED','LOCAL_OWNER','R_100','CALL',100,-9500);
 const pending=trading.requestIntent({symbol:'R_100',direction:'CALL',stakeCents:500,source:'LOCAL_OWNER'});
 assert.equal(trading.getRiskStatus().dailyRemainingRiskCents,0);
 assert.throws(()=>trading.requestIntent({symbol:'R_100',direction:'CALL',stakeCents:35,source:'LOCAL_OWNER'}),/DEMO_DAILY_NET_LOSS_EXPOSURE/);
 trading.cancel(pending.id);
 assert.equal(trading.getRiskStatus().dailyRemainingRiskCents,500);
 assert.equal(brokerCalls(),0);
 db.close();
});
test('Cruzando medianoche UTC manda la hora de liquidación, no la de compra',()=>{
 const {db,trading}=setup();
 const t=Math.floor(epoch()/86400)*86400;
 db.prepare("INSERT INTO demo_local_orders(id,created_at,updated_at,state,source,symbol,direction,stake_cents,pnl_cents,settled_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?)")
 .run('midnight',t-2,t+2,'SETTLED','LOCAL_OWNER','R_100','CALL',100,-100,(t+2)*1000);
 assert.equal(trading.getRiskStatus().dailySettled,1);
 assert.equal(trading.getRiskStatus().dailyNetCents,-100);
 db.close();
});
