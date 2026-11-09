// Solo análisis de resultados DEMO. No envía órdenes ni entrena un broker.
// El aprendizaje online en modo sombra evita utilizar el resultado de una
// operación para pronosticar esa misma operación (sin fuga de futuro).
const good=n=>typeof n==='number'&&Number.isFinite(n);
const num=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const median=values=>{
 const a=values.filter(good).sort((a,b)=>a-b);
 return a.length?(a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2):null;
};
const round=(n,d=4)=>good(n)?Number(n.toFixed(d)):null;
const winStats=rows=>{
 const n=rows.length,wins=rows.filter(r=>r.pnl>0).length,losses=rows.filter(r=>r.pnl<0).length;
 return {n,wins,losses,winRate:n?round(wins/n,4):null,
  netCents:Math.round(rows.reduce((sum,r)=>sum+r.pnl,0)),
  avgPnlCents:n?round(rows.reduce((sum,r)=>sum+r.pnl,0)/n,2):null};
};
function wilson(w,n){
 if(!n)return null;
 const z=1.96,p=w/n,denom=1+z*z/n;
 const m=(p+z*z/(2*n))/denom;
 const half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/denom;
 return {lower:round(Math.max(0,m-half)),upper:round(Math.min(1,m+half))};
}
const maxSize=100000;
export function buildTradeQualityReport(rawRows){
 if(!Array.isArray(rawRows))throw Error('INVALID_LEARNING_ROWS');
 if(rawRows.length>maxSize)throw Error('TOO_MANY_ROWS_TO_EVALUATE');
 const rejected=new Map(),settled=[];
 for(const row of rawRows){
  if(row.state==='REJECTED'){
   const code=String(row.error_code||'RECHAZO_SIN_CODIGO').replace(/[^A-Z0-9_]/g,'').slice(0,80);
   rejected.set(code,(rejected.get(code)||0)+1);continue;
  }
  if(row.state!=='SETTLED')continue;
  const pnl=num(row.pnl_cents),stake=num(row.stake_cents);
  if(!good(pnl)||!good(stake)||stake<=0)continue;
  settled.push({pnl,stake,
   symbol:String(row.symbol||''),direction:String(row.direction||''),
   version:String(row.app_version||'SIN_VERSION_HISTORICA'),
   strategy:String(row.strategy_version||'SIN_ESTRATEGIA_HISTORICA'),
   at:num(row.bought_at_ms)??((num(row.created_at)||0)*1000),
   settledAt:num(row.settled_at_ms),
   age:num(row.signal_age_ms),proposalMs:num(row.proposal_latency_ms),
   signalStrength:num(row.signal_strength),signalRsi:num(row.signal_rsi),
   fiveTickMomentum:num(row.signal_five_tick_momentum),
   tickRsi14:num(row.signal_tick_rsi14),
   studyHitRate:num(row.five_tick_study_hit_rate),studyN:num(row.five_tick_study_n),
   buyMs:num(row.buy_latency_ms),entry:num(row.entry_tick),exit:num(row.exit_tick),
   quote:num(row.signal_quote),modelMae:num(row.projection_model_mae),
   naiveMae:num(row.projection_naive_mae)});
 }
 settled.sort((a,b)=>a.at-b.at);
 const versions=new Map();
 for(const row of settled){
  if(!versions.has(row.version))versions.set(row.version,[]);
  versions.get(row.version).push(row);
 }
 const versionStats=[...versions].map(([version,rows])=>({
  version,...winStats(rows),ci95:wilson(rows.filter(x=>x.pnl>0).length,rows.length)
 }));
 const lastVersion=settled.at(-1)?.version||null;
 const recent=versions.get(lastVersion)||[];
 const firstHalf=recent.slice(0,Math.floor(recent.length/2));
 const secondHalf=recent.slice(Math.floor(recent.length/2));
 const winners=recent.filter(r=>r.pnl>0),losers=recent.filter(r=>r.pnl<0);
 const failures=losers.map(r=>{
  const move=(good(r.entry)&&good(r.exit))?
   (r.exit-r.entry)*(r.direction==='CALL'?1:r.direction==='PUT'?-1:0):null;
  return {symbol:r.symbol,direction:r.direction,pnlCents:r.pnl,
   code:move===null?'SIN_SPOTS':move<0?'MOVIMIENTO_CONTRARIO':
    move===0?'EMPATE':'VERIFICAR_CONTRATO'};
 });
 // Evaluación verdaderamente causal: solo aprende una liquidación cuando
 // su hora de liquidación es anterior a la siguiente compra. Las tandas
 // simultáneas NUNCA conocen el resultado de los otros contratos aún abiertos.
 const cohorts=new Map(),shadow=[];
 const events=settled.filter(r=>good(r.settledAt)&&r.settledAt>=r.at)
  .sort((a,b)=>a.settledAt-b.settledAt);
 const keyOf=r=>[r.strategy,r.symbol,r.direction].join('|');
 const update=r=>{
  const key=keyOf(r),prior=cohorts.get(key)||{wins:0,n:0};
  prior.n++;if(r.pnl>0)prior.wins++;cohorts.set(key,prior);
 };
 let nextEvent=0;
 for(const row of settled){
  while(nextEvent<events.length&&events[nextEvent].settledAt<=row.at){
   update(events[nextEvent]);nextEvent++;
  }
  if(!['CALL','PUT'].includes(row.direction)||!row.symbol)continue;
  const prior=cohorts.get(keyOf(row))||{wins:0,n:0};
  const before=(prior.wins+1)/(prior.n+2);
  if(prior.n>=5)shadow.push({prediction:before,won:row.pnl>0?1:0,version:row.version});
 }
 const shadowByVersion=[...new Set(shadow.map(x=>x.version))].map(version=>{
  const v=shadow.filter(x=>x.version===version);
  const brier=v.reduce((acc,x)=>acc+(x.prediction-x.won)**2,0)/v.length;
  return {version,n:v.length,brier:round(brier,5),baselineBrier:.25,
   outperformedBaseline:v.length>=30&&brier<.25};
 });
 const brier=shadow.length?shadow.reduce((sum,x)=>sum+(x.prediction-x.won)**2,0)/shadow.length:null;
 const baseBrier=shadow.length?shadow.reduce((sum,x)=>sum+(.5-x.won)**2,0)/shadow.length:null;
 const maE=recent.filter(r=>good(r.modelMae)&&good(r.naiveMae));
 const byStrength=[
  {name:'0-25',min:0,max:25},{name:'26-50',min:26,max:50},
  {name:'51-75',min:51,max:75},{name:'76-100',min:76,max:100}
 ].map(bin=>{
  const matches=recent.filter(r=>good(r.signalStrength)&&r.signalStrength>=bin.min&&r.signalStrength<=bin.max);
  return {range:bin.name,...winStats(matches)};
 });
 const tickFeature=recent.filter(r=>good(r.fiveTickMomentum));
 const withTrend=tickFeature.filter(r=>r.fiveTickMomentum*
  (r.direction==='CALL'?1:r.direction==='PUT'?-1:0)>0);
 const opposed=tickFeature.filter(r=>r.fiveTickMomentum*
  (r.direction==='CALL'?1:r.direction==='PUT'?-1:0)<0);
 const research={fiveTickRecorded:tickFeature.length,notRecorded:recent.length-tickFeature.length,
  momentumAligned:winStats(withTrend),momentumOpposed:winStats(opposed),
  strengthBands:byStrength,studyIsHistoricalOnly:true,
  note:'Análisis exploratorio. Las métricas describen compras ya seleccionadas; no prueban capacidad predictiva fuera de muestra.'};
 const quote=recent.filter(r=>good(r.quote)&&good(r.entry));
 const moveQuote=quote.map(r=>({won:r.pnl>0,aligned:(r.entry-r.quote)*(r.direction==='CALL'?1:-1)}));
 const quoteGood=moveQuote.filter(r=>r.aligned>0),quoteBad=moveQuote.filter(r=>r.aligned<0);
 return {mode:'EVALUACION_EN_SOMBRA',predictionAltersBuy:false,realEnabled:false,
  note:'Las tasas recientes no prueban mejora ni causalidad. Predicciones en sombra usan solamente liquidaciones anteriores. No cambian CALL/PUT ni apuestas.',
  rawRows:rawRows.length,settled:winStats(settled),
  rejected:Object.fromEntries([...rejected].sort((a,b)=>b[1]-a[1])),
  versions:versionStats,latestVersion:lastVersion,
  latest:winStats(recent),firstHalf:winStats(firstHalf),secondHalf:winStats(secondHalf),
  last10:winStats(recent.slice(-10)),
  latestCI95:wilson(recent.filter(r=>r.pnl>0).length,recent.length),
  latency:{
   winners:{signalAgeMedianMs:median(winners.map(x=>x.age)),
    proposalMedianMs:median(winners.map(x=>x.proposalMs)),buyMedianMs:median(winners.map(x=>x.buyMs))},
   losers:{signalAgeMedianMs:median(losers.map(x=>x.age)),
    proposalMedianMs:median(losers.map(x=>x.proposalMs)),buyMedianMs:median(losers.map(x=>x.buyMs))}
  },
  quoteToEntry:{observed:quote.length,
   favorable:{n:quoteGood.length,wins:quoteGood.filter(x=>x.won).length},
   adverse:{n:quoteBad.length,wins:quoteBad.filter(x=>x.won).length},
   note:'El movimiento entre cotización observada y entrada no es prueba de causalidad ni slippage del broker.'},
  research,
  projection:{compared:maE.length,modelBetter:maE.filter(x=>x.modelMae<x.naiveMae).length,
   modelWorse:maE.filter(x=>x.modelMae>x.naiveMae).length,
   modelEqual:maE.filter(x=>x.modelMae===x.naiveMae).length,
   usedForBuy:false},
  shadow:{evaluated:shadow.length,byVersion:shadowByVersion,causalSettlementOnly:true,brier:round(brier,5),
   baselineBrier:round(baseBrier,5),outperformedBaseline:shadow.length>=30&&brier<baseBrier,
   usedForBuy:false,method:'Beta(1,1) online por estrategia/símbolo/dirección'},
  lossExamples:failures.slice(-10)};
}
