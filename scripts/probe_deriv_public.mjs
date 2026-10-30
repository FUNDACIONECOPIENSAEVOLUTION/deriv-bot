/**
 * Prueba de conectividad pública de Deriv, solo lectura, sin tokens ni órdenes.
 * Verifica estructura, cronología y frescura; no es prueba de trading ni rendimiento.
 */
import {validatePublicHistory} from './public_history_validation.mjs';
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
  console.log(JSON.stringify({
    status: ok ? 'OK' : 'FAIL', code,
    source: 'Deriv Options public WebSocket', symbol: requestedSymbol,
    elapsed_ms: Date.now() - started, ...meta,
  }));
  process.exitCode = ok ? 0 : 1;
};
const timer = setTimeout(() => done(false, 'PUBLIC_WS_TIMEOUT'), 18000);
if (typeof WebSocket !== 'function') {
  done(false, 'NODE_GLOBAL_WEBSOCKET_NOT_AVAILABLE');
} else {
  try {
    ws = new WebSocket(url);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ticks_history: requestedSymbol, count: 5, end: 'latest', style: 'ticks', req_id: 130}));
    });
    ws.addEventListener('message', event => {
      let data;
      try { data = JSON.parse(event.data); } catch { return done(false, 'INVALID_JSON_RESPONSE'); }
      if (data.error) return done(false, 'DERIV_API_ERROR', {error_code: String(data.error.code || 'UNKNOWN').slice(0, 80)});
      if (data.msg_type === 'history') {
        const verdict = validatePublicHistory(data.history);
        return done(verdict.ok, verdict.code, verdict.ok ? {ticks: verdict.ticks, last_epoch: verdict.lastEpoch} : {});
      }
    });
    ws.addEventListener('error', () => done(false, 'PUBLIC_WS_NETWORK_ERROR'));
    ws.addEventListener('close', () => { if (!completed) done(false, 'PUBLIC_WS_CLOSED_BEFORE_HISTORY'); });
  } catch (error) {
    done(false, 'PUBLIC_WS_CLIENT_ERROR', {name: error?.name || 'Error'});
  }
}
