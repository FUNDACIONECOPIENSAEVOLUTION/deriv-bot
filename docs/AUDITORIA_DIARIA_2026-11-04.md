# Auditoría diaria de Deriv IA — 4 de noviembre de 2026

## Estado observado

- Commit más reciente de main al comienzo de esta revisión: `347170636` (2026-11-03 22:18 UTC), con cuatro regresiones de correlación de respuesta pública Deriv.
- Workflow de validación y MCP: **success** para ese commit. https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41729593901
- Workflow de GitHub Pages: **success** para ese commit. https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41729594303
- Workflow de conexión pública ejecutado el **4 de noviembre**: **success**, 5 ticks válidos R_100, 478 ms, con cronología verificada. https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41910433864
- El estado de Actions demuestra publicación del artefacto, pero no reemplaza una prueba HTTP independiente en el navegador.
- No se verificó acceso a cuenta autenticada, operaciones demo ni ganancias reales. No se usaron credenciales ni órdenes.

## Fallas y riesgos pendientes

- No hay fallo de CI ni de despliegue reproducido hoy. No se inventa una corrección.
- Falta ensayo de navegador independiente y prueba funcional del panel después de publicación.
- La prueba pública solo cubre cinco ticks de un símbolo; no es prueba de desempeño de una estrategia.
- El MCP de investigación y la web estática no deben gestionar tokens ni permitir compras, transferencias o retiros.
- No está desplegado un backend privado OAuth/OTP para una cuenta DEMO autenticada. El acceso a cuentas y saldo sigue sin verificar.

## Novedad oficial Deriv

- La página de actualizaciones de Deriv expone una **entrada fechada el 4 de noviembre de 2026**: consolidación de saldos USDT y USDC de agentes de pago (PA) a partir del **10 de noviembre de 2026**. Se mantienen rutas y formatos de solicitudes y hay compatibilidad temporal con códigos anteriores. Esto afecta integraciones de **agentes de pago**, no las consultas públicas de ticks de este laboratorio. https://developers.deriv.com/product-updates/
- La documentación actual de Options mantiene canales separados public, demo y real, con OTP de 120 segundos para canales autenticados: https://developers.deriv.com/es/docs/options/websocket/
- El canal público no permite operaciones ni consultar saldos: https://developers.deriv.com/es/docs/options/
- Mantener el diseño solo lectura, sin permisos payment y sin secretos en GitHub Pages.

## Referencias abiertas y próximos ensayos

- Freqtrade `lookahead-analysis`: evaluar sesgo de datos futuros, reejecutar análisis por ventanas temporales y comparar resultados: https://www.freqtrade.io/en/stable/lookahead-analysis/
- TradingAgents v0.7.1 (octubre de 2026): corregir fugas de información temporal, registrar fecha de decisión, datos observables en ese momento y momento de liquidación: https://github.com/TauricResearch/TradingAgents/releases
- Recomendado: pruebas históricas con datos auténticos, separación cronológica train/test, benchmark neutral, costes/payout hipotéticos 60/70/80 %, sensibilidad a spreads y latencia, distribución de resultados y drawdown.
- Siguiente ensayo DEMO: solo cuando exista backend privado, autorización OAuth segura y comprobación de identidad DEMO. Sin permisos de retiro, ni órdenes reales, ni martingala.
- Los resultados de simulación no representan ganancias ni prueban rentabilidad.

## Alcance de cambios

Solo se añadió este informe documental. No se modificó lógica de trading ni se introdujeron transacciones.
