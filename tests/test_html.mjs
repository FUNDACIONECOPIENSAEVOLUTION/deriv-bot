import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const release=JSON.parse(readFileSync('release.json','utf8'));
assert.match(release.version,/^\d+\.[0-9]$/);
assert.ok(Number.isFinite(Date.parse(release.updatedAt)),'Release debe tener fecha válida');
assert.ok(Array.isArray(release.changes)&&release.changes.length>0,'Historial de mejoras obligatorio');
const panel=readFileSync('runtime/dashboard.html','utf8');
assert.ok(panel.includes('__RELEASE_VERSION__'),'El servidor debe insertar la versión del manifiesto');
assert.ok(panel.trimEnd().endsWith('</html>'),'El panel DEMO no debe contener JavaScript duplicado fuera del HTML');
assert.equal(panel.split('</html>').length,2,'El panel DEMO debe cerrar una sola vez');
assert.equal(panel.split('<script').length,2,'El panel debe contener un único script operativo');
assert.ok(panel.includes("stakeSelect.value=String(data.nextManualStakeCents)"),'El próximo importe DEMO debe actualizarse en el selector');
for(const id of ['demo-balanced-start','demo-balanced-stop','demo-balanced-status','demo-export-csv','demo-direction-stats'])
  assert.ok(panel.includes('id="'+id+'"'),'El panel debe exponer '+id);
assert.ok(panel.includes("const direction=i%2===0?'UP':'DOWN';"),'Las 10 operaciones deben alternar 5 CALL y 5 PUT');
assert.ok(panel.includes("gross+stakeCents>1000"),'El piloto no debe superar US$10 virtuales por ensayo');
assert.ok(panel.includes('consecutiveLosses>=3'),'Se exige parada por pérdidas repetidas');
assert.ok(panel.includes("net<=-300"),'Se exige parada por pérdida virtual de US$3 en el ensayo');
assert.ok(panel.includes('if(demoBalancedStop||document.hidden)'), 'El navegador debe dejar de abrir posiciones al detener u ocultar la pestaña');
const privateCsv=readFileSync('cloudflare/src/demo-csv.ts','utf8');
assert.ok(privateCsv.includes('OBSERVADO_NAVEGADOR_NO_VERIFICADO_INDEPENDIENTEMENTE'),
  'El CSV privado debe etiquetar operaciones de navegador sin verificación independiente');
assert.ok(panel.includes('/api/deriv/demo/trades.csv')&&panel.includes('/api/deriv/demo/burst.csv'),
  'El panel debe mostrar descarga de todo DEMO y de la última tanda');
assert.ok(panel.includes("historyMode='DEMO'"),'La tabla superior debe mostrar DEMO por defecto');
assert.ok(panel.includes('renderDemoTopTrades'), 'Las compras DEMO deben aparecer en tabla superior');
assert.ok(panel.includes('fetchFreshBrowserBotSignal()'), 'El lote requiere señales individuales recientes');
for(const id of ['demo-apply-stake','demo-stake-selection-status','official-demo-sync','browser-tick-status']){
 assert.ok(panel.includes('id="'+id+'"'),'Falta control de actualización o apuesta DEMO '+id);
}
assert.ok(panel.includes("ticks:symbol,subscribe:1"),'El índice elegido debe recibir ticks públicos en vivo');
assert.ok(panel.includes('syncBrokerBalance()'),'El saldo oficial debe refrescarse automáticamente');
assert.ok(panel.includes('DEMO_BURST_FRESHNESS_SECONDS=3')&&
  panel.includes('demoAgeSinceSignal(fresh,signalReceivedAtMs)'),
  'Cada compra DEMO debe comprobar la edad real de la señal también después de la cotización');
for(const field of ['proposalRttMs','demoPageNavigationType','demoPageSessionId','demoPageLoadedEpoch'])
 assert.ok(panel.includes(field),'La trazabilidad DEMO debe incluir '+field);
assert.ok(panel.includes('Date.now()-lastBrokerSyncAt<(demoBurstActive()?5000:20000)'),
  'La sincronización de saldo debe estar acotada: 5 segundos en tanda y 20 en reposo');
assert.ok(panel.includes('demoLoadBusy') && panel.includes('cache:\'no-store\''),
  'El estado DEMO debe evitar consultas superpuestas y respuestas almacenadas');
