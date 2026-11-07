/**
 * Reproducible DEMO-trading postmortem.
 * This module summarizes VERIFIED broker outcomes, never predicts future returns,
 * never changes strategy parameters, and never grants permission to trade real money.
 */
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
function wilsonLower(success,n,z=1.96){
  if(!n)return null;
  const p=success/n,den=1+z*z/n;
  const center=p+z*z/(2*n),margin=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n));
  return Math.max(0,(center-margin)/den);
}
function metrics(rows,start=1000){
  let wins=0,losses=0,flats=0,grossWin=0,grossLoss=0,total=0,peak=start,
    balance=start,maxDrawdown=0;
  const net=[];
  for(const row of rows){
    const p=Number(row.pnlCents);
    if(!Number.isSafeInteger(p))throw Error('EVALUATION_INVALID_PNL');
    total+=p;net.push(p);balance+=p;peak=Math.max(peak,balance);
    maxDrawdown=Math.max(maxDrawdown,peak-balance);
    if(p>0){wins++;grossWin+=p;}else if(p<0){losses++;grossLoss-=p;}else flats++;
  }
  const n=rows.length;
  return {n,wins,losses,flats,netPnlCents:total,
    winRatePct:n?Math.round(wins/n*10000)/100:null,
    winRateLower95Pct:n?Math.round(wilsonLower(wins,n)*10000)/100:null,
    expectancyCents:mean(net),maxDrawdownCents:maxDrawdown,
    profitFactor:grossLoss>0?Math.round(grossWin/grossLoss*1000)/1000:null};
}
const rsiBand=d=>typeof d?.rsi==='number'&&Number.isFinite(d.rsi)
  ?d.rsi<40?'RSI_LT_40':d.rsi<=60?'RSI_40_60':'RSI_GT_60':'NO_VALID_RSI';
const volBand=d=>typeof d?.volatility==='number'&&Number.isFinite(d.volatility)
  ?d.volatility<0.1?'VOL_LT_0_1':d.volatility<=0.3?'VOL_0_1_TO_0_3':'VOL_GT_0_3':'NO_VALID_VOL';
function groupOutcomes(rows,fn){
  const map=new Map();
  for(const x of rows){const k=fn(x.decision),arr=map.get(k)||[];arr.push(x);map.set(k,arr);}
  return [...map.entries()].map(([segment,items])=>({
    segment,...metrics(items),smallSample:items.length<30
  })).sort((a,b)=>b.n-a.n||a.segment.localeCompare(b.segment));
}
export function analyzeBrokerDemoHistory(rows,{startingAllocationCents=1000}={}){
  if(!Array.isArray(rows)||rows.length>10000||!Number.isSafeInteger(startingAllocationCents)
    ||startingAllocationCents<=0)throw Error('EVALUATION_INPUT_INVALID');
  const settled=rows.filter(r=>r?.state==='SETTLED').map(r=>({
    id:Number(r.contractId),createdAt:Number(r.createdAt),pnlCents:Number(r.pnlCents),
    decision:r.decision&&typeof r.decision==='object'?r.decision:null,
    entrySpot:Number.isFinite(Number(r.entrySpot))&&r.entrySpot!==null?Number(r.entrySpot):null,
    exitSpot:Number.isFinite(Number(r.exitSpot))&&r.exitSpot!==null?Number(r.exitSpot):null,
  }));
  if(settled.some(r=>!Number.isSafeInteger(r.id)||r.id<=0||!Number.isSafeInteger(r.createdAt)
    ||!Number.isSafeInteger(r.pnlCents)))throw Error('EVALUATION_TRADE_INVALID');
  settled.sort((a,b)=>a.createdAt-b.createdAt||a.id-b.id);
  const seen=new Set();
  if(settled.some(r=>{if(seen.has(r.id))return true;seen.add(r.id);return false;}))
    throw Error('EVALUATION_DUPLICATE_CONTRACT');
  const split=Math.floor(settled.length*0.7),train=settled.slice(0,split),holdout=settled.slice(split);
  const overall=metrics(settled,startingAllocationCents);
  const holdoutMetrics=metrics(holdout,startingAllocationCents);
  const outcomeReasons=settled.map(t=>{
    if(t.pnlCents>=0)return null;
    if(t.entrySpot===null||t.exitSpot===null)return 'LOSS_CAUSE_NOT_VERIFIED';
    return t.exitSpot<=t.entrySpot?'CALL_DID_NOT_RISE_BY_EXPIRY':'LOSS_WITH_SPOT_RISE_REVIEW_CONTRACT_RULES';
  }).filter(Boolean);
  const lossReasons=Object.entries(outcomeReasons.reduce((m,k)=>(m[k]=(m[k]||0)+1,m),{}))
    .map(([code,count])=>({code,count})).sort((a,b)=>b.count-a.count);
  return {mode:'POSTMORTEM_DEMO_ONLY',sampleSize:overall.n,overall,
    training:{...metrics(train,startingAllocationCents),portion:0.7},
    chronologicalHoldout:{...holdoutMetrics,portion:0.3},
    byRsi:groupOutcomes(settled,rsiBand),
    byVolatility:groupOutcomes(settled,volBand),
    losingContractsReasons:lossReasons,
    sampleSufficientForExploration:overall.n>=100,
    holdoutSampleSufficient:holdoutMetrics.n>=100,
    tradeRealAutomatically:false,
    interpretation:'Historical correlations do not establish causality. No strategy tuning based on holdout.',
    caveats:['Only broker-confirmed SETTLED trades, not PAPER simulations.',
      'Chronological split is descriptive; strategy selection must be confined to training data.',
      'Win rate alone is not proof of profitability. Check costs, net expectancy and drawdown.',
      'A separate out-of-sample forward evaluation and explicit owner approval are required for any real account.']};
}
