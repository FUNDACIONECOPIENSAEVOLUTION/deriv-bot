/**
 * Outbound Deriv WebSocket handshake for Cloudflare Workers.
 * The old fetch(https, {Upgrade:'websocket'}) handshake was rejected by Deriv.
 * Cloudflare supports native outgoing new WebSocket(wss://...), like Deriv's own examples.
 * A socket is NEVER an instruction to trade. Both hosts/paths are allowlisted.
 */
export type DerivSocketChannel='public'|'demo';
export function validateDerivSocketAddress(value:string,channel:DerivSocketChannel):string {
  let url:URL;
  try {url=new URL(value);} catch {throw Error('DERIV_SOCKET_URL_INVALID');}
  if(url.protocol!=='wss:'||url.hostname!=='api.derivws.com'||url.port||url.username||url.password
    ||url.hash||url.pathname!=='/trading/v1/options/ws/'+channel)
    throw Error('DERIV_SOCKET_CHANNEL_FORBIDDEN');
  if(channel==='public'&&(url.search||url.searchParams.size!==0))
    throw Error('DERIV_SOCKET_PUBLIC_QUERY_FORBIDDEN');
  if(channel==='demo'&&(url.searchParams.size!==1||!url.searchParams.get('otp')))
    throw Error('DERIV_SOCKET_DEMO_OTP_REQUIRED');
  return url.href;
}
/**
 * Await the native WebSocket open event before sending any proposal.
 * On timeout or failure close the socket and return a bounded code:
 * never log the OTP or full URL.
 */
export async function openDerivSocket(value:string,channel:DerivSocketChannel,timeoutMs=8000):Promise<WebSocket> {
  const url=validateDerivSocketAddress(value,channel);
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)throw Error('DERIV_SOCKET_TIMEOUT_INVALID');
  let ws:WebSocket;
  try {ws=new WebSocket(url);}
  catch {throw Error('DERIV_SOCKET_CONNECT_FAILED');}
  return new Promise<WebSocket>((resolve,reject)=>{
    let finished=false;
    const cleanup=()=>{clearTimeout(timer);ws.removeEventListener('open',onOpen);ws.removeEventListener('error',onError);ws.removeEventListener('close',onClose);};
    const fail=(code:string)=>{if(finished)return;finished=true;cleanup();try{ws.close();}catch{}reject(Error(code));};
    const onOpen=()=>{if(finished)return;finished=true;cleanup();resolve(ws);};
    const onError=()=>fail('DERIV_SOCKET_CONNECT_ERROR');
    const onClose=()=>fail('DERIV_SOCKET_CONNECT_CLOSED');
    const timer=setTimeout(()=>fail('DERIV_SOCKET_CONNECT_TIMEOUT'),timeoutMs);
    ws.addEventListener('open',onOpen);
    ws.addEventListener('error',onError);
    ws.addEventListener('close',onClose);
    if(ws.readyState===WebSocket.OPEN)onOpen();
  });
}
