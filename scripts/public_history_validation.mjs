/** Validación conservadora de cotizaciones públicas; sin acceso a cuentas. */
export function validatePublicHistory(history, {expectedCount = 5, nowMs = Date.now()} = {}) {
  if (!history || !Array.isArray(history.prices) || !Array.isArray(history.times)) {
    return {ok: false, code: 'MISSING_PRICES_OR_TIMES'};
  }
  const {prices, times} = history;
  if (prices.length !== expectedCount || times.length !== expectedCount) {
    return {ok: false, code: 'INVALID_HISTORY_LENGTH'};
  }
  let last = 0;
  for (let i = 0; i < expectedCount; i++) {
    const rawPrice = prices[i];
    const rawTime = times[i];
    if ((typeof rawPrice !== 'number' && typeof rawPrice !== 'string') ||
        (typeof rawTime !== 'number' && typeof rawTime !== 'string') ||
        String(rawPrice).trim() === '' || String(rawTime).trim() === '') {
      return {ok: false, code: 'INVALID_PRICE_OR_EPOCH'};
    }
    const price = Number(rawPrice);
    const epoch = Number(rawTime);
    if (!Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(epoch) || epoch < 946684800) {
      return {ok: false, code: 'INVALID_PRICE_OR_EPOCH'};
    }
    if (i > 0 && epoch < last) return {ok: false, code: 'NON_MONOTONIC_EPOCHS'};
    last = epoch;
  }
  const nowSeconds = Math.floor(nowMs / 1000);
  if (last > nowSeconds + 120) return {ok: false, code: 'FUTURE_HISTORY'};
  if (last < nowSeconds - 900) return {ok: false, code: 'STALE_HISTORY'};
  return {ok: true, code: 'PUBLIC_HISTORY_VALIDATED', ticks: expectedCount, lastEpoch: last};
}
