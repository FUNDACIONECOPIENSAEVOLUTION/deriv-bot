import { describe,it,expect } from 'vitest';
import { buildDemoBuyRequest, parseDemoBuyResponse, parseDemoSettlement, demoPerformance, type DemoTradeGate } from '../src/demo-trade-guards';

const proposalId='A'.repeat(40);
const demoSocket='wss://api.derivws.com/trading/v1/options/ws/demo?otp=ephemeral-token';
const gate:DemoTradeGate={
  accountType:'demo',currency:'USD',socketUrl:demoSocket,userEnabledDemoExecution:true,
  signal:'UP',quote:{id:proposalId,askPrice:1,payout:1.8,quotedAt:1750000100,
    stake:1,symbol:'R_100',contractType:'CALL',durationTicks:20},
  now:1750000101,todayTrades:0,todayLossCents:0,hasOpenContract:false,unresolvedBuy:false
};

describe('future demo-only order gating',()=>{
  it('builds a single proposal-id buy with fixed USD 1 price without sending anything',()=>{
    expect(buildDemoBuyRequest(gate)).toEqual({buy:proposalId,price:1,req_id:2});
  });
  it.each([
    [{accountType:'real'},'DEMO_ONLY'],
    [{accountType:'unknown'},'DEMO_ONLY'],
    [{currency:'EUR'},'DEMO_ONLY'],
    [{socketUrl:'wss://api.derivws.com/trading/v1/options/ws/real?otp=secret'},'DEMO_SOCKET_REQUIRED'],
    [{socketUrl:'wss://attacker.example/trading/v1/options/ws/demo?otp=secret'},'DEMO_SOCKET_REQUIRED'],
    [{socketUrl:'wss://api.derivws.com/trading/v1/options/ws/demo?otp=secret&redirect=evil'},'DEMO_SOCKET_REQUIRED'],
    [{userEnabledDemoExecution:false},'DEMO_EXECUTION_DISABLED'],
    [{signal:'HOLD'},'NO_APPROVED_SIGNAL'],
    [{signal:'DOWN'},'DEMO_CONTRACT_NOT_ALLOWED'],
    [{openContracts:10,activeExposureCents:1000},'DEMO_MAX_OPEN'],
    [{unresolvedBuy:true},'DEMO_BUY_OUTCOME_UNKNOWN'],
    [{dailyNetPnlCents:-10,dailySettled:10,lifetimePnlCents:-10},'DEMO_DAY_NOT_PROFITABLE'],
    [{dailyNetPnlCents:80,dailySettled:20,haltedToday:true},'DEMO_DAY_HALTED'],
    [{openContracts:9,activeExposureCents:900,dailyNetPnlCents:-2},'DEMO_DAILY_RISK_FLOOR'],
    [{now:1750000110},'DEMO_QUOTE_STALE'],
    [{quote:{...gate.quote,id:'short'}},'DEMO_PROPOSAL_ID_INVALID'],
    [{quote:{...gate.quote,askPrice:1.01}},'DEMO_PRICE_NOT_ALLOWED'],
    [{quote:{...gate.quote,askPrice:0.99}},'DEMO_PRICE_NOT_ALLOWED'],
    [{quote:{...gate.quote,stake:2}},'DEMO_CONTRACT_NOT_ALLOWED'],
    [{quote:{...gate.quote,durationTicks:40}},'DEMO_CONTRACT_NOT_ALLOWED'],
  ] as const)('blocks unsafe input %#',(change,code)=>{
    expect(()=>buildDemoBuyRequest({...gate,...change} as DemoTradeGate)).toThrow(code);
  });
  it('accepts an explicit DOWN signal with broker PUT proposal, not a CALL',()=>{
    const put={...gate,signal:'DOWN' as const,quote:{...gate.quote,contractType:'PUT' as const}};
    expect(buildDemoBuyRequest(put)).toEqual({buy:proposalId,price:1,req_id:2});
    expect(()=>buildDemoBuyRequest({...put,quote:gate.quote})).toThrow('DEMO_CONTRACT_NOT_ALLOWED');
  });
});
describe('buy and payout record parsing',()=>{
  it('recognizes a broker-confirmed demo purchase',()=>{
    expect(parseDemoBuyResponse({msg_type:'buy',req_id:2,buy:{
      contract_id:1234567,buy_price:'1.00',purchase_time:1750000101
    }})).toEqual({accepted:true,contractId:1234567,buyCents:100,purchaseTime:1750000101});
  });
  it('distinguishes a broker rejection from a purchase',()=>{
    expect(parseDemoBuyResponse({msg_type:'buy',req_id:2,error:{code:'StakeTooSmall',message:'Increase amount'}}))
      .toEqual({accepted:false,code:'StakeTooSmall'});
    expect(()=>parseDemoBuyResponse({msg_type:'buy',req_id:3,buy:{contract_id:1,buy_price:1,purchase_time:1750000000}}))
      .toThrow('DEMO_BUY_WRONG_REQUEST');
    expect(()=>parseDemoBuyResponse({msg_type:'buy',req_id:2,buy:{contract_id:123,buy_price:2.0,purchase_time:1750000000}}))
      .toThrow('DEMO_BUY_INVALID_RESPONSE');
  });
  it('records only settled contracts with the exact ID, keeping amounts signed',()=>{
    const open={msg_type:'proposal_open_contract',proposal_open_contract:{
      contract_id:123, currency:'USD', buy_price:'1.00',payout:'1.80', profit:'0.80',is_sold:0
    }};
    expect(parseDemoSettlement(open,123)).toBeNull();
    const won=parseDemoSettlement({...open,proposal_open_contract:{...open.proposal_open_contract,is_sold:1}},123);
    expect(won).toEqual({contractId:123,sold:true,profitCents:80,buyCents:100,payoutCents:180,outcome:'WIN'});
    const lost=parseDemoSettlement({...open,proposal_open_contract:{...open.proposal_open_contract,is_sold:1,profit:'-1.00'}},123);
    expect(lost?.outcome).toBe('LOSS');
    expect(demoPerformance([won!,lost!])).toEqual({settled:2,wins:1,losses:1,flats:0,pnlCents:-20,winRatePct:50,avgProfitCents:-10});
    expect(()=>parseDemoSettlement({...open,proposal_open_contract:{...open.proposal_open_contract,contract_id:999,is_sold:1}},123))
      .toThrow('DEMO_CONTRACT_ID_MISMATCH');
  });
});

