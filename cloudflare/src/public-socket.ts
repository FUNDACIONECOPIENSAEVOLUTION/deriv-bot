import { PUBLIC_ENDPOINT } from '../../runtime/feed.mjs';

/** Outgoing Workers upgrade restricted to the public market-data endpoint. */
export class PublicSocket extends EventTarget {
  readyState = 0;
  private socket: WebSocket | null = null;
  private abort = new AbortController();
  constructor(url: string, ctx: DurableObjectState) {
    super();
    if (url !== PUBLIC_ENDPOINT) throw Error('PUBLIC_ENDPOINT_ONLY');
    ctx.waitUntil(this.connect(url).catch(() => {
      if (this.readyState !== 3) this.dispatchEvent(new Event('error'));
      this.close();
    }));
  }
  private async connect(url: string) {
    const response = await fetch(url.replace(/^wss:/, 'https:'), {headers:{Upgrade:'websocket'},signal:this.abort.signal});
    const socket = response.webSocket;
    if (response.status !== 101 || !socket) {
      await response.body?.cancel(); throw Error('PUBLIC_UPGRADE_FAILED');
    }
    if (this.readyState === 3) {socket.accept();socket.close();return;}
    this.socket=socket;
    socket.addEventListener('message', event=>this.dispatchEvent(new MessageEvent('message',{data:event.data})));
    socket.addEventListener('error', ()=>this.dispatchEvent(new Event('error')));
    socket.addEventListener('close', ()=>{this.readyState=3;this.dispatchEvent(new Event('close'));});
    socket.accept();this.readyState=1;this.dispatchEvent(new Event('open'));
  }
  send(message: string) {
    if(this.readyState!==1||!this.socket)throw Error('PUBLIC_SOCKET_NOT_OPEN');
    this.socket.send(message);
  }
  close() {
    if(this.readyState===3)return;
    this.readyState=3;this.abort.abort();
    try{this.socket?.close(1000,'Public feed stopped');}catch{/* Already closed. */}
  }
}
