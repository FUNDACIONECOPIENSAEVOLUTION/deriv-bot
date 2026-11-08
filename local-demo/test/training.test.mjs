import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {summarize,parseCsv} from '../training.mjs';
test('CSV escaped quotes and BOM',()=>{
 const csv='\uFEFF"fuente","contrato_deriv","ganancia_neta_usd"\r\n"DERIV_DEMO","12","0.50"\r\n';
 assert.equal(parseCsv(csv)[0].contrato_deriv,'12');
});
test('Dedup contracts, no inflated profits',()=>{
 const header='fuente,contrato_deriv,ganancia_neta_usd,estado,reserva_epoch,tanda_id,mercado,direccion,apuesta_usd,edad_cotizacion_seg\n';
 const rows='DERIV_DEMO,12,0.5,SETTLED,2,A,R_100,CALL,1,0\nDERIV_DEMO,12,0.5,SETTLED,2,A,R_100,CALL,1,0\n';
 const s=summarize(header+rows);assert.equal(s.total.contracts,1);assert.equal(s.total.netUsd,.5);
 assert.equal(s.trainingModel,'NO_ENTRENADO');
});
