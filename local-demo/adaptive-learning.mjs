// Aprendizaje prudente, local y experimental a partir de órdenes DEMO liquidadas.
// No importa CSV anónimos al broker: usa SQLite verificado del que se genera el CSV.
// NO aprende a "ganar siempre": veto exclusivo ante bajo rendimiento reproducible.
// Nunca invierte señales, multiplica la apuesta ni permite compras REALES.
const MIN_INDEPENDENT=45,MIN_HOLDOUT=15;
const n=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
function upperMeanBound(a){
 if(a.length<2)return Infinity;
 const avg=mean(a);
 const variance=a.reduce((x,y)=>x+(y-avg)**2,0)/(a.length-1);
 return avg+1.96*Math.sqrt(variance/a.length);
}
export function independentOutcomes(rows){
 const ordered=rows.filter(r=>r?.state==='SETTLED'&&
  typeof r.symbol==='string'&&['CALL','PUT'].includes(r.direction)&&
  Number.isFinite(Number(r.pnl_cents))&&Number(r.stake_cents)>0)
  .sort((a,b)=>(n(a.bought_at_ms)||n(a.created_at)*1000||0)-
               (n(b.bought_at_ms)||n(b.created_at)*1000||0));
 const used=new Set(),out=[];
 for(const row of ordered){
  // Agrupar señales de una misma vela; anteriores a v13.2: ventana de 30 s.
  const candle=n(row.candle_epoch);
  const ms=n(row.bought_at_ms)??(n(row.created_at)||0)*1000;
  const bucket=candle&&candle>0?'c'+candle:'t'+Math.floor(ms/30000);
  const key=row.symbol+'|'+row.direction+'|'+bucket;
  if(used.has(key))continue;
  used.add(key);
  out.push({symbol:row.symbol,direction:row.direction,
   pnlCents:Number(row.pnl_cents),stakeCents:Number(row.stake_cents),
   at:ms,signalAgeMs:n(row.signal_age_ms),rsi:n(row.signal_rsi),
   buyLatencyMs:n(row.buy_latency_ms),candleEpoch:candle});
 }
 return out;
}
export function buildAdaptiveReport(rawRows){
 const independent=independentOutcomes(rawRows);
 const cohorts=new Map();
 for(const row of independent){
  const key=row.symbol+'|'+row.direction;
  if(!cohorts.has(key))cohorts.set(key,[]);
  cohorts.get(key).push(row);
 }
 const groups=[];
 for(const [key,entries] of cohorts){
  const [symbol,direction]=key.split('|');
  // Una evaluación temporal, SIN usar el holdout para elegir umbrales.
  const cut=Math.floor(entries.length*.70);
  const training=entries.slice(0,cut),holdout=entries.slice(cut);
  const validationProfitCents=holdout.reduce((a,b)=>a+b.pnlCents,0);
  const normalized=holdout.map(x=>x.pnlCents/x.stakeCents);
  const upper=upperMeanBound(normalized);
  const validated=entries.length>=MIN_INDEPENDENT&&holdout.length>=MIN_HOLDOUT;
  const negative=validated&&validationProfitCents<0&&upper<0;
  groups.push({symbol,direction,independent:entries.length,
   trainCount:training.length,holdoutCount:holdout.length,
   holdoutNetCents:validationProfitCents,
   holdoutWins:holdout.filter(x=>x.pnlCents>0).length,
   holdoutLosses:holdout.filter(x=>x.pnlCents<0).length,
   holdoutMeanReturn:holdout.length?mean(normalized):null,
   upper95Return: Number.isFinite(upper)?upper:null,
   status:negative?'VETO_RIESGO':validated?'VALIDADO_SIN_VETO':'MUESTRA_INSUFICIENTE',
   blocked:negative});
 }
 groups.sort((a,b)=>b.independent-a.independent||a.symbol.localeCompare(b.symbol));
 return {policy:'aprendizaje-v1-riesgo',source:'SQLite DEMO / exportación CSV',
  sampleRaw:rawRows.length,independent:independent.length,
  minIndependent:MIN_INDEPENDENT,minHoldout:MIN_HOLDOUT,
  groups,blocked:groups.filter(x=>x.blocked).length,
  note:'Se usa validación temporal fuera de la muestra y solo se bloquean estrategias con evidencia fuerte de pérdida. No optimiza promesas de acierto ni aumenta apuestas.',
  realEnabled:false};
}
export function adaptiveVerdict(report,symbol,direction){
 const cohort=report.groups.find(x=>x.symbol===symbol&&x.direction===direction);
 return {blocked:!!cohort?.blocked,reason:cohort?.status||'SIN_HISTORIAL',
  samples:cohort?.independent||0,version:report.policy};
}
