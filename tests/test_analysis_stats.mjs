import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateStats} from '../scripts/analysis_stats.mjs';

test('30 precios constantes: RSI neutral 50 y variación cero', () => {
  const s = calculateStats(Array(30).fill(100));
  assert.deepEqual(s, {last: 100, variationPercent: 0, rsiApprox: 50, samples: 30});
});
test('15 precios constantes: RSI neutral 50', () => {
  assert.equal(calculateStats(Array(15).fill(42)).rsiApprox, 50);
});
test('Precios crecientes: RSI 100', () => {
  assert.equal(calculateStats(Array.from({length: 30}, (_, i) => 100 + i)).rsiApprox, 100);
});
test('Precios decrecientes: RSI 0', () => {
  assert.equal(calculateStats(Array.from({length: 30}, (_, i) => 100 - i)).rsiApprox, 0);
});
test('Precios mixtos: RSI entre 0 y 100', () => {
  const prices = Array.from({length: 30}, (_, i) => 100 + Math.floor(i / 2));
  const rsi = calculateStats(prices).rsiApprox;
  assert.ok(rsi > 0 && rsi <= 100);
});
test('Rechaza muestras insuficientes', () => {
  assert.throws(() => calculateStats(Array(14).fill(100)), TypeError);
});
test('Rechaza precios nulos, negativos, NaN e Infinity', () => {
  for (const bad of [0, -1, NaN, Infinity, -Infinity, '100', null]) {
    const prices = Array(30).fill(100);
    prices[10] = bad;
    assert.throws(() => calculateStats(prices), TypeError);
  }
});
test('Rechaza objetos y entradas no array', () => {
  assert.throws(() => calculateStats(null), TypeError);
  assert.throws(() => calculateStats({prices: [100]}), TypeError);
});
