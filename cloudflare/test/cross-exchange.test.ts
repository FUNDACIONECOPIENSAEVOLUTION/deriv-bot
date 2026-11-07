import {describe,it,expect} from 'vitest';
import {ARB_SOURCES,validateTopBook,compareExecutableSides,readPublicArbitrageSnapshot} from '../../runtime/cross-exchange.mjs';

const at=Date.now();
const rawBinance={lastUpdateId:100,bids:[['69960','0.9']],asks:[['70000','0.9']]};
const rawBtc={sequence:101,bids:[['70090','0.7',1]],asks:[['70120','0.7',1]]};
const rawFx={sequence:102,bids:[['0.998','500',1]],asks:[['0.999','500',1]]};
const books=()=>({
  binance:validateTopBook(rawBinance,'binance',at),
  coinbaseBTC:validateTopBook(rawBtc,'coinbase',at),
  coinbaseUSDT:validateTopBook(rawFx,'coinbase',at),
});

describe('public crypto cross-exchange monitoring without account operations',()=>{
  it('uses executable bid/ask, verifies USDT/USD conversion and subtracts both legs and fx costs',()=>{
    const v=compareExecutableSides(books(),{nowMs:at});
    expect(v.status).toBe('RESEARCH_ONLY');
    expect(v.capitalLimitUsd).toBe(10);
    expect(v.quoteCurrencies).toEqual(['USDT','USD']);
    expect(v.estimates).toHaveLength(2);
    expect(v.estimates[0].route).toBe('BINANCE_TO_COINBASE');
    expect(v.estimates[0].buyUsdPerBtc).toBeCloseTo(69930);
    expect(v.estimates[0].sellUsdPerBtc).toBe(70090);
    expect(v.estimates[0].estimatedNetUsd).toBeLessThan(v.estimates[0].grossUsd);
    expect(v.exchangeTimestampsVerified).toBe(false);
    expect(JSON.stringify(v)).not.toContain('contract_id');
  });
  it('does not claim an arbitrage when hypothetical fees erase the gross difference',()=>{
    const b=books();
    b.coinbaseBTC.bid=69975;
    const result=compareExecutableSides(b,{nowMs:at,takerBpsEach:15,fxBps:10,slippageBpsEach:10});
    expect(result.estimates[0].grossUsd).toBeGreaterThan(0);
    expect(result.estimates[0].estimatedNetUsd).toBeLessThan(0);
    expect(result.estimates[0].positiveAfterAssumptions).toBe(false);
  });
  it('rejects crossed, empty, stale and out-of-sync books',()=>{
    expect(()=>validateTopBook({lastUpdateId:100,bids:[['10','1']],asks:[['9','1']]},'binance',at)).toThrow();
    expect(()=>validateTopBook({sequence:2,bids:[],asks:[]},'coinbase',at)).toThrow();
    expect(()=>compareExecutableSides(books(),{nowMs:at+11000})).toThrow('ARB_SNAPSHOT_STALE');
    const b=books();b.coinbaseBTC.receivedAt+=4000;
    expect(()=>compareExecutableSides(b,{nowMs:at+4500})).toThrow('ARB_SNAPSHOT_OUT_OF_SYNC');
    expect(()=>compareExecutableSides(books(),{nowMs:at,budgetUsd:10000})).toThrow('ARB_BUDGET_INVALID');
    expect(()=>compareExecutableSides(books(),{nowMs:at,fxBps:-1})).toThrow('ARB_FEE_INVALID');
  });
  it('fetches only the three fixed public endpoints and refuses redirects and account credentials',async()=>{
    const seen:string[]=[];
    const payloads:Record<string,unknown>={
      [ARB_SOURCES.binance]:rawBinance,
      [ARB_SOURCES.coinbaseBTC]:rawBtc,
      [ARB_SOURCES.coinbaseUSDT]:rawFx,
    };
    const result=await readPublicArbitrageSnapshot({fetcher:async(url:string,init:RequestInit)=>{
      seen.push(url);
      expect(init.method).toBe('GET');
      expect(init.redirect).toBe('manual');
      expect(init.headers).not.toHaveProperty('Authorization');
      return Response.json(payloads[url]);
    },now:()=>at});
    expect(seen.sort()).toEqual(Object.values(ARB_SOURCES).sort());
    expect(result.status).toBe('RESEARCH_ONLY');
  });
  it('rejects unavailable data instead of fabricating an opportunity',async()=>{
    await expect(readPublicArbitrageSnapshot({fetcher:async()=>new Response('',{status:503}),now:()=>at}))
      .rejects.toThrow('ARB_HTTP_503');
    await expect(readPublicArbitrageSnapshot({fetcher:async()=>new Response('',{status:302}),now:()=>at}))
      .rejects.toThrow('ARB_HTTP_302');
  });
});
