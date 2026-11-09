// Solo decide cuándo terminar una tanda después de liquidaciones oficiales.
// No compra, no modifica apuestas y no garantiza que se termine en positivo.
export const EXIT_POLICIES=Object.freeze(['FIXED_TARGET','TRAILING_GREEN']);
export const GREEN_EXIT_REASONS=Object.freeze([
 'TAKE_PROFIT_REACHED','TRAILING_RECOVERY_GREEN',
 'TRAILING_PROFIT_LOCKED','TRAILING_FLOOR_PROTECTED'
]);
export function createProfitExitTracker({
 policy='FIXED_TARGET',targetCents,stakeCents=100,maxTrades=10
}={}){
 if(!EXIT_POLICIES.includes(policy)||![50,100,150].includes(targetCents)||
  !Number.isInteger(stakeCents)||stakeCents<1||
  !Number.isInteger(maxTrades)||maxTrades<1||maxTrades>10)
  throw Error('DEMO_EXIT_POLICY_INVALID');
 let verified=0,lastNet=0,streak=0,hadLoss=false,armed=false,peak=0;
 const snapshot=()=>({policy,verified,netCents:lastNet,streak,hadLoss,armed,
  peakNetCents:peak,minimumProtectedCents:targetCents});
 function beforeNextBuy({settled,netCents}){
  if(settled!==verified||netCents!==lastNet)
   throw Error('DEMO_EXIT_SETTLEMENT_MISMATCH');
  if(verified>=maxTrades)return {close:true,reason:'TEN_BUYS_REACHED_WITHOUT_TARGET'};
  if(policy==='TRAILING_GREEN'&&armed&&lastNet>=targetCents&&
   lastNet-stakeCents<targetCents)
   return {close:true,reason:'TRAILING_FLOOR_PROTECTED'};
  return {close:false};
 }
 function onSettlement({settled,netCents}){
  if(!Number.isInteger(settled)||settled!==verified+1||
   !Number.isInteger(netCents))
   throw Error('DEMO_EXIT_SETTLEMENT_SEQUENCE_INVALID');
  const change=netCents-lastNet;
  verified=settled;lastNet=netCents;peak=Math.max(peak,netCents);
  if(change>0)streak+=1;
  else{streak=0;hadLoss=true;}
  if(policy==='FIXED_TARGET'&&netCents>=targetCents)
   return {close:true,reason:'TAKE_PROFIT_REACHED',...snapshot()};
  if(policy==='TRAILING_GREEN'){
   if(netCents>=targetCents&&streak>=2)armed=true;
   if(netCents>=targetCents&&hadLoss)
    return {close:true,reason:change>0?
     'TRAILING_RECOVERY_GREEN':'TRAILING_PROFIT_LOCKED',...snapshot()};
   if(verified>=maxTrades&&netCents>=targetCents)
    return {close:true,reason:'TAKE_PROFIT_REACHED',...snapshot()};
  }
  if(verified>=maxTrades)
   return {close:true,reason:'TEN_BUYS_REACHED_WITHOUT_TARGET',...snapshot()};
  return {close:false,...snapshot()};
 }
 return {beforeNextBuy,onSettlement,snapshot};
}
