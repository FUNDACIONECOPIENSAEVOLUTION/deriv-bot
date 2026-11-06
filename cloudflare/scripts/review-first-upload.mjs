import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ACCOUNT = '38ba69df2bf9333e126d30c5dce3cae8';
const WORKER = 'ecopiensa-paper-10';
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/${WORKER}/settings`;
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;

// Explicitly authorized by the owner: one interactive confirmation for this empty
// Worker, entirely on Workers Builds. cf beta.28 cannot confirm in CI (#69).
// Existing simulations and any other prompts retain their protection checks.
export async function reviewedTerminal(command, { timeout = 120_000, onOutput = text => process.stdout.write(text) } = {}) {
  if (process.platform !== 'linux') throw new Error('Initial upload requires the online Linux build service');
  const child = spawn('script', ['--quiet', '--return', '--command', command, '/dev/null'], {
    env: { ...process.env, CI: 'false', DO_NOT_TRACK: '1', CF_SEND_TELEMETRY: 'false' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  await new Promise((accept, reject) => {
    let output = '', answered = false;
    const deadline = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Initial upload stopped: no approved completion before timeout'));
    }, timeout);
    function consume(chunk) {
      const text = chunk.toString();
      onOutput(text);
      output = (output + text).slice(-30_000);
      const plain = output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
      if (!answered && plain.includes('last updated via the script API')
          && plain.includes('Would you like to continue?')) {
        answered = true;
        child.stdin.write('y\r');
      }
    }
    child.stdout.on('data', consume);
    child.stderr.on('data', consume);
    child.once('error', error => { clearTimeout(deadline); reject(error); });
    child.once('close', code => {
      clearTimeout(deadline);
      if (code === 0) accept();
      else reject(new Error(`Reviewed initial upload failed (exit ${code})`));
    });
  });
}

export async function reviewFirstUpload({ env = process.env, request = fetch, terminal = reviewedTerminal, log = console.log } = {}) {
  if (env.WORKERS_CI !== '1' || env.WORKERS_CI_BRANCH !== 'main') return;
  if (!env.CLOUDFLARE_API_TOKEN || (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT)) {
    throw new Error('Initial upload is limited to this project deployment connection');
  }
  async function inspect() {
    const response = await request(API, {
      headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
      redirect: 'error', signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json();
    if (!response.ok || data.success !== true) throw new Error(`Initial upload inspection failed (HTTP ${response.status})`);
    return data.result;
  }
  const remote = await inspect();
  if (remote.bindings?.some(binding => binding.name === 'PAPER')) {
    log('Initial upload already completed; normal strict deployment will run');
    return;
  }
  if (remote.bindings?.length !== 1 || remote.bindings[0].name !== 'ADMIN_TOKEN'
      || remote.bindings[0].type !== 'secret_text' || remote.compatibility_date !== '2026-11-05'
      || remote.observability?.enabled !== true
      || Object.values(remote.exports ?? {}).some(value => value.type === 'durable_object')) {
    throw new Error('Refusing initial upload over an unexpected or nonempty Worker');
  }
  const root = JSON.parse(await readFile('.cloudflare/output/v0/config.json', 'utf8'));
  const config = JSON.parse(await readFile('.cloudflare/output/v0/workers/default/worker.config.json', 'utf8'));
  if (root.buildContext?.isPreview !== false || root.buildContext?.mode !== 'production'
      || config.name !== WORKER || config.compatibilityDate !== '2026-11-05'
      || config.env?.ADMIN_TOKEN?.type !== 'secret' || config.env?.PAPER_ENABLED?.value !== 'true'
      || config.env?.INITIAL_USD?.value !== '10' || config.env?.PAPER?.worker !== WORKER
      || config.env?.PAPER?.exportName !== 'PaperExperiment'
      || config.exports?.PaperExperiment?.storage !== 'sqlite') {
    throw new Error('Prepared output does not match the reviewed virtual simulator');
  }
  const command = `${quote(process.execPath)} ${quote(resolve('node_modules/cf/bin/cf'))} deploy --prebuilt --mode production`;
  await terminal(command);
  const after = await inspect();
  if (!after.bindings?.some(binding => binding.name === 'PAPER' && binding.type === 'durable_object_namespace')
      || !after.bindings?.some(binding => binding.name === 'ADMIN_TOKEN' && binding.type === 'secret_text')) {
    throw new Error('Initial upload could not verify simulation storage and encrypted access');
  }
  log('Reviewed initial upload completed in Cloudflare; following deployments remain strict');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await reviewFirstUpload();
