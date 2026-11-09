import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProfitExitTracker,GREEN_EXIT_REASONS} from '../profit-exit-policy.mjs';
const start=(policy='TRAILING_GREEN',targetCents=50)=>
 createProfitExitTracker({policy,targetCents,stakeCents:100,maxTrades:10});
function evaluate(pnls,target=50){
 const model=start('TRAILING_GREEN',target);let net=0,answer=null;
 for(let i=0;i<pnls.length;i++){
  const pre=model.beforeNextBuy({settled:i,netCents:net});
  if(pre.close)return {reason:pre.reason,buys:i,net};
  net+=pnls[i];
  const settled=model.onSettlement({settled:i+1,netCents:net});
  if(settled.close)return {reason:settled.reason,buys:i+1,net};
 }
 return {reason:null,buys:pnls.length,net,model};
}
test('G / GG: no vender en primera victoria ni cerrar la racha ganadora',()=>{
 const a=evaluate([88]);
 assert.equal(a.reason,null);
 const b=evaluate([88,88,88,88]);
 assert.equal(b.reason,null);assert.equal(b.net,352);
});
test('GG R: conservar US$0.76 tras una derrota que sigue verde',()=>{
 assert.deepEqual(evaluate([88,88,-100]),{
  reason:'TRAILING_PROFIT_LOCKED',buys:3,net:76});
});
test('G R G: cerrar al recuperar US$0.76',()=>{
 assert.deepEqual(evaluate([88,-100,88]),{
  reason:'TRAILING_RECOVERY_GREEN',buys:3,net:76});
});
test('G R R no es verde: continua, pero nunca garantiza recuperar',()=>{
 const x=evaluate([88,-100,-100]);
 assert.equal(x.reason,null);assert.equal(x.net,-112);
 const y=evaluate([88,...Array(9).fill(-100)]);
 assert.equal(y.reason,'TEN_BUYS_REACHED_WITHOUT_TARGET');
 assert.equal(y.buys,10);assert.equal(y.net,-812);
});
test('GG con objetivo US$1.50: no iniciar otra compra que perderia el piso',()=>{
 assert.deepEqual(evaluate([88,88,-100],150),{
  reason:'TRAILING_FLOOR_PROTECTED',buys:2,net:176});
});
test('Meta fija conserva su salida anterior, sin perseguir racha',()=>{
 const m=start('FIXED_TARGET');
 assert.equal(m.onSettlement({settled:1,netCents:88}).reason,'TAKE_PROFIT_REACHED');
 assert.ok(GREEN_EXIT_REASONS.includes('TRAILING_RECOVERY_GREEN'));
});
test('No aceptar liquidaciones no verificadas ni intentos de recuento duplicados',()=>{
 const m=start();
 assert.throws(()=>m.onSettlement({settled:2,netCents:176}),/SEQUENCE/);
 m.onSettlement({settled:1,netCents:88});
 assert.throws(()=>m.beforeNextBuy({settled:0,netCents:0}),/MISMATCH/);
 assert.throws(()=>m.onSettlement({settled:1,netCents:88}),/SEQUENCE/);
});
