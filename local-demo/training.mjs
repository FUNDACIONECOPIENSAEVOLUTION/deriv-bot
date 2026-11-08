// Investigación histórica exclusivamente DEMO: no reentrena un modelo ni autoriza operaciones.
import {readFileSync, statSync} from 'node:fs';

export function parseCsv(input){
  const rows=[];let row=[],cell='',quoted=false;
  input=String(input).replace(/^\uFEFF/,'');
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(quoted){if(c==='"'&&input[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}
    else if(c==='"')quoted=true;
    else if(c===','){row.push(cell);cell='';}
    else if(c==='\n'){row.push(cell.replace(/\r$/,''));if(row.some(x=>x.length))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(cell.length||row.length){row.push(cell);rows.push(row);}
  if(rows.length<1)return [];
  const keys=rows.shift();
  if(!keys.includes('contrato_deriv')||!keys.includes('ganancia_neta_usd'))throw Error('CSV_DEMO_INVALIDO');
  return rows.filter(r=>r.length===keys.length).map(r=>Object.fromEntries(keys.map((key,i)=>[key,r[i]])));
}

export function summarize(csv){
  const seen=new Set();
  const raw=parseCsv(csv);
  const trades=raw.filter(t=>{
    if(t.fuente!=='DERIV_DEMO'||t.estado!=='SETTLED'||!t.contrato_deriv||seen.has(t.contrato_deriv))return false;
    const profit=Number(t.ganancia_neta_usd);
    if(!Number.isFinite(profit))return false;
    seen.add(t.contrato_deriv);return true;
  }).sort((a,b)=>Number(a.reserva_epoch)-Number(b.reserva_epoch));
  const build=x=>({contracts:x.length,wins:x.filter(t=>Number(t.ganancia_neta_usd)>0).length,
    losses:x.filter(t=>Number(t.ganancia_neta_usd)<0).length,
    netUsd:Number(x.reduce((sum,t)=>sum+Number(t.ganancia_neta_usd),0).toFixed(2)),
    stakeUsd:Number(x.reduce((sum,t)=>sum+Number(t.apuesta_usd||0),0).toFixed(2))});
  const groups=(key)=>Object.fromEntries([...new Set(trades.map(t=>t[key]))].sort().map(v=>[v,build(trades.filter(t=>t[key]===v))]));
  const batches=[...new Set(trades.map(t=>t.tanda_id))].map(id=>({id,items:trades.filter(t=>t.tanda_id===id)}))
    .sort((a,b)=>Number(a.items[0]?.reserva_epoch||0)-Number(b.items[0]?.reserva_epoch||0));
  return {mode:'HISTORICO_OBSERVADO_NO_VERIFICADO',trainingModel:'NO_ENTRENADO',
    warning:'Muestra pequeña y liquidaciones observadas por navegador; no demuestra predicción rentable.',
    total:build(trades),byMarket:groups('mercado'),byDirection:groups('direccion'),
    quoteAgeGroups:Object.fromEntries([...new Set(trades.map(t=>t.edad_cotizacion_seg))].sort().map(v=>[v,build(trades.filter(t=>t.edad_cotizacion_seg===v))])),
    latestFour:Batches(batches.slice(-4)),historicalBatches:batches.length,
    lastEpoch:trades.at(-1)?Number(trades.at(-1).reserva_epoch):null};
}
function Batches(arr){return arr.map(({id,items})=>({batch:id,startEpoch:Number(items[0]?.reserva_epoch||0),...{
  contracts:items.length,wins:items.filter(t=>Number(t.ganancia_neta_usd)>0).length,
  netUsd:Number(items.reduce((s,t)=>s+Number(t.ganancia_neta_usd),0).toFixed(2))}}));}

let cache={file:'',mtime:0,report:null};
export function readTraining(file){
  try{const st=statSync(file);
    if(cache.file!==file||st.mtimeMs!==cache.mtime){cache={file,mtime:st.mtimeMs,report:summarize(readFileSync(file,'utf8'))};}
    return cache.report;
  }catch(e){if(e.code==='ENOENT')return {mode:'SIN_HISTORIAL',total:{contracts:0},trainingModel:'NO_ENTRENADO'};throw e;}
}
