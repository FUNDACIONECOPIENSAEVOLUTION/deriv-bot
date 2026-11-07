import {describe,it,expect} from 'vitest';
import {buildDemoBuyRequest,parseDemoBuyResponse,parseDemoSettlement,demoPerformance,
type DemoTradeGate} from '../src/demo-trade-guards';
const q={id:'A'.repeat(40),askPrice:0.35,payout:0.63,quotedAt:1750000100,
  symbol:'R_100' as const,contractType:'CALL' as const,durationTicks:5 as const,stakeCents:35};
const gate:DemoTradeGate={accountType:'demo',currency:'USD',
 socketUrl:'wss://api.derivws.com/trading/v1/options/ws/demo?otp=short-lived',userEnabledDemoExecution:true,
 signal:'UP',quote:q,now:1750000101,openContracts:0,unknownCount:0,exposureCents:0,
 lifetimeNetCents:0,brokerBalanceCents:1_000_000,baselineBalanceCents:1_000_000,halted:false};
describe('broker DEMO guard',()=>{
 it.each([35,50,75,100])('buys exactly %i virtual cents after a matching quote',stake=>{
   const item={...gate,quote:{...q,stakeCents:stake,askPrice:stake/100,payout:stake/100*1.8}};
   expect(buildDemoBuyRequest(item)).toEqual({buy:q.id,price:stake/100,req_id:2});
 });
 it('requires specific demo account and OTP URL, never account real',()=>{
   expect(()=>buildDemoBuyRequest({...gate,accountType:'real'})).toThrow('DEMO_ONLY');
   expect(()=>buildDemoBuyRequest({...gate,socketUrl:'wss://api.derivws.com/trading/v1/options/ws/real?otp=t'}))
      .toThrow('DEMO_SOCKET_REQUIRED');
   expect(()=>buildDemoBuyRequest({...gate,socketUrl:'wss://evil.example/trading/v1/options/ws/demo?otp=t'}))
      .toThrow('DEMO_SOCKET_REQUIRED');
 });
 it('enforces exact signal and contract type before purchase',()=>{
   expect(()=>buildDemoBuyRequest({...gate,signal:'HOLD'})).toThrow('NO_APPROVED_SIGNAL');
   expect(()=>buildDemoBuyRequest({...gate,signal:'DOWN'})).toThrow('DEMO_CONTRACT_NOT_ALLOWED');
   expect(buildDemoBuyRequest({...gate,signal:'DOWN',quote:{...q,contractType:'PUT'}}).price).toBe(0.35);
 });
 it('blocks stale quotes and unapproved prices',()=>{
   expect(()=>buildDemoBuyRequest({...gate,now:1750000130})).toThrow('DEMO_QUOTE_STALE');
   expect(()=>buildDemoBuyRequest({...gate,quote:{...q,id:'short'}})).toThrow('DEMO_PROPOSAL_ID_INVALID');
   expect(()=>buildDemoBuyRequest({...gate,quote:{...q,askPrice:0.2}})).toThrow('DEMO_PRICE_NOT_ALLOWED');
 });
 it('reserves US$100 virtual loss including pending contracts',()=>{
   expect(()=>buildDemoBuyRequest({...gate,brokerBalanceCents:990000})).toThrow('DEMO_LOSS_100_REACHED');
   expect(()=>buildDemoBuyRequest({...gate,unknownCount:1,exposureCents:50})).toThrow('DEMO_BUY_OUTCOME_UNKNOWN');
 });
});
describe('broker acknowledgement and closing contracts',()=>{
 it('requires purchase cost to match the exact stake',()=>{
   const msg={msg_type:'buy',req_id:2,buy:{contract_id:1234,buy_price:'0.50',purchase_time:1750000000}};
   expect(parseDemoBuyResponse(msg,50)).toEqual({accepted:true,contractId:1234,buyCents:50,purchaseTime:1750000000});
   expect(()=>parseDemoBuyResponse(msg,35)).toThrow('DEMO_BUY_INVALID_RESPONSE');
   expect(parseDemoBuyResponse({msg_type:'buy',req_id:2,error:{code:'StakeTooSmall'}},35))
      .toEqual({accepted:false,code:'StakeTooSmall'});
 });
 it('verifies settlement ID, account cost and the direction',()=>{
   const raw={msg_type:'proposal_open_contract',proposal_open_contract:{
      contract_id:1234,is_sold:1,buy_price:'0.50',payout:'0.90',profit:'0.40',
      contract_type:'PUT',currency:'USD',underlying_symbol:'R_100'}};
   const win=parseDemoSettlement(raw,1234,'PUT',50)!;
   expect(win).toMatchObject({outcome:'WIN',profitCents:40,buyCents:50,payoutCents:90});
   expect(()=>parseDemoSettlement(raw,1234,'CALL',50)).toThrow('DEMO_SETTLEMENT_WRONG_TYPE');
   expect(()=>parseDemoSettlement(raw,1234,'PUT',100)).toThrow('DEMO_SETTLEMENT_INVALID_RESPONSE');
   expect(()=>parseDemoSettlement(raw,999,'PUT',50)).toThrow('DEMO_CONTRACT_ID_MISMATCH');
   expect(demoPerformance([win]).winRatePct).toBe(100);
 });
});
