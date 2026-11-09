import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decideStake} from '../adaptive-demo-stake.mjs';
import {evaluateGlobalRisk,replaySettlements} from '../program-equity-guard.mjs';
const pnl=v=>v.map(pnlCents=>({pnlCents}));
test('Dos rojas consecutivas reducen desde US$1 hasta US$0.50',()=>{
 assert.equal(decideStake(pnl([-100]),{enabled:true}).stakeCents,100);
 assert.equal(decideStake(pnl([-100,-100]),{enabled:true}).stakeCents,50);
 assert.equal(decideStake(pnl([-100,-100,44]),{enabled:true}).stakeCents,50);
 assert.equal(decideStake(pnl([-100,-100,44,44]),{enabled:true}).stakeCents,50);
});
test('Una ganancia intermedia reinicia racha negativa, nueva tanda reinicia stake',()=>{
 assert.equal(decideStake(pnl([-100,88,-100]),{enabled:true}).stakeCents,100);
 assert.equal(decideStake([],{enabled:true}).stakeCents,100);
 assert.equal(decideStake(pnl([-100,-100]),{enabled:false}).stakeCents,100);
 assert.throws(()=>decideStake([{pnlCents:null}],{enabled:true}),/INVALID/);
});
test('Presupuesto neto global detiene nuevas compras antes de perder más de US$3',()=>{
 assert.equal(evaluateGlobalRisk({netCents:-200,peakNetCents:0,stakeCents:100}).blocked,false);
 assert.equal(evaluateGlobalRisk({netCents:-300,peakNetCents:0,stakeCents:50}).reason,
  'PROGRAM_LOSS_BUDGET_INSUFFICIENT');
});
test('Pico USD7.14 protege al menos USD5.14 ante futuras tandas negativas',()=>{
 assert.equal(evaluateGlobalRisk({netCents:714,peakNetCents:714,stakeCents:100}).floorCents,514);
 assert.equal(evaluateGlobalRisk({netCents:514,peakNetCents:714,stakeCents:50}).reason,
  'PROGRAM_PROFIT_FLOOR_PROTECTED');
});
test('El pico se calcula sin información futura, exclusivamente liquidaciones ordenadas',()=>{
 const net=replaySettlements(pnl([88,88,-100,88,88,-100]));
 assert.deepEqual(net,{netCents:152,peakNetCents:252});
 assert.throws(()=>replaySettlements([{pnlCents:'44'}]),/INVALID/);
});
