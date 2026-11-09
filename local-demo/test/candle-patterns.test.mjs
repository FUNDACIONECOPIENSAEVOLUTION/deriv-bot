import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureCandleContext,parseCandleContext,evaluateCandlePatterns,exportCandlesCsv,exportTickContextCsv} from '../candle-patterns.mjs';

const base=1794186000000;
function observation(i,{buyAt=base+i*60000,pattern='UP'}={}){
 const lastEpoch=Math.floor(buyAt/1000)-2;
 const candles=Array.from({length:30},(_,j)=>{
  const open=100+j*.014,change=(j%5===0?-.02:.025)*(pattern==='UP'?1:-1);
  const close=open+change;
  return {epoch:lastEpoch-29+j,open,high:Math.max(open,close)+.04,
   low:Math.min(open,close)-.04,close};
 });
 const snapshot={symbol:i%2?'R_10':'R_50',direction:i%3?'CALL':'PUT',quote:100.1,
  epoch:lastEpoch+1,ageReceivedMs:100,candles,atr14:.15,rsi14:58,ema20:102,ema50:101,
  fiveTickMomentum:.05,tickRsi14:54,
  lastPrices:Array.from({length:40},(_,j)=>100+j*.002)};
 return captureCandleContext(snapshot,{count:20,atMs:buyAt-100});
}
function trade(i,{pnl=(i%4===0?-100:88),buyAt=base+i*60000,settledAt=buyAt+2500,
 version='14.6'}={}){
 const c=observation(i,{buyAt});
 return {state:'SETTLED',id:'o'+i,batch_id:'batch'+Math.floor(i/10),
 app_version:version,symbol:c.symbol,direction:c.signalDirection,
 stake_cents:100,pnl_cents:pnl,bought_at_ms:buyAt,settled_at_ms:settledAt,
 candle_context_json:JSON.stringify(c)};
}
test('Archiva 20 velas OHLC PRE-BUY, con ticks anteriores y patrón de retroceso',()=>{
 const ctx=observation(5);
 assert.equal(ctx.candles.length,20);
 assert.equal(ctx.lastTickPrices.length,40);
 assert.equal(ctx.lastTickEpochs.length,0);
 assert.equal(ctx.source,'OHLC_CLOSED_BEFORE_BROKER_BUY');
 assert.equal(ctx.schema,1);
 assert.ok(ctx.candles.at(-1).epoch*1000<ctx.capturedAtMs);
 assert.equal(ctx.pattern.lastThree.length,3);
 assert.ok(['DOJI','PULLBACK','CONTINUATION','MIXED'].includes(ctx.pattern.setup));
 assert.deepEqual(parseCandleContext(JSON.stringify(ctx)),ctx);
});
test('Ticks individuales ex ante con epoch y sin incorporar el futuro',()=>{
 const buyAt=base+600000;
 const c=observation(2,{buyAt});
 const m=40;
 const snapshot={...c,quote:c.quote,direction:c.signalDirection,
  candles:c.candles,atr14:c.atr14,
  epoch:Math.floor((buyAt-1000)/1000),
  lastPrices:Array.from({length:m},(_,i)=>100+i*.01),
  lastTickEpochs:Array.from({length:m},(_,i)=>Math.floor(buyAt/1000)-m+i),
  liveTickSeq:630};
 const stored=captureCandleContext(snapshot,{atMs:buyAt});
 assert.equal(stored.lastTickPrices.length,40);
 assert.equal(stored.lastTickEpochs.length,40);
 assert.equal(stored.lastLiveTickSeq,630);
 assert.ok(stored.lastTickEpochs.every(x=>x*1000<=stored.capturedAtMs));
 const future={...snapshot,lastTickEpochs:[...snapshot.lastTickEpochs.slice(0,-1),
  Math.floor(buyAt/1000)+100]};
 assert.equal(captureCandleContext(future,{atMs:buyAt}).lastTickEpochs.length,0);
});
test('Nunca acepta velas futuras, corruptas o contexto incompleto',()=>{
 const b=observation(3);
 b.candles.at(-1).high=b.candles.at(-1).low-.1;
 const source={...b};
 assert.equal(captureCandleContext(source,{count:20,atMs:base}),null);
 assert.equal(captureCandleContext({candles:[]}),null);
 assert.equal(parseCandleContext('{invalid'),null);
 assert.equal(parseCandleContext(JSON.stringify({schema:2,candles:[]})),null);
});
test('Aprendizaje usa solo liquidaciones anteriores a cada BUY y evalúa bloques posteriores',()=>{
 const rows=Array.from({length:125},(_,i)=>trade(i));
 const report=evaluateCandlePatterns(rows);
 assert.equal(report.independentSamples,125);
 assert.equal(report.scored.n,95);
 assert.equal(report.fullFolds,4);
 assert.equal(report.folds.length,5);
 assert.equal(report.versions[0].withCandles,125);
 assert.equal(report.missingContext,0);
 assert.equal(report.patternVersion,'CANDLE_CONTEXT_V1');
 assert.equal(report.predictionAltersBuy,false);
 assert.equal(report.realEnabled,false);
 assert.equal(report.readyForLiveTrading,false);
 assert.ok(Number.isFinite(report.scored.modelBrier));
 assert.ok(Number.isFinite(report.scored.historicBrier));
 assert.equal(report.scored.neutralBrier,.25);
});
test('Modificar ganancias futuras NO cambia métricas del primer bloque ya evaluado',()=>{
 const a=Array.from({length:120},(_,i)=>trade(i));
 const b=a.map((r,i)=>i>=65?{...r,pnl_cents:-100}:r);
 const p=evaluateCandlePatterns(a),q=evaluateCandlePatterns(b);
 assert.equal(p.folds[0].modelBrier,q.folds[0].modelBrier);
 assert.equal(p.folds[0].historicBrier,q.folds[0].historicBrier);
 assert.notEqual(p.scored.netCents,q.scored.netCents);
});
test('Tandas simultáneas no aprenden de liquidaciones que aún no ocurrieron',()=>{
 const t=base+120000;
 const rows=Array.from({length:50},(_,i)=>trade(i,{buyAt:t,settledAt:t+10000+i*30}));
 const p=evaluateCandlePatterns(rows);
 assert.equal(p.scored.n,0);
 assert.equal(p.readyForLiveTrading,false);
});
test('No confunde históricos sin secuencia de velas con un modelo entrenado',()=>{
 const rows=[{state:'SETTLED',app_version:'13.6',symbol:'R_10',direction:'PUT',
  pnl_cents:-50,stake_cents:50,bought_at_ms:base,settled_at_ms:base+500}];
 const r=evaluateCandlePatterns(rows);
 assert.equal(r.missingContext,1);
 assert.equal(r.independentSamples,0);
 assert.equal(r.versions[0].coveragePct,0);
 assert.equal(r.conclusion,'MUESTRA_DE_VELAS_INSUFICIENTE');
});
test('El CSV produce 20 filas por compra con contexto y resultado solo si liquidó',()=>{
 const c=trade(1,{pnl:-100});
 const csv=exportCandlesCsv([c]);
 const lines=csv.trim().split(/\r?\n/);
 assert.equal(lines.length,21);
 assert.match(lines[0],/candlePosition,candleEpoch,open,high,low,close/);
 assert.match(csv,/CONTINUATION|PULLBACK|DOJI|MIXED/);
 assert.match(csv,/-100/);
});

