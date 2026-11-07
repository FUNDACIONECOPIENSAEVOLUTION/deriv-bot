import { DurableObject } from 'cloudflare:workers';
import { readConfig, initialState, seedHistory, onTick, invalidatePosition, entryBlock, analyzeSignal } from '../../runtime/core.mjs';
import { addCandleTick, mergeCandleHistory, validateCandles, publicMarketSnapshot, PROVIDERS, equityPoints, type Candle } from '../../runtime/market-data.mjs';
import { PublicFeed, type MarketStatus } from '../../runtime/feed.mjs';
import dashboard from '../../runtime/dashboard.html?raw';
import { PublicSocket } from './public-socket';
import { readPublicArbitrageSnapshot } from '../../runtime/cross-exchange.mjs';
export { DerivDemoConnection } from './deriv-demo';

type EngineState = ReturnType<typeof initialState>;
type PaperEvent = {type:string;epoch:number;trade?:{id:string;status:string;entryEpoch:number}};
type ExportPage = {trades:Record<string,unknown>[];next:string|null};
const EXPERIMENT='owner-usd10-v1', CHECKPOINT_MS=60_000;
const now=()=>Math.floor(Date.now()/1000);
const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(value:unknown,status=200,headers={})=>Response.json(value,{status,headers:{...security,...headers}});

/** One coordination atom: the owner's single virtual USD 10 experiment. */
export class PaperExperiment extends DurableObject<Env> {
  private config:ReturnType<typeof readConfig>;
  private state!:EngineState;
  private running=false;
  private market:MarketStatus={state:'stopped',at:now()};
  private checkpointAt=0;
  private feed:PublicFeed|null=null;
  private candles:Candle[]=[];
  private chartHistoryStatus='waiting';

  constructor(ctx:DurableObjectState,env:Env) {
    super(ctx,env);this.config=readConfig(env);
    ctx.blockConcurrencyWhile(async()=>{
      const sql=ctx.storage.sql;
      sql.exec('CREATE TABLE IF NOT EXISTS experiment (id INTEGER PRIMARY KEY CHECK(id=1), fingerprint TEXT NOT NULL, data TEXT NOT NULL)');
      sql.exec('CREATE TABLE IF NOT EXISTS trades (id TEXT PRIMARY KEY, entry_epoch INTEGER NOT NULL, data TEXT NOT NULL)');
      sql.exec('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, epoch INTEGER NOT NULL, data TEXT NOT NULL)');
      sql.exec('CREATE TABLE IF NOT EXISTS arb_observations (id INTEGER PRIMARY KEY AUTOINCREMENT, captured_at INTEGER NOT NULL, payload TEXT NOT NULL)');
      const saved=sql.exec<{fingerprint:string;data:string}>('SELECT fingerprint,data FROM experiment WHERE id=1').toArray()[0];
      if(saved) {
        if(saved.fingerprint!==JSON.stringify(this.config))throw Error('EXPERIMENT_CONFIG_CHANGED');
        const record=JSON.parse(saved.data);
        this.state=record.state;this.running=record.running===true;
        if(record.candles?.length){try{this.candles=validateCandles(record.candles,now());this.chartHistoryStatus='cached';}catch{this.candles=[];}}
        const recovered=invalidatePosition(this.state,'OBJECT_RESTART',now());
        this.market={state:this.running?'recovering':'stopped',at:now()};
        this.persist(recovered.state,recovered.events);
      } else this.persist(initialState(this.config,now()));
      if(this.running&&await ctx.storage.getAlarm()===null)await ctx.storage.setAlarm(Date.now()+CHECKPOINT_MS);
    });
  }

  private persist(next:EngineState,events:PaperEvent[]=[],running=this.running) {
    const checkpointAt=Date.now();
    const envelope=JSON.stringify({state:next,running,market:this.market,checkpointAt,candles:this.candles});
    this.ctx.storage.transactionSync(()=>{
      const sql=this.ctx.storage.sql;
      sql.exec('INSERT INTO experiment VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',JSON.stringify(this.config),envelope);
      for(const event of events) {
        sql.exec('INSERT INTO events(epoch,data) VALUES(?,?)',event.epoch,JSON.stringify(event));
        if(event.trade)sql.exec('INSERT INTO trades VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',event.trade.id,event.trade.entryEpoch,JSON.stringify(event.trade));
      }
      if(events.length)sql.exec('DELETE FROM events WHERE id < (SELECT COALESCE(MAX(id),0)-500 FROM events)');
    });
    this.state=next;this.running=running;this.checkpointAt=checkpointAt;
  }

