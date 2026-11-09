import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MCP_TOOLS,dispatchMcp} from '../mcp-local.mjs';
test('MCP puede consultar patrones de velas solo en modo sombra y sin órdenes',async()=>{
 assert.ok(MCP_TOOLS.some(x=>x.name==='get_candle_pattern_validation'));
 const handlers={candlePatterns:()=>({
  mode:'CANDLE_PATTERN_SHADOW_TRAINING',
  predictionAltersBuy:false,realEnabled:false,
  independentSamples:0,conclusion:'MUESTRA_DE_VELAS_INSUFICIENTE'
 })};
 const r=await dispatchMcp({jsonrpc:'2.0',id:8,method:'tools/call',
  params:{name:'get_candle_pattern_validation',arguments:{}}},handlers);
 const data=JSON.parse(r.result.content[0].text);
 assert.equal(data.mode,'CANDLE_PATTERN_SHADOW_TRAINING');
 assert.equal(data.predictionAltersBuy,false);
 assert.equal(data.realEnabled,false);
 assert.ok(MCP_TOOLS.every(x=>!/auto_execute|withdraw|live_buy/.test(x.name)));
});
