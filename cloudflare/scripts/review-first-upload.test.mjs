import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewedTerminal, reviewFirstUpload } from './review-first-upload.mjs';

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
  const fixture = `if(!process.stdin.isTTY||!process.stdout.isTTY||process.env.CI!=="false")process.exit(3);process.stdin.setRawMode(true);console.log("last updated via the script API\\nWould you like to continue?");process.stdin.once("data",x=>process.exit(x.toString().startsWith("y")?0:4));`;
  await reviewedTerminal(`${shellQuote(process.execPath)} -e ${shellQuote(fixture)}`, { timeout: 5000, onOutput: () => {} });
});

test('an unreviewed prompt receives no automatic answer', { skip: process.platform !== 'linux' }, async () => {
  const fixture = `process.stdin.setRawMode(true);console.log("Delete another project? Would you like to continue?");process.stdin.once("data",()=>process.exit(0));setTimeout(()=>process.exit(7),700);`;
  await assert.rejects(reviewedTerminal(`${shellQuote(process.execPath)} -e ${shellQuote(fixture)}`, { timeout: 5000, onOutput: () => {} }), /exit 7/);
});
