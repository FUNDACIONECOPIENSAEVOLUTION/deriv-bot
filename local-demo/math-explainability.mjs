// ECOPIENSA-EXPLICA v1: formulas de resultado, coste, prueba temporal
// y estado broker. 100% SOLO LECTURA. No entrena un bot de compras.
export const EXPLANATION_FORMULA='ECOPIENSA_EXPLICA_1';
export const HISTORICAL_HOLDOUT_START_MS=1794268706200; // Fin CSV anterior 2026-11-09 23:58:26.200 UTC
const n=x=>{
 if(x===null||x===undefined||x==='')return null;
 const y=Number(typeof x==='string'?x.replace(/^_(?=-)/,''):x);
 return Number.isFinite(y)?y:null;
};
const read=(r,...keys)=>keys.reduce((v,k)=>v!==undefined?v:r?.[k],undefined);
const fixed=(v,d=4)=>Number.isFinite(v)?Number(v.toFixed(d)):null;
const pct=(a,b)=>b>0?fixed(100*a/b,2):null;
const mUsd=x=>fixed(x/100,2);
const getPnl=r=>n(read(r,'pnl_cents','pnlCents'));
const getAmount=r=>n(read(r,'buy_cents','buyCents'))??
 n(read(r,'stake_cents','stakeCents'));
const getCreated=r=>n(read(r,'created_at_ms','createdAtMs'))??
 (n(read(r,'created_at','createdAt'))??0)*1000;
