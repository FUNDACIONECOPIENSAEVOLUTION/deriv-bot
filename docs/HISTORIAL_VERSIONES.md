# Historial de versiones — Deriv IA Trader

Este historial acompaña al manifiesto [release.json](../release.json), compartido por **GitHub Pages** (laboratorio PAPER) y el **Worker de Cloudflare** (panel DEMO privado).

**Regla:** toda publicación de una modificación del proyecto incrementa exactamente **0,1** el número de versión: v1.5 → v1.6 → v1.7 … v1.9 → v2.0. La publicación muestra fecha y resumen de los cambios de ese incremento.

**Importante:** el número de versión del software **no significa** que el bot haya comprado contratos o mejorado su porcentaje de aciertos. PAPER, DEMO y dinero real se mantienen distinguidos. La versión en el Worker se informa directamente mediante `/api/health`. Si la publicación de una plataforma falla, puede conservar una versión anterior: esta diferencia se debe mostrar, no ocultar.





























































































## v10.7 — 2026-11-08

- **Actualizado:** 2026-11-08T01:44:26.382Z (UTC).
- **Commit de origen:** `dbdc538ba0a5`.
- Asegurar totales visibles por tanda, desglose por mercado y límite de concentración en test de interfaz
- Probar que CSV no atribuya pago efectivo US$0.66 a una pérdida DEMO de US$0.35

## v10.6 — 2026-11-08

- **Actualizado:** 2026-11-08T01:43:47.376Z (UTC).
- **Commit de origen:** `e054226c729d`.
- Guardar precio de señal recién actualizada para cada contrato y no el de escaneo anterior
- Retornar último tick de la misma señal pública para comparar entrada real y evitar registrar cotización anterior

## v10.5 — 2026-11-08

- **Actualizado:** 2026-11-08T01:43:09.644Z (UTC).
- **Commit de origen:** `90837b808da9`.
- Mostrar pérdidas y ganancias por índice y dirección de la tanda, sin confundir muestra con tasa fiable

## v10.4 — 2026-11-08

- **Actualizado:** 2026-11-08T01:42:33.388Z (UTC).
- **Commit de origen:** `1673dff1e406`.
- Reducir exposición correlacionada a 2 CALL/PUT por mercado y penalizar RSI extremo sin alegar probabilidad calibrada
- Conservar pago cotizado y tasa mínima de acierto necesaria por cada compra DEMO para analizar expectativa sin inventar probabilidad

## v10.3 — 2026-11-08

- **Actualizado:** 2026-11-08T01:41:54.352Z (UTC).
- **Commit de origen:** `8d27f9246db6`.
- Aclarar pago informado versus pago inferido de ganancia neta: en pérdidas no presentar payout cotizado como dinero recibido

## v10.2 — 2026-11-08

- **Actualizado:** 2026-11-08T01:41:14.932Z (UTC).
- **Commit de origen:** `234c4f5d4b6a`.
- Calcular P&L total y tasa de aciertos por tanda DEMO, y agrupar historial por runId real
- Destacar total neto, monto apostado, tasa de aciertos y estado de última tanda DEMO; tabla de resultados por tanda

## v10.1 — 2026-11-08

- **Actualizado:** 2026-11-08T01:22:09.568Z (UTC).
- **Commit de origen:** `eced2f0a09a4`.
- Despliegue verifica ticker multiíndice, scanner AUTO y plan DEMO por stake en lugar de R_100 fijo
- Ajustar pruebas de ticker dinámico y gráficos por símbolo DEMO para evitar mezcla de mercados
- Hacer filas DEMO navegables a su mercado y no mostrar precio R_100 cuando se inspecciona otro índice
- Cargar velas verificadas de R_75, R_10 y 1HZ100V; marcar operaciones solo sobre índice correcto
- Actualizar ticker y velas según índice seleccionado, evitar mostrar marcas de contratos en gráfico de otro mercado

## v10.0 — 2026-11-08

- **Actualizado:** 2026-11-08T01:20:33.422Z (UTC).
- **Commit de origen:** `d53bf32cb768`.
- Añadir selector de índice para velas reales y marcas DEMO por mercado, sin mezclar símbolos

## v9.9 — 2026-11-08

