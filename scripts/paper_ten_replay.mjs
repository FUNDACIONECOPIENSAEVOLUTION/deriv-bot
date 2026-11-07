#!/usr/bin/env node
/**
 * Ecopiensa PAPER: ten signal-driven entries on REAL, PUBLIC historical ticks.
 * This is chronological replay, NOT a Deriv account or executed contract.
 * It never sends proposal, buy, sell, OTP, authorize or account requests.
 */
import {readConfig, initialState, onTick} from '../runtime/core.mjs';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';

export const PUBLIC_WS='wss://api.derivws.com/trading/v1/options/ws/public';
export const MODE='PAPER_REPLAY_PUBLIC_HISTORY';
export const ORDERS=0;
const clock=()=>Math.floor(Date.now()/1000);

export function validateHistory(history,{now=clock(),symbol='R_100'}={}) {
  if(symbol!=='R_100'||!history||!Array.isArray(history.prices)||!Array.isArray(history.times))
    throw Error('PAPER_HISTORY_INVALID');
  if(history.prices.length!==history.times.length||history.prices.length<100
     ||history.prices.length>4000)throw Error('PAPER_HISTORY_LENGTH_INVALID');
  const prices=history.prices.map(Number),times=history.times.map(Number);
  for(let i=0;i<prices.length;i++){
    if(!Number.isFinite(prices[i])||prices[i]<=0||!Number.isSafeInteger(times[i])
      ||times[i]<946684800||times[i]>now+120||(i&&times[i]<times[i-1]))
      throw Error('PAPER_HISTORY_TICK_INVALID');
  }
  if(now-times.at(-1)>900)throw Error('PAPER_HISTORY_STALE');
  return {prices,times};
}

export function replayTen(history,{
  now=clock(),stakeCents=35,horizonTicks=5,payoutHypothesisPct=80,
  maximum=10
}={}){
  const {prices,times}=validateHistory(history,{now});
  if(maximum!==10||stakeCents!==35||horizonTicks!==5||payoutHypothesisPct!==80)
    throw Error('PAPER_TEST_PARAMETERS_LOCKED');
  const config=readConfig({TRADING_MODE:'PAPER',PAPER_ENABLED:'true',SYMBOL:'R_100',
    INITIAL_USD:'10',STAKE_USD:'0.35',DAILY_LOSS_USD:'3.50',
    PAPER_COST_USD:'0',PAYOUT_HYPOTHESIS_PCT:'80',
    HORIZON_TICKS:'5',COOLDOWN_TICKS:'5',MAX_DAILY_TRADES:'10'});
  let state=initialState(config,times[0]);
  let opened=0,neutral=0,wins=0,losses=0,calls=0,puts=0,totalStaked=0;
  let peak=1000,maxDrawdown=0;
  const trades=[],pending=new Map();
  let processed=0;
  for(let i=0;i<times.length;i++){
    const tick={symbol:'R_100',epoch:times[i],quote:prices[i]};
    const result=onTick(state,config,tick,{nowEpoch:times[i]});
    state=result.state;
    processed++;
    if(state.prices.length>=30&&!state.position)neutral++;
    for(const event of result.events){
      if(event.type==='paper_opened'){
        opened++;
        pending.set(event.trade.id,event.trade);
      }
      if(event.type==='paper_closed'){
        const trade=event.trade,entry=pending.get(trade.id);
        if(!entry)throw Error('PAPER_REPLAY_LEDGER_MISMATCH');
        pending.delete(trade.id);
        const direction=trade.direction===1?'CALL':'PUT';
        if(direction==='CALL')calls++;else puts++;
        if(trade.won)wins++;else losses++;
        totalStaked+=trade.stakeCents;
        peak=Math.max(peak,state.balanceCents);
        maxDrawdown=Math.max(maxDrawdown,peak-state.balanceCents);
        trades.push({
          sequence:trades.length+1,source:'BOT_SIGNAL',
          direction,decision:entry.decision.reason,
          sma8:entry.decision.fast,sma21:entry.decision.slow,
          rsi14Approx:entry.decision.rsi,volatilityPct:entry.decision.volatility,
          entryEpoch:trade.entryEpoch,exitEpoch:trade.exitEpoch,
          entryPrice:trade.entryQuote,exitPrice:trade.exitQuote,
          ticksHeld:trade.ticksHeld,stakeCents:trade.stakeCents,
          won:trade.won,pnlCents:trade.pnlCents,
          result:'HYPOTHETICAL'
        });
        if(trades.length===maximum)break;
      }
    }
    if(trades.length===maximum)break;
  }
  const pnlCents=state.balanceCents-1000;
  const digest=createHash('sha256').update(JSON.stringify({prices:prices.slice(0,processed),times:times.slice(0,processed)})).digest('hex');
  return {
    status:trades.length===maximum?'COMPLETE':'INSUFFICIENT_SIGNALS_OR_TICKS',
    mode:MODE,market:'R_100',source:'Deriv public ticks_history / chronological offline replay',
    brokerOrdersExecuted:0,connectedToDemoAccount:false,connectedToRealAccount:false,
    capturedAt:new Date(now*1000).toISOString(),
    sampleFirstEpoch:times[0],sampleLastEpoch:times[processed-1],
    samplePoints:prices.length,processedPoints:processed,historySha256:digest,
    policy:{decision:'SMA 8/21 + RSI 14 approximated + volatility filter',allowHold:true,
      noForcedCallPut:true,entryOnlyFromPastTicks:true,oneOpenAtATime:true,
      payoutHypothesisPct,horizonTicks,stakeCents,initialBalanceCents:1000,
      dailyLossLimitCents:350,maxTrades:maximum,zeroAssumedCosts:true},
    summary:{trades:trades.length,wins,losses,callTrades:calls,putTrades:puts,
      callWins:trades.filter(x=>x.direction==='CALL'&&x.won).length,
      putWins:trades.filter(x=>x.direction==='PUT'&&x.won).length,
      winRatePct:trades.length?Math.round(wins/trades.length*10000)/100:null,
      breakevenAtHypotheticalPayoutPct:Math.round(10000/(1+payoutHypothesisPct/100))/100,
      totalStakedCents:totalStaked,pnlCents,
      startBalanceCents:1000,endBalanceCents:state.balanceCents,
      maxDrawdownCents:maxDrawdown,opened,unsettledAtEnd:pending.size,
      observedNoEntryTicks:neutral},
    trades,
    caveat:'Strict PAPER simulation on public historical ticks. Hypothetical fixed payout and zero fees. NOT actual Deriv quotes or purchased contracts; no profitability prediction.'
  };
}

