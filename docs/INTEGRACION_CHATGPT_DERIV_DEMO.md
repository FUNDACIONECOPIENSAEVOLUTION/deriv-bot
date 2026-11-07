# Integración de ChatGPT con Deriv DEMO — arquitectura y estado

**Fecha de revisión:** 2026-11-07. **Alcance:** cuenta DEMO de Deriv Options; capital virtual. La cuenta real no está autorizada por esta integración.

## Estado demostrado

1. El Worker `ecopiensa-paper-10` ya consulta el saldo de una cuenta Deriv DEMO USD mediante OAuth. El token de Deriv se cifra en el Durable Object y no va al navegador ni a GitHub.
2. El módulo `demo-broker-session.ts` prepara una compra, guarda primero un intento de estado UNKNOWN, realiza como máximo una solicitud `buy` con OTP DEMO y no reintenta automáticamente una orden de resultado incierto.
3. La propuesta pública de CALL/PUT de `R_100`, **5 ticks**, con apuestas virtuales de **US$0,35, US$0,50, US$0,75 y US$1**, fue aceptada durante las comprobaciones de la API pública. El antiguo contrato de 20 ticks y US$0,10 fue rechazado. Se corrigió la validación HTTP de `/api/deriv/quote` para que coincida con los cuatro importes actuales.
4. El panel privado en Cloudflare permite solicitar cotización, compra manual DEMO y verificación de la liquidación; el entrenamiento automático espera primero al menos una liquidación real DEMO y confirmación expresa del propietario para comenzar. El límite es de cinco tandas de diez, US$10 de apuestas acumuladas por tanda, hasta diez contratos simultáneos y parada al alcanzar un saldo DEMO de US$9.900 desde la referencia US$10.000.
5. Los comandos de texto **en la página privada** son una interfaz adicional sobre los controles existentes. No constituyen una conexión ChatGPT ↔ Deriv.

**No verificado:** ninguna compra autenticada y liquidada por el broker desde el bot ha sido confirmada en el chat. Los tests sintéticos, las propuestas públicas y las publicaciones de GitHub no prueban órdenes reales en la cuenta DEMO.

## Requisito externo para comandos desde esta conversación

ChatGPT necesita tener instalado y conectado un **plugin de servidor MCP remoto** con permiso para invocar herramientas de escritura, y el servidor debe autenticar al usuario final mediante OAuth 2.1 conforme al protocolo MCP. Los permisos de creación y ejecución de apps personalizadas de escritura dependen de la elegibilidad del plan/espacio de trabajo; el servidor en GitHub no genera esa autorización por sí mismo.

**Nunca** poner contraseñas, OAuth bearer de Deriv, OTP o tokens del Worker en el chat, código, commits, acciones o URL. Tampoco exponer un endpoint `/mcp` sin autenticar ni usar el `ADMIN_TOKEN` del panel como credencial reutilizable de ChatGPT. Hace falta una identidad **separada** y un proxy OAuth verificado.

### Contrato propuesto de herramientas MCP (NO INSTALADAS NI PUBLICADAS)

| Herramienta | Clasificación | Operación futura |
|---|---|---|
| `deriv_demo_status` | Lectura; OAuth con scope `demo:read` | Devuelve solo resumen del saldo DEMO, conexión y riesgo. Sin tokens ni OTP. |
| `deriv_demo_report` | Lectura; `demo:read` | Tandas de 10, porcentaje de aciertos, P&L oficial y bloqueos. |
| `deriv_demo_quote` | Lectura; `demo:read` | Propuesta oficial de CALL/PUT con importe permitido. No debe crear autorización de compra implícita. |
| `deriv_demo_prepare_buy` | Escritura limitada; `demo:request` | Crea un borrador de **una** compra DEMO, con caducidad breve e importe máximo de US$1. No manda una orden. |
| `deriv_demo_execute_approved_buy` | Escritura; `demo:trade` | Solo después de una aprobación humana explícita de la orden concreta y un preflight actualizado; comprueba de nuevo la cuenta DEMO, cuota y señal. Idempotencia por identificador único. |
| `deriv_demo_pause` | Escritura; `demo:control` | Detiene nuevos intentos DEMO; no vende contratos abiertos. |

No habrá herramientas de retirar, transferir fondos, aumentar apalancamiento, cambiar credenciales o operar la cuenta real. Una hipotética etapa REAL requerirá un diseño, pruebas y autorización independientes: **nunca se habilita por cambiar `account_type`, URL o una bandera en este MCP**.

### Autorización y protección

- OAuth 2.1 (Authorization Code + PKCE S256), consentimiento del propietario, scopes mínimos y validación estricta del token (issuer, audience, firma, caducidad y permisos).
- Antes de cada compra, comprobar el **identificador de cuenta DEMO** en la credencial autenticada, la URL OTP terminada en `/ws/demo`, el importe, el mercado, la dirección y los límites.
- El MCP no debe ejecutar compras durante `initialize`, `tools/list`, `status` ni en `read`. Solo una llamada de escritura explícita puede crear un borrador de compra.
- Cada compra requerirá confirmación de la acción concreta; un error después de enviar `buy` queda UNKNOWN y jamás se reintenta sin conciliación.
- El servidor no aceptará instrucciones libres, JavaScript remoto, URLs arbitrarias o entradas generadas por páginas externas como órdenes.
- Auditoría de usuario, acción, fecha, identificador idempotente, precio acordado, resultado del broker y cierre. Nunca guardar secretos en logs.
- Desactivación de emergencia y revocación de acceso MCP sin afectar OAuth Deriv del panel.

### Pasos para conectar

1. Confirmar disponibilidad de **servidores MCP personalizados con acciones de escritura** en el espacio de trabajo de ChatGPT. Las capacidades de lectura no son equivalentes a comprar contratos.
2. Elegir y configurar un proveedor de identidad OAuth 2.1 para el MCP, independiente de OAuth Deriv. Configurar resource metadata/JWKS y política de acceso de un único propietario.
3. Implementar y desplegar las herramientas MCP con la autenticación anterior, inicialmente **solo las tres herramientas de lectura**.
4. Crear la conexión en **ChatGPT → Plugins → Add custom MCP server**, autorizando mediante el navegador. No cargar tokens manualmente en ChatGPT.
5. Probar consultas reales de estado DEMO, lectura de reportes y cotización sin compras. Realizar una compra manual en el panel y conciliarla.
6. Habilitar una sola solicitud DEMO vía MCP con revisión de usuario, ejecutar y conciliar. Solo después considerar automatización DEMO; cuenta real fuera del alcance.

Fuentes oficiales: [Autenticación de plugins MCP](https://developers.openai.com/plugins/build/auth), [Conectar MCP a ChatGPT](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt), [Deriv: REST/WebSocket](https://developers.deriv.com/docs/intro/api-overview/).

**Nota importante:** Este documento define una interfaz de implementación futura; **no crea un plugin conectado ni añade capacidad de ejecutar órdenes desde el chat actual**.
