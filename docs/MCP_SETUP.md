# Conectar Ecopiensa Quant Lab a ChatGPT mediante MCP

Estado v1.1: código de servidor implementado y subido, pero NO desplegado como servicio remoto, NO conectado a esta conversación, NO autenticado con Deriv y NO autorizado a operar dinero.

## Herramientas MCP de solo lectura

- get_project_status: descripción, links y permisos del proyecto.
- get_market_snapshot: consulta cotizaciones públicas actuales de Deriv e indicadores descriptivos, sin cuenta de usuario.
- compare_research_strategies: compara 5 reglas fijas sobre ticks históricos, con división temporal desarrollo 60 % / prueba 40 % y pago hipotético.

No se incluyen órdenes de compra, venta, retirada, transferencia, autorización Deriv ni consulta de saldos reales.

## Iniciar servidor local

Requisitos: Python 3.11 o superior, ambiente virtual recomendado:

    python -m venv .venv
    pip install "mcp>=1.14,<2" "websockets>=14,<17"
    python mcp_research.py

Por defecto escucha únicamente en 127.0.0.1:8788 y usa transporte Streamable HTTP (ruta habitual /mcp).

Se puede probar con [MCP Inspector](https://github.com/modelcontextprotocol/inspector). No hace falta clave de Deriv porque las herramientas son exclusivamente de datos públicos.

**No exponer este ejemplo tal cual a Internet.** No implementa OAuth ni límites de llamadas. Para despliegue remoto debe añadirse HTTPS, OAuth 2.1, control de acceso, límites de tasa, monitorización y separación de sesiones. Nunca copiar claves a repositorio, consola del navegador o GitHub Pages.

## Uso con la conversación de ChatGPT

ChatGPT solo puede llamar servidores MCP que hayan sido conectados y autorizados en el producto correspondiente. La disponibilidad de conexiones personalizadas varía según plan, espacio de trabajo y permisos.

- Consulta [OpenAI: Connecting custom MCP servers](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).
- Una cuenta elegible debe agregar el endpoint HTTPS en su configuración de aplicaciones/servidores MCP, revisar las tres herramientas y autorizar la conexión.
- Un servidor local no queda accesible desde un ChatGPT alojado en la nube sin un túnel seguro compatible.
- Subir el archivo mcp_research.py a GitHub no conecta automáticamente la conversación ni ejecuta tareas de fondo.
- ChatGPT Plus y las APIs de OpenAI son servicios distintos; usar llamadas a OpenAI, Gemini, DeepSeek o Qwen puede tener costo aparte.

Si no hay acceso a servidores MCP personalizados, el repositorio sigue pudiendo desarrollarse desde la conexión GitHub y el laboratorio HTML continúa funcionando en cualquier navegador compatible.

## Verificación de integración

1. Inspeccionar la lista de herramientas; deben ser solo get_project_status, get_market_snapshot y compare_research_strategies.
2. Confirmar que get_project_status informa real_trading_enabled=false.
3. Consultar get_market_snapshot con un símbolo válido; nunca inventar precios si Deriv falla.
4. Ejecutar compare_research_strategies y comprobar que indica pago hipotético, muestra de prueba temporal y executed_orders=0.
5. Solicitar símbolo inválido: debe rechazarse; no se debe contactar una cuenta Deriv.
6. Documentar costo de llamadas, tiempos de espera y reconexiones antes de un despliegue remoto.

## Automatización

MCP es un protocolo para llamar herramientas, NO un proceso de trading autónomo. Un bot 24/7 necesita un servidor externo siempre en ejecución, presupuestos de gasto, controles contra pérdida y conciliación de resultados. Las tareas programadas de ChatGPT pueden generar informes pero no garantizan rentabilidad ni sustituyen una cuenta demo.

## Fuentes oficiales

- [Build an MCP server - OpenAI Developers](https://developers.openai.com/plugins/build/mcp-server)
- [OpenAI API MCP](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)
- [Deriv API Overview](https://developers.deriv.com/docs/intro/api-overview/)
- [Deriv WebSocket Market Data](https://developers.deriv.com/docs/data/)
