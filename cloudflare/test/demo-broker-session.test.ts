import { it,expect } from 'vitest';
import { parseDemoProposalForBuy, validateDemoBrokerUrl, buyDemoOverSocket, type DemoBuySessionArgs } from '../src/demo-broker-session';
import { buildDemoBuyRequest,parseDemoSettlement } from '../src/demo-trade-guards';

it('keeps the validated OTP URL limited to the Deriv DEMO socket',()=>{
  const url='wss://api.derivws.com/trading/v1/options/ws/demo?otp=short-lived';
  expect(validateDemoBrokerUrl(url)).toBe(url);
  for(const value of [
    'wss://api.derivws.com/trading/v1/options/ws/real?otp=test',
    'wss://not-deriv.example/trading/v1/options/ws/demo?otp=test',
    'https://api.derivws.com/trading/v1/options/ws/demo?otp=test',
  ])expect(()=>validateDemoBrokerUrl(value)).toThrow();
});
it('takes an internal proposal ID but never returns it from the public quote route',()=>{
  const quote=parseDemoProposalForBuy({msg_type:'proposal',req_id:1,proposal:{
    id:'A'.repeat(48),ask_price:'0.10',payout:'0.19'
  }},1750000100);
  expect(quote).toEqual({
    id:'A'.repeat(48),askPrice:0.10,payout:0.19,quotedAt:1750000100,
    symbol:'R_100',contractType:'CALL',durationTicks:20,stake:0.10
  });
  expect(buildDemoBuyRequest({
    quote,accountType:'demo',currency:'USD',
    socketUrl:'wss://api.derivws.com/trading/v1/options/ws/demo?otp=test',
    userEnabledDemoExecution:true,signal:'UP',now:1750000100,todayTrades:0,todayLossCents:0,
    hasOpenContract:false,unresolvedBuy:false
  })).toEqual({buy:'A'.repeat(48),price:0.10,req_id:2});
});
it('rejects a broker proposal missing a buyable id, without guessing or increasing stake',()=>{
  expect(()=>parseDemoProposalForBuy({msg_type:'proposal',req_id:1,
    proposal:{ask_price:0.10,payout:0.18}},1750000100)).toThrow('DEMO_PROPOSAL_ID_INVALID');
  expect(()=>parseDemoProposalForBuy({msg_type:'proposal',req_id:1,
    error:{code:'StakeTooSmall',message:'raise the stake'}},1750000100)).toThrow('DEMO_PROPOSAL_REJECTED');
});
it('settles only a matching contract in USD, with broker supplied gain/loss',()=>{
  const raw={msg_type:'proposal_open_contract',req_id:3,
    proposal_open_contract:{contract_id:171717,contract_type:'CALL',currency:'USD',
      buy_price:'0.10',payout:'0.18',profit:'0.08',is_sold:1}};
  expect(parseDemoSettlement(raw,171717)?.profitCents).toBe(8);
  expect(()=>parseDemoSettlement({...raw,proposal_open_contract:{
    ...raw.proposal_open_contract,currency:'EUR'}},171717)).toThrow('DEMO_SETTLEMENT_INVALID_RESPONSE');
  expect(()=>parseDemoSettlement({...raw,proposal_open_contract:{
    ...raw.proposal_open_contract,contract_id:99999}},171717)).toThrow('DEMO_CONTRACT_ID_MISMATCH');
});

class SimulatedBroker extends EventTarget {
  sent:Record<string,unknown>[]=[];
  constructor(private respond:(request:Record<string,unknown>)=>Record<string,unknown>|null) {super();}
  send(body:string) {
    const request=JSON.parse(body) as Record<string,unknown>;
    this.sent.push(request);
    const reply=this.respond(request);
    queueMicrotask(()=>reply
      ?this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(reply)}))
      :this.dispatchEvent(new Event('close')));
  }
}
const gate:DemoBuySessionArgs['gate']={
  accountType:'demo',currency:'USD',userEnabledDemoExecution:true,
  signal:'UP',todayTrades:0,todayLossCents:0,hasOpenContract:false,unresolvedBuy:false
};
const socketUrl='wss://api.derivws.com/trading/v1/options/ws/demo?otp=test';
const proposal={msg_type:'proposal',req_id:1,proposal:{id:'Z'.repeat(40),ask_price:'0.10',payout:'0.18'}};

