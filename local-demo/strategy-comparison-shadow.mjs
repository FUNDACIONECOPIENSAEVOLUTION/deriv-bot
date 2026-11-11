// Ecopiensa: comparador causal de estrategias educativas para indices Deriv.
// SOLO ticks PUBLICOS; NUNCA accede a OAuth, proposals, balance ni BUY.
// Una prediccion cada 600 ticks por simbolo, puntuada 5 y 10 ticks despues.
// No atribuir dinero/payout a predicciones no compradas.
import {randomUUID} from 'node:crypto';
import {legacy136Direction} from './legacy-136-consensus.mjs';
import {isExploratoryCandidate} from './tick-horizon-model.mjs';

export const SHADOW_POLICIES=Object.freeze([
 'MOMENTUM_10','EMA_8_21','MACD_12_26_9',
 'RSI14_REVERSAL','BOLLINGER20_REVERSAL','ER10_TREND'
]);
const HORIZONS=[5,10];
const sign=n=>n>0?'CALL':n<0?'PUT':null;
const safe=x=>typeof x==='number'&&Number.isFinite(x);
const pct=(n,d)=>d>0?Number((100*n/d).toFixed(2)):null;
function avg(a){return a.reduce((x,y)=>x+y,0)/a.length;}
function ema(prices,period){
 if(prices.length<period)return null;
 let result=avg(prices.slice(0,period)),k=2/(period+1);
 for(let i=period;i<prices.length;i++)result=k*prices[i]+(1-k)*result;
 return result;
}
function macdSignal(prices){
 if(prices.length<44)return null;
 // Calcular correctamente la serie MACD y la EMA de 9 valores MACD.
 const macds=[];
 for(let i=26;i<=prices.length;i++){
  const values=prices.slice(0,i);
  macds.push(ema(values,12)-ema(values,26));
 }
 const baseline=ema(macds,9);
 return baseline===null?null:sign(macds.at(-1)-baseline);
}
function rsi14(prices){
 if(prices.length<15)return null;
 let up=0,down=0;
 for(let i=prices.length-14;i<prices.length;i++){
  const diff=prices[i]-prices[i-1];
  up+=Math.max(0,diff);down+=Math.max(0,-diff);
 }
 return down===0?(up===0?50:100):100-100/(1+up/down);
}
function efficiency(prices,lookback=10){
 if(prices.length<=lookback)return null;
 const path=prices.slice(-lookback-1);
 const direct=Math.abs(path.at(-1)-path[0]);
 const travel=path.slice(1).reduce((a,x,i)=>a+Math.abs(x-path[i]),0);
 return travel>0?direct/travel:0;
}
function rmsReturnBps(prices,n=40){
 if(prices.length<n+1)return null;
 let sq=0;
 for(let i=prices.length-n;i<prices.length;i++){
  const r=(prices[i]-prices[i-1])/prices[i-1];
  sq+=r*r;
 }
 return Number((10000*Math.sqrt(sq/n)).toFixed(6));
}
// Aplicar las MISMAS reglas, sin parametrizar umbrales con el resultado posterior.
export function describeResearchSignals(prices){
 if(!Array.isArray(prices)||prices.length<60||
  prices.some(x=>!safe(x)||x<=0))return null;
 const latest=prices.at(-1),m10=sign(latest-prices.at(-11));
 const e8=ema(prices,8),e21=ema(prices,21);
 const rsi=rsi14(prices);
 const recent=prices.slice(-20),mean=avg(recent);
 const sd=Math.sqrt(avg(recent.map(x=>(x-mean)**2)));
 const er=efficiency(prices,10);
 const result={
  MOMENTUM_10:m10,
  EMA_8_21:sign(e8-e21),
  MACD_12_26_9:macdSignal(prices),
  RSI14_REVERSAL:rsi<=30?'CALL':rsi>=70?'PUT':null,
  BOLLINGER20_REVERSAL:sd>0&&latest<mean-2*sd?'CALL':
   sd>0&&latest>mean+2*sd?'PUT':null,
  ER10_TREND:er!==null&&er>=.55?m10:null
 };
 return {directions:result,
  indicators:{rsi14:rsi,er10:er,rmsReturnBps:rmsReturnBps(prices)},
  regime:er===null?'UNDEFINED':er>=.55?'DIRECTIONAL':'CHOPPY'};
}
export function createStrategyComparisonShadow({db,getVersion=()=>null,
 sampleIntervalTicks=600,maxSymbols=20}={}){
 if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function'||
  !Number.isInteger(sampleIntervalTicks)||sampleIntervalTicks<20||
  !Number.isInteger(maxSymbols)||maxSymbols<1||maxSymbols>30)
  throw Error('SHADOW_COMPARE_CONFIG_INVALID');
 db.exec(`CREATE TABLE IF NOT EXISTS demo_strategy_comparison (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,symbol TEXT NOT NULL,policy TEXT NOT NULL,
  horizon_ticks INTEGER NOT NULL,direction TEXT NOT NULL,
  observed_at_ms INTEGER NOT NULL,entry_seq INTEGER NOT NULL,
  exit_seq INTEGER NOT NULL,entry_epoch INTEGER NOT NULL,
  exit_epoch INTEGER NOT NULL,entry_price REAL NOT NULL,
  exit_price REAL NOT NULL,correct INTEGER NOT NULL,tie INTEGER NOT NULL,
  regime TEXT NOT NULL,er10 REAL,rms_return_bps REAL,
  app_version TEXT,source TEXT NOT NULL DEFAULT 'PUBLIC_TICKS_SHADOW',
  UNIQUE(session_id,symbol,policy,horizon_ticks,entry_seq)
 );
 CREATE INDEX IF NOT EXISTS idx_strategy_comparison_symbol_horizon
 ON demo_strategy_comparison(symbol,horizon_ticks,policy,observed_at_ms);`);
 const insert=db.prepare(`INSERT OR IGNORE INTO demo_strategy_comparison
 (session_id,symbol,policy,horizon_ticks,direction,observed_at_ms,
 entry_seq,exit_seq,entry_epoch,exit_epoch,entry_price,exit_price,
 correct,tie,regime,er10,rms_return_bps,app_version)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
 const rollup=db.prepare(`SELECT symbol,policy,horizon_ticks AS horizonTicks,
 regime,COUNT(*) AS n,SUM(correct) AS correct,SUM(tie) AS ties,
 MIN(observed_at_ms) AS firstAtMs,MAX(observed_at_ms) AS lastAtMs
 FROM demo_strategy_comparison
 GROUP BY symbol,policy,horizon_ticks,regime
 ORDER BY n DESC,symbol,policy,horizon_ticks`);
 const total=db.prepare('SELECT COUNT(*) AS n FROM demo_strategy_comparison');
 const observations=db.prepare(`SELECT symbol,policy,horizon_ticks AS horizonTicks,
 direction,regime,correct,tie,observed_at_ms AS observedAtMs
 FROM demo_strategy_comparison ORDER BY id DESC LIMIT 30`);
 const states=new Map();
 let interrupted=0,gaps=0,skipped=0;
 function onTick({symbol,price,epoch,seq,marketAnalysis=null}={}){
  if(typeof symbol!=='string'||!/^[A-Za-z0-9_]{2,30}$/.test(symbol)||
   !safe(price)||price<=0||!Number.isSafeInteger(epoch)||epoch<1||
   !Number.isSafeInteger(seq)||seq<1)return 0;
  let state=states.get(symbol);
  if(!state){
   if(states.size>=maxSymbols){skipped++;return 0;}
   state={prices:[],pending:[],lastSeq:0,lastEpoch:0,lastDecision:0,
    session:randomUUID()};
   states.set(symbol,state);
  }
  if(state.lastSeq&&(seq!==state.lastSeq+1||epoch<state.lastEpoch)){
   state.prices=[];state.pending=[];state.lastDecision=0;
   state.session=randomUUID();gaps++;
  }
  state.lastSeq=seq;state.lastEpoch=epoch;
  let settled=0,remaining=[];
  for(const prediction of state.pending){
   if(seq===prediction.entrySeq+prediction.horizon){
    const delta=price-prediction.entryPrice;
    const tie=delta===0?1:0,correct=Number(!tie&&sign(delta)===prediction.direction);
    insert.run(state.session,symbol,prediction.policy,prediction.horizon,
     prediction.direction,Date.now(),prediction.entrySeq,seq,prediction.entryEpoch,
     epoch,prediction.entryPrice,price,correct,tie,prediction.regime,
     prediction.er10,prediction.rmsReturnBps,getVersion());
    settled++;
   }else if(seq<prediction.entrySeq+prediction.horizon)remaining.push(prediction);
  }
  state.pending=remaining;
  state.prices.push(price);
  if(state.prices.length>240)state.prices.splice(0,state.prices.length-240);
  if(state.prices.length>=60&&
   (!state.lastDecision||seq-state.lastDecision>=sampleIntervalTicks)){
   const x=describeResearchSignals(state.prices);
   for(const policy of SHADOW_POLICIES){
    const direction=x?.directions?.[policy];
    if(!direction)continue;
    for(const horizon of HORIZONS){
     state.pending.push({entrySeq:seq,entryEpoch:epoch,entryPrice:price,
      horizon,policy,direction,regime:x.regime,
      er10:x.indicators.er10,rmsReturnBps:x.indicators.rmsReturnBps});
    }
   }
   // Comparación A/B prospectiva sobre las mismas cotizaciones del índice.
   // La v13.6 usa OHLC de 60 velas; no confundir con EMA sobre ticks.
   const classic=legacy136Direction(marketAnalysis);
   if(classic)for(const horizon of HORIZONS){
    state.pending.push({entrySeq:seq,entryEpoch:epoch,entryPrice:price,
     horizon,policy:'LEGACY_136_EMA_RSI',direction:classic,
     regime:x.regime,er10:x.indicators.er10,rmsReturnBps:x.indicators.rmsReturnBps});
   }
   for(const horizon of HORIZONS){
    const current=marketAnalysis?.tickHorizonModels?.find(m=>m.durationTicks===horizon);
    if(!isExploratoryCandidate(current))continue;
    state.pending.push({entrySeq:seq,entryEpoch:epoch,entryPrice:price,
     horizon,policy:'CURRENT_TICK_MODEL',direction:current.direction,
     regime:x.regime,er10:x.indicators.er10,rmsReturnBps:x.indicators.rmsReturnBps});
    if(classic===current.direction)state.pending.push({
     entrySeq:seq,entryEpoch:epoch,entryPrice:price,
     horizon,policy:'LEGACY_136_AND_CURRENT_CONSENSUS',direction:classic,
     regime:x.regime,er10:x.indicators.er10,rmsReturnBps:x.indicators.rmsReturnBps});
   }
   state.lastDecision=seq;
  }
  return settled;
 }
 function interrupt(){
  interrupted++;states.clear(); // PREDICCIONES NO LIQUIDADAS NO SON ACIERTOS.
 }
 function status(){
  const row=rollup.all().map(x=>({...x,
   hitRatePct:pct(x.correct,x.n),nonstrictRatePct:pct(x.correct,x.n-x.ties),
   brokerPnlUsd:null,profitabilityVerified:false,
   category:'PREDICTION_ONLY_NOT_BROKER_CONTRACT'}));
  return {mode:'PER_INDEX_MULTI_POLICY_PREQUENTIAL_SHADOW',readOnly:true,
   realEnabled:false,brokerOrders:0,changesBuy:false,
   sampleIntervalTicks,maxSymbols,horizonsTicks:HORIZONS,
   policies:SHADOW_POLICIES,
   benchmarkPolicies:['LEGACY_136_EMA_RSI','CURRENT_TICK_MODEL',
    'LEGACY_136_AND_CURRENT_CONSENSUS'],
   liveSymbols:[...states.keys()],
   samplesStored:total.get().n,gaps,interruptions:interrupted,
   capacityDrops:skipped,results:row,
   recent:observations.all(),
   note:'Cada politica usa solamente ticks anteriores para predecir; resultado a 5/10 ticks observados no es resultado de contrato Deriv ni permite calcular ganancia sin precio ASK/payout. Nada reentrena ni cambia las compras.',
   warnings:['Muestras por indice/regimen no son comparables sin control cronologico, multiples hipotesis y cuota Deriv.',
   'RSI/EMA/MACD/Bollinger pueden describir ruido en indices Synthetic sin ventaja futura.',
   'Sin precio de compra ni payout no se identifica la modalidad rentable.']};
 }
 return {onTick,interrupt,status};
}
