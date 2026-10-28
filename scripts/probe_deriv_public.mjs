/**
 * Prueba de conectividad externa a Deriv: solo WebSocket público.
 * Node.js 22+. Sin tokens, sin cuentas, sin órdenes.
 * Resultado JSON con códigos, nunca credenciales.
 */
const url = 'wss://api.derivws.com/trading/v1/options/ws/public';
const requestedSymbol = 'R_100';
const started = Date.now();
let ws;
let completed = false;
const done = (ok, code, meta = {}) => {
 if (completed) return;
 completed = true;
 clearTimeout(timer);
 try { ws?.close(1000, 'end'); } catch {}
 const result = {
  status: ok ? 'OK' : 'FAIL',
  code,
  source: 'Deriv Options public WebSocket',
  symbol: requestedSymbol,
  elapsed_ms: Date.now() - started,
  ...meta,
 };
 console.log(JSON.stringify(result));
 process.exitCode = ok ? 0 : 1;
 // End with a closed websocket; timers need not keep the process alive.
};
const timer = setTimeout(() => done(false,'PUBLIC_WS_TIMEOUT'), 18000);
if (typeof WebSocket !== 'function') {
 done(false,'NODE_GLOBAL_WEBSOCKET_NOT_AVAILABLE');
} else {
 try {
  ws = new WebSocket(url);
  ws.addEventListener('open',()=>{
   ws.send(JSON.stringify({
    ticks_history:requestedSymbol,
    count:5,
    end:'latest',
    style:'ticks',
    req_id:130,
   }));
  });
  ws.addEventListener('message',(event)=>{
   let data;
   try { data=JSON.parse(event.data); } catch { return done(false,'INVALID_JSON_RESPONSE'); }
   if (data.error) return done(false,'DERIV_API_ERROR',{error_code:String(data.error.code||'UNKNOWN').slice(0,80)});
   if (data.msg_type==='history') {
    const prices=data.history?.prices;
    if (!Array.isArray(prices) || prices.length<2 || prices.some(p=>!Number.isFinite(Number(p)))) {
     return done(false,'INVALID_HISTORY');
    }
    return done(true,'PUBLIC_TICK_HISTORY_RECEIVED',{ticks:prices.length});
   }
  });
  ws.addEventListener('error',()=>done(false,'PUBLIC_WS_NETWORK_ERROR'));
  ws.addEventListener('close',()=>{if(!completed)done(false,'PUBLIC_WS_CLOSED_BEFORE_HISTORY');});
 } catch(e) {
  done(false,'PUBLIC_WS_CLIENT_ERROR',{name:e?.name||'Error'});
 }
}
