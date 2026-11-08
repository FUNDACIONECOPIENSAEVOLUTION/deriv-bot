# Corrección local v11.6 — OAuth y estabilidad (8 noviembre 2026)

**Alcance:** programa Windows instalado en `D:\deriv-bot\programa`, sin Cloudflare; no habilita compras, ventas ni cuenta REAL.

## Diagnóstico
- Deriv utiliza el endpoint oficial OAuth2 `https://auth.deriv.com/oauth2/auth`. Un 404 puede deberse a App ID antiguo o de tipo distinto (PAT vs OAuth2), o callback no registrado exactamente. Consultar https://developers.deriv.com/docs/intro/oauth/ y https://developers.deriv.com/docs/workflows/.
- En el panel v11.5, `location.assign(...)` reemplazaba la ventana Edge en modo aplicación: al producirse un 404, el usuario perdía el panel.
- `status()` comparaba `expiresAt` directamente contra el objeto cifrado del token, resultando en un falso «Sin conectar» aunque la autorización existiera.
- Una interrupción de Node o una desconexión del EventSource podía dejar la interfaz sin datos. Las causas reales deben consultarse en logs privados antes de afirmarlas.

## Cambios contenidos en el paquete local v11.6
- Mantener Ecopiensa abierta durante OAuth mediante una segunda ventana; mantener callback `http://localhost:8765/api/oauth/callback` y validación PKCE.
- Descifrar token solo dentro de Node para determinar estado OAuth.
- Añadir conexión PAT para aplicaciones Deriv de tipo PAT; enviar `Deriv-App-ID` en REST y cifrar el token exclusivamente en SQLite local, nunca en GitHub.
- Incorporar vigilancia opcional del proceso Node cada 2 minutos y latidos SSE locales; el cierre voluntario del usuario desactiva la vigilancia.
- Registrar `uptimeSeconds` en `/api/health` y un diagnóstico PowerShell.
- Preservar `local-demo/data/`, clave AES, SQLite, CSV y archivos antiguos; versión +0,1 de 11.5 a 11.6. Sin cambios en Cloudflare `main`.

## Instalación
1. Obtener el ZIP `ecopiensa-correccion-oauth-cierre-v11.6.zip` generado en la conversación.
2. Extraer completo.
3. Ejecutar `Aplicar-Correccion-11.6.cmd` o `powershell -NoProfile -ExecutionPolicy Bypass -File .\Aplicar-Correccion-11.6.ps1 -Destino D:\deriv-bot\programa`.
4. Abrir el icono existente «Ecopiensa Deriv DEMO», comprobar `v11.6` y conectar.
5. Si OAuth devuelve 404 revisar tipo de App ID y callback. Alternativa PAT en el mismo panel, sin compartir el token.

## Estado de GitHub
**ATENCIÓN:** el instalador original recibió `git push` 403 («permission denied to instructorandradecc»). El paquete local puede aplicarse pero **no demuestra que el código completo de PC esté respaldado en la rama `pc-local`**. Para recuperar el respaldo automático, el propietario del repo debe autorizar escritura a esa identidad o autenticar Git con una cuenta permitida. No usar `git reset --hard` ni borrar datos; antes de actualizar desde GitHub comprobar que la rama incluye todos los archivos `local-demo/`.

## Pruebas
`node --test local-demo/test/*.test.mjs`: requiere Node.js >=24 en Windows. Se comprobaron URL oficial PKCE, rechazo de token inválido y conservación de sesión Node, sin emitir compras ni usar credenciales reales.
