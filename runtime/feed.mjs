import {validatePublicHistory} from '../scripts/public_history_validation.mjs';
export const PUBLIC_ENDPOINT='wss://api.derivws.com/trading/v1/options/ws/public';
const keys=new Set(['ticks_history','ticks','ping','forget','subscribe','count','end','style','req_id']);
export function encodePublicRequest(message) {
  if(!message||Object.getPrototypeOf(message)!==Object.prototype||Object.keys(message).some(k=>!keys.has(k)))throw Error('Solo solicitudes de datos públicos');
  if(['ticks_history','ticks','ping','forget'].filter(k=>Object.hasOwn(message,k)).length!==1)throw Error('Solicitud pública ambigua');
  return JSON.stringify(message);
}
export class PublicFeed {
  constructor({symbol,onHistory,onTick,onStatus=()=>{},socketFactory=url=>new WebSocket(url),now=()=>Date.now()}) {
    Object.assign(this,{symbol,onHistory,onTick,onStatus,socketFactory,now});
    this.socket=null;this.stopped=true;this.attempt=0;this.serial=0;this.lastMessage=0;
  }
  status(state,code=''){this.onStatus({state,code,at:Math.floor(this.now()/1000)});}
  start(){
    this.stopped=false;this.connect();
    this.watchdog=setInterval(()=>{
      if(this.socket&&this.now()-this.lastMessage>30000)this.fail(this.socket,'STALE_FEED');
      else if(this.socket?.readyState===1)this.socket.send(encodePublicRequest({ping:1}));
    },10000);this.watchdog.unref?.();
  }
  connect(){
    if(this.stopped)return;
    const request=++this.serial;
    this.status('connecting');
    let socket;
    try{socket=this.socketFactory(PUBLIC_ENDPOINT);}catch{return this.retry('SOCKET_CREATION_FAILED');}
    this.socket=socket;this.lastMessage=this.now();this.ready=false;
    this.syncTimer=setTimeout(()=>this.fail(socket,'HISTORY_TIMEOUT'),15000);this.syncTimer.unref?.();
    socket.addEventListener('open',()=>{
      if(socket!==this.socket||this.stopped)return;
      this.status('syncing');
      socket.send(encodePublicRequest({ticks_history:this.symbol,count:150,end:'latest',style:'ticks',req_id:request}));
    });
    socket.addEventListener('message',event=>{
      if(socket!==this.socket||this.stopped)return;
      const raw=String(event.data);
      if(raw.length>1000000)return this.fail(socket,'MESSAGE_TOO_LARGE');
      let data;try{data=JSON.parse(raw);}catch{return this.fail(socket,'INVALID_JSON');}
      if(!data||typeof data!=='object')return this.fail(socket,'INVALID_MESSAGE');
      if(data.error)return this.fail(socket,'PUBLIC_API_ERROR');
      if(data.msg_type==='history') {
        if(this.ready)return;
        if(data.req_id!==request||data.echo_req?.ticks_history!==this.symbol)return this.fail(socket,'HISTORY_IDENTITY_MISMATCH');
        const result=validatePublicHistory(data.history,{expectedCount:150,nowMs:this.now()});
        if(!result.ok||Math.abs(this.now()/1000-result.lastEpoch)>30)return this.fail(socket,'INVALID_OR_STALE_HISTORY');
        clearTimeout(this.syncTimer);
        this.lastMessage=this.now();this.lastEpoch=result.lastEpoch;
        this.onHistory(data.history.prices.map(Number));
        this.ready=true;this.attempt=0;
        socket.send(encodePublicRequest({ticks:this.symbol,subscribe:1,req_id:request}));
        this.status('live');
      } else if(data.msg_type==='tick'&&this.ready) {
        const obj=data.tick,quote=Number(obj?.quote),epoch=Number(obj?.epoch);
        if(obj?.symbol!==this.symbol||!Number.isFinite(quote)||quote<=0||!Number.isSafeInteger(epoch)||
          epoch<this.lastEpoch||epoch-this.lastEpoch>30||Math.abs(this.now()/1000-epoch)>30)return this.fail(socket,'INVALID_OR_STALE_TICK');
        this.lastMessage=this.now();this.lastEpoch=epoch;
        this.onTick({symbol:this.symbol,quote,epoch});
      }
    });
    socket.addEventListener('error',()=>this.fail(socket,'NETWORK_ERROR'));
    socket.addEventListener('close',()=>this.fail(socket,'CONNECTION_CLOSED'));
  }
  fail(socket,code){
    if(this.stopped||socket!==this.socket)return;
    this.socket=null;this.ready=false;clearTimeout(this.syncTimer);
    try{socket.close();}catch{}
    this.retry(code);
  }
  retry(code){
    if(this.stopped)return;
    this.status('disconnected',code);
    const delay=Math.min(30000,1000*2**Math.min(this.attempt++,5));
    this.retryTimer=setTimeout(()=>this.connect(),delay);this.retryTimer.unref?.();
  }
  stop(){
    this.stopped=true;clearTimeout(this.retryTimer);clearTimeout(this.syncTimer);clearInterval(this.watchdog);
    const socket=this.socket;this.socket=null;
    try{socket?.close();}catch{}
  }
}
