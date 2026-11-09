'use strict';
const $=id=>document.getElementById(id);
const fmt=x=>Number.isFinite(x)?Number(x).toLocaleString('es-CO',{maximumFractionDigits:3}):'—';
const usd=x=>Number.isFinite(x)?'US$'+Number(x).toFixed(2):'—';
const signedCents=x=>Number.isFinite(x)?(x>0?'+':x<0?'−':'')+usd(Math.abs(x)/100):'—';
const markets=new Map();let chosen='R_100',loadedVersion=null,lastAutoBalance=0;
const versionTenths=v=>{const m=/^v?(\d+)\.(\d)$/.exec(String(v||''));return m?Number(m[1])*10+Number(m[2]):null;};
const escapeText=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function get(url){const r=await fetch(url,{cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'HTTP '+r.status);return data;}
async function post(path,data){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Ecopiensa-Local':'1'},body:JSON.stringify(data)});const result=await r.json();if(!r.ok)throw Error(result.error||'HTTP '+r.status);return result;}
async function poll(){try{const s=await get('/api/status');if(loadedVersion&&loadedVersion!==s.version){location.reload();return;}loadedVersion=s.version;$('online').textContent='SERVIDOR LOCAL ACTIVO';
const localNumber=versionTenths(s.version),githubNumber=versionTenths(s.githubVersion);
const outdated=githubNumber!==null&&localNumber!==null&&githubNumber>localNumber;
$('pending-update').hidden=!(s.updatePending||outdated);
$('update-now').textContent=outdated?'Actualizar a v'+s.githubVersion:'Buscar actualizaciones';
$('update-now').classList.toggle('available-update',outdated);$('version').textContent=s.version;$('version-title').textContent='Deriv DEMO · aplicación local '+s.version;
$('github-version').textContent='GitHub pc-local: '+(s.githubVersion?'v'+s.githubVersion:'sin comprobar')+
(s.githubStatus==='offline'?' (sin red)':'');$('connection').textContent=s.connected?'DEMO conectada ('+(s.authorizationMethod||'autenticada')+')':s.authorizationExpired?'Autorización vencida':s.authorizationCorrupt?'Credenciales ilegibles':'Sin conectar';$('feed').textContent=s.marketConnected?'Deriv conectado (verificando ticks)':s.marketError||'Reconectando';
 const age=s.accountAgeSeconds;
 $('balance').textContent=s.account&&Number.isFinite(s.account.balance)?
  usd(s.account.balance)+(Number.isFinite(age)?' · hace '+age+' s'+(age>60?' (revalidación pendiente)':''):''):'Sin saldo confirmado';
 if(s.appId)$('app-id').value=s.appId;
 if(s.connected&&s.account&&Number.isFinite(age)&&age>=50&&Date.now()-lastAutoBalance>60000){
  lastAutoBalance=Date.now();
  void post('/api/demo/refresh',{}).then(()=>poll()).catch(()=>{});
 }}catch(e){$('online').textContent='SIN SERVIDOR · '+e.message;}}
$('update-now').onclick=async()=>{
 const button=$('update-now');
 button.disabled=true;$('update-message').textContent='Buscando e instalando actualización en segundo plano...';
 try{
  const response=await post('/api/system/update-now',{});
  $('update-message').textContent=response.note||'Actualización iniciada. Espera a que el servidor vuelva a responder.';
 }catch(e){$('update-message').textContent='No se pudo iniciar: '+e.message;}
 finally{setTimeout(()=>{button.disabled=false;void poll();},3500);}
};
function marketCard(m){let c=$('market-'+m.symbol);if(!c){c=document.createElement('button');c.className='market';c.id='market-'+m.symbol;c.addEventListener('click',()=>{chosen=m.symbol;draw();});$('markets').appendChild(c);}c.classList.toggle('active',chosen===m.symbol);const direction=m.fresh?m.direction:'ESPERAR';c.innerHTML='<span>'+escapeText(m.symbol)+'</span><b>'+fmt(m.quote)+'</b><div class="'+(direction==='CALL'?'up':direction==='PUT'?'down':'hold')+'">'+direction+'</div><small>RSI '+fmt(m.rsi14)+' · '+(m.candleCount||0)+'/60 velas · '+(m.available?'Activo':'No disponible')+' · '+(m.fresh?'FRESCO':'OBSOLETO')+'</small>';}
function draw(){const m=markets.get(chosen),cv=$('chart'),ctx=cv.getContext('2d');const w=cv.width,h=cv.height;ctx.clearRect(0,0,w,h);const points=m?.lastPrices||[];
 if(points.length>=2){
  const lo=Math.min(...points),hi=Math.max(...points),range=hi-lo||1;
  ctx.strokeStyle='#3ed6bd';ctx.lineWidth=2;ctx.beginPath();
  points.forEach((v,i)=>{const x=10+i*(w-20)/(points.length-1),y=h-10-(v-lo)/range*(h-20);
   if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();
  ctx.fillStyle='#a8c7d4';ctx.font='12px Arial';
  ctx.fillText(chosen+' · '+points.length+' ticks · '+fmt(points.at(-1))+
   (m?.fresh?' (frescos)':' (sin precio fresco)'),12,17);
 }else{
  ctx.fillStyle='#a8c7d4';ctx.font='14px Arial';
  ctx.fillText('Sin ticks públicos recibidos. Consultar diagnóstico del mercado.',20,32);
 }
 drawCandles(m?.candles||[]);
 $('market-analysis').textContent=(m?.symbol||chosen)+': '+(m?.trend||'INDEFINIDA')+
  ' · '+(m?.candleCount||0)+'/60 velas · EMA20 '+fmt(m?.ema20)+
  ' · EMA50 '+fmt(m?.ema50)+' · RSI '+fmt(m?.rsi14)+
  ' · ATR '+fmt(m?.atr14)+' · pendiente '+fmt(m?.slope10)+
  ' · señal '+(m?.direction||'ESPERAR')+' ('+(m?.reason||'SIN_DATOS')+
  '). Intensidad descriptiva '+(m?.signalStrength??'—')+'/100; NO es probabilidad de ganar. '+
  'Próximo tick (proyección experimental): '+fmt(m?.projectedNextTick)+
  ' · MAE modelo '+fmt(m?.modelMae)+' vs persistencia '+fmt(m?.naiveMae)+
  ' · momento 5 ticks '+fmt(m?.fiveTickMomentum)+' · RSI tick14 '+fmt(m?.tickRsi14)+
  ' · prueba retrospectiva 5 ticks '+(Number.isFinite(m?.fiveTickStudy?.hitRate)?
   (100*m.fiveTickStudy.hitRate).toFixed(1)+'%':'—')+
  ' de '+(m?.fiveTickStudy?.holdoutCount??0)+' casos. NO validado para trading.';
}
function drawCandles(candles){
 const canvas=$('candles');if(!canvas)return;
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 ctx.clearRect(0,0,w,h);
 if(candles.length===0){ctx.fillStyle='#a8c7d4';ctx.fillText('Cargando 60 velas históricas de Deriv...',15,25);return;}
 const lo=Math.min(...candles.map(c=>c.low)),hi=Math.max(...candles.map(c=>c.high));
 const spread=hi-lo||1,priceY=v=>h-15-(v-lo)/spread*(h-45);
 const space=(w-50)/candles.length;
 ctx.font='12px Arial';ctx.fillStyle='#a8c7d4';ctx.fillText(chosen+' · '+candles.length+' velas completas de 10 ticks',13,18);
 candles.forEach((c,i)=>{
  const x=26+i*space+space/2,color=c.close>=c.open?'#39d8ae':'#ff8d95';
  ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(x,priceY(c.high));ctx.lineTo(x,priceY(c.low));ctx.stroke();
  const top=Math.min(priceY(c.open),priceY(c.close)),height=Math.max(2,Math.abs(priceY(c.open)-priceY(c.close)));
  ctx.fillRect(x-Math.min(10,space*.29),top,Math.min(20,space*.58),height);
 });
}
function syncMarketOptions(m){
 if(!m.available||!/^(R_[0-9]{2,3}|1HZ[0-9]{2,3}V)$/.test(m.symbol))return;
 for(const id of ['burst-symbol','quote-symbol']){
  const select=$(id);
  if(!select||Array.from(select.options).some(x=>x.value===m.symbol))continue;
  const item=document.createElement('option');item.value=m.symbol;
  item.textContent=m.symbol+' · activo Deriv';select.appendChild(item);
 }
}
function market(m){markets.set(m.symbol,m);syncMarketOptions(m);marketCard(m);if(m.symbol===chosen)draw();}
function setMessage(text){$('auth-message').textContent=text;}
function printableTime(ms){if(!Number.isFinite(ms))return '—';return new Date(ms).toLocaleTimeString('es-CO',{hour12:false});}
let latestOrders=[],latestBatchId=null;
function drawEquity(rows){
 const cv=$('equity-chart');if(!cv)return;
 const ctx=cv.getContext('2d'),w=cv.width,h=cv.height;ctx.clearRect(0,0,w,h);
 const closed=[...rows].filter(x=>x.state==='SETTLED'&&Number.isFinite(x.pnlCents)).reverse();
 const points=[0];for(const row of closed)points.push(points.at(-1)+row.pnlCents/100);
 if(points.length<2){ctx.fillStyle='#9ab9c8';ctx.font='14px Arial';ctx.fillText('Pendiente de operaciones DEMO liquidadas',20,30);return;}
 const lo=Math.min(0,...points),hi=Math.max(0,...points),span=hi-lo||1;
 const x=i=>25+i*(w-50)/(points.length-1),y=v=>h-20-(v-lo)/span*(h-55);
 ctx.strokeStyle='#507488';ctx.beginPath();ctx.moveTo(25,y(0));ctx.lineTo(w-25,y(0));ctx.stroke();
 ctx.strokeStyle=points.at(-1)>=0?'#45e1ac':'#ff9a9a';ctx.lineWidth=2;ctx.beginPath();
 points.forEach((v,i)=>{if(i===0)ctx.moveTo(x(i),y(v));else ctx.lineTo(x(i),y(v));});ctx.stroke();
 ctx.fillStyle='#a8c7d4';ctx.font='13px Arial';ctx.fillText('P&L DEMO acumulado '+usd(points.at(-1)),12,17);
}
async function showAdaptiveLearning(){
 try{
  const d=await get('/api/learning');
  $('learning-status').textContent='SQLite DEMO: '+d.sampleRaw+
   ' liquidaciones · '+d.independent+' decisiones independientes · '+d.blocked+
   ' combinaciones vetadas. Requiere al menos '+d.minIndependent+
   ' decisiones y '+d.minHoldout+' en prueba posterior.';
  const body=$('learning-table');body.replaceChildren();
  for(const c of (d.groups||[]).slice(0,24)){
   const tr=document.createElement('tr');
   [c.symbol,c.direction,c.independent,
    c.holdoutCount+' ('+c.holdoutWins+' ganadas / '+c.holdoutLosses+' perdidas)',
    signedCents(c.holdoutNetCents),c.status].forEach((v,i)=>{
    const td=document.createElement('td');td.textContent=v;
    if(i===5&&c.blocked)td.className='down';
    tr.appendChild(td);
   });body.appendChild(tr);
  }
  if(!body.children.length){
   const tr=document.createElement('tr'),td=document.createElement('td');
   td.colSpan=6;td.textContent='Aún no hay suficiente historial DEMO.';
   tr.appendChild(td);body.appendChild(tr);
  }
 }catch(e){$('learning-status').textContent='Aprendizaje no disponible: '+e.message;}
}
async function updateBurstPanel(){
 try{
  const [b,d]=await Promise.all([get('/api/demo/burst/status'),get('/api/demo/orders')]);
  latestOrders=d.orders||[];
  const last=b.batches?.[0]||null;latestBatchId=last?.id||null;
  const selection=last?latestOrders.filter(x=>x.batchId===last.id):latestOrders;
  const closed=selection.filter(x=>x.state==='SETTLED'&&Number.isFinite(x.pnlCents));
  // Totales de todas las órdenes SQLite, no solo de las últimas 60 filas visibles.
  const net=last?.netCents??0,wins=last?.wins??0,losses=last?.losses??0;
  const settled=last?.settled??0,executed=last?.executed??0;
  const latencies=selection.map(x=>x.buyLatencyMs).filter(Number.isFinite);
  $('burst-net').textContent=signedCents(net);
  $('burst-net').className=net>0?'up':net<0?'down':'';
  $('burst-net-label').textContent=settled===0?'Sin contratos liquidados':
   net>0?'GANANCIA NETA':net<0?'PÉRDIDA NETA':'RESULTADO NETO CERO';
  $('burst-settled').textContent=executed+' ejecutadas / '+settled+' liquidadas (de '+(last?.requested||0)+')';
  $('burst-winloss').textContent=wins+' / '+losses+(settled?' ('+(100*wins/settled).toFixed(1)+'%)':'');
  $('burst-breakdown').textContent=last?
   'Tanda '+last.id.slice(0,8)+': ganancias '+signedCents(last.grossWinCents||0)+
   ' ('+wins+' operaciones), pérdidas '+signedCents(-(last.grossLossCents||0))+
   ' ('+losses+' operaciones), neto '+signedCents(net)+
   '. Rechazadas sin compra: '+(last.rejected||0)+'.':
   'Aún no hay ninguna tanda registrada.';
  $('burst-latency').textContent=latencies.length?(latencies.reduce((a,v)=>a+v,0)/latencies.length/1000).toFixed(3)+' s':'—';
  $('burst-start').disabled=!!b.running||d.pendingOrOpen>0;
  $('burst-stop').disabled=!b.running;
  if(last){
   $('burst-message').textContent='Tanda '+last.id.slice(0,8)+' · '+last.state+
    ' · '+executed+'/'+last.requested+' ejecutadas · '+settled+' liquidadas · neto '+signedCents(net)+
     (b.inFlight?' · '+b.inFlight+' simultáneas en curso':'')+
    (last.stopReason?' · '+last.stopReason:'')+
    (b.running?' · Comprando solo si hay señal nueva y saldo DEMO verificado.':'');
  }
  const history=$('burst-history');history.replaceChildren();
  for(const batch of b.batches||[]){
   const tr=document.createElement('tr');
   const values=[batch.id.slice(0,8),batch.appVersion||'No registrada',
    batch.strategyVersion||'No registrada',batch.state,
    batch.executed+' / '+batch.requested,batch.wins,batch.losses,batch.rejected,
    signedCents(batch.grossWinCents),signedCents(-batch.grossLossCents),
    signedCents(batch.netCents)];
   values.forEach((value,i)=>{const td=document.createElement('td');td.textContent=value;
    if(i===10&&Number.isFinite(batch.netCents))td.className=batch.netCents>0?'up':batch.netCents<0?'down':'';
    tr.appendChild(td);});history.appendChild(tr);
  }
  if(!history.children.length){
   const tr=document.createElement('tr'),td=document.createElement('td');
   td.colSpan=11;td.textContent='Sin tandas registradas.';tr.appendChild(td);history.appendChild(tr);
  }
  const tbody=$('burst-rows');tbody.replaceChildren();
  if(selection.length===0){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=14;td.textContent='No hay órdenes registradas en esta tanda.';tr.appendChild(td);tbody.appendChild(tr);}
  for(const row of selection.slice(0,25)){
   const tr=document.createElement('tr');
   const values=[printableTime(row.createdAtMs),row.appVersion||'No registrada',row.strategyVersion||'No registrada',row.symbol,row.direction+' / '+row.state,
    fmt(row.rsi),Number.isFinite(row.signalAgeMs)?row.signalAgeMs+' ms':'—',
    printableTime(row.boughtAtMs),printableTime(row.settledAtMs),
    Number.isFinite(row.buyLatencyMs)?(row.buyLatencyMs/1000).toFixed(3)+' s':'—',
    fmt(row.entryTick),fmt(row.exitTick),
    Number.isFinite(row.pnlCents)?signedCents(row.pnlCents):
     row.state==='REJECTED'?'NO EJECUTADA':row.state==='CANCELLED'?'CANCELADA':'Pendiente',
    row.diagnosis?.code||'SIN_DATOS'];
   values.forEach((value,i)=>{const td=document.createElement('td');td.textContent=value;
    if(i===12&&Number.isFinite(row.pnlCents))td.className=row.pnlCents>=0?'up':'down';
    if(i===13)td.title=row.diagnosis?.detail||row.errorCode||'';
    tr.appendChild(td);
   });tbody.appendChild(tr);
  }
  drawEquity(selection);return {burst:b,orders:d};
 }catch(e){$('burst-message').textContent='No se pudieron consultar las tandas: '+e.message;return null;}
}
$('burst-start').onclick=async()=>{
 const count=Number($('burst-count').value),stakeCents=Number($('burst-stake').value),
   symbol=$('burst-symbol').value;
 const concurrency=Math.min(count,Number($('burst-concurrency').value));
 const cost=count*stakeCents/100;
 if(!Number.isSafeInteger(count)||count<1||count>10||cost>10){$('burst-message').textContent='La tanda permite de 1 a 10 compras y hasta US$10 en apuestas.';return;}
 // El clic en el botón local es la autorización explícita para esta tanda DEMO.
 const confirmation='CONFIRMAR TANDA DEMO';
 $('burst-start').disabled=true;$('burst-message').textContent='Autorizando tanda DEMO. No vuelvas a pulsar.';
 try{const d=await post('/api/demo/burst/start',{count,stakeCents,symbol,concurrency,confirmation});
  $('burst-message').textContent='Tanda '+d.id.slice(0,8)+' autorizada. Se enviarán como máximo '+count+' contratos virtuales; REAL bloqueada.';
 }catch(e){$('burst-message').textContent='Tanda no iniciada: '+e.message;}
 finally{await updateBurstPanel();}
};
$('burst-stop').onclick=async()=>{
 try{const r=await post('/api/demo/burst/stop',{});$('burst-message').textContent=r.stopped?'Se detendrán nuevas compras tras concluir la actual.':'No hay tanda activa.';}
 catch(e){$('burst-message').textContent=e.message;}
 await updateBurstPanel();
};
$('burst-check').onclick=updateBurstPanel;

async function refreshExternalWatchlist(){
 try{
  const d=await get('/api/watchlist');
  const items=d.assets||[];
  $('watchlist').replaceChildren();
  for(const a of items){
   const el=document.createElement('div');el.className='item';
   el.textContent=a.name+' · '+(a.available&&a.quote!==null?fmt(a.quote):'NO DISPONIBLE')+
    ' · '+(a.symbol||'sin símbolo')+' · '+(a.ageSeconds===null?'sin cotización':a.ageSeconds+' s')+
    ' · cotización informativa';
   $('watchlist').appendChild(el);
  }
 }catch(e){$('watchlist').textContent='Observatorio no disponible: '+e.message;}
}

// No order is placed by MCP; an explicit owner confirmation in this local panel is required.
let demoIntentId=null,demoIntentState=null;
async function showDemoOrders(){
 try {
  const d=await get('/api/demo/orders');
  const rows=d.orders||[];
  const awaiting=rows.find(x=>x.state==='PENDING_APPROVAL');
  demoIntentId=awaiting?.id||null;
  demoIntentState=awaiting?.state||null;
  $('demo-confirm').disabled=!demoIntentId;
  $('demo-cancel').disabled=!demoIntentId;
  $('demo-order-stats').textContent='DEMO · histórico acumulado '+d.campaignPurchases+
   ' compras ejecutadas, sin límite global de tandas · apuesta histórica '+usd((d.campaignGrossCents||0)/100)+
   ' · pendientes '+d.pendingOrOpen+
   (awaiting?' · SOLICITUD '+awaiting.source+' '+awaiting.symbol+' '+awaiting.direction+
     ' '+usd(awaiting.stakeCents/100)+' (requiere aprobación local)':'')+
   '\nÚltimas: '+rows.slice(0,6).map(x=>x.state+' '+x.symbol+' '+(x.pnlCents===null?'pendiente':usd(x.pnlCents/100))).join(' | ');
  return d;
 }catch(e){$('demo-order-stats').textContent='No disponible: '+e.message;return null;}
}
$('demo-refresh').onclick=showDemoOrders;
$('demo-intent').onclick=async()=>{
 try{
  $('demo-message').textContent='Comprobando saldo y señal: no se ha enviado ninguna compra.';
  const params={symbol:$('quote-symbol').value,direction:$('quote-dir').value,
   stakeCents:Math.round(Number($('quote-stake').value)*100)};
  const q=await post('/api/demo/intent',params);
  $('demo-message').textContent='Solicitud '+q.id.slice(0,8)+' creada; no se envió BUY. Pulsa Confirmar compra DEMO para autorizarla.';
 }catch(e){$('demo-message').textContent='Solicitud bloqueada: '+e.message;}
 await showDemoOrders();
};
$('demo-confirm').onclick=async()=>{
 if(!demoIntentId)return;
 // El clic humano es la confirmación de la única orden DEMO seleccionada.
  const confirmation='CONFIRMAR COMPRA DEMO';
 const id=demoIntentId;
 $('demo-confirm').disabled=true;$('demo-cancel').disabled=true;
 $('demo-message').textContent='Comprobando saldo y cotización oficiales. No repitas el clic.';
 try{
  const r=await post('/api/demo/confirm',{id,confirmation});
  $('demo-message').textContent='Resultado: '+r.state+
   (r.contractId?' · contrato '+r.contractId:'')+
   (r.pnlCents!==null&&r.pnlCents!==undefined?' · neto '+usd(r.pnlCents/100):'')+
   '. Si está UNKNOWN o OPEN, no abras una nueva compra antes de conciliar.';
 }catch(e){
  $('demo-message').textContent='No reintentes sin revisar el estado en Deriv: '+e.message;
 }finally{await showDemoOrders();}
};
$('demo-cancel').onclick=async()=>{
 if(!demoIntentId)return;
 try{await post('/api/demo/cancel',{id:demoIntentId});$('demo-message').textContent='Solicitud cancelada sin comprar.';}
 catch(e){$('demo-message').textContent=e.message;}
 await showDemoOrders();
};
$('demo-reconcile').onclick=async()=>{
 const orders=await showDemoOrders();
 const unresolved=(orders?.orders||[]).find(x=>x.state==='OPEN'&&x.contractId);
 if(!unresolved){$('demo-message').textContent='No hay contrato OPEN con ID registrado. Para UNKNOWN revisa Deriv manualmente; no se reenvía BUY.';return;}
 try{
  const r=await post('/api/demo/reconcile',{id:unresolved.id});
  $('demo-message').textContent='Conciliación '+r.state+(r.pnlCents!==undefined?' · '+usd(r.pnlCents/100):'');
 }catch(e){$('demo-message').textContent='No se pudo conciliar: '+e.message;}
 await showDemoOrders();
};

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
(async()=>{await poll();await showDemoOrders();await updateBurstPanel();try{const d=await get('/api/markets');(d.markets||[]).forEach(market);}catch{}try{const t=await get('/api/training'),x=t.total||{};$('training').innerHTML='<div class="item"><b>Contratos históricos:</b> '+(x.contracts??0)+' · <b>Aciertos:</b> '+(x.wins??'—')+' · <b>Neto:</b> '+usd(x.netUsd)+'</div><div class="item"><b>Estado:</b> '+escapeText(t.trainingModel||'NO_ENTRENADO')+' — '+escapeText(t.warning||'Se necesita importar CSV DEMO.')+'</div>'+(t.latestFour?.length?'<div class="item"><b>Últimas cuatro tandas:</b> '+t.latestFour.map(b=>usd(b.netUsd)).join(' · ')+'</div>':'');}catch(e){$('training').textContent=e.message;}
 if(new URLSearchParams(location.search).get('oauth')==='ok')setMessage('Autorización recibida. Verificando cuenta DEMO...');
 if(typeof EventSource!=='undefined'){const es=new EventSource('/api/market-events');es.onmessage=ev=>{try{market(JSON.parse(ev.data));}catch{}};es.onerror=()=>{$('feed').textContent='Reconectando precios...';};}else setInterval(async()=>{try{(await get('/api/markets')).markets.forEach(market);}catch{}},3000);
 setInterval(poll,15000);setInterval(showDemoOrders,15000);setInterval(updateBurstPanel,4000);
 await showAdaptiveLearning();setInterval(showAdaptiveLearning,12000);
 async function diagnose(){
  try{
   const d=await get('/api/market/diagnostic');
   $('market-diagnostic').textContent='WebSocket '+(d.connected?'conectado':'desconectado')+
    ' · símbolos '+d.symbolsReceived+' · índices '+d.activeMarkets+
    ' · históricos '+d.historyLoaded+' · ticks '+d.ticksReceived+
    ' · últ. tick '+(d.secondsSinceTick??'—')+' s'+
    ' · estado '+(d.diagnosticCode||d.error||'PENDIENTE');
   $('feed').textContent=d.activeMarkets>0&&d.secondsSinceTick!==null&&d.secondsSinceTick<15?
    'Deriv en vivo · '+d.activeMarkets+' índices':'Deriv: '+(d.error||d.diagnosticCode||'sin cotizaciones');
  }catch(e){$('market-diagnostic').textContent='Diagnóstico no disponible: '+e.message;}
 }
 await diagnose();setInterval(diagnose,5000);
 setInterval(async()=>{try{(await get('/api/markets')).markets.forEach(market);}catch{}},5000);
 await refreshExternalWatchlist();setInterval(refreshExternalWatchlist,15000);
})();
