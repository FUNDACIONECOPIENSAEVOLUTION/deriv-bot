import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildFourBotLabStatus} from '../four-bot-lab.mjs';
test('Cuatro perfiles con 100 USD planeados cada uno sin pretender saldos segregados',()=>{
 const s=buildFourBotLabStatus();
 assert.equal(s.bots.length,4);
 assert.equal(s.plannedTotalUsd,400);
 assert.equal(s.budgetsEnforced,false);
 assert.equal(s.readOnly,true);assert.equal(s.realEnabled,false);
 assert.equal(s.parallelBuyEnabled,false);
 assert.ok(s.bots.every(x=>x.plannedBudgetUsd===100&&x.budgetFunded===false));
 assert.equal(s.bots[3].account,'SEPARATE_MT5_DEMO');
});
test('Historial de Rise/Fall no se confunde con presupuesto virtual o rendimientos del laboratorio',()=>{
 const s=buildFourBotLabStatus({optionsConnected:true,marketConnected:true,
  riseFallSummary:{settled:10,wins:6,netCents:120}});
 assert.equal(s.bots[0].historicalDemoPnlUsd,1.2);
 assert.equal(s.bots[0].winRate,.6);
 assert.equal(s.bots[0].paperPnlUsd,null);
 assert.equal(s.bots[0].benchmarkStartAt,null);
 assert.equal(s.bots[0].status,'DEMO_OWNER_APPROVAL_ONLY');
});
test('Dígitos: conteo de observaciones sin inventar beneficio contractual ni activar BUY',()=>{
 const s=buildFourBotLabStatus({marketConnected:true,digitReport:{
  ticksObserved:110,symbols:[{evaluated:{DIGITDIFF:{n:25}}},{evaluated:{DIGITDIFF:{n:15}}}]}});
 assert.equal(s.bots[1].samples,40);
 assert.equal(s.bots[1].priceTicksObserved,110);
 assert.equal(s.bots[1].status,'PUBLIC_SHADOW_OBSERVING');
 assert.equal(s.bots[1].paperPnlUsd,null);
 assert.equal(s.bots[1].autonomousTradingEnabled,false);
});
test('Sin conexiones no afirma que CFD o Multipliers puedan ejecutar compras',()=>{
 const s=buildFourBotLabStatus();
 assert.equal(s.bots[2].status,'CONTRACT_DISCOVERY_REQUIRED');
 assert.equal(s.bots[3].status,'SEPARATE_MT5_DEMO_REQUIRED');
 assert.equal(s.bots[2].liveRealTrading,false);
 assert.equal(s.bots[3].autonomousTradingEnabled,false);
});
