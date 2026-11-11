// Informe de rentabilidad DEMO exclusivamente descriptivo; JAMAS envia BUY.
// Evalua pagos efectivos, punto de equilibrio y validacion cronologica;
// comparar muchos grupos puede producir falsos positivos por azar.
const numberOrNull=value=>value===null||value===undefined||value===''?null:
 Number.isFinite(Number(value))?Number(value):null;
const rounded=(value,places=4)=>Number.isFinite(value)?Number(value.toFixed(places)):null;
function wilsonLower(wins,n,z=1.96){
 if(!n)return null;
 const p=wins/n,den=1+z*z/n;
 return Math.max(0,(p+z*z/(2*n)-z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/den);
}
function summarize(rows){
 const wins=rows.filter(x=>x.pnl>0),losses=rows.filter(x=>x.pnl<0);
 const n=rows.length,winAvg=wins.length?wins.reduce((a,x)=>a+x.pnl/x.stake,0)/wins.length:null;
 const lossAvg=losses.length?losses.reduce((a,x)=>a-x.pnl/x.stake,0)/losses.length:null;
 const breakEven=winAvg!==null&&lossAvg!==null&&winAvg+lossAvg>0?
  lossAvg/(winAvg+lossAvg):null;
 const stake=rows.reduce((a,x)=>a+x.stake,0),net=rows.reduce((a,x)=>a+x.pnl,0);
 return {n,wins:wins.length,losses:losses.length,winRate:rounded(n?wins.length/n:null),
  winRateLower95:rounded(wilsonLower(wins.length,n)),netCents:rounded(net,2),
  stakedCents:rounded(stake,2),roi:rounded(stake>0?net/stake:null),
  avgWinReturn:rounded(winAvg),avgLossReturn:rounded(lossAvg),
  breakEvenWinRate:rounded(breakEven)};
}
const textValue=v=>typeof v==='string'&&v.trim()?v.trim():'SIN_DATO';
export function buildProfitabilityResearch(rawRows,{minTrain=60,minHoldout=30}={}){
 if(!Array.isArray(rawRows)||rawRows.length>100000)throw Error('INVALID_PROFITABILITY_ROWS');
 const rows=rawRows.filter(r=>r?.state==='SETTLED').map(r=>({
  pnl:numberOrNull(r.pnl_cents),stake:numberOrNull(r.stake_cents),
  at:numberOrNull(r.bought_at_ms),settledAt:numberOrNull(r.settled_at_ms),
  symbol:textValue(r.symbol),direction:textValue(r.direction),
  version:textValue(r.app_version),policy:textValue(r.prediction_policy),
  horizon:numberOrNull(r.duration_ticks),reason:textValue(r.signal_reason),
  feedAge:numberOrNull(r.telemetry_buy_feed_age_ms)
 })).filter(r=>Number.isFinite(r.pnl)&&Number.isFinite(r.stake)&&r.stake>0&&
  Number.isFinite(r.at)&&r.at>0&&Number.isFinite(r.settledAt)&&r.settledAt>=r.at&&
  ['CALL','PUT'].includes(r.direction)).sort((a,b)=>a.at-b.at||a.settledAt-b.settledAt);
 const groups=[['policy',r=>r.policy],['market',r=>r.symbol],
  ['marketHorizon',r=>r.symbol+'|'+(r.horizon??'SIN_DATO')],
  ['policyHorizon',r=>r.policy+'|'+(r.horizon??'SIN_DATO')],
  ['marketHorizonDirection',r=>[r.symbol,r.horizon??'SIN_DATO',r.direction].join('|')],
  ['marketHorizonPolicyDirection',r=>[r.symbol,r.horizon??'SIN_DATO',r.policy,r.direction].join('|')],
  ['direction',r=>r.direction],['horizon',r=>String(r.horizon??'SIN_DATO')],
  ['marketDirection',r=>`${r.symbol}/${r.direction}`],
  ['reason',r=>r.reason],['version',r=>r.version]];
 const segmentation=Object.fromEntries(groups.map(([name,key])=>{
  const buckets=new Map();
  for(const r of rows){const k=key(r);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(r);}
  return [name,[...buckets].map(([key,values])=>{
   const cutoff=Math.floor(values.length*.7),training=values.slice(0,cutoff),holdout=values.slice(cutoff);
   const train=summarize(training),test=summarize(holdout),full=summarize(values);
   const enough=training.length>=minTrain&&holdout.length>=minHoldout;
   const plausible=enough&&train.breakEvenWinRate!==null&&test.breakEvenWinRate!==null&&
    train.roi>0&&test.roi>0&&
    train.winRateLower95>train.breakEvenWinRate&&
    test.winRateLower95>test.breakEvenWinRate;
   return {key,...full,chronological:{training:train,holdout:test},
    status:plausible?'PRELIMINARY_UNCORRECTED_FOR_MULTIPLE_TESTING':
     enough?'NO_DEMONSTRATED_EDGE':'INSUFFICIENT_CHRONOLOGICAL_SAMPLE'};
  }).sort((a,b)=>b.n-a.n||a.key.localeCompare(b.key))];
 }));
 const ageBands=[{key:'0-300ms',min:0,max:300},
  {key:'301-750ms',min:301,max:750},{key:'751ms+',min:751,max:Infinity}]
  .map(b=>({key:b.key,...summarize(rows.filter(r=>r.feedAge!==null&&r.feedAge>=b.min&&r.feedAge<=b.max))}));
 return {mode:'SOLO_LECTURA_DEMO',realEnabled:false,tradingAuthorized:false,
  source:'OFFICIAL_SETTLED_CONTRACTS',total:summarize(rows),segmentation,
  latencyFeedAge:ageBands,unverifiedCandidateCount:Object.values(segmentation)
   .flat().filter(x=>x.status==='PRELIMINARY_UNCORRECTED_FOR_MULTIPLE_TESTING').length,
  methodology:'Train 70% / holdout 30% en orden de BUY por grupo; intervalo Wilson bilateral del 95%. No es holdout virgen si el grupo se eligio mirando resultados previos.',
  note:'Sin correccion para multiples pruebas, dependencia temporal ni grupo aleatorizado de operaciones no seleccionadas. Ninguna tasa certifica ventaja futura. No modifica BUY, apuestas ni REAL.'};
}
