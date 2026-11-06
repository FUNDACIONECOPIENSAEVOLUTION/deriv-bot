import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { reviewedTerminal, reviewFirstUpload, isApprovedPrompt } from './review-first-upload.mjs';

test('first-upload review never contacts Cloudflare outside the production online build', async () => {
  await reviewFirstUpload({ env: {}, request: () => assert.fail('unexpected request') });
  await reviewFirstUpload({ env: { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'other' }, request: () => assert.fail('unexpected request') });
});

test('a previously initialized Worker never receives an automatic interactive confirmation', async () => {
  await reviewFirstUpload({
    env: { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main', CLOUDFLARE_API_TOKEN: 'test-only' },
    request: async () => ({ ok: true, json: async () => ({ success: true, result: { bindings: [{ name: 'PAPER' }] } }) }),
    terminal: () => assert.fail('existing Worker must remain protected'), log: () => {},
  });
});

test('an unrelated binding prevents interactive upload', async () => {
  await assert.rejects(reviewFirstUpload({
    env: { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main', CLOUDFLARE_API_TOKEN: 'test-only' },
    request: async () => ({ ok: true, json: async () => ({ success: true, result: { bindings: [{ name: 'OTHER' }] } }) }),
    terminal: () => assert.fail('unexpected upload'),
  }));
});

const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;
test('online terminal supplies real TTY and confirms only the reviewed API-origin prompt', { skip: process.platform !== 'linux' }, async () => {
  const fixture = `if(!process.stdin.isTTY||!process.stdout.isTTY||process.stdout.columns!==160||process.stdout.rows!==40||process.env.CI!=="false")process.exit(3);process.stdin.setRawMode(true);console.log("last updated via the script API\\nWould you like to continue?");process.stdin.once("data",x=>process.exit(x.toString().startsWith("y")?0:4));`;
  await reviewedTerminal(`${shellQuote(process.execPath)} -e ${shellQuote(fixture)}`, { timeout: 5000, onOutput: () => {} });
});

test('the approved question remains recognizable when the terminal wraps individual characters', () => {
  const fragmented = [...'last updated via the script API\nWould you like to continue?'].join('\r\n│  ');
  assert.equal(isApprovedPrompt(fragmented), true);
  assert.equal(isApprovedPrompt('Delete another Worker? Would you like to continue?'), false);
});

test('an unreviewed prompt receives no automatic answer', { skip: process.platform !== 'linux' }, async () => {
  const fixture = `process.stdin.setRawMode(true);console.log("Delete another project? Would you like to continue?");process.stdin.once("data",()=>process.exit(0));setTimeout(()=>process.exit(7),700);`;
  await assert.rejects(reviewedTerminal(`${shellQuote(process.execPath)} -e ${shellQuote(fixture)}`, { timeout: 5000, onOutput: () => {} }), /exit 7/);
});

test('the installed cf CLI accepts the specific confirmation against a dummy API', { skip: process.platform !== 'linux' }, async () => {
  const temp = await mkdtemp(join(tmpdir(), 'ecopiensa-confirm-test-'));
  const worker = join(temp, '.cloudflare/output/v0/workers/default');
  await mkdir(join(worker, 'bundle'), { recursive: true });
  await writeFile(join(temp, '.cloudflare/output/v0/config.json'), JSON.stringify({ buildContext: { isPreview: false } }));
  await writeFile(join(worker, 'worker.config.json'), JSON.stringify({ name: 'fixture', compatibilityDate: '2026-11-05', env: {},
    manifest: { type: 'complete', mainModule: 'worker.js', modules: { 'worker.js': { type: 'esm' } } } }));
  await writeFile(join(worker, 'bundle/worker.js'), 'export default {fetch(){return new Response("fixture")}}');
  const calls = [];
  const server = createServer((request, response) => {
    calls.push(request.url);
    const service = request.url === '/client/v4/accounts/fixture/workers/services/fixture';
    response.writeHead(service ? 200 : 403, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ success: service, errors: service ? [] : [{ code: 10000, message: 'fixture stops after confirmation' }],
      result: service ? { id: 'fixture', default_environment: { environment: 'production', script: {
        id: 'fixture', tag: 'fixture', last_deployed_from: 'api', compatibility_date: '2026-11-05',
      } } } : {} }));
  });
  await new Promise(accept => server.listen(0, '127.0.0.1', accept));
  let output = '';
  try {
    const command = `env -C ${shellQuote(temp)} CLOUDFLARE_ACCOUNT_ID=fixture CLOUDFLARE_API_TOKEN=fixture-only CLOUDFLARE_API_BASE_URL=http://127.0.0.1:${server.address().port}/client/v4 ${shellQuote(process.execPath)} ${shellQuote(resolve('node_modules/cf/bin/cf'))} deploy --prebuilt`;
    // The dummy account must not inherit the real Workers Builds match-tag or
    // override-name variables. Production uses the unchanged default environment.
    await assert.rejects(reviewedTerminal(command, { timeout: 15_000, environment: { PATH: process.env.PATH }, onOutput: text => { output += text; } }), /Reviewed initial upload failed \(exit/);
    assert.equal(isApprovedPrompt(output), true, `real CLI must show the approved question: ${output.slice(-4000)}`);
    assert.ok(calls.length > 1, 'real CLI must proceed beyond its initial service lookup after confirmation');
  } finally {
    server.closeAllConnections();
    await new Promise(accept => server.close(accept));
    await rm(temp, { recursive: true, force: true });
  }
});
