import { openDerivSocket } from './deriv-websocket';
/**
 * DEMO market compatibility diagnostics. READ ONLY and public WebSocket only.
 * Never receives OAuth credentials, OTP, or order references.
 */
export const CONTRACTS_PUBLIC_URL='wss://api.derivws.com/trading/v1/options/ws/public';
export const MARKET_SYMBOLS=Object.freeze(['R_100','1HZ100V'] as const);
type MarketSymbol=typeof MARKET_SYMBOLS[number];
type ContractSummary={
  symbol:MarketSymbol;
  state:'AVAILABLE'|'REJECTED'|'UNRECOGNIZED';
  code?:string;
  count:number|null;
  call:boolean|null;
  put:boolean|null;
};
const safeCode=(code:unknown)=>typeof code==='string'&&/^[a-zA-Z0-9_]{1,64}$/.test(code)?code:'REJECTED';
export function parseContractsFor(raw:unknown,symbol:MarketSymbol,reqId:number):ContractSummary{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    return {symbol,state:'UNRECOGNIZED',count:null,call:null,put:null};
  const msg=raw as Record<string,unknown>;
  if(msg.req_id!==reqId)
    return {symbol,state:'UNRECOGNIZED',count:null,call:null,put:null};
  const err=msg.error??(Array.isArray(msg.errors)?msg.errors[0]:null);
  if(err){
    const obj=err&&typeof err==='object'&&!Array.isArray(err)?err as Record<string,unknown>:{};
    return {symbol,state:'REJECTED',code:safeCode(obj.code),count:null,call:null,put:null};
  }
  const value=msg.contracts_for;
  if(!value||typeof value!=='object'||Array.isArray(value))
    return {symbol,state:'UNRECOGNIZED',count:null,call:null,put:null};
  const obj=value as Record<string,unknown>;
  // Old and recent schemas may differ. An unrecognized schema must not
  // be presented as "no available trades".
  const list=Array.isArray(obj.available)?obj.available:Array.isArray(obj.contracts)?obj.contracts:null;
  if(!list||list.length>2000)return {symbol,state:'UNRECOGNIZED',count:null,call:null,put:null};
  const names=new Set(list.filter((v):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v))
    .map(x=>x.contract_type).filter((v):v is string=>typeof v==='string'));
  return {symbol,state:'AVAILABLE',count:list.length,call:names.has('CALL'),put:names.has('PUT')};
}
export async function checkPublicContractCompatibility():Promise<{readOnly:true;results:ContractSummary[]}>{
  const socket=await openDerivSocket(CONTRACTS_PUBLIC_URL,'public',8000);
  return new Promise((resolve,reject)=>{
    let finished=false;
    const pending=new Map<number,MarketSymbol>([[51,'R_100'],[52,'1HZ100V']]);
    const answers=new Map<MarketSymbol,ContractSummary>();
    const finish=(error?:Error)=>{
      if(finished)return;finished=true;clearTimeout(timer);
      try{socket.close(1000,'Market check complete');}catch{}
      if(error)reject(error);
      else resolve({readOnly:true,results:MARKET_SYMBOLS.map(symbol=>answers.get(symbol)??{
        symbol,state:'UNRECOGNIZED' as const,count:null,call:null,put:null
      })});
    };
    const timer=setTimeout(()=>finish(Error('DERIV_MARKET_TIMEOUT')),8000);
    socket.addEventListener('message',event=>{
      if(finished)return;
      try{
        if(typeof event.data!=='string'||event.data.length>32768)return;
        const obj=JSON.parse(event.data) as Record<string,unknown>;
        const symbol=pending.get(obj.req_id as number);
        if(!symbol)return;
        const answer=parseContractsFor(obj,symbol,obj.req_id as number);
        answers.set(symbol,answer);
        pending.delete(obj.req_id as number);
        if(!pending.size)finish();
      }catch{finish(Error('DERIV_MARKET_INVALID_RESPONSE'));}
    });
    socket.addEventListener('error',()=>finish(Error('DERIV_MARKET_SOCKET_ERROR')));
    socket.addEventListener('close',()=>finish(Error('DERIV_MARKET_SOCKET_CLOSED')));
    try{
      for(const [reqId,symbol] of pending)
        socket.send(JSON.stringify({contracts_for:symbol,req_id:reqId}));
    }catch{finish(Error('DERIV_MARKET_SEND_FAILED'));}
  });
}
