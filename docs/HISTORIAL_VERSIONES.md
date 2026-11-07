# Historial de versiones — Deriv IA Trader

Este historial acompaña al manifiesto [release.json](../release.json), compartido por **GitHub Pages** (laboratorio PAPER) y el **Worker de Cloudflare** (panel DEMO privado).

**Regla:** toda publicación de una modificación del proyecto incrementa exactamente **0,1** el número de versión: v1.5 → v1.6 → v1.7 … v1.9 → v2.0. La publicación muestra fecha y resumen de los cambios de ese incremento.

**Importante:** el número de versión del software **no significa** que el bot haya comprado contratos o mejorado su porcentaje de aciertos. PAPER, DEMO y dinero real se mantienen distinguidos. La versión en el Worker se informa directamente mediante `/api/health`. Si la publicación de una plataforma falla, puede conservar una versión anterior: esta diferencia se debe mostrar, no ocultar.


















## v3.2 — 2026-11-07

- **Actualizado:** 2026-11-07T20:22:57.264Z (UTC).
- **Commit de origen:** `148d61a29ced`.
- Probar bloqueos de cotización rechazada, vencida o con importe/señal distintos antes de comprar DEMO

## v3.1 — 2026-11-07

- **Actualizado:** 2026-11-07T20:22:23.787Z (UTC).
- **Commit de origen:** `958508a55b73`.
- Validar servidor compra manual DEMO con compuerta probada de 45 segundos
- Centralizar compuerta de autorización DEMO por preflight exacto y temporal

## v3.0 — 2026-11-07

- **Actualizado:** 2026-11-07T20:21:48.030Z (UTC).
- **Commit de origen:** `99dcfea581cb`.
- Evaluar límite de riesgo con importe real de la siguiente operación DEMO

## v2.9 — 2026-11-07

- **Actualizado:** 2026-11-07T20:21:13.052Z (UTC).
- **Commit de origen:** `0937f1d00e9b`.
- Bloquear compra DEMO ante cotización rechazada; exigir propuesta aceptada de mismo stake y señal con 45s de validez

## v2.8 — 2026-11-07

- **Actualizado:** 2026-11-07T20:20:36.530Z (UTC).
- **Commit de origen:** `9e84213f07c8`.
- Distinguir cron DEMO autorizado de compra manual con cotización previa, sin ruta real
- No permitir compra manual DEMO sin propuesta oficial aceptada y reciente para señal e importe exactos

## v2.7 — 2026-11-07

- **Actualizado:** 2026-11-07T20:05:38.950Z (UTC).
- **Commit de origen:** `39e7af1271b8`.
- Documentar arranque de 50 compras DEMO tras primera validación y activación privada, sin dinero real

## v2.6 — 2026-11-07

- **Actualizado:** 2026-11-07T20:05:02.987Z (UTC).
- **Commit de origen:** `237005b3fc06`.
- Probar bloqueo de automatización hasta primera liquidación DEMO real

## v2.5 — 2026-11-07

- **Actualizado:** 2026-11-07T20:04:26.967Z (UTC).
- **Commit de origen:** `fd8dabf6bc92`.
- Validar primera liquidación DEMO con compuerta testeable antes de permitir la automatización
- Exigir liquidación DEMO real previa antes de iniciar tandas automatizadas

## v2.4 — 2026-11-07

- **Actualizado:** 2026-11-07T20:03:56.126Z (UTC).
- **Commit de origen:** `293d6068b7ad`.
- Alinear publicación manual con automatización DEMO opt-in y bloqueo de primera liquidación

## v2.3 — 2026-11-07

- **Actualizado:** 2026-11-07T20:03:28.052Z (UTC).
- **Commit de origen:** `b3c63f0f2c9b`.
- Validar automatización DEMO exclusivamente opt-in y previa liquidación
- Permitir control de 50 operaciones DEMO por botón, después de validar compra inicial
- Restringir botón de automatización hasta comprobar un contrato DEMO liquidado

## v2.2 — 2026-11-07

