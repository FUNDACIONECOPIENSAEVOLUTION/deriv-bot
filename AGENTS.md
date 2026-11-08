# AGENTS.md — Instrucciones persistentes del proyecto Deriv IA Trader

Estas instrucciones aplican a **toda conversación, agente y contribución** que modifique este repositorio.

## Versionado obligatorio (+0,1 por publicación)
- La fuente de verdad es **release.json**. Su versión es decimal con exactamente una cifra: v10.7 → v10.8 → v10.9 → v11.0.
- **Cada publicación de cambios del software** incrementa exactamente **0,1**. No reiniciar la numeración, no fijar una versión arbitraria y no presentar una rama sin desplegar como publicada.
- No modificar manualmente el manifiesto, el número de `package.json` ni el historial: para publicación en `main`, el flujo `.github/workflows/versioned-release.yml` ejecuta `node scripts/bump_release.mjs`, actualiza `release.json`, `package.json` y `docs/HISTORIAL_VERSIONES.md`, y publica las dos plataformas.
- Varias confirmaciones que forman parte de **una misma publicación** se documentan juntas en una versión; un nuevo despliegue posterior con cambios debe generar otra versión +0,1.
- Antes de fusionar, correr `node scripts/bump_release.mjs --verify`, `node tests/test_html.mjs` y las pruebas de Cloudflare; no fusionar con CI roja. Mantener las pruebas de seguridad pertinentes al cambiar sus intervalos.
- Tras la fusión, verificar el éxito del flujo `Versionar y publicar ambas páginas del bot`. **Comprobar ambas plataformas**: `https://fundacionecopiensaevolution.github.io/deriv-bot/release.json` y `https://ecopiensa-paper-10.instructor-andrade-dcc.workers.dev/api/health`. El Worker informa versión con sufijo `.0` (ejemplo: 10.8.0).
- Si la publicación falla, registrar el fallo y corregirlo; **nunca afirmar que está publicada** hasta confirmar la versión servida en los dos destinos.
- Antes de iniciar trabajo nuevo o desde otra conversación, revisar `AGENTS.md`, `release.json`, `docs/HISTORIAL_VERSIONES.md`, el estado de `main`, PR abiertos y GitHub Actions.

## Trading y seguridad
- No activar compras reales, retiros ni automatizaciones de contratos sin instrucción explícita y controles verificados. Separar las métricas PAPER, DEMO oficial y REAL.
- No registrar secretos en GitHub. Las credenciales Cloudflare se usan exclusivamente desde GitHub Actions Secrets.
- La versión publicada no representa rentabilidad ni fiabilidad de una estrategia.
- Los ticks, las velas, el cálculo de señales y las compras deben conservar marcas temporales verificables; detener órdenes si los datos están obsoletos.
