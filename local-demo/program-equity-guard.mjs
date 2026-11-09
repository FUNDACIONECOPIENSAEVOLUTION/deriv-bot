// Control del P&L del programa completo DEMO; no genera ordenes.
export const GLOBAL_POLICY=Object.freeze({arm:300,minimum:100,drawdown:200,initialLoss:300});
export function replaySettlements(rows){
 if(!Array.isArray(rows))throw Error('DEMO_EQUITY_LEDGER_INVALID');
 let netCents=0,peakNetCents=0;
 for(const row of rows){
  if(!Number.isSafeInteger(row?.pnlCents))throw Error('DEMO_EQUITY_PNL_INVALID');
  netCents+=row.pnlCents;peakNetCents=Math.max(peakNetCents,netCents);
 }
 return {netCents,peakNetCents};
}
export function evaluateGlobalRisk({netCents,peakNetCents,stakeCents}={}){
 if(![netCents,peakNetCents,stakeCents].every(Number.isSafeInteger)||
  peakNetCents<0||stakeCents<=0)throw Error('DEMO_EQUITY_INPUT_INVALID');
 const peak=Math.max(0,peakNetCents,netCents),armed=peak>=GLOBAL_POLICY.arm;
 const floorCents=armed?Math.max(GLOBAL_POLICY.minimum,peak-GLOBAL_POLICY.drawdown):
  -GLOBAL_POLICY.initialLoss;
 const worstNextCents=netCents-stakeCents;
 const blocked=worstNextCents<floorCents;
 return {netCents,peakNetCents:peak,armed,floorCents,worstNextCents,blocked,
  reason:!blocked?null:armed?'PROGRAM_PROFIT_FLOOR_PROTECTED':
   'PROGRAM_LOSS_BUDGET_INSUFFICIENT',realEnabled:false};
}
