import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createPairedMethodStudy,PAIRED_COMBINATIONS,PAIRED_HORIZONS,
 exactAgreement} from '../paired-method-study.mjs';

const newLab=()=>{
 const db=new DatabaseSync(':memory:');
 const lab=createPairedMethodStudy({db,getVersion:()=> '18.4'});
 return {db,lab};
};
const approval='INICIAR ESTUDIO 20X10 SIN COMPRAS';
const send=(lab,symbol,seq,direction=1)=>lab.onTick({symbol,
 price:100+direction*seq*.001,seq,epoch:1800000000+seq});
test('41 perfiles de evaluacion: 6 solos, 15 parejas, 20 trios; sin contradicciones',()=>{
 assert.equal(PAIRED_COMBINATIONS.length,41);
 assert.equal(PAIRED_COMBINATIONS.filter(x=>x.size===1).length,6);
 assert.equal(PAIRED_COMBINATIONS.filter(x=>x.size===2).length,15);
 assert.equal(PAIRED_COMBINATIONS.filter(x=>x.size===3).length,20);
 assert.deepEqual(PAIRED_HORIZONS,[5,10]);
 assert.equal(exactAgreement({A:'CALL',B:'CALL'},['A','B']),'CALL');
 assert.equal(exactAgreement({A:'CALL',B:'PUT'},['A','B']),null);
 assert.equal(exactAgreement({A:'CALL',B:null},['A','B']),null);
 assert.equal(exactAgreement({A:'PUT',B:'PUT',C:'PUT'},['A','B','C']),'PUT');
});
test('Arranque exige un unico clic local de laboratorio, nunca autorizacion a comprar',()=>{
 const {db,lab}=newLab();
 assert.throws(()=>lab.start({confirmation:'AUTORIZAR BUY 200'}),/OWNER_CLICK_REQUIRED/);
 assert.equal(lab.status().status,'NOT_STARTED');
 const x=lab.start({confirmation:approval});
 assert.equal(x.status,'RUNNING');
 assert.equal(x.brokerOrders,0);
 assert.equal(x.affectsBuy,false);
 assert.equal(x.plannedStakeUsd,.1);
 assert.equal(x.estimatedNominalExposureUsdIfAccepted,20);
 assert.equal(x.brokerMinimumConfirmed,false);
 assert.throws(()=>lab.start({confirmation:approval}),/ALREADY_RUNNING/);
 db.close();
});
test('100 pares prospectivos del mismo indice = 10x10 de 5 ticks + 10x10 de 10 ticks',()=>{
 const {db,lab}=newLab();
 lab.start({confirmation:approval});
 for(let seq=1;seq<=64;seq++)send(lab,'1HZ10V',seq);
 assert.equal(lab.status().completed.length,0);
 send(lab,'1HZ10V',65);
 let s=lab.status();
 assert.equal(s.completed.find(x=>x.horizon===5).completed,1);
 assert.equal(s.completed.some(x=>x.horizon===10),false);
 for(let seq=66;seq<=1060;seq++)send(lab,'1HZ10V',seq);
 s=lab.status();
 assert.equal(s.completed.find(x=>x.horizon===5).completed,100);
 assert.equal(s.completed.find(x=>x.horizon===10).completed,100);
 assert.equal(s.completed.find(x=>x.horizon===5).closedRounds,10);
 assert.equal(s.completed.find(x=>x.horizon===10).closedRounds,10);
 assert.equal(s.observations,200);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM demo_paired_events').get().n,200);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM demo_paired_results').get().n,8200);
 assert.ok(s.results.some(x=>x.kind==='TRIPLE_AGREEMENT'));
 assert.ok(s.results.every(x=>x.brokerPnlUsd===null&&x.eligibleForAutoBuy===false));
 assert.equal(s.realizedBrokerPnlUsd,null);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM demo_paired_studies WHERE realized_broker_trades>0').get().n,0);
 db.close();
});
test('Resultados separan indice, horizonte y consenso; desacuerdo se abstiene',()=>{
 const {db,lab}=newLab();
 lab.start({confirmation:approval});
 for(let seq=1;seq<=70;seq++){
  send(lab,'R_20',seq);
  send(lab,'1HZ100V',seq,-1);
 }
 const s=lab.status();
 assert.ok(s.completed.some(x=>x.symbol==='R_20'&&x.horizon===5));
 assert.ok(s.completed.some(x=>x.symbol==='1HZ100V'&&x.horizon===10));
 const result=db.prepare('SELECT direction FROM demo_paired_results WHERE kind=? AND direction IS NULL LIMIT 1').get('PAIR_AGREEMENT');
 assert.ok(result,'un metodo sin señal o señales enfrentadas no ordenan BUY');
 const count=db.prepare('SELECT COUNT(*) AS n FROM demo_paired_results WHERE direction IS NULL').get().n;
 assert.ok(count>0);
 db.close();
});
test('Stop y gap de ticks no permiten resultados falsos ni autoreinicio',()=>{
 const {db,lab}=newLab();
 lab.start({confirmation:approval});
 for(let seq=1;seq<=60;seq++)send(lab,'R_10',seq);
 lab.onTick({symbol:'R_10',price:200,seq:62,epoch:1800000062});
 assert.equal(lab.status().gaps,1);
 assert.equal(lab.status().completed.length,0);
 lab.interrupt();
 assert.equal(lab.status().status,'INTERRUPTED');
 for(let seq=63;seq<=100;seq++)send(lab,'R_10',seq);
 assert.equal(lab.status().observations,0);
 const next=lab.start({confirmation:approval});
 assert.notEqual(next.runId,db.prepare('SELECT run_id FROM demo_paired_studies WHERE state=?').get('INTERRUPTED').run_id);
 const stopped=lab.stop();
 assert.equal(stopped.stopped,true);
 assert.equal(lab.status().status,'STOPPED');
 assert.equal(lab.stop().stopped,false);
 db.close();
});
