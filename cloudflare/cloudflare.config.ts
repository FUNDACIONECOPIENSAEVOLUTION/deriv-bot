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
            // Keep previous PAPER configuration fingerprint and history intact,
            // but pause background feed to prevent exhausting Durable Object quotas.
            PAPER_BACKGROUND_ENABLED: bindings.text("false"),
			// Solo compras virtuales DEMO bajo solicitud manual y autenticación privada.
			// Automatización queda bloqueada hasta validar una compra y liquidación.
			DEMO_BUY_ENABLED: bindings.text("true"),
			// Al pulsar Iniciar en el panel privado: disponible SOLO después de
			// una liquidación DEMO confirmada. Por defecto demo-auto en SQLite=false.
			DEMO_AUTO_ENABLED: bindings.text("true"),
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
			PAPER: bindings.durableObject<typeof paperWorker, "PaperExperiment">({ worker: paperWorker, exportName: "PaperExperiment" }),
			DERIV_DEMO: bindings.durableObject<typeof paperWorker, "DerivDemoConnection">({ worker: paperWorker, exportName: "DerivDemoConnection" }),
		},
	},
});