describe('up to ten concurrent virtual DEMO contracts under USD 10',()=>{
 it('allows a tenth DEMO contract with USD 1 max total exposure',()=>{
   const tenth={...gate,openContracts:9,activeExposureCents:900,
     lifetimePnlCents:0,dailyNetPnlCents:0,dailySettled:0};
   expect(buildDemoBuyRequest(tenth)).toEqual({buy:proposalId,price:1,req_id:2});
   expect(()=>buildDemoBuyRequest({...tenth,openContracts:10,activeExposureCents:1000}))
     .toThrow('DEMO_MAX_OPEN');
   expect(()=>buildDemoBuyRequest({...tenth,openContracts:2,activeExposureCents:100}))
     .toThrow('DEMO_RISK_INVALID');
 });
 it('keeps going after positive demo results, regardless of daily number of wins',()=>{
   expect(buildDemoBuyRequest({...gate,todayTrades:300,dailySettled:300,
     dailyNetPnlCents:80,lifetimePnlCents:80}))
      .toEqual({buy:proposalId,price:1,req_id:2});
 });
 it('blocks when demo funding allocation is spent',()=>{
   expect(()=>buildDemoBuyRequest({...gate,lifetimePnlCents:-995}))
     .toThrow('DEMO_RESEARCH_ALLOCATION');
 });
});

it('blocks the eleventh virtual purchase even when the first ten trades are profitable',()=>{
  expect(()=>buildDemoBuyRequest({...gate,firstBatchBuys:10,dailySettled:10,dailyNetPnlCents:200,
    lifetimePnlCents:200})).toThrow('DEMO_FIRST_BATCH_COMPLETE');
  expect(buildDemoBuyRequest({...gate,firstBatchBuys:9}).price).toBe(1);
});
