// Deriv IA Trader v1.0. Node 20+, sin paquetes. Solo análisis; no operaciones.
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
const PORT=Number(process.env.PORT||8787), HOST=process.env.HOST||'127.0.0.1';
const ORIGINS=(process.env.ALLOWED_ORIGINS||'https://fundacionecopiensaevolution.github.io,http://localhost:8080,http://127.0.0.1:8080').split(',').map(s=>s.trim());
const TOKEN=process.env.ANALYSIS_ACCESS_TOKEN||'';
if(TOKEN.length<24){console.error('Configura ANALYSIS_ACCESS_TOKEN (>=24 caracteres). No lo publiques en GitHub.');process.exit(1);}
const CONFIG=[
{name:'OpenAI',key:'OPENAI_API_KEY',model:'OPENAI_MODEL',default:'gpt-4.1-mini'},
{name:'Gemini',key:'GEMINI_API_KEY',model:'GEMINI_MODEL',default:'gemini-2.5-flash'},
{name:'DeepSeek',key:'DEEPSEEK_API_KEY',model:'DEEPSEEK_MODEL',default:'deepseek-chat'},
{name:'Qwen',key:'QWEN_API_KEY',model:'QWEN_MODEL',default:'qwen-plus'}];
const hit=new Map();
function send(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));}
function same(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&timingSafeEqual(x,y);}
async function request(url,opts){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),10000);try{let res=await fetch(url,{...opts,signal:ctrl.signal});let obj=await res.json();if(!res.ok)throw Error('Proveedor respondió HTTP '+res.status);return obj;}finally{clearTimeout(timer);}}
function getStats(p){const d=p.slice(-15).map((x,i,a)=>i?x-a[i-1]:0).slice(1);const up=d.reduce((v,x)=>v+Math.max(0,x),0),down=d.reduce((v,x)=>v+Math.max(0,-x),0);return {last:p.at(-1),variationPercent:Number((100*(p.at(-1)/p[0]-1)).toFixed(5)),rsiApprox:Number((down===0?100:100-100/(1+up/down)).toFixed(2)),samples:p.length};}
function userPrompt(symbol,p){return 'Muestra histórica corta de ticks de Deriv enviada por el navegador (NO validada por el servidor). Mercado: '+symbol+'. Estadísticas: '+JSON.stringify(getStats(p))+'. Precios: '+JSON.stringify(p.slice(-50))+'. Devuelve exclusivamente JSON con {"decision":"UP|DOWN|HOLD","confidence":0.0,"reason":"explicación breve"}; usa HOLD para incertidumbre. No prometas retornos ni aconsejes operaciones reales o apalancamiento.';}
const system='Eres un analista prudente; señal experimental, jamás una orden real. Responde exclusivamente JSON.';
async function provider(c,prompt){
 const key=process.env[c.key],model=process.env[c.model]||c.default;
 if(c.name==='Gemini'){const obj=await request('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0,maxOutputTokens:300,responseMimeType:'application/json'}})});return obj.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('')||'';}
 const URLS={OpenAI:'https://api.openai.com/v1/chat/completions',DeepSeek:'https://api.deepseek.com/chat/completions',Qwen:'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions'};
 const obj=await request(URLS[c.name],{method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model,temperature:0,messages:[{role:'system',content:system},{role:'user',content:prompt}],max_tokens:300})});return obj.choices?.[0]?.message?.content||'';
}
function normalize(raw){let o;try{o=JSON.parse(String(raw||'').trim().replace(/^\x60{3}(?:json)?\s*/i,'').replace(/\s*\x60{3}$/,''));}catch(_){return {decision:'HOLD',confidence:0,reason:'La respuesta no es JSON válido.'};}const decision=['UP','DOWN','HOLD'].includes(o.decision)?o.decision:'HOLD';return {decision,confidence:typeof o.confidence==='number'&&Number.isFinite(o.confidence)?Math.max(0,Math.min(1,o.confidence)):0,reason:String(o.reason||'Sin explicación').slice(0,350)};}
http.createServer(async(req,res)=>{
 const origin=req.headers.origin||'',cors=ORIGINS.includes(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{};
 if(req.method==='OPTIONS'){if(!ORIGINS.includes(origin))return send(res,403,{error:'Origen no autorizado'});res.writeHead(204,{...cors,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-Analysis-Key'});return res.end();}
 if(req.method==='GET'&&req.url==='/api/health')return send(res,200,{service:'Deriv IA Trader — solo análisis',providers:CONFIG.map(x=>({name:x.name,configured:!!process.env[x.key]}))},cors);
 if(req.method!=='POST'||req.url!=='/api/analyze')return send(res,404,{error:'Ruta desconocida'},cors);
 if(!ORIGINS.includes(origin))return send(res,403,{error:'Origen no autorizado'},cors);
 if(!same(req.headers['x-analysis-key'],TOKEN))return send(res,401,{error:'Clave del servidor incorrecta'},cors);
 let id=req.socket.remoteAddress||'local',now=Date.now(),item=hit.get(id)||{from:now,count:0};
 if(now-item.from>3600000){item={from:now,count:0};}item.count++;hit.set(id,item);
 if(item.count>25)return send(res,429,{error:'Se excedió el límite de consultas por hora'},cors);
 try{
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>15000)throw Error('Solicitud demasiado grande');}
  const body=JSON.parse(raw),p=body?.prices,symbol=body?.symbol;
  if(!Array.isArray(p)||p.length<30||p.length>90||p.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<=0)||typeof symbol!=='string'||!/^[A-Za-z0-9_]{2,30}$/.test(symbol))throw Error('Precios o símbolo inválidos');
  const active=CONFIG.filter(x=>process.env[x.key]);
  if(!active.length)return send(res,200,{mode:'READ_ONLY',models:[],consensus:'HOLD',note:'No hay proveedores habilitados con sus claves de servidor',executedTrades:0},cors);
  const prompt=userPrompt(symbol,p);
  const results=await Promise.all(active.map(async c=>{try{return {provider:c.name,status:'ok',...normalize(await provider(c,prompt))};}catch(e){return {provider:c.name,status:'error',decision:'HOLD',confidence:0,reason:String(e.message).slice(0,140)};}}));
  const valid=results.filter(x=>x.status==='ok'),counts={UP:0,DOWN:0,HOLD:0};valid.forEach(x=>counts[x.decision]++);
  const consensus=valid.length>=2&&counts.UP>=2&&counts.UP>counts.DOWN&&counts.HOLD===0?'UP':valid.length>=2&&counts.DOWN>=2&&counts.DOWN>counts.UP&&counts.HOLD===0?'DOWN':'HOLD';
  return send(res,200,{mode:'READ_ONLY',dataSource:'precios suministrados por el navegador; servidor no confirma integridad',symbol,stats:getStats(p),models:results,consensus,note:'El consenso no es un predictor probado ni garantiza ganancia. Ninguna operación se envía a Deriv.',executedTrades:0},cors);
 }catch(e){return send(res,400,{error:String(e.message).slice(0,190)},cors);}
}).listen(PORT,HOST,()=>console.log('Servidor de análisis de solo lectura: http://'+HOST+':'+PORT));
