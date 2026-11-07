import { demoQuoteRequest, demoSocketUrl, parseDemoQuote } from './deriv-demo';
import { buildDemoBuyRequest, parseDemoBuyResponse, parseDemoSettlement,
  type DemoBuyAck, type DemoQuoteForBuy, type DemoSettlement, type DemoTradeGate } from './demo-trade-guards';

/**
 * A single broker DEMO session. It NEVER connects to ws/real and never
 * automatically retries a buy. Callers must durably reserve the operation
 * BEFORE the unique buy request leaves this process.
 */
const safeCode=(error:unknown)=>{
  const value=error&&typeof error==='object'&&'code' in error?(error as {code?:unknown}).code:null;
  return typeof value==='string'&&/^[A-Za-z0-9_]{1,64}$/.test(value)?value:'REJECTED';
};

export function validateDemoBrokerUrl(url:string):string {
  return demoSocketUrl({data:{url}});
}

export async function withDemoSocket<T>(wsUrl:string,work:(socket:WebSocket)=>Promise<T>):Promise<T> {
  validateDemoBrokerUrl(wsUrl);
  const response=await fetch(wsUrl.replace(/^wss:/,'https:'),{
    headers:{Upgrade:'websocket'},redirect:'manual',signal:AbortSignal.timeout(8000)
  });
  const socket=response.webSocket;
  if(response.status!==101||!socket) {
    await response.body?.cancel();
    throw Error('DEMO_WEBSOCKET_UNAVAILABLE');
  }
  socket.accept();
  try{return await work(socket);}
  finally{try{socket.close(1000,'Demo session finished');}catch{/* already closed */}}
}

export function requestDemoMessage(socket:WebSocket,message:Record<string,unknown>,timeoutMs=8000):Promise<Record<string,unknown>> {
  if(!Number.isInteger(message.req_id)||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)
    throw Error('DEMO_REQUEST_INVALID');
  return new Promise((resolve,reject)=>{
    let finished=false;
    const done=(error?:Error,value?:Record<string,unknown>)=>{
      if(finished)return;finished=true;clearTimeout(timer);
      socket.removeEventListener('message',onMessage);
      socket.removeEventListener('close',onClose);
      socket.removeEventListener('error',onError);
      if(error)reject(error);else resolve(value!);
    };
    const onMessage=(event:MessageEvent)=>{
      try {
        if(typeof event.data!=='string'||event.data.length>32768)throw Error('DEMO_RESPONSE_INVALID');
        const raw=JSON.parse(event.data);
        if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('DEMO_RESPONSE_INVALID');
        if(raw.req_id!==message.req_id)return;
        done(undefined,raw);
      }catch{done(Error('DEMO_RESPONSE_INVALID'));}
    };
    const onClose=()=>done(Error('DEMO_CONNECTION_LOST'));
    const onError=()=>done(Error('DEMO_CONNECTION_ERROR'));
    const timer=setTimeout(()=>done(Error('DEMO_REQUEST_TIMEOUT')),timeoutMs);
    socket.addEventListener('message',onMessage);
    socket.addEventListener('close',onClose);
    socket.addEventListener('error',onError);
    try{socket.send(JSON.stringify(message));}catch{done(Error('DEMO_REQUEST_SEND_FAILED'));}
  });
}

export function parseDemoProposalForBuy(raw:Record<string,unknown>,quotedAt:number,
  direction:'UP'|'DOWN'='UP'):DemoQuoteForBuy {
  const priced=parseDemoQuote(raw,direction);
  if(!priced.accepted)throw Error('DEMO_PROPOSAL_REJECTED');
  if(typeof priced.askPrice!=='number'||typeof priced.payout!=='number')throw Error('DEMO_PROPOSAL_INVALID_PRICE');
  const proposal=raw.proposal as Record<string,unknown>;
  if(typeof proposal.id!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(proposal.id))
    throw Error('DEMO_PROPOSAL_ID_INVALID');
  return {id:proposal.id,askPrice:priced.askPrice,payout:priced.payout,
    quotedAt,symbol:'R_100',contractType:direction==='UP'?'CALL':'PUT',durationTicks:20,stake:0.10};
}

export type DemoAttemptOutcome =
 | {state:'REJECTED';code:string}
 | {state:'OPEN';contractId:number;buyCents:number;purchaseTime:number};

/** Must be called ONLY after explicit owner action and after verifying DEMO account. */
export type DemoBuySessionArgs={
  wsUrl:string;
  gate:Omit<DemoTradeGate,'socketUrl'|'quote'|'now'>;
  reserve:(quote:DemoQuoteForBuy)=>Promise<number>;
  acknowledge:(intentId:number,ack:DemoBuyAck)=>Promise<void>;
};
export async function buyDemoOverSocket(socket:WebSocket,args:DemoBuySessionArgs):Promise<DemoAttemptOutcome> {
    if(args.gate.signal!=='UP'&&args.gate.signal!=='DOWN')throw Error('NO_APPROVED_SIGNAL');
    const proposal=await requestDemoMessage(socket,{...demoQuoteRequest(args.gate.signal)});
    if(proposal.error||proposal.errors||proposal.msg_type!=='proposal'){
      // A rejected amount is never increased: report the denial and stop.
      return {state:'REJECTED',code:safeCode(proposal.error||(proposal.errors as unknown[])?.[0])};
    }
    const quote=parseDemoProposalForBuy(proposal,Math.floor(Date.now()/1000),args.gate.signal);
    const buy=buildDemoBuyRequest({...args.gate,quote,socketUrl:args.wsUrl,now:Math.floor(Date.now()/1000)});
    // reserve() creates a durable BUY_UNKNOWN intent and enforces daily quotas
    // synchronously. If it throws, no buy message is ever sent.
    const intent=await args.reserve(quote);
    try{
      const reply=await requestDemoMessage(socket,{...buy});
      const ack=parseDemoBuyResponse(reply);
      await args.acknowledge(intent,ack);
      if(!ack.accepted)return {state:'REJECTED',code:ack.code};
      return {state:'OPEN',contractId:ack.contractId,buyCents:ack.buyCents,purchaseTime:ack.purchaseTime};
    }catch{
      // The broker MAY have purchased despite a lost ACK. Never retry.
      throw Error('DEMO_BUY_OUTCOME_UNKNOWN');
    }
}

export async function buySingleDemoContract(args:DemoBuySessionArgs):Promise<DemoAttemptOutcome>{
  return withDemoSocket(args.wsUrl,socket=>buyDemoOverSocket(socket,args));
}

export async function readDemoSettlement(wsUrl:string,contractId:number,expectedType?:'CALL'|'PUT'):Promise<DemoSettlement|null> {
  if(!Number.isSafeInteger(contractId)||contractId<=0)throw Error('DEMO_CONTRACT_INVALID_ID');
  return withDemoSocket(wsUrl,async(socket)=>{
    const raw=await requestDemoMessage(socket,{proposal_open_contract:1,contract_id:contractId,req_id:3});
    if(raw.error||raw.errors)throw Error('DEMO_CONTRACT_STATUS_REJECTED');
    return parseDemoSettlement(raw,contractId,expectedType);
  });
}
