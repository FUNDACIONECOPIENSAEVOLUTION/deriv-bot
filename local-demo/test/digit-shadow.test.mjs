import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lastDigitFromTick,predictDigitCandidates,createDigitShadowObserver,breakEvenFromQuote} from '../digit-shadow.mjs';

test('El ultimo digito utiliza exactamente la precision pip_size recibida',()=>{
 assert.equal(lastDigitFromTick(100.1,3),0);
 assert.equal(lastDigitFromTick(100.137,3),7);
 assert.equal(lastDigitFromTick(1.28,2),8);
 assert.equal(lastDigitFromTick(1243,0),3);
 assert.equal(lastDigitFromTick(100.1,undefined),null);
 assert.equal(lastDigitFromTick(100.1,-1),null);
 assert.equal(lastDigitFromTick(-100,3),null);
});
test('Pronosticos solo con historial anterior, nunca con el siguiente tick',()=>{
 const b=createDigitShadowObserver({windowSize:30});
 for(let seq=1;seq<=30;seq++)
  assert.equal(b.onTick({symbol:'1HZ10V',quote:100.100,pipSize:3,
   epoch:1800000000+seq,seq}),true);
 const a=b.status().symbols[0];
 assert.equal(a.evaluated.DIGITDIFF.n,0);
 assert.equal(a.pendingNextTick,true);
 const p=predictDigitCandidates(Array(30).fill(0));
 assert.equal(p.DIGITDIFF.barrier,1);
 assert.equal(p.DIGITPARITY.isEven,true);
 b.onTick({symbol:'1HZ10V',quote:100.100,pipSize:3,epoch:1800000031,seq:31});
 const after=b.status().symbols[0].evaluated;
 assert.deepEqual([after.DIGITDIFF.n,after.DIGITDIFF.wins],[1,1]);
 assert.deepEqual([after.DIGITPARITY.n,after.DIGITPARITY.wins],[1,1]);
 assert.deepEqual([after.DIGITOVER2.n,after.DIGITOVER2.wins],[1,0]);
 assert.deepEqual([after.DIGITUNDER7.n,after.DIGITUNDER7.wins],[1,1]);
 assert.equal(b.status().brokerOrders,0);
 assert.equal(b.status().affectsBuy,false);
});
test('Cambio de pip_size, salto de secuencia o reconexion invalida expectativas pendientes',()=>{
 const b=createDigitShadowObserver({windowSize:30});
 for(let seq=1;seq<=30;seq++)
  b.onTick({symbol:'R_10',quote:123.100,pipSize:3,epoch:1800000000+seq,seq});
 b.onTick({symbol:'R_10',quote:123.100,pipSize:3,epoch:1800000040,seq:40});
 assert.equal(b.status().symbols[0].evaluated.DIGITDIFF.n,0);
 assert.equal(b.status().symbols[0].windowCount,1);
 b.interrupt();
 b.onTick({symbol:'R_10',quote:123.100,pipSize:3,epoch:1800000100,seq:41});
 assert.equal(b.status().symbols[0].evaluated.DIGITDIFF.n,0);
 assert.equal(b.status().symbols[0].windowCount,1);
});
test('No se inventan ganancias sin quote real del broker',()=>{
 assert.equal(breakEvenFromQuote(1,1.12),.8928571);
 assert.equal(breakEvenFromQuote(1,1.11),.9009009);
 assert.equal(breakEvenFromQuote(1,1),null);
 assert.equal(breakEvenFromQuote(1,null),null);
 assert.equal(createDigitShadowObserver().status().netProfitAvailable,false);
});
test('No admite un simbolo o una precision inventada',()=>{
 const b=createDigitShadowObserver();
 assert.equal(b.onTick({symbol:'../../env',quote:100.123,pipSize:3,epoch:1800000000,seq:1}),false);
 assert.equal(b.onTick({symbol:'R_10',quote:100.123,pipSize:null,epoch:1800000000,seq:1}),false);
 assert.equal(b.status().symbols[0].invalidTicks,1);
 assert.equal(b.status().symbols[0].evaluated.DIGITDIFF.n,0);
});
