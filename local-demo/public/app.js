'use strict';
const $=id=>document.getElementById(id);
const fmt=x=>Number.isFinite(x)?Number(x).toLocaleString('es-CO',{maximumFractionDigits:3}):'—';
const usd=x=>Number.isFinite(x)?'US$'+Number(x).toFixed(2):'—';
const signedCents=x=>Number.isFinite(x)?(x>0?'+':x<0?'−':'')+usd(Math.abs(x)/100):'—';
const markets=new Map();let chosen='R_100',loadedVersion=null,lastAutoBalance=0;
let runtimeVersionMismatch=false;
const versionTenths=v=>{const m=/^v?(\d+)\.(\d)$/.exec(String(v||''));return m?Number(m[1])*10+Number(m[2]):null;};
const escapeText=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function get(url){const r=await fetch(url,{cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'HTTP '+r.status);return data;}
async function post(path,data){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Ecopiensa-Local':'1'},body:JSON.stringify(data)});const result=await r.json();if(!r.ok)throw Error(result.error||'HTTP '+r.status);return result;}
async function poll(){try{const s=await get('/api/status');if(loadedVersion&&loadedVersion!==s.version){location.reload();return;}loadedVersion=s.version;$('online').textContent='SERVIDOR LOCAL ACTIVO';
runtimeVersionMismatch=Boolean(s.runtimeVersionMismatch);
if(runtimeVersionMismatch){
 $('online').textContent='VERSION CAMBIADA SIN REINICIO';
 $('update-message').textContent='Node conserva el codigo de una version anterior. Reinicia desde el actualizador antes de operar.';
}
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
  ' · Vencimiento actual 5 ticks; tendencia usa 60 velas de 10 ticks; momentum5 usa 5 velas (=50 ticks).' +
  ' Evaluadores 5/10 ticks (historial no implica ventaja; modo DEMO opcional): '+
  (m?.tickHorizonModels||[]).map(x=>x.durationTicks+'t '+x.direction+
   ' · '+(Number.isFinite(x.observedValidationHitRate)?
   (100*x.observedValidationHitRate).toFixed(1)+'%':'—')+
   ' ('+x.validationDecisions+' pruebas) · p ajustada vs 50/50 '+
   (Number.isFinite(x.familywiseAdjustedP)?
    x.familywiseAdjustedP.toFixed(3):'—')+
   ' · '+x.reason).join(' / ')+
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
async function showOpportunityShadow(){
 try{
  const d=await get('/api/learning/opportunities');
  $('shadow-opportunities-status').textContent='Oportunidades observadas: '+
   d.observations+' · pendientes '+d.pendingInMemory+
   '. Solo dirección del precio a cinco ticks, NO simula beneficios ni controla BUY.';
  const body=$('shadow-opportunities-results');body.replaceChildren();
  for(const x of d.selectedVsUnselected||[]){
   const tr=document.createElement('tr');
   [x.selectedForAttempt?'Elegidas para intento':'Descartadas',
    x.n,x.favorable+' / '+x.n,
    x.hitRatePct===null?'—':x.hitRatePct.toFixed(1)+' %']
    .forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td);});
   body.appendChild(tr);
  }
  if(!body.children.length){
   const tr=document.createElement('tr'),td=document.createElement('td');
   td.colSpan=4;td.textContent='El estudio comenzará con las nuevas olas DEMO, sin enviar órdenes adicionales.';
   tr.appendChild(td);body.appendChild(tr);
  }
 }catch(e){$('shadow-opportunities-status').textContent='Estudio no disponible: '+e.message;}
}
async function showCandlePatternAudit(){
 try{
  const d=await get('/api/learning/candle-patterns');
  const pct=x=>Number.isFinite(x)?(100*x).toFixed(1)+' %':'—';
  const brier=x=>Number.isFinite(x)?x.toFixed(4):'—';
  const latest=d.versions?.at(-1);
  $('candle-pattern-status').textContent='Velas precompra: '+d.independentSamples+
   ' decisiones independientes con contexto · '+d.missingContext+
   ' liquidaciones históricas sin las 20 velas guardadas · '+d.duplicates+
   ' señales/candles duplicadas omitidas · '+d.conclusion+
   '. No cambia las decisiones CALL/PUT.';
  const body=$('candle-pattern-results');body.replaceChildren();
  for(const p of d.patterns||[]){
   const tr=document.createElement('tr');
   [p.pattern,p.n,p.wins,p.losses,signedCents(p.netCents)].forEach((value,i)=>{
    const cell=document.createElement('td');cell.textContent=value;
    if(i===4)cell.className=p.netCents<0?'down':p.netCents>0?'up':'';
    tr.appendChild(cell);
   });body.appendChild(tr);
  }
  if(!body.children.length){
   const tr=document.createElement('tr'),td=document.createElement('td');
   td.colSpan=5;td.textContent='Todavía no hay compras liquidadas con 20 velas registradas. El histórico anterior no contiene esas series.';
   tr.appendChild(td);body.appendChild(tr);
  }
  $('candle-pattern-validation').textContent='Validación cronológica de velas: '+
   d.scored.n+' compras posteriores evaluadas, '+d.fullFolds+
   ' bloques completos. Brier modelo '+brier(d.scored.modelBrier)+
   ' · histórico '+brier(d.scored.historicBrier)+
   ' · neutral '+brier(d.scored.neutralBrier)+
   '. Menor es mejor. '+d.conclusion+' · modelo en sombra, NO compra.';
 }catch(e){$('candle-pattern-status').textContent='Análisis de velas no disponible: '+e.message;}
}
async function showWalkForwardAudit(){
 try{
  const d=await get('/api/learning/walk-forward');
  const v=x=>Number.isFinite(x)?x.toFixed(4):'—';
  $('walk-forward-status').textContent=
   'Modelo logístico DEMO en sombra · '+d.independentDecisions+
   ' decisiones independientes, '+d.scored.n+
   ' predicciones posteriores evaluadas, '+d.fullFolds+
   ' bloques completos · Brier modelo '+v(d.scored.brierModel)+
   ' vs neutral '+v(d.scored.brierNeutral)+
   ' vs histórico '+v(d.scored.brierHistorical)+
   ' · '+d.conclusion+
   '. No modifica CALL/PUT ni permite REAL.';
  const body=$('walk-forward-folds');body.replaceChildren();
  for(const fold of d.folds){
   const tr=document.createElement('tr');
   [fold.fold+(fold.complete?'':' (parcial)'),fold.n,
    v(fold.brierModel),v(fold.brierNeutral),v(fold.brierHistorical)]
    .forEach(value=>{
     const td=document.createElement('td');td.textContent=value;tr.appendChild(td);
    });
   body.appendChild(tr);
  }
  if(!body.children.length){
   const tr=document.createElement('tr'),td=document.createElement('td');
   td.colSpan=5;td.textContent='Faltan liquidaciones con indicadores previos completos.';
   tr.appendChild(td);body.appendChild(tr);
  }
 }catch(e){$('walk-forward-status').textContent='Validación no disponible: '+e.message;}
}
async function showQualityAudit(){
 try{
  const q=await get('/api/learning/quality');
  const pct=x=>Number.isFinite(x)?(100*x).toFixed(1)+' %':'—';
  $('quality-status').textContent='Versión más reciente con operaciones: '+(q.latestVersion||'—')+
   ' · '+q.latest.n+' liquidadas · aciertos '+pct(q.latest.winRate)+
   ' · neto '+signedCents(q.latest.netCents)+
   '. Primer mitad '+pct(q.firstHalf.winRate)+
   ' vs última mitad '+pct(q.secondHalf.winRate)+
   ' · últimas 10: '+pct(q.last10.winRate)+'. Estimador: '+q.mode+
   ' (NO altera compras).';
  const body=$('quality-versions');body.replaceChildren();
  for(const v of q.versions){
   const tr=document.createElement('tr');
   [v.version,v.n,v.wins,v.losses,signedCents(v.netCents)].forEach((value,i)=>{
    const td=document.createElement('td');td.textContent=value;
    if(i===4)td.className=v.netCents<0?'down':v.netCents>0?'up':'';
    tr.appendChild(td);
   });body.appendChild(tr);
  }
  if(!body.children.length){
   const tr=document.createElement('tr'),td=document.createElement('td');
   td.colSpan=5;td.textContent='Aún no hay liquidaciones.';tr.appendChild(td);body.appendChild(tr);
  }
  const fmtMs=x=>Number.isFinite(x)?x.toFixed(1)+' ms':'—';
  $('quality-times').textContent='Medianas de la última versión · señal: ganadoras '+
   fmtMs(q.latency.winners.signalAgeMedianMs)+' / pérdidas '+fmtMs(q.latency.losers.signalAgeMedianMs)+
   ' · confirmación BUY: ganadoras '+fmtMs(q.latency.winners.buyMedianMs)+
   ' / pérdidas '+fmtMs(q.latency.losers.buyMedianMs)+
   ' · propuesta: ganadoras '+fmtMs(q.latency.winners.proposalMedianMs)+
   ' / pérdidas '+fmtMs(q.latency.losers.proposalMedianMs)+
   '. Una diferencia observada no demuestra causalidad.';
  $('quality-projection').textContent='Proyección siguiente tick (investigación): en '+
   q.projection.compared+' casos, superó el error de persistencia '+q.projection.modelBetter+
   ', fue peor '+q.projection.modelWorse+' e igual '+q.projection.modelEqual+
   '. Aprendizaje secuencial en sombra evaluado en '+q.shadow.evaluated+
   ' casos; error Brier '+(q.shadow.brier??'—')+
   ' frente a base '+(q.shadow.baselineBrier??'—')+
   '. No se usa para comprar.';
  const risk=q.operationalWarnings||{};
  const pctBreak=Number.isFinite(risk.estimatedBreakEvenWinRate)?
   (100*risk.estimatedBreakEvenWinRate).toFixed(1)+'%':'—';
  $('quality-risk').textContent='Riesgo DEMO (última versión): últimas 10 '+
   (risk.latest10?.wins||0)+' ganadoras de '+(risk.latest10?.n||0)+
   ', resultado '+signedCents(risk.latest10?.netCents||0)+
   '. Tandas negativas consecutivas '+(risk.latestNegativeBatchStreak||0)+
   '. Aciertos de equilibrio aproximados '+pctBreak+
   '. '+(risk.latest10Loss?'ADVERTENCIA: considerar revisar la estrategia antes de iniciar otra tanda.':
   'Seguir evaluando sin inferir garantías.')+
   ' Este aviso no cambia ni detiene automáticamente las órdenes.';
  const research=q.research||{};
  const groups=research.strengthBands||[];
  const byVersion=q.shadow.byVersion||[];
  const latestShadow=byVersion.find(x=>x.version===q.latestVersion);
  $('quality-five-tick').textContent=
   'Impulso previo de cinco TICKS: '+(research.fiveTickRecorded||0)+
   ' operaciones con dato registrado de '+q.latest.n+
   ' · coincide con señal '+(research.momentumAligned?.n||0)+
   ' (aciertos '+pct(research.momentumAligned?.winRate)+
   '), se opone '+(research.momentumOpposed?.n||0)+
   ' (aciertos '+pct(research.momentumOpposed?.winRate)+
   '). Evaluador secuencial de esta versión: '+(latestShadow?.n||0)+
   ' observaciones, Brier '+(latestShadow?.brier??'—')+
   ' frente a referencia 0,25. Intensidad por grupos: '+
   groups.map(g=>g.range+': '+g.wins+'/'+g.n).join(' · ')+
   '. Análisis exploratorio, NO determina futuras compras.';
 }catch(e){
  $('quality-status').textContent='Auditoría no disponible: '+e.message;
 }
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
async function updateDemoProgram(){
 try{
  const p=await get('/api/demo/program/status');
  const b=await get('/api/demo/burst/status');
  const current=p.programs?.[0]||null;
  const blocked=!!b.risk?.dailyLossStopActive||!!b.risk?.accountFloorStopActive||
   !!b.risk?.pendingOrders||!!b.risk?.unresolvedOrders;
  $('program-start').disabled=runtimeVersionMismatch||!!p.running||!!b.running||blocked;
  $('program-stop').disabled=!p.running;
  $('program-status').textContent=p.running?
   (b.waitingForSignal?'Bot en ESPERAR: analizando índices, sin señal apta · ':'Programa DEMO autorizado en curso · ')+
   'tanda '+(p.round||1)+' de 10. '+
   (current?.globalRisk?
    'Neto '+signedCents(current.globalRisk.netCents)+
    ' · pico '+signedCents(current.globalRisk.peakNetCents)+
    ' · piso '+signedCents(current.globalRisk.floorCents)+'. ':'')+
   (b.currentStakeCents?
    'Apuesta actual USD '+(b.currentStakeCents/100).toFixed(2)+'. ':'')+
   'Siguiente tanda solo tras liquidación y revisión del riesgo. '+
   (current?.profitTargetCents>0?
    'Meta '+signedCents(current.profitTargetCents)+' o diez compras · sin garantía de verde; límite diario vigente.':''):
   current?'Último programa: '+current.state+' · tandas completadas '+
    current.roundsCompleted+'/10 · '+(current.stopReason||'sin errores registrados')+
    (current.continueOnNegativeRound?
     ' · investigación extendida autorizada':
     ' · parada protectora por tanda negativa activa (investigación extendida sin autorizar)'):
    'Sin programa DEMO. Autoriza localmente una secuencia de hasta 100 contratos.';
  const pct=x=>Number.isFinite(x)?x.toFixed(2)+' %':'—';
  const tbody=$('program-history');tbody.replaceChildren();
  for(const x of p.programs||[]){
   const tr=document.createElement('tr');
   [x.id.slice(0,8),x.state,x.roundsCompleted+' / '+x.roundsRequested,
    x.purchasesExecuted,pct(x.winRatePct),pct(x.roiPct),
    signedCents(x.netCents),x.stopReason||'—'].forEach((value,i)=>{
     const td=document.createElement('td');td.textContent=value;
     if(i===6)td.className=x.netCents<0?'down':x.netCents>0?'up':'';
     tr.appendChild(td);
   });tbody.appendChild(tr);
  }
  if(!tbody.children.length){
   const tr=document.createElement('tr'),td=document.createElement('td');
   td.colSpan=8;td.textContent='Aún no se ha autorizado ningún programa.';
   tr.appendChild(td);tbody.appendChild(tr);
  }
  const rounds=$('program-round-results');rounds.replaceChildren();
  for(const round of current?.batches||[]){
   const tr=document.createElement('tr');
   [round.round,round.state,round.settled+' / '+round.requested,
    round.wins+' / '+round.losses,pct(round.winRatePct),
    signedCents(round.grossWinCents),signedCents(-round.grossLossCents),
    signedCents(round.netCents),pct(round.roiPct)].forEach((value,i)=>{
     const td=document.createElement('td');td.textContent=value;
     if(i===7)td.className=round.netCents<0?'down':round.netCents>0?'up':'';
     tr.appendChild(td);
   });rounds.appendChild(tr);
  }
  if(!rounds.children.length){
   const tr=document.createElement('tr'),td=document.createElement('td');
   td.colSpan=9;td.textContent='No hay tandas liquidadas o iniciadas en el programa más reciente.';
   tr.appendChild(td);rounds.appendChild(tr);
  }
  // Contraste descriptivo de operaciones guardadas: no inferir causas por azar.
  const diagnostics=await get('/api/demo/program/diagnostics');
  const detail=$('program-round-diagnostics');
  detail.replaceChildren();
  const analysis=diagnostics.programs?.find(x=>x.programId===current?.id);
  const groupLabel=groups=>(groups||[]).filter(x=>x.settled||x.rejected)
   .map(x=>x.value+': '+x.wins+'/'+x.settled+
    ' · '+signedCents(x.netCents)+(x.rejected?' ('+x.rejected+' sin compra)':'')).join(' | ')||'Sin datos';
  for(const round of analysis?.rounds||[]){
   const tr=document.createElement('tr');
   const timing='BUY '+(Number.isFinite(round.medianBuyLatencyMs)?
    round.medianBuyLatencyMs.toFixed(0)+' ms':'—')+
    ' · intención→BUY '+(Number.isFinite(round.medianIntentToBuyMs)?
    round.medianIntentToBuyMs.toFixed(0)+' ms':'—');
   const rejected=(round.rejectReasons||[]).map(x=>
    x.reason+': '+x.count).join(' | ')||'Ninguno';
   [round.round,groupLabel(round.bySymbol),groupLabel(round.byDuration),
    groupLabel(round.byDirection),groupLabel(round.byPolicy),
    timing,rejected].forEach(value=>{
     const td=document.createElement('td');td.textContent=String(value);
     tr.appendChild(td);
   });detail.appendChild(tr);
  }
  if(!detail.children.length){
   const tr=document.createElement('tr'),td=document.createElement('td');
   td.colSpan=7;td.textContent='Sin operaciones detalladas de este programa.';
   tr.appendChild(td);detail.appendChild(tr);
  }
 }catch(e){$('program-status').textContent='Programa DEMO no disponible: '+e.message;}
}
$('program-start').onclick=async()=>{
 $('program-start').disabled=true;
 $('program-status').textContent='Registrando autorización DEMO 10×10 desde este panel...';
 try{
  const r=await post('/api/demo/program/start',{
   rounds:10,perRound:10,stakeCents:100,symbol:'AUTO',concurrency:5,
   mode:$('program-mode').value,
   globalProtection:$('program-global-guard').checked===true,
   downshiftAfterTwoLosses:$('program-downshift').checked===true,
   profitTargetCents:Number($('program-profit-target').value),
   exitPolicy:Number($('program-profit-target').value)===0?
    'FIXED_TARGET':$('program-exit-policy').value,
   continueAfterNegativeRound:$('program-continue-negative').checked===true,
   confirmation:'CONFIRMAR PROGRAMA DEMO 10X10'
  });
  $('program-status').textContent='Programa '+r.id.slice(0,8)+
   ' autorizado para investigación DEMO · hasta 100 compras de US$1; '+ 
   (r.profitTargetCents>0?
    'salida '+(r.exitPolicy==='TRAILING_GREEN'?'verde progresivo':'meta fija')+
    ' con objetivo '+signedCents(r.profitTargetCents)+
    ', hasta 10 compras por tanda, una a la vez; SIN corte −US$2 por tanda. '+
    (r.continueAfterNegativeRound?'Continúa después de la décima compra en rojo. ':'Pausa si la tanda acaba en rojo. '):
    (r.continueAfterNegativeRound?'continuará tras rondas negativas. ':'parará ante ronda negativa. '))+
   (r.globalProtection?'Protección global de ganancias activa. ':'')+
   (r.downshiftAfterTwoLosses?'Apuesta US$1 → US$0,50 tras dos pérdidas. ':'')+
   'Se detendrá si hay riesgo, datos insuficientes o contrato incierto. REAL bloqueada.';
 }catch(e){$('program-status').textContent='Programa no iniciado: '+e.message;}
 await updateDemoProgram();
};
$('program-stop').onclick=async()=>{
 try{
  const r=await post('/api/demo/program/stop',{});
  $('program-status').textContent=r.stopped?
   'Parada solicitada. Los contratos en curso se concilian y no habrá nuevas tandas.':
   'No hay un programa activo.';
 }catch(e){$('program-status').textContent='No se pudo detener: '+e.message;}
 await updateDemoProgram();
};
$('program-refresh').onclick=updateDemoProgram;

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
  const noSignalReasons={
   NO_MARKET_DATA:'sin cotización',MARKET_UNAVAILABLE:'índice no disponible',
   OHLC_INCOMPLETE:'menos de 60 velas',TICK_OR_PRICE_STALE:'ticks desactualizados',
   NO_CONFIRMED_DIRECTION:'sin consenso CALL/PUT',
   ADAPTIVE_RISK_VETO:'veto del análisis de riesgo',
   INVALID_CANDLE_EPOCH:'vela inválida',CANDLE_ALREADY_USED:'vela ya utilizada',
   READY:'señal lista en la última inspección'
  };
  const inspectionText=last?.inspection?.counts?
   Object.entries(last.inspection.counts).map(([code,n])=>
    n+' índice(s): '+(noSignalReasons[code]||code)).join(' · '):null;
  $('burst-breakdown').textContent=last?
   'Tanda '+last.id.slice(0,8)+': ganancias '+signedCents(last.grossWinCents||0)+
   ' ('+wins+' operaciones), pérdidas '+signedCents(-(last.grossLossCents||0))+
   ' ('+losses+' operaciones), neto '+signedCents(net)+
   '. Rechazadas sin compra: '+(last.rejected||0)+'.':
   'Aún no hay ninguna tanda registrada.';
  $('burst-latency').textContent=latencies.length?(latencies.reduce((a,v)=>a+v,0)/latencies.length/1000).toFixed(3)+' s':'—';
  const risk=b.risk||null;
  const dailyLimit=risk?.dailyLossLimitCents;
  const dailyLoss=risk?.dailyNetLossCents;
  const reset=risk?.nextDailyResetEpoch?
   new Date(risk.nextDailyResetEpoch*1000).toLocaleString('es-CO',{
    timeZone:'America/Bogota',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'
   }):'—';
  const blocked=!!risk?.dailyLossStopActive||!!risk?.accountFloorStopActive;
  $('burst-risk-status').textContent=!risk?'Protección DEMO no disponible.':
   (blocked?'COMPRAS DEMO BLOQUEADAS: ':'Protección DEMO activa: ')+
   'pérdida NETA acumulada del día UTC '+usd((dailyLoss||0)/100)+
   ' de un máximo de '+usd((dailyLimit||0)/100)+
   ' · resultado neto '+signedCents(risk.dailyNetCents||0)+
   ' · pérdidas brutas '+usd((risk.dailyGrossLossCents||0)/100)+
   ' · ganancias brutas '+usd((risk.dailyGrossWinCents||0)/100)+
   ' · exposición reservada '+usd((risk.pendingExposureCents||0)/100)+
   ' · reinicio del cómputo diario a las '+reset+' (Colombia). '+
   (risk.dailyLossStopActive?
    'No se aceptarán nuevas tandas hoy; no se reanudarán automáticamente.':
    risk.accountFloorStopActive?
    'Saldo por debajo del mínimo configurado. No enviar órdenes.':
    'El siguiente inicio requiere autorización local y señal válida.');
  $('burst-start').disabled=runtimeVersionMismatch||!!b.running||d.pendingOrOpen>0||blocked;
  $('reconcile-open').disabled=d.pendingOrOpen===0;
  $('burst-stop').disabled=!b.running;
  if(last){
   $('burst-message').textContent='Tanda '+last.id.slice(0,8)+' · '+last.state+
    ' · '+executed+'/'+last.requested+' ejecutadas · '+settled+' liquidadas · neto '+signedCents(net)+
     (b.inFlight?' · '+b.inFlight+' simultáneas en curso':'')+
    (last.stopReason?' · '+last.stopReason:'')+
    (inspectionText?' · Diagnóstico de la pausa: '+inspectionText:'')+
    (b.running?' · Comprando solo si hay señal nueva y saldo DEMO verificado.':'')+
    (blocked?' · LÍMITE DE RIESGO ACTIVO: no se enviarán nuevas compras.':'');
  }
  const history=$('burst-history');history.replaceChildren();
  for(const batch of b.batches||[]){
   const tr=document.createElement('tr');
   const values=[batch.id.slice(0,8),batch.appVersion||'No registrada',
    batch.strategyVersion||'No registrada',batch.state,
    batch.executed+' / '+batch.requested,batch.wins,batch.losses,batch.rejected,
    signedCents(batch.grossWinCents),signedCents(-batch.grossLossCents),
    signedCents(batch.netCents),batch.stopReason||'—'];
   values.forEach((value,i)=>{const td=document.createElement('td');td.textContent=value;
    if(i===10&&Number.isFinite(batch.netCents))td.className=batch.netCents>0?'up':batch.netCents<0?'down':'';
    tr.appendChild(td);});history.appendChild(tr);
  }
  if(!history.children.length){
   const tr=document.createElement('tr'),td=document.createElement('td');
   td.colSpan=12;td.textContent='Sin tandas registradas.';tr.appendChild(td);history.appendChild(tr);
  }
  const tbody=$('burst-rows');tbody.replaceChildren();
  if(selection.length===0){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=15;td.textContent='No hay órdenes registradas en esta tanda.';tr.appendChild(td);tbody.appendChild(tr);}
  for(const row of selection.slice(0,25)){
   const tr=document.createElement('tr');
   const values=[printableTime(row.createdAtMs),row.appVersion||'No registrada',row.strategyVersion||'No registrada',row.symbol,row.direction+' / '+row.state,
    (row.durationTicks||5)+' ticks',fmt(row.rsi),Number.isFinite(row.signalAgeMs)?row.signalAgeMs+' ms':'—',
    printableTime(row.boughtAtMs),printableTime(row.settledAtMs),
    Number.isFinite(row.buyLatencyMs)?(row.buyLatencyMs/1000).toFixed(3)+' s':'—',
    fmt(row.entryTick),fmt(row.exitTick),
    Number.isFinite(row.pnlCents)?signedCents(row.pnlCents):
     row.state==='REJECTED'?'NO EJECUTADA':row.state==='CANCELLED'?'CANCELADA':'Pendiente',
    row.diagnosis?.code||'SIN_DATOS'];
   values.forEach((value,i)=>{const td=document.createElement('td');td.textContent=value;
    if(i===13&&Number.isFinite(row.pnlCents))td.className=row.pnlCents>=0?'up':'down';
    if(i===14)td.title=row.diagnosis?.detail||row.errorCode||'';
    tr.appendChild(td);
   });tbody.appendChild(tr);
  }
  drawEquity(selection);return {burst:b,orders:d};
 }catch(e){$('burst-message').textContent='No se pudieron consultar las tandas: '+e.message;return null;}
}
$('burst-start').onclick=async()=>{
 const count=Number($('burst-count').value),stakeCents=Number($('burst-stake').value),
   symbol=$('burst-symbol').value,mode=$('burst-mode').value;
 const concurrency=Math.min(count,Number($('burst-concurrency').value));
 const cost=count*stakeCents/100;
 if(!Number.isSafeInteger(count)||count<1||count>10||cost>100){$('burst-message').textContent='La tanda permite de 1 a 10 compras y hasta US$100 en apuestas DEMO.';return;}
 if(['RESEARCH_DEMO','RESEARCH_FIVE_ONLY'].includes(mode)&&stakeCents>100){$('burst-message').textContent='Investigación DEMO: máximo US$1 por compra. Elige una apuesta menor o modo conservador.';return;}
 // El clic en el botón local es la autorización explícita para esta tanda DEMO.
 const confirmation='CONFIRMAR TANDA DEMO';
 $('burst-start').disabled=true;$('burst-message').textContent='Autorizando tanda DEMO. No vuelvas a pulsar.';
 try{const d=await post('/api/demo/burst/start',{count,stakeCents,symbol,concurrency,mode,confirmation});
  $('burst-message').textContent='Tanda '+d.id.slice(0,8)+' autorizada en '+d.mode+'. Máximo '+count+' compras DEMO si se cumplen señales, cotización y riesgo; REAL bloqueada.';
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
$('reconcile-open').onclick=async()=>{
 const button=$('reconcile-open');button.disabled=true;
 $('reconcile-message').textContent='Conciliando contratos OPEN con Deriv DEMO (sin BUY)...';
 try{
  const r=await post('/api/demo/reconcile-open',{});
  $('reconcile-message').textContent=
   'Verificados: '+r.checked+' · liquidados por Deriv: '+r.settled+
   ' · todavía OPEN: '+r.remaining+' · UNKNOWN: '+(r.unknown??0)+
   '. '+(r.results||[]).filter(x=>x.error).map(x=>x.error).join(' · ');
  await updateBurstPanel();await showDemoOrders();await updateDemoProgram();
 }catch(e){$('reconcile-message').textContent='Conciliación sin completar: '+e.message;}
 finally{button.disabled=false;}
};
$('history').onclick=async()=>{try{setMessage('Consultando los últimos contratos oficiales...');const d=await post('/api/demo/profit',{});const t=d.trades||[];$('trades').innerHTML='<p>'+t.length+' registros obtenidos de Deriv (consulta sin comprar).</p><div style="overflow-x:auto"><table><thead><tr><th>Contrato</th><th>Mercado</th><th>P&L</th></tr></thead><tbody>'+t.slice(0,30).map(x=>'<tr><td>'+escapeText(x.contractId)+'</td><td>'+escapeText(x.symbol)+'</td><td>'+usd(x.profit)+'</td></tr>').join('')+'</tbody></table></div>';setMessage('Consulta terminada.');}catch(e){setMessage(e.message);}};
$('quote-btn').onclick=async()=>{try{$('quote-message').textContent='Consultando propuesta (sin comprar)...';const r=await post('/api/demo/quote',{symbol:$('quote-symbol').value,direction:$('quote-dir').value,stake:Number($('quote-stake').value)});$('quote-message').textContent='Deriv: apuesta '+usd(r.askPrice)+' · pago posible '+usd(r.payout)+' · latencia propuesta '+r.proposalRttMs+' ms. NINGUNA COMPRA.';}catch(e){$('quote-message').textContent=e.message;}};
// Supervisor read-only: ninguna orden ni saldo ficticio.
async function showFourBotLab(){
 const grid=$('multibot-grid'),msg=$('multibot-warning');
 if(!grid||!msg)return;
 try{
  const lab=await get('/api/lab/bots');
  if(!lab.readOnly||!Array.isArray(lab.bots)||lab.bots.length!==4)
   throw Error('LAB_INVALID');
  const labels={
   DEMO_OWNER_APPROVAL_ONLY:'DEMO autorizada localmente',
   WAITING_PUBLIC_TICKS:'Esperando ticks',
   WAITING_OPTIONS_DEMO_AUTH:'Sin cuenta DEMO',
   PUBLIC_SHADOW_OBSERVING:'Estudio de ticks sin compras',
   WAITING_PUBLIC_DIGIT_TICKS:'Esperando digitos',
   CONTRACT_DISCOVERY_REQUIRED:'Contratos pendientes de verificar',
   SEPARATE_MT5_DEMO_REQUIRED:'Requiere cuenta MT5 DEMO'
  };
  grid.innerHTML=lab.bots.map(b=>
   '<article class="bot-lab-card">'+
   '<div class="bot-lab-heading"><span>Bot '+escapeText(b.id)+'</span>'+
   '<span>USD '+fmt(b.plannedBudgetUsd)+' previstos</span></div>'+
   '<h3>'+escapeText(b.name)+'</h3>'+
   '<p>'+escapeText(labels[b.status]||'En estudio')+'</p>'+
   '<p>'+escapeText(b.note)+'</p>'+
   '<small>Observaciones: '+fmt(b.samples??0)+'</small>'+
   (Number.isFinite(b.historicalDemoPnlUsd)?
    '<small class="bot-lab-history">Historico DEMO existente, no de USD 100: '+usd(b.historicalDemoPnlUsd)+'</small>':
    '<small class="bot-lab-history">P&L del nuevo estudio: N/D</small>')+
   '</article>'
  ).join('');
  msg.textContent='USD 100 por bot es solo presupuesto planeado, no un saldo separado ni limite aplicado. '+
   'No se habilitan compras adicionales. Opciones comparte DEMO; CFD requiere MT5.';
 }catch(e){
  grid.textContent='Supervisor no disponible';
  msg.textContent=String(e?.message||'ERROR_LAB');
 }
}
(async()=>{await poll();await showDemoOrders();await updateBurstPanel();await updateDemoProgram();try{const d=await get('/api/markets');(d.markets||[]).forEach(market);}catch{}try{const t=await get('/api/training'),x=t.total||{};$('training').innerHTML='<div class="item"><b>Contratos históricos:</b> '+(x.contracts??0)+' · <b>Aciertos:</b> '+(x.wins??'—')+' · <b>Neto:</b> '+usd(x.netUsd)+'</div><div class="item"><b>Estado:</b> '+escapeText(t.trainingModel||'NO_ENTRENADO')+' — '+escapeText(t.warning||'Se necesita importar CSV DEMO.')+'</div>'+(t.latestFour?.length?'<div class="item"><b>Últimas cuatro tandas:</b> '+t.latestFour.map(b=>usd(b.netUsd)).join(' · ')+'</div>':'');}catch(e){$('training').textContent=e.message;}
 if(new URLSearchParams(location.search).get('oauth')==='ok')setMessage('Autorización recibida. Verificando cuenta DEMO...');
 if(typeof EventSource!=='undefined'){const es=new EventSource('/api/market-events');es.onmessage=ev=>{try{market(JSON.parse(ev.data));}catch{}};es.onerror=()=>{$('feed').textContent='Reconectando precios...';};}else setInterval(async()=>{try{(await get('/api/markets')).markets.forEach(market);}catch{}},3000);
 setInterval(poll,15000);setInterval(showDemoOrders,15000);setInterval(updateBurstPanel,4000);setInterval(updateDemoProgram,4000);
 await showAdaptiveLearning();setInterval(showAdaptiveLearning,12000);
 await showQualityAudit();setInterval(showQualityAudit,20000);
 await showWalkForwardAudit();setInterval(showWalkForwardAudit,20000);
 await showCandlePatternAudit();setInterval(showCandlePatternAudit,20000);
 await showOpportunityShadow();setInterval(showOpportunityShadow,20000);
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
