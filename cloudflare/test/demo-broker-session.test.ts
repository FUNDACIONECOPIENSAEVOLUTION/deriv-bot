import {it,expect} from 'vitest';
import {validateDemoBrokerUrl,parseDemoProposalForBuy,buyDemoOverSocket,type DemoBuySessionArgs} from '../src/demo-broker-session';
const socketUrl='wss://api.derivws.com/trading/v1/options/ws/demo?otp=test';
const gate:DemoBuySessionArgs['gate']={accountType:'demo',currency:'USD',userEnabledDemoExecution:true,
  signal:'UP',openContracts:0,unknownCount:0,exposureCents:0,lifetimeNetCents:0,
  brokerBalanceCents:1_000_000,baselineBalanceCents:1_000_000,halted:false};
class Broker extends EventTarget {
 sent:Record<string,unknown>[]=[];
 constructor(private reply:(req:Record<string,unknown>)=>Record<string,unknown>|null){super();}
 send(raw:string){
  const req=JSON.parse(raw) as Record<string,unknown>;
  this.sent.push(req);
  const r=this.reply(req);
  queueMicrotask(()=>r?this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(r)})):
    this.dispatchEvent(new Event('close')));
 }
}
it('uses only OTP demo channel, never real',()=>{
 expect(validateDemoBrokerUrl(socketUrl)).toBe(socketUrl);
 expect(()=>validateDemoBrokerUrl('wss://api.derivws.com/trading/v1/options/ws/real?otp=t')).toThrow();
});
it('parses valid quote id and exact cost',()=>{
 const q=parseDemoProposalForBuy({msg_type:'proposal',req_id:1,
   proposal:{id:'Q'.repeat(40),ask_price:'0.50',payout:'0.90'}},1750000100,'DOWN',50);
 expect(q).toMatchObject({id:'Q'.repeat(40),contractType:'PUT',stakeCents:50,askPrice:0.50,payout:0.90});
});
it('makes exactly one 35-cent demo buy after durable reservation',async()=>{
 const events:string[]=[];
 const broker=new Broker(req=>req.proposal===1?
   {msg_type:'proposal',req_id:1,proposal:{id:'Q'.repeat(40),ask_price:'0.35',payout:'0.63'}}:
   {msg_type:'buy',req_id:2,buy:{contract_id:1234,buy_price:'0.35',purchase_time:1750000000}});
 const result=await buyDemoOverSocket(broker as unknown as WebSocket,{
  wsUrl:socketUrl,gate,stakeCents:35,
  reserve:async()=>{events.push('reserve');return 1;},
  acknowledge:async()=>{events.push('ack');}
 });
 expect(result).toEqual({state:'OPEN',contractId:1234,buyCents:35,purchaseTime:1750000000});
 expect(broker.sent).toHaveLength(2);
 expect(broker.sent[0]).toMatchObject({proposal:1,amount:0.35,contract_type:'CALL'});
 expect(broker.sent[1]).toMatchObject({buy:'Q'.repeat(40),price:0.35});
 expect(events).toEqual(['reserve','ack']);
});
it('rejects a too-small proposal without increasing the amount or buying',async()=>{
 const broker=new Broker(()=>({req_id:1,error:{code:'StakeTooSmall'}}));
 const result=await buyDemoOverSocket(broker as unknown as WebSocket,{
  wsUrl:socketUrl,gate,stakeCents:35,reserve:async()=>{throw Error('MUST_NOT_RESERVE');},
  acknowledge:async()=>{throw Error('MUST_NOT_ACK');}
 });
 expect(result).toEqual({state:'REJECTED',code:'StakeTooSmall'});
 expect(broker.sent).toHaveLength(1);
});
it('fails closed when reservation is unavailable',async()=>{
 const broker=new Broker(()=>({msg_type:'proposal',req_id:1,proposal:{id:'Q'.repeat(40),ask_price:'0.50',payout:'0.90'}}));
 await expect(buyDemoOverSocket(broker as unknown as WebSocket,{
   wsUrl:socketUrl,gate,stakeCents:50,reserve:async()=>{throw Error('DB_LOCK_FAILED');},
   acknowledge:async()=>{}
 })).rejects.toThrow('DB_LOCK_FAILED');
 expect(broker.sent).toHaveLength(1);
});
it('never retries an uncertain purchase on lost connection',async()=>{
 const broker=new Broker(req=>req.proposal===1?
   {msg_type:'proposal',req_id:1,proposal:{id:'Q'.repeat(40),ask_price:'1.00',payout:'1.80'}}:null);
 let reserved=0;
 await expect(buyDemoOverSocket(broker as unknown as WebSocket,{
   wsUrl:socketUrl,gate:{...gate,signal:'DOWN'},stakeCents:100,
   reserve:async()=>{reserved++;return 1;},acknowledge:async()=>{}
 })).rejects.toThrow('DEMO_BUY_OUTCOME_UNKNOWN');
 expect(reserved).toBe(1);
 expect(broker.sent).toHaveLength(2);
 expect(broker.sent[0].contract_type).toBe('PUT');
});