- **Actualizado:** 2026-11-08T01:19:37.584Z (UTC).
- **Commit de origen:** `1cedd458d79b`.
- Actualizar pruebas HTML para bot AUTO multiíndice, stake dinámico, métricas DEMO y acuse de compra independiente
- Contadores superiores reflejan confirmaciones auténticas, excluyen UNKNOWN, y velas R_100 no mezclan índices
- Separar en reporte DEMO confirmados del broker y reservas UNKNOWN de seguridad
- Eliminar propiedad duplicada de stake en los planes de tanda DEMO TypeScript
- Tanda DEMO AUTO: comparar cuatro mercados y escoger CALL/PUT por compra, payout mínimo, guardas y stake configurable
- Visualizar stake elegido en tandas 1–10, presupuesto US$10 y mercado original en filas de contratos
- Comparar cuatro índices con 150 ticks públicos, score heurístico sin falsas probabilidades y señal broker validada
- Añadir scanner técnico de cuatro índices Deriv y selector de importe DEMO por contrato
- Permitir lote AUTO con dirección y símbolo elegidos por el bot en cada contrato, y stake de usuario validado
- Incluir mercado ejecutado en CSV privado de contratos DEMO para auditar señales multiíndice
- Conciliar contratos DEMO en su mercado original, preservar símbolo por cada compra y comprobar liquidación
- Elegir CALL/PUT y símbolo por cada compra de tanda AUTO con señal fresca, aprobación original y registros separados

## v9.8 — 2026-11-08

- **Actualizado:** 2026-11-08T01:13:39.578Z (UTC).
- **Commit de origen:** `9b05273fdad6`.
- Conservar feed de señales por índice para scanner de mercado DEMO y auditar símbolo elegido por contrato

## v9.7 — 2026-11-08

- **Actualizado:** 2026-11-08T01:12:59.324Z (UTC).
- **Commit de origen:** `0ed77460bc75`.
- Validar cuatro símbolos DEMO permitidos en buy/settlement y mantener bloqueo real
- Permitir cuatro símbolos de índices comprobados en cotizaciones DEMO, sin habilitar cuenta real
- Permitir stakes DEMO US$0.35–1 por contrato en tandas, cálculo de exposición y presupuesto US$10

## v9.6 — 2026-11-08

- **Actualizado:** 2026-11-08T01:12:14.493Z (UTC).
- **Commit de origen:** `6dfaf992f0fb`.
- Probar mínimo US$0.10 y propuestas CALL/PUT de cuatro índices sin operaciones ni cuenta Deriv

## v9.5 — 2026-11-08

- **Actualizado:** 2026-11-08T01:11:29.994Z (UTC).
- **Commit de origen:** `35bf403d38de`.
- Dibujar entradas/salidas DEMO solo con spot y hora confirmados; curva de P&L de contratos DEMO, PAPER separado

## v9.4 — 2026-11-08

- **Actualizado:** 2026-11-08T01:10:51.614Z (UTC).
- **Commit de origen:** `205edae8c7ef`.
- Alimentar tarjetas principales con P&L, contratos abiertos, comprados y liquidados del libro Deriv DEMO
- Priorizar saldo, P&L, compras y exposición del broker DEMO; mover PAPER a laboratorio plegable

## v9.3 — 2026-11-08

- **Actualizado:** 2026-11-08T01:07:30.170Z (UTC).
- **Commit de origen:** `cc0d18a2d3e3`.
- Corregir test de CSV: dividir por saltos de línea CRLF reales, no caracteres escapados
- Verificar CSV privado completo y de última tanda con 10 contratos, sin PAPER ni credenciales

## v9.2 — 2026-11-08

- **Actualizado:** 2026-11-08T01:05:45.663Z (UTC).
- **Commit de origen:** `7a4108e85952`.
- Explicar pérdida de última tanda DEMO, concentraciones CALL y muestra insuficiente en el panel

## v9.1 — 2026-11-08

