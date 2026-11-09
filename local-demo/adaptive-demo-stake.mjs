// Politica experimental SOLO DEMO: bajar a USD0.50 despues de
// dos perdidas consecutivas y mantenerlo hasta terminar la tanda.
// La tanda siguiente empieza de nuevo con su importe base.
export function decideStake(settlements,{baseStakeCents=100,enabled=false}={}){
 if(!Array.isArray(settlements)||![50,100].includes(baseStakeCents)||
  typeof enabled!=='boolean')throw Error('DEMO_STAKE_POLICY_INVALID');
 let streak=0,reduced=false;
 for(const row of settlements){
  if(!Number.isSafeInteger(row?.pnlCents))throw Error('DEMO_STAKE_PNL_INVALID');
  streak=row.pnlCents<0?streak+1:0;
  if(streak>=2)reduced=true;
 }
 return {stakeCents:enabled&&reduced?50:baseStakeCents,
  reduced:enabled&&reduced,lossStreak:streak,settled:settlements.length};
}