  private ensureFeed() {
    if(!this.running||this.feed)return;
    this.feed=new PublicFeed({symbol:this.config.symbol,
      socketFactory:url=>new PublicSocket(url,this.ctx),
      onHistory:prices=>{this.state=seedHistory(this.state,prices);},
      onCandles:candles=>{this.candles=mergeCandleHistory(this.candles,candles);},
      onChartStatus:status=>{this.chartHistoryStatus=status;},
      onTick:tick=>{
        const result=onTick(this.state,this.config,tick,{nowEpoch:now()});
        this.candles=addCandleTick(this.candles,tick);
        // Persist all position changes before caching them. Only intermediate
        // price windows and tick counters may be lost between checkpoints.
        if(result.events.length)this.persist(result.state,result.events);
        else this.state=result.state;
      },
      onStatus:next=>{
        this.market=next;
        const result=next.state==='disconnected'?invalidatePosition(this.state,next.code||'DISCONNECTED',now()):{state:this.state,events:[]};
        this.persist(result.state,[{type:'market_status',epoch:now(),...next},...result.events]);
        console.log(JSON.stringify({type:'market_status',state:next.state,code:next.code}));
      },
    });
    this.feed.start();
  }

  async start() {
    if(!this.running)this.persist(this.state,[{type:'paper_started',epoch:now()}],true);
    await this.ctx.storage.setAlarm(Date.now()+CHECKPOINT_MS);
    this.ensureFeed();return {mode:'PAPER',running:true};
  }
  async stop() {
    const result=invalidatePosition(this.state,'OWNER_PAUSED',now());
    this.market={state:'stopped',at:now()};
    this.persist(result.state,[...result.events,{type:'paper_stopped',epoch:now()}],false);
    this.feed?.stop();this.feed=null;await this.ctx.storage.deleteAlarm();
    return {mode:'PAPER',running:false};
  }
  async watchdog() {
    if(!this.running)return {running:false};
    await this.ctx.storage.setAlarm(Date.now()+CHECKPOINT_MS);
    this.ensureFeed();this.persist(this.state);return {running:true};
  }
  async alarm(){await this.watchdog();}
  status() {
    const s=this.state;
    const trades=this.ctx.storage.sql.exec<{data:string}>('SELECT data FROM trades ORDER BY entry_epoch DESC,id DESC LIMIT 30').toArray().map(row=>JSON.parse(row.data));
    return {mode:'PAPER',hypothetical:true,serverManaged:true,config:this.config,running:this.running,source:'Deriv public WebSocket',
      providers:PROVIDERS,decision:analyzeSignal(s.prices),equity:equityPoints(trades,s.balanceCents),
      chart:{provider:'deriv',symbol:this.config.symbol,intervalSeconds:60,candles:this.candles,historyStatus:this.chartHistoryStatus},
      balanceCents:s.balanceCents,profitCents:s.balanceCents-this.config.initialCents,goalProfitCents:7000,
      daily:s.daily,position:s.position,acceptedTicks:s.acceptedTicks,completed:s.completed,wins:s.wins,voided:s.voided,
      entryBlock:this.running?entryBlock(s,this.config,now()):'PAUSED',lastQuote:s.lastQuote,lastEpoch:s.lastEpoch,
      quoteAgeSeconds:s.lastEpoch===null?null:now()-s.lastEpoch,checkpointAt:this.checkpointAt,market:this.market,
      trades,
      events:this.ctx.storage.sql.exec<{data:string}>('SELECT data FROM events ORDER BY id DESC LIMIT 20').toArray().map(row=>JSON.parse(row.data))};
  }
  recordArbitrage(snapshot:unknown){
    if(!snapshot||typeof snapshot!=='object'||(snapshot as {status?:string}).status!=='RESEARCH_ONLY'
      ||JSON.stringify(snapshot).length>15000)throw Error('ARB_RECORD_INVALID');
    const body=JSON.stringify(snapshot),recordedAt=now();
    this.ctx.storage.transactionSync(()=>{
      const sql=this.ctx.storage.sql;
      sql.exec('INSERT INTO arb_observations(captured_at,payload) VALUES(?,?)',recordedAt,body);
      sql.exec('DELETE FROM arb_observations WHERE id < (SELECT COALESCE(MAX(id),0)-6000 FROM arb_observations)');
    });
    return this.arbitrageStatus();
  }
  arbitrageStatus(){
    const rows=this.ctx.storage.sql.exec<{captured_at:number;payload:string}>(
      'SELECT captured_at,payload FROM arb_observations ORDER BY id DESC LIMIT 50'
    ).toArray();
    const latest=rows[0]?JSON.parse(rows[0].payload):null;
    const history=rows.map(r=>{
      const p=JSON.parse(r.payload),a=p.estimates as Array<{route:string;estimatedNetBps:number;grossBps:number}>;
      return {capturedAt:r.captured_at,binanceToCoinbaseNetBps:a[0]?.estimatedNetBps??null,
        coinbaseToBinanceNetBps:a[1]?.estimatedNetBps??null};
    });
    return {mode:'READ_ONLY_RESEARCH',hasData:!!latest,
      latestCapturedAt:rows[0]?.captured_at??null,snapshot:latest,
      history,observationsShown:rows.length,intervalHint:'scheduled every 5 minutes; not high-frequency'};
  }

