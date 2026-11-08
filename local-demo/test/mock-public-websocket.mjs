// WebSocket de PRUEBA, 100% local, nunca conecta a Deriv ni compra contratos.
class TestPublicSocket extends EventTarget {
 static OPEN=1;
 constructor(url){
  super();if(!String(url).endsWith('/ws/public'))throw Error('ONLY_PUBLIC_WS_ALLOWED');
  this.readyState=0;
  queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});
 }
 send(raw){
  const req=JSON.parse(raw);let response;
  if(req.active_symbols){
   response={msg_type:'active_symbols',req_id:req.req_id,active_symbols:[
    {underlying_symbol:'R_100',underlying_symbol_name:'Volatility 100 Index'},
    {underlying_symbol:'1HZ100V',underlying_symbol_name:'Volatility 100 (1s) Index'},
    {underlying_symbol:'frxEURUSD',underlying_symbol_name:'EUR/USD'}]};
  }else if(req.ticks_history){
   const epoch=Math.floor(Date.now()/1000);
   const prices=Array.from({length:660},(_,i)=>100+(i*.002)+Math.sin(i/10)*.12);
   const times=Array.from({length:660},(_,i)=>epoch-659+i);
   response={msg_type:'history',req_id:req.req_id,echo_req:{ticks_history:req.ticks_history},
    history:{prices,times}};
  }else if(req.ticks){
   response={msg_type:'tick',req_id:req.req_id,echo_req:{ticks:req.ticks},
    tick:{symbol:req.ticks,quote:101.412,epoch:Math.floor(Date.now()/1000),pip_size:3}};
  }else{throw Error('UNKNOWN_PUBLIC_REQUEST');}
  queueMicrotask(()=>{
   if(this.readyState===1)this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(response)}));
  });
 }
 close(){
  if(this.readyState===3)return;
  this.readyState=3;
  this.dispatchEvent(new Event('close'));
 }
}
globalThis.WebSocket=TestPublicSocket;
