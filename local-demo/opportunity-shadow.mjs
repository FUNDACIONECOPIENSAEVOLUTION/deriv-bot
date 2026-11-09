// Captura causal de oportunidades con horizonte de cinco ticks de mercado.
// Incluye índices elegibles no seleccionados, pero NO simula precio de compra,
// payout, beneficios, ni envía órdenes a Deriv. Versión de estudio en sombra.
const side=direction=>direction==='CALL'?1:direction==='PUT'?-1:0;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const pct=(n,d)=>d>0?Number((100*n/d).toFixed(2)):null;
export function createOpportunityShadow({db,getVersion=()=>null}){
 db.exec(`CREATE TABLE IF NOT EXISTS demo_shadow_opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,symbol TEXT NOT NULL,direction TEXT NOT NULL,
  captured_at_ms INTEGER NOT NULL,app_version TEXT,
  entry_tick_seq INTEGER NOT NULL,entry_tick_epoch INTEGER NOT NULL,
  entry_price REAL NOT NULL,exit_tick_seq INTEGER,exit_tick_epoch INTEGER,
  exit_price REAL,signal_strength REAL,signal_rsi REAL,tick_rsi14 REAL,
  five_tick_momentum REAL,signal_age_ms INTEGER,
  selected_for_attempt INTEGER NOT NULL DEFAULT 0,
  candidate_rank INTEGER NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'PENDING',
  direction_correct INTEGER,
  UNIQUE(batch_id,symbol,entry_tick_seq)
 );
 CREATE INDEX IF NOT EXISTS idx_shadow_opportunities_state_symbol
 ON demo_shadow_opportunities(outcome,symbol);`);
 // Nunca usar ticks posteriores a un reinicio como si fueran consecutivos.
 db.prepare("UPDATE demo_shadow_opportunities SET outcome='INTERRUPTED' WHERE outcome='PENDING'").run();
 const insert=db.prepare(`INSERT OR IGNORE INTO demo_shadow_opportunities
 (batch_id,symbol,direction,captured_at_ms,app_version,entry_tick_seq,entry_tick_epoch,
 entry_price,signal_strength,signal_rsi,tick_rsi14,five_tick_momentum,
 signal_age_ms,selected_for_attempt,candidate_rank)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
 const settle=db.prepare(`UPDATE demo_shadow_opportunities SET outcome='OBSERVED_5_TICKS',
 exit_tick_seq=?,exit_tick_epoch=?,exit_price=?,direction_correct=?
 WHERE id=? AND outcome='PENDING'`);
 const suspend=db.prepare("UPDATE demo_shadow_opportunities SET outcome='INTERRUPTED' WHERE outcome='PENDING'");
 const list=db.prepare(`SELECT id,batch_id AS batchId,symbol,direction,
 captured_at_ms AS capturedAtMs,app_version AS appVersion,
 entry_tick_seq AS entryTickSeq,entry_tick_epoch AS entryTickEpoch,
 entry_price AS entryPrice,exit_tick_seq AS exitTickSeq,
 exit_tick_epoch AS exitTickEpoch,exit_price AS exitPrice,
 signal_strength AS signalStrength,signal_rsi AS rsi,
 tick_rsi14 AS tickRsi14,five_tick_momentum AS fiveTickMomentum,
 signal_age_ms AS signalAgeMs,selected_for_attempt AS selectedForAttempt,
 candidate_rank AS candidateRank,outcome,direction_correct AS directionCorrect
 FROM demo_shadow_opportunities ORDER BY id DESC LIMIT ?`);
 const rollup=db.prepare(`SELECT selected_for_attempt AS selectedForAttempt,
 COUNT(*) AS n,
 SUM(CASE WHEN direction_correct=1 THEN 1 ELSE 0 END) AS favorable,
 SUM(CASE WHEN direction_correct=0 THEN 1 ELSE 0 END) AS unfavorable
 FROM demo_shadow_opportunities
 WHERE outcome='OBSERVED_5_TICKS'
 GROUP BY selected_for_attempt`);
 const bySymbol=db.prepare(`SELECT symbol,selected_for_attempt AS selectedForAttempt,
 COUNT(*) AS n,SUM(CASE WHEN direction_correct=1 THEN 1 ELSE 0 END) AS favorable
 FROM demo_shadow_opportunities
 WHERE outcome='OBSERVED_5_TICKS'
 GROUP BY symbol,selected_for_attempt ORDER BY n DESC LIMIT 40`);
 const pending=new Map();
 const MAX_PENDINGS=2000;
 function capture(batchId,eligible,selected){
  if(typeof batchId!=='string'||!batchId||!Array.isArray(eligible)||!Array.isArray(selected))
   throw Error('SHADOW_SNAPSHOT_INVALID');
  const chosen=new Set(selected.map(x=>x.symbol));
  const version=getVersion();
  let logged=0;
  for(let i=0;i<eligible.length&&i<30;i++){
   const r=eligible[i],tickSeq=r.liveTickSeq,epoch=r.epoch,price=r.quote;
   if(!r.symbol||!side(r.direction)||!Number.isSafeInteger(tickSeq)||tickSeq<=0||
     !Number.isSafeInteger(epoch)||epoch<=0||!finite(price)||
     !Number.isFinite(r.ageReceivedMs)||r.ageReceivedMs>1500)continue;
   const result=insert.run(batchId,r.symbol,r.direction,Date.now(),version,
    tickSeq,epoch,price,finite(r.signalStrength)?r.signalStrength:null,
    finite(r.rsi14)?r.rsi14:null,finite(r.tickRsi14)?r.tickRsi14:null,
    finite(r.fiveTickMomentum)?r.fiveTickMomentum:null,
    Math.max(0,Math.round(r.ageReceivedMs)),chosen.has(r.symbol)?1:0,i+1);
   if(result.changes!==1)continue;
   const array=pending.get(r.symbol)||[];
   array.push({id:Number(result.lastInsertRowid),entrySeq:tickSeq,
    direction:r.direction,entryPrice:price});
   pending.set(r.symbol,array);
   logged++;
  }
  if([...pending.values()].reduce((n,a)=>n+a.length,0)>MAX_PENDINGS){
   suspend.run();pending.clear(); // Nunca inventar etiquetas si faltan ticks.
  }
  return {logged,realOrders:0};
 }
 function onTick(symbol,tickSeq,price,epoch){
  const current=pending.get(symbol);
  if(!current?.length||!Number.isSafeInteger(tickSeq)||!finite(price))return 0;
  let completed=0;
  const keep=[];
  for(const p of current){
   if(tickSeq<=p.entrySeq){keep.push(p);continue;}
   if(tickSeq===p.entrySeq+5){
    settle.run(tickSeq,epoch,price,
     (price-p.entryPrice)*side(p.direction)>0?1:0,p.id);
    completed++;continue;
   }
   if(tickSeq>p.entrySeq+5){
    // Una secuencia saltada queda invalidada; no usar el siguiente tick.
    db.prepare("UPDATE demo_shadow_opportunities SET outcome='MISSING_TICKS' WHERE id=? AND outcome='PENDING'").run(p.id);
    continue;
   }
   keep.push(p);
  }
  if(keep.length)pending.set(symbol,keep);else pending.delete(symbol);
  return completed;
 }
 function interrupt(){
  suspend.run();pending.clear();
 }
 function status(){
  const totals=rollup.all().map(x=>({...x,hitRatePct:pct(x.favorable,x.n)}));
  const perSymbol=bySymbol.all().map(x=>({...x,hitRatePct:pct(x.favorable,x.n)}));
  return {mode:'FIVE_TICK_DIRECTIONAL_SHADOW',realEnabled:false,
   affectsBuy:false,modelTrained:false,observations:totals.reduce((n,x)=>n+x.n,0),
   selectedVsUnselected:totals,bySymbol:perSymbol,
   pendingInMemory:[...pending.values()].reduce((n,a)=>n+a.length,0),
   interpretation:'Precio observado cinco ticks después de una señal, no precio real de entrada ni rendimiento del contrato. Los ejemplos no elegidos no tienen payout observado. No se puede inferir ventaja rentable ni cambiar CALL/PUT a partir de estas tasas.',
   recent:list.all(30)};
 }
 function exportCsv(){
  const names=['id','batchId','symbol','direction','capturedAtMs','appVersion',
   'entryTickSeq','entryTickEpoch','entryPrice','exitTickSeq','exitTickEpoch',
   'exitPrice','signalStrength','rsi','tickRsi14','fiveTickMomentum',
   'signalAgeMs','selectedForAttempt','candidateRank','outcome','directionCorrect'];
  const rows=db.prepare(`SELECT id,batch_id AS batchId,symbol,direction,
 captured_at_ms AS capturedAtMs,app_version AS appVersion,
 entry_tick_seq AS entryTickSeq,entry_tick_epoch AS entryTickEpoch,
 entry_price AS entryPrice,exit_tick_seq AS exitTickSeq,
 exit_tick_epoch AS exitTickEpoch,exit_price AS exitPrice,
 signal_strength AS signalStrength,signal_rsi AS rsi,
 tick_rsi14 AS tickRsi14,five_tick_momentum AS fiveTickMomentum,
 signal_age_ms AS signalAgeMs,selected_for_attempt AS selectedForAttempt,
 candidate_rank AS candidateRank,outcome,direction_correct AS directionCorrect
 FROM demo_shadow_opportunities ORDER BY id DESC`).all();
  const esc=x=>typeof x==='number'&&Number.isFinite(x)?String(x):
   '"'+String(x??'').replace(/"/g,'""').replace(/^[=+@-]/,m=>'_'+m)+'"';
  return '\uFEFF'+names.join(',')+'\r\n'+rows.map(r=>names.map(k=>esc(r[k])).join(',')).join('\r\n')+'\r\n';
 }
 return {capture,onTick,interrupt,status,exportCsv};
}
