// Analizadores por HORIZONTE de ticks. No utilizan velas como tick ni datos futuros
// para generar una prediccion. Los resultados de la muestra posterior NO son
// garantia de rentabilidad, y nunca tienen permisos de BUY por si mismos.
import {performance} from 'node:perf_hooks';
export const SUPPORTED_TICK_HORIZONS=Object.freeze([5,10]);
const POLICIES=Object.freeze(['MOMENTUM_5','MOMENTUM_10','MOMENTUM_20',
 'VOTE_5_10_20','REVERSION_5']);
const sign=n=>n>0?1:n<0?-1:0;
const clean=n=>Number.isFinite(n)?n:null;
function forecast(values,i,policy){
 if(i<20)return 0;
 const a=sign(values[i]-values[i-5]),b=sign(values[i]-values[i-10]),
  c=sign(values[i]-values[i-20]);
 switch(policy){
  case 'MOMENTUM_5':return a;
  case 'MOMENTUM_10':return b;
  case 'MOMENTUM_20':return c;
  case 'VOTE_5_10_20':return sign(a+b+c);
  case 'REVERSION_5':return -a;
  default:return 0;
 }
}
function wilsonLower(w,n){
 if(n<=0)return 0;
 const z=1.96,p=w/n,den=1+z*z/n;
 return Math.max(0,(p+z*z/(2*n)-z*Math.sqrt((p*(1-p)+z*z/(4*n))/n))/den);
}
function evaluatePolicy(prices,observations,policy){
 let wins=0,decisions=0,ties=0;
 for(const row of observations){
  const d=forecast(prices,row.i,policy);
  if(!d)continue;
  decisions++;
  const actual=sign(prices[row.i+row.h]-prices[row.i]);
  if(actual===0)ties++;
  if(d===actual)wins++;
 }
 return {wins,decisions,ties,hitRate:decisions?wins/decisions:null,
  wilson95Lower:decisions?wilsonLower(wins,decisions):0};
}
export function evaluateTickHorizons(rawPrices,{minTraining=30,minValidation=20}={}){
 if(!Array.isArray(rawPrices)||rawPrices.length<50||
  rawPrices.length>10000||rawPrices.some(p=>!Number.isFinite(p)||p<=0)){
  return SUPPORTED_TICK_HORIZONS.map(durationTicks=>({
   durationTicks,readyForProposal:false,direction:'ESPERAR',
   reason:'TICK_HISTORY_UNAVAILABLE',validationDecisions:0}));
 }
 const prices=rawPrices;
 return SUPPORTED_TICK_HORIZONS.map(h=>{
  const horizonStart=performance.now();
  // Etiquetas independientes: cada vencimiento usa h ticks posteriores,
  // y los inicios de entrenamiento y validacion avanzan en bloques de h.
  const cases=[];
  for(let i=30;i+h<prices.length;i+=h)cases.push({i,h});
  const cut=Math.floor(cases.length*.6),training=cases.slice(0,cut),
   validation=cases.slice(cut);
  // La politica se selecciona con entrenamiento, nunca con el holdout.
  const candidates=POLICIES.map(policy=>({
   policy,...evaluatePolicy(prices,training,policy)}))
   .filter(c=>c.decisions>=minTraining);
  candidates.sort((a,b)=>b.wilson95Lower-a.wilson95Lower||
   b.decisions-a.decisions||POLICIES.indexOf(a.policy)-POLICIES.indexOf(b.policy));
  const selected=candidates[0]||null;
  const verify=selected?evaluatePolicy(prices,validation,selected.policy):null;
  const vote=selected?forecast(prices,prices.length-1,selected.policy):0;
  const direction=vote===1?'CALL':vote===-1?'PUT':'ESPERAR';
  // Umbral deliberadamente exigente: se evita sobreajuste con muestras pequeñas.
  // Una cotizacion Deriv actual y EV conservadora aun deben aprobarse ANTES de BUY.
  const enough=!!selected&&verify.decisions>=minValidation;
  const readyForProposal=enough&&verify.wilson95Lower>=.58&&direction!=='ESPERAR';
  return {durationTicks:h,lookbacksTicks:[5,10,20],
   computeMs:Number((performance.now()-horizonStart).toFixed(3)),
   computedAtMs:Date.now(),
   selectedPolicy:selected?.policy||null,
   direction,trainingDecisions:selected?.decisions||0,
   validationDecisions:verify?.decisions||0,
   validationWins:verify?.wins||0,
   validationTies:verify?.ties||0,
   observedValidationHitRate:clean(verify?.hitRate),
   conservativeWinRateLower95:clean(verify?.wilson95Lower),
   readyForProposal,
   reason:!selected?'TRAINING_INSUFFICIENT':
    !enough?'HOLDOUT_INSUFFICIENT':
    direction==='ESPERAR'?'NO_DIRECTION':
    !readyForProposal?'NO_VALIDATED_EDGE':'AWAIT_BROKER_PAYOUT_CHECK',
   payoutChecked:false,canBuyWithoutQuote:false,
   predictionUsesFutureTicks:false,
   realTradingAllowed:false};
 });
}
export function conservativeQuoteDecision(candidate,askPrice,payout,{
 minNetEdge=.02}={}){
 if(!candidate?.readyForProposal||
  ![5,10].includes(candidate.durationTicks)||
  !Number.isFinite(askPrice)||askPrice<=0||
  !Number.isFinite(payout)||payout<=askPrice){
  return {approved:false,reason:'UNVALIDATED_OR_INVALID_QUOTE'};
 }
 const breakEvenWinRate=askPrice/payout;
 const expectedNetReturnLower=candidate.conservativeWinRateLower95*
  (payout/askPrice)-1;
 return {approved:expectedNetReturnLower>=minNetEdge,
  reason:expectedNetReturnLower>=minNetEdge?'CONSERVATIVE_EDGE_PASS':
   'NO_PAYOUT_ADJUSTED_EDGE',
  breakEvenWinRate,expectedNetReturnLower};
}

