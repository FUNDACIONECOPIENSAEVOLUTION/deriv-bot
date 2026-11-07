import { assessDailyDemoRisk, DEMO_ALLOCATION_CENTS, DEMO_MAX_OPEN, DEMO_STAKE_CENTS } from './demo-risk-policy';

/**
 * Side-effect-free safety gate for a future broker DEMO order executor.
 *
 * This module NEVER opens a socket or sends a buy instruction. It can only
 * produce a candidate buy message after strict demo-only checks.
 * Calling it must not be interpreted as a completed or permitted purchase.
 */
export type DemoQuoteForBuy = {
  id:string; askPrice:number; payout:number; quotedAt:number;
  symbol:'R_100'; contractType:'CALL'|'PUT'; durationTicks:20; stake:0.10;
};
export type DemoTradeGate = {
  accountType:'demo'|'real'|'unknown';
  currency:string;
  socketUrl:string;
  userEnabledDemoExecution:boolean;
  signal:'UP'|'DOWN'|'HOLD';
  quote:DemoQuoteForBuy;
  now:number;
  todayTrades:number;
  todayLossCents:number;
  hasOpenContract:boolean;
  unresolvedBuy:boolean;
  /** Confirmed DEMO contracts open at the broker, separate from unknown acknowledgements. */
  openContracts?:number;
  /** Reserved worst-case loss of all OPEN/UNKNOWN contracts in cents. */
  activeExposureCents?:number;
  /** Total realized broker-verified P&L, all days, in cents. */
  lifetimePnlCents?:number;
  /** Signed daily broker-verified net P&L, not cumulative loss of losing tickets. */
  dailyNetPnlCents?:number;
  /** Count of today's broker-confirmed settled contracts. */
  dailySettled?:number;
  /** Sticky day-stop stored in the database, not recalculated away when late trades settle. */
  haltedToday?:boolean;
};

const MAX_STAKE_CENTS=10;
export const DEMO_RESEARCH_ALLOCATION_CENTS=DEMO_ALLOCATION_CENTS;
export const DEMO_MAX_PARALLEL_CONTRACTS=DEMO_MAX_OPEN;
const MAX_QUOTE_AGE_SECONDS=8;

const cents=(input:unknown):number|null=>{
  if(typeof input!=='number' && !(typeof input==='string' && /^-?(?:0|[1-9][0-9]*)(?:[.][0-9]{1,8})?$/.test(input)))return null;
  const value=Number(input);
  if(!Number.isFinite(value)||Math.abs(value)>1_000_000)return null;
  const rounded=Math.round(value*100);
  return Math.abs(value*100-rounded)<0.000001?rounded:null;
};

