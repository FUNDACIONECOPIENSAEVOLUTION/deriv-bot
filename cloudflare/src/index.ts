import { DurableObject } from 'cloudflare:workers';
import { readConfig, initialState, seedHistory, onTick, invalidatePosition, entryBlock, analyzeSignal } from '../../runtime/core.mjs';
import { addCandleTick, mergeCandleHistory, validateCandles, publicMarketSnapshot, PROVIDERS, equityPoints, type Candle } from '../../runtime/market-data.mjs';
import { PublicFeed, type MarketStatus } from '../../runtime/feed.mjs';
import dashboard from '../../runtime/dashboard.html?raw';
import release from '../../release.json';
import { PublicSocket } from './public-socket';
import { DEMO_STAKES_CENTS } from './demo-risk-policy';
import { checkPublicContractCompatibility } from './deriv-contracts';
import { handleMcpRequest, type McpSignal } from './mcp-gateway';
import { readPublicArbitrageSnapshot } from '../../runtime/cross-exchange.mjs';
export { DerivDemoConnection } from './deriv-demo';

type EngineState = ReturnType<typeof initialState>;
type PaperEvent = {type:string;epoch:number;trade?:{id:string;status:string;entryEpoch:number}};
type ExportPage = {trades:Record<string,unknown>[];next:string|null};
const EXPERIMENT='owner-usd10-v1', CHECKPOINT_MS=60_000;
const now=()=>Math.floor(Date.now()/1000);
const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(value:unknown,status=200,headers={})=>Response.json(value,{status,headers:{...security,...headers}});

/** A bounded, public, read-only transport check; cached within each Worker isolate.
 * No account/OTP is ever accessed here and no proposal/buy is sent.
 */
