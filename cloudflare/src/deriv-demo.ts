import { dayAt } from '../../runtime/core.mjs';
import { assessDailyDemoRisk, DEMO_MAX_OPEN, DEMO_ALLOCATION_CENTS, DEMO_MIN_SETTLED_FOR_REVIEW } from './demo-risk-policy';
import { analyzeBrokerDemoHistory } from '../../runtime/demo-postmortem.mjs';
import { buySingleDemoContract, readDemoSettlement } from './demo-broker-session';
import { buildDemoBuyRequest, type DemoBuyAck, type DemoQuoteForBuy } from './demo-trade-guards';
import { DurableObject } from 'cloudflare:workers';

const API='https://api.derivws.com/trading/v1/options/accounts';
const AUTH='https://auth.deriv.com/oauth2/';
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode=(value:string)=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const random=()=>encode(crypto.getRandomValues(new Uint8Array(32)));
const epoch=()=>Math.floor(Date.now()/1000);
type DemoAccount={account_id:string;account_type:'demo';currency:'USD';balance:number};
type Credentials={accessToken:string;expiresAt:number;accountId:string};
type Discovery={at:number;total:number;demo:number;demoUsd:number;activeDemoUsd:number;missingType:number;missingStatus:number;stringBalances:number;migration:string};

export async function boundedJson(response:Response,limit=32768):Promise<unknown> {
  if(!response.ok){await response.body?.cancel();throw Error('DERIV_HTTP_'+response.status);}
  const reader=response.body?.getReader();if(!reader)throw Error('DERIV_INVALID_RESPONSE');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>limit)throw Error('DERIV_RESPONSE_TOO_LARGE');chunks.push(value);
  }}finally{await reader.cancel();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Account discovery deliberately returns no real account or real balance. */
function accountBalance(value:unknown):number|null {
  // The live REST service uses decimal strings despite its numeric OpenAPI schema.
  // Accept plain USD amounts only, including extra zero precision; reject exponents,
  // separators, signs, non-finite values and fractional cents.
  if(typeof value==='string'&&!/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,2}0{0,6})?$/.test(value))return null;
  if(typeof value!=='number'&&typeof value!=='string')return null;
  const amount=Number(value),cents=Math.round(amount*100);
  return Number.isFinite(amount)&&amount>=0&&Number.isSafeInteger(cents)&&Math.abs(amount*100-cents)<0.000001?cents/100:null;
}
export function selectDemo(payload:unknown,accountId?:string):DemoAccount {
  if(!payload||typeof payload!=='object'||!('data' in payload)||!Array.isArray(payload.data))throw Error('DERIV_INVALID_RESPONSE');
  const match=payload.data.find(a=>a&&a.account_type==='demo'&&a.currency==='USD'&&a.status==='active'
    &&typeof a.account_id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(a.account_id)
    &&accountBalance(a.balance)!==null&&(!accountId||a.account_id===accountId));
  if(!match)throw Error('DERIV_DEMO_USD_REQUIRED');
  return {account_id:match.account_id,account_type:'demo',currency:'USD',balance:accountBalance(match.balance)!};
}


/** A quote is never an order. Deliberately discard the proposal id. */
export const DEMO_QUOTE_REQUEST = Object.freeze({
  proposal:1,amount:0.10,basis:'stake',contract_type:'CALL',currency:'USD',
  duration:20,duration_unit:'t',underlying_symbol:'R_100',req_id:1
});
export function demoQuoteRequest(signal:'UP'|'DOWN'='UP'){
  return {...DEMO_QUOTE_REQUEST,contract_type:signal==='UP'?'CALL':signal==='DOWN'?'PUT':(()=>{throw Error('DEMO_SIGNAL_INVALID')})()};
}

