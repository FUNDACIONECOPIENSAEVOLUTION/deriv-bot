import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  plugins:[cloudflareTest({main:'./src/index.ts',miniflare:{
    compatibilityDate:'2026-11-05',
    durableObjects:{PAPER:{className:'PaperExperiment',useSQLite:true},DERIV_DEMO:{className:'DerivDemoConnection',useSQLite:true}},
    bindings:{ADMIN_TOKEN:'test-only-token-with-at-least-32-characters',PAPER_ENABLED:'true'},
  }})],
  test:{include:['test/**/*.test.ts']},
});
