# Historial de versiones — Deriv IA Trader

Este historial acompaña al manifiesto [release.json](../release.json), compartido por **GitHub Pages** (laboratorio PAPER) y el **Worker de Cloudflare** (panel DEMO privado).

**Regla:** toda publicación de una modificación del proyecto incrementa exactamente **0,1** el número de versión: v1.5 → v1.6 → v1.7 … v1.9 → v2.0. La publicación muestra fecha y resumen de los cambios de ese incremento.

**Importante:** el número de versión del software **no significa** que el bot haya comprado contratos o mejorado su porcentaje de aciertos. PAPER, DEMO y dinero real se mantienen distinguidos. La versión en el Worker se informa directamente mediante `/api/health`. Si la publicación de una plataforma falla, puede conservar una versión anterior: esta diferencia se debe mostrar, no ocultar.

## v1.5 — 2026-11-07

- Publicación de la portada GitHub Pages y del panel Cloudflare con acceso DEMO.
- Saldo de simulación PAPER separado del saldo oficial de Deriv DEMO.
- Base técnica de cotizaciones DEMO y controles de compras (desactivados por defecto).
- Sin operaciones DEMO verificadas en este registro.

Las próximas versiones se añaden automáticamente aquí mediante `scripts/bump_release.mjs`.
