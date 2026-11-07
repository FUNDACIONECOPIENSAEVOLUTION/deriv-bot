/** GitHub Pages public-only PAPER replay. No accounts, OTP, buy or trading API. */
import {readConfig,initialState,onTick} from '../runtime/core.mjs';
import {validatePublicHistory} from './public_history_validation.mjs';

const $=id=>document.getElementById(id);
const money=c=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'USD'}).format(c/100);
const when=e=>new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(e*1000));
const safeNumber=x=>Number.isFinite(x)?x.toFixed(2):'—';
let last=null;
const config=readConfig({TRADING_MODE:'PAPER',PAPER_ENABLED:'true',SYMBOL:'R_100',
  INITIAL_USD:'10',STAKE_USD:'0.35',DAILY_LOSS_USD:'3.50',PAPER_COST_USD:'0',
  PAYOUT_HYPOTHESIS_PCT:'80',HORIZON_TICKS:'5',COOLDOWN_TICKS:'5',MAX_DAILY_TRADES:'10'});

async function getPublicHistory(){
 const endpoint='wss://api.derivws.com/trading/v1/options/ws/public';
 return new Promise((resolve,reject)=>{
  let finished=false,socket;
  try{socket=new WebSocket(endpoint);}catch{reject(Error('DERIV_SOCKET_UNAVAILABLE'));return;}
  const finish=(code,result)=>{
   if(finished)return;finished=true;clearTimeout(timer);
   try{socket.close();}catch{}
   if(code)reject(Error(code));else resolve(result);
  };
  const timer=setTimeout(()=>finish('DERIV_PUBLIC_TIMEOUT'),14000);
  socket.addEventListener('open',()=>{
   socket.send(JSON.stringify({ticks_history:'R_100',count:1000,end:'latest',
     style:'ticks',req_id:911}));
  });
  socket.addEventListener('error',()=>finish('DERIV_PUBLIC_CONNECTION_ERROR'));
  socket.addEventListener('close',()=>finish('DERIV_PUBLIC_CONNECTION_CLOSED'));
  socket.addEventListener('message',event=>{
   try{
    if(typeof event.data!=='string'||event.data.length>1000000)return;
    const data=JSON.parse(event.data);
    if(data.req_id!==911)return;
    if(data.error)throw Error('DERIV_PUBLIC_REJECTED');
    if(data.msg_type!=='history'||data.echo_req?.ticks_history!=='R_100')
      throw Error('DERIV_PUBLIC_IDENTITY_INVALID');
    const check=validatePublicHistory(data.history,{expectedCount:1000});
    if(!check.ok)throw Error('DERIV_PUBLIC_'+check.code);
    finish(null,data.history);
   }catch(error){finish(error instanceof Error?error.message:'DERIV_PUBLIC_INVALID');}
  });
 });
}
function runPaper(history){
 const prices=history.prices.map(Number),times=history.times.map(Number);
 let state=initialState(config,times[0]);const open=new Map(),trades=[];
 let checked=0,peak=1000,maxDrawdown=0;
 for(let i=0;i<prices.length;i++){
  const out=onTick(state,config,{symbol:'R_100',epoch:times[i],quote:prices[i]},{nowEpoch:times[i]});
  state=out.state;checked++;
  for(const event of out.events){
   if(event.type==='paper_opened')open.set(event.trade.id,event.trade);
   if(event.type==='paper_closed'){
    const t=event.trade,entry=open.get(t.id);if(!entry)throw Error('PAPER_LEDGER_MISMATCH');
    open.delete(t.id);
    trades.push({...t,directionName:t.direction===1?'CALL':'PUT',
      rsi:entry.decision.rsi,volatility:entry.decision.volatility});
    peak=Math.max(peak,state.balanceCents);
    maxDrawdown=Math.max(maxDrawdown,peak-state.balanceCents);
   }
  }
  if(trades.length===10)break;
 }
 return {source:'PUBLIC_DERIV_HISTORICAL_REPLAY',mode:'PAPER',brokerOrders:0,
  trades,historyCount:prices.length,processedTicks:checked,
  pnlCents:state.balanceCents-1000,balanceCents:state.balanceCents,maxDrawdownCents:maxDrawdown};
}
function display(report){
 last=report;
 $('results').hidden=false;
 const trades=report.trades,wins=trades.filter(t=>t.won).length;
 $('count').textContent=trades.length+'/10';
 $('winrate').textContent=trades.length?(wins/trades.length*100).toFixed(1)+' %':'—';
 $('net').textContent=money(report.pnlCents);
 $('net').className=report.pnlCents>=0?'up':'down';
 $('balance').textContent=money(report.balanceCents);
 const calls=trades.filter(t=>t.directionName==='CALL'),puts=trades.filter(t=>t.directionName==='PUT');
 const counts=x=>x.filter(t=>t.won).length+'/'+x.length;
 $('sides').textContent='CALL: '+counts(calls)+' aciertos · PUT: '+counts(puts)+
  ' aciertos · drawdown máximo virtual '+money(report.maxDrawdownCents)+
  '. Con pago supuesto 80 %, el equilibrio requiere 55,56 % de acierto antes de costos.';
 const body=$('rows');body.replaceChildren();
 trades.forEach((t,i)=>{
  const tr=document.createElement('tr');
  for(const value of [i+1,t.directionName,when(t.entryEpoch),
    safeNumber(t.entryQuote)+' → '+safeNumber(t.exitQuote),
    safeNumber(t.rsi),t.won?'Ganó':'Perdió',money(t.pnlCents)]){
   const td=document.createElement('td');td.textContent=String(value);tr.appendChild(td);
  }
  tr.lastElementChild.className=t.pnlCents>=0?'up':'down';
  body.appendChild(tr);
 });
 $('footer').textContent='Se procesaron '+report.processedTicks+' de '+report.historyCount+
  ' ticks históricos. '+(trades.length===10?'Ensayo terminado.':
  'Se encontraron menos de diez entradas válidas; las faltantes no se inventan.')+
  ' Ninguna orden ha sido enviada a cuentas Deriv.';
 $('export').disabled=!trades.length;
}
$('start').addEventListener('click',async()=>{
 const btn=$('start');btn.disabled=true;
 $('status').textContent='Consultando historial público R_100. Sin cuenta de trading ni compras.';
 try{
  const source=await getPublicHistory();
  const report=runPaper(source);
  display(report);
  $('status').textContent='Simulación PAPER finalizada: '+report.trades.length+
    ' contratos hipotéticos · resultado '+money(report.pnlCents)+
    '. El bot eligió la dirección; no se compraron contratos Deriv.';
 }catch(error){
  $('status').textContent='No se realizaron operaciones. Motivo: '+
   (error instanceof Error?error.message:'ERROR_DESCONOCIDO')+'.';
 }finally{btn.disabled=false;}
});
$('export').addEventListener('click',()=>{
 if(!last)return;
 const columns=['numero','direccion','entrada_epoch','salida_epoch','entrada','salida','rsi','volatilidad',
  'ganada','stake_centavos','pnl_centavos','modo'];
 const values=last.trades.map((t,i)=>[i+1,t.directionName,t.entryEpoch,t.exitEpoch,
  t.entryQuote,t.exitQuote,t.rsi,t.volatility,t.won,t.stakeCents,t.pnlCents,'PAPER_NO_BROKER']);
 const csv=[columns,...values].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
 const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='ecopiensa-10-paper-historico.csv';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
});
