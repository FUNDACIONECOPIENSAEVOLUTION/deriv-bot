import http from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {readConfig,seedHistory,onTick,invalidatePosition,entryBlock,analyzeSignal} from './core.mjs';
import {addCandleTick,mergeCandleHistory,publicMarketSnapshot,PROVIDERS,equityPoints} from './market-data.mjs';
import {Store} from './store.mjs';
import {PublicFeed} from './feed.mjs';

const dashboard=readFileSync(new URL('./dashboard.html',import.meta.url),'utf8');
export async function startService({env=process.env,connect=true,listenPort,clock=()=>Math.floor(Date.now()/1000),socketFactory}={}) {
  const config=readConfig(env),filename=resolve(env.DATA_DIR||'data','paper.sqlite');
  const store=new Store(filename,config,clock());
  let state=store.load(),market={state:'starting',at:clock()},stopping=false;
  let candles=[],chartHistoryStatus='waiting';
  // Un reinicio conserva el registro de la posición como VOID, nunca como una ganancia.
  let result=invalidatePosition(state,'PROCESS_RESTART',clock());
  store.commit(result.state,[{type:'runtime_started',epoch:clock(),mode:'PAPER'},...result.events]);state=result.state;
  const feed=new PublicFeed({
    symbol:config.symbol,socketFactory,now:()=>clock()*1000,
    onHistory:prices=>{const next=seedHistory(state,prices);store.commit(next);state=next;},
    onCandles:rows=>{candles=mergeCandleHistory(candles,rows);},
    onChartStatus:status=>{chartHistoryStatus=status;},
    onTick:tick=>{
      const result=onTick(state,config,tick,{nowEpoch:clock()});
      candles=addCandleTick(candles,tick);
      store.commit(result.state,result.events,tick);state=result.state;
      for(const event of result.events)console.log(JSON.stringify(event));
    },
    onStatus:next=>{
      market=next;
      const result=next.state==='disconnected'?invalidatePosition(state,next.code,clock()):{state,events:[]};
      store.commit(result.state,[{type:'market_status',epoch:clock(),...next},...result.events]);state=result.state;
      console.log(JSON.stringify({type:'market_status',...next}));
    },
  });
  const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  const json=(res,status,value)=>{res.writeHead(status,{...security,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  const server=http.createServer((req,res)=>{
    if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');return json(res,405,{error:'Solo lectura'});}
    if(req.url==='/api/health')return json(res,stopping?503:200,{status:stopping?'stopping':'ok',mode:'PAPER',market:market.state});
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/market'){
      const provider=url.searchParams.get('provider');
      if(provider!=='binance'&&provider!=='coinbase')return json(res,400,{error:'Proveedor público no permitido'});
      publicMarketSnapshot(provider).then(data=>json(res,200,data)).catch(()=>json(res,503,{error:'Datos públicos no disponibles'}));return;
    }
    if(req.url==='/api/status')return json(res,200,{mode:'PAPER',source:'Deriv public WebSocket',hypothetical:true,serverManaged:false,config,
      providers:PROVIDERS,decision:analyzeSignal(state.prices),equity:equityPoints(store.recentTrades(),state.balanceCents),
      chart:{provider:'deriv',symbol:config.symbol,intervalSeconds:60,candles,historyStatus:chartHistoryStatus},
      balanceCents:state.balanceCents,profitCents:state.balanceCents-config.initialCents,
      goalProfitCents:7000,daily:state.daily,position:state.position,acceptedTicks:state.acceptedTicks,
      completed:state.completed,wins:state.wins,voided:state.voided,entryBlock:entryBlock(state,config,clock()),
      lastQuote:state.lastQuote,lastEpoch:state.lastEpoch,quoteAgeSeconds:state.lastEpoch===null?null:clock()-state.lastEpoch,
      market,trades:store.recentTrades(),events:store.recentEvents(),
      note:'Simulación con payout hipotético; no replica contratos Deriv ni demuestra rentabilidad.'});
    if(req.url==='/api/trades.csv'){
      const fields=['id','status','symbol','direction','entryEpoch','exitEpoch','entryQuote','exitQuote','stakeCents','pnlCents','reason'];
      // Exportación completa: no limita silenciosamente el historial a lo mostrado en pantalla.
      const rows=store.db.prepare('SELECT data FROM trades ORDER BY rowid').iterate();
      res.writeHead(200,{...security,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="paper-trades.csv"'});
      res.write(fields.join(',')+'\n');
      for(const row of rows){const t=JSON.parse(row.data);res.write(fields.map(k=>'"'+String(t[k]??'').replaceAll('"','""')+'"').join(',')+'\n');}
      return res.end();
    }
    if(req.url==='/'){
      const nonce=randomBytes(16).toString('base64');
      res.writeHead(200,{...security,'Content-Type':'text/html; charset=utf-8',
        'Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});
      return res.end(dashboard.replaceAll('__NONCE__',nonce));
    }
    return json(res,404,{error:'Ruta desconocida'});
  });
  server.requestTimeout=10000;server.headersTimeout=10000;
  try {
    await new Promise((ok,fail)=>{server.once('error',fail);server.listen(listenPort??Number(env.PORT||8789),env.HOST||'127.0.0.1',ok);});
  } catch(e){store.close();throw e;}
  if(connect)feed.start();
  const address=server.address();
  return {server,store,feed,config,url:'http://127.0.0.1:'+address.port,readState:()=>structuredClone(state),
    async stop(){
      if(stopping)return;stopping=true;feed.stop();
      const result=invalidatePosition(state,'SERVICE_STOPPED',clock());
      store.commit(result.state,[{type:'runtime_stopped',epoch:clock()},...result.events]);state=result.state;
      await new Promise(ok=>server.close(ok));store.close();
    }};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  startService().then(service=>{
    console.log(JSON.stringify({type:'listening',url:service.url,mode:'PAPER'}));
    for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>service.stop().then(()=>process.exit(0)));
  }).catch(error=>{console.error('PAPER_RUNTIME_FAILED: '+error.message);process.exitCode=1;});
}