- **Actualizado:** 2026-11-08T01:05:08.526Z (UTC).
- **Commit de origen:** `ab0a3e7a7a31`.
- Conservar pérdidas negativas como valores numéricos en Excel sin permitir inyección de fórmulas CSV
- Actualizar pruebas para exportador CSV server-side y tabla superior DEMO en lugar del botón cliente antiguo
- Eliminar comprobación trivial del CSV y mantener pruebas de timestamps faltantes
- Probar CSV del historial broker DEMO con precio, tiempos reales, análisis y sanitización de fórmulas
- Hacer que el botón anterior también descargue el historial completo DEMO, no solo 50 filas de vista previa

## v9.0 — 2026-11-08

- **Actualizado:** 2026-11-08T01:03:30.641Z (UTC).
- **Commit de origen:** `83fa649bb38f`.
- Bloquear cada compra DEMO sin señal pública reciente o cuando la dirección cambia durante la tanda
- Validar una señal SMA/RSI reciente para CADA compra DEMO y detener tanda si se debilita o cambia de dirección

## v8.9 — 2026-11-08

- **Actualizado:** 2026-11-08T01:02:49.284Z (UTC).
- **Commit de origen:** `9c6ecf46f19f`.
- Reparar tabla superior: vista DEMO auténtica predeterminada con fuente, contrato y precio, PAPER solo en otra pestaña

## v8.8 — 2026-11-08

- **Actualizado:** 2026-11-08T01:01:58.100Z (UTC).
- **Commit de origen:** `73c74c80b1e0`.
- Separar en la parte superior tabla DEMO del broker y simulación PAPER, y restaurar CSV última tanda y completo

## v8.7 — 2026-11-08

- **Actualizado:** 2026-11-08T01:01:25.837Z (UTC).
- **Commit de origen:** `c5e7bdd56576`.
- Servir archivos CSV privados de todas las compras DEMO o solo de última tanda, con cuentas protegidas
- Permitir exportar CSV íntegro del libro DEMO y CSV exclusivo de la última tanda, sin datos PAPER

## v8.6 — 2026-11-08

- **Actualizado:** 2026-11-08T01:00:50.368Z (UTC).
- **Commit de origen:** `4107178a8a8b`.
- Crear exportador auditado de contratos DEMO con hora de compra/liquidación, indicadores y diagnóstico de pérdidas
- Registrar fechas reales de compra y de liquidación para tablas y CSV DEMO con migración conservadora

## v8.5 — 2026-11-08

- **Actualizado:** 2026-11-08T00:50:36.196Z (UTC).
- **Commit de origen:** `dcd1fb44a166`.
- Impedir publicación si faltan diez órdenes DEMO distintas, confirmaciones o conciliación de lote
- Refrescar señal del bot tras confirmación humana sin cambiar la dirección aprobada ni operar señal caducada

## v8.4 — 2026-11-08

- **Actualizado:** 2026-11-08T00:49:42.574Z (UTC).
- **Commit de origen:** `ab6a540c54e3`.
- Documentar diez contratos DEMO reales distintos, máximo US$10 por tanda, saldo por ACK y límites de ejecución

## v8.3 — 2026-11-08

- **Actualizado:** 2026-11-08T00:48:48.281Z (UTC).
- **Commit de origen:** `d2b84f4094bf`.
- Probar tanda DEMO completa en fixture con autorización local sin habilitar compra en configuración global
- Alinear prueba HTML con renderización individual de identificadores de contrato DEMO
- Probar escenario íntegro de 10 órdenes DEMO reservadas, 10 acuses independientes y 10 liquidaciones con proveedor simulado
- Comprobar UI de diez contratos: órdenes distintas con ACK, saldo al comprar y no esperar liquidación para siguiente
- Pruebas de lote DEMO requieren señal nueva, dueño autenticado, máximo 10 y cero órdenes al consultar

## v8.2 — 2026-11-08

- **Actualizado:** 2026-11-08T00:45:49.360Z (UTC).
- **Commit de origen:** `cd85a5c67187`.
- Probar que 10 contratos DEMO significan 10 órdenes, máximo US$10, sin duplicados ni superar cupos
- Corregir tipo opcional de lista de contratos en conciliación DEMO
- Implementar botón real de N compras DEMO individuales con un socket, acuse por contrato, paradas y saldo al comprar
- Registrar y mostrar N contratos DEMO individuales, compromiso total y reconciliación de liquidaciones
- Distinguir cupos reales, compras confirmadas y riesgo para botón de lote DEMO hasta diez contratos
- Mostrar tanda DEMO hasta 10 contratos distintos, presupuesto US$10, contador de acuses y resultados por contrato
- Acotar tanda a 45 s y bloquear operaciones manuales paralelas durante lote DEMO
- Exponer endpoints autenticados para N compras independientes en lote DEMO, acuses y conciliación, sin cuenta real
- Preparar compra de hasta 10 contratos DEMO distintos en un solo websocket, reserva atómica, confirmaciones y conciliación

