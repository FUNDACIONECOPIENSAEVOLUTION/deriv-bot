import {expect,it} from 'vitest';
import {planDemoBurst} from '../src/demo-burst-policy';

const fresh=()=>({
 pilotPurchases:0,pilotCommittedCents:0,batchCommittedCents:0,
 openContracts:0,unknownCount:0,exposureCents:0,
 brokerBalanceCents:1000000,balanceCheckedAt:1794090000,now:1794090001,
 demoConnected:true,autoActive:false,batchSettlementPending:false,halted:false
});
it('10 orders mean 10 distinct purchases of US$1 and gross US$10, never one purchase',()=>{
 const p=planDemoBurst(10,fresh());
 expect(p).toMatchObject({allowed:true,stakeCents:100,
  requested:10,requestedCommitmentCents:1000,maxAllowedNow:10,
  oneBrokerContractPerBuy:true,brokerOrders:0,accountType:'demo'});
});
it('requires eight remaining when two previous contracts already belong to the batch',()=>{
 const f=fresh(),after={...f,pilotPurchases:2,pilotCommittedCents:85,
   batchCommittedCents:85};
 expect(planDemoBurst(10,after)).toMatchObject({
   allowed:false,reason:'DEMO_BURST_REMAINING_LIMIT',maxAllowedNow:8
 });
 expect(planDemoBurst(8,after)).toMatchObject({
   allowed:true,requestedCommitmentCents:800,maxAllowedNow:8
 });
});
it('does not exceed US$10 budget even when the remaining slots appear available',()=>{
 const f=fresh();
 expect(planDemoBurst(5,{...f,pilotPurchases:3,pilotCommittedCents:800,
  batchCommittedCents:800})).toMatchObject({
   allowed:false,reason:'DEMO_BURST_REMAINING_LIMIT',maxAllowedNow:2
 });
 expect(planDemoBurst(2,{...f,pilotPurchases:3,pilotCommittedCents:800,
  batchCommittedCents:800}).allowed).toBe(true);
});
it('blocks unknown buys, open contracts, stale balance, auto and loss guard',()=>{
 const f=fresh();
 for(const [overrides,reason] of [
  [{unknownCount:1,exposureCents:100},'DEMO_CONTRACT_PENDING_RECONCILIATION'],
  [{openContracts:1,exposureCents:100},'DEMO_CONTRACT_PENDING_RECONCILIATION'],
  [{now:f.now+30},'DEMO_BALANCE_REFRESH_REQUIRED'],
  [{autoActive:true},'DEMO_AUTOMATION_ALREADY_ACTIVE'],
  [{halted:true},'DEMO_LOSS_STOP_PERSISTED'],
  [{brokerBalanceCents:990000},'DEMO_LOSS_RISK_LIMIT'],
  [{batchSettlementPending:true},'DEMO_BATCH_SETTLEMENT_PENDING']
 ] as const){
  expect(planDemoBurst(1,{...f,...overrides}).reason).toBe(reason);
 }
});
it('never allows more than ten buys nor invalid numeric instructions',()=>{
 for(const n of [0,-1,11,20,100,1.5,Number.NaN,Infinity])
  expect(()=>planDemoBurst(n,fresh())).toThrow('DEMO_BURST_COUNT_INVALID');
});
