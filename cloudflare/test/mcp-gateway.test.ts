import {it,expect} from 'vitest';
import {handleMcpRequest,type McpHandlers} from '../src/mcp-gateway';

function handlers(overrides:Partial<McpHandlers>={}):McpHandlers {
 return {
  getStatus:async()=>({mode:'DERIV_DEMO',balanceVirtualCents:1000031,accountType:'demo'}),
  getSignal:async()=>({direction:'UP',reason:'TREND_AND_MOMENTUM',quoteAgeSeconds:2,
    source:'PUBLIC_R_100_BOT_ENGINE',valid:true}),
  getIntent:async()=>({status:'EMPTY',brokerOrders:0}),
  requestIntent:async p=>({status:'PENDING_OWNER_CONFIRMATION',input:p,brokerOrders:0}),
  cancelIntent:async id=>({status:'CANCELLED',id,brokerOrders:0}),
  ...overrides
 };
}
async function call(method:string,params:unknown={},overrides:Partial<McpHandlers>={}){
 const req=new Request('https://paper.example/mcp',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 const r=await handleMcpRequest(req,handlers(overrides));
 return {status:r.status,data:await r.json() as any};
}
it('implements standard MCP initialization and refuses unknown methods',async()=>{
 const init=await call('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}});
 expect(init.data.result.serverInfo.name).toBe('ecopiensa-deriv-demo-owner-gateway');
 expect(init.data.result.capabilities.tools).toBeDefined();
 const list=await call('tools/list');
 expect(list.data.result.tools.map((t:any)=>t.name)).toEqual([
  'get_demo_status','analyze_bot_signal','get_pending_demo_command',
  'request_demo_buy','cancel_demo_command'
 ]);
 expect((await call('not_existing')).data.error.code).toBe(-32601);
});
it('queues a demo buy for owner approval but never sends a broker order',async()=>{
 let count=0,side='';
 const approved=await call('tools/call',{name:'request_demo_buy',arguments:{direction:'AUTO',stakeCents:35}},
  {requestIntent:async x=>{count++;side=x.signal;
   return {status:'PENDING_OWNER_CONFIRMATION',requiresOwnerApproval:true,
    brokerOrders:0,accountType:'demo'};}});
 expect(count).toBe(1);
 expect(side).toBe('UP');
 expect(approved.data.result.structuredContent.brokerOrders).toBe(0);
 expect(approved.data.result.structuredContent.requiresOwnerApproval).toBe(true);
});
it('HOLD signals must never queue orders; wrong amounts and bad directions are rejected',async()=>{
 let n=0;
 const hold=await call('tools/call',{name:'request_demo_buy',arguments:{direction:'AUTO',stakeCents:35}},{
  getSignal:async()=>({direction:'HOLD',reason:'NO_VERIFIED_LIVE_BOT_SIGNAL',
    quoteAgeSeconds:null,source:'PUBLIC_R_100_BOT_ENGINE',valid:false}),
  requestIntent:async()=>{n++;return {brokerOrders:1};}
 });
 expect(n).toBe(0);
 expect(hold.data.result.structuredContent.status).toBe('HOLD');
 const old=await call('tools/call',{name:'request_demo_buy',arguments:{direction:'CALL',stakeCents:10}});
 expect(old.data.error.code).toBe(-32602);
 const invalid=await call('tools/call',{name:'request_demo_buy',arguments:{direction:'REAL',stakeCents:35}});
 expect(invalid.data.error.code).toBe(-32602);
});
it('cannot use batch RPC or arbitrary methods to bypass the predefined tools',async()=>{
 const req=new Request('https://paper.example/mcp',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify([{jsonrpc:'2.0',method:'tools/call',id:1,params:{name:'request_demo_buy'}}])});
 const r=await handleMcpRequest(req,handlers());
 expect((await r.json() as any).error.code).toBe(-32600);
 const arbitrary=await call('tools/call',{name:'execute_real_trade',arguments:{}});
 expect(arbitrary.data.error.code).toBe(-32602);
});
