import { evaluateDemoRisk, DEMO_STAKES_CENTS, DEMO_MAX_OPEN } from './demo-risk-policy';

/** Strict broker DEMO-only order guards. Nothing in this file sends an order. */
export type DemoQuoteForBuy = {
  id:string;askPrice:number;payout:number;quotedAt:number;
  symbol:'R_100';contractType:'CALL'|'PUT';durationTicks:20;stakeCents:number;
};
export type DemoTradeGate = {
  accountType:'demo'|'real'|'unknown';currency:string;socketUrl:string;
  userEnabledDemoExecution:boolean;signal:'UP'|'DOWN'|'HOLD';
  quote:DemoQuoteForBuy;now:number;openContracts:number;unknownCount:number;
  exposureCents:number;lifetimeNetCents:number;brokerBalanceCents:number;
  baselineBalanceCents:number;halted:boolean;maxConcurrent?:number;
};
const cents=(input:unknown):number|null=>{
  if(typeof input!=='number' && !(typeof input==='string' && /^-?(?:0|[1-9][0-9]*)(?:[.][0-9]{1,8})?$/.test(input)))return null;
  const value=Number(input);
  if(!Number.isFinite(value)||Math.abs(value)>1_000_000)return null;
  const rounded=Math.round(value*100);
  return Math.abs(value*100-rounded)<0.000001?rounded:null;
};
export function buildDemoBuyRequest(gate:DemoTradeGate) {
  if(gate.accountType!=='demo'||gate.currency!=='USD')throw Error('DEMO_ONLY');
  let parsed:URL;
  try{parsed=new URL(gate.socketUrl);}catch{throw Error('DEMO_SOCKET_REQUIRED');}
  if(parsed.protocol!=='wss:'||parsed.hostname!=='api.derivws.com'
    ||parsed.pathname!=='/trading/v1/options/ws/demo'||parsed.username||parsed.password
    ||parsed.port||parsed.hash||parsed.searchParams.size!==1
    ||!parsed.searchParams.get('otp'))throw Error('DEMO_SOCKET_REQUIRED');
  if(!gate.userEnabledDemoExecution)throw Error('DEMO_EXECUTION_DISABLED');
  if(gate.signal!=='UP'&&gate.signal!=='DOWN')throw Error('NO_APPROVED_SIGNAL');
  const q=gate.quote;
  const risk=evaluateDemoRisk({
    openContracts:gate.openContracts,unknownCount:gate.unknownCount,
    exposureCents:gate.exposureCents,lifetimeNetCents:gate.lifetimeNetCents,
    brokerBalanceCents:gate.brokerBalanceCents,baselineBalanceCents:gate.baselineBalanceCents,
    halted:gate.halted,maxConcurrent:gate.maxConcurrent,stakeCents:q.stakeCents
  });
  if(!risk.allowed)throw Error(risk.reason);
  if(q.symbol!=='R_100'||q.contractType!==(gate.signal==='UP'?'CALL':'PUT')
    ||q.durationTicks!==20||!DEMO_STAKES_CENTS.some(v=>v===q.stakeCents))
      throw Error('DEMO_CONTRACT_NOT_ALLOWED');
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(q.id))throw Error('DEMO_PROPOSAL_ID_INVALID');
  if(!Number.isSafeInteger(gate.now)||!Number.isSafeInteger(q.quotedAt)
    ||gate.now<q.quotedAt||gate.now-q.quotedAt>8)throw Error('DEMO_QUOTE_STALE');
  const askCents=cents(q.askPrice),payoutCents=cents(q.payout);
  if(askCents!==q.stakeCents||payoutCents===null||payoutCents<askCents)
    throw Error('DEMO_PRICE_NOT_ALLOWED');
  return Object.freeze({buy:q.id,price:q.stakeCents/100,req_id:2} as const);
}
export type DemoBuyAck =
  |{accepted:true;contractId:number;buyCents:number;purchaseTime:number}
  |{accepted:false;code:string};

