// MCP local de Ecopiensa. No publica tokens, no habilita REAL ni envía BUY.
// Transportes y autorización se verifican en server.mjs (solo loopback).
export const MCP_PROTOCOL='2025-03-26';
const EMPTY={type:'object',properties:{},additionalProperties:false};
export const MCP_TOOLS=[
 {name:'get_bot_status',description:'Estado del servidor y cuenta DEMO sin credenciales.',inputSchema:EMPTY},
 {name:'get_market_signals',description:'Precios e indicadores por indice, no recomienda compras.',inputSchema:EMPTY},
 {name:'get_training_statistics',description:'Estadisticas de observaciones experimentales.',inputSchema:EMPTY},
 {name:'get_walk_forward_validation',description:'Validacion temporal solo lectura y comparacion con referencia.',inputSchema:EMPTY},
 {name:'get_candle_pattern_validation',description:'Patrones OHLC anteriores a compras y validacion en sombra.',inputSchema:EMPTY},
 {name:'get_demo_orders',description:'Contratos DEMO con PnL, sin credenciales.',inputSchema:EMPTY},
 {name:'get_demo_risk_status',description:'Riesgo y stop DEMO vigente; sin ejecutar orden.',inputSchema:EMPTY},
 {name:'get_demo_program_status',description:'Programas DEMO y tandas vigentes; solo lectura.',inputSchema:EMPTY},
 {name:'get_demo_profitability_by_strategy',description:'Rentabilidad de liquidaciones reales DEMO, ROI, holdout temporal por indice, politica y horizonte.',inputSchema:EMPTY},
 {name:'get_demo_shadow_strategies',description:'Comparacion de RSI, MACD, EMA, Momentum y consenso por indice 5/10; direcciones de tick, NO compras.',inputSchema:EMPTY},
 {name:'get_demo_decision_desk',description:'Ranking y evidencia por indice/horizonte. Observacion sin cotizacion oficial, NO recomendacion de comprar.',inputSchema:EMPTY},
 {name:'request_demo_buy_review',description:'UNA intencion DEMO para aprobacion HUMANA en el PC en 45 segundos. MCP nunca ejecuta BUY. Para modo de consenso maximo USD 0.50, modo estricto maximo USD 1.',inputSchema:{
  type:'object',properties:{
   symbol:{type:'string',minLength:4,maxLength:12,pattern:'^(R_(10|25|50|75|100|500)|1HZ(10|25|50|75|100|500)V)$'},
   direction:{type:'string',enum:['CALL','PUT']},
   stakeCents:{type:'integer',enum:[35,50,75,90,100]},
   durationTicks:{type:'integer',enum:[5,10]},
   modelMode:{type:'string',enum:['LEGACY_60_CANDLES','PREDICTIVE_5_10','DEMO_136_CONSENSUS_5_10']}
  },required:['symbol','direction','stakeCents'],additionalProperties:false}}
];
const rpcError=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
const rpcOk=(id,result)=>({jsonrpc:'2.0',id,result});
const resultText=x=>({content:[{type:'text',text:JSON.stringify(x)}],isError:false});
const DEMO_MARKET=/^(R_(10|25|50|75|100|500)|1HZ(10|25|50|75|100|500)V)$/;
function validateBuyRequest(args){
 if(!args||typeof args!=='object'||Array.isArray(args)||
    Object.keys(args).some(k=>!['symbol','direction','stakeCents','durationTicks','modelMode'].includes(k))||
    typeof args.symbol!=='string'||!DEMO_MARKET.test(args.symbol)||
    !['CALL','PUT'].includes(args.direction)||
    ![35,50,75,90,100].includes(args.stakeCents))return null;
 const durationTicks=args.durationTicks??5,modelMode=args.modelMode??'LEGACY_60_CANDLES';
 if(![5,10].includes(durationTicks)||
    !['LEGACY_60_CANDLES','PREDICTIVE_5_10','DEMO_136_CONSENSUS_5_10'].includes(modelMode)||
    (modelMode==='LEGACY_60_CANDLES'&&durationTicks!==5)||
    (modelMode==='DEMO_136_CONSENSUS_5_10'&&args.stakeCents>50)||
    (modelMode==='PREDICTIVE_5_10'&&args.stakeCents>100))return null;
 return {symbol:args.symbol,direction:args.direction,stakeCents:args.stakeCents,
  durationTicks,modelMode};
}
export async function dispatchMcp(message,handlers){
 if(!message||message.jsonrpc!=='2.0'||typeof message.method!=='string')
  return rpcError(message?.id??null,-32600,'Invalid Request');
 const id=message.id??null;
 if(message.method==='notifications/initialized')return null;
 if(message.method==='initialize')
  return rpcOk(id,{protocolVersion:MCP_PROTOCOL,capabilities:{tools:{listChanged:false}},
   serverInfo:{name:'ecopiensa-deriv-demo-local',version:handlers.version()}});
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
  if(name==='get_candle_pattern_validation')result=handlers.candlePatterns();
  if(name==='get_demo_orders')result=handlers.orders();
  if(name==='get_demo_risk_status')result=handlers.risk();
  if(name==='get_demo_program_status')result=handlers.program();
  if(name==='get_demo_profitability_by_strategy')result=handlers.profitability();
  if(name==='get_demo_shadow_strategies')result=handlers.shadowStrategies();
  if(name==='get_demo_decision_desk')result=handlers.decisionDesk();
  if(name==='request_demo_buy_review'){
   const valid=validateBuyRequest(args);
   if(!valid)return rpcError(id,-32602,'Invalid demo request');
   result=await handlers.request(valid);
  }
  return rpcOk(id,resultText(result));
 }catch(error){
  const code=String(error?.message||'MCP_OPERATION_FAILED')
    .replace(/[^A-Za-z0-9_]/g,'').slice(0,70);
  return rpcOk(id,{content:[{type:'text',
   text:JSON.stringify({error:code||'MCP_OPERATION_FAILED',brokerOrders:0})}],
   isError:true});
 }
}
