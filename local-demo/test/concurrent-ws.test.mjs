import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createDemoTrading} from '../demo-trading.mjs';

test('Five separate DEMO websocket approvals settle concurrently without real network',async()=>{
 const original=globalThis.WebSocket;
 let contract=970000,active=0,peak=0;
 class FakeWs extends EventTarget {
  constructor(url){
   super();assert.match(url,/\/ws\/demo/);
   active++;peak=Math.max(peak,active);
   queueMicrotask(()=>this.dispatchEvent(new Event('open')));
  }
  send(raw){
   const request=JSON.parse(raw);
   let reply;
   if(request.proposal)reply={msg_type:'proposal',req_id:request.req_id,
    proposal:{id:'q'.repeat(40),ask_price:0.50,payout:0.85}};
   else if(request.buy)reply={msg_type:'buy',req_id:request.req_id,
    buy:{contract_id:++contract,buy_price:0.50}};
   else if(request.proposal_open_contract)reply={msg_type:'proposal_open_contract',
    req_id:request.req_id,proposal_open_contract:{contract_id:request.contract_id,
     is_sold:1,profit:0.35,
     entry_tick:100.21,exit_tick:100.45,
     entry_tick_time:1762637000,exit_tick_time:1762637010}};
   else throw Error('UNEXPECTED_REQUEST');
   queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(reply)})));
  }
  close(){active=Math.max(0,active-1);this.dispatchEvent(new Event('close'));}
 }
 globalThis.WebSocket=FakeWs;
 const db=new DatabaseSync(':memory:');
 const account={accountId:'VRTC-DEMO-FAKE',currency:'USD',balance:10000,
  checkedAt:Math.floor(Date.now()/1000)};
 const market={symbol:'R_100',direction:'CALL',available:true,ready:true,candleCount:60,
  fresh:true,ageReceivedMs:100,epoch:Math.floor(Date.now()/1000),
  rsi14:59,sma8:101,sma21:100,ema20:103,ema50:102,atr14:0.4,
  momentum5:0.02,signalStrength:70};
 try{
  const trading=createDemoTrading({db,
   getAccount:()=>account,getCredentials:async()=>({accountId:account.accountId}),
   brokerHeaders:()=>({}),accountLookup:async()=>account,
   otpLookup:async()=> 'wss://api.derivws.com/trading/v1/options/ws/demo?otp=MOCK',
   marketSnapshot:()=>market,audit:()=>{}
  });
  const requests=Array.from({length:5},()=>trading.requestIntent({
   symbol:'R_100',direction:'CALL',stakeCents:50,source:'LOCAL_OWNER'
  }));
  assert.equal(trading.getSummary().awaitingApproval,5);
  const settled=await Promise.all(requests.map(x=>trading.approve(x.id,'CONFIRMAR COMPRA DEMO')));
  assert.equal(settled.length,5);
  assert.ok(settled.every(x=>x.state==='SETTLED'&&x.brokerOrders===1));
  assert.equal(new Set(settled.map(x=>x.contractId)).size,5);
  assert.ok(peak>=2,'more than one independent DEMO websocket must overlap');
  const totals=trading.getSummary();
  assert.equal(totals.campaignPurchases,5);
  assert.equal(totals.pendingOrOpen,0);
  assert.equal(totals.settled,5);
  assert.equal(totals.netCents,175);
  assert.equal(totals.maxConcurrent,5);
  assert.ok(trading.canUpdate());
  const csv=trading.exportCsv('all');
  assert.match(csv,/ema20/);
  assert.match(csv,/proposalPayoutCents/);
  assert.match(csv,/entryTick/);
  assert.ok(totals.orders.every(x=>x.entryTick===100.21&&x.exitTick===100.45));
 }finally{
  db.close();globalThis.WebSocket=original;
 }
});
