/**
 * Experimental, DEMO-only risk policy. Values are virtual USD cents.
 * The 100 USD guard is a hard loss boundary from verified baseline;
 * never use this module to authorize real-money transactions.
 */
export const DEMO_STAKES_CENTS=Object.freeze([10,25,50,100] as const);
export const DEMO_MAX_STAKE_CENTS=100;
export const DEMO_MAX_OPEN=10;
export const DEMO_MAX_LOSS_CENTS=10_000; // US$100 off verified demo starting balance
export const DEMO_BASELINE_EXPECTED_CENTS=1_000_000; // US$10,000; broker must confirm it
export const DEMO_REVIEW_INTERVAL=10;
export const DEMO_PILOT_MAX_PURCHASES=10;
export const DEMO_PILOT_BUDGET_CENTS=1_000; // US$10 virtual, initial experiment only.
export type DemoRiskInput={
 openContracts:number;
 maxConcurrent?:number;
 unknownCount:number;
 exposureCents:number;
 lifetimeNetCents:number;
 stakeCents:number;
 /** Contract stakes in the first pilot, confirmed or still unresolved. */
 pilotPurchases?:number;
 pilotCommittedCents?:number;
 /** Verified broker balance and baseline in USD cents. Never take these from PAPER. */
 brokerBalanceCents:number;
 baselineBalanceCents:number;
 halted:boolean;
};
export function pickDemoStakeCents(index:number){
 if(!Number.isSafeInteger(index)||index<0)throw Error('DEMO_STAKE_INDEX_INVALID');
 return DEMO_STAKES_CENTS[index%DEMO_STAKES_CENTS.length];
}
export function evaluateDemoRisk(s:DemoRiskInput){
 const maxConcurrent=s.maxConcurrent??DEMO_MAX_OPEN;
 const pilotPurchases=s.pilotPurchases??0,pilotCommittedCents=s.pilotCommittedCents??0;
 const integers=[s.openContracts,maxConcurrent,s.unknownCount,s.exposureCents,s.lifetimeNetCents,
  pilotPurchases,pilotCommittedCents,
  s.stakeCents,s.brokerBalanceCents,s.baselineBalanceCents];
 if(integers.some(n=>!Number.isSafeInteger(n))||maxConcurrent<1||maxConcurrent>DEMO_MAX_OPEN||s.openContracts<0||s.openContracts>DEMO_MAX_OPEN
  ||s.unknownCount<0||s.exposureCents<0||s.brokerBalanceCents<0
  ||s.baselineBalanceCents<=0||s.exposureCents>DEMO_MAX_OPEN*DEMO_MAX_STAKE_CENTS
  ||pilotPurchases<0||pilotCommittedCents<0||pilotPurchases>1000000||pilotCommittedCents>100000000
  ||!DEMO_STAKES_CENTS.some(x=>x===s.stakeCents)
  ||s.exposureCents<s.openContracts*DEMO_STAKES_CENTS[0])throw Error('DEMO_RISK_INVALID');
 const floor=s.baselineBalanceCents-DEMO_MAX_LOSS_CENTS;
 const lowestExpectedBalance=s.brokerBalanceCents-s.exposureCents-s.stakeCents;
 const ledgerWorstCase=s.lifetimeNetCents-s.exposureCents-s.stakeCents;
 let reason='';
 if(s.halted)reason='DEMO_LOSS_STOP_PERSISTED';
 else if(s.unknownCount>0)reason='DEMO_BUY_OUTCOME_UNKNOWN';
 else if(pilotPurchases>=DEMO_PILOT_MAX_PURCHASES)reason='DEMO_PILOT_COMPLETE';
 else if(pilotCommittedCents+s.stakeCents>DEMO_PILOT_BUDGET_CENTS)reason='DEMO_PILOT_BUDGET';
 else if(s.brokerBalanceCents<=floor)reason='DEMO_LOSS_100_REACHED';
 else if(s.openContracts>=maxConcurrent)reason='DEMO_MAX_OPEN';
 else if(lowestExpectedBalance<floor)reason='DEMO_LOSS_RISK_LIMIT';
 else if(ledgerWorstCase< -DEMO_MAX_LOSS_CENTS)reason='DEMO_LEDGER_RISK_LIMIT';
 return {allowed:reason==='',reason,maximumOpen:maxConcurrent,
  pilotPurchases,pilotCommittedCents,pilotRemainingPurchases:Math.max(0,DEMO_PILOT_MAX_PURCHASES-pilotPurchases),
  pilotRemainingBudgetCents:Math.max(0,DEMO_PILOT_BUDGET_CENTS-pilotCommittedCents),
  brokerBalanceCents:s.brokerBalanceCents,baselineBalanceCents:s.baselineBalanceCents,
  lossStopBalanceCents:floor,openExposureCents:s.exposureCents,
  estimatedBalanceAfterWorstCaseCents:lowestExpectedBalance,
  virtualStakeCents:s.stakeCents,
  dollarsAtRiskUntilStopCents:Math.max(0,s.brokerBalanceCents-floor)};
}
