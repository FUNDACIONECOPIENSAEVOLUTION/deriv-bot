import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MCP_TOOLS,dispatchMcp} from '../mcp-local.mjs';

test('Walk-Forward está disponible en MCP solo lectura, sin herramientas de ejecución',async()=>{
 assert.ok(MCP_TOOLS.some(t=>t.name==='get_walk_forward_validation'));
 assert.ok(!MCP_TOOLS.some(t=>/real|withdraw|execute_buy|send_buy/.test(t.name)));
 let called=0;
 const handlers={version:()=> '14.3',
  walkForward:()=>{called++;return {mode:'SHADOW_WALK_FORWARD',
   predictionAltersBuy:false,realEnabled:false,scored:{n:0}};}};
 const response=await dispatchMcp({jsonrpc:'2.0',id:1,method:'tools/call',
  params:{name:'get_walk_forward_validation',arguments:{}}},handlers);
 const content=JSON.parse(response.result.content[0].text);
 assert.equal(called,1);
 assert.equal(content.predictionAltersBuy,false);
 assert.equal(content.realEnabled,false);
 assert.equal(content.mode,'SHADOW_WALK_FORWARD');
});