- **Actualizado:** 2026-11-07T20:02:54.658Z (UTC).
- **Commit de origen:** `3a67198ca1a9`.
- Exigir primera compra manual DEMO liquidada antes de autorizar 49 operaciones automáticas

## v2.1 — 2026-11-07

- **Actualizado:** 2026-11-07T20:01:09.901Z (UTC).
- **Commit de origen:** `85674eafeff5`.
- Mantener prueba de compuerta fail-closed bajo Worker sintético
- No confundir entorno sintético bloqueado con interruptor de producción
- Mantener fixtures de pruebas DEMO bloqueadas aunque producción permita compra manual
- Alinear despliegue manual con compra DEMO bajo control propietario
- Comprobar despliegue de compra manual DEMO habilitada y automatización bloqueada

## v2.0 — 2026-11-07

- **Actualizado:** 2026-11-07T19:59:26.974Z (UTC).
- **Commit de origen:** `827ac61b0c9a`.
- Verificar que solo compra manual DEMO está permitida y automatización apagada
- Probar que compras manuales requieren DEMO OAuth y autorización privada
- Habilitar exclusivamente una compra manual DEMO; mantener la automatización y dinero real apagados

## v1.9 — 2026-11-07

- **Actualizado:** 2026-11-07T19:57:11.082Z (UTC).
- **Commit de origen:** `d9cf42ba76e2`.
- Evitar colisiones de versiones: refrescar main y reintentar de forma segura antes de publicar

## v1.8 — 2026-11-07

- **Actualizado:** 2026-11-07T19:56:05.812Z (UTC).
- **Commit de origen:** `16b99011e4ab`.
- Documentar autorización y controles de cinco tandas de diez contratos virtuales
- Documentar autorización y controles de cinco tandas de diez contratos virtuales
- Probar reportes por tanda y espera de liquidación de 10 operaciones DEMO

## v1.7 — 2026-11-07

- **Actualizado:** 2026-11-07T19:53:23.600Z (UTC).
- **Commit de origen:** `b4a43690ac1b`.
- Probar cinco tandas de diez, sus liquidaciones y parada tras 50 contratos DEMO
- Mostrar en el panel cinco tandas DEMO, aciertos, pérdidas y límite de US$10 por tanda
- Registrar cinco lotes de 10, revisar resultados al liquidar y detener tras 50 operaciones DEMO
- Aplicar límites de cada tanda y bloqueo hasta conciliar diez contratos DEMO
- Preparar 5 tandas de 10 compras Deriv DEMO, presupuesto virtual US$10 por tanda y límite total 50

## v1.6 — 2026-11-07

- **Actualizado:** 2026-11-07T19:43:13.220Z (UTC).
- **Commit de origen:** `b0083dd3d2c6`.
- Activar actualización incremental +0,1, changelog y despliegue sincronizado Pages/Cloudflare
- Exigir prueba de incremento v1.9 a v2.0 y manifiesto compartido en CI
- Sincronizar automáticamente versión del paquete con manifiesto y changelog
- Sincronizar versión de paquete y añadir validación del incremento automático
- Comprobar versión del Worker desde release.json y registro de cambios real en HTML
- Corregir expresión regular de versión en pruebas de manifest
- Verificar manifiesto incremental y novedades visibles en GitHub Pages y panel Cloudflare
- Publicar versión de manifiesto en Cloudflare HTML y health con escapado seguro de texto
- Mostrar versión publicada y detalle de mejoras en panel privado de Cloudflare
- Corregir validación de versiones decimales en portada pública
- Mostrar versión incremental y última mejora con historial desde release.json en GitHub Pages
- Añadir regla de incremento automático de 0,1 y changelog acumulativo para publicaciones

## v1.5 — 2026-11-07

- Publicación de la portada GitHub Pages y del panel Cloudflare con acceso DEMO.
- Saldo de simulación PAPER separado del saldo oficial de Deriv DEMO.
- Base técnica de cotizaciones DEMO y controles de compras (desactivados por defecto).
- Sin operaciones DEMO verificadas en este registro.

Las próximas versiones se añaden automáticamente aquí mediante `scripts/bump_release.mjs`.