/**
 * Solo investigacion DEMO: condicion no equivalente a ventaja estadistica.
 * El holdout debe contener datos conocidos anteriores al momento de decidir,
 * y el contrato debe superar por separado la cotizacion real del broker.
 */
export function isExploratoryCandidate(candidate,{
 minTraining=30,minValidation=20,minObservedHitRate=.55}={}){
 return !!candidate&&[5,10].includes(candidate.durationTicks)&&
  ['CALL','PUT'].includes(candidate.direction)&&
  typeof candidate.selectedPolicy==='string'&&candidate.selectedPolicy.length>0&&
  Number.isFinite(candidate.trainingDecisions)&&candidate.trainingDecisions>=minTraining&&
  Number.isFinite(candidate.validationDecisions)&&candidate.validationDecisions>=minValidation&&
  Number.isFinite(candidate.observedValidationHitRate)&&
  candidate.observedValidationHitRate>=minObservedHitRate;
}
export function exploratoryQuoteDecision(candidate,askPrice,payout,{
 minObservedNetEdge=.03}={}){
 if(!isExploratoryCandidate(candidate)||!Number.isFinite(askPrice)||askPrice<=0||
  !Number.isFinite(payout)||payout<=askPrice)
  return {approved:false,reason:'EXPLORATORY_INSUFFICIENT_SAMPLE_OR_QUOTE',
   validatedEdge:false};
 const breakEvenWinRate=askPrice/payout;
 const observedNetReturn=candidate.observedValidationHitRate*(payout/askPrice)-1;
 return {approved:observedNetReturn>=minObservedNetEdge,
  reason:observedNetReturn>=minObservedNetEdge?
   'DEMO_EXPLORATORY_OBSERVED_EDGE_ONLY':'EXPLORATORY_QUOTED_EDGE_TOO_LOW',
  breakEvenWinRate,observedNetReturn,validatedEdge:false};
}