## v8.1 — 2026-11-08

- **Actualizado:** 2026-11-08T00:41:03.333Z (UTC).
- **Commit de origen:** `bb691e52c590`.
- Definir lote DEMO con N compras independientes US$1 y límite US$10 por tanda sin exceder piloto

## v8.0 — 2026-11-08

- **Actualizado:** 2026-11-08T00:34:01.675Z (UTC).
- **Commit de origen:** `f3d5a037b971`.
- Mostrar P&L provisional de contratos DEMO abiertos sin confundirlo con saldo ni ganancias realizadas

## v7.9 — 2026-11-08

- **Actualizado:** 2026-11-08T00:33:22.590Z (UTC).
- **Commit de origen:** `5334adc30da8`.
- Mostrar discrepancias entre saldo oficial DEMO y contratos registrados sin inventar movimientos
- Alinear cotizador Deriv DEMO con apuestas permitidas, incluido US$0.90
- Asegurar pruebas HTML de ticker por tick, saldo actualizado y controles DEMO configurables
- Actualizar regresión de stakes: manual US$0.90, rotación automática original sin duplicar pérdidas
- Actualizar verificación CI de US$0.90 DEMO y apuestas automáticas con secuencia controlada
- Probar US$0.90 como apuesta DEMO manual válida y bloqueo de importes o sesiones no autorizadas
- Verificar en despliegue stakes US$0.90, monitor tick en vivo y actualización de saldo DEMO
- Habilitar elección persistente de apuesta DEMO, mostrar límites reales de concurrencia y confirmar importe exacto
- Suscribir R_100 por tick público en navegador y sincronizar saldo REST DEMO cada 20 s con advertencia de antigüedad
- Actualizar monitor con overlay de tick público directo, saldo oficial por antigüedad y límite real de una compra navegador
- Mostrar importe editable US$0.35–1.00, campo simultaneidad solicitada 1–100 con límite efectivo y estado de ticks/saldo
- Publicar endpoint privado para fijar importe de una compra DEMO con riesgo y saldo verificados

## v7.8 — 2026-11-08

- **Actualizado:** 2026-11-08T00:27:06.536Z (UTC).
- **Commit de origen:** `15a32e9db29b`.
- Verificar si Deriv admite apuestas virtuales US$0.90 para CALL y PUT sin realizar compras

## v7.7 — 2026-11-08

- **Actualizado:** 2026-11-08T00:13:22.221Z (UTC).
- **Commit de origen:** `6efa2539bdd1`.
- Publicar gateway MCP DEMO, señal de navegador y comprobar que acceso anónimo queda bloqueado

## v7.6 — 2026-11-08

- **Actualizado:** 2026-11-08T00:12:43.459Z (UTC).
- **Commit de origen:** `ed33c6682566`.
- Verificar análisis CALL/PUT por navegador y que MCP no se abre sin secreto ni autenticación

## v7.5 — 2026-11-08

- **Actualizado:** 2026-11-08T00:12:04.865Z (UTC).
- **Commit de origen:** `00c288708f58`.
- Implementar decisión CALL/PUT/ESPERAR con ticks Deriv en navegador y una compra DEMO explícitamente autorizada
- Incorporar botón de análisis CALL/PUT y compra DEMO autorizada decidida por el bot

## v7.4 — 2026-11-08

- **Actualizado:** 2026-11-08T00:11:25.119Z (UTC).
- **Commit de origen:** `24f46a43ddd7`.
- Agregar señales del mercado leídas en navegador cuando Cloudflare no tiene WebSocket público
- Permitir que el bot evalúe señales CALL/PUT desde historial público recibido por navegador autorizado

## v7.3 — 2026-11-08

