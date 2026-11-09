import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createOpportunityShadow} from '../opportunity-shadow.mjs';

const record=(symbol,direction,seq,price)=>({
 symbol,direction,liveTickSeq:seq,epoch:1794200000,quote:price,
 ageReceivedMs:180,signalStrength:62,rsi14:57,tickRsi14:54,
 fiveTickMomentum:.02
});
test('Etiqueta exactamente al quinto tick de cada símbolo, seleccionado y alternativa',()=>{
 const db=new DatabaseSync(':memory:');
 const study=createOpportunityShadow({db,getVersion:()=> '14.6'});
 const candidates=[record('R_10','CALL',10,100),record('R_25','PUT',30,200)];
 const saved=study.capture('batch-1',candidates,[candidates[0]]);
 assert.equal(saved.logged,2);
 assert.equal(saved.realOrders,0);
 assert.equal(study.capture('batch-1',candidates,[candidates[0]]).logged,0,
  'no contar dos veces la misma oportunidad/vela de tick');
 for(let i=1;i<=4;i++){
  assert.equal(study.onTick('R_10',10+i,100+i,1794200000+i),0);
  assert.equal(study.onTick('R_25',30+i,200+i,1794200000+i),0);
 }
 assert.equal(study.status().observations,0,'no adelantar resultado');
 assert.equal(study.onTick('R_10',15,105,1794200005),1);
 assert.equal(study.onTick('R_25',35,205,1794200005),1);
 const result=study.status();
 assert.equal(result.observations,2);
 assert.equal(result.selectedVsUnselected.find(x=>x.selectedForAttempt===1).hitRatePct,100);
 assert.equal(result.selectedVsUnselected.find(x=>x.selectedForAttempt===0).hitRatePct,0);
 assert.equal(result.affectsBuy,false);
 assert.equal(result.realEnabled,false);
 assert.match(study.exportCsv(),/selectedForAttempt,candidateRank/);
 assert.match(study.exportCsv(),/14\.6/);
 db.close();
});
test('Reinicio o desconexión interrumpe oportunidades sin inventar resultados',()=>{
 const db=new DatabaseSync(':memory:');
 let study=createOpportunityShadow({db});
 study.capture('batch-1',[record('R_10','PUT',11,100)],[]);
 assert.equal(study.status().pendingInMemory,1);
 study.interrupt();
 assert.equal(study.status().pendingInMemory,0);
 assert.equal(db.prepare("SELECT outcome FROM demo_shadow_opportunities LIMIT 1").get().outcome,'INTERRUPTED');
 study.capture('batch-2',[record('R_10','PUT',16,101)],[]);
 study=createOpportunityShadow({db});
 assert.equal(study.status().pendingInMemory,0);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM demo_shadow_opportunities WHERE outcome='INTERRUPTED'").get().n,2);
 db.close();
});
test('Sin tick en vivo o sin dirección nunca se guardan etiquetas ficticias',()=>{
 const db=new DatabaseSync(':memory:');
 const study=createOpportunityShadow({db});
 assert.equal(study.capture('batch-3',[
  record('R_10','ESPERAR',10,100),record('R_25','CALL',0,100),
  {...record('R_50','CALL',10,100),ageReceivedMs:5000}
 ],[]).logged,0);
 assert.equal(study.status().observations,0);
 assert.equal(study.exportCsv().trim().split(/\r?\n/).length,1);
 db.close();
});
test('Saltos de más de cinco ticks invalidan la observación y no permiten sobreajuste',()=>{
 const db=new DatabaseSync(':memory:');
 const study=createOpportunityShadow({db});
 study.capture('batch-4',[record('R_75','CALL',10,50)],[]);
 assert.equal(study.onTick('R_75',16,51,1794200006),0);
 assert.equal(db.prepare("SELECT outcome FROM demo_shadow_opportunities LIMIT 1").get().outcome,'MISSING_TICKS');
 assert.equal(study.status().observations,0);
 db.close();
});
