# Plan de vinculación de cuenta Deriv — Ecopiensa Quant Lab v1.3
Fecha: 2026-10-27. Este proyecto no almacena información de identificación del usuario ni secretos en GitHub.

## Estado verificado

- GitHub Pages publicó correctamente la aplicación y las pruebas de sintaxis y lógica existentes aprobaron.
- El workflow público de conectividad a Deriv validó WebSocket y recibió **5 ticks reales del índice R_100**, con latencia observada de 503 ms desde GitHub Actions.
- Esto es evidencia de **conectividad pública** y NO de autorización de una cuenta.
- No se ha obtenido token OAuth, identificador de cuenta, cartera personal, saldo o posición; no se envió operación alguna.

Fuente del resultado: https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/40615092202

## Qué necesitamos del propietario

1. Entrar por sus propios medios en https://app.deriv.com/ con su cuenta; no compartir password, correo, códigos OTP, tokens ni información de pago en GitHub o en el chat.
2. Identificar en pantalla de Deriv dónde están efectivamente los fondos: **Wallet, Options, CFDs, Exchange o una cuenta antigua**. La cifra total del perfil no implica que exista saldo libre dentro de Options.
3. Confirmar el tipo de cuenta y que existe una cuenta **DEMO** disponible. No transferir fondos reales para esta fase.
4. En https://developers.deriv.com/ acceder al panel y **registrar una aplicación OAuth2**, asociada al proyecto; el App ID / client_id es un identificador público y sí puede compartirse.
5. La aplicación OAuth2 requiere una **URL HTTPS real de callback** previamente registrada y un servidor privado para intercambiar el authorization code por tokens. El servidor de análisis server.mjs del repositorio no es todavía un servidor OAuth de cuentas y el MCP mcp_research.py no lo es tampoco. Hace falta implementar/desplegar el servicio autorizado antes de crear la configuración definitiva del callback.
6. La autorización se concederá mediante una página oficial Deriv y OAuth2+PKCE con state ant-CSRF; no se enviarán tokens a GitHub Pages ni en mensajes de chat.
7. Primero se verificará la lista de **Options DEMO** y se probará solo la conexión WebSocket autenticada **DEMO** y saldo virtual. Si no hay DEMO, no se utilizará dinero real para completar las pruebas.

## API y ámbitos que sí hemos confirmado

- GET /trading/v1/options/accounts (OAuth2 scope **trade**): devuelve cuentas Options demo y reales; *trade es un alcance poderoso aunque hagamos una petición GET*. No concederlo a herramientas de IA genéricas.
- POST /trading/v1/options/accounts/{accountId}/otp (scope **trade**): emite URL WebSocket de uso único con OTP de 120 s; canal demo y real son distintos. Solo abrir **/ws/demo** en la fase experimental.
- GET /wallet/v1/wallets (scope **payment**): devuelve Wallets, pero **payment también autoriza acciones de fondos**. Por tanto, no solicitarlo solo para que una IA lea el saldo; localizar Wallet manualmente desde Deriv oficial.
- OAuth2 con PKCE: https://auth.deriv.com/oauth2/auth ; el intercambio de código debe realizarse en backend, no en navegador.
- Si se usara PAT para un proceso privado local, REST exige Deriv-App-ID además del bearer token. No es la opción recomendada para la web pública.

Documentación:
- https://developers.deriv.com/docs/intro/authentication/
- https://developers.deriv.com/docs/intro/oauth/
- https://developers.deriv.com/docs/options/get-accounts/
- https://developers.deriv.com/docs/options/websocket/
- https://developers.deriv.com/docs/wallet/wallet-list/

## Qué debe construir nuestro lado antes de intentar acceder a la cuenta

1. Servicio HTTPS privado (no GitHub Pages) que maneje OAuth2 client, redirect, state, PKCE y sesiones de usuario; gestión de errores y secreto cifrado fuera del frontend.
2. Solo endpoints de lectura para listar **cuentas Options**, localizar la cuenta demo y revisar las condiciones de contratos. Ningún permiso **payment** para el agente.
3. En un módulo aparte y por autorización explícita del usuario, verificación de mercado, reglas de exposición, precio/payout, máximo de operaciones y pérdidas para la cuenta demo. El riesgo debe depender del servidor, nunca de la recomendación libre de un LLM.
4. Integración MCP de consulta con autenticación propia; las herramientas de consulta no podrán mover fondos ni realizar retiros.
5. Registro de auditoría y conciliación: cotejar cada operación demo con el contrato real de demostración, proteger ante reconexiones, cierres y errores.
6. Solo después, comparar resultados fuera de muestra y demostrar que los costos y pérdidas son tolerables. La ganancia sigue siendo incierta.

## Reglas de seguridad

- No publicar correos personales, balances privados, IDs de cuenta completos o secretos en el repositorio GitHub público.
- No solicitar contraseñas, OAuth authorization code, refresh tokens, PAT, OTP, 2FA, client secret ni datos de pago en chats.
- No permitir que una IA tenga permisos de retiro/transferencia; el movimiento de fondos permanece bajo control del titular en Deriv.
- Un test de WebSocket público exitoso no equivale a conexión de cuenta autenticada.
- Rentabilidad **no garantizada**. No reutilizar fondos de la cuenta real hasta verificar hipótesis en histórico y demo.

## Pregunta que falta responder

**¿El dinero está en Wallet, Options, CFD, Exchange u otra sección?** La forma más segura es que el propietario lo confirme dentro del sitio oficial Deriv. Puede responder solo con el tipo de cuenta y, si desea, la cantidad aproximada, sin compartir identificadores completos ni capturas con información sensible.
