import test from 'node:test';
import assert from 'node:assert/strict';
import { alignFirstDeploy } from './align-first-deploy.mjs';

const env = { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main', CLOUDFLARE_API_TOKEN: 'test-only-token' };
const placeholder = { compatibility_date: '2026-11-06', bindings: [{ name: 'ADMIN_TOKEN', type: 'secret_text' }] };
const response = result => ({ ok: true, status: 200, json: async () => ({ success: true, result }) });

test('GitHub validation and non-production builds never contact Cloudflare', async () => {
  for (const config of [{}, { ...env, WORKERS_CI_BRANCH: 'feature' }]) {
    await alignFirstDeploy({ env: config, request: () => assert.fail('unexpected network request') });
  }
});

test('missing credentials and a different account fail before any request', async () => {
  for (const config of [{ ...env, CLOUDFLARE_API_TOKEN: '' }, { ...env, CLOUDFLARE_ACCOUNT_ID: 'other' }]) {
    await assert.rejects(alignFirstDeploy({ env: config, request: () => assert.fail('unexpected network request') }));
  }
});

test('existing simulation is never overwritten by first-publication alignment', async () => {
  let calls = 0;
  await alignFirstDeploy({ env, log: () => {}, request: async () => {
    calls++;
    return response({ bindings: [{ name: 'PAPER', type: 'durable_object_namespace' }] });
  } });
  assert.equal(calls, 1);
});

test('unexpected bindings, dates, or Durable Objects prevent all writes', async () => {
  for (const settings of [
    { ...placeholder, compatibility_date: '2025-01-01' },
    { ...placeholder, bindings: [...placeholder.bindings, { name: 'UNRELATED' }] },
    { ...placeholder, exports: { Other: { type: 'durable_object' } } },
  ]) {
    let calls = 0;
    await assert.rejects(alignFirstDeploy({ env, request: async () => { calls++; return response(settings); } }));
    assert.equal(calls, 1);
  }
});

test('first publication patches only settings on the fixed Worker and verifies the secret binding', async () => {
  const calls = [];
  await alignFirstDeploy({ env, log: () => {}, request: async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 3) return response({ ...placeholder, compatibility_date: '2026-11-05', observability: { enabled: true } });
    return response(placeholder);
  } });
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.url.endsWith('/workers/scripts/ecopiensa-paper-10/settings')));
  assert.deepEqual(calls.map(call => call.options.method ?? 'GET'), ['GET', 'PATCH', 'GET']);
  assert.ok(calls.every(call => call.options.redirect === 'error'));
  const patch = JSON.parse(await calls[1].options.body.get('settings').text());
  assert.equal(patch.compatibility_date, '2026-11-05');
  assert.equal(patch.observability.enabled, true);
  assert.equal(patch.observability.logs.enabled, true);
  assert.equal('bindings' in patch, false);
});

test('API errors do not disclose response content or the deployment token', async () => {
  await assert.rejects(alignFirstDeploy({ env, request: async () => ({
    ok: false, status: 403, json: async () => ({ success: false, errors: ['sensitive-response-value'] }),
  }) }), error => error.message.includes('403') && !error.message.includes('sensitive') && !error.message.includes(env.CLOUDFLARE_API_TOKEN));
});