let derivSocketProbeCache:{at:number;promise:Promise<{status:string;mode:string;code?:string;markets?:unknown}>}|null=null;
async function readDerivSocketTransport() {
  const tick=Date.now();
  if(derivSocketProbeCache&&tick-derivSocketProbeCache.at<120_000)return derivSocketProbeCache.promise;
  const promise=(async()=>{
    try{
      const result=await checkPublicContractCompatibility();
      return {status:'CONNECTED',mode:'PUBLIC_READ_ONLY',markets:result.results};
    }catch(error){
      const raw=error instanceof Error?error.message:'DERIV_SOCKET_UNKNOWN';
      const code=/^(DERIV|DEMO)_[A-Z0-9_]+$/.test(raw)?raw:'DERIV_SOCKET_FAILED';
      return {status:'UNAVAILABLE',mode:'PUBLIC_READ_ONLY',code};
    }
  })();
  derivSocketProbeCache={at:tick,promise};
  return promise;
}

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
  // HTML-escape each release field; commit messages must never become executable markup.
  const escapeHtml=(value:unknown)=>String(value).replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]||ch));
  const changes=(Array.isArray(release.changes)?release.changes:[])
    .slice(0,12).map(value=>'<li>'+escapeHtml(value)+'</li>').join('');
  const html=dashboard.replaceAll('__NONCE__',nonce)
    .replaceAll('__RELEASE_VERSION__',escapeHtml(release.version))
    .replaceAll('__RELEASE_UPDATED_AT__',escapeHtml(release.updatedAt))
    .replaceAll('__RELEASE_SUMMARY__',escapeHtml(release.summary))
    .replaceAll('__RELEASE_CHANGES__',changes);
  return new Response(html,{headers:{...security,'Content-Type':'text/html; charset=utf-8',
    'Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; connect-src 'self' wss://api.derivws.com; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"}});
}

export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response> {
    const url=new URL(request.url);
    if(url.protocol!=='https:'){url.protocol='https:';return Response.redirect(url.href,308);}
    if(url.pathname==='/api/health'&&request.method==='GET')return json({
      status:'ok',mode:'PAPER',version:release.version+'.0',release:'cloudflare-deriv-demo-panel-v'+release.version,
      lastUpdated:release.updatedAt,summary:release.summary,changes:release.changes,
      publishedFeature:'private-demo-panel',date:release.updatedAt.slice(0,10),
      demoBuyingEnabled:String(env.DEMO_BUY_ENABLED)==='true',
      demoAutomationEnabled:String(env.DEMO_AUTO_ENABLED)==='true',
      note:'Estado técnico del Worker. No confirma sesión Deriv ni operaciones DEMO.'
    });
    if(url.pathname==='/api/health/deriv-socket'&&request.method==='GET'){
      const result=await readDerivSocketTransport();
      return json({readOnly:true,version:release.version+'.0',...result},result.status==='CONNECTED'?200:503);
    }
    if(url.pathname==='/api/health/mcp'&&request.method==='GET'){
      const configured=typeof (env as Env & {MCP_BRIDGE_TOKEN?:string}).MCP_BRIDGE_TOKEN==='string'
        &&((env as Env & {MCP_BRIDGE_TOKEN?:string}).MCP_BRIDGE_TOKEN||'').length>=32;
      return json({mode:'MCP_STAGING_DEMO_ONLY',configured,connectedToThisChat:false,
        toolCount:5,orderExecution:'OWNER_BROWSER_APPROVAL_ONLY',
        requires:'MCP OAuth 2.1 provider + compatible ChatGPT workspace',
        noDerivRealAccount:true});
    }
    if(url.pathname==='/mcp'){
      const token=(env as Env & {MCP_BRIDGE_TOKEN?:string}).MCP_BRIDGE_TOKEN;
      if(!token||token.length<32)return json({code:'MCP_NOT_CONFIGURED'},503);
      if(!request.headers.get('Authorization')?.startsWith('Bearer ')
        ||!await authorized(request,token))
        return json({code:'MCP_AUTH_REQUIRED'},401,{'WWW-Authenticate':'Bearer realm="Ecopiensa demo MCP"'});
      if(request.headers.has('Origin')&&request.headers.get('Origin')!==url.origin)
        return json({code:'MCP_ORIGIN_FORBIDDEN'},403);
      const demo=env.DERIV_DEMO.getByName('owner-deriv-demo-v1');
      const signal=async():Promise<McpSignal>=>{
        const status=await env.PAPER.getByName(EXPERIMENT).status();
        const d=status.decision;
        const quoteAge=status.quoteAgeSeconds;
        const valid=status.running===true&&status.config.symbol==='R_100'
          &&status.market.state==='live'&&typeof quoteAge==='number'
          &&quoteAge>=0&&quoteAge<=10&&[1,-1].includes(d.direction);
        if(valid){
          return {direction:d.direction===1?'UP':'DOWN',reason:d.reason,
            valid:true,source:'SERVER_PUBLIC_R_100_ENGINE',
            quoteAgeSeconds:quoteAge,
            indicator:{fast:d.fast,slow:d.slow,rsi:d.rsi,volatility:d.volatility}};
        }
        const fromBrowser=await demo.getBrowserSignal();
        if(fromBrowser.valid&&fromBrowser.quoteAgeSeconds!==null
          &&fromBrowser.quoteAgeSeconds<=10){
          return {direction:fromBrowser.direction,reason:fromBrowser.reason,
            valid:true,source:'CLIENT_OBSERVED_PUBLIC_R_100_NOT_INDEPENDENT',
            quoteAgeSeconds:fromBrowser.quoteAgeSeconds,
            indicator:fromBrowser.indicator};
        }
        return {direction:'HOLD',reason:'NO_FRESH_VERIFIABLE_BOT_SIGNAL',
          valid:false,source:'NO_CURRENT_FEED',quoteAgeSeconds:null};
      };
      return handleMcpRequest(request,{
        getStatus:async()=>{
          const r=await demo.status();
          return {mode:r.mode,connected:r.connected,account:r.account,
            risk:r.tradeReport.risk,settled:r.tradeReport.settled,
            wins:r.tradeReport.wins,losses:r.tradeReport.losses,
            pnlCents:r.tradeReport.pnlCents,
            browserObservedSettled:r.tradeReport.browserObservedSettled,
            brokerVerifiedSettled:r.tradeReport.brokerVerifiedSettled,
            nextStakeCents:r.nextManualStakeCents,accountType:'demo',
            directBrokerOrdersFromMcp:0};
        },
        getSignal:signal,
        getIntent:async()=>demo.getMcpDemoIntent(),
        requestIntent:async args=>demo.queueMcpDemoIntent(args),
        cancelIntent:async id=>demo.cancelMcpDemoIntent(id)
      });
    }
    if(!env.ADMIN_TOKEN||env.ADMIN_TOKEN.length<32)return json({error:'Acceso privado pendiente de configurar'},503);
    if(!await authorized(request,env.ADMIN_TOKEN))return json({error:'Acceso privado'},401,{'WWW-Authenticate':'Basic realm="Ecopiensa PAPER", charset="UTF-8"'});
    const validGet=request.method==='GET'&&['/','/api/status','/api/trades.csv','/api/market','/api/arbitrage','/api/deriv/status','/api/deriv/callback','/api/deriv/demo/mcp-intent'].includes(url.pathname);
    const validPost=request.method==='POST'&&['/api/start','/api/stop','/api/arbitrage/refresh','/api/deriv/connect','/api/deriv/refresh','/api/deriv/quote','/api/deriv/market-check','/api/deriv/demo/buy-once','/api/deriv/demo/check','/api/deriv/demo/auto-start','/api/deriv/demo/auto-stop','/api/deriv/demo/browser/begin','/api/deriv/demo/browser/reserve','/api/deriv/demo/browser/ack','/api/deriv/demo/browser/settle','/api/deriv/demo/browser/check','/api/deriv/demo/mcp-intent/claim','/api/deriv/demo/mcp-intent/complete','/api/deriv/demo/mcp-intent/cancel','/api/deriv/demo/signal'].includes(url.pathname);
    if(!validGet&&!validPost)return json({error:'Ruta o método no permitido'},404);
    if(validPost&&(request.headers.get('X-Paper-Control')!=='1'||request.headers.get('Content-Type')!=='application/json'
      ||(request.headers.has('Origin')&&request.headers.get('Origin')!==url.origin)))return json({error:'Origen o control inválido'},403);
    try {
      if(url.pathname==='/')return privateDashboard();
      if(url.pathname.startsWith('/api/deriv/')){
        const demo=env.DERIV_DEMO.getByName('owner-deriv-demo-v1');
        if(url.pathname==='/api/deriv/status')return json(await demo.status());
        if(url.pathname==='/api/deriv/refresh')return json(await demo.refresh());
        if(url.pathname==='/api/deriv/demo/signal'&&request.method==='POST'){
          const raw=await request.text();
          if(raw.length>24000)return json({code:'DEMO_BROWSER_PRICES_TOO_LARGE'},413);
          let source:unknown;
          try{source=JSON.parse(raw);}catch{return json({code:'DEMO_BROWSER_PRICES_INVALID'},400);}
          return json(await demo.analyzeBrowserPrices(source));
        }

        if(url.pathname==='/api/deriv/demo/mcp-intent'&&request.method==='GET')
          return json(await demo.getMcpDemoIntent());
        if(url.pathname.startsWith('/api/deriv/demo/mcp-intent/')&&request.method==='POST'){
          const raw=await request.text();
          if(raw.length>300)return json({code:'MCP_COMMAND_TOO_LARGE'},413);
          let input:unknown;
          try{input=JSON.parse(raw);}catch{return json({code:'MCP_COMMAND_INVALID'},400);}
          if(!input||typeof input!=='object'||Array.isArray(input))
            return json({code:'MCP_COMMAND_INVALID'},400);
          const arg=input as {id?:unknown;contractId?:unknown};
          if(typeof arg.id!=='string'||!/^[0-9a-f-]{36}$/i.test(arg.id))
            return json({code:'MCP_COMMAND_ID_INVALID'},400);
          const action=url.pathname.split('/').at(-1);
          if(action==='claim')return json(await demo.claimMcpDemoIntent(arg.id));
          if(action==='cancel')return json(await demo.cancelMcpDemoIntent(arg.id));
          if(action==='complete'){
            if(typeof arg.contractId!=='number'||!Number.isSafeInteger(arg.contractId)
              ||arg.contractId<=0)return json({code:'MCP_CONTRACT_ID_INVALID'},400);
            return json(await demo.completeMcpDemoIntent(arg.id,arg.contractId));
          }
        }

        if(url.pathname==='/api/deriv/market-check'){
          // Public, READ ONLY contracts_for; never sends a buy or changes the broker account.
          return json(await checkPublicContractCompatibility());
        }
        if(url.pathname==='/api/deriv/quote'){
          // Price discovery only; no purchase, select CALL or PUT explicitly.
          const raw=await request.text();
          if(raw.length>256)return json({error:'Solicitud demasiado grande'},413);
          let choice:unknown={};
          try{choice=raw?JSON.parse(raw):{};}catch{return json({error:'Dirección inválida'},400);}
          const direction=choice&&typeof choice==='object'&&'direction' in choice?
            (choice as {direction?:unknown}).direction:'UP';
          if(direction!=='UP'&&direction!=='DOWN')return json({error:'Dirección inválida'},400);
          const stakeCents=choice&&typeof choice==='object'&&'stakeCents' in choice?
            (choice as {stakeCents?:unknown}).stakeCents:100;
          if(typeof stakeCents!=='number'||!DEMO_STAKES_CENTS.some(allowed=>allowed===stakeCents))
            return json({error:'Importe virtual no permitido'},400);
          return json(await demo.preflightDemo(direction,stakeCents));
        }
        if(url.pathname.startsWith('/api/deriv/demo/browser/')){
          // Owner authenticated + same origin, DEMO account only.
          const raw=await request.text();
          if(raw.length>8192)return json({error:'Solicitud demasiado grande'},413);
          let parsed:unknown;
          try{parsed=JSON.parse(raw);}catch{return json({error:'Formato de sesión inválido'},400);}
          if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return json({error:'Formato de sesión inválido'},400);
          const data=parsed as Record<string,unknown>;
          const action=url.pathname.split('/').at(-1);
          if(action==='begin'){
            if((data.signal!=='UP'&&data.signal!=='DOWN')||typeof data.stakeCents!=='number'
              ||!DEMO_STAKES_CENTS.some(n=>n===data.stakeCents))
              return json({error:'Dirección o importe DEMO inválido'},400);
            return json(await demo.beginBrowserPilot(data.signal,data.stakeCents));
          }
          if(action==='check')return json(await demo.beginBrowserSettlement());
          const nonce=typeof data.nonce==='string'&&/^[A-Za-z0-9_-]{43}$/.test(data.nonce)?data.nonce:null;
          if(!nonce)return json({error:'Identificador de sesión inválido'},400);
          if(action==='reserve'){
            if((data.signal!=='UP'&&data.signal!=='DOWN')||typeof data.stakeCents!=='number'
              ||!DEMO_STAKES_CENTS.some(n=>n===data.stakeCents)
              ||typeof data.proposalId!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(data.proposalId)
              ||typeof data.askPrice!=='number'||typeof data.payout!=='number')
              return json({error:'Propuesta DEMO inválida'},400);
            const rawEvidence=data.evidence&&typeof data.evidence==='object'&&!Array.isArray(data.evidence)
              ?data.evidence as Record<string,unknown>:{};
            const num=(key:string)=>typeof rawEvidence[key]==='number'&&Number.isFinite(rawEvidence[key])
              ?rawEvidence[key] as number:null;
            const evidence={
              pilot:rawEvidence.pilot==='balanced-ten'?'balanced-ten' as const:'manual' as const,
              fast:num('fast'),slow:num('slow'),rsi:num('rsi'),
              volatility:num('volatility'),entryQuote:num('entryQuote'),
              quoteAgeSeconds:num('quoteAgeSeconds'),
              reason:typeof rawEvidence.reason==='string'?rawEvidence.reason:'UNVERIFIED'
            };
            return json(await demo.reserveBrowserPilot({
              nonce,signal:data.signal,stakeCents:data.stakeCents,proposalId:data.proposalId,
              askPrice:data.askPrice,payout:data.payout,evidence
            }));
          }
          if(typeof data.id!=='number'||!Number.isSafeInteger(data.id)||data.id<=0
            ||!data.response||typeof data.response!=='object'||Array.isArray(data.response))
            return json({error:'Respuesta del broker inválida'},400);
          const payload={nonce,id:data.id,response:data.response};
          if(action==='ack')return json(await demo.acknowledgeBrowserPilot(payload));
          if(action==='settle')return json(await demo.settleBrowserPilot(payload));
          return json({error:'Acción no autorizada'},404);
        }
        if(url.pathname==='/api/deriv/demo/buy-once'){
          // A browser click alone is NOT permission to trade: the broker is
          // DEMO-only, the feature switch defaults OFF, and the local rule
          // must have a fresh confirmed upward signal from real public ticks.
          if(String(env.DEMO_BUY_ENABLED)!=='true')return json({error:'Ejecución DEMO desactivada'},403);
          // Exactly one DEMO buy under the owner's 45-second approved quote.
          // PAPER daily simulation limits must not block this separate research pilot.
          const direction=await demo.manualApprovedSignal();
          if(direction==='HOLD')return json({error:'Cotización DEMO caducada o no aprobada',code:'DEMO_FRESH_APPROVED_QUOTE_REQUIRED'},409);
          return json(await demo.buyDemoOnce(direction,{reason:'OWNER_APPROVED_DEMO_QUOTE'},'manual'));
        }
        if(url.pathname==='/api/deriv/demo/check')return json(await demo.checkDemoSettlement());
        if(url.pathname==='/api/deriv/demo/auto-start'){
          const raw=await request.text();
          if(raw.length>64)return json({error:'Configuración demasiado grande'},413);
          let chosen:unknown;
          try{
            const obj=raw?JSON.parse(raw):{};
            if(!obj||typeof obj!=='object'||Array.isArray(obj))return json({error:'Configuración inválida'},400);
            chosen=(obj as {maxConcurrent?:unknown}).maxConcurrent??10;
          }catch{return json({error:'Configuración inválida'},400);}
          if(typeof chosen!=='number'||!Number.isSafeInteger(chosen)||chosen<1||chosen>10)
            return json({error:'Máximo simultáneo fuera de rango: 1-10'},400);
          return json(await demo.setDemoAutomation(true,chosen));
        }
        if(url.pathname==='/api/deriv/demo/auto-stop')
          return json(await demo.setDemoAutomation(false));
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
        const code=error instanceof Error&&/^(DERIV|DEMO)_[A-Z0-9_]+$/.test(error.message)
          ?error.message:'DERIV_CONNECTION_FAILED';
        console.error(JSON.stringify({type:'deriv_demo_connection_failed',path:url.pathname,code}));
        if(url.pathname==='/api/deriv/callback')return new Response(null,{status:303,headers:{...security,Location:url.origin+'/?deriv=verification_failed',
          'Set-Cookie':'ecopiensa_deriv_state=; Path=/api/deriv; Secure; HttpOnly; SameSite=Lax; Max-Age=0'}});
        return json({error:'Operación o verificación DEMO no completada',code},503);
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
    const paper=env.PAPER.getByName(EXPERIMENT);
    await paper.watchdog();
    const demo=env.DERIV_DEMO.getByName('owner-deriv-demo-v1');
    // Update authoritative DEMO balance and enforce the cumulative US$100
    // loss stop on every scheduled check while the virtual bot is enabled.
    try{await demo.refreshDemoRisk();}
    catch{console.log(JSON.stringify({type:'demo_balance_check_pending'}));}
    // Read-only broker settlement, regardless of automation state.
    try{await demo.reconcileOpenDemoOnly();}
    catch{console.log(JSON.stringify({type:'demo_settlement_check_pending'}));}
    // Binance/Coinbase scanning is intentionally paused for this Deriv-only stage.
    if(String(env.DEMO_AUTO_ENABLED)==='true'&&String(env.DEMO_BUY_ENABLED)==='true'){
      try{
        if(!await demo.isDemoAutoEnabled())return;
        const snapshot=await paper.status();
        if(snapshot.running!==true||snapshot.market.state!=='live'
          ||snapshot.config.symbol!=='R_100'
          ||(snapshot.decision.direction!==1&&snapshot.decision.direction!==-1)
          ||typeof snapshot.quoteAgeSeconds!=='number'
          ||snapshot.quoteAgeSeconds<0||snapshot.quoteAgeSeconds>10)return;
        const direction=snapshot.decision.direction===1?'UP':'DOWN';
        await demo.buyDemoOnce(direction,{
          reason:snapshot.decision.reason,fast:snapshot.decision.fast,
          slow:snapshot.decision.slow,rsi:snapshot.decision.rsi,
          volatility:snapshot.decision.volatility,entryQuote:snapshot.lastQuote,
          quoteAgeSeconds:snapshot.quoteAgeSeconds
        },'auto');
      }catch(error){
        // Logs only trusted bounded domain codes, never broker tokens or OTP URLs.
        const code=error instanceof Error&&/^(?:DEMO|DERIV)_[A-Z0-9_]+$/.test(error.message)?
          error.message:'DEMO_AUTO_CHECK_PENDING';
        console.log(JSON.stringify({type:'demo_auto_check',code}));
      }
    }
  },
} satisfies ExportedHandler<Env>;
