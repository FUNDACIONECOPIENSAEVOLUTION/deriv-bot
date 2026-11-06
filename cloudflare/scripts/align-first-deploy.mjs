import { pathToFileURL } from 'node:url';

const ACCOUNT = '38ba69df2bf9333e126d30c5dce3cae8';
const SETTINGS = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/ecopiensa-paper-10/settings`;
const desired = {
  compatibility_date: '2026-11-05',
  observability: {
    enabled: true,
    issues: { enabled: false },
    logs: { enabled: true, invocation_logs: false, head_sampling_rate: 0.1 },
    traces: { enabled: true, head_sampling_rate: 0.01 },
  },
};

// Only the first publication on Workers Builds may align the empty dashboard
// placeholder. Subsequent deploys retain cf's strict conflict protection.
export async function alignFirstDeploy({ env = process.env, request = fetch, log = console.log } = {}) {
  if (env.WORKERS_CI !== '1' || env.WORKERS_CI_BRANCH !== 'main') return;
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT) {
    throw new Error('First publication account does not match this project');
  }
  if (!env.CLOUDFLARE_API_TOKEN) throw new Error('Workers Builds deployment connection is missing');
  const headers = { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` };
  async function api(options = {}) {
    const response = await request(SETTINGS, {
      ...options, headers, redirect: 'error', signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json();
    if (!response.ok || data.success !== true) {
      // Never print response bodies or environment values: they may contain secrets.
      throw new Error(`Initial Worker settings request failed (HTTP ${response.status})`);
    }
    return data.result;
  }
  const before = await api();
  if (before.bindings?.some(binding => binding.name === 'PAPER')) {
    log('Worker already initialized; strict deployment checks remain enabled');
    return;
  }
  if (!['2026-11-05', '2026-11-06'].includes(before.compatibility_date)
      || before.bindings?.length !== 1
      || before.bindings[0].name !== 'ADMIN_TOKEN'
      || before.bindings[0].type !== 'secret_text'
      || Object.values(before.exports ?? {}).some(value => value.type === 'durable_object')) {
    throw new Error('Refusing to change an unexpected Worker configuration');
  }
  const obs = before.observability;
  if (before.compatibility_date === desired.compatibility_date
      && obs?.enabled === true && obs.issues?.enabled === false
      && obs.logs?.enabled === true && obs.logs.invocation_logs === false
      && obs.logs.head_sampling_rate === 0.1
      && obs.traces?.enabled === true && obs.traces.head_sampling_rate === 0.01) {
    log('Initial settings already aligned; no API changes required');
    return;
  }
  const form = new FormData();
  form.set('settings', new Blob([JSON.stringify(desired)], { type: 'application/json' }));
  await api({ method: 'PATCH', body: form });
  const after = await api();
  if (after.compatibility_date !== desired.compatibility_date
      || after.observability?.enabled !== true
      || !after.bindings?.some(binding => binding.name === 'ADMIN_TOKEN' && binding.type === 'secret_text')) {
    throw new Error('First publication settings could not be verified');
  }
  log('Initial Worker settings aligned; encrypted panel secret preserved');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await alignFirstDeploy();
}
