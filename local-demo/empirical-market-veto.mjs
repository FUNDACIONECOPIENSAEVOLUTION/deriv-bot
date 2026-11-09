// Riesgo adaptativo a partir de liquidaciones oficiales DEMO, sin permisos de BUY.
// La puntuacion no es una prediccion ni una garantia y no sube las apuestas.
const n=x=>x===null||x===undefined||x===''?null:
 Number.isFinite(Number(x))?Number(x):null;
export const MARKET_VETO_POLICY='recent-symbol-verified-loss-v1';
const Z_ADJUSTED_13_SYMBOLS=2.66;
export function wilsonUpper(wins,count,z=Z_ADJUSTED_13_SYMBOLS){
 if(!Number.isInteger(count)||count<1||wins<0||wins>count)return 1;
 const p=wins/count,den=1+z*z/count;
 return Math.min(1,(p+z*z/(2*count)+z*Math.sqrt(
  p*(1-p)/count+z*z/(4*count*count)))/den);
}
export function recentIndependentSettlements(rows,{window=30}={}){
 if(!Array.isArray(rows))throw Error('MARKET_RISK_ROWS_INVALID');
 const settled=rows.filter(x=>x?.state==='SETTLED'&&
  n(x.pnl_cents)!==null&&n(x.stake_cents)>0&&
  ['CALL','PUT'].includes(x.direction)&&
  [5,10].includes(n(x.duration_ticks))&&n(x.bought_at_ms)>0)
  .sort((a,b)=>Number(b.bought_at_ms)-Number(a.bought_at_ms));
 const used=new Set(),res=[];
 for(const row of settled){
  const candle=n(row.candle_epoch),bought=Number(row.bought_at_ms);
  const key=candle&&candle>0?'c'+candle:'t'+Math.floor(bought/10000);
  if(used.has(key))continue;
  used.add(key);res.push(row);
  if(res.length>=window)break;
 }
 return res;
}
export function recentMarketRiskVerdict(rows,{
 symbol=null,window=30,minIndependent=25,referenceBreakEven=.5319
}={}){
 const history=recentIndependentSettlements(rows,{window});
 const wins=history.filter(x=>n(x.pnl_cents)>0).length;
 const losses=history.filter(x=>n(x.pnl_cents)<0).length;
 const count=history.length,upper=count?wilsonUpper(wins,count):null;
 const blocked=count>=minIndependent&&upper<referenceBreakEven;
 return {policy:MARKET_VETO_POLICY,symbol,
  status:blocked?'RECENT_DEMO_LOSS_VETO':
   count<minIndependent?'INSUFFICIENT_INDEPENDENT_OUTCOMES':'MONITOR_ONLY',
  blocked,samples:count,wins,losses,
  observedWinRate:count?wins/count:null,upperWinRate:upper,
  referenceBreakEven,window,minIndependent,realEnabled:false,
  note:'Heuristica de riesgo, no prueba de predictibilidad. Monitorizar las pruebas repetidas y el cambio de regimen.'};
}
