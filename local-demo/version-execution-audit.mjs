// Auditoría descriptiva de versiones desde SQLite local de opciones DEMO.
// No ejecuta ordenes; no atribuye las transiciones UNKNOWN ya conciliadas
// si no existe registro de eventos históricos.
const value=x=>x===null||x===undefined||x===''?null:
 Number.isFinite(Number(x))?Number(x):null;
const pct=(a,b)=>b>0?Number((100*a/b).toFixed(2)):null;
const dollars=x=>Number((x/100).toFixed(2));
const version=x=>typeof x==='string'&&/^\d{1,2}\.\d{1,2}$/.test(x)?
 x:'SIN_VERSION_HISTORICA';
const sortVersion=(a,b)=>{
 const num=x=>/^\d+\.\d+$/.test(x)?Number(x.split('.')[0])*100+Number(x.split('.')[1]):-1;
 return num(a.version)-num(b.version);
};
function makeGroup(versionName){
 return {version:versionName,attempts:0,settled:0,wins:0,losses:0,
  rejected:0,cancelled:0,expired:0,pending:0,
  unknownNow:0,openNow:0,preparingNow:0,other:0,
  stakeCents:0,netCents:0,grossWinCents:0,grossLossCents:0,
  errorCounts:new Map(),modeCounts:new Map(),horizonCounts:new Map(),
  settledRows:[]};
}
export function analyzeDemoVersions(raw){
 if(!Array.isArray(raw)||raw.length>100000)
  throw Error('VERSION_AUDIT_ROWS_INVALID');
 const grouped=new Map();
 for(const row of raw){
  if(!row||typeof row!=='object')continue;
  const v=version(row.app_version??row.appVersion),g=grouped.get(v)||makeGroup(v);
  grouped.set(v,g);g.attempts++;
  const state=String(row.state||'');
  const code=String(row.error_code??row.errorCode??'').slice(0,80);
  if(state==='SETTLED'){
   const pnl=value(row.pnl_cents??row.pnlCents),stake=value(row.buy_cents??row.buyCents)??value(row.stake_cents??row.stakeCents);
   if(pnl===null||stake===null||stake<=0){g.other++;continue;}
   g.settled++;g.netCents+=pnl;g.stakeCents+=stake;
   if(pnl>0){g.wins++;g.grossWinCents+=pnl;}
   if(pnl<0){g.losses++;g.grossLossCents+=-pnl;}
   const mode=String(row.prediction_mode??row.predictionMode??'SIN_MODO'),h=value(row.duration_ticks??row.durationTicks);
   const hm=h===5?'5 TICKS':h===10?'10 TICKS':'SIN_HORIZONTE';
   const x=g.modeCounts.get(mode)||{n:0,wins:0,netCents:0};
   x.n++;x.wins+=pnl>0?1:0;x.netCents+=pnl;g.modeCounts.set(mode,x);
   const y=g.horizonCounts.get(hm)||{n:0,wins:0,netCents:0};
   y.n++;y.wins+=pnl>0?1:0;y.netCents+=pnl;g.horizonCounts.set(hm,y);
   const at=value(row.bought_at_ms??row.boughtAtMs)??value(row.created_at??row.createdAt)??0;
   g.settledRows.push({at,pnl});
  }else if(state==='REJECTED'){g.rejected++;}
  else if(state==='CANCELLED'){g.cancelled++;}
  else if(state==='EXPIRED'){g.expired++;}
  else if(state==='UNKNOWN'){g.unknownNow++;}
  else if(state==='OPEN'){g.openNow++;}
  else if(['PREPARING','SENDING'].includes(state)){g.preparingNow++;}
  else if(state==='PENDING_APPROVAL'){g.pending++;}
  else g.other++;
  if(state==='REJECTED'||state==='UNKNOWN'||state==='PREPARING'||state==='SENDING'){
   const k=code||'SIN_CODIGO';
   g.errorCounts.set(k,(g.errorCounts.get(k)||0)+1);
  }
 }
 const versions=[...grouped.values()].map(g=>{
  g.settledRows.sort((a,b)=>a.at-b.at);
  const mid=Math.floor(g.settledRows.length/2);
  const halves=[g.settledRows.slice(0,mid),g.settledRows.slice(mid)]
   .map(part=>({n:part.length,wins:part.filter(x=>x.pnl>0).length,
    netUsd:dollars(part.reduce((a,b)=>a+b.pnl,0)),
    winRatePct:pct(part.filter(x=>x.pnl>0).length,part.length)}));
  return {version:g.version,attempts:g.attempts,settled:g.settled,
   wins:g.wins,losses:g.losses,winRatePct:pct(g.wins,g.settled),
   netUsd:dollars(g.netCents),roiPct:pct(g.netCents,g.stakeCents),
   grossWinUsd:dollars(g.grossWinCents),grossLossUsd:dollars(g.grossLossCents),
   stakedUsd:dollars(g.stakeCents),
   rejected:g.rejected,cancelled:g.cancelled,expired:g.expired,pending:g.pending,
   unknownNow:g.unknownNow,openNow:g.openNow,preparingNow:g.preparingNow,other:g.other,
   firstHalf:halves[0],secondHalf:halves[1],
   mostFrequentErrors:[...g.errorCounts].map(([error,n])=>({error,n}))
    .sort((a,b)=>b.n-a.n).slice(0,5),
   byMode:[...g.modeCounts].map(([mode,x])=>({mode,
    n:x.n,winRatePct:pct(x.wins,x.n),netUsd:dollars(x.netCents)}))
    .sort((a,b)=>b.n-a.n),
   byHorizon:[...g.horizonCounts].map(([horizon,x])=>({horizon,
    n:x.n,winRatePct:pct(x.wins,x.n),netUsd:dollars(x.netCents)}))
    .sort((a,b)=>b.n-a.n)
  };
 }).sort(sortVersion);
 const evaluated=versions.filter(x=>x.settled>=50);
 const byRate=evaluated.slice().sort((a,b)=>b.winRatePct-a.winRatePct);
 const byNet=evaluated.slice().sort((a,b)=>b.netUsd-a.netUsd);
 const x=versions.reduce((a,b)=>({attempts:a.attempts+b.attempts,
  settled:a.settled+b.settled,wins:a.wins+b.wins,
  netUsd:Number((a.netUsd+b.netUsd).toFixed(2)),
  unknownNow:a.unknownNow+b.unknownNow,
  openNow:a.openNow+b.openNow,
  rejected:a.rejected+b.rejected}),{
  attempts:0,settled:0,wins:0,netUsd:0,unknownNow:0,openNow:0,rejected:0});
 return {mode:'DEMO_VERSION_EXECUTION_AUDIT',readOnly:true,realEnabled:false,
  brokerOrdersSent:0,allVersionsWithRecordedOrders:versions.length,
  consideredForBest: 'MINIMUM_50_SETTLED',
  bestObservedWinRate:byRate[0]??null,bestObservedNet:byNet[0]??null,
  totals:{...x,winRatePct:pct(x.wins,x.settled)},
  versions,
  limitations:['UNKNOWN indica el estado actual de la orden, NO el numero historico de veces que una orden paso por UNKNOWN.',
   'Las 22 versiones de la tabla representan versiones con operaciones guardadas, no todas las versiones publicadas.',
   'Una tasa historica alta no demuestra ventaja por cambio de codigo; las muestras y parametros se escogieron en distintas sesiones.',
   'No mezclar REJECTED con perdida ni tratar OPEN o UNKNOWN como liquidado.']};
}
// Guarda la cuenta de tres perdidas CONSECUTIVAS de la misma tanda
// verificadas en SQLite; no recompra ni modifica el stake.
export function researchLossBreak(rows,{limit=3}={}){
 if(!Array.isArray(rows)||![2,3,4,5].includes(limit))throw Error('LOSS_BREAK_INVALID');
 let streak=0;for(let i=rows.length-1;i>=0;i--){
  const x=value(rows[i]?.pnlCents??rows[i]?.pnl_cents);
  if(x===null||x>=0)break;
  streak++;
 }
 return {stop:streak>=limit,streak,limit,
  reason:streak>=limit?'RESEARCH_CONSECUTIVE_SETTLED_LOSS_BREAK':null,
  note:'Solo resultado broker SETTLED; una ola simultanea puede cerrar varios contratos antes del veto.'};
}
