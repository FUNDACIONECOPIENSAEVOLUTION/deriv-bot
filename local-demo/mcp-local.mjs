// MCP local de Ecopiensa. Nunca expone secretos, tokens, compras reales ni retiro.
// Transporte Streamable HTTP limitado a loopback y protegido con Bearer privado.
export const MCP_PROTOCOL='2025-03-26';
export const MCP_TOOLS=[
 {name:'get_bot_status',description:'Estado de Ecopiensa, conexión DEMO y versión; sin credenciales.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'get_market_signals',description:'Señales SMA/RSI públicas con antigüedad de cada cotización.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'get_training_statistics',description:'Historial experimental de contratos DEMO, no modelo entrenado.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'get_walk_forward_validation',description:'Validación de modelo logístico DEMO con datos solo de liquidaciones anteriores, sin autorización de BUY, ni REAL.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'get_demo_orders',description:'Compras locales confirmadas, pendientes y P&L en la cuenta DEMO.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'get_demo_risk_status',description:'Pérdida neta diaria DEMO, exposición, pendientes y stop; solo lectura, sin BUY.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'get_demo_program_status',description:'Estado del programa 10x10 DEMO, tandas y P&L; solo lectura, sin BUY.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'request_demo_buy_review',description:'Deja UNA orden DEMO en revisión local con caducidad de 45 segundos; no envía BUY al broker. Solo símbolos validados por el motor y riesgo DEMO.',inputSchema:{type:'object',properties:{symbol:{type:'string',minLength:4,maxLength:12,pattern:'^(R_(10|25|50|75|100|500)|1HZ(10|50|75|100|500)V)$'},direction:{type:'string',enum:['CALL','PUT']},stakeCents:{type:'integer',enum:[35,50,75,90,100,200,500,1000]}},required:['symbol','direction','stakeCents'],additionalProperties:false}}
];
const rpcError=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
const rpcOk=(id,result)=>({jsonrpc:'2.0',id,result});
const resultText=x=>({content:[{type:'text',text:JSON.stringify(x)}],isError:false});
export async function dispatchMcp(message,handlers){
 if(!message||message.jsonrpc!=='2.0'||typeof message.method!=='string')
   return rpcError(message?.id??null,-32600,'Invalid Request');
 const id=message.id??null;
 if(message.method==='notifications/initialized')return null;
 if(message.method==='initialize'){
  return rpcOk(id,{protocolVersion:MCP_PROTOCOL,capabilities:{tools:{listChanged:false}},serverInfo:{name:'ecopiensa-deriv-demo-local',version:handlers.version()}});
 }
 if(message.method==='ping')return rpcOk(id,{});
 if(message.method==='tools/list')return rpcOk(id,{tools:MCP_TOOLS});
 if(message.method!=='tools/call')return rpcError(id,-32601,'Method not found');
 const name=message.params?.name,args=message.params?.arguments||{};
 if(!MCP_TOOLS.some(t=>t.name===name))return rpcError(id,-32602,'Unknown MCP tool');
 try{
  let result;
  if(name==='get_bot_status')result=handlers.status();
  if(name==='get_market_signals')result=handlers.signals();
  if(name==='get_training_statistics')result=handlers.training();
  if(name==='get_walk_forward_validation')result=handlers.walkForward();
  if(name==='get_demo_orders')result=handlers.orders();
  if(name==='get_demo_risk_status')result=handlers.risk();
  if(name==='get_demo_program_status')result=handlers.program();
  if(name==='request_demo_buy_review'){
   if(!args||typeof args.symbol!=='string'||!/^(R_(10|25|50|75|100|500)|1HZ(10|50|75|100|500)V)$/.test(args.symbol)
      ||!['CALL','PUT'].includes(args.direction)||![35,50,75,90,100,200,500,1000].includes(args.stakeCents))
     return rpcError(id,-32602,'Invalid demo request');
   result=await handlers.request(args);
  }
  return rpcOk(id,resultText(result));
 }catch(error){
  const code=String(error?.message||'MCP_OPERATION_FAILED').replace(/[^A-Za-z0-9_]/g,'').slice(0,70);
  return rpcOk(id,{content:[{type:'text',text:JSON.stringify({error:code||'MCP_OPERATION_FAILED',brokerOrders:0})}],isError:true});
 }
}