test('CSV PRE-BUY de ticks contiene cada precio en una fila y carece de futuros inventados',()=>{
 const t=trade(1,{pnl:88});
 const csv=exportTickContextCsv([t]);
 const lines=csv.trim().split(/\r?\n/);
 assert.equal(lines.length,41); // el fixture dispone de 40 ticks
 assert.match(lines[0],/tickPosition,ticksBeforeBuy,tickEpoch,tickPrice/);
 assert.match(lines[1],/R_10|R_50/);
 assert.match(csv,/"SETTLED"/);
 assert.match(csv,/,88\s*$/m);
 assert.equal(exportTickContextCsv([]).trim().split(/\r?\n/).length,1);
});
test('CSV exporta epoch y vencimiento cuando se conocen sin calcularlos del resultado',()=>{
 const old=trade(2);
 const x=JSON.parse(old.candle_context_json);
 x.lastTickEpochs=Array.from({length:40},(_,i)=>Math.floor(x.capturedAtMs/1000)-40+i);
 old.candle_context_json=JSON.stringify(x);
 old.durationTicks=10;old.predictionMode='DEMO_EXPLORATORY_5_10';
 old.predictionPolicy='MOMENTUM_5';
 const csv=exportTickContextCsv([old]);
 assert.ok(csv.includes('durationTicks'));
 assert.ok(csv.includes('DEMO_EXPLORATORY_5_10'));
 assert.ok(csv.includes('MOMENTUM_5'));
 assert.match(csv,/\b10\b/);
});
