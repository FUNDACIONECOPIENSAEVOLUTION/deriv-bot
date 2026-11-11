// Un clic inicia 10x10 de EVALUACIONES 5 ticks + 10x10 10 ticks POR INDICE.
// SIN COMPRA: no hay evidencia verificada de opciones USD 0.10 y un contrato
// NO representa simultaneamente 5 y 10 ticks. Nunca se simula PnL broker.
// Compara 6 estrategias individuales, 15 pares y 20 trios por consenso exacto.
import {randomUUID} from 'node:crypto';
import {describeResearchSignals,SHADOW_POLICIES} from './strategy-comparison-shadow.mjs';

export const PAIRED_SHOTS=100,PAIRED_ROUND_SIZE=10;
export const PAIRED_HORIZONS=Object.freeze([5,10]);
export const PAIRED_LOW_STAKE_USD=.10;
function combinationsOfSize(items,k){
 const out=[];
 function go(start,choice){
  if(choice.length===k){out.push(choice.slice());return;}
  for(let i=start;i<=items.length-(k-choice.length);i++){
   choice.push(items[i]);go(i+1,choice);choice.pop();
  }
 }
 go(0,[]);return out;
}
export const PAIRED_COMBINATIONS=Object.freeze([1,2,3].flatMap(k=>
 combinationsOfSize(SHADOW_POLICIES,k).map(methods=>Object.freeze({
  kind:k===1?'INDIVIDUAL':k===2?'PAIR_AGREEMENT':'TRIPLE_AGREEMENT',
  key:methods.join('+'),methods:Object.freeze(methods.slice()),size:k
 }))));