export function parseDemoBuyResponse(raw:unknown,expectedStakeCents:number):DemoBuyAck {
  if(!DEMO_STAKES_CENTS.some(x=>x===expectedStakeCents))throw Error('DEMO_STAKE_INVALID');
  if(!raw||typeof raw!=='object')throw Error('DEMO_BUY_INVALID_RESPONSE');
  const x=raw as Record<string,unknown>;
  if(x.req_id!==undefined&&x.req_id!==2)throw Error('DEMO_BUY_WRONG_REQUEST');
  const error=(x.error&&typeof x.error==='object'?x.error:Array.isArray(x.errors)?x.errors[0]:null) as Record<string,unknown>|null;
  if(error){const code=typeof error.code==='string'&&/^[A-Za-z0-9_]{1,64}$/.test(error.code)?error.code:'REJECTED';return {accepted:false,code};}
  if(x.msg_type!=='buy'||!x.buy||typeof x.buy!=='object')throw Error('DEMO_BUY_INVALID_RESPONSE');
  const buy=x.buy as Record<string,unknown>,id=buy.contract_id,price=cents(buy.buy_price);
  if(typeof id!=='number'||!Number.isSafeInteger(id)||id<=0||price!==expectedStakeCents
    ||typeof buy.purchase_time!=='number'||!Number.isSafeInteger(buy.purchase_time)||buy.purchase_time<=0)
    throw Error('DEMO_BUY_INVALID_RESPONSE');
  return {accepted:true,contractId:id,buyCents:price,purchaseTime:buy.purchase_time};
}

export type DemoSettlement={contractId:number;sold:true;profitCents:number;buyCents:number;payoutCents:number;outcome:'WIN'|'LOSS'|'FLAT';entrySpot?:number;exitSpot?:number};
export function parseDemoSettlement(raw:unknown,expectedContractId:number,
  expectedType?:'CALL'|'PUT',expectedStakeCents?:number):DemoSettlement|null {
  if(!Number.isSafeInteger(expectedContractId)||expectedContractId<=0)throw Error('DEMO_CONTRACT_INVALID_ID');
  if(!raw||typeof raw!=='object')throw Error('DEMO_SETTLEMENT_INVALID_RESPONSE');
  const message=raw as Record<string,unknown>;
  if(message.msg_type!=='proposal_open_contract'||!message.proposal_open_contract||typeof message.proposal_open_contract!=='object')
    throw Error('DEMO_SETTLEMENT_INVALID_RESPONSE');
  const data=message.proposal_open_contract as Record<string,unknown>;
  if(data.contract_id!==expectedContractId)throw Error('DEMO_CONTRACT_ID_MISMATCH');
  if(data.is_sold===false||data.is_sold===0)return null;
  if(data.is_sold!==true&&data.is_sold!==1)throw Error('DEMO_SETTLEMENT_INVALID_RESPONSE');
  if(data.currency!==undefined&&data.currency!=='USD')throw Error('DEMO_SETTLEMENT_INVALID_RESPONSE');
  if(data.contract_type!==undefined&&data.contract_type!=='CALL'&&data.contract_type!=='PUT')throw Error('DEMO_SETTLEMENT_WRONG_TYPE');
  if(expectedType&&data.contract_type!==undefined&&data.contract_type!==expectedType)
    throw Error('DEMO_SETTLEMENT_WRONG_TYPE');
  if(data.underlying_symbol!==undefined&&data.underlying_symbol!=='R_100')throw Error('DEMO_SETTLEMENT_WRONG_SYMBOL');
  const profit=cents(data.profit),buy=cents(data.buy_price),payout=cents(data.payout);
  if(profit===null||buy===null||(expectedStakeCents!==undefined&&buy!==expectedStakeCents)||payout===null||payout<0)
    throw Error('DEMO_SETTLEMENT_INVALID_RESPONSE');
  const spot=(x:unknown)=>{
    if(x===null||x===undefined)return undefined;
    if(typeof x!=='number'&&!(typeof x==='string'&&/^(?:0|[1-9][0-9]*)(?:[.][0-9]{1,12})?$/.test(x)))
      throw Error('DEMO_SETTLEMENT_INVALID_SPOT');
    const v=Number(x);if(!Number.isFinite(v)||v<=0)return undefined;
    return v;
  };
  const entrySpot=spot(data.entry_spot),exitSpot=spot(data.exit_spot);
  return {contractId:expectedContractId,sold:true,profitCents:profit,buyCents:buy,
    payoutCents:payout,outcome:profit>0?'WIN':profit<0?'LOSS':'FLAT',
    ...(entrySpot===undefined?{}:{entrySpot}),
    ...(exitSpot===undefined?{}:{exitSpot})};
}

export function demoPerformance(settlements:readonly DemoSettlement[]) {
  let wins=0,losses=0,flats=0,pnlCents=0;
  for(const s of settlements){
    if(s.outcome==='WIN')wins++;
    else if(s.outcome==='LOSS')losses++;
    else flats++;
    pnlCents+=s.profitCents;
  }
  const settled=settlements.length;
  return {settled,wins,losses,flats,pnlCents,winRatePct:settled?Math.round(wins/settled*10000)/100:null,
    avgProfitCents:settled?Math.round(pnlCents/settled):null};
}
