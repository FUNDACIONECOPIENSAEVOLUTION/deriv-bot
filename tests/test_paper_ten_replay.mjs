import test from 'node:test';
import assert from 'node:assert/strict';
import {replayTen,validateHistory,PUBLIC_WS} from '../scripts/paper_ten_replay.mjs';

const now=1794080000;
const flat=()=>({prices:Array(120).fill(550),times:Array.from({length:120},(_,i)=>now-119+i)});
test('replay is strictly PAPER and does not invent trades when the signal is HOLD',()=>{
 const r=replayTen(flat(),{now});
 assert.equal(r.brokerOrdersExecuted,0);
 assert.equal(r.mode,'PAPER_REPLAY_PUBLIC_HISTORY');
 assert.equal(r.connectedToDemoAccount,false);
 assert.equal(r.summary.trades,0);
 assert.equal(r.status,'INSUFFICIENT_SIGNALS_OR_TICKS');
 assert.equal(r.summary.pnlCents,0);
 assert.equal(PUBLIC_WS,'wss://api.derivws.com/trading/v1/options/ws/public');
});
test('accepts the ten-trade cap and checks chronology, P&L and signal direction',()=>{
 const delta=[0.025,-0.017,0.020,-0.014,0.019,-0.012,0.018];
 let value=550;
 const prices=Array.from({length:1500},(_,i)=>{value+=delta[i%delta.length];return Number(value.toFixed(5))});
 const history={prices,times:prices.map((_,i)=>now-1499+i)};
 const r=replayTen(history,{now});
 assert.equal(r.summary.trades,10,'La señal de prueba debe encontrar diez entradas sin forzarlas');
 assert.equal(r.summary.callTrades+r.summary.putTrades,10);
 assert.equal(r.summary.wins+r.summary.losses,10);
 assert.equal(r.summary.totalStakedCents,350);
 assert.equal(r.summary.endBalanceCents,r.summary.startBalanceCents+r.summary.pnlCents);
 assert.ok(r.trades.every(t=>t.ticksHeld===5&&t.entryEpoch<=t.exitEpoch
  &&t.source==='BOT_SIGNAL'&&t.result==='HYPOTHETICAL'
  &&['CALL','PUT'].includes(t.direction)));
 for(const t of r.trades){
   const expected=t.direction==='CALL'?t.exitPrice>t.entryPrice:t.exitPrice<t.entryPrice;
   assert.equal(t.won,expected);
   assert.equal(t.pnlCents,t.won?28:-35);
 }
});
test('invalid / stale data and accidental parameter drift are blocked',()=>{
 const h=flat();
 assert.throws(()=>validateHistory({...h,times:h.times.slice(1)},{now}));
 assert.throws(()=>replayTen(h,{now,maximum:50}));
 assert.throws(()=>replayTen(h,{now,stakeCents:100}));
 assert.throws(()=>replayTen(h,{now:now+3600}));
 const backward={...h,times:[...h.times]};backward.times[60]-=100;
 assert.throws(()=>replayTen(backward,{now}));
});
