import { dayAt, analyzeSignal } from '../../runtime/core.mjs';
import {planDemoBurst,DEMO_BURST_STAKE_CENTS} from './demo-burst-policy';
import {demoTradesCsv,type DemoCsvRow} from './demo-csv';
import {DEMO_SUPPORTED_SYMBOLS,isDemoSymbol,type DemoSymbol} from './demo-symbols';
import { evaluateDemoRisk, pickDemoStakeCents, DEMO_STAKES_CENTS, DEMO_MAX_OPEN, DEMO_BASELINE_EXPECTED_CENTS, DEMO_MAX_LOSS_CENTS, DEMO_PILOT_BUDGET_CENTS, DEMO_PILOT_MAX_PURCHASES, DEMO_BATCH_COUNT, DEMO_BATCH_BUDGET_CENTS, DEMO_REVIEW_INTERVAL, requireFirstDemoSettlement, validManualDemoApproval } from './demo-risk-policy';
import { analyzeBrokerDemoHistory } from '../../runtime/demo-postmortem.mjs';
import { buySingleDemoContract, readDemoSettlement } from './demo-broker-session';
import { buildDemoBuyRequest, parseDemoBuyResponse, parseDemoSettlement, type DemoBuyAck, type DemoQuoteForBuy } from './demo-trade-guards';
import { DurableObject } from 'cloudflare:workers';
import { openDerivSocket } from './deriv-websocket';

const API='https://api.derivws.com/trading/v1/options/accounts';
const AUTH='https://auth.deriv.com/oauth2/';
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode=(value:string)=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const random=()=>encode(crypto.getRandomValues(new Uint8Array(32)));
const epoch=()=>Math.floor(Date.now()/1000);
const researchNumber=(v:unknown,min:number,max:number):number|null=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:null;
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
  proposal:1,amount:1,basis:'stake',contract_type:'CALL',currency:'USD',
  duration:5,duration_unit:'t',underlying_symbol:'R_100',req_id:1
});
export function demoQuoteRequest(signal:'UP'|'DOWN'='UP',stakeCents=100){
  if(!DEMO_STAKES_CENTS.some(x=>x===stakeCents))throw Error('DEMO_STAKE_INVALID');
  return {...DEMO_QUOTE_REQUEST,amount:stakeCents/100,contract_type:signal==='UP'?'CALL':signal==='DOWN'?'PUT':(()=>{throw Error('DEMO_SIGNAL_INVALID')})()};
}

const quoteMoney=(value:unknown):number|null=>{
  if(typeof value!=='number' && !(typeof value==='string' && /^(?:0|[1-9][0-9]{0,9})(?:[.][0-9]{1,8})?$/.test(value)))return null;
  const number=Number(value);
  return Number.isFinite(number)&&number>=0&&number<=1_000_000?number:null;
};
export function parseDemoQuote(payload:unknown,signal:'UP'|'DOWN'='UP',stakeCents=100) {
  if(!payload||typeof payload!=='object')throw Error('DERIV_QUOTE_INVALID_RESPONSE');
  const p=payload as Record<string,unknown>;
  if(p.req_id!==undefined&&p.req_id!==1)throw Error('DERIV_QUOTE_WRONG_REQUEST');
  const rejected=(p.error&&typeof p.error==='object'?p.error:Array.isArray(p.errors)?p.errors[0]:null) as Record<string,unknown>|null;
  if(rejected){
    const raw=rejected.code;
    const code=typeof raw==='string'&&/^[A-Za-z0-9_]{1,64}$/.test(raw)?raw:'REJECTED';
    return {accepted:false,code,stake:stakeCents/100,durationTicks:5,symbol:'R_100',contractType:signal==='UP'?'CALL':'PUT'};
  }
  if(p.msg_type!=='proposal'||!p.proposal||typeof p.proposal!=='object')throw Error('DERIV_QUOTE_INVALID_RESPONSE');
  const proposal=p.proposal as Record<string,unknown>,askPrice=quoteMoney(proposal.ask_price),payout=quoteMoney(proposal.payout);
  if(askPrice===null||payout===null)throw Error('DERIV_QUOTE_INVALID_RESPONSE');
  return {accepted:true,stake:stakeCents/100,durationTicks:5,symbol:'R_100',contractType:signal==='UP'?'CALL':'PUT',
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
async function requestDemoQuote(wsUrl:string,signal:'UP'|'DOWN'='UP',stakeCents=100):Promise<ReturnType<typeof parseDemoQuote>> {
  const socket=await openDerivSocket(wsUrl,'demo',8000);
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
        if(message.msg_type==='proposal'||message.error||message.errors)finish(undefined,parseDemoQuote(message,signal,stakeCents));
      }catch{finish(Error('DERIV_QUOTE_INVALID_RESPONSE'));}
    });
    socket.addEventListener('error',()=>finish(Error('DERIV_QUOTE_SOCKET_ERROR')));
    socket.addEventListener('close',()=>finish(Error('DERIV_QUOTE_SOCKET_CLOSED')));
    // No buy, sell, transfer, payout change or automatic stake escalation.
    try{socket.send(JSON.stringify(demoQuoteRequest(signal,stakeCents)));}catch{finish(Error('DERIV_QUOTE_SEND_FAILED'));}
  });
}