const getStrength=r=>n(read(r,'signal_strength','signalStrength'));
export function wilson95Lower(wins,count){
 if(!Number.isInteger(wins)||!Number.isInteger(count)||count<1||
  wins<0||wins>count)return null;
 const z=1.95996398454,p=wins/count,q=z*z,den=1+q/count;
 return Math.max(0,(p+q/(2*count)-z*Math.sqrt((p*(1-p)+q/(4*count))/count))/den);
}
function financial(group){
 const settled=group.filter(r=>r?.state==='SETTLED'&&getPnl(r)!==null&&getAmount(r)>0);
 const wins=settled.filter(r=>getPnl(r)>0),losses=settled.filter(r=>getPnl(r)<0);
 const stake=settled.reduce((v,r)=>v+getAmount(r),0);
 const grossWin=wins.reduce((v,r)=>v+getPnl(r),0);
 const grossLoss=losses.reduce((v,r)=>v-getPnl(r),0);
 const avgWin=wins.length?grossWin/wins.length:null;
 const avgLoss=losses.length?grossLoss/losses.length:null;
 const breakeven=avgWin!==null&&avgLoss!==null&&avgWin+avgLoss>0?
  avgLoss/(avgWin+avgLoss):null;
 const sumPnl=grossWin-grossLoss;
 return {settled:settled.length,wins:wins.length,losses:losses.length,
  winRatePct:pct(wins.length,settled.length),
  winRateLower95Pct:pct(wilson95Lower(wins.length,settled.length)??NaN,1),
  grossGainUsd:mUsd(grossWin),grossLossUsd:mUsd(grossLoss),
  netUsd:mUsd(sumPnl),stakedUsd:mUsd(stake),roiPct:pct(sumPnl,stake),
  averageWinUsd:avgWin!==null?mUsd(avgWin):null,
  averageLossUsd:avgLoss!==null?mUsd(avgLoss):null,
  observedBreakEvenWinRatePct:breakeven!==null?pct(breakeven,1):null,
  observedMeanEvUsd:settled.length?mUsd(sumPnl/settled.length):null};
}
function groupsByStrength(rows,threshold){
 const known=rows.filter(r=>getStrength(r)!==null);
 const low=known.filter(r=>getStrength(r)<=threshold);
 const high=known.filter(r=>getStrength(r)>threshold);
 return {low:financial(low),high:financial(high),
  signalMissing:rows.length-known.length};
}
function operational(rows){
 const stateCounts={},rejections={},unknownNow=[];
 for(const row of rows){
  const st=String(row?.state??'SIN_ESTADO');
  stateCounts[st]=(stateCounts[st]||0)+1;
  if(st==='REJECTED'){
   const error=String(read(row,'error_code','errorCode')||'SIN_CODIGO').slice(0,60);
   rejections[error]=(rejections[error]||0)+1;
  }
  if(['UNKNOWN','SENDING','PREPARING','OPEN'].includes(st))unknownNow.push(st);
 }
 return {stateCounts,rejectionCauses:Object.entries(rejections)
  .map(([reason,count])=>({reason,count}))
  .sort((a,b)=>b.count-a.count),
  unresolvedNow:unknownNow.length,
  uncertainBuyNow:unknownNow.filter(x=>x!=='OPEN').length,
  closedUnknownTransitionCount:null,
  note:'UNKNOWN o BUY sin ACK es una INCERTIDUMBRE DE REGISTRO; no es PUT ni CALL incorrecto y no puede transformarse en pérdida o en compra nueva sin cotejar Deriv. No hay historial de transiciones de estado.'};
}
function priceMath(rows){
 let valid=0,consistent=0,adverse=0,favorable=0,unchanged=0,entryPriceAvailable=0;
 for(const row of rows){
  if(row.state!=='SETTLED')continue;
  const entry=n(read(row,'entry_tick','entryTick')),
   exit=n(read(row,'exit_tick','exitTick')),
   signal=n(read(row,'signal_quote','signalQuote'));
  const direction=row.direction==='CALL'?1:row.direction==='PUT'?-1:0;
  const pnl=getPnl(row);
  if(!direction||pnl===null||entry===null||exit===null)continue;
  const margin=direction*(exit-entry);
  valid++;
  if((margin>0)===(pnl>0))consistent++;
  if(signal!==null){
   entryPriceAvailable++;
   const drift=direction*(entry-signal);
   if(drift>1e-10)adverse++;
   else if(drift< -1e-10)favorable++;
   else unchanged++;
  }
 }
 return {verifiedDirectionOutcomes:valid,matchedSettlementSign:consistent,
  matchingRatePct:pct(consistent,valid),entriesWithSignalQuote:entryPriceAvailable,
  preEntryFavorableDrift:favorable,preEntryAdverseDrift:adverse,
  unchangedQuoteToEntry:unchanged,
  preEntryAdversePct:pct(adverse,entryPriceAvailable),
  qualification:'Explica una liquidación DESPUES del contrato. Una diferencia señal-entrada no demuestra por si sola que la latencia haya causado la pérdida ni predice los próximos ticks.'};
}
function recentExplanations(rows,max=12){
 return rows.filter(r=>r.state==='SETTLED'&&getPnl(r)!==null)
  .sort((a,b)=>(n(read(b,'bought_at_ms','boughtAtMs'))||0)-
   (n(read(a,'bought_at_ms','boughtAtMs'))||0))
  .slice(0,max).map(row=>{
   const d=row.direction==='CALL'?1:row.direction==='PUT'?-1:0;
   const entry=n(read(row,'entry_tick','entryTick')),
    exit=n(read(row,'exit_tick','exitTick')),
    signal=n(read(row,'signal_quote','signalQuote'));
   const known=entry!==null&&exit!==null&&d!==0;
   const change=known?exit-entry:null;
   const margin=known?d*(exit-entry):null;
   const move=known?(change>0?'CALL':change<0?'PUT':'SIN_CAMBIO'):'DESCONOCIDO';
   const drift=known&&signal!==null?d*(entry-signal):null;
   const expectedWin=known?margin>0:null;
   return {symbol:String(row.symbol||'DESCONOCIDO'),
    durationTicks:n(read(row,'duration_ticks','durationTicks')),
    chosen:String(row.direction||'DESCONOCIDO'),realizedMove:move,
    realizedBrokerWin:getPnl(row)>0,pnlUsd:mUsd(getPnl(row)),
    signalStrength:getStrength(row),signalAgeMs:n(read(row,'signal_age_ms','signalAgeMs')),
    normalizedSignedMargin:known?fixed(margin,6):null,
    formulaMatchesBroker:expectedWin===null?null:expectedWin===(getPnl(row)>0),
    entryDriftAligned:drift===null?'DESCONOCIDO':
     drift>1e-10?'PRECIO_MOVIO_A_FAVOR_DE_LA_DIRECCION_ANTES_DE_ENTRAR':
     drift< -1e-10?'PRECIO_MOVIO_EN_CONTRA_ANTES_DE_ENTRAR':'SIN_CAMBIO',
    explanation:!known?'SPOTS_INSUFFICIENTES':
     margin>0?'LA_DIRECCION_COMPRADA_COINCIDIO_CON_EL_MOVIMIENTO':
     margin<0?'EL_MOVIMIENTO_REAL_FUE_CONTRARIO_A_LA_DIRECCION_COMPRADA':
     'EMPATE_O_SIN_VARIACION'
   };
  });
}
function runTest(rows){
 const settled=rows.filter(r=>r?.state==='SETTLED'&&getPnl(r)!==null)
  .sort((a,b)=>(n(read(a,'bought_at_ms','boughtAtMs'))||0)-
   (n(read(b,'bought_at_ms','boughtAtMs'))||0));
 const labels=settled.map(r=>getPnl(r)>0);
 const w=labels.filter(Boolean).length,l=labels.length-w,N=labels.length;
 if(w<2||l<2)return {n:N,status:'INSUFFICIENT'};
 const runs=1+labels.slice(1).filter((x,i)=>x!==labels[i]).length;
 const expected=1+2*w*l/N;
 const variance=2*w*l*(2*w*l-N)/(N*N*(N-1));
 return {n:N,runs,expectedRuns:fixed(expected,2),
  runsZ:variance>0?fixed((runs-expected)/Math.sqrt(variance),3):null,
  interpretation:'Prueba descriptiva de rachas. Operaciones en una misma ola no son independientes; no inferir causalidad.'};
}
export function buildMathExplanation(raw,{
 threshold=55,priorCreatedMs=HISTORICAL_HOLDOUT_START_MS
}={}){
 if(!Array.isArray(raw)||raw.length>100000||
  !Number.isFinite(threshold)||threshold<0||threshold>100||
  !Number.isFinite(priorCreatedMs)||priorCreatedMs<1)
  throw Error('MATH_EXPLANATION_ROWS_OR_PARAMETERS_INVALID');
 const rows=raw.filter(x=>x&&typeof x==='object');
 const settled=rows.filter(r=>r.state==='SETTLED'&&getPnl(r)!==null&&getAmount(r)>0);
 const prior=settled.filter(r=>getCreated(r)<=priorCreatedMs);
 const future=settled.filter(r=>getCreated(r)>priorCreatedMs);
 const overall=financial(settled);
 const pastStrength=groupsByStrength(prior,threshold);
 const futureStrength=groupsByStrength(future,threshold);
 const laterHigh=futureStrength.high;
 const breakEven=(overall.observedBreakEvenWinRatePct??100)/100;
 const sufficient=laterHigh.settled>=100&&laterHigh.winRateLower95Pct!==null;
 // La rentabilidad confirmada requiere significación estadística y
 // economía positiva en datos posteriores. Aquí no se ordena BUY aun así.
 const evidence=sufficient&&laterHigh.winRateLower95Pct/100>breakEven&&
  laterHigh.netUsd>0?'PRELIMINARY_FORWARD_ECONOMIC_EDGE':
  laterHigh.settled<100?'NOT_ENOUGH_FORWARD_HIGH_STRENGTH_SAMPLES':
  'NOT_VALIDATED_OUT_OF_SAMPLE';
 return {formula:EXPLANATION_FORMULA,mode:'EXPLAIN_RESULTS_ONLY',readOnly:true,
  realEnabled:false,brokerOrdersSent:0,mayRecommendBuy:false,
  definitions:{
   realizedContractDirection:'m = s*(exitSpot-entrySpot), s=+1 CALL o -1 PUT; m>0 implica movimiento favorable (salvo condiciones especiales de contrato)',
   realizedProfit:'PnL = sum(realizedBrokerProfit), solo SETTLED',
   expectedNet:'E[profit] = p*(payout-ask)-(1-p)*ask = p*payout-ask',
   minimumSuccess:'p_min = ask/payout (por contrato), o avgLoss/(avgWin+avgLoss) en agregados historicos',
   brier:'BS = sum((predictedProbability - realizedWin)^2)/n; menor es mejor; usar series futuras sin fuga',
   unresolved:'UNKNOWN = BUY posiblemente enviado sin confirmacion; cotejar statement / portfolio y contract_id antes de resolver; nunca reintentar por deduccion'},
  allTime:overall,operational:operational(rows),settlementMechanics:priceMath(settled),
  sequenceCheck:runTest(settled),recentSettlementsExplained:recentExplanations(settled),
  temporalValidation:{
   selectedHypothesis:'signalStrength > 55; seleccionada en el primer CSV, NO ajustar en el holdout',
   threshold,priorCutoffMs:priorCreatedMs,
   earlier:{...pastStrength,total:financial(prior)},
   later:{...futureStrength,total:financial(future)},
   economicEvidence:evidence,
   attention:'El histórico y el holdout tienen distintas versiones/mercados. Una señal puede correlacionar sin crear rentabilidad; el criterio no concede BUY.'},
  currentConclusion:'La matemática explica las liquidaciones y sus pagos, pero no se ha demostrado con datos posteriores que los indicadores predigan una ventaja económica. UNKNOWN se investiga por transacciones broker, no mediante fórmulas de dirección.'};
}
