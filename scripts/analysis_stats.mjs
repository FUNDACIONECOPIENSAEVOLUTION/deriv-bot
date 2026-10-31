/** Estadísticas descriptivas de precios; solo investigación, sin ejecución. */
export function calculateStats(prices) {
  if (!Array.isArray(prices) || prices.length < 15 ||
      prices.some(p => typeof p !== 'number' || !Number.isFinite(p) || p <= 0)) {
    throw new TypeError('Se requieren al menos 15 precios positivos y finitos');
  }
  const tail = prices.slice(-15);
  let up = 0, down = 0;
  for (let i = 1; i < tail.length; i++) {
    const delta = tail[i] - tail[i - 1];
    if (delta > 0) up += delta;
    else down -= delta;
  }
  // Sin movimientos, el RSI es neutral (50), no 100.
  const rsi = up === 0 && down === 0 ? 50 :
              down === 0 ? 100 : up === 0 ? 0 :
              100 - 100 / (1 + up / down);
  return {
    last: prices.at(-1),
    variationPercent: Number((100 * (prices.at(-1) / prices[0] - 1)).toFixed(5)),
    rsiApprox: Number(rsi.toFixed(2)),
    samples: prices.length,
  };
}