- **Actualizado:** 2026-11-08T00:10:19.686Z (UTC).
- **Commit de origen:** `9208c0fd9b75`.
- Documentar MCP DEMO en Worker, secreto separado, OAuth futuro y aprobación de compra por navegador

## v7.2 — 2026-11-08

- **Actualizado:** 2026-11-08T00:09:20.667Z (UTC).
- **Commit de origen:** `fb808eb14d1b`.
- Esperar RPC async del Durable Object antes de analizar señal MCP y compilar TS
- Prohibir cola MCP de compra DEMO sin señal fresca o dirección opuesta al bot
- Probar protocolo MCP, solicitudes DEMO sin compras, señales HOLD y rechazo de funciones reales
- No permitir reintentos MCP después de reclamar orden con posible compra DEMO pendiente
- Alinear handlers MCP síncronos de DurableObject con firmas Promise del protocolo
- Conectar cola MCP del Worker al botón de compra DEMO del navegador con consentimiento y liquidación
- Añadir panel de aprobación explícita para solicitudes MCP de una compra DEMO
- Caducar órdenes MCP DEMO tras 45 segundos para evitar señales obsoletas
- Integrar gateway MCP privado en Cloudflare y comandos DEMO pendientes de aprobación por navegador

## v7.1 — 2026-11-08

- **Actualizado:** 2026-11-08T00:06:19.073Z (UTC).
- **Commit de origen:** `55b19bce4966`.
- Registrar propuestas MCP DEMO con aprobación del dueño, límites de riesgo y conciliación en DO

## v7.0 — 2026-11-08

- **Actualizado:** 2026-11-08T00:05:42.139Z (UTC).
- **Commit de origen:** `cd5884edb2d1`.
- Crear servidor MCP HTTP en Cloudflare con herramientas DEMO seguras y cola de aprobación en navegador

## v6.9 — 2026-11-08

- **Actualizado:** 2026-11-08T00:01:15.324Z (UTC).
- **Commit de origen:** `126f76b55362`.
- Actualizar estado del MCP con herramienta PAPER 10 sin permisos de broker
- Añadir comando MCP paper-ten al listado y pruebas sin broker

## v6.8 — 2026-11-08

- **Actualizado:** 2026-11-08T00:00:39.362Z (UTC).
- **Commit de origen:** `4d80ed2f4328`.
- Documentar diez compras PAPER mediante bot y herramienta MCP sin acceso a cuentas Deriv
- Integrar ensayos PAPER y validación de nueva página en pruebas del repositorio
- Integrar ensayos PAPER y validación de nueva página en pruebas del repositorio

## v6.7 — 2026-11-07

- **Actualizado:** 2026-11-07T23:59:57.335Z (UTC).
- **Commit de origen:** `0b4f7dca3b5f`.
- Probar acceso a página PAPER 10, validación de ticks y bloqueo de canales autenticados
- Conectar ensayo PAPER 10 con navegación y acceso visible desde la portada del bot
- Implementar botón PAPER 10 en navegador con señales SMA/RSI idénticas al núcleo del bot

## v6.6 — 2026-11-07

- **Actualizado:** 2026-11-07T23:59:25.719Z (UTC).
- **Commit de origen:** `ea3d85deb265`.
- Crear página pública para ejecutar diez simulaciones PAPER del bot con histórico real y sin cuentas

## v6.5 — 2026-11-07

- **Actualizado:** 2026-11-07T23:57:55.438Z (UTC).
- **Commit de origen:** `70baabd6bfb2`.
- Validar herramienta MCP de diez PAPER contra el motor original sin operaciones al broker
- Agregar herramienta MCP para ejecutar diez simulaciones PAPER del bot con históricos públicos sin órdenes Deriv

## v6.4 — 2026-11-07

- **Actualizado:** 2026-11-07T23:56:29.285Z (UTC).
- **Commit de origen:** `a10d3ef168c9`.
- Ejecutar diez operaciones PAPER del bot sobre historial público y guardar auditoría GitHub Actions

## v6.3 — 2026-11-07

