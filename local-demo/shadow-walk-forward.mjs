// Validación prequential / walk-forward para contratos DEMO liquidados.
// Ajusta un modelo logístico en modo sombra utilizando SOLO etiquetas que
// ya habían sido liquidadas antes de la próxima compra (sin fuga futura).
// No controla ningún BUY, CALL, PUT, importe ni cuenta REAL.
const num=x=>x===null||x===undefined||x===''?null:(Number.isFinite(Number(x))?Number(x):null);
const clip=(v,lim=3)=>Math.max(-lim,Math.min(lim,v));
const round=(v,p=5)=>Number.isFinite(v)?Number(v.toFixed(p)):null;
const logistic=x=>1/(1+Math.exp(-clip(x,18)));
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const logisticLoss=(p,y)=>-(y*Math.log(Math.max(.00001,p))+(1-y)*Math.log(Math.max(.00001,1-p)));
const LOSS_LIMIT=100000;
function beforePurchaseFeatures(r){
 const side=r.direction==='CALL'?1:r.direction==='PUT'?-1:0;
 if(!side)return null;
 const strength=num(r.signal_strength),rsi=num(r.signal_rsi),
  tickRsi=num(r.signal_tick_rsi14),momentum=num(r.signal_five_tick_momentum),
  age=num(r.signal_age_ms);
 if([strength,rsi,tickRsi,momentum].filter(v=>v!==null).length<2)return null;
 return [1,side,
  rsi===null?0:clip((rsi-50)/50,1),
  tickRsi===null?0:clip((tickRsi-50)/50,1),
  strength===null?0:clip((strength-50)/50,1),
  momentum===null?0:clip(momentum*side/(Math.abs(momentum)+1),1),
  age===null?0:clip((age-500)/1500,1)];
}
function metrics(items){
 const n=items.length,wins=items.filter(x=>x.y===1).length;
 const avg=(fn)=>n?items.reduce((s,x)=>s+fn(x),0)/n:null;
 return {n,wins,losses:n-wins,winRate:round(n?wins/n:null),
  netCents:Math.round(items.reduce((s,x)=>s+x.pnl,0)),
  brierModel:round(avg(x=>(x.pred-x.y)**2)),
  brierNeutral:round(avg(x=>(.5-x.y)**2)),
  brierHistorical:round(avg(x=>(x.historical-x.y)**2)),
  logLossModel:round(avg(x=>logisticLoss(x.pred,x.y))),
  logLossNeutral:round(avg(x=>logisticLoss(.5,x.y)))};
}
export function evaluateWalkForward(raw,{minHistory=40,foldSize=20}={}){
 if(!Array.isArray(raw)||raw.length>LOSS_LIMIT)throw Error('INVALID_WALK_FORWARD_ROWS');
 if(!Number.isSafeInteger(minHistory)||minHistory<10||minHistory>10000||
    !Number.isSafeInteger(foldSize)||foldSize<5||foldSize>1000)
  throw Error('INVALID_WALK_FORWARD_SETTINGS');
 let missingFeatures=0,unknownSettlements=0,duplicates=0;
 const decisions=[],seenSignals=new Set();
 for(const r of raw){
  if(r.state!=='SETTLED')continue;
  const boughtAt=num(r.bought_at_ms),settledAt=num(r.settled_at_ms),
   pnl=num(r.pnl_cents),stake=num(r.stake_cents);
  if(!Number.isFinite(boughtAt)||!Number.isFinite(settledAt)||
    settledAt<boughtAt||!Number.isFinite(pnl)||!Number.isFinite(stake)||stake<=0){
    unknownSettlements++;continue;
  }
  const feat=beforePurchaseFeatures(r);
  if(!feat){missingFeatures++;continue;}
  const candle=num(r.candle_epoch);
  if(candle!==null&&candle>0){
   const key=[r.symbol,r.direction,candle].join('|');
   if(seenSignals.has(key)){duplicates++;continue;}
   seenSignals.add(key);
  }
  decisions.push({buyAt:boughtAt,settledAt,pnl,stake,
   symbol:r.symbol,direction:r.direction,x:feat,y:pnl>0?1:0});
 }
 decisions.sort((a,b)=>a.buyAt-b.buyAt||a.settledAt-b.settledAt);
 // Un evento de liquidación solo entrena cuando realmente llegó su hora.
 const completed=[...decisions].sort((a,b)=>a.settledAt-b.settledAt);
 let settlementIndex=0,trained=0,previousWins=0;
 const weights=Array(7).fill(0);
 const output=[];
 for(const d of decisions){
  while(settlementIndex<completed.length&&completed[settlementIndex].settledAt<=d.buyAt){
   const closed=completed[settlementIndex++];
   const p=logistic(dot(weights,closed.x)),error=closed.y-p;
   const rate=.075/Math.sqrt(1+trained/100);
   for(let k=0;k<weights.length;k++)
    weights[k]+=rate*(error*closed.x[k]-(k===0?0:.003*weights[k]));
   trained++;previousWins+=closed.y;
  }
  if(trained<minHistory)continue;
  output.push({at:d.buyAt,pred:logistic(dot(weights,d.x)),
   historical:(previousWins+1)/(trained+2),
   y:d.y,pnl:d.pnl,symbol:d.symbol,direction:d.direction});
 }
 const folds=[];
 for(let i=0;i<output.length;i+=foldSize){
  const block=output.slice(i,i+foldSize);
  folds.push({fold:folds.length+1,complete:block.length===foldSize,
   fromEpochMs:block[0].at,toEpochMs:block.at(-1).at,
   ...metrics(block)});
 }
 const complete=folds.filter(x=>x.complete);
 const all=metrics(output),quality=complete.length>=3&&output.length>=60;
 const foldsBeatingNeutral=complete.filter(x=>x.brierModel<x.brierNeutral).length;
 const foldsBeatingHistorical=complete.filter(x=>x.brierModel<x.brierHistorical).length;
 return {
  mode:'SHADOW_WALK_FORWARD',
  method:'LOGISTIC_ONLINE_SETTLEMENT_CAUSAL',
  note:'El modelo usa solamente indicadores observados antes de cada compra y resultados liquidados previamente. Es una evaluación de compras ya elegidas, no prueba que CALL/PUT funcione al invertir la dirección o en índices no utilizados.',
  predictionAltersBuy:false,realEnabled:false,autoTradingAllowed:false,
  filterDeployed:false,trainMinimum:minHistory,foldSize,
  independentDecisions:decisions.length,excludedDuplicates:duplicates,
  excludedMissingFeatures:missingFeatures,excludedUnknownSettlementTime:unknownSettlements,
  scored:all,folds:folds.slice(-12),fullFolds:complete.length,
  evidenceSufficient:quality,
  allFoldImprovement:quality&&foldsBeatingNeutral===complete.length&&
    foldsBeatingHistorical===complete.length&&
    all.brierModel<all.brierNeutral&&all.brierModel<all.brierHistorical,
  foldsBeatingNeutral,foldsBeatingHistorical,
  conclusion:!quality?'MUESTRA_FUERA_DE_MUESTRA_INSUFICIENTE':
   foldsBeatingNeutral!==complete.length||foldsBeatingHistorical!==complete.length?
    'MODELO_SIN_VENTAJA_CONSISTENTE':'SOLO_EVIDENCIA_PRELIMINAR_NO_AUTORIZA_BUY',
  payout: 'El rendimiento neto observado de la estrategia no representa ganancia hipotética del modelo sombra.'
 };
}
