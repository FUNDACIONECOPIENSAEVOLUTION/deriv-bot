/** Private DEMO-only CSV with audited source and no simulated PAPER rows. */
export type DemoCsvRow={
 id:number;date:string;created_at:number;bought_at:number|null;settled_at:number|null;
 state:string;contract_id:number|null;buy_cents:number|null;payout_cents:number|null;
 pnl_cents:number|null;code:string|null;decision_json:string|null;
 entry_spot:number|null;exit_spot:number|null;contract_type:string|null;symbol?:string|null
};
export const DEMO_CSV_COLUMNS=[
 'fuente','tanda_id','id_registro','contrato_deriv','fecha_colombia',
 'reserva_epoch','compra_deriv_epoch','liquidacion_observada_epoch',
 'estado','mercado','direccion','apuesta_usd','pago_usd','ganancia_neta_usd',
 'precio_entrada','precio_salida','estrategia','senal','sma_8','sma_21',
 'rsi','volatilidad','edad_cotizacion_seg','precio_senal',
 'razon_senal','diagnostico','verificacion'
] as const;
const number=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)?x:null;
const cell=(x:unknown)=>{
 const raw=x===null||x===undefined?'':String(x);
 // Neutralize CSV spreadsheet formula injection, also after leading spaces.
 const numeric=/^-?(?:0|[1-9][0-9]*)(?:[.][0-9]+)?$/.test(raw);
 const sanitized=/^\s*[=+@-]/.test(raw)&&number(x)===null&&!numeric?"'"+raw:raw;
 return '"'+sanitized.replaceAll('"','""')+'"';
};
const asUsd=(x:number|null)=>x===null?'':(x/100).toFixed(2);
const direction=(row:DemoCsvRow)=>row.contract_type==='CALL'||row.contract_type==='PUT'?row.contract_type:'SIN_DIRECCION';
const reason=(row:DemoCsvRow)=>{
 if(row.state!=='SETTLED'||row.pnl_cents===null)return 'SIN_LIQUIDAR';
 if(row.pnl_cents>=0)return 'NO_ES_PERDIDA';
 if(row.entry_spot===null||row.exit_spot===null)return 'SIN_SPOTS_CONFIRMADOS';
 if(row.contract_type==='CALL')return row.exit_spot<=row.entry_spot?
  'CALL_NO_SUBIO_AL_VENCIMIENTO':'REVISAR_REGLA_DE_CONTRATO';
 if(row.contract_type==='PUT')return row.exit_spot>=row.entry_spot?
  'PUT_NO_BAJO_AL_VENCIMIENTO':'REVISAR_REGLA_DE_CONTRATO';
 return 'SIN_DIRECCION';
};
function colombia(t:number){
 return new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
  second:'2-digit',hourCycle:'h23'}).format(new Date(t*1000));
}
export function demoTradesCsv(rows:DemoCsvRow[]):string{
 if(!Array.isArray(rows)||rows.length>1000)throw Error('DEMO_CSV_LIMIT');
 const records=rows.map(row=>{
  if(!Number.isSafeInteger(row.id)||row.id<=0)throw Error('DEMO_CSV_INVALID_ID');
  let d:Record<string,unknown>={};
  try{
   const x=row.decision_json?JSON.parse(row.decision_json):{};
   if(x&&typeof x==='object'&&!Array.isArray(x))d=x;
  }catch{d={};}
  const nums=(key:string)=>number(d[key]);
  const verification=row.code==='CLIENT_OBSERVED'?
   'OBSERVADO_NAVEGADOR_NO_VERIFICADO_INDEPENDIENTEMENTE':
    row.state==='UNKNOWN'?'ACEPTACION_INCIERTA_NO_REINTENTAR':
    row.code??'REGISTRO_INTERNO';
  const v=[
   'DERIV_DEMO',typeof d.runId==='string'?d.runId:'',
   row.id,row.contract_id,colombia(row.created_at),row.created_at,
   row.bought_at,row.settled_at,row.state,row.symbol||'R_100',direction(row),
   asUsd(row.buy_cents),asUsd(row.payout_cents),asUsd(row.pnl_cents),
   row.entry_spot,row.exit_spot,d.strategy,d.direction,nums('fast'),
   nums('slow'),nums('rsi'),nums('volatility'),nums('quoteAgeSeconds'),
   nums('entryQuote'),d.reason,reason(row),verification
  ];
  return v.map(cell).join(',');
 });
 return '\uFEFF'+DEMO_CSV_COLUMNS.map(cell).join(',')+'\r\n'+records.join('\r\n')+'\r\n';
}
