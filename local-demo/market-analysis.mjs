// Indicadores de investigación sobre ticks oficiales. NO son probabilidad de éxito ni BUY.
export const TICKS_PER_CANDLE=10;
export const CANDLES_VISIBLE=60;
export const HISTORY_TICKS=660;
export const MAX_TICKS=700;
/**
 * Conserva límites de velas OHLC de 10 ticks estables incluso después de
 * completar la ventana de memoria. NO elimina un solo tick en cada actualización:
 * eliminar un tick desplaza todas las particiones y "re-pinta" el RSI/EMA.
 * El historial inicial se solicita con 660 ticks (múltiplo de 10).
 */
export function trimTickHistory(ticks,maxTicks=MAX_TICKS){
 if(!Array.isArray(ticks)||!Number.isSafeInteger(maxTicks)||maxTicks<TICKS_PER_CANDLE)
  throw Error('INVALID_TICK_WINDOW');
 while(ticks.length>maxTicks)ticks.splice(0,TICKS_PER_CANDLE);
 return ticks;
}

const mean=x=>x.reduce((a,b)=>a+b,0)/x.length;
function ema(values,span){
 if(values.length<span)return null;
 const k=2/(span+1);let value=mean(values.slice(0,span));
 for(let i=span;i<values.length;i++)value=values[i]*k+value*(1-k);
 return value;
}
function rsi(values,n=14){
 if(values.length<n+1)return null;
 let up=0,down=0;
 for(let i=values.length-n;i<values.length;i++){
  const change=values[i]-values[i-1];up+=Math.max(0,change);down+=Math.max(0,-change);
 }
 if(down===0)return up===0?50:100;
 return 100-100/(1+up/down);
}
export function fiveTickDirectionStudy(prices){
 // Validación temporal de un indicador sencillo, no un modelo rentable certificado.
 // Ventanas DISJUNTAS cada cinco ticks: no usamos ticks futuros para una decisión pasada.
 const outcomes=[];
 for(let i=20;i+5<prices.length;i+=5){
  const recent=prices[i]-prices[i-5],future=prices[i+5]-prices[i];
  if(recent===0||future===0)continue;
  outcomes.push({predicted:Math.sign(recent),actual:Math.sign(future)});
 }
 const holdout=outcomes.slice(Math.floor(outcomes.length*.7));
 const correct=holdout.filter(x=>x.predicted===x.actual).length;
 return {horizonTicks:5,independentObservations:outcomes.length,
  holdoutCount:holdout.length,hitRate:holdout.length?correct/holdout.length:null,
  validatedForTrading:false};
}
export function computeMarketAnalysis(ticks,{connected=false,ageReceivedMs=null}={}){
 const valid=ticks.filter(x=>Number.isFinite(x?.price)&&x.price>0&&Number.isInteger(x?.epoch));
 const prices=valid.map(x=>x.price);
 const last5=prices.length>=6?prices.at(-1)-prices.at(-6):null;
 const tickRsi14=rsi(prices,14);
 const fiveTickStudy=fiveTickDirectionStudy(prices);
 // Proyección ingenua del siguiente tick para INVESTIGACIÓN; no interviene en BUY.
 const n=prices.length,lookback=10;
 const projectedNextTick=n>lookback?prices[n-1]+(prices[n-1]-prices[n-1-lookback])/lookback:null;
 let modelMae=null,naiveMae=null;
 if(n>=120){
  let modelError=0,naiveError=0,observations=0;
  for(let i=Math.max(lookback+1,n-100);i<n;i++){
   const prediction=prices[i-1]+(prices[i-1]-prices[i-1-lookback])/lookback;
   modelError+=Math.abs(prices[i]-prediction);
   naiveError+=Math.abs(prices[i]-prices[i-1]);
   observations++;
  }
  modelMae=modelError/observations;naiveMae=naiveError/observations;
 }
 const all=[];
 const whole=Math.floor(prices.length/TICKS_PER_CANDLE);
 for(let i=0;i<whole;i++){
  const p=prices.slice(i*TICKS_PER_CANDLE,(i+1)*TICKS_PER_CANDLE);
  all.push({open:p[0],high:Math.max(...p),low:Math.min(...p),close:p.at(-1),
   epoch:valid[(i+1)*TICKS_PER_CANDLE-1].epoch});
 }
 const candles=all.slice(-CANDLES_VISIBLE);
 const closes=candles.map(c=>c.close);
 const ema20=ema(closes,20),ema50=ema(closes,50),rsi14=rsi(closes);
 const ranges=candles.map((c,i)=>Math.max(c.high-c.low,
  i?Math.abs(c.high-candles[i-1].close):0,
  i?Math.abs(c.low-candles[i-1].close):0));
 const atr14=ranges.length>=14?mean(ranges.slice(-14)):null;
 const prev=closes.at(-6),last=closes.at(-1);
 const momentum5=Number.isFinite(prev)&&prev!==0?(last-prev)/Math.abs(prev):null;
 const slope10=closes.length>=11?(last-closes.at(-11))/10:null;
 const ready=candles.length>=CANDLES_VISIBLE;
 const fresh=Boolean(connected&&ageReceivedMs!==null&&ageReceivedMs<=1500&&
  valid.length&&Math.abs(Date.now()-valid.at(-1).epoch*1000)<=2500);
 let direction='ESPERAR',reason=ready?'SIN_CONSENSO':'HISTORIAL_INSUFICIENTE';
 if(!fresh)reason='PRECIOS_NO_FRESCOS';
 else if(ready&&ema20!==null&&ema50!==null&&rsi14!==null&&atr14!==null&&
    Number.isFinite(momentum5)&&Number.isFinite(slope10)&&atr14>0){
  if(ema20>ema50&&rsi14>=52&&rsi14<=68&&slope10>0&&momentum5>0){
   direction='CALL';reason='TENDENCIA_ALCISTA_MULTIFACTOR';
  }else if(ema20<ema50&&rsi14<=48&&rsi14>=32&&slope10<0&&momentum5<0){
   direction='PUT';reason='TENDENCIA_BAJISTA_MULTIFACTOR';
  }
 }
 // Intensidad descriptiva 0-100, NO estimación calibrada de acierto.
 const strength=ready&&ema20!==null&&ema50!==null&&atr14>0?
  Math.min(100,Math.round(Math.abs(ema20-ema50)/atr14*40)):null;
 return {candles,candleCount:candles.length,requiredCandles:CANDLES_VISIBLE,
  ticksAnalyzed:prices.length,ema20,ema50,rsi14,atr14,momentum5,slope10,
  projectedNextTick,modelMae,naiveMae,projectionIsResearchOnly:true,
  fiveTickMomentum:last5,tickRsi14,fiveTickStudy,
  sma8:prices.length>=8?mean(prices.slice(-8)):null,
  sma21:prices.length>=21?mean(prices.slice(-21)):null,
  direction,reason,signalStrength:strength,ready,fresh,
  lastPrices:prices.slice(-90),trend:direction==='CALL'?'ALCISTA':direction==='PUT'?'BAJISTA':'INDEFINIDA'};
}
