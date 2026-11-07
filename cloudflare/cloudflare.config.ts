import { bindings, defineConfig, defineWorker, exports, triggers } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

const paperWorker = defineWorker({
		name: "ecopiensa-paper-10",
		compatibilityDate: "2026-11-05",
		entrypoint,
		workersDev: true,
		previewUrls: false,
		exports: { PaperExperiment: exports.durableObject({ storage: "sqlite" }), DerivDemoConnection: exports.durableObject({ storage: "sqlite" }) },
		env: {
			ADMIN_TOKEN: bindings.secret(),
			PAPER_ENABLED: bindings.text("true"),
			INITIAL_USD: bindings.text("10"),
			STAKE_USD: bindings.text("0.10"),
			DAILY_LOSS_USD: bindings.text("0.30"),
		},
		triggers: [triggers.scheduled({ schedule: "*/5 * * * *" })],
		observability: {
			enabled: true,
			issues: { enabled: false },
			logs: { enabled: true, invocationLogs: false, headSamplingRate: 0.1 },
			traces: { enabled: true, headSamplingRate: 0.01 },
		},
});

export default defineConfig({
	worker: {
		...paperWorker,
		env: {
			...paperWorker.env,
			PAPER: bindings.durableObject({ worker: paperWorker, exportName: "PaperExperiment" }),
			DERIV_DEMO: bindings.durableObject({ worker: paperWorker, exportName: "DerivDemoConnection" }),
		},
	},
});
