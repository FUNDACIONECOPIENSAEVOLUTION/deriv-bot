import {describe,it,expect} from 'vitest';
import {validateDerivSocketAddress} from '../src/deriv-websocket';

describe('outbound Deriv WebSocket native transport, account isolation',()=>{
  it('only allows the exact official public WSS market channel',()=>{
    expect(validateDerivSocketAddress('wss://api.derivws.com/trading/v1/options/ws/public','public'))
      .toBe('wss://api.derivws.com/trading/v1/options/ws/public');
    for(const url of [
      'https://api.derivws.com/trading/v1/options/ws/public',
      'wss://not-deriv.example/trading/v1/options/ws/public',
      'wss://api.derivws.com/trading/v1/options/ws/public?otp=token',
      'wss://api.derivws.com/trading/v1/options/ws/demo?otp=example',
      'wss://api.derivws.com/trading/v1/options/ws/real?otp=example'
    ])expect(()=>validateDerivSocketAddress(url,'public')).toThrow();
  });
  it('permits only OTP-authenticated WSS DEMO and never a REAL trading socket',()=>{
    const url='wss://api.derivws.com/trading/v1/options/ws/demo?otp=one-time';
    expect(validateDerivSocketAddress(url,'demo')).toBe(url);
    for(const other of [
      'wss://api.derivws.com/trading/v1/options/ws/demo',
      'wss://api.derivws.com/trading/v1/options/ws/demo?otp=',
      'wss://api.derivws.com/trading/v1/options/ws/demo?otp=a&extra=1',
      'wss://api.derivws.com/trading/v1/options/ws/real?otp=a',
      'wss://other-host.test/trading/v1/options/ws/demo?otp=a'
    ])expect(()=>validateDerivSocketAddress(other,'demo')).toThrow();
  });
});
