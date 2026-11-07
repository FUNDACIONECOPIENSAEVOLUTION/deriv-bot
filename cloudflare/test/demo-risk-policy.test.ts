import {describe,it,expect} from 'vitest';
import {DEMO_STAKES_CENTS,DEMO_MAX_OPEN,DEMO_MAX_LOSS_CENTS,
 DEMO_BASELINE_EXPECTED_CENTS,pickDemoStakeCents,evaluateDemoRisk,requireFirstDemoSettlement,validManualDemoApproval} from '../src/demo-risk-policy';
const base={openContracts:0,unknownCount:0,exposureCents:0,lifetimeNetCents:0,
  stakeCents:35,brokerBalanceCents:1_000_000,baselineBalanceCents:1_000_000,halted:false};
describe('Deriv DEMO only: controlled variation and loss stop',()=>{
 it('requires a matching approved quote no older than 45 seconds before manual DEMO purchase',()=>{
   const approval={at:1000,signal:'UP',stakeCents:35,accountId:'DEMO1',purchases:0};
   const valid={now:1045,signal:'UP' as const,stakeCents:35,accountId:'DEMO1',purchases:0};
   expect(validManualDemoApproval(approval,valid)).toBe(true);
   expect(validManualDemoApproval(approval,{...valid,now:1046})).toBe(false);
   expect(validManualDemoApproval(approval,{...valid,signal:'DOWN'})).toBe(false);
   expect(validManualDemoApproval(approval,{...valid,stakeCents:100})).toBe(false);
   expect(validManualDemoApproval(approval,{...valid,accountId:'REAL1'})).toBe(false);
   expect(validManualDemoApproval(approval,{...valid,purchases:1})).toBe(false);
   expect(validManualDemoApproval(null,valid)).toBe(false);
 });
 it('requires a verified manual DEMO settlement before authorizing automation',()=>{
   expect(()=>requireFirstDemoSettlement(0)).toThrow('DEMO_FIRST_SETTLEMENT_REQUIRED');
   expect(()=>requireFirstDemoSettlement(-1)).toThrow('DEMO_FIRST_SETTLEMENT_REQUIRED');
   expect(()=>requireFirstDemoSettlement(NaN)).toThrow('DEMO_FIRST_SETTLEMENT_REQUIRED');
   expect(requireFirstDemoSettlement(1)).toBeUndefined();
 });
 it('uses the four fixed experimental amounts with no doubling after a loss',()=>{
   expect(DEMO_STAKES_CENTS).toEqual([35,50,75,100]);
   expect([0,1,2,3,4,5].map(pickDemoStakeCents)).toEqual([35,50,75,100,35,50]);
   expect(()=>pickDemoStakeCents(-1)).toThrow();
 });
 it('honors verified 10000 USD virtual baseline and 100 USD accumulated loss',()=>{
   expect(DEMO_BASELINE_EXPECTED_CENTS).toBe(1_000_000);
   expect(DEMO_MAX_LOSS_CENTS).toBe(10_000);
   expect(evaluateDemoRisk(base).allowed).toBe(true);
   expect(evaluateDemoRisk({...base,brokerBalanceCents:990_000}).reason).toBe('DEMO_LOSS_100_REACHED');
   expect(evaluateDemoRisk({...base,brokerBalanceCents:989_999}).allowed).toBe(false);
   expect(evaluateDemoRisk({...base,brokerBalanceCents:990_100,stakeCents:35}).allowed).toBe(true);
 });
 it('reserves open contract exposure and the planned stake before buying',()=>{
   expect(evaluateDemoRisk({...base,brokerBalanceCents:990_200,openContracts:2,exposureCents:200,stakeCents:35})
     .reason).toBe('DEMO_LOSS_RISK_LIMIT');
   expect(evaluateDemoRisk({...base,brokerBalanceCents:991_200,openContracts:9,exposureCents:900,stakeCents:100})
     .allowed).toBe(true);
 });
 it('enforces a user-configured simultaneous DEMO limit from one through ten',()=>{
   expect(evaluateDemoRisk({...base,maxConcurrent:1,openContracts:1,exposureCents:35}).reason)
      .toBe('DEMO_MAX_OPEN');
   expect(evaluateDemoRisk({...base,maxConcurrent:3,openContracts:2,exposureCents:70}).allowed)
      .toBe(true);
   expect(evaluateDemoRisk({...base,maxConcurrent:3,openContracts:3,exposureCents:105}).reason)
      .toBe('DEMO_MAX_OPEN');
   expect(()=>evaluateDemoRisk({...base,maxConcurrent:11})).toThrow('DEMO_RISK_INVALID');
   expect(()=>evaluateDemoRisk({...base,maxConcurrent:0})).toThrow('DEMO_RISK_INVALID');
 });
 it('runs five blocks of ten with US$10 maximum per block and 50 purchases overall',()=>{
   expect(evaluateDemoRisk({...base,pilotPurchases:9,pilotCommittedCents:900,batchCommittedCents:900,stakeCents:100}).allowed)
      .toBe(true);
   const boundary={...base,pilotPurchases:10,pilotCommittedCents:1000,batchCommittedCents:0};
   expect(evaluateDemoRisk({...boundary,batchSettlementPending:true}).reason)
      .toBe('DEMO_BATCH_SETTLEMENT_PENDING');
   const following=evaluateDemoRisk({...boundary,batchSettlementPending:false});
   expect(following.allowed).toBe(true);
   expect(following.batchNumber).toBe(2);
   expect(following.pilotRemainingPurchases).toBe(40);
   expect(evaluateDemoRisk({...base,pilotPurchases:18,pilotCommittedCents:1900,batchCommittedCents:900,stakeCents:100})
      .allowed).toBe(true);
   expect(evaluateDemoRisk({...base,pilotPurchases:18,pilotCommittedCents:1950,batchCommittedCents:950,stakeCents:100})
      .reason).toBe('DEMO_BATCH_BUDGET');
   const finish=evaluateDemoRisk({...base,pilotPurchases:50,pilotCommittedCents:5000,batchCommittedCents:0});
   expect(finish.reason).toBe('DEMO_PILOT_COMPLETE');
   expect(finish.pilotRemainingPurchases).toBe(0);
   expect(finish.pilotRemainingBudgetCents).toBe(0);
 });
 it('allows at most ten concurrent contracts',()=>{
   expect(DEMO_MAX_OPEN).toBe(10);
   expect(evaluateDemoRisk({...base,openContracts:9,exposureCents:900,stakeCents:100}).allowed).toBe(true);
   expect(evaluateDemoRisk({...base,openContracts:10,exposureCents:1000}).reason).toBe('DEMO_MAX_OPEN');
 });
 it('halts on any unknown broker acknowledgement, and sticky risk stop',()=>{
   expect(evaluateDemoRisk({...base,unknownCount:1,exposureCents:350}).reason).toBe('DEMO_BUY_OUTCOME_UNKNOWN');
   expect(evaluateDemoRisk({...base,halted:true}).reason).toBe('DEMO_LOSS_STOP_PERSISTED');
 });
 it('does not stop just because a short-term win rate or daily net is unfavorable',()=>{
   expect(evaluateDemoRisk({...base,lifetimeNetCents:-100,brokerBalanceCents:999_900}).allowed).toBe(true);
   expect(evaluateDemoRisk({...base,lifetimeNetCents:500,brokerBalanceCents:1_000_500}).allowed).toBe(true);
 });
 it('prevents a growing net loss from exceeding the 100 USD virtual budget',()=>{
   expect(evaluateDemoRisk({...base,lifetimeNetCents:-9999,stakeCents:35}).reason)
     .toBe('DEMO_LEDGER_RISK_LIMIT');
 });
 it('rejects malformed or out-of-range budgets before any trade',()=>{
   expect(()=>evaluateDemoRisk({...base,stakeCents:500})).toThrow('DEMO_RISK_INVALID');
   expect(()=>evaluateDemoRisk({...base,openContracts:11,exposureCents:1100})).toThrow('DEMO_RISK_INVALID');
   expect(()=>evaluateDemoRisk({...base,brokerBalanceCents:NaN})).toThrow('DEMO_RISK_INVALID');
 });
});
