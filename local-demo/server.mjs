// ECOPIENSA · Deriv DEMO local — single manual broker DEMO approval; REAL strictly blocked.
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {readTraining} from './training.mjs';
import {spawn} from 'node:child_process';
import {dispatchMcp} from './mcp-local.mjs';
import {createDemoTrading} from './demo-trading.mjs';
import {createDemoBurst} from './demo-burst.mjs';
import {computeMarketAnalysis,HISTORY_TICKS,MAX_TICKS} from './market-analysis.mjs';

const HOME=dirname(fileURLToPath(import.meta.url));
const DATA=process.env.ECOPIENSA_DATA_DIR||join(HOME,'data');
const HOST='127.0.0.1',PORT=Number(process.env.PORT||8765);
const startedAt=Date.now();
const BASE=`http://localhost:${PORT}`;
const API='https://api.derivws.com/trading/v1/options/accounts';
const AUTH='https://auth.deriv.com/oauth2/';
const PUBLIC_WS='wss://api.derivws.com/trading/v1/options/ws/public';
// Candidatos, NO símbolos autorizados a operar hasta validarlos con active_symbols.
const SYMBOLS=Object.freeze(['R_10','R_25','R_50','R_75','R_100',
 '1HZ10V','1HZ50V','1HZ75V','1HZ100V','1HZ500V','R_500']);
const EXTERNAL_NAMES=Object.freeze(['EUR/USD','USD/JPY','Oro (XAU/USD)','Bitcoin (BTC/USD)']);
const STAKES=new Set([0.35,0.50,0.75,0.90,1]);
const now=()=>Math.floor(Date.now()/1000);
const base64=x=>Buffer.from(x).toString('base64url');
const sha256=x=>createHash('sha256').update(x).digest();
const publicPath=join(HOME,'public');
const trainingFile=join(DATA,'historico-demo.csv');
const localVersion=()=>{try{return JSON.parse(readFileSync(join(HOME,'local-release.json'),'utf8')).version;}catch{return '11.7-preview';}};
function githubReleaseStatus(){
 try{const r=JSON.parse(readFileSync(join(DATA,'github-release-status.json'),'utf8'));
  return {githubVersion:/^\d+\.\d$/.test(r.version)?r.version:null,githubStatus:r.status==='offline'?'offline':'checked'};
 }catch{return {githubVersion:null,githubStatus:'unknown'};}
}

