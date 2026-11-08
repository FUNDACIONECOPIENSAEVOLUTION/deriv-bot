// Diagnóstico explicable de contratos DEMO: utiliza SOLO liquidaciones y spots oficiales.
// La dirección de un tick no garantiza una ganancia ni constituye predicción.
const finite=x=>typeof x==='number'&&Number.isFinite(x);
export function diagnoseTrade(row){
 const state=row?.state||'UNKNOWN';
 if(state==='REJECTED')return {code:'NO_EJECUTADA',detail:'Solicitud rechazada antes de confirmar compra; no representa pérdida.',evidence:row?.errorCode||null};
 if(state!=='SETTLED')return {code:'SIN_LIQUIDAR',detail:'Aún no existe liquidación confirmada.',evidence:null};
 const pnl=row?.pnlCents;
 if(!finite(pnl))return {code:'SIN_PNL_OFICIAL',detail:'Liquidación sin importe verificable.',evidence:null};
 const entry=row?.entryTick,exit=row?.exitTick;
 if(!finite(entry)||!finite(exit))return {
  code:pnl<0?'PERDIDA_SIN_SPOTS':'RESULTADO_SIN_SPOTS',
  detail:'El broker confirmó el resultado, pero la versión antigua no guardó entrada y salida. La causa exacta no se puede comprobar.',
  evidence:null
 };
 const move=exit-entry,signal=row.direction==='CALL'?1:row.direction==='PUT'?-1:0;
 if(!signal)return {code:'TIPO_CONTRATO_DESCONOCIDO',detail:'No es posible comparar dirección y movimiento.',evidence:move};
 const aligned=move*signal;
 if(pnl<0){
  if(aligned<0)return {code:'MOVIMIENTO_CONTRARIO',detail:'El precio terminó en dirección contraria a la compra.',evidence:move};
  if(aligned===0)return {code:'PRECIO_SIN_CAMBIO',detail:'La entrada y la salida coinciden; este contrato no obtuvo beneficio.',evidence:move};
  return {code:'PNL_NEGATIVO_INESPERADO',detail:'La dirección fue favorable, pero el resultado fue negativo. Verificar las condiciones del contrato con Deriv.',evidence:move};
 }
 if(pnl>0&&aligned>0)return {code:'DIRECCION_FAVORABLE',detail:'El precio terminó en la dirección elegida y el contrato ganó.',evidence:move};
 if(pnl===0)return {code:'RESULTADO_CERO',detail:'Contrato liquidado sin ganancia neta.',evidence:move};
 return {code:'PNL_POSITIVO_INESPERADO',detail:'El P&L no coincide con el movimiento simple. Revisar condiciones del contrato.',evidence:move};
}