assert.ok(panel.includes('Date.now()-lastDemoLoadAttempt>(demoBurstActive()?2000:5000)'),
  'El estado DEMO debe actualizarse cada 2 segundos en tanda y 5 en reposo');
assert.ok(panel.includes('marketAge') && panel.includes('localAge'),
  'El panel debe rastrear la antigüedad del tick en el mercado y en el navegador');
assert.ok(panel.includes('demo-max-concurrent'), 'Se debe informar el límite configurable de contratos');
assert.ok(panel.includes('n>10'), 'Las solicitudes de más de 10 contratos deben quedar bloqueadas');
assert.ok(panel.includes('DEMO_MANUAL_STAKE_SET'), 'El importe elegido requiere validación del servidor');
for(const id of ['demo-burst-count','demo-burst-start','demo-burst-stop',
                  'demo-burst-reconcile','demo-burst-rows','demo-burst-live']){
 assert.ok(panel.includes('id="'+id+'"'),'Debe existir el control de diez contratos '+id);
}
assert.ok(panel.includes('DEMO_BROWSER_BURST'), 'Una tanda debe abrir sesión autenticada exclusivamente DEMO');
assert.ok(panel.includes('DEMO_BURST_RESERVED'), 'Cada orden debe reservarse individualmente antes de BUY');
assert.ok(panel.includes('DEMO_BURST_ACK'), 'Solo un acuse de Deriv confirma cada contrato');
assert.ok(panel.includes('confirmed++'), 'Los contratos se cuentan al recibir confirmación, no al cotizar');
assert.ok(panel.includes('const brokerAck=await brokerMessage(ws,reserved.request,10000)'),
  'Cada compra debe esperar un acuse broker separado antes de reservar otra, sin esperar liquidación');
assert.ok(panel.includes('void syncBrokerBalance(true)'), 'Actualizar saldo oficial inmediatamente después del acuse');
assert.ok(panel.includes('if(demoBurstStopRequested||document.hidden)'),
  'La pestaña oculta nunca debe enviar más órdenes DEMO');
assert.ok(panel.includes("for(let i=0;i<count;i++)"),'Abrir hasta N contratos individuales');
assert.ok(panel.includes('demo-main-pnl')&&panel.includes('demo-main-settled')&&panel.includes('demo-main-purchases'),
  'Las tarjetas principales deben proceder de Deriv DEMO, no del saldo PAPER');
assert.ok(panel.includes('demo-market-scan-rows')&&panel.includes('scanDemoMarkets()'),
  'El bot debe comparar mercados con sus señales antes de enviar una orden');
assert.ok(panel.includes("signal:'AUTO',stakeCents"),'La tanda debe aceptar señal AUTO y stake del usuario');
assert.ok(panel.includes("selected.direction")&&panel.includes("selected.symbol"),
  'La decisión CALL/PUT y el símbolo deben elegirse por contrato');
assert.ok(panel.includes('demo-burst-stake'),'Las tandas deben tener importe elegido por contrato');
assert.ok(panel.includes('demo-chart-symbol')&&panel.includes('loadDemoSymbolCandles'),
  'El gráfico debe mostrar los ticks del símbolo de la operación');
assert.ok(panel.includes("trade.symbol||'R_100'"),'Marcas de contratos deben respetar su mercado');
assert.ok(panel.includes("demoOtherChart?.symbol===chartSymbol"),'Nunca dibujar velas de un índice bajo otro');

assert.ok(panel.includes('scoreDemoMarketSignal'),'No presentar score SMA/RSI como probabilidad de ganancia');
for(const id of ['demo-burst-net','demo-burst-gross','demo-burst-hit-rate',
  'demo-burst-finished','demo-batches-rows','demo-burst-market-rows'])
 assert.ok(panel.includes('id="'+id+'"'),'El panel debe mostrar el resultado total de cada tanda: '+id);
assert.ok(panel.includes('renderDemoBatches(report.history||[])'),
 'El historial debe agrupar todas las tandas por runId sin usar PAPER');
assert.ok(panel.includes("pairCounts.get(key)||0")&&panel.includes(">=2"),
 'No concentrar más de dos contratos en una misma combinación índice/dirección');
assert.ok(panel.includes('extensionPenalty'),
 'La puntuación heurística debe evitar recompensar sin límite RSI extremo');


assert.ok(panel.includes("c.contractId??'SIN CONFIRMAR'"), 'Mostrar los identificadores por contrato devueltos por Deriv');




