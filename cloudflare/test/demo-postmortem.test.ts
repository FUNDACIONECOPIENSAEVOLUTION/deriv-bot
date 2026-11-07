import {it,expect} from 'vitest';
import {analyzeBrokerDemoHistory} from '../../runtime/demo-postmortem.mjs';
const row=(id:number,pnl:number,decision?:Record<string,unknown>)=>({
  state:'SETTLED',contractId:id,createdAt:1700000000+id,pnlCents:pnl,
  decision:decision||{contractType:'CALL',rsi:55,volatility:0.2},entrySpot:100,
  exitSpot:pnl>0?101:99
});
it('reports true broker DEMO success and failure including costs and drawdown',()=>{
  const report=analyzeBrokerDemoHistory([row(1,8),row(2,-10),row(3,8),row(4,-10)]);
  expect(report.sampleSize).toBe(4);
  expect(report.overall.winRatePct).toBe(50);
  expect(report.overall.netPnlCents).toBe(-4);
  expect(report.overall.maxDrawdownCents).toBeGreaterThan(0);
  expect(report.overall.winRateLower95Pct).toBeLessThan(50);
  expect(report.chronologicalHoldout.n).toBe(2);
  expect(report.losingContractsReasons).toContainEqual({code:'CALL_DID_NOT_RISE_BY_EXPIRY',count:2});
  expect(report.tradeRealAutomatically).toBe(false);
});
it('uses chronology rather than the most recent winners for the holdout',()=>{
  const input=[row(3,8),row(1,8),row(2,-10),row(4,-10)];
  const r=analyzeBrokerDemoHistory(input);
  expect(r.training.n).toBe(2);
  expect(r.training.netPnlCents).toBe(-2);
  expect(r.chronologicalHoldout.netPnlCents).toBe(-2);
});
it('does not treat OPEN or UNKNOWN operations as wins or losses',()=>{
  const a=analyzeBrokerDemoHistory([
    {...row(1,8),state:'OPEN'},
    {...row(2,-10),state:'UNKNOWN'},
  ]);
  expect(a.sampleSize).toBe(0);
  expect(a.overall.winRatePct).toBeNull();
  expect(a.sampleSufficientForExploration).toBe(false);
});
it('separates volatility/RSI regimes without asserting causation',()=>{
  const r=analyzeBrokerDemoHistory([
    row(1,8,{rsi:65,volatility:0.05}),
    row(2,-10,{rsi:30,volatility:0.5}),
    row(3,8,{rsi:65,volatility:0.05})
  ]);
  expect(r.byRsi.find(x=>x.segment==='RSI_GT_60')?.wins).toBe(2);
  expect(r.byVolatility.find(x=>x.segment==='VOL_GT_0_3')?.losses).toBe(1);
  expect(r.byRsi[0].smallSample).toBe(true);
  expect(r.interpretation).toContain('correlations');
});
it('refuses duplicated, invalid or fabricated settlement records',()=>{
  expect(()=>analyzeBrokerDemoHistory([row(1,8),row(1,-10)])).toThrow('EVALUATION_DUPLICATE_CONTRACT');
  expect(()=>analyzeBrokerDemoHistory([row(1,8),{...row(2,-10),pnlCents:NaN}])).toThrow('EVALUATION_TRADE_INVALID');
  expect(()=>analyzeBrokerDemoHistory(null)).toThrow('EVALUATION_INPUT_INVALID');
});

it('correctly distinguishes PUT losses and directional sample sizes without predicting results',()=>{
 const rows=[
  {...row(7,-35,{contractType:'PUT',direction:'DOWN',rsi:28,volatility:0.02}),entrySpot:100,exitSpot:101},
  {...row(8,31,{contractType:'PUT',direction:'DOWN',rsi:35,volatility:0.02}),entrySpot:100,exitSpot:99},
  {...row(9,-35,{contractType:'CALL',direction:'UP',rsi:65,volatility:0.02}),entrySpot:100,exitSpot:99}
 ];
 const report=analyzeBrokerDemoHistory(rows);
 expect(report.byDirection.find(x=>x.segment==='PUT')?.n).toBe(2);
 expect(report.byDirection.find(x=>x.segment==='CALL')?.n).toBe(1);
 expect(report.losingContractsReasons).toContainEqual({code:'PUT_DID_NOT_FALL_BY_EXPIRY',count:1});
 expect(report.losingContractsReasons).toContainEqual({code:'CALL_DID_NOT_RISE_BY_EXPIRY',count:1});
 expect(report.tradeRealAutomatically).toBe(false);
});