  exportPage(after:string|null=null):ExportPage {
    const sql=this.ctx.storage.sql;
    const rows=after===null?sql.exec<{id:string;data:string}>('SELECT id,data FROM trades ORDER BY id LIMIT 200').toArray()
      :sql.exec<{id:string;data:string}>('SELECT id,data FROM trades WHERE id > ? ORDER BY id LIMIT 200',after).toArray();
    return {trades:rows.map(row=>JSON.parse(row.data)),next:rows.length===200?rows[rows.length-1].id:null};
  }
}

async function authorized(request:Request,secret:string) {
  const header=request.headers.get('Authorization')||'';
  if(header.length>1024)return false;
  let provided='';
  if(header.startsWith('Bearer '))provided=header.slice(7);
  else if(header.startsWith('Basic ')) {
    try {const value=atob(header.slice(6));if(value.startsWith('owner:'))provided=value.slice(6);}catch{return false;}
  }
  const encoder=new TextEncoder();
  const [givenHash,expectedHash]=await Promise.all([provided,secret].map(value=>crypto.subtle.digest('SHA-256',encoder.encode(value))));
  return crypto.subtle.timingSafeEqual(givenHash,expectedHash);
}

function privateDashboard() {
  const nonce=crypto.randomUUID();
  const html=dashboard.replaceAll('__NONCE__',nonce);
  return new Response(html,{headers:{...security,'Content-Type':'text/html; charset=utf-8',
    'Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"}});
}

export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response> {
    const url=new URL(request.url);
    if(url.protocol!=='https:'){url.protocol='https:';return Response.redirect(url.href,308);}
    if(url.pathname==='/api/health'&&request.method==='GET')return json({status:'ok',mode:'PAPER'});
    if(!env.ADMIN_TOKEN||env.ADMIN_TOKEN.length<32)return json({error:'Acceso privado pendiente de configurar'},503);
    if(!await authorized(request,env.ADMIN_TOKEN))return json({error:'Acceso privado'},401,{'WWW-Authenticate':'Basic realm="Ecopiensa PAPER", charset="UTF-8"'});
    const validGet=request.method==='GET'&&['/','/api/status','/api/trades.csv','/api/market','/api/arbitrage','/api/deriv/status','/api/deriv/callback'].includes(url.pathname);
    const validPost=request.method==='POST'&&['/api/start','/api/stop','/api/arbitrage/refresh','/api/deriv/connect','/api/deriv/refresh','/api/deriv/quote','/api/deriv/demo/buy-once','/api/deriv/demo/check'].includes(url.pathname);
    if(!validGet&&!validPost)return json({error:'Ruta o método no permitido'},404);
    if(validPost&&(request.headers.get('X-Paper-Control')!=='1'||request.headers.get('Content-Type')!=='application/json'
      ||(request.headers.has('Origin')&&request.headers.get('Origin')!==url.origin)))return json({error:'Origen o control inválido'},403);
    try {
      if(url.pathname==='/')return privateDashboard();
      if(url.pathname.startsWith('/api/deriv/')){
        const demo=env.DERIV_DEMO.getByName('owner-deriv-demo-v1');
        if(url.pathname==='/api/deriv/status')return json(await demo.status());
        if(url.pathname==='/api/deriv/refresh')return json(await demo.refresh());
        if(url.pathname==='/api/deriv/quote'){
          // Price discovery only; no purchase, select CALL or PUT explicitly.
          const raw=await request.text();
          if(raw.length>256)return json({error:'Solicitud demasiado grande'},413);
          let choice:unknown={};
          try{choice=raw?JSON.parse(raw):{};}catch{return json({error:'Dirección inválida'},400);}
          const direction=choice&&typeof choice==='object'&&'direction' in choice?
            (choice as {direction?:unknown}).direction:'UP';
          if(direction!=='UP'&&direction!=='DOWN')return json({error:'Dirección inválida'},400);
          return json(await demo.quote(direction));
        }
        if(url.pathname==='/api/deriv/demo/buy-once'){
          // A browser click alone is NOT permission to trade: the broker is
          // DEMO-only, the feature switch defaults OFF, and the local rule
          // must have a fresh confirmed upward signal from real public ticks.
          if(String(env.DEMO_BUY_ENABLED)!=='true')return json({error:'Ejecución DEMO desactivada'},403);
          const paper=await env.PAPER.getByName(EXPERIMENT).status();
          const ready=paper.running===true&&paper.market.state==='live'
            &&paper.config.symbol==='R_100'&&[1,-1].includes(paper.decision.direction)
            &&typeof paper.quoteAgeSeconds==='number'
            &&paper.quoteAgeSeconds>=0&&paper.quoteAgeSeconds<=10;
          return json(await demo.buyDemoOnce(ready?(paper.decision.direction===1?'UP':'DOWN'):'HOLD',{
            reason:paper.decision.reason,
            fast:paper.decision.fast,slow:paper.decision.slow,
            rsi:paper.decision.rsi,volatility:paper.decision.volatility,
            entryQuote:paper.lastQuote,quoteAgeSeconds:paper.quoteAgeSeconds
          }));
        }
        if(url.pathname==='/api/deriv/demo/check')return json(await demo.checkDemoSettlement());
        if(url.pathname==='/api/deriv/connect'){
          // Read at most 1 KiB; this route accepts only a public application id.
          const reader=request.body?.getReader();if(!reader)return json({error:'Falta el identificador de aplicación'},400);
          let body='',size=0;const decoder=new TextDecoder();
          try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024)return json({error:'Solicitud demasiado grande'},413);body+=decoder.decode(value,{stream:true});}body+=decoder.decode();}finally{await reader.cancel();}
          let input:unknown;try{input=JSON.parse(body);}catch{return json({error:'Solicitud inválida'},400);}
          if(!input||typeof input!=='object'||!('clientId' in input)||typeof input.clientId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(input.clientId))return json({error:'Escribe el identificador público de la aplicación'},400);
          const connection=await demo.begin(input.clientId,url.origin);
          return json({url:connection.url},200,{'Set-Cookie':'ecopiensa_deriv_state='+connection.state+'; Path=/api/deriv; Secure; HttpOnly; SameSite=Lax; Max-Age=600'});
        }
        const state=url.searchParams.get('state')||'',code=url.searchParams.get('code')||'';
        const cookie=(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('ecopiensa_deriv_state='))?.slice('ecopiensa_deriv_state='.length);
        if(!/^[A-Za-z0-9_-]{43}$/.test(state)||cookie!==state||!code||url.searchParams.has('error'))return json({error:'No se confirmó la autorización de Deriv; inicia una nueva conexión'},400);
        await demo.complete(state,code);
        return new Response(null,{status:303,headers:{...security,Location:url.origin+'/',
          'Set-Cookie':'ecopiensa_deriv_state=; Path=/api/deriv; Secure; HttpOnly; SameSite=Lax; Max-Age=0'}});
      }
      if(url.pathname==='/api/arbitrage')return json(await env.PAPER.getByName(EXPERIMENT).arbitrageStatus());
      if(url.pathname==='/api/arbitrage/refresh'){
        const snapshot=await readPublicArbitrageSnapshot({budgetUsd:10});
        return json(await env.PAPER.getByName(EXPERIMENT).recordArbitrage(snapshot));
      }
      if(url.pathname==='/api/market'){
        const provider=url.searchParams.get('provider');
        if(provider!=='binance'&&provider!=='coinbase')return json({error:'Proveedor público no permitido'},400);
        return json(await publicMarketSnapshot(provider));
      }
      const experiment=env.PAPER.getByName(EXPERIMENT);
      if(url.pathname==='/api/status')return json(await experiment.status());
      if(url.pathname==='/api/start')return json(await experiment.start());
      if(url.pathname==='/api/stop')return json(await experiment.stop());
      const fields=['id','status','symbol','direction','entryEpoch','exitEpoch','entryQuote','exitQuote','stakeCents','pnlCents','reason'];
      const encoder=new TextEncoder(),stream=new TransformStream<Uint8Array,Uint8Array>(),writer=stream.writable.getWriter();
      ctx.waitUntil((async()=>{
        try {
          await writer.write(encoder.encode(fields.join(',')+'\n'));
          let after:string|null=null;
          do {
            const page:ExportPage=await experiment.exportPage(after);
            for(const trade of page.trades)await writer.write(encoder.encode(fields.map(key=>'"'+String(trade[key]??'').replaceAll('"','""')+'"').join(',')+'\n'));
            after=page.next;
          } while(after!==null);
          await writer.close();
        }catch(error){await writer.abort(error);}
      })());
      return new Response(stream.readable,{headers:{...security,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="paper-trades.csv"'}});
    }catch(error){
      if(url.pathname.startsWith('/api/deriv/')){
        const code=error instanceof Error&&/^(DERIV_[A-Z0-9_]+)$/.test(error.message)?error.message:'DERIV_CONNECTION_FAILED';
        console.error(JSON.stringify({type:'deriv_demo_connection_failed',path:url.pathname,code}));
        if(url.pathname==='/api/deriv/callback')return new Response(null,{status:303,headers:{...security,Location:url.origin+'/?deriv=verification_failed',
          'Set-Cookie':'ecopiensa_deriv_state=; Path=/api/deriv; Secure; HttpOnly; SameSite=Lax; Max-Age=0'}});
        return json({error:'No se pudo verificar la cuenta demo de Deriv',code},503);
      }
      const code=url.pathname==='/api/market'
        ? error instanceof Error&&/^(PUBLIC_MARKET_HTTP_[1-5][0-9]{2}|EMPTY_MARKET_RESPONSE|MARKET_RESPONSE_TOO_LARGE|INVALID_MARKET_RESPONSE|INVALID_CANDLES)$/.test(error.message)
          ?error.message:error instanceof Error&&['TimeoutError','AbortError'].includes(error.name)?'PUBLIC_MARKET_TIMEOUT':'PUBLIC_MARKET_NETWORK_ERROR'
        :undefined;
      console.error(JSON.stringify({type:'paper_request_failed',path:url.pathname,code}));
      return json({error:'Servicio no disponible; revisa el estado y la cuota',...(code?{code}:{})},503);
    }
  },
  async scheduled(_event:ScheduledController,env:Env){
    await env.PAPER.getByName(EXPERIMENT).watchdog();
    // Read-only status checks allow broker DEMO results to be recorded even
    // when the browser is closed. There is NEVER a scheduled buy.
    try{await env.DERIV_DEMO.getByName('owner-deriv-demo-v1').reconcileOpenDemoOnly();}
    catch{console.log(JSON.stringify({type:'demo_settlement_check_pending'}));}
    try{
      const snapshot=await readPublicArbitrageSnapshot({budgetUsd:10});
      await env.PAPER.getByName(EXPERIMENT).recordArbitrage(snapshot);
    }catch{console.log(JSON.stringify({type:'cross_exchange_observation_unavailable'}));}
  },
} satisfies ExportedHandler<Env>;
