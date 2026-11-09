import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MCP_TOOLS,dispatchMcp} from '../mcp-local.mjs';
const call=(name,args={})=>({jsonrpc:'2.0',id:1,method:'tools/call',
 params:{name,arguments:args}});
const payload=r=>JSON.parse(r.result.content[0].text);
const handlers={
 version:()=> '14.4',risk:()=>({demoOnly:true,realEnabled:false,dailyNetCents:-350,
 dailyLossStopActive:false,dailyRemainingRiskCents:9650}),
 program:()=>({running:false,demoOnly:true,authorization:'LOCAL_OWNER_ONLY',
 programs:[{roundsCompleted:0}]}),
 request:({symbol,direction,stakeCents})=>({symbol,direction,stakeCents,
 state:'PENDING_APPROVAL',requiresOwnerConfirmation:true,brokerOrders:0})
};
test('MCP puede consultar estado y riesgo DEMO sin acceso a ejecución',async()=>{
 assert.ok(MCP_TOOLS.some(x=>x.name==='get_demo_risk_status'));
 assert.ok(MCP_TOOLS.some(x=>x.name==='get_demo_program_status'));
 assert.ok(MCP_TOOLS.some(x=>x.name==='get_walk_forward_validation'));
 const r=payload(await dispatchMcp(call('get_demo_risk_status'),handlers));
 assert.equal(r.dailyNetCents,-350);
 assert.equal(r.realEnabled,false);
 const p=payload(await dispatchMcp(call('get_demo_program_status'),handlers));
 assert.equal(p.running,false);
 assert.equal(p.authorization,'LOCAL_OWNER_ONLY');
 assert.ok(MCP_TOOLS.every(x=>!/execute_real|withdraw|broker_buy|execute_buy/.test(x.name)));
});
test('Símbolos admitidos en MCP pueden solicitar revisión local DEMO sin BUY',async()=>{
 for(const symbol of ['R_10','R_25','R_50','R_75','R_100','R_500','1HZ10V','1HZ500V']){
  const r=payload(await dispatchMcp(call('request_demo_buy_review',{
   symbol,direction:'CALL',stakeCents:100}),handlers));
  assert.equal(r.symbol,symbol);assert.equal(r.brokerOrders,0);
  assert.equal(r.state,'PENDING_APPROVAL');
 }
});
test('No admite índices no verificados ni apuestas/órdenes REAL',async()=>{
 for(const symbol of ['R_20','R_30','R_100;BUY','', 'REAL']){
  const resp=await dispatchMcp(call('request_demo_buy_review',
   {symbol,direction:'PUT',stakeCents:100}),handlers);
  assert.equal(resp.error?.code,-32602);
 }
 const invalid=await dispatchMcp(call('request_demo_buy_review',{
  symbol:'R_100',direction:'PUT',stakeCents:5000}),handlers);
 assert.equal(invalid.error?.code,-32602);
});
