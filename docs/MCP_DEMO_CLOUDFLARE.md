# MCP Ecopiensa DEMO — gateway Cloudflare (fase de integración)

**Estado:** código implementado en `cloudflare/src/mcp-gateway.ts`, rutas incorporadas a `cloudflare/src/index.ts`, bandeja de aprobación en `runtime/dashboard.html`. El endpoint necesita un secreto nuevo y NO está conectado a esta conversación. No confundir con `mcp_research.py`, que es un servidor local independiente.

## Qué sí implementa

- `POST https://ecopiensa-paper-10.instructor-andrade-dcc.workers.dev/mcp`: JSON-RPC 2.0 / MCP Streamable HTTP, sin sesiones.
- Herramientas: `get_demo_status`, `analyze_bot_signal`, `get_pending_demo_command`, `request_demo_buy`, `cancel_demo_command`.
- `request_demo_buy({direction:"AUTO",stakeCents:35})` **NO envía una orden al broker**. Comprueba la señal R_100 del bot; si está desactualizada o es HOLD, rechaza. Si es CALL/PUT válido y el riesgo lo permite, coloca **una** solicitud, que caduca a los 45 segundos.
- En el **panel privado** hay una sección «Control de solicitudes MCP» para consultar, aprobar o rechazar. La aprobación explícita desde el navegador autoriza UNA compra DEMO vía OTP efímero (el mismo flujo validado de compra manual). El resultado se registra, incluyendo el identificador del contrato y ganancia/pérdida, como «observado por navegador» hasta reconciliación independiente.
- Los permisos de la cuenta REAL, retiros, transferencias y operaciones por lotes no existen en este gateway.

## Estado del acceso

`GET /api/health/mcp` es una comprobación pública *sin datos financieros*, con campo `configured`. El endpoint `/mcp` permanece cerrado (`503 MCP_NOT_CONFIGURED`) hasta que exista un secreto fuerte `MCP_BRIDGE_TOKEN` de 32+ caracteres en el entorno del Worker. No reutilices `ADMIN_TOKEN`, Deriv OAuth, credenciales ni OTP para este propósito.

Para configurar el secreto, el titular debe entrar al **dashboard de Cloudflare → Workers & Pages → ecopiensa-paper-10 → Settings → Variables and Secrets → Add secret**. Nombre: `MCP_BRIDGE_TOKEN`, valor único aleatorio generado en un gestor de contraseñas, mínimo 32 caracteres. No copiar el valor en GitHub ni en esta conversación. En caso de configurarlo, volver a desplegar y probar MCP con un cliente propio que admita Authorization: Bearer.

## Lo que FALTA para conectarlo a ChatGPT

El gateway es **una fase de integración**, no un proveedor OAuth. Una conexión **personalizada de ChatGPT con herramientas de escritura** requiere un espacio de trabajo elegible, permisos del administrador y una implementación OAuth 2.1 (autorizar, token y descubrimiento del recurso). **No instalar** el servidor con un Bearer de dueño como si fuera OAuth.

A 7 noviembre de 2026, la documentación oficial indica compatibilidad completa con MCP personalizada en ChatGPT **Business y Enterprise/Edu**. No es necesario contratar el plan Pro: no habilita esa escritura completa. Cuando esté habilitada la cuenta, implementar OAuth 2.1 con tokens de corta duración, identidad del titular y scopes limitados a demo, después conectar mediante Plugins → Add custom MCP server. Autorización del usuario obligatoria para acciones de escritura. Nunca insertar secreto privado en el panel público GitHub Pages.

El gateway no puede saltarse el bloqueo WebSocket saliente de Cloudflare: compra DEMO únicamente desde el **navegador** autenticado. Una orden preparada vía MCP no se compra si nadie aprueba con la pestaña del panel abierta.

## Ejemplo de cliente MCP de prueba (después de configurar el secreto)

```sh
curl -X POST 'https://ecopiensa-paper-10.instructor-andrade-dcc.workers.dev/mcp' \
  -H 'Authorization: Bearer TOKEN_PRIVADO_NO_COMPARTIR' \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2025-03-26' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Para consulta del mercado, `tools/call` con `name:"analyze_bot_signal"` y `arguments:{}`. Para preparar una orden de cuenta DEMO, `name:"request_demo_buy"` y `arguments:{"direction":"AUTO","stakeCents":35}`, siempre que el saldo y la dirección coincidan con el siguiente importe programado. Esto no compra un contrato hasta aprobación en el panel.

## Protección de resultados

Tras autorizar una orden, el navegador registra identificador de contrato, saldo y resultado observado. Si hay una compra pendiente o el cierre es incierto, no se repite automáticamente. Las herramientas MCP solo leen estados o crean intenciones; no envían credenciales, no generan directamente OTP y no abren sockets a Deriv.

Fuentes oficiales:
- https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
- https://developers.deriv.com/docs/options/websocket/
- https://developers.deriv.com/docs/options/ws-demo/
