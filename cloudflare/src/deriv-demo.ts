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

/** Separate coordination atom for the owner's broker-demo authorization, never PAPER accounting. */
export class DerivDemoConnection extends DurableObject<Env> {
  constructor(ctx:DurableObjectState,env:Env){super(ctx,env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS demo_connection (slot TEXT PRIMARY KEY,data TEXT NOT NULL)');
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
  status(){
    const saved=this.read<{account:DemoAccount;checkedAt:number;expiresAt:number}>('snapshot');
    const connected=!!saved&&saved.expiresAt>epoch()&&!!this.read('credentials');
    return {mode:'DERIV_DEMO',connected,executionEnabled:false,aiConnected:false,clientId:this.read<string>('clientId')||'',
      account:connected&&saved?{type:'demo',currency:'USD',label:'Demo · …'+saved.account.account_id.slice(-4),balance:saved.account.balance,checkedAt:saved.checkedAt}:null,
      discovery:this.read<Discovery>('discovery'),state:connected?'DEMO_VERIFIED':saved?'AUTHORIZATION_EXPIRED':this.read('discovery')?'DEMO_ACCOUNT_NOT_VERIFIED':'NOT_CONNECTED'};
  }
  async refresh(){
    const sealed=this.read<{iv:string;data:string}>('credentials');if(!sealed)throw Error('DERIV_NOT_CONNECTED');
    const credentials=await this.unseal<Credentials>(sealed);if(credentials.expiresAt<=epoch())throw Error('DERIV_AUTHORIZATION_EXPIRED');
    const account=await this.accounts(credentials.accessToken,credentials.accountId);
    this.write('snapshot',{account,checkedAt:epoch(),expiresAt:credentials.expiresAt});return this.status();
  }
}