- **Actualizado:** 2026-11-07T23:55:56.602Z (UTC).
- **Commit de origen:** `f56b8ef8ee32`.
- Probar replay PAPER sin órdenes Deriv, sin lookahead y con diez entradas de señal técnica
- Agregar replay PAPER de diez operaciones con señales del bot y ticks públicos reales, sin órdenes al broker

## v6.2 — 2026-11-07

- **Actualizado:** 2026-11-07T23:50:35.860Z (UTC).
- **Commit de origen:** `726042e4e75c`.
- Publicar ensayo de 10 contratos DEMO balanceados, paradas de riesgo y análisis CALL/PUT
- Etiquetar con precisión P&L registrado por navegador sin verificación independiente

## v6.1 — 2026-11-07

- **Actualizado:** 2026-11-07T23:49:56.424Z (UTC).
- **Commit de origen:** `19e44290ad75`.
- Validar flujo de 10 trades DEMO, confirmación, límites, pausas y trazabilidad CSV

## v6.0 — 2026-11-07

- **Actualizado:** 2026-11-07T23:49:20.624Z (UTC).
- **Commit de origen:** `530ba88ab398`.
- Activar ensayo DEMO autorizado de 10 compras, parada segura y exportación CSV

## v5.9 — 2026-11-07

- **Actualizado:** 2026-11-07T23:48:43.076Z (UTC).
- **Commit de origen:** `3ad723015068`.
- Crear ejecución secuencial controlada de 10 contratos DEMO 5 CALL y 5 PUT con paradas de seguridad

## v5.8 — 2026-11-07

- **Actualizado:** 2026-11-07T23:48:08.737Z (UTC).
- **Commit de origen:** `78d30825c0ee`.
- Conservar resultado tipado de cada contrato y capturar RSI/SMA al entrar en DEMO
- Añadir controles visibles de ensayo DEMO de 10 contratos balanceados y exportación privada CSV

## v5.7 — 2026-11-07

- **Actualizado:** 2026-11-07T23:46:59.599Z (UTC).
- **Commit de origen:** `1d1d771ae3ee`.
- Permitir solo indicadores de investigación validados en registro de contrato DEMO
- Registrar señales SMA RSI y volatilidad para auditoría de compras DEMO del navegador

## v5.6 — 2026-11-07

- **Actualizado:** 2026-11-07T23:46:28.720Z (UTC).
- **Commit de origen:** `6c57b2580775`.
- Probar causalidad limitada y clasificación de pérdidas por CALL/PUT en DEMO
- Distinguir causas de pérdidas CALL y PUT y segmentar resultados DEMO por dirección

## v5.5 — 2026-11-07

- **Actualizado:** 2026-11-07T23:30:50.740Z (UTC).
- **Commit de origen:** `965ae3915935`.
- Publicar diagnóstico de mercado en navegador y verificar que el panel sirve el código corregido
- Corregir diagnóstico de contratos con consulta directa de navegador y diferenciar liquidaciones DEMO

## v5.4 — 2026-11-07

- **Actualizado:** 2026-11-07T23:29:17.447Z (UTC).
- **Commit de origen:** `a8b841c2e486`.
- Desplegar puente manual DEMO y aceptar bloqueo confirmado de egreso Cloudflare como diagnóstico
- Probar que puente navegador DEMO no permite compras sin autenticación ni importes obsoletos

## v5.3 — 2026-11-07

- **Actualizado:** 2026-11-07T23:28:36.248Z (UTC).
- **Commit de origen:** `b556ebdf057c`.
- Reparar primera compra DEMO con puente autenticado de navegador ante fallo WebSocket Cloudflare

## v5.2 — 2026-11-07

- **Actualizado:** 2026-11-07T23:22:56.186Z (UTC).
- **Commit de origen:** `88d8949c44df`.
- Usar snapshot de riesgo persistente en reserva DEMO y bloquear sesiones pendientes
- Crear puente DEMO manual con OTP temporal, reserva durable y liquidación marcada como observada por navegador

## v5.1 — 2026-11-07

- **Actualizado:** 2026-11-07T23:18:25.146Z (UTC).
- **Commit de origen:** `4558d08091ad`.
- Desplegar WebSocket nativo Deriv y exigir prueba real pública Cloudflare sin compras
- Probar canal WebSocket saliente demo y bloqueo estricto de cuenta real

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
