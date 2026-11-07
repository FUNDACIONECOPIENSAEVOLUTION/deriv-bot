import {describe,it,expect} from 'vitest';
import {parseContractsFor,MARKET_SYMBOLS,CONTRACTS_PUBLIC_URL} from '../src/deriv-contracts';
describe('Read-only Deriv market contract diagnostics',()=>{
  it('only consults the official public broker WebSocket',()=>{
    expect(CONTRACTS_PUBLIC_URL).toBe('wss://api.derivws.com/trading/v1/options/ws/public');
    expect(MARKET_SYMBOLS).toEqual(['R_100','1HZ100V']);
  });
  it('recognizes supported CALL / PUT contracts for specific symbols',()=>{
    const result=parseContractsFor({
      msg_type:'contracts_for',req_id:51,contracts_for:{available:[
        {contract_type:'CALL'},{contract_type:'PUT'},{contract_type:'MULTUP'}]
      }
    },'R_100',51);
    expect(result).toEqual({symbol:'R_100',state:'AVAILABLE',count:3,call:true,put:true});
  });
  it('makes no unsupported assumptions when the payload shape is unfamiliar',()=>{
    expect(parseContractsFor({req_id:52,contracts_for:{unexpected:[]}},'1HZ100V',52))
      .toMatchObject({state:'UNRECOGNIZED',call:null,put:null,count:null});
    expect(parseContractsFor({req_id:51,contracts_for:{available:[]}},'R_100',51))
      .toMatchObject({state:'AVAILABLE',count:0,call:false,put:false});
    expect(parseContractsFor({req_id:47,contracts_for:{available:[]}},'R_100',51).state)
      .toBe('UNRECOGNIZED');
  });
  it('exposes a sanitized rejection code and never returns raw broker messages',()=>{
    const result=parseContractsFor({req_id:51,error:{
      code:'ContractBuyValidationError',message:'account=SECRET-123; credential=SECRET'
    }},'R_100',51);
    expect(result).toEqual({symbol:'R_100',state:'REJECTED',code:'ContractBuyValidationError',
      count:null,call:null,put:null});
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(parseContractsFor({req_id:51,error:{code:'<untrusted>'}},'R_100',51).code).toBe('REJECTED');
  });
});