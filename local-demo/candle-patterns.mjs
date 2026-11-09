// Huellas de 20 velas OHLC de diez ticks cerradas ANTES de BUY.
// Investigación DEMO: ninguna clasificación o estimación ejecuta órdenes.
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const n=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const rounded=(x,d=5)=>finite(x)?Number(x.toFixed(d)):null;
const beta=(w,total)=>(w+1)/(total+2);
const brier=(a)=>a.length?rounded(a.reduce((s,x)=>s+(x.p-x.y)**2,0)/a.length):null;
const direction=c=>c.close>c.open?'UP':c.close<c.open?'DOWN':'FLAT';
function patternOf(candles,atr){
 const last=candles.at(-1),prior=candles.at(-2);
 const range=Math.max(last.high-last.low,1e-12);
 const bodyRatio=Math.abs(last.close-last.open)/range;
 const wickUp=(last.high-Math.max(last.close,last.open))/range;
 const wickDown=(Math.min(last.close,last.open)-last.low)/range;
 const baseline=candles.at(-6)?.close??candles[0].close;
 const delta=last.close-baseline;
 const threshold=finite(atr)&&atr>0?atr*.2:Math.max(range*.25,1e-12);
 const trend=delta>threshold?'UP':delta< -threshold?'DOWN':'FLAT';
 const lastDirection=direction(last),lastThree=candles.slice(-3).map(direction);
 const pullback=trend!=='FLAT'&&lastDirection!=='FLAT'&&lastDirection!==trend;
 const continuation=trend!=='FLAT'&&lastDirection===trend;
 const setup=bodyRatio<=.2?'DOJI':pullback?'PULLBACK':continuation?'CONTINUATION':'MIXED';
 const normalizedReturn=finite(atr)&&atr>0?rounded(delta/atr,4):null;
 const prevClose=prior?.close??last.open;
 const gap=finite(atr)&&atr>0?rounded((last.open-prevClose)/atr,4):null;
 return {lastCandleEpoch:last.epoch,trend,lastDirection,lastThree,setup,
  bodyRatio:rounded(bodyRatio,4),upperWickRatio:rounded(wickUp,4),
  lowerWickRatio:rounded(wickDown,4),normalizedReturn,gap,
  context:'CLOSED_10_TICK_CANDLES'};
}
export function captureCandleContext(snapshot,{count=20,atMs=Date.now()}={}){
 if(!snapshot||!Array.isArray(snapshot.candles)||
  !Number.isSafeInteger(count)||count<6||count>30||
  !finite(atMs)||snapshot.candles.length<count)return null;
 const bars=snapshot.candles.slice(-count).map(x=>({
  epoch:n(x.epoch),open:n(x.open),high:n(x.high),
  low:n(x.low),close:n(x.close)
 }));
 let priorEpoch=-Infinity;
 for(const c of bars){
  if(!Number.isInteger(c.epoch)||c.epoch<=priorEpoch||
   ![c.open,c.high,c.low,c.close].every(finite)||c.low<=0||
   c.low>c.high||c.open<c.low||c.open>c.high||
   c.close<c.low||c.close>c.high||c.epoch*1000>atMs+1000)return null;
  priorEpoch=c.epoch;
 }
 // Se archivan hasta 90 ticks independientes (sin transformar en velas).
 // El historico anterior conserva sus 30 ticks sin reconstruccion artificial.
 const ticks=Array.isArray(snapshot.lastPrices)?
  snapshot.lastPrices.slice(-90).map(n).filter(finite):[];
 const epochs=Array.isArray(snapshot.lastTickEpochs)?
  snapshot.lastTickEpochs.slice(-ticks.length):[];
 const tickEpochs=epochs.length===ticks.length&&epochs.every(x=>
  Number.isInteger(x)&&x>0&&x*1000<=atMs+1000)?epochs:[];
 return {schema:1,capturedAtMs:Math.round(atMs),symbol:String(snapshot.symbol||''),
  source:'OHLC_CLOSED_BEFORE_BROKER_BUY',
  quote:n(snapshot.quote),tickEpoch:n(snapshot.epoch),
  ageReceivedMs:n(snapshot.ageReceivedMs),
  signalDirection:String(snapshot.direction||''),
  ema20:n(snapshot.ema20),ema50:n(snapshot.ema50),rsi14:n(snapshot.rsi14),
  atr14:n(snapshot.atr14),fiveTickMomentum:n(snapshot.fiveTickMomentum),
  tickRsi14:n(snapshot.tickRsi14),candles:bars,lastTickPrices:ticks,
  lastTickEpochs:tickEpochs,lastLiveTickSeq:n(snapshot.liveTickSeq),
  pattern:patternOf(bars,n(snapshot.atr14))};
}
export function parseCandleContext(raw){
 if(typeof raw!=='string'||raw.length>20000)return null;
 let c;try{c=JSON.parse(raw);}catch{return null;}
 if(!c||c.schema!==1||!Array.isArray(c.candles)||
  c.candles.length<6||c.candles.length>30||
  !finite(c.capturedAtMs)||typeof c.pattern?.setup!=='string')return null;
 return c;
}
function foldMetrics(items){
 const count=items.length,wins=items.filter(x=>x.y===1).length;
 const err=key=>items.length?
  rounded(items.reduce((s,x)=>s+(x[key]-x.y)**2,0)/items.length):null;
 return {n:count,wins,losses:count-wins,winRate:count?rounded(wins/count,4):null,
  modelBrier:err('model'),historicBrier:err('prior'),neutralBrier:.25,
  netCents:Math.round(items.reduce((s,x)=>s+x.pnl,0))};
}
// Aprendizaje secuencial causal, conservador por dirección y patrón; no
// confundir evaluación de contratos ya seleccionados con política de BUY.
export function evaluateCandlePatterns(rows,{minHistory=30,foldSize=20}={}){
 if(!Array.isArray(rows)||rows.length>100000)throw Error('INVALID_CANDLE_ROWS');
 const samples=[],versionCounts=new Map();
 let missingContext=0,invalidTime=0,duplicates=0;
 const seen=new Set();
 for(const r of rows){
  if(r.state!=='SETTLED')continue;
  const version=String(r.app_version||'HISTORICA_SIN_VERSION');
  const v=versionCounts.get(version)||{version,settled:0,withCandles:0};
  v.settled++;versionCounts.set(version,v);
  const context=parseCandleContext(r.candle_context_json);
  if(!context){missingContext++;continue;}
  v.withCandles++;
  const buy=n(r.bought_at_ms),settled=n(r.settled_at_ms),
   pnl=n(r.pnl_cents),stake=n(r.stake_cents);
  if(!finite(buy)||!finite(settled)||settled<buy||!finite(pnl)||
   !finite(stake)||stake<=0||context.capturedAtMs>buy||
   context.capturedAtMs>context.pattern.lastCandleEpoch*1000+3600000){
   invalidTime++;continue;
  }
  const side=String(r.direction||'');
  if(!['CALL','PUT'].includes(side))continue;
  const key=[r.symbol,side,context.pattern.lastCandleEpoch].join('|');
  if(seen.has(key)){duplicates++;continue;}
  seen.add(key);
  const withTrend=context.pattern.trend==='FLAT'?'SIDEWAYS':
   (context.pattern.trend==='UP'&&side==='CALL')||
   (context.pattern.trend==='DOWN'&&side==='PUT')?'WITH_TREND':'AGAINST_TREND';
  const patternKey=[side,withTrend,context.pattern.setup].join('|');
  samples.push({buy,settled,pnl,stake,side,patternKey,
   symbol:String(r.symbol||''),y:pnl>0?1:0,version});
 }
 samples.sort((a,b)=>a.buy-b.buy||a.settled-b.settled);
 const completed=[...samples].sort((a,b)=>a.settled-b.settled);
 const cohorts=new Map(),out=[];
 let cursor=0,priorN=0,priorWins=0;
 for(const row of samples){
  while(cursor<completed.length&&completed[cursor].settled<=row.buy){
   const closed=completed[cursor++];
   priorN++;priorWins+=closed.y;
   const q=cohorts.get(closed.patternKey)||{n:0,wins:0};
   q.n++;q.wins+=closed.y;cohorts.set(closed.patternKey,q);
  }
  if(priorN<minHistory)continue;
  const prior=beta(priorWins,priorN),cohort=cohorts.get(row.patternKey)||{n:0,wins:0};
  // 20 observaciones equivalentes de prior; nunca usar el resultado presente.
  const model=(cohort.wins+20*prior)/(cohort.n+20);
  out.push({...row,model,prior});
 }
 const folds=[];
 for(let i=0;i<out.length;i+=foldSize){
  const section=out.slice(i,i+foldSize);
  folds.push({fold:folds.length+1,full:section.length===foldSize,
   ...foldMetrics(section)});
 }
 const full=folds.filter(x=>x.full);
 const byPattern=new Map();
 for(const r of samples){
  const x=byPattern.get(r.patternKey)||{pattern:r.patternKey,n:0,wins:0,netCents:0};
  x.n++;x.wins+=r.y;x.netCents+=r.pnl;byPattern.set(r.patternKey,x);
 }
 const patterns=[...byPattern.values()].map(x=>({...x,losses:x.n-x.wins,
  winRate:rounded(x.wins/x.n,4),netCents:Math.round(x.netCents)}))
  .sort((a,b)=>b.n-a.n);
 const scored=foldMetrics(out),sufficient=full.length>=3&&out.length>=60;
 const allBeats=sufficient&&full.every(f=>f.modelBrier<f.historicBrier&&f.modelBrier<.25);
 const versions=[...versionCounts.values()].map(x=>({...x,
  coveragePct:rounded(x.settled?100*x.withCandles/x.settled:0,2)}));
 return {mode:'CANDLE_PATTERN_SHADOW_TRAINING',patternVersion:'CANDLE_CONTEXT_V1',
  predictionAltersBuy:false,realEnabled:false,readyForLiveTrading:false,
  note:'Solo contratos DEMO ya seleccionados. Patrón obtenido de 20 velas cerradas antes de BUY; etiquetas se incorporan únicamente después de liquidar. No demuestra contrafactuales, rentabilidad futura ni tasa 90%.',
  versions,missingContext,invalidTime,duplicates,independentSamples:samples.length,
  trainedSettlements:priorN,scored,fullFolds:full.length,folds:folds.slice(-12),
  patterns:patterns.slice(0,20),sufficientEvidence:sufficient,
  outperformedBaselines:allBeats,
  conclusion:!sufficient?'MUESTRA_DE_VELAS_INSUFICIENTE':
   !allBeats?'SIN_VENTAJA_PREDICTIVA_DEMOSTRADA':'SOLO_EVIDENCIA_PRELIMINAR_VALIDAR_AUN_MAS'};
}
export function exportCandlesCsv(rows){
 if(!Array.isArray(rows)||rows.length>100000)throw Error('INVALID_CANDLE_ROWS');
 const headers=['orderId','batchId','version','symbol','direction','state',
  'capturedAtMs','boughtAtMs','settledAtMs','candlePosition',
  'candleEpoch','open','high','low','close','setup','trend','lastDirection',
  'stakeCents','pnlCents'];
 const esc=v=>typeof v==='number'&&Number.isFinite(v)?String(v):
  '"'+String(v??'').replace(/"/g,'""').replace(/^[=+@-]/,x=>'_'+x)+'"';
 const out=['\uFEFF'+headers.join(',')];
 for(const row of rows){
  const c=parseCandleContext(row.candle_context_json);if(!c)continue;
  const base=[row.id,row.batch_id,row.app_version,row.symbol,row.direction,
   row.state,c.capturedAtMs,row.bought_at_ms,row.settled_at_ms];
  for(let i=0;i<c.candles.length;i++){
   const bar=c.candles[i];
   out.push([...base,i+1,bar.epoch,bar.open,bar.high,bar.low,bar.close,
    c.pattern.setup,c.pattern.trend,c.pattern.lastDirection,
    row.stake_cents,row.state==='SETTLED'?row.pnl_cents:null].map(esc).join(','));
  }
 }
 return out.join('\r\n')+'\r\n';
}

/**
 * CSV causal de ticks individuales PRE-BUY, sin inferir resultados de mercado
 * que no fueron registrados por el cliente. Un tick = una fila.
 */
export function exportTickContextCsv(rows){
 if(!Array.isArray(rows)||rows.length>100000)throw Error('INVALID_TICK_ROWS');
 const keys=['orderId','batchId','version','symbol','direction','durationTicks',
  'predictionMode','predictionPolicy','state','capturedAtMs','boughtAtMs',
  'settledAtMs','lastLiveTickSeq','tickPosition','ticksBeforeBuy',
  'tickEpoch','tickPrice','previousTickDelta','stakeCents','pnlCents'];
 const esc=v=>typeof v==='number'&&Number.isFinite(v)?String(v):
  '"'+String(v??'').replace(/"/g,'""').replace(/^[=+@-]/,x=>'_'+x)+'"';
 const output=['\uFEFF'+keys.join(',')];
 for(const row of rows){
  const context=parseCandleContext(row.candle_context_json);
  if(!context||!Array.isArray(context.lastTickPrices))continue;
  const prices=context.lastTickPrices;
  const epochs=Array.isArray(context.lastTickEpochs)&&
   context.lastTickEpochs.length===prices.length?context.lastTickEpochs:[];
  for(let i=0;i<prices.length;i++){
   const base=[row.id,row.batch_id,row.app_version,row.symbol,row.direction,
    row.durationTicks??row.duration_ticks??null,
    row.predictionMode??row.prediction_mode??null,
    row.predictionPolicy??row.prediction_policy??null,
    row.state,context.capturedAtMs,row.bought_at_ms,row.settled_at_ms,
    context.lastLiveTickSeq??null,i+1,prices.length-i-1,
    epochs[i]??null,prices[i],i?prices[i]-prices[i-1]:null,
    row.stake_cents,row.state==='SETTLED'?row.pnl_cents:null];
   output.push(base.map(esc).join(','));
  }
 }
 return output.join('\r\n')+'\r\n';
}
