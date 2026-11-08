'use strict';
const $=id=>document.getElementById(id);
const fmt=x=>Number.isFinite(x)?Number(x).toLocaleString('es-CO',{maximumFractionDigits:3}):'—';
const usd=x=>Number.isFinite(x)?'US$'+Number(x).toFixed(2):'—';
const markets=new Map();let chosen='R_100',lastNetwork=0;
const escapeText=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function get(url){const r=await fetch(url,{cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'HTTP '+r.status);return data;}
async function post(path,data){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Ecopiensa-Local':'1'},body:JSON.stringify(data)});const result=await r.json();if(!r.ok)throw Error(result.error||'HTTP '+r.status);return result;}
async function poll(){try{const s=await get('/api/status');$('online').textContent='SERVIDOR LOCAL ACTIVO';$('pending-update').hidden=!s.updatePending;$('version').textContent=s.version;$('version-title').textContent='Deriv DEMO · aplicación local '+s.version;
$('github-version').textContent='GitHub pc-local: '+(s.githubVersion?'v'+s.githubVersion:'sin comprobar')+
(s.githubStatus==='offline'?' (sin red)':'');$('connection').textContent=s.connected?'DEMO conectada ('+(s.authorizationMethod||'autenticada')+')':s.authorizationExpired?'Autorización vencida':s.authorizationCorrupt?'Credenciales ilegibles':'Sin conectar';$('feed').textContent=s.marketConnected?'Deriv en vivo':s.marketError||'Reconectando';$('balance').textContent=s.brokerBalanceVerifiedRecently?usd(s.account.balance):'Sin verificar';if(s.appId)$('app-id').value=s.appId;lastNetwork=Date.now();}catch(e){$('online').textContent='SIN SERVIDOR · '+e.message;}}
function marketCard(m){let c=$('market-'+m.symbol);if(!c){c=document.createElement('button');c.className='market';c.id='market-'+m.symbol;c.addEventListener('click',()=>{chosen=m.symbol;draw();});$('markets').appendChild(c);}c.classList.toggle('active',chosen===m.symbol);const direction=m.fresh?m.direction:'ESPERAR';c.innerHTML='<span>'+escapeText(m.symbol)+'</span><b>'+fmt(m.quote)+'</b><div class="'+(direction==='CALL'?'up':direction==='PUT'?'down':'hold')+'">'+direction+'</div><small>RSI '+fmt(m.rsi14)+' · Edad '+(m.ageReceivedMs??'—')+' ms · '+(m.fresh?'FRESCO':'OBSOLETO')+'</small>';}
function draw(){const m=markets.get(chosen),cv=$('chart'),ctx=cv.getContext('2d');const w=cv.width,h=cv.height;ctx.clearRect(0,0,w,h);const points=m?.lastPrices||[];if(points.length<2)return;const lo=Math.min(...points),hi=Math.max(...points),range=hi-lo||1;ctx.strokeStyle='#3ed6bd';ctx.lineWidth=2;ctx.beginPath();points.forEach((v,i)=>{const x=10+i*(w-20)/(points.length-1),y=h-10-(v-lo)/range*(h-20);if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();ctx.fillStyle='#a8c7d4';ctx.font='12px Arial';ctx.fillText(chosen+' · '+points.length+' ticks · '+fmt(points.at(-1)),12,17);}
function market(m){markets.set(m.symbol,m);marketCard(m);if(m.symbol===chosen&&Date.now()-lastNetwork>150)draw();}
function setMessage(text){$('auth-message').textContent=text;}

// Open OAuth outside the Edge "app" window. Do not replace the dashboard!
$('authorize').onclick=async()=>{
 const popup=window.open('about:blank','_blank'); // direct click avoids popup blockers
 try{
  const appId=$('app-id').value.trim();
  if(!appId)throw Error('Escribe tu App ID OAuth 2.0');
  const r=await post('/api/auth/start',{appId});
  const endpoint=new URL(r.redirectUrl);
  if(endpoint.origin!=='https://auth.deriv.com'||endpoint.pathname!=='/oauth2/auth')
   throw Error('URL_OAUTH_NO_OFICIAL');
  setMessage('Abriendo Deriv en otra ventana: Ecopiensa permanece abierta y el servidor local sigue activo.');
  if(popup&&!popup.closed){
   try{popup.opener=null;}catch{}
   popup.location.replace(endpoint.href);
   popup.focus();
  }else{
   const a=document.createElement('a');
   a.href=endpoint.href;a.target='_blank';a.rel='noopener noreferrer';
   a.textContent='Pulsa aquí para abrir Deriv en otra pestaña';
   const msg=$('auth-message');msg.textContent='El navegador bloqueó la nueva ventana. ';
   msg.appendChild(a);
  }
 }catch(e){try{popup?.close();}catch{}setMessage(e.message);}
};
$('pat-connect').onclick=async()=>{
 const input=$('pat-token');const token=input.value;
 try{
  const appId=$('app-id').value.trim();
  if(!appId)throw Error('Escribe el App ID de la aplicación PAT, NO el antiguo OAuth');
  if(!token)throw Error('Introduce tu token PAT en el campo privado');
  setMessage('Validando cuenta DEMO directamente con Deriv...');
  const result=await post('/api/auth/pat',{appId,patToken:token});
  if(!result.connected)throw Error('La API no confirmó la cuenta DEMO');
  await poll();setMessage('Cuenta DEMO conectada. No hay compras automáticas ni acceso REAL.');
 }catch(e){setMessage(e.message);}
 finally{input.value='';}
};
$('refresh').onclick=async()=>{try{setMessage('Consultando saldo en Deriv...');await post('/api/demo/refresh',{});await poll();setMessage('Saldo DEMO consultado oficialmente.');}catch(e){setMessage(e.message);}};
$('history').onclick=async()=>{try{setMessage('Consultando los últimos contratos oficiales...');const d=await post('/api/demo/profit',{});const t=d.trades||[];$('trades').innerHTML='<p>'+t.length+' registros obtenidos de Deriv (consulta sin comprar).</p><div style="overflow-x:auto"><table><thead><tr><th>Contrato</th><th>Mercado</th><th>P&L</th></tr></thead><tbody>'+t.slice(0,30).map(x=>'<tr><td>'+escapeText(x.contractId)+'</td><td>'+escapeText(x.symbol)+'</td><td>'+usd(x.profit)+'</td></tr>').join('')+'</tbody></table></div>';setMessage('Consulta terminada.');}catch(e){setMessage(e.message);}};
$('quote-btn').onclick=async()=>{try{$('quote-message').textContent='Consultando propuesta (sin comprar)...';const r=await post('/api/demo/quote',{symbol:$('quote-symbol').value,direction:$('quote-dir').value,stake:Number($('quote-stake').value)});$('quote-message').textContent='Deriv: apuesta '+usd(r.askPrice)+' · pago posible '+usd(r.payout)+' · latencia propuesta '+r.proposalRttMs+' ms. NINGUNA COMPRA.';}catch(e){$('quote-message').textContent=e.message;}};
(async()=>{await poll();try{const d=await get('/api/markets');(d.markets||[]).forEach(market);}catch{}try{const t=await get('/api/training'),x=t.total||{};$('training').innerHTML='<div class="item"><b>Contratos históricos:</b> '+(x.contracts??0)+' · <b>Aciertos:</b> '+(x.wins??'—')+' · <b>Neto:</b> '+usd(x.netUsd)+'</div><div class="item"><b>Estado:</b> '+escapeText(t.trainingModel||'NO_ENTRENADO')+' — '+escapeText(t.warning||'Se necesita importar CSV DEMO.')+'</div>'+(t.latestFour?.length?'<div class="item"><b>Últimas cuatro tandas:</b> '+t.latestFour.map(b=>usd(b.netUsd)).join(' · ')+'</div>':'');}catch(e){$('training').textContent=e.message;}
 if(new URLSearchParams(location.search).get('oauth')==='ok')setMessage('Autorización recibida. Verificando cuenta DEMO...');
 if(typeof EventSource!=='undefined'){const es=new EventSource('/api/market-events');es.onmessage=ev=>{try{market(JSON.parse(ev.data));}catch{}};es.onerror=()=>{$('feed').textContent='Reconectando precios...';};}else setInterval(async()=>{try{(await get('/api/markets')).markets.forEach(market);}catch{}},3000);
 setInterval(poll,15000);
})();