async function fetchPublicHistory({count=2000,symbol='R_100',timeoutMs=18000}={}){
  if(symbol!=='R_100'||count!==2000)throw Error('PAPER_HISTORY_REQUEST_NOT_ALLOWED');
  const ws=new WebSocket(PUBLIC_WS);
  return await new Promise((resolve,reject)=>{
    let done=false;
    const finish=(e,data)=>{
      if(done)return;done=true;clearTimeout(timer);
      try{ws.close();}catch{}
      if(e)reject(Error(e));else resolve(data);
    };
    const timer=setTimeout(()=>finish('PUBLIC_HISTORY_TIMEOUT'),timeoutMs);
    ws.addEventListener('open',()=>ws.send(JSON.stringify({
      ticks_history:symbol,end:'latest',style:'ticks',count,req_id:211
    })));
    ws.addEventListener('error',()=>finish('PUBLIC_HISTORY_NETWORK_ERROR'));
    ws.addEventListener('close',()=>finish('PUBLIC_HISTORY_CLOSED'));
    ws.addEventListener('message',e=>{
      try{
        if(typeof e.data!=='string'||e.data.length>2000000)return;
        const msg=JSON.parse(e.data);
        if(msg.req_id!==211)return;
        if(msg.error)throw Error('PUBLIC_HISTORY_PROVIDER_REJECTION');
        if(msg.msg_type!=='history'||msg.echo_req?.ticks_history!==symbol
           ||!msg.history)throw Error('PUBLIC_HISTORY_IDENTITY_FAILURE');
        finish(null,msg.history);
      }catch{finish('PUBLIC_HISTORY_RESPONSE_INVALID');}
    });
  });
}

if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url){
  try{
    let history;
    if(process.argv.includes('--stdin')){
      let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>800000)throw Error('PAPER_INPUT_TOO_LARGE');}
      history=JSON.parse(input);
    }else history=await fetchPublicHistory();
    const report=replayTen(history);
    console.log('PAPER_TEN_REPORT '+JSON.stringify(report));
    if(process.env.PAPER_REPORT_PATH)
      await writeFile(process.env.PAPER_REPORT_PATH,JSON.stringify(report,null,2)+'\n',{flag:'w',mode:0o600});
    if(process.env.PAPER_SOURCE_PATH)
      await writeFile(process.env.PAPER_SOURCE_PATH,JSON.stringify(history),{flag:'w',mode:0o600});
  }catch(e){
    console.error('PAPER_TEN_FAILED '+(e instanceof Error?e.message:'UNKNOWN'));
    process.exitCode=1;
  }
}