if(!Number.isInteger(PORT)||PORT<1024||PORT>65535)throw Error('PORT no válido');
mkdirSync(DATA,{recursive:true,mode:0o700});
const keyPath=join(DATA,'.key-local.bin');
if(!existsSync(keyPath)){
 try{writeFileSync(keyPath,randomBytes(32),{flag:'wx',mode:0o600});}
 catch(e){if(e.code!=='EEXIST')throw e;}
}
try{chmodSync(keyPath,0o600);}catch{}
const KEY=readFileSync(keyPath);
if(KEY.length!==32)throw Error('Clave local corrupta: no iniciar sin recuperar copia de seguridad');
const db=new DatabaseSync(join(DATA,'demo-local.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=4000;
 CREATE TABLE IF NOT EXISTS state (name TEXT PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL);`);
const get=name=>{const row=db.prepare('SELECT data FROM state WHERE name=?').get(name);return row?JSON.parse(row.data):null;};
const put=(name,data)=>db.prepare('INSERT INTO state(name,data) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET data=excluded.data').run(name,JSON.stringify(data));
const del=name=>db.prepare('DELETE FROM state WHERE name=?').run(name);
const audit=(action,detail)=>db.prepare('INSERT INTO audit(at,action,detail) VALUES(?,?,?)').run(now(),action,detail);
function seal(obj){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',KEY,iv);const bytes=Buffer.concat([c.update(JSON.stringify(obj),'utf8'),c.final()]);return {iv:base64(iv),data:base64(bytes),tag:base64(c.getAuthTag())};}
function unseal(obj){if(!obj?.iv||!obj?.data||!obj?.tag)throw Error('CREDENCIALES_NO_DISPONIBLES');const d=createDecipheriv('aes-256-gcm',KEY,Buffer.from(obj.iv,'base64url'));d.setAuthTag(Buffer.from(obj.tag,'base64url'));return JSON.parse(Buffer.concat([d.update(Buffer.from(obj.data,'base64url')),d.final()]).toString('utf8'));}
const safeEq=(a,b)=>{const aa=sha256(String(a)),bb=sha256(String(b));return timingSafeEqual(aa,bb);};
function answer(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(obj));}
function html(res,content,type){res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"});res.end(content);}
function errorCode(err){const s=String(err?.message||err);return /^DERIV_HTTP_[0-9]{3}$/.test(s)?s:/^([A-Z][A-Z0-9_]{2,65})$/.test(s)?s:'SOLICITUD_FALLIDA';}
async function readBody(req){let size=0,body='';for await(const part of req){size+=part.length;if(size>4096)throw Error('CUERPO_MUY_GRANDE');body+=part;}try{return JSON.parse(body||'{}');}catch{throw Error('JSON_INVALIDO');}}
async function boundedFetch(url,options={}){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),9000);try{const r=await fetch(url,{...options,signal:controller.signal,redirect:'error',cache:'no-store'});if(!r.ok)throw Error('DERIV_HTTP_'+r.status);const text=await r.text();if(text.length>60000)throw Error('RESPUESTA_EXCESIVA');return JSON.parse(text);}finally{clearTimeout(timeout);}}
function selectAccount(data,exact=null){const rows=Array.isArray(data?.data)?data.data:[];const a=rows.find(x=>x?.account_type==='demo'&&x?.currency==='USD'&&x?.status==='active'&&typeof x.account_id==='string'&&(!exact||x.account_id===exact)&&Number.isFinite(Number(x.balance)));if(!a)throw Error('DERIV_DEMO_USD_NO_ENCONTRADA');return {accountId:a.account_id,balance:Number(a.balance),currency:'USD',checkedAt:now()};}
function status(){
 const account=get('account'),encrypted=get('credentials');
 let auth=null,authCorrupt=false;
 if(encrypted){try{auth=unseal(encrypted);}catch{authCorrupt=true;}}
 const connected=!!auth&&auth.expiresAt>now()&&!!account&&auth.accountId===account.accountId;
 return {mode:'DERIV_DEMO_LOCAL',version:'v'+localVersion(),backend:'Windows Node.js',
  connected,authorizationExpired:!!auth&&auth.expiresAt<=now(),
  authorizationMethod:connected?(auth.mode==='PAT'?'PAT':'OAuth 2.0'):null,
  authorizationCorrupt:authCorrupt,
  updatePending:existsSync(join(DATA,'actualizacion-pendiente.txt')),
  ...githubReleaseStatus(),
  appId:get('app_id')||'',
  account:account?{label:'DEMO · …'+account.accountId.slice(-4),balance:account.balance,checkedAt:account.checkedAt,currency:'USD'}:null,
  brokerBalanceVerifiedRecently:connected&&now()-account.checkedAt<=60,
  realEnabled:false,buyEnabled:connected,manualDemoOnly:true,mcpLocalOnly:true,source:'Deriv oficial, no PAPER'};
}
function brokerHeaders(c){
 const headers={Authorization:'Bearer '+c.token};
 if(c.mode==='PAT'){
  const id=String(c.appId||get('app_id')||'');
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw Error('APP_ID_PAT_INVALIDO');
  headers['Deriv-App-ID']=id;
 }
 return headers;
}

async function credentials(){const encrypted=get('credentials');if(!encrypted)throw Error('AUTORIZACION_REQUERIDA');const c=unseal(encrypted);if(c.expiresAt<=now())throw Error('AUTORIZACION_CADUCADA');return c;}
function otpUrl(obj){const s=obj?.data?.url;if(typeof s!=='string'||s.length>4096)throw Error('OTP_INVALIDO');const u=new URL(s);if(u.protocol!=='wss:'||u.hostname!=='api.derivws.com'||u.port||u.pathname!=='/trading/v1/options/ws/demo'||u.searchParams.size!==1||!u.searchParams.get('otp'))throw Error('OTP_NO_DEMO');return u.href;}
async function wsReadOnly(request,expected){const c=await credentials(),id=encodeURIComponent(c.accountId);const otp=await boundedFetch(`${API}/${id}/otp`,{method:'POST',headers:brokerHeaders(c)});const url=otpUrl(otp);
 return new Promise((resolve,reject)=>{const ws=new WebSocket(url);let done=false;const timeout=setTimeout(()=>finish(Error('DERIV_WS_TIMEOUT')),10000);function finish(err,value){if(done)return;done=true;clearTimeout(timeout);try{ws.close();}catch{}if(err)reject(err);else resolve(value);}
 ws.addEventListener('open',()=>{try{ws.send(JSON.stringify(request));}catch{finish(Error('WS_SEND_ERROR'));}});
 ws.addEventListener('message',ev=>{try{if(typeof ev.data!=='string'||ev.data.length>100000)throw Error('DERIV_WS_PAYLOAD_INVALID');const x=JSON.parse(ev.data);if(x.error||x.errors)throw Error('DERIV_WS_RECHAZADO');if(x.msg_type===expected&&x.req_id===request.req_id)finish(null,x);}catch(e){finish(e);}});
 ws.addEventListener('error',()=>finish(Error('DERIV_WS_ERROR')));ws.addEventListener('close',()=>finish(Error('DERIV_WS_CLOSED')));});}
let lastBalanceRefresh=0,lastProfitRefresh=0,lastQuote=0;
async function refreshBalance(){if(Date.now()-lastBalanceRefresh<10000)throw Error('ESPERAR_10S_BALANCE');lastBalanceRefresh=Date.now();const c=await credentials();const row=selectAccount(await boundedFetch(API,{headers:brokerHeaders(c)}),c.accountId);put('account',row);audit('BALANCE_DEMO','REST oficial verificado');return status();}
async function recentProfit(){if(Date.now()-lastProfitRefresh<10000)throw Error('ESPERAR_10S_HISTORIAL');lastProfitRefresh=Date.now();const result=await wsReadOnly({profit_table:1,limit:50,sort:'DESC',req_id:908},'profit_table');const t=result.profit_table?.transactions||[];if(!Array.isArray(t))throw Error('HISTORIAL_FORMATO_INVALIDO');const trades=t.slice(0,50).map(x=>({contractId:String(x.contract_id??''),symbol:String(x.underlying_symbol||x.symbol||''),contractType:String(x.contract_type||''),purchaseTime:Number(x.purchase_time||0),buy:Number(x.buy_price||0),sell:Number(x.sell_price||0),payout:Number(x.payout||0),profit:Number(x.sell_price||0)-Number(x.buy_price||0)}));audit('HISTORIAL_DEMO','50 contratos máximo; lectura, sin BUY');return {source:'DERIV_PROFIT_TABLE',independentlyConfirmedBy:'Deriv API',trades};}
async function quoteDemo(body){const symbol=String(body.symbol||''),direction=String(body.direction||''),stake=Number(body.stake);if(!SYMBOLS.includes(symbol)||!market.get(symbol)?.available||!['CALL','PUT'].includes(direction)||!STAKES.has(stake))throw Error('PARAMETROS_INVALIDOS');if(Date.now()-lastQuote<3000)throw Error('ESPERAR_3S_COTIZACION');lastQuote=Date.now();const started=performance.now();const msg=await wsReadOnly({proposal:1,amount:stake,basis:'stake',contract_type:direction,currency:'USD',duration:5,duration_unit:'t',underlying_symbol:symbol,req_id:907},'proposal');const p=msg.proposal||{};if(!Number.isFinite(Number(p.ask_price))||!Number.isFinite(Number(p.payout)))throw Error('PROPUESTA_INVALIDA');audit('COTIZACION_DEMO',symbol+' '+direction);return {symbol,direction,stake,askPrice:Number(p.ask_price),payout:Number(p.payout),proposalRttMs:Math.round(performance.now()-started),noOrders:true,expires:'No reutilizar una propuesta antigua'};}
const market=new Map(SYMBOLS.map(symbol=>[symbol,{symbol,ticks:[],epoch:0,quote:0,receivedAtMs:0,available:false}]));
const watchSymbols=new Map(); // Precios externos de SOLO LECTURA, nunca fuente de BUY sintético.
const watchlist=new Map(EXTERNAL_NAMES.map(name=>[name,{name,symbol:null,quote:null,epoch:null,available:false,source:'Deriv public'}]));
let publicConnected=false,publicLastError='SIN_CONECTAR',backoff=1000;
const streams=new Set();
const MAX_STREAMS=4;
// Heartbeats are local SSE comments; they do NOT contact the broker.
const heartbeat=setInterval(()=>{for(const res of [...streams]){
 try{res.write(': ecopiensa vivo\n\n');}catch{streams.delete(res);}
}},20000);
heartbeat.unref();
function snapshot(m){
 const age=m.receivedAtMs?Math.round(performance.now()-m.receivedAtMs):null;
 const a=computeMarketAnalysis(m.ticks,{connected:publicConnected&&m.available,ageReceivedMs:age});
 return {symbol:m.symbol,available:m.available,quote:m.quote,epoch:m.epoch,
  ageReceivedMs:age,sampleSize:m.ticks.length,...a,
  source:'Deriv WebSocket: ticks históricos y en vivo; solo DEMO',
  trading:'synthetic-demo-only'};
}
function pushMarket(m){
 const line=`data: ${JSON.stringify(snapshot(m))}\n\n`;
 for(const response of streams){try{response.write(line);}catch{streams.delete(response);}}
}
function externalSnapshot(){
 return [...watchlist.values()].map(x=>({
  ...x,ageSeconds:x.epoch?Math.max(0,now()-x.epoch):null,tradableFromThisPanel:false
 }));
}
function configureSymbols(ws,records){
 const available=new Set(records.map(x=>x?.symbol).filter(Boolean));
 SYMBOLS.forEach((symbol,i)=>{
  const m=market.get(symbol);m.available=available.has(symbol);
  if(!m.available)return;
  ws.send(JSON.stringify({ticks_history:symbol,count:HISTORY_TICKS,end:'latest',style:'ticks',req_id:400+i}));
  ws.send(JSON.stringify({ticks:symbol,subscribe:1,req_id:500+i}));
 });
 const groups=[
  [/^(EUR\/USD|Euro\/US Dollar)$/i,'EUR/USD'],
  [/^(USD\/JPY|US Dollar\/Japanese Yen)$/i,'USD/JPY'],
  [/Gold|XAU\/USD|XAUUSD/i,'Oro (XAU/USD)'],
  [/Bitcoin|BTC\/USD|BTCUSD/i,'Bitcoin (BTC/USD)']
 ];
 let idx=0;
 for(const [expression,name] of groups){
  const record=records.find(x=>typeof x?.symbol==='string'&&
    expression.test(String(x.display_name||x.symbol)));
  const entry=watchlist.get(name);
  if(!record){entry.available=false;continue;}
  entry.symbol=record.symbol;entry.available=true;
  watchSymbols.set(record.symbol,name);
  ws.send(JSON.stringify({ticks:record.symbol,subscribe:1,req_id:800+idx++}));
 }
}
function publicSocket(){
 const ws=new WebSocket(PUBLIC_WS);let wasOpen=false;
 ws.addEventListener('open',()=>{
  wasOpen=true;publicConnected=true;publicLastError='';backoff=1000;
  ws.send(JSON.stringify({active_symbols:'brief',req_id:200}));
 });
 ws.addEventListener('message',ev=>{try{
  if(typeof ev.data!=='string'||ev.data.length>400000)return;
  const o=JSON.parse(ev.data);
  if(o.error||o.errors){publicLastError='DERIV_PUBLIC_RECHAZADO';return;}
  if(o.msg_type==='active_symbols'&&Array.isArray(o.active_symbols)){
   configureSymbols(ws,o.active_symbols);return;
  }
  if(o.msg_type==='history'){
   const symbol=o.echo_req?.ticks_history||SYMBOLS[o.req_id-400];
   const m=market.get(symbol);if(!m||!m.available)return;
   const prices=o.history?.prices||[],times=o.history?.times||[];
   if(prices.length!==times.length||prices.length>HISTORY_TICKS)return;
   const rows=[];
   for(let i=0;i<prices.length;i++){
    const price=Number(prices[i]),epoch=Number(times[i]);
    if(Number.isFinite(price)&&price>0&&Number.isSafeInteger(epoch))rows.push({price,epoch});
   }
   // Conservar cualquier tick posterior recibido mientras llegaba el historial.
   const future=m.ticks.filter(x=>rows.length&&x.epoch>rows.at(-1).epoch);
   m.ticks=[...rows,...future].slice(-MAX_TICKS);
   if(m.ticks.length){m.epoch=m.ticks.at(-1).epoch;m.quote=m.ticks.at(-1).price;
    m.receivedAtMs=performance.now();}
   pushMarket(m);
  }
  if(o.msg_type==='tick'){
   const t=o.tick||{},symbol=t.symbol||o.echo_req?.ticks;
   const price=Number(t.quote),epoch=Number(t.epoch);
   if(!Number.isFinite(price)||price<=0||!Number.isSafeInteger(epoch))return;
   const watchName=watchSymbols.get(symbol);
   if(watchName){Object.assign(watchlist.get(watchName),{quote:price,epoch});return;}
   const m=market.get(symbol);
   if(!m||!m.available||(m.epoch&&epoch<m.epoch))return;
   m.epoch=epoch;m.quote=price;m.receivedAtMs=performance.now();
   m.ticks.push({price,epoch});if(m.ticks.length>MAX_TICKS)m.ticks.shift();
   pushMarket(m);
  }
 }catch{publicLastError='MENSAJE_MERCADO_INVALIDO';}});
 function lost(){
  if(ws._disconnected)return;ws._disconnected=true;publicConnected=false;
  publicLastError=wasOpen?'CONEXION_PUBLICA_CERRADA':'NO_PUDO_CONECTAR';
  for(const m of market.values())m.available=false;
  for(const w of watchlist.values()){w.available=false;w.epoch=null;w.quote=null;}
  watchSymbols.clear();
  setTimeout(publicSocket,backoff);backoff=Math.min(30000,backoff*2);
 }
 ws.addEventListener('close',lost);
 ws.addEventListener('error',()=>{try{ws.close();}catch{}lost();});
}
if(process.env.ECOPIENSA_NO_MARKET!=='1')publicSocket();
// Local-only SQLite DEMO execution; every pending/unknown purchase blocks any further BUY.
const trading=createDemoTrading({
 db,getAccount:()=>get('account'),getCredentials:credentials,brokerHeaders,
 accountLookup:async(c,id)=>selectAccount(await boundedFetch(API,{headers:brokerHeaders(c)}),id),
 otpLookup:async c=>otpUrl(await boundedFetch(API+'/'+encodeURIComponent(c.accountId)+'/otp',
  {method:'POST',headers:brokerHeaders(c)})),
 marketSnapshot:symbol=>{const entry=market.get(symbol);return entry?snapshot(entry):null;},audit
});
// A dedicated MCP access key is generated on the PC, never in the public repo.
const mcpKeyPath=join(DATA,'.mcp-local-secret');
if(!existsSync(mcpKeyPath)){
 try{writeFileSync(mcpKeyPath,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});}
 catch(error){if(error.code!=='EEXIST')throw error;}
}
const mcpKey=readFileSync(mcpKeyPath,'utf8').trim();
if(!/^[a-f0-9]{64}$/.test(mcpKey))throw Error('MCP_KEY_INVALID');
const mcpAuthPath=join(DATA,'.mcp-local-authorization');
if(!existsSync(mcpAuthPath)){writeFileSync(mcpAuthPath,'Bearer '+mcpKey,{mode:0o600,flag:'wx'});}
const bursts=createDemoBurst({
 db,trading,marketSnapshot:symbol=>{const item=market.get(symbol);return item?snapshot(item):null;},
 refreshAccount:async()=>{
  const c=await credentials();
  const a=selectAccount(await boundedFetch(API,{headers:brokerHeaders(c)}),c.accountId);
  put('account',a);return a;
 },getAccount:()=>get('account'),audit
});
const isMaintenance=()=>existsSync(join(DATA,'actualizacion-en-curso.flag'));
const mcpHandlers={
 version:()=>localVersion(),
 status:()=>({...status(),orders:trading.getSummary()}),
 signals:()=>[...market.values()].map(snapshot),
 training:()=>readTraining(trainingFile),
 orders:()=>trading.getSummary(),
 request:args=>{if(isMaintenance())throw Error('LOCAL_UPDATE_IN_PROGRESS');return trading.requestIntent({...args,source:'MCP_OWNER_REVIEW'});}
};
let server;
server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;const host=req.headers.host;
 if(![`localhost:${PORT}`,`127.0.0.1:${PORT}`].includes(host))return answer(res,403,{error:'HOST_LOCAL_REQUERIDO'});
 const u=new URL(req.url||'/',BASE),path=u.pathname;
 try{
  if(req.method==='GET'&&path==='/'){return html(res,readFileSync(join(publicPath,'index.html')),'text/html; charset=utf-8');}
  if(req.method==='GET'&&path==='/app.js'){return html(res,readFileSync(join(publicPath,'app.js')),'text/javascript; charset=utf-8');}
  if(req.method==='GET'&&path==='/style.css'){return html(res,readFileSync(join(publicPath,'style.css')),'text/css; charset=utf-8');}
  if(req.method==='GET'&&path==='/api/training')return answer(res,200,readTraining(trainingFile));
   if(req.method==='GET'&&path==='/api/demo/orders')return answer(res,200,trading.getSummary());
   if(req.method==='GET'&&path==='/api/demo/burst/status')return answer(res,200,bursts.status());
   if(req.method==='GET'&&(path==='/api/demo/orders.csv'||path==='/api/demo/burst.csv')){
    const csv=trading.exportCsv(path.endsWith('/burst.csv')?'last-burst':'all');
    const filename=path.endsWith('burst.csv')?'ecopiensa-ultima-tanda-demo.csv':'ecopiensa-historial-demo.csv';
    res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Cache-Control':'no-store',
     'X-Content-Type-Options':'nosniff','Content-Disposition':'attachment; filename="'+filename+'"'});
    res.end(csv);return;
   }
   if(req.method==='GET'&&path==='/api/mcp/info')return answer(res,200,{
    endpoint:'http://127.0.0.1:'+PORT+'/mcp',connectedToChatGPT:false,
    localOnly:true,authentication:'Bearer local + Secure MCP Tunnel',realEnabled:false
   });
   if(path==='/mcp'&&req.method==='POST'){
    const auth=String(req.headers.authorization||'');
    if(!auth.startsWith('Bearer ')||!safeEq(auth.slice(7),mcpKey))return answer(res,401,{error:'MCP_AUTH_REQUIRED'});
    if(origin&&origin!==BASE&&origin!=='http://127.0.0.1:'+PORT)return answer(res,403,{error:'MCP_ORIGIN_DENIED'});
    if(req.headers['content-type']?.split(';')[0]!=='application/json')return answer(res,415,{error:'MCP_JSON_REQUIRED'});
    const rpc=await dispatchMcp(await readBody(req),mcpHandlers);
    if(rpc===null){res.writeHead(202,{'Cache-Control':'no-store'});res.end();return;}
    return answer(res,200,rpc);
   }
  if(req.method==='GET'&&path==='/api/health')return answer(res,200,{ok:true,readOnly:true,cloudflareDependent:false,version:'v'+localVersion(),uptimeSeconds:Math.floor((Date.now()-startedAt)/1000),client:'PC-local',safeToUpdate:trading.canUpdate()&&bursts.canUpdate(),demoManualPilot:true,demoBursts:true,mcpLocal:true});
  if(req.method==='GET'&&path==='/api/status')return answer(res,200,{...status(),marketConnected:publicConnected,marketError:publicLastError});
  if(req.method==='GET'&&path==='/api/markets')return answer(res,200,{connected:publicConnected,
  markets:[...market.values()].map(snapshot)});
   if(req.method==='GET'&&path==='/api/watchlist')return answer(res,200,{
    source:'Deriv public read-only; these quotes do not predict synthetic indices',
    updatedAt:Date.now(),assets:externalSnapshot(),realEnabled:false});
  if(req.method==='GET'&&path==='/api/market-events'){
    if(streams.size>=MAX_STREAMS)return answer(res,429,{error:'MAXIMO_PANELES_SIMULTANEOS'});
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});streams.add(res);
    for(const m of market.values())res.write(`data: ${JSON.stringify(snapshot(m))}\n\n`);
    req.on('close',()=>streams.delete(res));return;
  }
  if(req.method==='GET'&&path==='/api/oauth/callback'){
    if(u.searchParams.get('error'))return html(res,'<h3>Deriv rechazó autorización. Cierra esta pestaña y revisa permisos.</h3>','text/html');
    const state=String(u.searchParams.get('state')||''),code=String(u.searchParams.get('code')||''),pending=get('oauth_pending');
    if(!pending||pending.expiresAt<now()||!safeEq(pending.state,state)||code.length<1||code.length>2048)throw Error('OAUTH_STATE_INVALIDO');
    const params=new URLSearchParams({grant_type:'authorization_code',client_id:pending.clientId,code,code_verifier:pending.verifier,redirect_uri:BASE+'/api/oauth/callback'});
    const exchanged=await boundedFetch(AUTH+'token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params});
    if(typeof exchanged.access_token!=='string'||!Number.isInteger(exchanged.expires_in))throw Error('DERIV_OAUTH_INCOMPLETO');
    const demo=selectAccount(await boundedFetch(API,{headers:{Authorization:'Bearer '+exchanged.access_token}}));
    put('app_id',pending.clientId);put('credentials',seal({token:exchanged.access_token,expiresAt:now()+exchanged.expires_in,accountId:demo.accountId}));put('account',demo);del('oauth_pending');audit('AUTORIZACION_DEMO','Conectada cuenta DEMO sin guardar tokens de texto plano');
    res.writeHead(303,{Location:'/?oauth=ok','Cache-Control':'no-store'});res.end();return;
  }
  if(req.method!=='POST'||origin!==BASE||req.headers['x-ecopiensa-local']!=='1'||req.headers['content-type']!=='application/json')return answer(res,403,{error:'ORIGEN_O_METODO_NO_PERMITIDO'});
  const b=await readBody(req);
  if(path==='/api/auth/start'){
    const clientId=String(b.appId||'').trim();if(!/^[A-Za-z0-9_-]{1,128}$/.test(clientId))throw Error('APP_ID_INVALIDO');
    const state=base64(randomBytes(32)),verifier=base64(randomBytes(32)),challenge=base64(sha256(verifier));
    put('oauth_pending',{state,verifier,clientId,expiresAt:now()+600});
    const url=new URL(AUTH+'auth');for(const [k,v] of Object.entries({response_type:'code',client_id:clientId,redirect_uri:BASE+'/api/oauth/callback',scope:'trade',state,code_challenge:challenge,code_challenge_method:'S256'}))url.searchParams.set(k,v);
    return answer(res,200,{redirectUrl:url.toString(),requiredRedirectUri:BASE+'/api/oauth/callback'});
  }
  if(path==='/api/auth/pat'){
    // Official Deriv desktop alternative. Only an App ID registered as PAT will work.
    // Token is validated with the OFFICIAL DEMO account endpoint before it is sealed.
    const appId=String(b.appId||'').trim();
    const token=typeof b.patToken==='string'?b.patToken.trim():'';
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(appId))throw Error('APP_ID_PAT_INVALIDO');
    if(token.length<16||token.length>2048||!/^[\x21-\x7e]+$/.test(token))
      throw Error('TOKEN_PAT_INVALIDO');
    const demo=selectAccount(await boundedFetch(API,{headers:{Authorization:'Bearer '+token,'Deriv-App-ID':appId}}));
    put('app_id',appId);
    put('credentials',seal({token,mode:'PAT',appId,accountId:demo.accountId,expiresAt:Number.MAX_SAFE_INTEGER}));
    put('account',demo);del('oauth_pending');
    audit('AUTORIZACION_PAT_DEMO','Cuenta DEMO comprobada. Token local cifrado; solo lectura.');
    return answer(res,200,status());
  }
  if(path==='/api/demo/refresh')return answer(res,200,await refreshBalance());
  if(path==='/api/demo/quote')return answer(res,200,await quoteDemo(b));
  if(path==='/api/demo/profit')return answer(res,200,await recentProfit());
   if(isMaintenance()&&['/api/demo/intent','/api/demo/confirm','/api/demo/burst/start'].includes(path))throw Error('LOCAL_UPDATE_IN_PROGRESS');
   if(path==='/api/demo/intent')return answer(res,200,trading.requestIntent({
    symbol:String(b.symbol||''),direction:String(b.direction||''),stakeCents:Number(b.stakeCents),source:'LOCAL_OWNER'}));
   if(path==='/api/demo/confirm')return answer(res,200,await trading.approve(String(b.id||''),String(b.confirmation||'')));
   if(path==='/api/demo/cancel')return answer(res,200,trading.cancel(String(b.id||'')));
   if(path==='/api/demo/reconcile')return answer(res,200,await trading.reconcile(String(b.id||'')));
   if(path==='/api/demo/burst/start')return answer(res,200,bursts.start({
    count:b.count,stakeCents:b.stakeCents,symbol:b.symbol,concurrency:b.concurrency,confirmation:b.confirmation
   }));
   if(path==='/api/demo/burst/stop')return answer(res,200,bursts.stop());
   if(path==='/api/system/update-now'){
    // Solo una acción local, sin comandos arbitrarios; no interrumpir contratos DEMO.
    if(!trading.canUpdate()||!bursts.canUpdate())throw Error('DEMO_OPERATIONS_PENDING');
    if(process.platform!=='win32')throw Error('UPDATE_ONLY_WINDOWS');
    const helper=join(HOME,'Tarea-Oculta.vbs'),root=dirname(HOME);
    const wscript=join(process.env.WINDIR||'C:\\Windows','System32','wscript.exe');
    if(!existsSync(helper)||!existsSync(wscript))throw Error('WINDOWS_UPDATER_NOT_INSTALLED');
    const processUpdate=spawn(wscript,['//B',helper,'actualizar',root],
      {cwd:HOME,windowsHide:true,detached:true,stdio:'ignore'});
    processUpdate.on('error',()=>console.warn('WINDOWS_UPDATER_FAILED'));
    processUpdate.unref();
    audit('MANUAL_UPDATE_REQUEST','Actualización local aprobada, sin operaciones DEMO');
    return answer(res,202,{started:true,mode:'BACKGROUND_HIDDEN',
      note:'GitHub se comprueba en segundo plano. El PC reiniciará el servicio solo si está sin compras pendientes.'});
   }
  return answer(res,404,{error:'RUTA_DESCONOCIDA'});
 }catch(e){console.warn('Petición rechazada:',errorCode(e));return answer(res,400,{error:errorCode(e),readOnly:true});}
});
server.listen(PORT,HOST,()=>console.log(`Ecopiensa Deriv DEMO LOCAL (compras virtuales autorizadas, REAL bloqueada) ${BASE}`));
function shutdown(){
 clearInterval(heartbeat);
 for(const r of streams){try{r.end();}catch{}}
 // Do not delete OAuth, SQLite or the private encryption key.
 server.close(()=>{try{db.close();}catch{}process.exit(0);});
 setTimeout(()=>process.exit(1),5000).unref();
}
process.on('SIGINT',shutdown);
process.on('SIGTERM',shutdown);

