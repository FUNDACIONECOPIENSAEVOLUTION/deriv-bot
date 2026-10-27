# Auditoría del ZIP de Grok — Ecopiensa Quant Lab
Fecha: 2026-10-27 · Fuente: archivo aportado por el usuario hraaUR38lSl7dT9D-grok-workspace.zip.

## Alcance y pruebas realizadas

- Se abrió el ZIP completo y se inspeccionó su inventario: 338 entradas, ~7,36 MB sin comprimir.
- Incluye un ZIP interno ecopiensa-quant-lab.zip (191 entradas); 190 archivos regulares coinciden byte por byte con el ZIP externo, excepto una pequeña diferencia en el archivo .grok/status.
- Se extrajo una copia de auditoría fuera del repositorio de GitHub; no se desplegó la aplicación externa, no se introdujeron tokens, no se enviaron órdenes ni se llamaron APIs de IA con credenciales.
- Aplicación principal: React 19, TypeScript, Zustand, TanStack Start, Vite, Tailwind, Recharts, API backend createServerFn, infraestructura adicional de auth y previews de Grok.
- Pruebas locales del ZIP: ejecutar node --test scripts/*.test.mjs devolvió **197 pruebas, 189 aprobadas, 8 fallidas**. Las 8 fallas son del plugin grok-pwa-plugin.test.mjs (metadatos y título OG/branding), sin probar el motor de trading.
- Prueba directa de src/lib/quant.ts con node --experimental-strip-types: compila y ejecuta los cálculos. Se reprodujo el fallo de que una serie constante de 80 precios (100) devuelve **SELL, confianza 86 %**, en lugar de abstenerse.
- Typecheck completo tsc --noEmit no se completó: faltan node_modules y definiciones @types/node y vite/client (TS2688). Por tanto, no se comprobó un build limpio ni funcionamiento completo en navegador.
- Las capturas internas after-connect.png y after-trade.png muestran un intento de conexión fallido con Deriv y luego mercado simulado; no prueban ganancias ni compras en cuenta real.

## Funciones reales encontradas

| Capacidad | Estado a partir del código |
| --- | --- |
| UI e indicadores cuantitativos | Presente: EMA9/21, RSI14, Bollinger, momentum, gráficos Recharts |
| Multi-IA | Presente como código: Grok (XAI_API_KEY de servidor), Gemini, DeepSeek, OpenAI/OpenRouter, Qwen. No se verificaron respuestas en vivo |
| Historial y ticks Deriv | WebSocket legacy wss://ws.derivws.com/websockets/v3?app_id=...; puede fallar y cambiar a datos sintéticos |
| Token y saldo | Formulario con token y llamada authorize. No se verificó con cuenta |
| Compra | **Sí hay llamada buy: 1 en src/lib/lab-store.ts, ~línea 707** (al activar LIVE). NO ejecutar |
| Venta anticipada / cierre real | No se encontró llamada sell en los módulos propios |
| Retiro o transferencia | No se encontraron endpoints ni acciones withdraw/transfer en los módulos principales |
| MCP que esta conversación pueda utilizar | No existe un servidor MCP específico de trading en este ZIP; no hay conexión automática a ChatGPT de esta conversación |
| Rentabilidad validada | No hay pruebas de rendimiento reproducibles en demo o real dentro del archivo |

## Errores de seguridad y de trading

1. **Compuerta LIVE eludible.** La función toggleBot solo verifica CONFIRMO y aceptación real al iniciar bot en modo LIVE (lab-store.ts ~453). El panel permite cambiar Settings.mode con el motor ya iniciado (quant-lab.tsx ~212-226); execute verifica conexión y autorización, pero no repite CONFIRMO, acceptReal ni account.virtual justo antes de hacer buy (lab-store.ts ~694-720). Por lo tanto, cambiar de DRY_RUN a LIVE después de iniciar podría permitir órdenes sin pasar por el candado previsto. **Bloqueador crítico**.
2. **Señal falsa con precios planos.** src/lib/quant.ts calcRSI devuelve 100 cuando ganancia y pérdida medias son ambas cero. Dado que Bollinger superior=inferior=precio, puede activar SELL con 86 %; no hay fundamento para atribuir una probabilidad real de 86 %.
3. **Riesgo no independiente ni vinculante por orden.** workingCap es sobre todo una cifra de pantalla; stake admite 1,50 USD por defecto con capital de referencia ~77,92 (casi 1,93 % por contrato). El motor fuerza mínimo 0,35 USD y no verifica límite fraccional de capital, exposición, drawdown ni posición de broker antes de cada orden.
4. **Parada de emergencia no liquida contratos.** emergencyStop desconecta y pone activeLive=false, pero ninguna instrucción sell/cancel llega al broker y puede quedar un contrato abierto. Mensaje de parada local no equivale a cerrar posición real.
5. **Modo DEMO vs REAL insuficiente.** La UI permite explícitamente cuenta real; confirmar al inicio no basta. Una fase DEMO estricta debería rechazar todo account.virtual=false y verificar endpoint demo en servidor.
6. **Dependencia de API anterior.** Utiliza /websockets/v3 con authorize; la API oficial actual de Options usa REST + token bearer para obtener OTP y canales separados /ws/public, /ws/demo y /ws/real. Adaptar y verificar esquemas antes de integrar.
7. **Datos sintéticos de respaldo.** startSim genera un random walk cuando falla Deriv; no usarlo en registros de desempeño real, entrenamiento o decisiones financieras; separar datos simulados de datos públicos sin ambigüedad.
8. **Payout provisional no validado.** quoteProposal devuelve stake*0.92 si no hay contrato real o falla la consulta, y en otro caso calcula neto payout-stake. No verifica cotización de Deriv para simular decisiones con exactitud, ni posibles diferencias de ejecución.
9. **Riesgo de secretos.** La opción rememberSecrets persiste tokens Deriv y claves de IA en localStorage. Incluso sin persistencia, algunas claves viajan desde el navegador hasta el propio servidor createServerFn; no se debe afirmar que permanecen solo en el navegador. Se requieren autenticación y gestor privado de secretos.
10. **Consenso sin calibración.** Las confidencias se calculan mediante umbrales manuales o son autodeclaradas por modelos. El algoritmo pondera confianza sin evidencia out-of-sample y puede operar con un solo voto cuantitativo. No convierte 86 % en probabilidad comprobada de acierto.
11. **No persiste la posición del broker.** activeLive y pendingLive son estado local; un refresco o caída de sesión puede desincronizar contratos abiertos, y un error WebSocket borra estado local antes de conciliación.
12. **Meta diaria agresiva.** dailyTargetPct predeterminado 11,46 % carece de respaldo estadístico y puede incentivar exceso de operaciones; poner un objetivo no crea esperanza matemática positiva.

## Qué sí aporta al desarrollo actual

- Diseño de UI con gráfico EMA/RSI y fichas por agente, detalles de votos e historial de eventos, adaptable a la web actual.
- Módulos separables para indicadores y orquestación, pero primero corregir edge cases, probar con muestras reproducibles y abstenerse por defecto.
- Uso de respuestas estructuradas JSON, timeout por proveedor y presupuesto de consultas como patrones, trasladando secretos al backend.
- Idea de un selector 'Quant solo' vs 'Consejo' para comparar costo, frecuencia y resultados, ideal para nuestro laboratorio.
- Estado explícito y auditable de mercado 'desconectado / real / simulado'; la simulación nunca debe poder presentarse como cotizaciones reales.
- **No copiar ni activar su función LIVE.** Preferir mantener nuestra página actual de investigación y los borradores de orden demo, hasta tener un servidor independiente y validaciones.

## Compatibilidad con nuestro GitHub Pages

El ZIP requiere servidor de TanStack Start / Nitro y dependencias Node; no se puede copiar tal cual en GitHub Pages como HTML estático. Nuestro proyecto puede aprovechar diseño e indicadores reimplementados de forma revisada, mientras conserva los módulos privados fuera de Pages.

## Plan de saneamiento y aceptación

1. Retirar por completo órdenes reales y credenciales del frontend. Integrar solo consulta pública y análisis local.
2. Corregir RSI plano y otros casos límite, con tests regresivos de series planas, monotónicas, faltantes y datos obsoletos.
3. Habilitar una cuenta demo exclusivamente en servidor seguro OAuth/PAT + OTP, validando el tipo de cuenta y endpoint antes de cada operación.
4. Implementar control de riesgo que bloquee toda orden si faltan datos, no hay saldo verificable, se supera pérdida diaria, existe posición activa o se perdió sincronización.
5. Conciliar contratos desde broker después de reinicios, errores y cierres; prohibir que 'detener motor' se anuncie como 'cerrar todas las posiciones' sin confirmación del broker.
6. Simular contratos reales con precios, payout y tiempos de vencimiento correctos; repetir evaluación fuera de muestra y en demo.
7. Separar lectura MCP de un eventual módulo de operaciones; **nunca** habilitar retiro automatizado o de fondos a la IA.
8. Auditoría independiente de seguridad y límites antes de discutir uso de dinero real.

## Fuentes

- Código adjunto original ZIP de Grok inspeccionado localmente. No se publica ni redistribuye completo.
- Documentación oficial de Deriv, flujo actual REST/OTP: https://developers.deriv.com/docs/options/websocket/
- Deriv WebSocket público: https://developers.deriv.com/docs/options/ws-public/
- Deriv trading operations: https://developers.deriv.com/docs/trading/

**Conclusión:** la aplicación es un **prototipo funcional en código** de interfaz/estrategias, no un bot de rentabilidad demostrada. Su camino actual a LIVE es inseguro. No se recomienda conectar las claves de una cuenta real ni usar la compilación de Grok para operar fondos.