export function buildDemoBuyRequest(gate:DemoTradeGate){
  if(gate.accountType!=='demo'||gate.currency!=='USD')throw Error('DEMO_ONLY');
  let parsed:URL;
  try{parsed=new URL(gate.socketUrl);}catch{throw Error('DEMO_SOCKET_REQUIRED');}
  if(parsed.protocol!=='wss:'||parsed.hostname!=='api.derivws.com'
    ||parsed.pathname!=='/trading/v1/options/ws/demo'
    ||parsed.username||parsed.password||parsed.port||parsed.hash
    ||parsed.searchParams.size!==1||!parsed.searchParams.get('otp'))throw Error('DEMO_SOCKET_REQUIRED');
  if(!gate.userEnabledDemoExecution)throw Error('DEMO_EXECUTION_DISABLED');
  if(gate.signal!=='UP'&&gate.signal!=='DOWN')throw Error('NO_APPROVED_SIGNAL');
  const open=gate.openContracts===undefined?(gate.hasOpenContract?DEMO_MAX_OPEN:0):gate.openContracts;
  const exposure=gate.activeExposureCents===undefined?open*DEMO_STAKE_CENTS:gate.activeExposureCents;
  const lifetime=gate.lifetimePnlCents??0;
  const dailyNet=gate.dailyNetPnlCents??-gate.todayLossCents;
  if(!Number.isSafeInteger(gate.todayTrades)||gate.todayTrades<0)throw Error('DEMO_RISK_INVALID');
  const risk=assessDailyDemoRisk({
    openContracts:open,unknownCount:gate.unresolvedBuy?1:0,
    exposureCents:exposure,lifetimeNetCents:lifetime,
    dailyNetCents:dailyNet,dailySettled:gate.dailySettled??0,haltedToday:gate.haltedToday===true
  });
  if(!risk.allowed)throw Error(risk.reason);
  const q=gate.quote;
  const requiredType=gate.signal==='UP'?'CALL':'PUT';
  if(q.symbol!=='R_100'||q.contractType!==requiredType||q.durationTicks!==20||q.stake!==0.10)
    throw Error('DEMO_CONTRACT_NOT_ALLOWED');
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(q.id))throw Error('DEMO_PROPOSAL_ID_INVALID');
  if(!Number.isSafeInteger(gate.now)||!Number.isSafeInteger(q.quotedAt)
    ||gate.now<q.quotedAt||gate.now-q.quotedAt>MAX_QUOTE_AGE_SECONDS)throw Error('DEMO_QUOTE_STALE');
  const askCents=cents(q.askPrice),payoutCents=cents(q.payout);
  if(askCents!==MAX_STAKE_CENTS||payoutCents===null||payoutCents<MAX_STAKE_CENTS)
    throw Error('DEMO_PRICE_NOT_ALLOWED');
  return Object.freeze({buy:q.id,price:0.10,req_id:2} as const);
}

export type DemoBuyAck =
  |{accepted:true;contractId:number;buyCents:number;purchaseTime:number}
  |{accepted:false;code:string};

export function parseDemoBuyResponse(raw:unknown):DemoBuyAck {
  if(!raw||typeof raw!=='object')throw Error('DEMO_BUY_INVALID_RESPONSE');
  const x=raw as Record<string,unknown>;
  if(x.req_id!==undefined&&x.req_id!==2)throw Error('DEMO_BUY_WRONG_REQUEST');
  const error=(x.error&&typeof x.error==='object'?x.error:Array.isArray(x.errors)?x.errors[0]:null) as Record<string,unknown>|null;
  if(error){const code=typeof error.code==='string'&&/^[A-Za-z0-9_]{1,64}$/.test(error.code)?error.code:'REJECTED';return {accepted:false,code};}
  if(x.msg_type!=='buy'||!x.buy||typeof x.buy!=='object')throw Error('DEMO_BUY_INVALID_RESPONSE');
  const buy=x.buy as Record<string,unknown>,id=buy.contract_id,price=cents(buy.buy_price);
  if(typeof id!=='number'||!Number.isSafeInteger(id)||id<=0||price!==MAX_STAKE_CENTS
    ||typeof buy.purchase_time!=='number'||!Number.isSafeInteger(buy.purchase_time)||buy.purchase_time<=0)
    throw Error('DEMO_BUY_INVALID_RESPONSE');
  return {accepted:true,contractId:id,buyCents:price,purchaseTime:buy.purchase_time};
}

export type DemoSettlement={contractId:number;sold:true;profitCents:number;buyCents:number;payoutCents:number;outcome:'WIN'|'LOSS'|'FLAT';entrySpot?:number;exitSpot?:number};
export function parseDemoSettlement(raw:unknown,expectedContractId:number):DemoSettlement|null {
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
  if(data.underlying_symbol!==undefined&&data.underlying_symbol!=='R_100')throw Error('DEMO_SETTLEMENT_WRONG_SYMBOL');
  const profit=cents(data.profit),buy=cents(data.buy_price),payout=cents(data.payout);
  if(profit===null||buy!==MAX_STAKE_CENTS||payout===null||payout<0)
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