export function exactAgreement(signals,methods){
 const vals=methods.map(k=>signals?.[k]??null);
 return vals.length&&vals.every(v=>v==='CALL')?'CALL':
  vals.length&&vals.every(v=>v==='PUT')?'PUT':null;
}
const pct=(a,b)=>b?Number((100*a/b).toFixed(2)):null;
export function createPairedMethodStudy({db,getVersion=()=>null,maxSymbols=14}={}){
 if(!db||typeof db.exec!=='function'||typeof db.prepare!=='function'||
  !Number.isInteger(maxSymbols)||maxSymbols<1||maxSymbols>20)
  throw Error('PAIRED_STUDY_DEPENDENCIES_REQUIRED');
 db.exec(`CREATE TABLE IF NOT EXISTS demo_paired_studies (
  run_id TEXT PRIMARY KEY,created_at_ms INTEGER NOT NULL,state TEXT NOT NULL,
  stopped_at_ms INTEGER,planned_stake_cents INTEGER NOT NULL DEFAULT 10,
  realized_broker_trades INTEGER NOT NULL DEFAULT 0
 );
 CREATE TABLE IF NOT EXISTS demo_paired_events (
  run_id TEXT NOT NULL,symbol TEXT NOT NULL,shot INTEGER NOT NULL,
  round INTEGER NOT NULL,horizon INTEGER NOT NULL,
  entry_seq INTEGER NOT NULL,exit_seq INTEGER NOT NULL,
  entry_epoch INTEGER NOT NULL,exit_epoch INTEGER NOT NULL,
  entry_price REAL NOT NULL,exit_price REAL NOT NULL,
  regime TEXT NOT NULL,app_version TEXT,
  PRIMARY KEY(run_id,symbol,shot,horizon)
 );
 CREATE TABLE IF NOT EXISTS demo_paired_results (
  run_id TEXT NOT NULL,symbol TEXT NOT NULL,shot INTEGER NOT NULL,
  horizon INTEGER NOT NULL,kind TEXT NOT NULL,
  combination TEXT NOT NULL,direction TEXT,
  correct INTEGER,tie INTEGER,
  PRIMARY KEY(run_id,symbol,shot,horizon,combination)
 );
 CREATE INDEX IF NOT EXISTS idx_paired_results_compare
 ON demo_paired_results(run_id,symbol,horizon,kind,combination);`);
 db.prepare("UPDATE demo_paired_studies SET state='INTERRUPTED',stopped_at_ms=? WHERE state='RUNNING'")
  .run(Date.now());
 const createRun=db.prepare("INSERT INTO demo_paired_studies(run_id,created_at_ms,state) VALUES(?,?,'RUNNING')");
 const stopRun=db.prepare("UPDATE demo_paired_studies SET state=?,stopped_at_ms=? WHERE run_id=?");
 const insertEvent=db.prepare(`INSERT OR IGNORE INTO demo_paired_events
 (run_id,symbol,shot,round,horizon,entry_seq,exit_seq,entry_epoch,exit_epoch,
 entry_price,exit_price,regime,app_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
 const insertResult=db.prepare(`INSERT OR IGNORE INTO demo_paired_results
 (run_id,symbol,shot,horizon,kind,combination,direction,correct,tie)
 VALUES(?,?,?,?,?,?,?,?,?)`);
 const countEvents=db.prepare(`SELECT symbol,horizon,
 COUNT(*) AS completed,MAX(round) AS roundsReached
 FROM demo_paired_events WHERE run_id=?
 GROUP BY symbol,horizon ORDER BY symbol,horizon`);
 const stats=db.prepare(`SELECT r.symbol,r.horizon,r.kind,r.combination,
 COUNT(*) AS nMoments,
 SUM(CASE WHEN r.direction IS NOT NULL THEN 1 ELSE 0 END) AS nSignals,
 SUM(CASE WHEN r.direction IS NOT NULL AND r.correct=1 THEN 1 ELSE 0 END) AS wins,
 SUM(CASE WHEN r.direction IS NOT NULL AND r.correct=0 THEN 1 ELSE 0 END) AS lossesOrTies,
 SUM(CASE WHEN r.direction IS NOT NULL AND r.tie=1 THEN 1 ELSE 0 END) AS ties,
 SUM(CASE WHEN r.shot>70 AND r.direction IS NOT NULL THEN 1 ELSE 0 END) AS holdoutSignals,
 SUM(CASE WHEN r.shot>70 AND r.direction IS NOT NULL AND r.correct=1 THEN 1 ELSE 0 END) AS holdoutWins
 FROM demo_paired_results r WHERE r.run_id=?
 GROUP BY r.symbol,r.horizon,r.kind,r.combination
 ORDER BY r.symbol,r.horizon,r.kind,r.combination`);
 let active=null;
 const markets=new Map();
 let gaps=0,interruptions=0,capacityDropped=0,observations=0;
 function status(){
  const counts=active?countEvents.all(active.id):[];
  const totals=counts.map(x=>({...x,
   totalRounds:10,totalMoments:100,closedRounds:Math.floor(x.completed/10),
   nominalStakeUsd:.10,brokerTrades:0,brokerPnlUsd:null}));
  const records=active?stats.all(active.id).map(r=>({...r,
   hitRatePct:pct(r.wins,r.nSignals),coveragePct:pct(r.nSignals,r.nMoments),
   holdoutHitRatePct:pct(r.holdoutWins,r.holdoutSignals),
   brokerPnlUsd:null,eligibleForAutoBuy:false,
   quality:r.holdoutSignals<30?'INSUFFICIENT_PROSPECTIVE_HOLDOUT':
    'RESEARCH_ONLY_MULTIPLE_COMPARISONS'})):[];
  return {mode:'PAIRED_20X10_MULTI_METHOD_SHADOW',readOnly:true,
   realEnabled:false,brokerOrders:0,affectsBuy:false,
   status:active?(active.running?'RUNNING':'STOPPED'):'NOT_STARTED',
   runId:active?.id??null,plannedStakeUsd:PAIRED_LOW_STAKE_USD,
   brokerMinimumConfirmed:false,estimatedNominalExposureUsdIfAccepted:20,
   nominalStakeIsNotApproved:true,
   indexCount:markets.size,activeIndices:[...markets.keys()],
   roundsPerHorizon:10,tradesPerRound:10,shotsPerHorizon:100,
   maximumHypotheticalContractsPerIndex:200,
   sixMethods:SHADOW_POLICIES.slice(),combinations:PAIRED_COMBINATIONS.length,
   kinds:{individual:6,pairAgreement:15,tripleAgreement:20},
   completed:totals,results:records,
   observations,gaps,interruptions,capacityDropped,
   preferredStrategy:null,profitGuaranteed:false,realizedBrokerPnlUsd:null,
   explanation:'Una señal observada se puntúa separadamente a 5 y 10 ticks; no es un contrato ni permite atribuir ganancias. Pares/tríos exigen unanimidad exacta; si difieren se abstienen. Los primeros 70 momentos son exploratorios y los últimos 30 prospectivos, no holdout virgen independiente entre revisiones.',
   warning:'NO se habilitan 200 BUY DEMO a 0.10 mientras el broker no confirme ese importe para el contrato, y no se han añadido permisos para apuestas de 10 centavos. El objetivo de proteger beneficios no puede garantizar rentabilidad.'};
 }
 function start({confirmation}={}){
  if(confirmation!=='INICIAR ESTUDIO 20X10 SIN COMPRAS')
   throw Error('PAIRED_STUDY_OWNER_CLICK_REQUIRED');
  if(active?.running)throw Error('PAIRED_STUDY_ALREADY_RUNNING');
  const id=randomUUID();
  createRun.run(id,Date.now());
  markets.clear();gaps=0;interruptions=0;capacityDropped=0;observations=0;
  active={id,running:true};
  return status();
 }
 function stop(){
  if(!active?.running)return {stopped:false,reason:'STUDY_NOT_ACTIVE'};
  stopRun.run('STOPPED',Date.now(),active.id);
  active.running=false;markets.clear();
  return {stopped:true,brokerOrders:0,runId:active.id};
 }
 function interrupt(){
  interruptions++;markets.clear(); // Las señales sin liquidar desaparecen.
 }
 function recordHorizon(symbol,shot,horizon,exitPrice,exitEpoch,exitSeq){
  db.exec('BEGIN IMMEDIATE');
  try{
   insertEvent.run(active.id,symbol,shot.number,Math.ceil(shot.number/10),
    horizon,shot.entrySeq,exitSeq,shot.entryEpoch,exitEpoch,
    shot.entryPrice,exitPrice,shot.regime,getVersion());
   for(const item of shot.combos){
    const direction=item.direction;
    const delta=exitPrice-shot.entryPrice;
    const tie=direction?Number(delta===0):null;
    const correct=direction?Number(delta!==0&&
     (delta>0?'CALL':'PUT')===direction):null;
    insertResult.run(active.id,symbol,shot.number,horizon,
     item.kind,item.key,direction,correct,tie);
   }
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  observations++;
 }
 function onTick({symbol,price,epoch,seq}={}){
  if(!active?.running||typeof symbol!=='string'||
   !/^[A-Za-z0-9_]{2,30}$/.test(symbol)||!Number.isFinite(price)||
   price<=0||!Number.isSafeInteger(epoch)||epoch<=0||
   !Number.isSafeInteger(seq)||seq<=0)return 0;
  let s=markets.get(symbol);
  if(!s){
   if(markets.size>=maxSymbols){capacityDropped++;return 0;}
   s={lastSeq:0,lastEpoch:0,prices:[],shots:0,
    lastShotSeq:0,pending:[]};markets.set(symbol,s);
  }
  if(s.lastSeq&&(seq!==s.lastSeq+1||epoch<s.lastEpoch)){
   gaps++;s.prices=[];s.pending=[];s.lastShotSeq=0;s.shots=0;
   // Para evitar duplicar shots en un mismo run, el indice se detiene tras gap.
   s.disabled=true;
  }
  if(s.disabled)return 0;
  s.lastSeq=seq;s.lastEpoch=epoch;
  let closed=0;
  const keep=[];
  for(const shot of s.pending){
   const age=seq-shot.entrySeq;
   if(age===5){
    recordHorizon(symbol,shot,5,price,epoch,seq);closed++;
   }
   if(age===10){
    recordHorizon(symbol,shot,10,price,epoch,seq);closed++;
   }else if(age<10)keep.push(shot);
  }
  s.pending=keep;
  s.prices.push(price);
  if(s.prices.length>240)s.prices.shift();
  if(s.shots<PAIRED_SHOTS&&s.prices.length>=60&&
   (!s.lastShotSeq||seq-s.lastShotSeq>=10)){
   const signal=describeResearchSignals(s.prices);
   if(signal){
    s.shots++;s.lastShotSeq=seq;
    s.pending.push({number:s.shots,entrySeq:seq,entryEpoch:epoch,
     entryPrice:price,regime:signal.regime,
     combos:PAIRED_COMBINATIONS.map(c=>({...c,
      direction:exactAgreement(signal.directions,c.methods)}))});
   }
  }
  return closed;
 }
 return {start,stop,interrupt,onTick,status};
}