it('reserves the unknown-buy state BEFORE sending exactly one virtual DEMO buy',async()=>{
  const events:string[]=[];
  const socket=new SimulatedBroker(req=>{
    if(req.proposal===1)return proposal;
    if(req.buy==='Z'.repeat(40)){events.push('broker-buy');return {
      msg_type:'buy',req_id:2,buy:{contract_id:4567,buy_price:'0.10',purchase_time:1750000000}
    };}
    throw Error('unexpected order');
  });
  const output=await buyDemoOverSocket(socket as unknown as WebSocket,{
    wsUrl:socketUrl,gate,reserve:async()=>{events.push('reserved');return 1;},
    acknowledge:async(_id,ack)=>{events.push(ack.accepted?'confirmed':'rejected');}
  });
  expect(output).toEqual({state:'OPEN',contractId:4567,buyCents:10,purchaseTime:1750000000});
  expect(socket.sent.map(x=>x.req_id)).toEqual([1,2]);
  expect(events).toEqual(['reserved','broker-buy','confirmed']);
});

it('does not send buy when the broker rejects a 10-cent proposal',async()=>{
  let reserved=false;
  const socket=new SimulatedBroker(req=>req.proposal===1?
    {req_id:1,error:{code:'StakeTooSmall',message:'Raise stake'}}:null);
  const result=await buyDemoOverSocket(socket as unknown as WebSocket,{
    wsUrl:socketUrl,gate,reserve:async()=>{reserved=true;return 1;},
    acknowledge:async()=>{}
  });
  expect(result).toEqual({state:'REJECTED',code:'StakeTooSmall'});
  expect(reserved).toBe(false);
  expect(socket.sent).toHaveLength(1);
  expect(socket.sent[0]).toMatchObject({proposal:1,amount:0.10,duration:20});
});

it('cannot send buy if durable reservation fails or real-account gate is given',async()=>{
  const socket=new SimulatedBroker(req=>req.proposal===1?proposal:null);
  await expect(buyDemoOverSocket(socket as unknown as WebSocket,{
    wsUrl:socketUrl,gate,reserve:async()=>{throw Error('DB_LOCK_FAILED');},
    acknowledge:async()=>{}
  })).rejects.toThrow('DB_LOCK_FAILED');
  expect(socket.sent.map(x=>x.req_id)).toEqual([1]);
  const real=new SimulatedBroker(req=>req.proposal===1?proposal:null);
  await expect(buyDemoOverSocket(real as unknown as WebSocket,{
    wsUrl:socketUrl,gate:{...gate,accountType:'real'},
    reserve:async()=>1,acknowledge:async()=>{}
  })).rejects.toThrow('DEMO_ONLY');
  expect(real.sent.map(x=>x.req_id)).toEqual([1]);
});

it('reports unknown buy after connection loss and never retries the broker order',async()=>{
  let reservations=0,acks=0;
  const socket=new SimulatedBroker(req=>req.proposal===1?proposal:null);
  await expect(buyDemoOverSocket(socket as unknown as WebSocket,{
    wsUrl:socketUrl,gate,reserve:async()=>{reservations++;return 1;},
    acknowledge:async()=>{acks++;}
  })).rejects.toThrow('DEMO_BUY_OUTCOME_UNKNOWN');
  expect(reservations).toBe(1);
  expect(acks).toBe(0);
  expect(socket.sent.map(x=>x.req_id)).toEqual([1,2]);
});
