// Telemetria de microestructura de ticks ANTES de la compra. SOLO INVESTIGACION.
// Ni sus resultados ni sus umbrales dan permisos de BUY, stake o cuenta REAL.
const round=x=>Number.isFinite(x)?Number(x.toFixed(6)):null;
export function computeTickMicrostructure(prices,{period=10,lastMoves=4}={}){
 if(!Number.isSafeInteger(period)||period<2||period>100||
    !Number.isSafeInteger(lastMoves)||lastMoves<2||lastMoves>period)
   throw Error('INVALID_MICROSTRUCTURE_WINDOW');
 if(!Array.isArray(prices)||prices.length<period+1)return {
  ready:false,reason:'INSUFFICIENT_TICKS',period,lastMoves,
  efficiencyRatio:null,direction:'FLAT',alignmentCount:null,
  reversals:null,netMove:null,meanAbsoluteMove:null,
  researchOnly:true,usedFutureTicks:false};
 const sample=prices.slice(-(period+1));
 if(sample.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<=0))
  return {ready:false,reason:'INVALID_TICKS',period,lastMoves,
   efficiencyRatio:null,direction:'FLAT',alignmentCount:null,
   reversals:null,netMove:null,meanAbsoluteMove:null,
   researchOnly:true,usedFutureTicks:false};
 const changes=sample.slice(1).map((value,i)=>value-sample[i]);
 const netMove=sample.at(-1)-sample[0];
 const totalAbs=changes.reduce((acc,x)=>acc+Math.abs(x),0);
 const direction=netMove>0?'UP':netMove<0?'DOWN':'FLAT';
 const tail=changes.slice(-lastMoves);
 const sign=x=>x>0?1:x<0?-1:0;
 const dir=sign(netMove),alignmentCount=tail.filter(x=>sign(x)===dir&&dir!==0).length;
 let reversals=0,previous=0;
 for(const value of changes){
  const current=sign(value);
  if(previous&&current&&current!==previous)reversals++;
  if(current)previous=current;
 }
 return {ready:true,reason:totalAbs===0?'FLAT_PRICE':'OBSERVED_ONLY',
  period,lastMoves,efficiencyRatio:round(totalAbs>0?Math.abs(netMove)/totalAbs:0),
  direction,alignmentCount,reversals,netMove:round(netMove),
  meanAbsoluteMove:round(totalAbs/period),
  researchOnly:true,usedFutureTicks:false};
}
