import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MCP_TOOLS,dispatchMcp} from '../mcp-local.mjs';

const call=(name,args={})=>({jsonrpc:'2.0',id:42,method:'tools/call',
 params:{name,arguments:args}});
const unpack=r=>JSON.parse(r.result.content[0].text);
test('MCP publica tres consultas de analisis completas pero nunca exponer orden de compra automatica',async()=>{
 const attempts=[];
 const handlers={
  version:()=> '18.7',profitability:()=>({mode:'SOLO_LECTURA_DEMO',realEnabled:false,
   total:{n:100,winRate:.55,netCents:20}}),
  shadowStrategies:()=>({readOnly:true,brokerOrders:0,samplesStored:700}),
  decisionDesk:()=>({mode:'DERIV_DEMO_DECISION_DESK_READ_ONLY',
   eligibleToBuyNow:0,realEnabled:false}),
  request:args=>{attempts.push(args);return {
   state:'PENDING_APPROVAL',requiresOwnerConfirmation:true,brokerOrders:0,
   durationTicks:args.durationTicks,modelMode:args.modelMode};
  }
 };
 for(const [name,field] of [
  ['get_demo_profitability_by_strategy','total'],
  ['get_demo_shadow_strategies','samplesStored'],
  ['get_demo_decision_desk','eligibleToBuyNow']]){
  assert.ok(MCP_TOOLS.some(x=>x.name===name));
  assert.ok(Object.hasOwn(unpack(await dispatchMcp(call(name),handlers)),field));
 }
 assert.equal(attempts.length,0);
 assert.ok(MCP_TOOLS.every(x=>!/execute_buy|withdraw|buy_real|auto_buy/.test(x.name)));
 const a=await dispatchMcp(call('request_demo_buy_review',{
  symbol:'1HZ25V',direction:'CALL',stakeCents:35,
  durationTicks:10,modelMode:'PREDICTIVE_5_10'}),handlers);
 assert.equal(unpack(a).state,'PENDING_APPROVAL');
 assert.equal(unpack(a).brokerOrders,0);
 assert.equal(attempts[0].durationTicks,10);
 assert.equal(attempts[0].modelMode,'PREDICTIVE_5_10');
});
test('MCP permite consenso 5/10 únicamente con pequeña apuesta y aprobación local',async()=>{
 const recorded=[];
 const handlers={request:args=>{recorded.push(args);return {
  state:'PENDING_APPROVAL',brokerOrders:0,requiresOwnerConfirmation:true,
  durationTicks:args.durationTicks};}};
 for(const horizon of [5,10]){
  const x=unpack(await dispatchMcp(call('request_demo_buy_review',{
   symbol:'R_25',direction:'PUT',stakeCents:50,durationTicks:horizon,
   modelMode:'DEMO_136_CONSENSUS_5_10'}),handlers));
  assert.equal(x.state,'PENDING_APPROVAL');
  assert.equal(x.durationTicks,horizon);
 }
 assert.equal(recorded.length,2);
 for(const args of [
  {symbol:'R_25',direction:'CALL',stakeCents:100,durationTicks:10,
   modelMode:'DEMO_136_CONSENSUS_5_10'},
  {symbol:'R_25',direction:'CALL',stakeCents:50,durationTicks:10,
   modelMode:'LEGACY_60_CANDLES'},
  {symbol:'R_25',direction:'CALL',stakeCents:100,durationTicks:60,
   modelMode:'PREDICTIVE_5_10'},
  {symbol:'R_25',direction:'CALL',stakeCents:200,durationTicks:5},
  {symbol:'R_20',direction:'CALL',stakeCents:35,durationTicks:5},
  {symbol:'R_25',direction:'CALL',stakeCents:35,durationTicks:5,
   modelMode:'PREDICTIVE_5_10',source:'LOCAL_OWNER'},
  {symbol:'R_25',direction:'CALL',stakeCents:35,durationTicks:5,
   modelMode:'REAL'}
 ]){
  const x=await dispatchMcp(call('request_demo_buy_review',args),handlers);
  assert.equal(x.error?.code,-32602,JSON.stringify(args));
 }
 assert.equal(recorded.length,2);
});