/** Separate coordination atom for the owner's broker-demo authorization, never PAPER accounting. */
export class DerivDemoConnection extends DurableObject<Env> {
  constructor(ctx:DurableObjectState,env:Env){super(ctx,env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS demo_connection (slot TEXT PRIMARY KEY,data TEXT NOT NULL)');
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS demo_trades (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, created_at INTEGER NOT NULL, state TEXT NOT NULL, contract_id INTEGER UNIQUE, buy_cents INTEGER, payout_cents INTEGER, pnl_cents INTEGER, code TEXT)");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS demo_day_halts (date TEXT PRIMARY KEY, reason TEXT NOT NULL, stopped_at INTEGER NOT NULL)");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS demo_quote_checks (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, stake_cents INTEGER NOT NULL, contract_type TEXT NOT NULL, accepted INTEGER NOT NULL, code TEXT)");

    const cols=new Set(ctx.storage.sql.exec<{name:string}>('PRAGMA table_info(demo_trades)').toArray().map(r=>r.name));
    for(const [name,kind] of [['decision_json','TEXT'],['entry_spot','REAL'],['exit_spot','REAL'],['contract_type','TEXT'],['bought_at','INTEGER'],['settled_at','INTEGER'],['symbol','TEXT']]){
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
  private getRiskSnapshot(){
    const currentBalance=this.read<number>('demo-last-balance-cents');
    const ledger=this.ctx.storage.sql.exec<{net:number}>(
      "SELECT COALESCE(SUM(pnl_cents),0) AS net FROM demo_trades WHERE state='SETTLED'"
    ).one().net;
    const pending=this.ctx.storage.sql.exec<{state:string;buy_cents:number|null}>(
      "SELECT state,buy_cents FROM demo_trades WHERE state IN ('OPEN','UNKNOWN')"
    ).toArray();
    // Rejections do not consume the campaign budget; unknown orders count
    // provisionally, to prevent a reconnect from generating duplicate buys.
    const booked=this.ctx.storage.sql.exec<{state:string;buy_cents:number|null}>(
      "SELECT state,buy_cents FROM demo_trades WHERE state IN ('OPEN','UNKNOWN','SETTLED') ORDER BY id ASC"
    ).toArray();
    const pilot={trades:booked.length,spent:booked.reduce((sum,r)=>sum+(r.buy_cents??100),0)};
    const batchStart=Math.floor(pilot.trades/DEMO_REVIEW_INTERVAL)*DEMO_REVIEW_INTERVAL;
    const batchCommittedCents=booked.slice(batchStart).reduce((sum,r)=>sum+(r.buy_cents??100),0);
    const batchSettlementPending=pilot.trades>0&&pilot.trades<DEMO_PILOT_MAX_PURCHASES
      &&pilot.trades%DEMO_REVIEW_INTERVAL===0
      &&booked.slice(-DEMO_REVIEW_INTERVAL).some(r=>r.state!=='SETTLED');
    return {brokerBalanceCents:currentBalance??null,
      baselineBalanceCents:DEMO_BASELINE_EXPECTED_CENTS,
      halted:this.read<boolean>('demo-loss-halt')===true,
      lifetimeNetCents:ledger,
      openContracts:pending.filter(p=>p.state==='OPEN').length,
      unknownCount:pending.filter(p=>p.state==='UNKNOWN').length,
      exposureCents:pending.reduce((sum,p)=>sum+(p.buy_cents||100),0),
      pilotPurchases:pilot.trades,pilotCommittedCents:pilot.spent,
      batchCommittedCents,batchSettlementPending};
  }
  /** A one-contract manual stake override; automatic bot stays on fixed rotation. */
  private currentManualStakeCents():number{
    const value=this.read<number>('demo-manual-next-stake');
    return value!==null&&DEMO_STAKES_CENTS.some(x=>x===value)
      ?value:pickDemoStakeCents(this.read<number>('demo-stake-index')||0);
  }
  setNextManualStakeCents(stakeCents:number){
    if(!DEMO_STAKES_CENTS.some(x=>x===stakeCents))throw Error('DEMO_STAKE_NOT_ALLOWED');
    if(this.read<boolean>('demo-auto')===true)throw Error('DEMO_AUTOMATION_ALREADY_ACTIVE');
    if(!this.status().connected)throw Error('DERIV_DEMO_REQUIRED');
    const checkedAt=this.read<number>('demo-last-balance-at');
    if(checkedAt===null||epoch()-checkedAt>45)throw Error('DEMO_BALANCE_REFRESH_REQUIRED');
    const r=this.getRiskSnapshot();
    if(r.openContracts>0||r.unknownCount>0)throw Error('DEMO_CONTRACT_PENDING_RECONCILIATION');
    const risk=this.riskFor(stakeCents);
    if(!risk.allowed)throw Error(risk.reason);
    this.write('demo-manual-next-stake',stakeCents);
    this.write('demo-manual-preflight',null);
    return {mode:'DEMO_MANUAL_STAKE_SET',stakeCents,
      allowedStakesCents:DEMO_STAKES_CENTS,scope:'ONE_MANUAL_DEMO_BUY',
      automaticRotationUnchanged:true,noBrokerOrders:true};
  }
  private chosenMaxConcurrent(){
    const value=this.read<number>('demo-max-concurrent')??10;
    if(!Number.isSafeInteger(value)||value<1||value>10)throw Error('DEMO_CONCURRENCY_INVALID');
    return value;
  }
  private riskFor(stakeCents:number){
    const s=this.getRiskSnapshot();
    if(s.brokerBalanceCents===null)throw Error('DEMO_BROKER_BALANCE_UNVERIFIED');
    return evaluateDemoRisk({...s,brokerBalanceCents:s.brokerBalanceCents,stakeCents,maxConcurrent:this.chosenMaxConcurrent()});
  }

  /** Export the account's own DEMO ledger, never PAPER simulations or credentials. */
  exportDemoCsv(scope:'all'|'last-burst'){
    if(scope!=='all'&&scope!=='last-burst')throw Error('DEMO_CSV_SCOPE_INVALID');
    let rows:DemoCsvRow[];
    if(scope==='all'){
      rows=this.ctx.storage.sql.exec<DemoCsvRow>(
        'SELECT * FROM demo_trades ORDER BY id DESC LIMIT 1000').toArray();
    }else{
      const burst=this.burstState();
      rows=(burst?.ids||[]).map(id=>this.ctx.storage.sql.exec<DemoCsvRow>(
        'SELECT * FROM demo_trades WHERE id=?',id).toArray()[0]).filter(
          (r):r is DemoCsvRow=>r!==undefined
      ).sort((a,b)=>a.created_at-b.created_at||a.id-b.id);
    }
    return {csv:demoTradesCsv(rows),count:rows.length,scope,
      source:'DERIV_DEMO_LEDGER',independentVerification:false};
  }

  private reportDemo() {
    type Row={id:number;date:string;created_at:number;state:string;contract_id:number|null;
      buy_cents:number|null;payout_cents:number|null;pnl_cents:number|null;code:string|null;
      decision_json:string|null;entry_spot:number|null;exit_spot:number|null;contract_type:string|null;bought_at:number|null;settled_at:number|null;symbol:string|null};
    const sql=this.ctx.storage.sql;
    const stats=sql.exec<{settled:number;wins:number;losses:number;net:number}>(
      "SELECT COUNT(*) AS settled, COALESCE(SUM(CASE WHEN pnl_cents>0 THEN 1 ELSE 0 END),0) AS wins, COALESCE(SUM(CASE WHEN pnl_cents<0 THEN 1 ELSE 0 END),0) AS losses, COALESCE(SUM(pnl_cents),0) AS net FROM demo_trades WHERE state='SETTLED'"
    ).one();
    const browserObservedSettlements=sql.exec<{n:number}>(
      "SELECT COUNT(*) AS n FROM demo_trades WHERE state='SETTLED' AND code='CLIENT_OBSERVED'"
    ).one().n;
    const raw=this.getRiskSnapshot();
    const history=sql.exec<Row>(
      'SELECT * FROM demo_trades ORDER BY id DESC LIMIT 50'
    ).toArray();
    const analyticRows=sql.exec<Row>(
      "SELECT * FROM demo_trades WHERE state='SETTLED' ORDER BY created_at DESC,id DESC LIMIT 1000"
    ).toArray().map(r=>({
      state:r.state,contractId:r.contract_id,createdAt:r.created_at,
      pnlCents:r.pnl_cents,entrySpot:r.entry_spot,exitSpot:r.exit_spot,
      decision:r.decision_json?JSON.parse(r.decision_json):null
    }));
    const analysis=analyzeBrokerDemoHistory(analyticRows);
    const stakes=sql.exec<{stake:number;settled:number;wins:number;net:number}>(
      "SELECT buy_cents AS stake, COUNT(*) AS settled, COALESCE(SUM(CASE WHEN pnl_cents>0 THEN 1 ELSE 0 END),0) AS wins, COALESCE(SUM(pnl_cents),0) AS net FROM demo_trades WHERE state='SETTLED' GROUP BY buy_cents ORDER BY buy_cents"
    ).toArray().map(r=>({stakeCents:r.stake,settled:r.settled,wins:r.wins,
      netCents:r.net,winRatePct:r.settled?Math.round(r.wins/r.settled*10000)/100:null}));
    const bookedTrades=sql.exec<{state:string;buy_cents:number|null;pnl_cents:number|null}>(
      "SELECT state,buy_cents,pnl_cents FROM demo_trades WHERE state IN ('OPEN','UNKNOWN','SETTLED') ORDER BY id ASC"
    ).toArray();
    const batches=Array.from({length:DEMO_BATCH_COUNT},(_,i)=>{
      const entries=bookedTrades.slice(i*DEMO_REVIEW_INTERVAL,(i+1)*DEMO_REVIEW_INTERVAL);
      const settled=entries.filter(r=>r.state==='SETTLED');
      const wins=settled.filter(r=>(r.pnl_cents??0)>0).length;
      const losses=settled.filter(r=>(r.pnl_cents??0)<0).length;
      return {number:i+1,purchases:entries.length,settled:settled.length,wins,losses,
        committedCents:entries.reduce((sum,r)=>sum+(r.buy_cents??100),0),
        pnlCents:settled.reduce((sum,r)=>sum+(r.pnl_cents??0),0),
        complete:entries.length===DEMO_REVIEW_INTERVAL&&settled.length===DEMO_REVIEW_INTERVAL,
        winRatePct:settled.length?Math.round(wins/settled.length*10000)/100:null};
    });
    const quoteRejections=sql.exec<{stake:number;attempts:number;rejections:number}>(
      "SELECT stake_cents AS stake, COUNT(*) AS attempts, COALESCE(SUM(CASE WHEN accepted=0 THEN 1 ELSE 0 END),0) AS rejections FROM demo_quote_checks GROUP BY stake_cents ORDER BY stake_cents"
    ).toArray().map(r=>({...r,stakeCents:r.stake}));
    const open=sql.exec<Row>(
      "SELECT * FROM demo_trades WHERE state='OPEN' ORDER BY id ASC"
    ).toArray();
    let risk:null|ReturnType<typeof evaluateDemoRisk>=null;
    if(raw.brokerBalanceCents!==null)
      risk=evaluateDemoRisk({...raw,brokerBalanceCents:raw.brokerBalanceCents,
        stakeCents:this.currentManualStakeCents(),
        maxConcurrent:this.chosenMaxConcurrent()});
    const lastChecked=this.read<number>('demo-last-balance-at')||null;
    return {settled:stats.settled,wins:stats.wins,losses:stats.losses,pnlCents:stats.net,
      brokerVerifiedSettled:stats.settled-browserObservedSettlements,
      browserObservedSettled:browserObservedSettlements,
      winRatePct:stats.settled?Math.round(stats.wins/stats.settled*10000)/100:null,
      virtualResearchAllocationCents:DEMO_PILOT_BUDGET_CENTS,
      pilotMaxPurchases:DEMO_PILOT_MAX_PURCHASES,
      batchCount:DEMO_BATCH_COUNT,
      batchMaxPurchases:DEMO_REVIEW_INTERVAL,
      batchBudgetCents:DEMO_BATCH_BUDGET_CENTS,
      batchNumber:Math.min(DEMO_BATCH_COUNT,1+Math.floor(raw.pilotPurchases/DEMO_REVIEW_INTERVAL)),
      batchSettlementPending:raw.batchSettlementPending,
      batchCommittedCents:raw.batchCommittedCents,
      batches,
      pilotPurchases:raw.pilotPurchases,
      pilotRemainingPurchases:Math.max(0,DEMO_PILOT_MAX_PURCHASES-raw.pilotPurchases),
      pilotCommittedCents:raw.pilotCommittedCents,
      pilotRemainingBudgetCents:Math.max(0,DEMO_PILOT_BUDGET_CENTS-raw.pilotCommittedCents),
      hardAccountLossStopCents:DEMO_MAX_LOSS_CENTS,
      virtualResearchRemainingCents:raw.brokerBalanceCents===null?null:
        Math.max(0,raw.brokerBalanceCents-(DEMO_BASELINE_EXPECTED_CENTS-DEMO_MAX_LOSS_CENTS)-raw.exposureCents),
      maxParallel:DEMO_MAX_OPEN,openCount:raw.openContracts,unknownCount:raw.unknownCount,
      activeExposureCents:raw.exposureCents,brokerBalanceCents:raw.brokerBalanceCents,
      brokerBalanceCheckedAt:lastChecked,lossHalt:raw.halted,
      risk,dayRisk:risk,
      analysis,analysisScope:'most_recent_1000_settled',
      byStake:stakes,quoteAcceptance:quoteRejections,
      openContracts:open.map(r=>({id:r.id,contractId:r.contract_id,buyCents:r.buy_cents,
        contractType:r.contract_type==='PUT'?'PUT' as const:'CALL' as const,createdAt:r.created_at})),
      unresolved:this.ctx.storage.sql.exec<Row>("SELECT * FROM demo_trades WHERE state='UNKNOWN' ORDER BY id ASC LIMIT 1").toArray()[0]||open[0]||null,
      history:history.map(r=>({id:r.id,date:r.date,state:r.state,contractId:r.contract_id,
        buyCents:r.buy_cents,payoutCents:r.payout_cents,pnlCents:r.pnl_cents,
        code:r.code,createdAt:r.created_at,boughtAt:r.bought_at??null,settledAt:r.settled_at??null,entrySpot:r.entry_spot??null,exitSpot:r.exit_spot??null,
        contractType:r.contract_type==='PUT'?'PUT':r.contract_type==='CALL'?'CALL':null,
        symbol:isDemoSymbol(r.symbol)?r.symbol:'R_100',
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
      demoMaxConcurrent:this.chosenMaxConcurrent(),
      nextManualStakeCents:this.currentManualStakeCents(),
      allowedManualStakesCents:DEMO_STAKES_CENTS,
      maxBrowserConcurrent:1,
      demoLossAlert:this.read<boolean>('demo-loss-halt')===true,
      tradeReport:this.reportDemo(),
      demoBurst:this.demoBurstStatus(),
      demoBurstPlan:this.planDemoBurst(10),
      demoBurstPlans:DEMO_STAKES_CENTS.map(stakeCents=>({stakeCents,...this.planDemoBurst(10,stakeCents)}))};
  }
  async refresh(){
    const sealed=this.read<{iv:string;data:string}>('credentials');if(!sealed)throw Error('DERIV_NOT_CONNECTED');
    const credentials=await this.unseal<Credentials>(sealed);if(credentials.expiresAt<=epoch())throw Error('DERIV_AUTHORIZATION_EXPIRED');
    const account=await this.accounts(credentials.accessToken,credentials.accountId);
    if(account.account_type!=='demo'||account.currency!=='USD'||!Number.isFinite(account.balance))
      throw Error('DEMO_ACCOUNT_UNAVAILABLE');
    const balanceCents=Math.round(account.balance*100);
    if(Math.abs(account.balance*100-balanceCents)>0.00001)throw Error('DEMO_BALANCE_INVALID');
    this.write('demo-last-balance-cents',balanceCents);
    this.write('demo-last-balance-at',epoch());
    this.write('snapshot',{account,checkedAt:epoch(),expiresAt:credentials.expiresAt});
    if(balanceCents<=DEMO_BASELINE_EXPECTED_CENTS-DEMO_MAX_LOSS_CENTS){
      this.write('demo-loss-halt',true);this.write('demo-auto',false);
    }
    return this.status();
  }

  /**
   * Owner-only broker preflight. Confirms a live DEMO USD balance and obtains an
   * authenticated quote; it NEVER issues buy/sell or changes execution flags.
   */
  async preflightDemo(signal:'UP'|'DOWN'='UP',stakeCents=100){
    // One-use, short-lived permission to attempt a MANUAL demo buy only.
    // A rejected/failed quote must never leave the buy button or server gate open.
    this.write('demo-manual-preflight',null);
    const quote=await this.quote(signal,stakeCents);
    const risk=this.riskFor(stakeCents);
    const status=this.status();
    const nextStakeCents=status.nextManualStakeCents;
    const manualApproved=quote.accepted===true&&risk.allowed===true
      &&status.demoTradingEnabled===true&&stakeCents===nextStakeCents;
    if(manualApproved){
      const saved=this.read<{account:DemoAccount}>('snapshot');
      if(saved)this.write('demo-manual-preflight',{
        at:epoch(),signal,stakeCents,
        accountId:saved.account.account_id,purchases:risk.pilotPurchases
      });
    }
    return {
      mode:'DERIV_DEMO_PREFLIGHT',noOrders:true,accountType:'demo',
      account:status.account,brokerBalanceCents:risk.brokerBalanceCents,
      stakeCents,signal,quote,risk,nextManualStakeCents:nextStakeCents,manualApproved,
      executionConfigured:status.demoTradingEnabled,
      automationConfigured:status.demoAutomationAvailable,
      recommendedNextStep:!quote.accepted?'DERIV_QUOTE_REJECTED'
        :!risk.allowed?risk.reason
        :stakeCents!==nextStakeCents?'DEMO_QUOTE_WRONG_NEXT_STAKE'
        :!status.demoTradingEnabled?'ENABLE_DEMO_BUY_AFTER_REVIEW'
        :'READY_FOR_FIRST_VIRTUAL_BUY'
    };
  }

  async quote(signal:'UP'|'DOWN'='UP',stakeCents=100) {
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
    return requestDemoQuote(demoSocketUrl(otp),signal,stakeCents);
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
    if(latest.account_type!=='demo'||latest.currency!=='USD'||!Number.isFinite(latest.balance))
      throw Error('DEMO_ACCOUNT_UNAVAILABLE');
    const balanceCents=Math.round(latest.balance*100);
    if(Math.abs(latest.balance*100-balanceCents)>0.00001)
      throw Error('DEMO_BALANCE_INVALID');
    this.write('demo-last-balance-cents',balanceCents);
    this.write('demo-last-balance-at',epoch());
    // The UI must show the broker's latest verified balance rather than
    // the original OAuth snapshot or a synthetic PAPER-equity estimate.
    this.write('snapshot',{account:latest,checkedAt:epoch(),expiresAt:creds.expiresAt});
    if(balanceCents<=DEMO_BASELINE_EXPECTED_CENTS-DEMO_MAX_LOSS_CENTS){
      this.write('demo-loss-halt',true);
      this.write('demo-auto',false);
    }
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
  async refreshDemoRisk(){
    if(!this.status().connected)
      return {state:'NOT_CONNECTED',tradeReport:this.reportDemo()};
    await this.verifiedDemoCredentials();
    return {state:'BROKER_BALANCE_VERIFIED',tradeReport:this.reportDemo()};
  }

  async setDemoAutomation(enabled:boolean,maxConcurrent?:number) {
    if(typeof enabled!=='boolean')throw Error('DEMO_AUTO_INVALID');
    const chosen=maxConcurrent??this.chosenMaxConcurrent();
    if(!Number.isSafeInteger(chosen)||chosen<1||chosen>10)throw Error('DEMO_CONCURRENCY_INVALID');
    if(enabled){
      if(String(this.env.DEMO_AUTO_ENABLED)!=='true'||String(this.env.DEMO_BUY_ENABLED)!=='true')
        throw Error('DEMO_AUTO_DISABLED');
      // Never launch the 50-trade campaign until a real broker DEMO settlement
      // from a single owner-approved manual order has been reconciled.
      // Browser-supplied acknowledgements are not independent broker evidence.
       const verified=this.ctx.storage.sql.exec<{n:number}>(
         "SELECT COUNT(*) AS n FROM demo_trades WHERE state='SETTLED' AND COALESCE(code,'')!='CLIENT_OBSERVED'"
       ).one().n;
       requireFirstDemoSettlement(verified);
      await this.verifiedDemoCredentials();
      const next=pickDemoStakeCents(this.read<number>('demo-stake-index')||0);
      const snapshot=this.getRiskSnapshot();
      if(snapshot.brokerBalanceCents===null)throw Error('DEMO_BROKER_BALANCE_UNVERIFIED');
      const safety=evaluateDemoRisk({...snapshot,brokerBalanceCents:snapshot.brokerBalanceCents,stakeCents:next,maxConcurrent:chosen});
      if(!safety.allowed)throw Error(safety.reason);
    }
    this.write('demo-max-concurrent',chosen);
    this.write('demo-auto',enabled);
    return {mode:'DERIV_DEMO',autoEnabled:enabled,maxConcurrent:chosen,tradeReport:this.reportDemo()};
  }

  isDemoAutoEnabled(){
    return this.read<boolean>('demo-auto')===true
      &&String(this.env.DEMO_AUTO_ENABLED)==='true'
      &&String(this.env.DEMO_BUY_ENABLED)==='true'
      &&this.read<boolean>('demo-loss-halt')!==true;
  }

  /**
   * Browser-side one-contract recovery bridge for an origin that rejects
   * Cloudflare outbound WebSocket handshakes. A new 120-second broker OTP
   * authorizes ONLY the verified demo account; never /ws/real.
   * The private browser receives a single-use ephemeral OTP URL: it is
   * NEVER written into public HTML, console output or GitHub.
   *
   * The broker responses are delivered by the owner's browser, not
   * independently attested by our Worker. Such trades remain excluded
   * from eligibility for unattended automation.
   */
  /**
   * MCP does not buy Deriv contracts. It may queue ONE strictly DEMO intent.
   * The owner must click an explicit confirmation in the private browser.
   */
  /**
   * Evaluate real public tick HISTORY supplied by the owner's authenticated
   * browser. Cloudflare cannot reliably open the Deriv public WebSocket.
   * This source is CLIENT-OBSERVED, not independent server verification.
   */
  analyzeBrowserPrices(history:unknown) {
    if(!history||typeof history!=='object'||Array.isArray(history))
      throw Error('DEMO_BROWSER_PRICES_INVALID');
    const h=history as {symbol?:unknown;prices?:unknown;times?:unknown};
    if(!isDemoSymbol(h.symbol)||!Array.isArray(h.prices)||!Array.isArray(h.times)
      ||h.prices.length!==150||h.times.length!==150)
      throw Error('DEMO_BROWSER_PRICES_INVALID');
    const n=epoch(),prices:number[]=[],times:number[]=[];
    for(let i=0;i<150;i++){
      const raw=h.prices[i],t=h.times[i];
      if((typeof raw!=='number'&&typeof raw!=='string')
        ||(typeof t!=='number'&&typeof t!=='string'))
        throw Error('DEMO_BROWSER_PRICES_INVALID');
      const v=Number(raw),at=Number(t);
      if(!Number.isFinite(v)||v<=0||!Number.isSafeInteger(at)
        ||at<n-900||at>n+5||(i>0&&at<times[i-1]))
        throw Error('DEMO_BROWSER_PRICES_INVALID');
      prices.push(v);times.push(at);
    }
    if(n-times[149]>10)throw Error('DEMO_BROWSER_PRICES_STALE');
    const a=analyzeSignal(prices);
    const direction=a.direction===1?'UP':a.direction===-1?'DOWN':'HOLD';
    const record={direction,reason:a.reason,quoteAgeSeconds:n-times[149],
      at:n,symbol:h.symbol,source:'OWNER_BROWSER_REPORTED_PUBLIC_'+h.symbol,
      verifiedIndependently:false,valid:direction!=='HOLD',
      indicator:{fast:a.fast,slow:a.slow,rsi:a.rsi,volatility:a.volatility}};
    this.write('demo-browser-signal:'+h.symbol,record);
    if(h.symbol==='R_100')this.write('demo-browser-signal',record);
    return record;
  }

  getBrowserSignal(symbol:DemoSymbol='R_100'){
    const saved=this.read<{
      direction:'UP'|'DOWN'|'HOLD';reason:string;quoteAgeSeconds:number;
      at:number;source:string;verifiedIndependently:boolean;valid:boolean;
      indicator:{fast:number|null;slow:number|null;rsi:number|null;volatility:number|null}
    }>(symbol==='R_100'?'demo-browser-signal':'demo-browser-signal:'+symbol);
    if(!saved||epoch()-saved.at>10||saved.at>epoch())return {
      direction:'HOLD' as const,reason:'NO_FRESH_BROWSER_PRICE_FEED',
      source:'OWNER_BROWSER_PUBLIC_'+symbol,quoteAgeSeconds:null,
      valid:false,verifiedIndependently:false
    };
    return {...saved,quoteAgeSeconds:saved.quoteAgeSeconds+(epoch()-saved.at)};
  }

  getMcpDemoIntent(){
    const x=this.read<{id:string;createdAt:number;expiresAt:number;
      state:'PENDING'|'CLAIMED'|'SETTLED'|'CANCELLED';signal:'UP'|'DOWN';
      stakeCents:number;contractId?:number}>('demo-mcp-intent');
    if(!x)return {status:'EMPTY',brokerOrders:0};
    // Once the browser claims an intent, never expire it automatically:
    // a Deriv buy may be in flight or its acknowledgement may be uncertain.
    if(x.state==='PENDING'&&x.expiresAt<epoch())
      return {...x,state:'EXPIRED',brokerOrders:0};
    return {...x,brokerOrders:0,requiresOwnerApproval:x.state==='PENDING'};
  }

  queueMcpDemoIntent(input:{signal:'UP'|'DOWN';stakeCents:number;source:'MCP_OWNER_REVIEW'}){
    if(input.source!=='MCP_OWNER_REVIEW'||(input.signal!=='UP'&&input.signal!=='DOWN')
      ||!DEMO_STAKES_CENTS.some(n=>n===input.stakeCents))
      throw Error('DEMO_MCP_INTENT_INVALID');
    if(String(this.env.DEMO_BUY_ENABLED)!=='true')throw Error('DEMO_EXECUTION_DISABLED');
    const status=this.status();
    if(!status.connected)throw Error('DERIV_DEMO_REQUIRED');
    if(status.demoAutomationRequested)throw Error('DEMO_AUTOMATION_ALREADY_ACTIVE');
    if(status.nextManualStakeCents!==input.stakeCents)throw Error('DEMO_STAKE_WRONG_NEXT');
    const risk=this.riskFor(input.stakeCents);
    if(!risk.allowed)throw Error(risk.reason);
    const previous=this.getMcpDemoIntent();
    if((previous as {state?:string}).state==='PENDING'
      ||(previous as {state?:string}).state==='CLAIMED')
      throw Error('DEMO_MCP_INTENT_PENDING');
    const intent={id:crypto.randomUUID(),state:'PENDING' as const,
      signal:input.signal,stakeCents:input.stakeCents,createdAt:epoch(),
      expiresAt:epoch()+45};
    this.write('demo-mcp-intent',intent);
    return {status:'PENDING_OWNER_CONFIRMATION',intentId:intent.id,
      signal:intent.signal,stakeCents:intent.stakeCents,expiresAt:intent.expiresAt,
      brokerOrders:0,requiresOwnerApproval:true,
      note:'El comando fue colocado en cola. Abrir el panel privado y aprobar UNA compra DEMO.'};
  }

  claimMcpDemoIntent(id:string){
    const intent=this.read<{id:string;state:string;signal:'UP'|'DOWN';
      stakeCents:number;expiresAt:number;createdAt:number}>('demo-mcp-intent');
    if(!intent||intent.id!==id||intent.state!=='PENDING'||intent.expiresAt<epoch())
      throw Error('DEMO_MCP_INTENT_EXPIRED');
    if(this.status().nextManualStakeCents!==intent.stakeCents)
      throw Error('DEMO_STAKE_WRONG_NEXT');
    const risk=this.riskFor(intent.stakeCents);
    if(!risk.allowed)throw Error(risk.reason);
    this.write('demo-mcp-intent',{...intent,state:'CLAIMED'});
    return {state:'CLAIMED',intentId:intent.id,signal:intent.signal,
      stakeCents:intent.stakeCents,accountType:'demo',brokerOrders:0};
  }

  completeMcpDemoIntent(id:string,contractId:number){
    const intent=this.read<{id:string;state:string;signal:'UP'|'DOWN';
      stakeCents:number;expiresAt:number;createdAt:number}>('demo-mcp-intent');
    if(!intent||intent.id!==id||intent.state!=='CLAIMED'
      ||!Number.isSafeInteger(contractId)||contractId<=0)throw Error('DEMO_MCP_INTENT_INVALID');
    const row=this.ctx.storage.sql.exec<{state:string;code:string;pnl_cents:number}>(
      'SELECT state,code,pnl_cents FROM demo_trades WHERE contract_id=? ORDER BY id DESC LIMIT 1',contractId
    ).toArray()[0];
    if(!row||row.state!=='SETTLED'||row.code!=='CLIENT_OBSERVED')
      throw Error('DEMO_MCP_SETTLEMENT_NOT_OBSERVED');
    this.write('demo-mcp-intent',{...intent,state:'SETTLED',contractId});
    return {state:'SETTLED',accountType:'demo',contractId,
      pnlCents:row.pnl_cents,independentlyVerified:false,
      outcome:row.pnl_cents>0?'WIN':row.pnl_cents<0?'LOSS':'FLAT'};
  }

  cancelMcpDemoIntent(id:string){
    const intent=this.read<{id:string;state:string;signal:'UP'|'DOWN';
      stakeCents:number;expiresAt:number;createdAt:number}>('demo-mcp-intent');
    if(!intent||intent.id!==id)throw Error('DEMO_MCP_INTENT_INVALID');
    if(intent.state==='CLAIMED')throw Error('DEMO_MCP_IN_FLIGHT_CHECK_BROKER');
    if(intent.state!=='PENDING')return {state:intent.state,brokerOrders:0};
    this.write('demo-mcp-intent',{...intent,state:'CANCELLED'});
    return {state:'CANCELLED',brokerOrders:0};
  }

  /** One owner-confirmed campaign can open up to ten DISTINCT DEMO options.
   * BUY commands are sent by the owner's authenticated browser, never by MCP.
   * No `/ws/real`, no retries of any uncertain buy acknowledgement.
   */
  private burstState(){
    return this.read<{id:string;nonce:string;state:string;signal:'UP'|'DOWN'|'AUTO';
      accountId:string;count:number;stakeCents:number;startedAt:number;
      ids:number[];pendingId:number|null}>('demo-burst');
  }
  demoBurstStatus(){
    const b=this.burstState();
    if(!b)return {status:'EMPTY',accountType:'demo',confirmed:0,requested:0,
      opened:0,settled:0,commitmentCents:0,brokerOrders:0};
    const rows=b.ids.map(id=>this.ctx.storage.sql.exec<{
      id:number;contract_id:number|null;state:string;buy_cents:number|null;
      pnl_cents:number|null;contract_type:string|null
    }>('SELECT id,contract_id,state,buy_cents,pnl_cents,contract_type FROM demo_trades WHERE id=?',id).toArray()[0])
      .filter((r):r is {id:number;contract_id:number|null;state:string;buy_cents:number|null;
        pnl_cents:number|null;contract_type:string|null}=>!!r);
    return {status:b.state,accountType:'demo',runId:b.id,
      requested:b.count,confirmed:rows.length,
      opened:rows.filter(r=>r.state==='OPEN').length,
      settled:rows.filter(r=>r.state==='SETTLED').length,
      commitmentCents:rows.reduce((n,r)=>n+(r.buy_cents||0),0),
      realizedPnlCents:rows.filter(r=>r.state==='SETTLED')
        .reduce((n,r)=>n+(r.pnl_cents||0),0),
      uncertain:b.pendingId!==null,
      contracts:rows.map(r=>({id:r.id,contractId:r.contract_id,state:r.state,
        stakeCents:r.buy_cents,pnlCents:r.pnl_cents,direction:r.contract_type})),
      lastUpdatedAt:epoch(),independentlyVerified:false};
  }
  planDemoBurst(requested:number,stakeCents:number=DEMO_BURST_STAKE_CENTS){
    const snapshot=this.getRiskSnapshot(),saved=this.read<{expiresAt:number}>('snapshot');
    const active=this.burstState();
    const blocked=active&&['PREPARING','BUYING','RECONCILING','REVIEW'].includes(active.state);
    const planning=planDemoBurst(requested,{
      pilotPurchases:snapshot.pilotPurchases,
      pilotCommittedCents:snapshot.pilotCommittedCents,
      batchCommittedCents:snapshot.batchCommittedCents,
      openContracts:snapshot.openContracts,unknownCount:snapshot.unknownCount,
      exposureCents:snapshot.exposureCents,brokerBalanceCents:snapshot.brokerBalanceCents,
      balanceCheckedAt:this.read<number>('demo-last-balance-at')||0,now:epoch(),
      demoConnected:!!saved&&saved.expiresAt>epoch()&&!!this.read('credentials'),
      autoActive:this.read<boolean>('demo-auto')===true,
      batchSettlementPending:snapshot.batchSettlementPending,halted:snapshot.halted
    },stakeCents);
    return blocked?{...planning,allowed:false,reason:'DEMO_BURST_ALREADY_ACTIVE'}:planning;
  }
  async beginDemoBurst(input:{count:number;signal:'UP'|'DOWN'|'AUTO';stakeCents?:number}){
    if(String(this.env.DEMO_BUY_ENABLED)!=='true')throw Error('DEMO_EXECUTION_DISABLED');
    if(!input||!Number.isSafeInteger(input.count)||input.count<1||input.count>10||
       (!['UP','DOWN','AUTO'].includes(input.signal)||
        !DEMO_STAKES_CENTS.some(x=>x===(input.stakeCents??100))))
      throw Error('DEMO_BURST_REQUEST_INVALID');
    if(this.burstState()&&
      ['PREPARING','BUYING','RECONCILING','REVIEW'].includes(this.burstState()!.state))
      throw Error('DEMO_BURST_ALREADY_ACTIVE');
    // Read-only official account refresh before any OTP or buy.
    await this.refresh();
    const ready=input.signal==='AUTO'
      ?DEMO_SUPPORTED_SYMBOLS.some(symbol=>{
         const value=this.getBrowserSignal(symbol);
         return value.valid&&value.quoteAgeSeconds!==null&&value.quoteAgeSeconds<=10;
       })
      :(()=>{const value=this.getBrowserSignal();
         return value.valid&&value.direction===input.signal&&
            value.quoteAgeSeconds!==null&&value.quoteAgeSeconds<=10;})();
    if(!ready)throw Error('DEMO_BURST_FRESH_SIGNAL_REQUIRED');
    const stakeCents=input.stakeCents??100;
    const plan=this.planDemoBurst(input.count,stakeCents);
    if(!plan.allowed)throw Error(plan.reason||'DEMO_BURST_RISK_BLOCKED');
    const creds=await this.verifiedDemoCredentials();
    const b={id:crypto.randomUUID(),nonce:random(),state:'PREPARING',
      signal:input.signal,accountId:creds.accountId,
      count:input.count,stakeCents,
      startedAt:epoch(),ids:[] as number[],pendingId:null as number|null};
    this.write('demo-burst',b);
    this.write('demo-auto',false);
    try{
      const wsUrl=await this.otpDemoUrl(creds);
      if(this.burstState()?.id!==b.id)throw Error('DEMO_BURST_CONFLICT');
      this.write('demo-burst-ws-session',await this.seal({url:wsUrl,runId:b.id}));
      this.write('demo-burst',{...b,state:'BUYING'});
      // OTP is returned ONLY to the owner's private browser. Never to MCP/status.
      return {mode:'DEMO_BROWSER_BURST',accountType:'demo',wsUrl,
        nonce:b.nonce,runId:b.id,count:b.count,stakeCents:b.stakeCents,signal:b.signal,
        requiresDistinctBrokerAcks:true,autoRetry:false};
    }catch{
      if(this.burstState()?.id===b.id)this.write('demo-burst',{...b,state:'HALTED'});
      throw Error('DEMO_BURST_OTP_UNAVAILABLE');
    }
  }
  async reserveDemoBurst(input:{nonce:string;proposalId:string;
    askPrice:number;payout:number;evidence?:{
      fast?:number|null;slow?:number|null;rsi?:number|null;
      volatility?:number|null;entryQuote?:number|null;quoteAgeSeconds?:number|null;
      reason?:string}}){
    const b=this.burstState();
    // Freeze a single owner-approved direction for at most 45 seconds.
    // Do not switch sides mid-campaign or require 10 separate user approvals.
    if(!b||b.state!=='BUYING'||input?.nonce!==b.nonce||
      b.pendingId!==null||b.ids.length>=b.count||epoch()-b.startedAt>45)
      throw Error('DEMO_BURST_RESERVATION_NOT_ALLOWED');
    // Recalculate against the last authenticated browser-reported public ticks
    // for EVERY proposal, not only the first one in this burst.
    const latestSignal=this.getBrowserSignal();
    if(!latestSignal.valid||latestSignal.direction!==b.signal||
       latestSignal.quoteAgeSeconds===null||latestSignal.quoteAgeSeconds>5)
      throw Error('DEMO_BURST_SIGNAL_STALE_OR_REVERSED');
    const credentials=await this.verifiedDemoCredentials();
    if(credentials.accountId!==b.accountId)throw Error('DEMO_ONLY');
    const session=this.read<{iv:string;data:string}>('demo-burst-ws-session');
    if(!session)throw Error('DEMO_BURST_SESSION_REQUIRED');
    const verified=await this.unseal<{url:string;runId:string}>(session);
    if(verified.runId!==b.id)throw Error('DEMO_BURST_SESSION_INVALID');
    const quote:DemoQuoteForBuy={
      id:input.proposalId,askPrice:input.askPrice,payout:input.payout,
      quotedAt:epoch(),stakeCents:b.stakeCents,
      symbol:'R_100',durationTicks:5,contractType:b.signal==='UP'?'CALL':'PUT'
    };
    const risk=this.getRiskSnapshot();
    if(risk.brokerBalanceCents===null)throw Error('DEMO_BROKER_BALANCE_UNVERIFIED');
    const buy=buildDemoBuyRequest({
      accountType:'demo',currency:'USD',userEnabledDemoExecution:true,
      socketUrl:verified.url,signal:b.signal,quote,now:epoch(),
      openContracts:risk.openContracts,unknownCount:risk.unknownCount,
      exposureCents:risk.exposureCents,lifetimeNetCents:risk.lifetimeNetCents,
      brokerBalanceCents:risk.brokerBalanceCents,
      baselineBalanceCents:risk.baselineBalanceCents,
      halted:risk.halted,maxConcurrent:10,
      pilotPurchases:risk.pilotPurchases,pilotCommittedCents:risk.pilotCommittedCents,
      batchCommittedCents:risk.batchCommittedCents,
      batchSettlementPending:risk.batchSettlementPending
    });
    const id=this.ctx.storage.transactionSync(()=>{
      const latest=this.burstState(),snap=this.getRiskSnapshot();
      if(!latest||latest.id!==b.id||latest.state!=='BUYING'||
        latest.pendingId!==null||latest.ids.length>=latest.count||snap.unknownCount>0)
        throw Error('DEMO_BURST_ATOMIC_LOCK');
      if(epoch()-(this.read<number>('demo-last-balance-at')||0)>30)
        throw Error('DEMO_BALANCE_REFRESH_REQUIRED');
      const limits=planDemoBurst(1,{
        pilotPurchases:snap.pilotPurchases,
        pilotCommittedCents:snap.pilotCommittedCents,
        batchCommittedCents:snap.batchCommittedCents,
        openContracts:0,unknownCount:0,exposureCents:snap.exposureCents,
        brokerBalanceCents:snap.brokerBalanceCents,
        balanceCheckedAt:this.read<number>('demo-last-balance-at')||0,now:epoch(),
        demoConnected:true,autoActive:false,batchSettlementPending:snap.batchSettlementPending,
        halted:snap.halted
      });
      if(!limits.allowed)throw Error(limits.reason||'DEMO_BURST_RISK_LIMIT');
      const d=input.evidence||{};
      this.ctx.storage.sql.exec(
        "INSERT INTO demo_trades(date,created_at,state,buy_cents,contract_type,decision_json,code) VALUES(?,?,'UNKNOWN',?,?,?,'CLIENT_PENDING')",
        dayAt(epoch()),epoch(),b.stakeCents,quote.contractType,
        JSON.stringify({strategy:'owner-browser-burst-v1',
          runId:b.id,source:'owner-browser-unverified',direction:b.signal,
          stakeCents:b.stakeCents,contractType:quote.contractType,
          fast:researchNumber(d.fast,0,1000000),slow:researchNumber(d.slow,0,1000000),
          rsi:researchNumber(d.rsi,0,100),
          volatility:researchNumber(d.volatility,0,100),
          entryQuote:researchNumber(d.entryQuote,0,1000000),
          quoteAgeSeconds:researchNumber(d.quoteAgeSeconds,0,3600),
          reason:typeof d.reason==='string'&&/^[A-Z_]{1,45}$/.test(d.reason)
            ?d.reason:'UNVERIFIED',recordedAt:epoch()})
      );
      const id=this.ctx.storage.sql.exec<{id:number}>('SELECT last_insert_rowid() AS id').one().id;
      this.write('demo-burst',{...latest,pendingId:id});
      return id;
    });
    return {mode:'DEMO_BURST_RESERVED',accountType:'demo',id,request:buy,
      contractCountRequested:b.count,buyOrdersInThisResponse:0};
  }
  acknowledgeDemoBurst(input:{nonce:string;id:number;response:unknown}){
    const b=this.burstState();
    if(!b||b.state!=='BUYING'||b.nonce!==input?.nonce||
       b.pendingId!==input.id)throw Error('DEMO_BURST_ACK_NOT_ALLOWED');
    const row=this.ctx.storage.sql.exec<{buy_cents:number}>(
      "SELECT buy_cents FROM demo_trades WHERE id=? AND state='UNKNOWN'",input.id
    ).toArray()[0];
    if(!row)throw Error('DEMO_BURST_ACK_NOT_ALLOWED');
    const ack=parseDemoBuyResponse(input.response,row.buy_cents);
    this.ctx.storage.transactionSync(()=>{
      if(!ack.accepted){
        this.ctx.storage.sql.exec(
          "UPDATE demo_trades SET state='REJECTED',code=? WHERE id=? AND state='UNKNOWN'",
          ack.code,input.id);
        this.write('demo-burst',{...b,state:'HALTED',pendingId:null});
      }else{
        this.ctx.storage.sql.exec(
          "UPDATE demo_trades SET state='OPEN',contract_id=?,buy_cents=?,bought_at=?,code='CLIENT_ACK' WHERE id=? AND state='UNKNOWN'",
          ack.contractId,ack.buyCents,ack.purchaseTime,input.id);
        const ids=[...b.ids,input.id];
        this.write('demo-burst',{...b,ids,pendingId:null,
          state:ids.length===b.count?'RECONCILING':'BUYING'});
      }
    });
    return {mode:'DEMO_BURST_ACK',accepted:ack.accepted,
      contractId:ack.accepted?ack.contractId:null,
      state:ack.accepted?'OPEN':'REJECTED',
      requested:b.count,confirmed:ack.accepted?b.ids.length+1:b.ids.length,
      accountType:'demo',independentlyVerified:false};
  }
  haltDemoBurst(){
    const b=this.burstState();
    if(!b)return {status:'EMPTY',brokerOrders:0};
    if(!['BUYING','PREPARING'].includes(b.state))return this.demoBurstStatus();
    this.write('demo-burst',{...b,state:b.pendingId===null?'HALTED':'REVIEW'});
    return this.demoBurstStatus();
  }
  async beginDemoBurstSettlement(){
    const b=this.burstState();
    if(!b||b.ids.length===0)throw Error('DEMO_BURST_NO_KNOWN_CONTRACTS');
    if(b.state==='BUYING')this.write('demo-burst',{...b,state:'RECONCILING'});
    const creds=await this.verifiedDemoCredentials();
    if(creds.accountId!==b.accountId)throw Error('DEMO_ONLY');
    const url=await this.otpDemoUrl(creds);
    const known=this.demoBurstStatus();
    return {mode:'DEMO_BURST_SETTLEMENT',accountType:'demo',
      wsUrl:url,nonce:b.nonce,runId:b.id,noOrders:true,
      contracts:(known.contracts||[]).filter(t=>t.state==='OPEN'&&t.contractId)};
  }
  settleDemoBurst(input:{nonce:string;id:number;response:unknown}){
    const b=this.burstState();
    if(!b||b.nonce!==input?.nonce||!b.ids.includes(input.id))
      throw Error('DEMO_BURST_SETTLEMENT_NOT_ALLOWED');
    const row=this.ctx.storage.sql.exec<{
      contract_id:number;buy_cents:number;contract_type:string
    }>("SELECT contract_id,buy_cents,contract_type FROM demo_trades WHERE id=? AND state='OPEN'",input.id).toArray()[0];
    if(!row)throw Error('DEMO_BURST_SETTLEMENT_NOT_ALLOWED');
    const settlement=parseDemoSettlement(input.response,row.contract_id,
      row.contract_type==='PUT'?'PUT':'CALL',row.buy_cents);
    if(!settlement)return {state:'OPEN',independentlyVerified:false};
    this.ctx.storage.transactionSync(()=>{
      this.ctx.storage.sql.exec(
        "UPDATE demo_trades SET state='SETTLED',pnl_cents=?,payout_cents=?,entry_spot=?,exit_spot=?,settled_at=?,code='CLIENT_OBSERVED' WHERE id=? AND state='OPEN'",
        settlement.profitCents,settlement.payoutCents,
        settlement.entrySpot??null,settlement.exitSpot??null,epoch(),input.id);
      const status=this.demoBurstStatus();
      if(status.settled===b.count&&status.uncertain===false)
        this.write('demo-burst',{...b,state:'COMPLETE'});
    });
    return {state:'SETTLED',independentlyVerified:false,settlement,
      run:this.demoBurstStatus()};
  }

  async beginBrowserPilot(signal:'UP'|'DOWN',stakeCents:number) {
    if(['BUYING','PREPARING','RECONCILING','REVIEW'].includes(this.burstState()?.state||''))
      throw Error('DEMO_BURST_ALREADY_ACTIVE');
    if(String(this.env.DEMO_BUY_ENABLED)!=='true')throw Error('DEMO_EXECUTION_DISABLED');
    if((signal!=='UP'&&signal!=='DOWN')||!DEMO_STAKES_CENTS.some(s=>s===stakeCents))
      throw Error('DEMO_BROWSER_PARAMETERS_INVALID');
    const planned=this.currentManualStakeCents();
    if(stakeCents!==planned)throw Error('DEMO_QUOTE_WRONG_NEXT_STAKE');
    const existing=this.read<{id:number;at:number}>('demo-browser-reservation');
    if(existing&&['UNKNOWN','OPEN'].includes((existing as {state?:string}).state||''))throw Error('DEMO_BROWSER_ORDER_PENDING');
    const creds=await this.verifiedDemoCredentials();
    const risk=this.riskFor(stakeCents);
    if(!risk.allowed)throw Error(risk.reason);
    const checkedAt=this.read<number>('demo-last-balance-at');
    if(checkedAt===null||epoch()-checkedAt>45)throw Error('DEMO_BALANCE_REFRESH_REQUIRED');
    const url=await this.otpDemoUrl(creds);
    const nonce=random();
    // The socket URL is a credential, stored encrypted, never returned in status.
    const sealed=await this.seal({nonce,url,accountId:creds.accountId,signal,stakeCents,at:epoch(),used:false});
    this.write('demo-browser-session',sealed);
    return {mode:'DEMO_BROWSER_PILOT',readOnly:false,noOrders:true,
      wsUrl:url,nonce,signal,stakeCents,expiresInSeconds:60,accountType:'demo'};
  }

  async reserveBrowserPilot(input:{
    nonce:string;signal:'UP'|'DOWN';stakeCents:number;
    proposalId:string;askPrice:number;payout:number;
    evidence?:{pilot?:'balanced-ten'|'manual';fast?:number|null;slow?:number|null;
      rsi?:number|null;volatility?:number|null;entryQuote?:number|null;
      quoteAgeSeconds?:number|null;reason?:string};
  }) {
    const sealed=this.read<{iv:string;data:string}>('demo-browser-session');
    if(!sealed)throw Error('DEMO_BROWSER_SESSION_REQUIRED');
    const session=await this.unseal<{nonce:string;url:string;accountId:string;signal:string;stakeCents:number;at:number;used:boolean}>(sealed);
    if(!input||input.nonce!==session.nonce||session.used||session.at>epoch()
      ||epoch()-session.at>60||input.signal!==session.signal
      ||input.stakeCents!==session.stakeCents)throw Error('DEMO_BROWSER_SESSION_INVALID');
    const creds=await this.verifiedDemoCredentials();
    if(creds.accountId!==session.accountId)throw Error('DEMO_ONLY');
    const risk=this.riskFor(input.stakeCents);
    if(!risk.allowed)throw Error(risk.reason);
    const quote:DemoQuoteForBuy={
      id:input.proposalId,askPrice:input.askPrice,payout:input.payout,
      symbol:'R_100',durationTicks:5,contractType:session.signal==='UP'?'CALL':'PUT',
      quotedAt:epoch(),stakeCents:input.stakeCents
    };
    const current=this.getRiskSnapshot();
    const buy=buildDemoBuyRequest({
      accountType:'demo',currency:'USD',socketUrl:session.url,
      userEnabledDemoExecution:true,signal:input.signal,quote,now:epoch(),
      openContracts:current.openContracts,unknownCount:current.unknownCount,
      exposureCents:current.exposureCents,lifetimeNetCents:current.lifetimeNetCents,
      brokerBalanceCents:risk.brokerBalanceCents,baselineBalanceCents:risk.baselineBalanceCents,
      halted:current.halted,maxConcurrent:this.chosenMaxConcurrent(),
      pilotPurchases:risk.pilotPurchases,pilotCommittedCents:risk.pilotCommittedCents,
      batchCommittedCents:risk.batchCommittedCents,batchSettlementPending:risk.batchSettlementPending
    });
    const today=dayAt(epoch());
    const id=this.ctx.storage.transactionSync(()=>{
      const fresh=this.read<{iv:string;data:string}>('demo-browser-session');
      if(!fresh||fresh.data!==sealed.data)throw Error('DEMO_BROWSER_SESSION_ALREADY_USED');
      // No second browser bridge while a response may be uncertain.
      if(this.getRiskSnapshot().unknownCount>0)throw Error('DEMO_BUY_OUTCOME_UNKNOWN');
      this.ctx.storage.sql.exec(
        "INSERT INTO demo_trades(date,created_at,state,buy_cents,contract_type,decision_json,code) VALUES(?,?,'UNKNOWN',?,?,?,'CLIENT_PENDING')",
        today,epoch(),input.stakeCents,quote.contractType,
        JSON.stringify({
          strategy:input.evidence?.pilot==='balanced-ten'?'balanced-ten-v1':'manual-browser-pilot-v1',
          source:'owner-browser-unverified',direction:session.signal,
          contractType:session.signal==='UP'?'CALL':'PUT',stakeCents:input.stakeCents,
          fast:researchNumber(input.evidence?.fast,0,1000000),
          slow:researchNumber(input.evidence?.slow,0,1000000),
          rsi:researchNumber(input.evidence?.rsi,0,100),
          volatility:researchNumber(input.evidence?.volatility,0,100),
          entryQuote:researchNumber(input.evidence?.entryQuote,0,1000000),
          quoteAgeSeconds:researchNumber(input.evidence?.quoteAgeSeconds,0,3600),
          reason:typeof input.evidence?.reason==='string'&&/^[A-Z_]{1,45}$/.test(input.evidence.reason)
            ?input.evidence.reason:'UNVERIFIED',
          recordedAt:epoch()
        })
      );
      const inserted=this.ctx.storage.sql.exec<{id:number}>('SELECT last_insert_rowid() AS id').one().id;
      this.write('demo-browser-reservation',{id:inserted,nonce:session.nonce,at:epoch(),state:'UNKNOWN'});
      this.write('demo-browser-session',null);
      return inserted;
    });
    return {mode:'DEMO_BROWSER_RESERVED',id,request:buy,accountType:'demo'};
  }

  async acknowledgeBrowserPilot(input:{nonce:string;id:number;response:unknown}) {
    const reservation=this.read<{id:number;nonce:string;at:number;state:string}>('demo-browser-reservation');
    if(!reservation||reservation.nonce!==input?.nonce||reservation.id!==input.id
      ||reservation.state!=='UNKNOWN')throw Error('DEMO_BROWSER_RESERVATION_INVALID');
    const row=this.ctx.storage.sql.exec<{buy_cents:number}>(
      "SELECT buy_cents FROM demo_trades WHERE id=? AND state='UNKNOWN'",input.id
    ).toArray()[0];
    if(!row)throw Error('DEMO_BROWSER_RESERVATION_INVALID');
    const ack=parseDemoBuyResponse(input.response,row.buy_cents);
    this.ctx.storage.transactionSync(()=>{
      if(ack.accepted){
        this.ctx.storage.sql.exec(
          "UPDATE demo_trades SET state='OPEN',contract_id=?,bought_at=?,code='CLIENT_ACK' WHERE id=? AND state='UNKNOWN'",
          ack.contractId,ack.purchaseTime,input.id);
      }else{
        this.ctx.storage.sql.exec(
          "UPDATE demo_trades SET state='REJECTED',code=? WHERE id=? AND state='UNKNOWN'",
          ack.code,input.id);
      }
      this.write('demo-browser-reservation',{...reservation,state:ack.accepted?'OPEN':'REJECTED'});
      if(ack.accepted){
        this.write('demo-stake-index',(this.read<number>('demo-stake-index')||0)+1);
        this.write('demo-manual-next-stake',null);
      }
    });
    return {mode:'DEMO_BROWSER_OBSERVED',independentlyVerified:false,
      accepted:ack.accepted,contractId:ack.accepted?ack.contractId:null,
      code:ack.accepted?null:ack.code,tradeReport:this.reportDemo()};
  }

  /** Read-only account-scoped contract check in the owner browser.
   * Used only after an acknowledged DEMO contract; never sends a buy.
   */
  async beginBrowserSettlement() {
    const r=this.read<{id:number;nonce:string;state:string}>('demo-browser-reservation');
    if(!r||r.state!=='OPEN')throw Error('DEMO_BROWSER_NO_OPEN_CONTRACT');
    const entry=this.ctx.storage.sql.exec<{contract_id:number}>(
      "SELECT contract_id FROM demo_trades WHERE id=? AND state='OPEN' AND code='CLIENT_ACK'",r.id
    ).toArray()[0];
    if(!entry||!Number.isSafeInteger(entry.contract_id))throw Error('DEMO_BROWSER_NO_OPEN_CONTRACT');
    const creds=await this.verifiedDemoCredentials();
    const url=await this.otpDemoUrl(creds);
    return {mode:'DEMO_BROWSER_SETTLEMENT',noOrders:true,accountType:'demo',
      wsUrl:url,nonce:r.nonce,id:r.id,contractId:entry.contract_id};
  }

  async settleBrowserPilot(input:{nonce:string;id:number;response:unknown}) {
    const reservation=this.read<{id:number;nonce:string;at:number;state:string}>('demo-browser-reservation');
    if(!reservation||reservation.nonce!==input?.nonce||reservation.id!==input.id
      ||reservation.state!=='OPEN')throw Error('DEMO_BROWSER_RESERVATION_INVALID');
    const row=this.ctx.storage.sql.exec<{contract_id:number;buy_cents:number;contract_type:string}>(
      "SELECT contract_id,buy_cents,contract_type FROM demo_trades WHERE id=? AND state='OPEN'",input.id
    ).toArray()[0];
    if(!row)throw Error('DEMO_BROWSER_RESERVATION_INVALID');
    const settlement=parseDemoSettlement(input.response,row.contract_id,
      row.contract_type==='PUT'?'PUT':'CALL',row.buy_cents);
    if(!settlement)return {state:'OPEN',independentlyVerified:false};
    this.ctx.storage.transactionSync(()=>{
      this.ctx.storage.sql.exec(
        "UPDATE demo_trades SET state='SETTLED',pnl_cents=?,payout_cents=?,entry_spot=?,exit_spot=?,settled_at=?,code='CLIENT_OBSERVED' WHERE id=? AND state='OPEN'",
        settlement.profitCents,settlement.payoutCents,
        settlement.entrySpot??null,settlement.exitSpot??null,epoch(),input.id);
      this.write('demo-browser-reservation',{...reservation,state:'SETTLED'});
    });
    return {state:'CLIENT_OBSERVED_SETTLEMENT',independentlyVerified:false,
      settlement,tradeReport:this.reportDemo()};
  }

  /**
   * One broker-verifiable DEMO trade. Stake selection rotates 10/25/50/100
   * virtual cents for scientific comparisons; never doubles after losses.
   * Each call verifies the authenticated broker account balance via REST.
   */
  /**
   * For an explicit owner click only. A recent accepted DEMO quote is required.
   * Unlike unattended automation, manual pilot research must not depend on
   * PAPER daily-loss stops or SMA/RSI signal availability.
   */
  manualApprovedSignal(): 'UP'|'DOWN'|'HOLD' {
    const a=this.read<{at:number;signal:string;stakeCents:number;accountId:string;purchases:number}>('demo-manual-preflight');
    const snap=this.read<{account:DemoAccount}>('snapshot');
    const planned=this.currentManualStakeCents();
    const count=this.getRiskSnapshot().pilotPurchases;
    if(!snap||!a||!['UP','DOWN'].includes(a.signal))return 'HOLD';
    const direction=a.signal as 'UP'|'DOWN';
    return validManualDemoApproval(a,{
      now:epoch(),signal:direction,stakeCents:planned,
      accountId:snap.account.account_id,purchases:count
    })?direction:'HOLD';
  }

  async buyDemoOnce(paperSignal:'UP'|'DOWN'|'HOLD',evidence?:{
    reason?:string;fast?:number|null;slow?:number|null;rsi?:number|null;
    volatility?:number|null;entryQuote?:number|null;quoteAgeSeconds?:number|null;
  },source:'manual'|'auto'='manual') {
    if(['PREPARING','BUYING','RECONCILING','REVIEW'].includes(this.burstState()?.state||''))
      throw Error('DEMO_BURST_ALREADY_ACTIVE');
    if(String(this.env.DEMO_BUY_ENABLED)!=='true')throw Error('DEMO_EXECUTION_DISABLED');
    if(paperSignal!=='UP'&&paperSignal!=='DOWN')throw Error('NO_APPROVED_SIGNAL');
    const creds=await this.verifiedDemoCredentials();
    if(source==='manual'){
      const approval=this.read<{at:number;signal:string;stakeCents:number;
        accountId:string;purchases:number}>('demo-manual-preflight');
      // Consume before sending any proposal, even when it fails.
      this.write('demo-manual-preflight',null);
      const planned=this.currentManualStakeCents();
      const current=this.getRiskSnapshot();
      if(!validManualDemoApproval(approval,{
        now:epoch(),signal:paperSignal,stakeCents:planned,
        accountId:creds.accountId,purchases:current.pilotPurchases
      }))throw Error('DEMO_FRESH_APPROVED_QUOTE_REQUIRED');
    }
    const index=this.read<number>('demo-stake-index')||0;
    const stakeCents=source==='manual'?this.currentManualStakeCents():pickDemoStakeCents(index);
    const firstRisk=this.riskFor(stakeCents);
    if(!firstRisk.allowed)throw Error(firstRisk.reason);
    // A rejected proposal advances the experiment instead of retrying
    // the same unaccepted amount indefinitely.
    this.write('demo-stake-index',index+1);
    if(source==='manual')this.write('demo-manual-next-stake',null);
    const url=await this.otpDemoUrl(creds);
    const safeNumber=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
    const decision=JSON.stringify({
      strategy:'sma-rsi-v1',direction:paperSignal,contractType:paperSignal==='UP'?'CALL':'PUT',
      stakeCents,reason:evidence?.reason==='TREND_AND_MOMENTUM'?'TREND_AND_MOMENTUM':'UNVERIFIED',
      fast:safeNumber(evidence?.fast),slow:safeNumber(evidence?.slow),
      rsi:safeNumber(evidence?.rsi),volatility:safeNumber(evidence?.volatility),
      entryQuote:safeNumber(evidence?.entryQuote),
      quoteAgeSeconds:safeNumber(evidence?.quoteAgeSeconds),
      recordedAt:epoch(),source:'Deriv public price feed'
    });
    const today=dayAt(epoch());
    const reserve=async(quote:DemoQuoteForBuy):Promise<number>=>{
      return this.ctx.storage.transactionSync(()=>{
        const lastBalanceAt=this.read<number>('demo-last-balance-at')||0;
        if(epoch()-lastBalanceAt>20)throw Error('DEMO_BALANCE_STALE');
        const risk=this.getRiskSnapshot();
        if(risk.brokerBalanceCents===null)throw Error('DEMO_BROKER_BALANCE_UNVERIFIED');
        const answer=buildDemoBuyRequest({
          accountType:'demo',currency:'USD',socketUrl:url,userEnabledDemoExecution:true,
          signal:paperSignal,quote,now:epoch(),openContracts:risk.openContracts,
          unknownCount:risk.unknownCount,exposureCents:risk.exposureCents,
          lifetimeNetCents:risk.lifetimeNetCents,brokerBalanceCents:risk.brokerBalanceCents,
          baselineBalanceCents:risk.baselineBalanceCents,halted:risk.halted,
          maxConcurrent:this.chosenMaxConcurrent(),
          pilotPurchases:risk.pilotPurchases,pilotCommittedCents:risk.pilotCommittedCents,
          batchCommittedCents:risk.batchCommittedCents,batchSettlementPending:risk.batchSettlementPending
        });
        if(answer.price!==stakeCents/100)throw Error('DEMO_STAKE_CHANGED');
        this.ctx.storage.sql.exec(
          "INSERT INTO demo_trades(date,created_at,state,buy_cents,decision_json,contract_type) VALUES(?,?,'UNKNOWN',?,?,?)",
          today,epoch(),stakeCents,decision,quote.contractType
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
          "UPDATE demo_trades SET state='OPEN',contract_id=?,buy_cents=?,bought_at=? WHERE id=? AND state='UNKNOWN'",
          ack.contractId,ack.buyCents,ack.purchaseTime,id
        );
      }
    };
    const current=this.getRiskSnapshot();
    if(current.brokerBalanceCents===null)throw Error('DEMO_BROKER_BALANCE_UNVERIFIED');
    const result=await buySingleDemoContract({
      wsUrl:url,stakeCents,gate:{
        accountType:'demo',currency:'USD',userEnabledDemoExecution:true,
        signal:paperSignal,openContracts:current.openContracts,unknownCount:current.unknownCount,
        exposureCents:current.exposureCents,lifetimeNetCents:current.lifetimeNetCents,
        brokerBalanceCents:current.brokerBalanceCents,baselineBalanceCents:current.baselineBalanceCents,
        halted:current.halted,maxConcurrent:this.chosenMaxConcurrent(),
        pilotPurchases:current.pilotPurchases,pilotCommittedCents:current.pilotCommittedCents,
        batchCommittedCents:current.batchCommittedCents,batchSettlementPending:current.batchSettlementPending
      },reserve,acknowledge
    });
    this.ctx.storage.sql.exec(
      "INSERT INTO demo_quote_checks(at,stake_cents,contract_type,accepted,code) VALUES(?,?,?,?,?)",
      epoch(),stakeCents,paperSignal==='UP'?'CALL':'PUT',
      result.state==='OPEN'?1:0,result.state==='REJECTED'?result.code:null
    );
    return {mode:'DERIV_DEMO',stakeCents,...result,tradeReport:this.reportDemo()};
  }

  /** Read-only settlement reconciler, never issues a second buy. */
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

  async checkDemoSettlement(contractId?:number) {
    const report=this.reportDemo();
    const pending=contractId===undefined?report.openContracts[0]:
      report.openContracts.find(r=>r.contractId===contractId);
    if(!pending)return {state:report.unknownCount>0?'BUY_OUTCOME_UNKNOWN':'NO_PENDING_CONTRACT',
      tradeReport:report};
    if(!pending.contractId||!pending.buyCents)return {state:'BUY_OUTCOME_UNKNOWN',tradeReport:report};
    const creds=await this.verifiedDemoCredentials();
    const url=await this.otpDemoUrl(creds);
    const result=await readDemoSettlement(url,pending.contractId,pending.contractType,pending.buyCents);
    if(result){
      this.ctx.storage.sql.exec(
        "UPDATE demo_trades SET state='SETTLED',pnl_cents=?,payout_cents=?,entry_spot=?,exit_spot=?,settled_at=? WHERE id=? AND contract_id=? AND state='OPEN'",
        result.profitCents,result.payoutCents,result.entrySpot??null,result.exitSpot??null,epoch(),
        pending.id,pending.contractId
      );
      const batchState=this.getRiskSnapshot();
      if(batchState.pilotPurchases>=DEMO_PILOT_MAX_PURCHASES
         &&batchState.openContracts===0&&batchState.unknownCount===0)
        this.write('demo-auto',false);
      return {state:'SETTLED',settlement:result,tradeReport:this.reportDemo()};
    }
    return {state:'OPEN',tradeReport:this.reportDemo()};
  }

}
