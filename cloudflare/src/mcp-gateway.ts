/**
 * Minimal stateless Streamable HTTP MCP JSON-RPC adapter for Ecopiensa Worker.
 * IMPORTANT: Requires a separate MCP_BRIDGE_TOKEN secret, never the owner's
 * browser ADMIN_TOKEN, Deriv OAuth token, OTP or account credentials.
 * THIS IS A STAGING TRANSPORT, not an OAuth 2.1 provider for ChatGPT.
 *
 * Tools never send buy/sell instructions to Deriv. request_demo_buy creates a
 * single expiring intent for the owner's separate in-browser confirmation.
 */
export type DemoSide='UP'|'DOWN';
export type McpSignal={direction:'UP'|'DOWN'|'HOLD';reason:string;quoteAgeSeconds:number|null;
  source:string;valid:boolean;indicator?:{rsi:number|null;fast:number|null;slow:number|null;volatility:number|null}};
export type McpHandlers={
  getStatus:()=>Promise<unknown>;
  getSignal:()=>Promise<McpSignal>;
  getIntent:()=>Promise<unknown>;
  requestIntent:(p:{signal:DemoSide;stakeCents:number;source:'MCP_OWNER_REVIEW'})=>Promise<unknown>;
  cancelIntent:(id:string)=>Promise<unknown>;
};
const tools=[
 {name:'get_demo_status',description:'Read the demo account and recorded contracts. Never executes orders.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'analyze_bot_signal',description:'Get the bot current R_100 signal UP/DOWN/HOLD with freshness. HOLD means do not buy.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'get_pending_demo_command',description:'Read pending owner approval for a DEMO order. No broker order.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'request_demo_buy',description:'QUEUE ONE demo-only CALL or PUT instruction for manual approval in the private Ecopiensa Worker panel. Does NOT execute Deriv buy. AUTO uses live bot signal; HOLD rejects the request.',inputSchema:{type:'object',properties:{
   direction:{type:'string',enum:['AUTO','CALL','PUT']},
   stakeCents:{type:'integer',enum:[35,50,75,100]}
  },required:['direction','stakeCents'],additionalProperties:false}},
 {name:'cancel_demo_command',description:'Cancel a queued demo order before its execution. Does not cancel or sell any contract already bought.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}}
] as const;
const headers={
 'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'MCP-Protocol-Version':'2025-03-26'
};
const rpc=(id:string|number|null,result:unknown)=>Response.json({jsonrpc:'2.0',id,result},{headers});
const error=(id:string|number|null,code:number,message:string,status=200)=>
 Response.json({jsonrpc:'2.0',id,error:{code,message}},{status,headers});
const result=(value:unknown)=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:
 typeof value==='object'&&value!==null?value:{value}});
function safeId(x:unknown):string|number|null{
 if(typeof x==='string'&&x.length<=80)return x;
 if(typeof x==='number'&&Number.isSafeInteger(x))return x;
 return null;
}
export async function handleMcpRequest(req:Request,handlers:McpHandlers):Promise<Response>{
 if(req.method!=='POST')return new Response(null,{status:405,headers:{...headers,Allow:'POST'}});
 const raw=await req.text();
 if(raw.length>4096)return error(null,-32600,'REQUEST_TOO_LARGE',413);
 let input:unknown;
 try{input=JSON.parse(raw);}catch{return error(null,-32700,'PARSE_ERROR');}
 if(!input||typeof input!=='object'||Array.isArray(input))
   return error(null,-32600,'INVALID_REQUEST');
 const q=input as Record<string,unknown>,id=safeId(q.id);
 if(q.jsonrpc!=='2.0'||typeof q.method!=='string'||q.method.length>80)
   return error(id,-32600,'INVALID_REQUEST');
 if(q.method==='notifications/initialized')return new Response(null,{status:202,headers});
 if(id===null)return error(null,-32600,'REQUEST_ID_REQUIRED');
 if(q.method==='initialize')return rpc(id,{
  protocolVersion:'2025-03-26',
  capabilities:{tools:{listChanged:false}},
  serverInfo:{name:'ecopiensa-deriv-demo-owner-gateway',version:'0.1.0'}
 });
 if(q.method==='ping')return rpc(id,{});
 if(q.method==='tools/list')return rpc(id,{tools});
 if(q.method!=='tools/call')return error(id,-32601,'METHOD_NOT_FOUND');
 const p=q.params;
 if(!p||typeof p!=='object'||Array.isArray(p))return error(id,-32602,'INVALID_PARAMS');
 const o=p as Record<string,unknown>;
 const a=o.arguments??{};
 if(!a||typeof a!=='object'||Array.isArray(a))return error(id,-32602,'INVALID_TOOL_ARGUMENTS');
 const args=a as Record<string,unknown>;
 const name=o.name;
 try{
  switch(name){
   case 'get_demo_status':
    if(Object.keys(args).length)return error(id,-32602,'UNEXPECTED_ARGUMENTS');
    return rpc(id,result(await handlers.getStatus()));
   case 'analyze_bot_signal':
    if(Object.keys(args).length)return error(id,-32602,'UNEXPECTED_ARGUMENTS');
    return rpc(id,result(await handlers.getSignal()));
   case 'get_pending_demo_command':
    if(Object.keys(args).length)return error(id,-32602,'UNEXPECTED_ARGUMENTS');
    return rpc(id,result(await handlers.getIntent()));
   case 'request_demo_buy':{
    if(Object.keys(args).some(k=>!['direction','stakeCents'].includes(k))
      ||!['AUTO','CALL','PUT'].includes(String(args.direction))
      ||![35,50,75,100].includes(Number(args.stakeCents))
      ||typeof args.stakeCents!=='number')return error(id,-32602,'INVALID_TRADE_PARAMETERS');
    const live=await handlers.getSignal();
    let selected:DemoSide;
    if(args.direction==='AUTO'){
      if(!live.valid||live.direction==='HOLD')
        return rpc(id,result({status:'HOLD',reason:live.reason,queued:false,brokerOrders:0}));
      selected=live.direction;
    }else selected=args.direction==='CALL'?'UP':'DOWN';
    return rpc(id,result(await handlers.requestIntent({
      signal:selected,stakeCents:args.stakeCents,source:'MCP_OWNER_REVIEW'
    })));
   }
   case 'cancel_demo_command':
    if(Object.keys(args).length!==1||typeof args.id!=='string'
      ||!/^[0-9a-f-]{36}$/i.test(args.id))return error(id,-32602,'INVALID_COMMAND_ID');
    return rpc(id,result(await handlers.cancelIntent(args.id)));
   default:return error(id,-32602,'UNKNOWN_TOOL');
  }
 }catch(e){
   const raw=e instanceof Error?e.message:'UNKNOWN';
   const code=/^(?:DERIV|DEMO|MCP)_[A-Z0-9_]{1,80}$/.test(raw)?raw:'MCP_TOOL_NOT_AVAILABLE';
   return rpc(id,{content:[{type:'text',text:code}],isError:true});
 }
}
