import {DEMO_BATCH_BUDGET_CENTS,DEMO_MAX_OPEN,DEMO_PILOT_BUDGET_CENTS,
 DEMO_PILOT_MAX_PURCHASES,DEMO_REVIEW_INTERVAL,DEMO_STAKES_CENTS} from './demo-risk-policy';

/** DEMO-only burst. Every accepted buy is a distinct Deriv contract.
 *  A batch is a US$10 ceiling, not a single US$10 purchase. */
export const DEMO_BURST_STAKE_CENTS=100;
export type BurstLimits={
 pilotPurchases:number;pilotCommittedCents:number;batchCommittedCents:number;
 openContracts:number;unknownCount:number;exposureCents:number;
 brokerBalanceCents:number|null;balanceCheckedAt:number;now:number;
 demoConnected:boolean;autoActive:boolean;batchSettlementPending:boolean;halted:boolean;
};
export function planDemoBurst(n:number,limits:BurstLimits,stakeCents:number=DEMO_BURST_STAKE_CENTS){
 if(!DEMO_STAKES_CENTS.some(x=>x===stakeCents))throw Error('DEMO_BURST_STAKE_INVALID');
 if(!Number.isSafeInteger(n)||n<1||n>DEMO_MAX_OPEN)
  throw Error('DEMO_BURST_COUNT_INVALID');
 const integers=[limits.pilotPurchases,limits.pilotCommittedCents,limits.batchCommittedCents,
   limits.openContracts,limits.unknownCount,limits.exposureCents,
   limits.balanceCheckedAt,limits.now];
 if(integers.some(x=>!Number.isSafeInteger(x)||x<0))
  throw Error('DEMO_BURST_RISK_INVALID');
 const remainingInBatch=DEMO_REVIEW_INTERVAL-(limits.pilotPurchases%DEMO_REVIEW_INTERVAL);
 const remainingBudget=Math.max(0,DEMO_BATCH_BUDGET_CENTS-limits.batchCommittedCents);
 const totalRemaining=Math.max(0,DEMO_PILOT_MAX_PURCHASES-limits.pilotPurchases);
 const globalBudget=Math.max(0,DEMO_PILOT_BUDGET_CENTS-limits.pilotCommittedCents);
 const countAllowed=Math.min(DEMO_MAX_OPEN,remainingInBatch,totalRemaining,
  Math.floor(remainingBudget/stakeCents),
  Math.floor(globalBudget/stakeCents));
 let reason:string|null=null;
 if(!limits.demoConnected)reason='DERIV_DEMO_REQUIRED';
 else if(limits.autoActive)reason='DEMO_AUTOMATION_ALREADY_ACTIVE';
 else if(limits.halted)reason='DEMO_LOSS_STOP_PERSISTED';
 else if(limits.unknownCount>0||limits.openContracts>0)reason='DEMO_CONTRACT_PENDING_RECONCILIATION';
 else if(limits.batchSettlementPending)reason='DEMO_BATCH_SETTLEMENT_PENDING';
 else if(limits.brokerBalanceCents===null||limits.now-limits.balanceCheckedAt>20)
  reason='DEMO_BALANCE_REFRESH_REQUIRED';
 else if(limits.brokerBalanceCents<=990000|| // $9,900 hard floor
   limits.brokerBalanceCents-limits.exposureCents-n*stakeCents<990000)
  reason='DEMO_LOSS_RISK_LIMIT';
 else if(n>countAllowed)reason='DEMO_BURST_REMAINING_LIMIT';
 return {allowed:reason===null,reason,requested:n,
   stakeCents,requestedCommitmentCents:n*stakeCents,
   maxAllowedNow:Math.max(0,countAllowed),
   remainingInBatch,remainingBatchBudgetCents:remainingBudget,
   remainingInPilot:totalRemaining,oneBrokerContractPerBuy:true,
   brokerOrders:0,accountType:'demo' as const};
}
