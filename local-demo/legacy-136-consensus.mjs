// Reconstituye la confirmacion clásica registrada en v13.6.
// Indicadores en 60 velas OHLC de 10 ticks: EMA20/EMA50, RSI14, momentum de
// cinco velas y pendiente de 10 velas, sin anticipar futuros ticks.
// Un filtro más estricto NO demuestra ventaja predictiva.
export const LEGACY136_FIVE='RESEARCH_136_CONSENSUS_FIVE';
export const LEGACY136_TEN='RESEARCH_136_CONSENSUS_TEN';
export const LEGACY136_MODES=Object.freeze([LEGACY136_FIVE,LEGACY136_TEN]);
export const RESEARCH_MODES=Object.freeze([
 'RESEARCH_DEMO','RESEARCH_FIVE_ONLY','RESEARCH_TEN_ONLY',...LEGACY136_MODES
]);
export const ALL_SIGNAL_MODES=Object.freeze(['VALIDATED_ONLY',...RESEARCH_MODES]);
export const isLegacy136Mode=mode=>LEGACY136_MODES.includes(mode);
export const isResearchMode=mode=>RESEARCH_MODES.includes(mode);
export const modeAllowsHorizon=(mode,horizon)=>
 ![5,10].includes(horizon)?false:
 (mode==='RESEARCH_FIVE_ONLY'||mode===LEGACY136_FIVE)?horizon===5:
 (mode==='RESEARCH_TEN_ONLY'||mode===LEGACY136_TEN)?horizon===10:true;
export function legacy136Direction(m){
 if(!m||m.ready!==true||m.candleCount<60||m.fresh!==true||
  !Number.isFinite(m.ema20)||!Number.isFinite(m.ema50)||
  !Number.isFinite(m.rsi14)||!Number.isFinite(m.atr14)||m.atr14<=0||
  !Number.isFinite(m.momentum5)||!Number.isFinite(m.slope10))return null;
 if(m.ema20>m.ema50&&m.rsi14>=52&&m.rsi14<=68&&
  m.momentum5>0&&m.slope10>0&&m.direction==='CALL'&&
  m.reason==='TENDENCIA_ALCISTA_MULTIFACTOR')return 'CALL';
 if(m.ema20<m.ema50&&m.rsi14>=32&&m.rsi14<=48&&
  m.momentum5<0&&m.slope10<0&&m.direction==='PUT'&&
  m.reason==='TENDENCIA_BAJISTA_MULTIFACTOR')return 'PUT';
 return null;
}
export function legacy136AgreesWithModel(m,x){
 return [5,10].includes(x?.durationTicks)&&
  ['CALL','PUT'].includes(x?.direction)&&
  legacy136Direction(m)===x.direction;
}
