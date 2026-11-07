/**
 * Risk controls for broker-verifiable virtual DEMO contracts only.
 * Does not issue trades or make a claim of profitability.
 */
export const DEMO_ALLOCATION_CENTS=1000;
export const DEMO_STAKE_CENTS=100; // USD 1 virtual per contract
export const DEMO_MAX_OPEN=10;
export const DEMO_FIRST_BATCH_SIZE=10; // no further buys until a separate review
export const DEMO_DAILY_LOSS_FLOOR_CENTS=-1000; // never exceed virtual USD 10 including open risk
export const DEMO_MIN_SETTLED_FOR_REVIEW=10;

export type DailyDemoRiskInput={
  openContracts:number;
  unknownCount:number;
  exposureCents:number;
  lifetimeNetCents:number;
  dailyNetCents:number;
  dailySettled:number;
  haltedToday:boolean;
  /** Number of demo buys recorded for the initial ten-operation experiment. */
  firstBatchBuys?:number;
};

export function assessDailyDemoRisk(s:DailyDemoRiskInput){
  for(const n of [s.openContracts,s.unknownCount,s.exposureCents,s.lifetimeNetCents,s.dailyNetCents,s.dailySettled]){
    if(!Number.isSafeInteger(n))throw Error('DEMO_RISK_INVALID');
  }
  if(s.openContracts<0||s.openContracts>DEMO_MAX_OPEN||s.unknownCount<0||
     !Number.isSafeInteger(s.firstBatchBuys??0)||(s.firstBatchBuys??0)<0||
     s.exposureCents<0||s.exposureCents>DEMO_ALLOCATION_CENTS||
     s.dailySettled<0||s.exposureCents<s.openContracts*DEMO_STAKE_CENTS)
    throw Error('DEMO_RISK_INVALID');
  const virtualRemainingCents=DEMO_ALLOCATION_CENTS+s.lifetimeNetCents-s.exposureCents;
  const worstCaseDailyNetCents=s.dailyNetCents-s.exposureCents-DEMO_STAKE_CENTS;
  const reviewTriggered=s.dailySettled>=DEMO_MIN_SETTLED_FOR_REVIEW&&s.dailyNetCents<=0;
  let reason='';
  if(s.haltedToday)reason='DEMO_DAY_HALTED';
  else if((s.firstBatchBuys??0)>=DEMO_FIRST_BATCH_SIZE)reason='DEMO_FIRST_BATCH_COMPLETE';
  else if(s.unknownCount>0)reason='DEMO_BUY_OUTCOME_UNKNOWN';
  else if(reviewTriggered)reason='DEMO_DAY_NOT_PROFITABLE';
  else if(s.openContracts>=DEMO_MAX_OPEN)reason='DEMO_MAX_OPEN';
  else if(virtualRemainingCents<DEMO_STAKE_CENTS)reason='DEMO_RESEARCH_ALLOCATION';
  else if(worstCaseDailyNetCents<DEMO_DAILY_LOSS_FLOOR_CENTS)reason='DEMO_DAILY_RISK_FLOOR';
  return {
    allowed:reason==='',
    reason,
    reviewTriggered,
    dailyNetCents:s.dailyNetCents,
    worstCaseDailyNetCents,
    virtualRemainingCents,
    maxParallel:DEMO_MAX_OPEN,
    maxRiskCents:Math.abs(DEMO_DAILY_LOSS_FLOOR_CENTS),
    reviewAfterSettled:DEMO_MIN_SETTLED_FOR_REVIEW,
    firstBatchBuys:s.firstBatchBuys??0,firstBatchSize:DEMO_FIRST_BATCH_SIZE
  };
}
