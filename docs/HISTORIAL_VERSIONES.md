# Historial de versiones — Deriv IA Trader

Este historial acompaña al manifiesto [release.json](../release.json), compartido por **GitHub Pages** (laboratorio PAPER) y el **Worker de Cloudflare** (panel DEMO privado).

**Regla:** toda publicación de una modificación del proyecto incrementa exactamente **0,1** el número de versión: v1.5 → v1.6 → v1.7 … v1.9 → v2.0. La publicación muestra fecha y resumen de los cambios de ese incremento.

**Importante:** el número de versión del software **no significa** que el bot haya comprado contratos o mejorado su porcentaje de aciertos. PAPER, DEMO y dinero real se mantienen distinguidos. La versión en el Worker se informa directamente mediante `/api/health`. Si la publicación de una plataforma falla, puede conservar una versión anterior: esta diferencia se debe mostrar, no ocultar.




































## v5.0 — 2026-11-07

- **Actualizado:** 2026-11-07T23:17:48.220Z (UTC).
- **Commit de origen:** `bc198a2eca90`.
- Añadir diagnóstico público seguro y limitado para verificar WebSocket real desde Cloudflare

## v4.9 — 2026-11-07

- **Actualizado:** 2026-11-07T23:17:14.740Z (UTC).
- **Commit de origen:** `1256c18c3960`.
- Habilitar primera compra DEMO manual aprobada sin exigir señal PAPER reciente
- Desvincular primera compra DEMO manual de las restricciones del simulador PAPER
- Permitir piloto manual DEMO solo con preflight reciente sin depender de pérdidas PAPER

## v4.8 — 2026-11-07

- **Actualizado:** 2026-11-07T23:16:42.552Z (UTC).
- **Commit de origen:** `0219d0ce3c5a`.
- Corregir WebSocket Deriv saliente en deriv-contracts.ts sin cambiar modo DEMO
- Corregir WebSocket Deriv saliente en demo-broker-session.ts sin cambiar modo DEMO
- Corregir WebSocket Deriv saliente en deriv-demo.ts sin cambiar modo DEMO
- Usar WebSocket nativo de Cloudflare para conectar Deriv con canales restringidos

## v4.7 — 2026-11-07

- **Actualizado:** 2026-11-07T22:58:46.955Z (UTC).
- **Commit de origen:** `98dab1b103e8`.
- Desplegar reparaciones DEMO y comprobar versión pública de Cloudflare tras publicación

## v4.6 — 2026-11-07

- **Actualizado:** 2026-11-07T22:57:58.113Z (UTC).
- **Commit de origen:** `ce851d07ef07`.
- Corregir sintaxis de prueba de regresión del HTML DEMO
- Reprobar CALL y PUT con cuatro importes DEMO en API pública sin compras
- Añadir regresión para HTML duplicado y el selector del importe DEMO
- Reparar HTML DEMO duplicado y sincronizar selector con próxima compra autorizada

## v4.5 — 2026-11-07

- **Actualizado:** 2026-11-07T22:50:40.296Z (UTC).
- **Commit de origen:** `0e49602fc0e8`.
- Validar stakes DEMO 35/50/75/100 antes de desplegar corrección en Cloudflare

## v4.4 — 2026-11-07

- **Actualizado:** 2026-11-07T22:35:28.284Z (UTC).
- **Commit de origen:** `5284fba62f70`.
- Unificar importes del HTTP y motor de riesgo DEMO en una sola fuente de verdad para evitar regresiones

## v4.3 — 2026-11-07

- **Actualizado:** 2026-11-07T22:34:47.638Z (UTC).
- **Commit de origen:** `153218db3557`.
- Documentar diseño seguro de conexión MCP desde ChatGPT a Deriv DEMO

## v4.2 — 2026-11-07

- **Actualizado:** 2026-11-07T22:32:11.753Z (UTC).
- **Commit de origen:** `9f711ecf2f8d`.
- Hacer test de aceptación de stakes robusto al estado OAuth no determinista; seguir rechazando valores antiguos
- Comandos DEMO por texto en panel privado con mismas confirmaciones y bloqueo de cuenta real
- Probar importes 0.35/0.50/0.75/1 en API de cotización para no volver a bloquear el primer contrato DEMO

## v4.1 — 2026-11-07

- **Actualizado:** 2026-11-07T22:29:06.581Z (UTC).
- **Commit de origen:** `0ba9f9e00dcf`.
- Corregir validación API cotización: aceptar 0.35/0.50/0.75/1 USD conforme a UI y Deriv DEMO

## v4.0 — 2026-11-07

- **Actualizado:** 2026-11-07T22:26:10.627Z (UTC).
- **Commit de origen:** `2029e1461c02`.
- Inspeccionar metadatos seguros de cotización pública para detectar incompatibilidades con la compra DEMO, sin transmitir credenciales

## v3.9 — 2026-11-07

- **Actualizado:** 2026-11-07T20:52:14.316Z (UTC).
- **Commit de origen:** `c0fb01165779`.
- Corregir fixtures de pruebas de stakes 100c sin coincidencias parciales con 35c
- Corregir Deriv DEMO según API real: 5 ticks y apuestas válidas 0.35/0.50/0.75/1 USD; pruebas y UI alineadas

## v3.8 — 2026-11-07

- **Actualizado:** 2026-11-07T20:47:06.840Z (UTC).
- **Commit de origen:** `bd4abbd1b5dd`.
- Confirmar mediante propuestas públicas mínimas US$0.35/0.50/0.75/1 y 5 ticks antes de modificar bot

## v3.7 — 2026-11-07

- **Actualizado:** 2026-11-07T20:46:18.892Z (UTC).
- **Commit de origen:** `6524747d5733`.
- Distinguir restricciones del contrato con matriz pública sin órdenes: stake, CALL/PUT y duración en R_100 y 1HZ100V

## v3.6 — 2026-11-07

- **Actualizado:** 2026-11-07T20:44:47.568Z (UTC).
- **Commit de origen:** `f145f0ab7d09`.
- Ejecutar sondeo real de la API pública Deriv para diagnosticar rechazo ContractBuyValidationError
- Agregar sondeo público sin compras para validar R_100, 1HZ100V y propuestas DEMO sin credenciales

## v3.5 — 2026-11-07

- **Actualizado:** 2026-11-07T20:43:13.601Z (UTC).
- **Commit de origen:** `41b0e23468de`.
- Corregir sintaxis de mensaje ContractBuyValidationError y restaurar dashboard validable
- Probar que diagnóstico de contratos está protegido, no acepta origen externo y no envía órdenes
- Probar comprobación pública de contratos Deriv y sanitización de mensajes sin realizar compras
- Mostrar causa exacta del error, próximo importe y diagnóstico de CALL/PUT sin compras en Deriv

## v3.4 — 2026-11-07

- **Actualizado:** 2026-11-07T20:39:24.984Z (UTC).
- **Commit de origen:** `f97ebbb2c745`.
- Agregar diagnóstico privado de contratos disponibles en Deriv sin realizar ninguna operación
- Añadir comprobador de compatibilidad CALL/PUT para R_100 y 1HZ100V, solo lectura y sin tokens

## v3.3 — 2026-11-07

- **Actualizado:** 2026-11-07T20:38:49.265Z (UTC).
- **Commit de origen:** `d492f213c576`.
- Mostrar error seguro de cotización Deriv, incluido límite temporal/OTP/WebSocket, sin revelar tokens

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