const quoteMoney=(value:unknown):number|null=>{
  if(typeof value!=='number' && !(typeof value==='string' && /^(?:0|[1-9][0-9]{0,9})(?:[.][0-9]{1,8})?$/.test(value)))return null;
  const number=Number(value);
  return Number.isFinite(number)&&number>=0&&number<=1_000_000?number:null;
};
export function parseDemoQuote(payload:unknown,signal:'UP'|'DOWN'='UP') {
  if(!payload||typeof payload!=='object')throw Error('DERIV_QUOTE_INVALID_RESPONSE');
  const p=payload as Record<string,unknown>;
  if(p.req_id!==undefined&&p.req_id!==1)throw Error('DERIV_QUOTE_WRONG_REQUEST');
  const rejected=(p.error&&typeof p.error==='object'?p.error:Array.isArray(p.errors)?p.errors[0]:null) as Record<string,unknown>|null;
  if(rejected){
    const raw=rejected.code;
    const code=typeof raw==='string'&&/^[A-Za-z0-9_]{1,64}$/.test(raw)?raw:'REJECTED';
    return {accepted:false,code,stake:0.10,durationTicks:20,symbol:'R_100',contractType:signal==='UP'?'CALL':'PUT'};
  }
  if(p.msg_type!=='proposal'||!p.proposal||typeof p.proposal!=='object')throw Error('DERIV_QUOTE_INVALID_RESPONSE');
  const proposal=p.proposal as Record<string,unknown>,askPrice=quoteMoney(proposal.ask_price),payout=quoteMoney(proposal.payout);
  if(askPrice===null||payout===null)throw Error('DERIV_QUOTE_INVALID_RESPONSE');
  return {accepted:true,stake:0.10,durationTicks:20,symbol:'R_100',contractType:signal==='UP'?'CALL':'PUT',
    askPrice,payout,potentialProfit:Math.round((payout-askPrice)*100)/100,quotedAt:epoch()};
}
export function demoSocketUrl(payload:unknown):string {
  if(!payload||typeof payload!=='object'||!('data' in payload)||!payload.data||typeof payload.data!=='object'
    ||!('url' in payload.data)||typeof payload.data.url!=='string'||payload.data.url.length>4096)throw Error('DERIV_OTP_INVALID_RESPONSE');
  let url:URL;try{url=new URL(payload.data.url);}catch{throw Error('DERIV_OTP_INVALID_RESPONSE');}
  if(url.protocol!=='wss:'||url.hostname!=='api.derivws.com'||url.port||url.username||url.password
    ||url.pathname!=='/trading/v1/options/ws/demo'||url.searchParams.size!==1
    ||!(url.searchParams.get('otp')||'')||url.hash)throw Error('DERIV_OTP_NOT_DEMO');
  return url.href;
}

/** Fetch an exact demo-account quote, no buy/sell ever. */
async function requestDemoQuote(wsUrl:string,signal:'UP'|'DOWN'='UP'):Promise<ReturnType<typeof parseDemoQuote>> {
  const response=await fetch(wsUrl.replace(/^wss:/,'https:'),{
    headers:{Upgrade:'websocket'},redirect:'manual',signal:AbortSignal.timeout(8000)
  });
  const socket=response.webSocket;
  if(response.status!==101||!socket){await response.body?.cancel();throw Error('DERIV_QUOTE_UPGRADE_FAILED');}
  socket.accept();
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(error?:Error,value?:ReturnType<typeof parseDemoQuote>)=>{
      if(settled)return;settled=true;clearTimeout(timeout);
      try{socket.close(1000,'Quote complete');}catch{/* Closing an already closed socket is safe. */}
      if(error)reject(error);else resolve(value!);
    };
    const timeout=setTimeout(()=>finish(Error('DERIV_QUOTE_TIMEOUT')),8000);
    socket.addEventListener('message',event=>{
      if(settled)return;
      try{
        if(typeof event.data!=='string'||event.data.length>32768)throw Error('DERIV_QUOTE_INVALID_RESPONSE');
        const message=JSON.parse(event.data) as Record<string,unknown>;
        if(message.req_id!==undefined&&message.req_id!==1)return;
        if(message.msg_type==='proposal'||message.error||message.errors)finish(undefined,parseDemoQuote(message,signal));
      }catch{finish(Error('DERIV_QUOTE_INVALID_RESPONSE'));}
    });
    socket.addEventListener('error',()=>finish(Error('DERIV_QUOTE_SOCKET_ERROR')));
    socket.addEventListener('close',()=>finish(Error('DERIV_QUOTE_SOCKET_CLOSED')));
    // No buy, sell, transfer, payout change or automatic stake escalation.
    try{socket.send(JSON.stringify(demoQuoteRequest(signal)));}catch{finish(Error('DERIV_QUOTE_SEND_FAILED'));}
  });
}

