// Auditoria causalmente prudente del historial DEMO: informacion real
// por tanda. Agrupaciones descriptivas NO son estimaciones del futuro.
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const numeric=v=>v===null||v===undefined||v===''?null:finite(Number(v))?Number(v):null;
function median(values){
 const s=values.filter(finite).sort((a,b)=>a-b);
 return s.length?(s.length%2?s[(s.length-1)/2]:
  (s[s.length/2-1]+s[s.length/2])/2):null;
}
function summarize(rows){
 const settled=rows.filter(x=>x.state==='SETTLED'&&numeric(x.pnlCents)!==null);
 const rejected=rows.filter(x=>x.state==='REJECTED');
 const wins=settled.filter(x=>Number(x.pnlCents)>0).length;
 const losses=settled.filter(x=>Number(x.pnlCents)<0).length;
 const netCents=settled.reduce((n,x)=>n+Number(x.pnlCents),0);
 const stakedCents=settled.reduce((n,x)=>n+(numeric(x.stakeCents)||0),0);
 const validLatency=settled.filter(x=>numeric(x.buyLatencyMs)!==null);
 return {settled:settled.length,wins,losses,
  flat:Math.max(0,settled.length-wins-losses),
  rejected:rejected.length,
  netCents,stakedCents,
  winRatePct:settled.length?Number((100*wins/settled.length).toFixed(2)):null,
  roiPct:stakedCents?Number((100*netCents/stakedCents).toFixed(2)):null,
  medianBuyLatencyMs:median(validLatency.map(x=>numeric(x.buyLatencyMs))),
  medianSignalAgeMs:median(settled.map(x=>numeric(x.signalAgeMs))),
  medianProposalLatencyMs:median(settled.map(x=>numeric(x.proposalLatencyMs))),
  medianIntentToBuyMs:median(settled.map(x=>numeric(x.intentToBuyMs)))};
}
function group(rows,field){
 const map=new Map();
 for(const x of rows){
  const raw=x[field],key=raw===undefined||raw===null||raw===''?'SIN_REGISTRO':String(raw);
  if(!map.has(key))map.set(key,[]);
  map.get(key).push(x);
 }
 return [...map.entries()].map(([value,items])=>({value,...summarize(items)}))
  .sort((a,b)=>b.settled-a.settled||b.rejected-a.rejected||a.value.localeCompare(b.value));
}
export function analyzeProgramRounds(program,orders){
 if(!program||!Array.isArray(program.batches)||!Array.isArray(orders))
  throw Error('PROGRAM_ANALYSIS_INPUT_INVALID');
 if(orders.length>10000)throw Error('PROGRAM_ANALYSIS_TOO_MANY_ORDERS');
 const rounds=program.batches.map(b=>{
  const items=orders.filter(x=>x.programId===program.id&&x.batchId===b.batchId);
  const rejectReasons=group(items.filter(x=>x.state==='REJECTED'),'errorCode');
  return {batchId:b.batchId,round:b.round,programId:program.id,
   ...summarize(items),bySymbol:group(items,'symbol'),
   byDuration:group(items,'durationTicks'),
   byDirection:group(items,'direction'),byPolicy:group(items,'predictionPolicy'),
   byMode:group(items,'predictionMode'),
   rejectReasons:rejectReasons.map(x=>({reason:x.value,count:x.rejected})),
   note:'DESCRIPTIVE_ONLY_NO_CAUSAL_INFERENCE'};
 });
 const all=orders.filter(x=>x.programId===program.id);
 return {programId:program.id,state:program.state,
  stopReason:program.stopReason||null,
  continueOnNegativeRound:Boolean(program.continueOnNegativeRound),
  roundsRequested:program.roundsRequested,
  roundsCompleted:program.roundsCompleted,
  total:summarize(all),rounds,
  disclosure:'Un grupo con aciertos altos en 10 contratos puede ser azar. No atribuir causas sin experimento prospectivo.'};
}
