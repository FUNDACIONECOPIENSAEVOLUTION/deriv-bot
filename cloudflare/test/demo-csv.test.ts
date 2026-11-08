import {expect,it} from 'vitest';
import {demoTradesCsv,type DemoCsvRow} from '../src/demo-csv';
const row:DemoCsvRow={
 id:14,date:'2026-11-07',created_at:1794092000,bought_at:1794092001,
 settled_at:1794092009,state:'SETTLED',contract_id:19786772119,
 buy_cents:100,payout_cents:0,pnl_cents:-100,code:'CLIENT_OBSERVED',
 entry_spot:560.11,exit_spot:559.87,contract_type:'CALL',
 decision_json:JSON.stringify({runId:'trial-5-losses',strategy:'owner-browser-burst-v1',
  direction:'UP',fast:560.04,slow:560.01,rsi:61,volatility:0.03,
  reason:'TREND_AND_MOMENTUM',quoteAgeSeconds:1,entryQuote:560.11})
};
it('exports actual DEMO rows with direction, entry, exit, times and loss reason, never PAPER',()=>{
 const csv=demoTradesCsv([row]);
 expect(csv).toContain('"DERIV_DEMO"');
 expect(csv).toContain('"19786772119"');
 expect(csv).toContain('"CALL"');
 expect(csv).toContain('"560.11"');
 expect(csv).toContain('"559.87"');
 expect(csv).toContain('"1794092001"');
 expect(csv).toContain('"1794092009"');
 expect(csv).toContain('"CALL_NO_SUBIO_AL_VENCIMIENTO"');
 expect(csv).toContain('"OBSERVADO_NAVEGADOR_NO_VERIFICADO_INDEPENDIENTEMENTE"');
 expect(csv).not.toContain('"PAPER"');
 expect(csv).toContain('"trial-5-losses"');
});
it('historical DEMO settlement lacking time shows empty cell, does not invent an exit epoch',()=>{
 const csv=demoTradesCsv([{...row,bought_at:null,settled_at:null,
  entry_spot:null,exit_spot:null}]);
 expect(csv).toContain('"SIN_SPOTS_CONFIRMADOS"');
 const fields=csv.trim().split('\r\n')[1]?.match(/"[^"]*"/g)||[];
 expect(fields[6]).toBe('""');
 expect(fields[7]).toBe('""');
});
it('never treats a positive result as a loss',()=>{
 const csv=demoTradesCsv([{...row,contract_id:999,exit_spot:560.5,
  pnl_cents:80,payout_cents:180}]);
 expect(csv).toContain('"NO_ES_PERDIDA"');
});
it('separates broker-reported payout from amount derived from settled net profit',()=>{
 const csv=demoTradesCsv([{...row,buy_cents:35,payout_cents:66,pnl_cents:-35}]);
 const header=csv.split('\r\n')[0];
 expect(header).toContain('"pago_reportado_por_deriv_usd"');
 expect(header).toContain('"pago_derivado_de_pnl_usd"');
 const detail=csv.split('\r\n')[1];
 expect(detail).toContain('"0.35","0.66","0.00","-0.35"');
 const winning=demoTradesCsv([{...row,buy_cents:35,payout_cents:66,pnl_cents:31}]);
 expect(winning).toContain('"0.35","0.66","0.66","0.31"');
});
it('neutralizes formula-like text and limits oversized exports',()=>{
 const csv=demoTradesCsv([{...row,decision_json:JSON.stringify({
   runId:'=UNSAFE()',strategy:'@danger',reason:'TREND_AND_MOMENTUM'
 })}]);
 expect(csv).toContain('"'+"'"+'=UNSAFE()"');
 expect(csv).toContain('"'+"'"+'@danger"');
 expect(()=>demoTradesCsv(Array(1001).fill(row))).toThrow('DEMO_CSV_LIMIT');
});
