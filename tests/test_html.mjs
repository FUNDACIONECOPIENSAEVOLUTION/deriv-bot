import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const panel=readFileSync('runtime/dashboard.html','utf8');
for(const script of panel.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Function(script[1]);
for(const name of ['index.html','laboratorio.html','operaciones.html','conexion.html']){
 const html=readFileSync(name,'utf8');
 if(name==='index.html'){
   assert.ok(html.includes('https://ecopiensa-paper-10.instructor-andrade-dcc.workers.dev/'),'Acceso principal al bot DEMO privado');
   assert.ok(html.includes('El saldo no se lee desde GitHub Pages'),'No presentar PAPER como saldo oficial');
   assert.ok(html.includes('TRADER LAB · V1.4'),'Mostrar versión actualizada del portal');
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

