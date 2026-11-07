import { it,expect } from 'vitest';
import { parseDemoProposalForBuy, validateDemoBrokerUrl } from '../src/demo-broker-session';
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