/** Separate coordination atom for the owner's broker-demo authorization, never PAPER accounting. */
export class DerivDemoConnection extends DurableObject<Env> {
  constructor(ctx:DurableObjectState,env:Env){super(ctx,env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS demo_connection (slot TEXT PRIMARY KEY,data TEXT NOT NULL)');
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS demo_trades (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, created_at INTEGER NOT NULL, state TEXT NOT NULL, contract_id INTEGER UNIQUE, buy_cents INTEGER, payout_cents INTEGER, pnl_cents INTEGER, code TEXT)");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS demo_day_halts (date TEXT PRIMARY KEY, reason TEXT NOT NULL, stopped_at INTEGER NOT NULL)");
    const cols=new Set(ctx.storage.sql.exec<{name:string}>('PRAGMA table_info(demo_trades)').toArray().map(r=>r.name));
    for(const [name,kind] of [['decision_json','TEXT'],['entry_spot','REAL'],['exit_spot','REAL'],['contract_type','TEXT']]){
      if(!cols.has(name))ctx.storage.sql.exec('ALTER TABLE demo_trades ADD COLUMN '+name+' '+kind);
    }

  }
  private read<T>(slot:string):T|null {
    const row=this.ctx.storage.sql.exec<{data:string}>('SELECT data FROM demo_connection WHERE slot=?',slot).toArray()[0];
    return row?JSON.parse(row.data) as T:null;
  }
  private write(slot:string,value:unknown){this.ctx.storage.sql.exec('INSERT INTO demo_connection VALUES(?,?) ON CONFLICT(slot) DO UPDATE SET data=excluded.data',slot,JSON.stringify(value));}
  private async key(){
    if(!this.env.ADMIN_TOKEN||this.env.ADMIN_TOKEN.length<32)throw Error('DERIV_SECRET_REQUIRED');
    const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('ecopiensa-deriv-demo-v1\0'+this.env.ADMIN_TOKEN));
    return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
  }
  private async seal(value:unknown){const iv=crypto.getRandomValues(new Uint8Array(12));
    const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await this.key(),new TextEncoder().encode(JSON.stringify(value)));
    return {iv:encode(iv),data:encode(new Uint8Array(data))};
  }
  private async unseal<T>(value:{iv:string;data:string}):Promise<T>{
    const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(value.iv)},await this.key(),decode(value.data));
    return JSON.parse(new TextDecoder().decode(raw)) as T;
  }
  private async accounts(accessToken:string,accountId?:string){
    const payload=await boundedJson(await fetch(API,{headers:{Authorization:'Bearer '+accessToken},redirect:'manual',signal:AbortSignal.timeout(8000)}));
    const rows=payload&&typeof payload==='object'&&'data' in payload&&Array.isArray(payload.data)?payload.data:[];
    const discovery:Discovery={at:epoch(),total:rows.length,demo:rows.filter(a=>a?.account_type==='demo').length,
      demoUsd:rows.filter(a=>a?.account_type==='demo'&&a?.currency==='USD').length,
      activeDemoUsd:rows.filter(a=>a?.account_type==='demo'&&a?.currency==='USD'&&a?.status==='active').length,
      missingType:rows.filter(a=>!a||typeof a.account_type!=='string').length,missingStatus:rows.filter(a=>!a||typeof a.status!=='string').length,
      stringBalances:rows.filter(a=>typeof a?.balance==='string').length,migration:'not_checked'};
    this.write('discovery',discovery);
    try{return selectDemo(payload,accountId);}catch(error){
      // Diagnose only the migration state. Never expose a token, raw account list or real balance.
      try{const migration=await boundedJson(await fetch('https://api.derivws.com/trading/v1/options/legacy/migration-status',{
        headers:{Authorization:'Bearer '+accessToken},redirect:'manual',signal:AbortSignal.timeout(4500)}),8192);
        if(migration&&typeof migration==='object'&&'data' in migration&&migration.data&&typeof migration.data==='object'&&'status' in migration.data
          &&typeof migration.data.status==='string'&&['pending','complete','failed','not_applicable'].includes(migration.data.status))discovery.migration=migration.data.status;
        else discovery.migration='unknown';
      }catch{discovery.migration='unavailable';}
      this.write('discovery',discovery);throw error;
    }
  }
  async begin(clientId:string,origin:string){
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(clientId))throw Error('DERIV_CLIENT_ID_REQUIRED');
    if(!/^https:\/\/[^/?#]+$/.test(origin))throw Error('DERIV_INVALID_ORIGIN');
    const state=random(),verifier=random(),redirectUri=origin+'/api/deriv/callback';
    const challenge=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
    const pending=await this.seal({state,verifier,clientId,redirectUri,expiresAt:epoch()+600});
    this.ctx.storage.transactionSync(()=>{this.write('pending',pending);this.write('attempt',state);this.write('clientId',clientId);});
    const url=new URL(AUTH+'auth');
    for(const [key,value]of Object.entries({response_type:'code',client_id:clientId,redirect_uri:redirectUri,scope:'trade',state,code_challenge:challenge,code_challenge_method:'S256'}))url.searchParams.set(key,value);
    return {url:url.href,state};
  }
  async complete(state:string,code:string){
    const sealed=this.read<{iv:string;data:string}>('pending');if(!sealed)throw Error('DERIV_OAUTH_STATE_INVALID');
    const pending=await this.unseal<{state:string;verifier:string;clientId:string;redirectUri:string;expiresAt:number}>(sealed);
    if(pending.state!==state||pending.expiresAt<epoch()||!code||code.length>2048)throw Error('DERIV_OAUTH_STATE_INVALID');
    // Consume before external I/O. A concurrent callback cannot exchange the same code twice.
    const current=this.read<{iv:string;data:string}>('pending');
    if(!current||current.data!==sealed.data)throw Error('DERIV_OAUTH_STATE_INVALID');
    this.ctx.storage.sql.exec('DELETE FROM demo_connection WHERE slot=?','pending');
    const body=new URLSearchParams({grant_type:'authorization_code',client_id:pending.clientId,code,code_verifier:pending.verifier,redirect_uri:pending.redirectUri});
    const result=await boundedJson(await fetch(AUTH+'token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,redirect:'manual',signal:AbortSignal.timeout(8000)}));
    if(!result||typeof result!=='object'||!('access_token' in result)||typeof result.access_token!=='string'
      ||!result.access_token||result.access_token.length>4096||!('expires_in' in result)||typeof result.expires_in!=='number'
      ||!Number.isSafeInteger(result.expires_in)||result.expires_in<1||result.expires_in>366*86400)throw Error('DERIV_INVALID_RESPONSE');
    const account=await this.accounts(result.access_token);
    const expiresAt=epoch()+result.expires_in;
    const credentials=await this.seal({accessToken:result.access_token,expiresAt,accountId:account.account_id});
    if(this.read<string>('attempt')!==state)throw Error('DERIV_OAUTH_STATE_INVALID');
    this.ctx.storage.transactionSync(()=>{this.write('credentials',credentials);this.write('snapshot',{account,checkedAt:epoch(),expiresAt});});
    return this.status();
  }
  private dayRisk(date=dayAt(epoch())){
    const d=this.ctx.storage.sql.exec<{settled:number;net:number}>(
      "SELECT COUNT(*) AS settled, COALESCE(SUM(pnl_cents),0) AS net FROM demo_trades WHERE date=? AND state='SETTLED'",date
    ).one();
    const stop=this.ctx.storage.sql.exec<{reason:string}>(
      'SELECT reason FROM demo_day_halts WHERE date=?',date
    ).toArray()[0]||null;
    return {date,settled:d.settled,netCents:d.net,halted:!!stop,haltReason:stop?.reason??null};
  }
  private freezeLosingDay(date:string){
    const d=this.dayRisk(date);
    // Risk halt is sticky: a late settlement cannot reopen trading the same day.
    if(d.settled>=DEMO_MIN_SETTLED_FOR_REVIEW&&d.netCents<=0){
      this.ctx.storage.sql.exec(
        'INSERT OR IGNORE INTO demo_day_halts(date,reason,stopped_at) VALUES(?,?,?)',
        date,'DAY_NET_NONPOSITIVE_AFTER_TEN',epoch()
      );
    }
  }

  private reportDemo() {
    type Row={id:number;date:string;created_at:number;state:string;contract_id:number|null;buy_cents:number|null;payout_cents:number|null;pnl_cents:number|null;code:string|null;decision_json?:string|null;entry_spot?:number|null;exit_spot?:number|null;contract_type?:string|null};
    const sql=this.ctx.storage.sql;
    const stats=sql.exec<{settled:number;wins:number;losses:number;pnlCents:number}>(
      "SELECT COUNT(*) AS settled, COALESCE(SUM(CASE WHEN pnl_cents > 0 THEN 1 ELSE 0 END),0) AS wins, COALESCE(SUM(CASE WHEN pnl_cents < 0 THEN 1 ELSE 0 END),0) AS losses, COALESCE(SUM(pnl_cents),0) AS pnlCents FROM demo_trades WHERE state='SETTLED'"
    ).one();
    const pending=sql.exec<Row>(
      "SELECT id,date,created_at,state,contract_id,buy_cents,payout_cents,pnl_cents,code,contract_type FROM demo_trades WHERE state IN ('UNKNOWN','OPEN') ORDER BY id ASC"
    ).toArray();
    const unknownCount=pending.filter(r=>r.state==='UNKNOWN').length,
      openCount=pending.filter(r=>r.state==='OPEN').length,
      activeExposureCents=pending.reduce((sum,r)=>sum+(r.buy_cents||10),0);
    const history=sql.exec<Row>(
      'SELECT id,date,created_at,state,contract_id,buy_cents,payout_cents,pnl_cents,code,decision_json,entry_spot,exit_spot FROM demo_trades ORDER BY id DESC LIMIT 50'
    ).toArray();
    const analyticRows=sql.exec<Row>(
      "SELECT id,date,created_at,state,contract_id,buy_cents,payout_cents,pnl_cents,code,decision_json,entry_spot,exit_spot FROM demo_trades WHERE state='SETTLED' ORDER BY created_at DESC,id DESC LIMIT 1000"
    ).toArray().map(r=>({
      state:r.state,contractId:r.contract_id,createdAt:r.created_at,pnlCents:r.pnl_cents,
      entrySpot:r.entry_spot,exitSpot:r.exit_spot,
      decision:r.decision_json?JSON.parse(r.decision_json):null
    }));
    const analysis=analyzeBrokerDemoHistory(analyticRows);
    const day=this.dayRisk();
    return {settled:stats.settled,wins:stats.wins,losses:stats.losses,pnlCents:stats.pnlCents,
      winRatePct:stats.settled?Math.round(stats.wins/stats.settled*10000)/100:null,
      virtualResearchAllocationCents:DEMO_ALLOCATION_CENTS,
      virtualResearchRemainingCents:DEMO_ALLOCATION_CENTS+stats.pnlCents-activeExposureCents,
      maxParallel:DEMO_MAX_OPEN,openCount,unknownCount,activeExposureCents,
      dayRisk:{...day,
        ...assessDailyDemoRisk({
          openContracts:openCount,unknownCount,exposureCents:activeExposureCents,
          lifetimeNetCents:stats.pnlCents,dailyNetCents:day.netCents,
          dailySettled:day.settled,haltedToday:day.halted
        })
      },
      analysis,analysisScope:'most_recent_1000_settled',
      openContracts:pending.filter(r=>r.state==='OPEN').map(r=>({id:r.id,contractId:r.contract_id,
        contractType:r.contract_type==='PUT'?'PUT' as const:'CALL' as const,
        createdAt:r.created_at})),
      unresolved:pending.find(r=>r.state==='UNKNOWN')||pending[0]||null,
      history:history.map(r=>({id:r.id,date:r.date,state:r.state,contractId:r.contract_id,
        buyCents:r.buy_cents,payoutCents:r.payout_cents,pnlCents:r.pnl_cents,
        code:r.code,createdAt:r.created_at,entrySpot:r.entry_spot??null,exitSpot:r.exit_spot??null,
        decision:r.decision_json?JSON.parse(r.decision_json):null}))
    };
  }
  status(){
    const saved=this.read<{account:DemoAccount;checkedAt:number;expiresAt:number}>('snapshot');
    const connected=!!saved&&saved.expiresAt>epoch()&&!!this.read('credentials');
    return {mode:'DERIV_DEMO',connected,executionEnabled:false,aiConnected:false,clientId:this.read<string>('clientId')||'',
      account:connected&&saved?{type:'demo',currency:'USD',label:'Demo · …'+saved.account.account_id.slice(-4),balance:saved.account.balance,checkedAt:saved.checkedAt}:null,
      discovery:this.read<Discovery>('discovery'),state:connected?'DEMO_VERIFIED':saved?'AUTHORIZATION_EXPIRED':this.read('discovery')?'DEMO_ACCOUNT_NOT_VERIFIED':'NOT_CONNECTED',
      demoTradingEnabled:String(this.env.DEMO_BUY_ENABLED)==='true',
      demoAutomationAvailable:String(this.env.DEMO_AUTO_ENABLED)==='true',
      demoAutomationRequested:this.read<boolean>('demo-auto')===true,
      tradeReport:this.reportDemo()};
  }
  async refresh(){
    const sealed=this.read<{iv:string;data:string}>('credentials');if(!sealed)throw Error('DERIV_NOT_CONNECTED');
    const credentials=await this.unseal<Credentials>(sealed);if(credentials.expiresAt<=epoch())throw Error('DERIV_AUTHORIZATION_EXPIRED');
    const account=await this.accounts(credentials.accessToken,credentials.accountId);
    this.write('snapshot',{account,checkedAt:epoch(),expiresAt:credentials.expiresAt});return this.status();
  }

  async quote(signal:'UP'|'DOWN'='UP') {
    const snapshot=this.read<{account:DemoAccount;checkedAt:number;expiresAt:number}>('snapshot');
    if(!snapshot||snapshot.account.account_type!=='demo'||snapshot.account.currency!=='USD'||!this.status().connected)
      throw Error('DERIV_DEMO_REQUIRED');
    const last=this.read<number>('lastQuoteAt')||0;
    if(epoch()-last<15)throw Error('DERIV_QUOTE_RATE_LIMIT');
    this.write('lastQuoteAt',epoch());
    const sealed=this.read<{iv:string;data:string}>('credentials');
    if(!sealed)throw Error('DERIV_DEMO_REQUIRED');
    const credentials=await this.unseal<Credentials>(sealed);
    if(credentials.expiresAt<=epoch()||credentials.accountId!==snapshot.account.account_id)
      throw Error('DERIV_AUTHORIZATION_EXPIRED');
    const accountId=encodeURIComponent(credentials.accountId);
    const otp=await boundedJson(await fetch(
      'https://api.derivws.com/trading/v1/options/accounts/'+accountId+'/otp',
      {method:'POST',headers:{Authorization:'Bearer '+credentials.accessToken},
        redirect:'manual',signal:AbortSignal.timeout(8000)}),8192);
    return requestDemoQuote(demoSocketUrl(otp),signal);
  }


  private async verifiedDemoCredentials() {
    const saved=this.read<{account:DemoAccount;checkedAt:number;expiresAt:number}>('snapshot');
    if(!saved||!this.status().connected||saved.account.account_type!=='demo'||saved.account.currency!=='USD')
      throw Error('DERIV_DEMO_REQUIRED');
    const sealed=this.read<{iv:string;data:string}>('credentials');
    if(!sealed)throw Error('DERIV_DEMO_REQUIRED');
    const creds=await this.unseal<Credentials>(sealed);
    if(creds.expiresAt<=epoch()||creds.accountId!==saved.account.account_id)
      throw Error('DERIV_AUTHORIZATION_EXPIRED');
    const latest=await this.accounts(creds.accessToken,creds.accountId);
    if(latest.account_type!=='demo'||latest.currency!=='USD'||latest.balance<0.10)
      throw Error('DEMO_ACCOUNT_UNAVAILABLE');
    return creds;
  }

  private async otpDemoUrl(creds:Credentials) {
    const url='https://api.derivws.com/trading/v1/options/accounts/'+encodeURIComponent(creds.accountId)+'/otp';
    const answer=await boundedJson(await fetch(url,{method:'POST',headers:{
      Authorization:'Bearer '+creds.accessToken
    },redirect:'manual',signal:AbortSignal.timeout(8000)}),8192);
    return demoSocketUrl(answer);
  }

  /**
   * Explicit manual one-contract DEMO operation. Disabled unless the
   * Cloudflare owner changes DEMO_BUY_ENABLED from its safe 'false' default.
   * PAPER signals must be fresh and upward; a real account never qualifies.
   */
  async setDemoAutomation(enabled:boolean) {
    if(typeof enabled!=='boolean')throw Error('DEMO_AUTO_INVALID');
    if(enabled){
      if(String(this.env.DEMO_AUTO_ENABLED)!=='true'||String(this.env.DEMO_BUY_ENABLED)!=='true')
        throw Error('DEMO_AUTO_DISABLED');
      await this.verifiedDemoCredentials();
      if(!this.reportDemo().dayRisk.allowed)throw Error('DEMO_RISK_NOT_READY');
    }
    this.write('demo-auto',enabled);
    return {mode:'DERIV_DEMO',autoEnabled:enabled,tradeReport:this.reportDemo()};
  }

  isDemoAutoEnabled(){
    return this.read<boolean>('demo-auto')===true
      &&String(this.env.DEMO_AUTO_ENABLED)==='true'
      &&String(this.env.DEMO_BUY_ENABLED)==='true';
  }

  async buyDemoOnce(paperSignal:'UP'|'DOWN'|'HOLD',evidence?:{
    reason?:string;fast?:number|null;slow?:number|null;rsi?:number|null;
    volatility?:number|null;entryQuote?:number|null;quoteAgeSeconds?:number|null;
  }) {
    if(String(this.env.DEMO_BUY_ENABLED)!=='true')throw Error('DEMO_EXECUTION_DISABLED');
    if(paperSignal!=='UP'&&paperSignal!=='DOWN')throw Error('NO_APPROVED_SIGNAL');
    const creds=await this.verifiedDemoCredentials();
    const url=await this.otpDemoUrl(creds);
    const report=this.reportDemo();
    if(!report.dayRisk.allowed)throw Error(report.dayRisk.reason);
    const safeNumber=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
    const decision=JSON.stringify({
      strategy:'sma-rsi-v1',direction:paperSignal,contractType:paperSignal==='UP'?'CALL':'PUT',
      reason:evidence?.reason==='TREND_AND_MOMENTUM'?'TREND_AND_MOMENTUM':'UNVERIFIED',
      fast:safeNumber(evidence?.fast),slow:safeNumber(evidence?.slow),
      rsi:safeNumber(evidence?.rsi),volatility:safeNumber(evidence?.volatility),
      entryQuote:safeNumber(evidence?.entryQuote),
      quoteAgeSeconds:safeNumber(evidence?.quoteAgeSeconds),
      recordedAt:epoch(),source:'Deriv public price feed'
    });
    const today=dayAt(epoch());
    const dailyStats=()=>this.ctx.storage.sql.exec<{total:number}>(
      "SELECT COUNT(*) AS total FROM demo_trades WHERE date=? AND state IN ('UNKNOWN','OPEN','SETTLED')",today
    ).one();
    const available=dailyStats();
    const currentDay=this.dayRisk(today);
    const reserve=async(quote:DemoQuoteForBuy):Promise<number>=>{
      // A failed buy is not retried. A synchronous reservation also prevents
      // racing web requests from exceeding three concurrent DEMO contracts.
      return this.ctx.storage.transactionSync(()=>{
        const pending=this.ctx.storage.sql.exec<{state:string;buy_cents:number|null}>(
          "SELECT state,buy_cents FROM demo_trades WHERE state IN ('UNKNOWN','OPEN')"
        ).toArray();
        const current=dailyStats();
        const lifetime=this.ctx.storage.sql.exec<{pnl:number}>(
          "SELECT COALESCE(SUM(pnl_cents),0) AS pnl FROM demo_trades WHERE state='SETTLED'"
        ).one().pnl;
        const todayRisk=this.dayRisk(today);
        buildDemoBuyRequest({
          accountType:'demo',currency:'USD',socketUrl:url,userEnabledDemoExecution:true,
          signal:paperSignal,quote,now:epoch(),todayTrades:current.total,todayLossCents:0,
          hasOpenContract:pending.length>0,unresolvedBuy:pending.some(p=>p.state==='UNKNOWN'),
          openContracts:pending.filter(p=>p.state==='OPEN').length,
          activeExposureCents:pending.reduce((sum,p)=>sum+(p.buy_cents||10),0),
          lifetimePnlCents:lifetime,dailyNetPnlCents:todayRisk.netCents,
          dailySettled:todayRisk.settled,haltedToday:todayRisk.halted
        });
        this.ctx.storage.sql.exec(
          "INSERT INTO demo_trades(date,created_at,state,buy_cents,decision_json,contract_type) VALUES(?,?,'UNKNOWN',10,?,?)",
          today,epoch(),decision,quote.contractType
        );
        return this.ctx.storage.sql.exec<{id:number}>('SELECT last_insert_rowid() AS id').one().id;
      });
    };
    const acknowledge=async(id:number,ack:DemoBuyAck)=>{
      if(!ack.accepted){
        this.ctx.storage.sql.exec(
          "UPDATE demo_trades SET state='REJECTED',code=? WHERE id=? AND state='UNKNOWN'",
          ack.code,id
        );
      }else{
        this.ctx.storage.sql.exec(
          "UPDATE demo_trades SET state='OPEN',contract_id=?,buy_cents=? WHERE id=? AND state='UNKNOWN'",
          ack.contractId,ack.buyCents,id
        );
      }
    };
    const result=await buySingleDemoContract({
      wsUrl:url,gate:{
        accountType:'demo',currency:'USD',userEnabledDemoExecution:true,
        signal:paperSignal,todayTrades:available.total,todayLossCents:0,
        hasOpenContract:report.openCount>0,unresolvedBuy:report.unknownCount>0,
        openContracts:report.openCount,activeExposureCents:report.activeExposureCents,
        lifetimePnlCents:report.pnlCents,dailyNetPnlCents:currentDay.netCents,
        dailySettled:currentDay.settled,haltedToday:currentDay.halted
      },reserve,acknowledge
    });
    return {mode:'DERIV_DEMO',...result,tradeReport:this.reportDemo()};
  }

  /** Scheduled read-only reconciler for every confirmed OPEN demo contract. */
  async reconcileOpenDemoOnly(){
    const open=this.reportDemo().openContracts;
    const outcomes:Array<{contractId:number|null;state:string}>=[];
    for(const entry of open){
      if(!entry.contractId)continue;
      try{
        const result=await this.checkDemoSettlement(entry.contractId);
        outcomes.push({contractId:entry.contractId,state:result.state});
      }catch{outcomes.push({contractId:entry.contractId,state:'RETRY_LATER'});}
    }
    return {state:'READ_ONLY_RECONCILIATION',outcomes,tradeReport:this.reportDemo()};
  }

  /** Read a specific or the oldest OPEN contract; never issues a new buy. */
  async checkDemoSettlement(contractId?:number) {
    const report=this.reportDemo();
    const pending=contractId===undefined?report.openContracts[0]:
      report.openContracts.find(r=>r.contractId===contractId);
    if(!pending){
      return {state:report.unknownCount>0?'BUY_OUTCOME_UNKNOWN':'NO_PENDING_CONTRACT',
        tradeReport:report};
    }
    if(!pending.contractId)return {state:'BUY_OUTCOME_UNKNOWN',tradeReport:report};
    const creds=await this.verifiedDemoCredentials();
    const url=await this.otpDemoUrl(creds);
    const result=await readDemoSettlement(url,pending.contractId,pending.contractType);
    if(result) {
      this.ctx.storage.transactionSync(()=>{
        this.ctx.storage.sql.exec(
          "UPDATE demo_trades SET state='SETTLED',pnl_cents=?,payout_cents=?,entry_spot=?,exit_spot=? WHERE id=? AND contract_id=? AND state='OPEN'",
          result.profitCents,result.payoutCents,result.entrySpot??null,result.exitSpot??null,
          pending.id,pending.contractId
        );
        this.freezeLosingDay(this.ctx.storage.sql.exec<{date:string}>(
          'SELECT date FROM demo_trades WHERE id=?',pending.id).one().date);
      });
      return {state:'SETTLED',settlement:result,tradeReport:this.reportDemo()};
    }
    return {state:'OPEN',tradeReport:this.reportDemo()};
  }

}
