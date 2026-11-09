import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createDemoTrading} from '../demo-trading.mjs';

test('Five separate DEMO websocket approvals settle concurrently without real network',async()=>{
 const original=globalThis.WebSocket;
 let contract=970000,active=0,peak=0;const proposalDurations=[];
 class FakeWs extends EventTarget {
  constructor(url){
   super();assert.match(url,/\/ws\/demo/);
   active++;peak=Math.max(peak,active);
   queueMicrotask(()=>this.dispatchEvent(new Event('open')));
  }
  send(raw){
   const request=JSON.parse(raw);
   let reply;
   if(request.proposal){
    proposalDurations.push(request.duration);
    reply={msg_type:'proposal',req_id:request.req_id,
     proposal:{id:'q'.repeat(40),ask_price:0.50,payout:0.85}};
   }
   else if(request.buy)reply={msg_type:'buy',req_id:request.req_id,
    buy:{contract_id:++contract,buy_price:0.50}};
   else if(request.proposal_open_contract)reply={msg_type:'proposal_open_contract',
    req_id:request.req_id,proposal_open_contract:{contract_id:request.contract_id,
     is_sold:1,profit:0.35,
     entry_spot:'100.21',exit_spot:'100.45',
     entry_spot_time:1762637000,exit_spot_time:1762637010}};
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
  momentum5:0.02,signalStrength:70,
  candles:[
   ...Array.from({length:19},(_,i)=>({open:100+i*.01,high:100.2+i*.01,
    low:99.9+i*.01,close:100.1+i*.01,epoch:Math.floor(Date.now()/1000)-20+i})),
   {open:100.1,high:100.8,low:99.9,close:100.7,epoch:Math.floor(Date.now()/1000)-1}
  ],
  lastPrices:Array.from({length:40},(_,i)=>100+i*.004),
  projectedNextTick:100.75,modelMae:0.12,naiveMae:0.13,
  fiveTickMomentum:-0.32,tickRsi14:43,fiveTickStudy:{hitRate:.57,holdoutCount:20},
  reason:'TENDENCIA_ALCISTA_MULTIFACTOR',
  tickHorizonModels:[{durationTicks:10,direction:'CALL',selectedPolicy:'MOMENTUM_20',
   trainingDecisions:41,validationDecisions:26,observedValidationHitRate:.65,
   conservativeWinRateLower95:.40,readyForProposal:false}]};
 try{
  const trading=createDemoTrading({db,
   getAccount:()=>account,getCredentials:async()=>({accountId:account.accountId}),
   brokerHeaders:()=>({}),accountLookup:async()=>account,
   otpLookup:async()=> 'wss://api.derivws.com/trading/v1/options/ws/demo?otp=MOCK',
   marketSnapshot:()=>market,audit:()=>{}
  });
  const requests=Array.from({length:5},(_,i)=>trading.requestIntent({
   symbol:'R_100',direction:'CALL',stakeCents:50,source:'LOCAL_OWNER',
   ...(i===0?{durationTicks:10,modelMode:'DEMO_EXPLORATORY_5_10'}:{})
  }));
  assert.equal(trading.getSummary().awaitingApproval,5);
  const settled=await Promise.all(requests.map(x=>trading.approve(x.id,'CONFIRMAR COMPRA DEMO')));
  assert.equal(settled.length,5);
  assert.ok(settled.every(x=>x.state==='SETTLED'&&x.brokerOrders===1));
  assert.equal(new Set(settled.map(x=>x.contractId)).size,5);
  assert.ok(peak>=2,'more than one independent DEMO websocket must overlap');
  assert.equal(proposalDurations.length,5);
  assert.equal(proposalDurations.filter(x=>x===10).length,1);
  assert.equal(proposalDurations.filter(x=>x===5).length,4);
  const totals=trading.getSummary();
  assert.ok(totals.orders.some(row=>row.durationTicks===10&&
   row.predictionMode==='DEMO_EXPLORATORY_5_10'&&row.state==='SETTLED'));
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
  assert.ok(totals.orders.every(x=>x.diagnosis.code==='DIRECCION_FAVORABLE'));
  assert.ok(totals.orders.every(x=>x.candleOpen===100.1&&x.candleClose===100.7));
  assert.ok(totals.orders.every(x=>x.projectedNextTick===100.75&&x.modelMae===0.12));
  assert.match(csv,/candleEpoch/);
  assert.match(csv,/projectedNextTick/);
  assert.ok(totals.orders.every(x=>x.fiveTickMomentum===-0.32&&x.tickRsi14===43));
  assert.ok(totals.orders.every(x=>x.fiveTickStudyHitRate===.57&&x.fiveTickStudyN===20));
  assert.ok(totals.orders.every(x=>x.signalReason==='TENDENCIA_ALCISTA_MULTIFACTOR'));
  const archives=db.prepare('SELECT id,state,bought_at_ms,candle_context_json,candle_context_captured_ms,candle_pattern_version FROM demo_local_orders').all();
  assert.equal(archives.length,5);
  for(const x of archives){
   assert.equal(x.candle_pattern_version,'CANDLE_CONTEXT_V1');
   const context=JSON.parse(x.candle_context_json);
   assert.equal(context.candles.length,20);
   assert.equal(context.lastTickPrices.length,30);
   assert.ok(context.capturedAtMs<=x.bought_at_ms,'se captura ANTES de confirmar BUY');
   assert.equal(context.candles.at(-1).close,100.7);
   assert.equal(context.source,'OHLC_CLOSED_BEFORE_BROKER_BUY');
  }
  assert.match(csv,/fiveTickMomentum,tickRsi14,fiveTickStudyHitRate/);
  assert.match(csv,/diagnosisCode/);
  const trace=totals.orders;
  for(const field of ['intentReceivedAtMs','proposalSentAtMs','proposalReceivedAtMs',
   'buyAttemptAtMs','buyAckAtMs','accountLookupMs','otpLookupMs','wsConnectMs',
   'preBuyValidationMs']){
    assert.ok(trace.every(row=>Number.isFinite(row[field])),field);
  }
  assert.ok(trace.every(row=>row.buyAttemptAtMs<=row.buyAckAtMs));
  assert.ok(trace.every(row=>row.buyAckAtMs<=row.settledAtMs));
  assert.ok(trace.every(row=>row.selectedAtMs===null));
  for(const field of ['intentToQuoteMs','quoteToBuyMs','intentToBuyMs',
   'buyFeedToBuyMs','buyAttemptToSettlementMs','buyAckToSettlementMs',
   'analyzer5ComputeMs','analyzer10ComputeMs','timingSchemaVersion']){
   assert.ok(csv.includes(field),field);
  }
 }finally{
  db.close();globalThis.WebSocket=original;
 }
});
