import {validatePublicHistory} from '../scripts/public_history_validation.mjs';
import {validateCandles} from './market-data.mjs';
export const PUBLIC_ENDPOINT='wss://api.derivws.com/trading/v1/options/ws/public';
const keys=new Set(['ticks_history','ticks','ping','forget','subscribe','count','end','style','req_id','granularity']);
export function encodePublicRequest(message) {
  if(!message||Object.getPrototypeOf(message)!==Object.prototype||Object.keys(message).some(k=>!keys.has(k)))throw Error('Solo solicitudes de datos públicos');
  if(['ticks_history','ticks','ping','forget'].filter(k=>Object.hasOwn(message,k)).length!==1)throw Error('Solicitud pública ambigua');
  return JSON.stringify(message);
}
export class PublicFeed {
  constructor({symbol,onHistory,onTick,onCandles,onChartStatus=()=>{},onStatus=()=>{},socketFactory=url=>new WebSocket(url),now=()=>Date.now()}) {
    Object.assign(this,{symbol,onHistory,onTick,onCandles,onChartStatus,onStatus,socketFactory,now});
    this.socket=null;this.stopped=true;this.attempt=0;this.serial=0;this.lastMessage=0;
  }
  status(state,code='',detail=''){this.onStatus({state,code,detail,at:Math.floor(this.now()/1000)});}
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
    const candleRequest=request+1_000_000;
    let candlesReceived=false;
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
      if(data.error){if(data.req_id===candleRequest){this.onChartStatus('unavailable');return;}return this.fail(socket,'PUBLIC_API_ERROR',typeof data.error.code==='string'&&/^[A-Za-z0-9_]{1,64}$/.test(data.error.code)?data.error.code:'');}
      if(data.msg_type==='candles'&&this.onCandles){
        if(candlesReceived)return;
        if(data.req_id!==candleRequest||data.echo_req?.ticks_history!==this.symbol||data.echo_req?.style!=='candles'||data.echo_req?.granularity!==60){this.onChartStatus('invalid');return;}
        try{
          if(!Array.isArray(data.candles))throw Error();
          const candles=validateCandles(data.candles.map(c=>({time:c.epoch,open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close)})),Math.floor(this.now()/1000));
          this.onCandles(candles);candlesReceived=true;this.onChartStatus('ready');
        }catch{this.onChartStatus('invalid');}
        return;
      }
      if(data.msg_type==='history') {
        if(this.ready)return;
        if(data.req_id!==request||data.echo_req?.ticks_history!==this.symbol)return this.fail(socket,'HISTORY_IDENTITY_MISMATCH');
        const result=validatePublicHistory(data.history,{expectedCount:150,nowMs:this.now()});
        if(!result.ok||Math.abs(this.now()/1000-result.lastEpoch)>30)return this.fail(socket,'INVALID_OR_STALE_HISTORY');
        clearTimeout(this.syncTimer);
        this.lastMessage=this.now();this.lastEpoch=result.lastEpoch;
        this.onHistory(data.history.prices.map(Number));
        this.ready=true;this.attempt=0;
        if(this.onCandles){this.onChartStatus('loading');socket.send(encodePublicRequest({ticks_history:this.symbol,count:180,end:'latest',style:'candles',granularity:60,req_id:candleRequest}));}
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
    socket.addEventListener('error',()=>this.fail(socket,/^UPGRADE_HTTP_[1-5][0-9]{2}$/.test(socket.errorCode??'')?socket.errorCode:'NETWORK_ERROR',String(socket.errorDetail??'').slice(0,160)));
    socket.addEventListener('close',()=>this.fail(socket,'CONNECTION_CLOSED'));
  }
  fail(socket,code,detail=''){
    if(this.stopped||socket!==this.socket)return;
    this.socket=null;this.ready=false;clearTimeout(this.syncTimer);
    try{socket.close();}catch{}
    this.retry(code,detail);
  }
  retry(code,detail=''){
    if(this.stopped)return;
    this.status('disconnected',code,detail);
    const delay=Math.min(30000,1000*2**Math.min(this.attempt++,5));
    this.retryTimer=setTimeout(()=>this.connect(),delay);this.retryTimer.unref?.();
  }
  stop(){
    this.stopped=true;clearTimeout(this.retryTimer);clearTimeout(this.syncTimer);clearInterval(this.watchdog);
    const socket=this.socket;this.socket=null;
    try{socket?.close();}catch{}
  }
}
