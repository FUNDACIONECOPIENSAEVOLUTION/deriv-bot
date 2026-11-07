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
assert.ok(panel.includes('BROWSER_OBSERVED_NOT_INDEPENDENTLY_VERIFIED'),'El CSV debe etiquetar operaciones de navegador sin verificación independiente');


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