for(const script of panel.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Function(script[1]);
const paper10Html=readFileSync('ensayo-paper-10.html','utf8');
const paper10Browser=readFileSync('scripts/paper_ten_browser.mjs','utf8');
assert.ok(paper10Html.includes('id="start"')&&paper10Html.includes('id="results"'),
  'Página de PAPER 10 requiere botón y reporte visible');
assert.ok(paper10Html.includes('scripts/paper_ten_browser.mjs'),'PAPER 10 debe usar un script separado');
assert.ok(paper10Browser.includes("import {readConfig,initialState,onTick}"),'PAPER 10 debe usar motor original');
assert.ok(paper10Browser.includes('validatePublicHistory(data.history,{expectedCount:1000})'),
  'PAPER 10 debe validar identidad y frescura de 1.000 ticks');
assert.ok(paper10Browser.includes("if(trades.length===10)break;"),'No abrir más de 10 entradas');
assert.ok(paper10Browser.includes("PAPER_NO_BROKER"),'CSV nunca puede sugerir contratos comprados');
assert.ok(!paper10Browser.includes('ws/demo')&&!paper10Browser.includes('ws/real'),
  'PAPER 10 no debe acceder al WebSocket autenticado');
const homeHtml=readFileSync('index.html','utf8');
assert.ok(homeHtml.includes('href="./ensayo-paper-10.html"'),'La portada debe enlazar al nuevo laboratorio PAPER');

for(const name of ['index.html','laboratorio.html','operaciones.html','conexion.html']){
 const html=readFileSync(name,'utf8');
 if(name==='index.html'){
   assert.ok(html.includes('https://ecopiensa-paper-10.instructor-andrade-dcc.workers.dev/'),'Acceso principal al bot DEMO privado');
   assert.ok(html.includes('El saldo no se lee desde GitHub Pages'),'No presentar PAPER como saldo oficial');
   assert.ok(html.includes('/api/health'),'El portal debe enlazar al comprobador de versión del Worker');
   assert.ok(html.includes('id="release-nav-version"'),'Mostrar versión actualizada desde release.json');
   assert.ok(html.includes('showPublishedRelease()'),'Consultar manifiesto de versión publicado');
   assert.ok(html.includes('id="release-change-list"'),'Mostrar novedades por versión');
   assert.ok(!html.includes('href="https://api.derivws.com/trading/v1/options/ws/real'),'Nunca enlazar canal real');
 }
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1,'Un script inline esperado para '+name);
 new Function(scripts[0][1]);
 assert.ok(html.includes('href="./favicon.svg"'),'Se necesita favicon original en '+name);
 assert.ok(!html.includes('derivToken'),'No incluir token de broker en HTML '+name);
 assert.ok(!html.includes('buy: 1'),'No colocar compra real en el HTML '+name);
 assert.ok(!html.includes('X-Analysis-Key'),'No enviar credenciales de backend desde páginas públicas '+name);
 assert.ok(!/id=["']access["']/.test(html),'No pedir claves privadas en la página '+name);
 assert.ok(!/id=["']backend["']/.test(html),'No solicitar URL arbitraria de backend en la página '+name);
 if(name==='conexion.html'){assert.ok(html.includes('wss://api.derivws.com/trading/v1/options/ws/public'));assert.ok(!html.includes('derivToken'));assert.ok(html.includes("await import('./scripts/public_history_validation.mjs')"),'El diagnóstico debe validar precios y tiempos con el módulo probado');assert.ok(!html.includes('p.length>=2&&p.every'),'No aceptar precios sin marcas temporales');}
 if(name==='laboratorio.html'){assert.ok(html.includes("validatePublicHistory(d.history,{expectedCount:count})"),'El backtest debe validar cantidad, tiempos, orden y frescura antes de cargar ticks');assert.ok(html.indexOf('validatePublicHistory(d.history,{expectedCount:count})')<html.indexOf("setQuotes(d.history.prices||[]"),'La validación debe ejecutarse antes de setQuotes');}
 if(name==='operaciones.html'){assert.ok(html.includes('DEMO_DRAFT_ONLY'));assert.ok(html.includes('https://app.deriv.com/'));assert.ok(!html.includes('derivToken'));}
 console.log('OK '+name+' JavaScript validado, favicon incluido, sin compras ni credenciales');
}

