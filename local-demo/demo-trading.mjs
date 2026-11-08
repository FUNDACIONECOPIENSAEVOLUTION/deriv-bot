// Compras EXCLUSIVAMENTE en cuenta Deriv DEMO, con aprobación humana en la ventana local.
// Jamás conectar /ws/real, jamás reintentar BUY ambiguo. Persistencia SQLite local.
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';

const SYMBOLS=new Set(['R_100','R_75','R_10','1HZ100V']);
const STAKES=new Set([35,50,75,90,100]);
const STOP_BALANCE_CENTS=990000; // DEMO 10000 USD: parada con pérdida de 100 USD.
const MAX_CAMPAIGN_PURCHASES=50;
const MAX_CAMPAIGN_COMMITTED_CENTS=5000;
const MAX_DAILY_LOSS_CENTS=10000;
const MAX_CONCURRENT=1; // Primera etapa: solo un contrato DEMO abierto.
const TERMINAL=new Set(['SETTLED','REJECTED','CANCELLED','EXPIRED']);
const epoch=()=>Math.floor(Date.now()/1000);
const cents=value=>Math.round(Number(value)*100);
const cleanError=error=>String(error?.message||'DEMO_BROKER_ERROR').replace(/[^A-Za-z0-9_]/g,'').slice(0,80);

export function createDemoTrading({db,getAccount,getCredentials,brokerHeaders,accountLookup,otpLookup,marketSnapshot,audit}) {
 db.exec("CREATE TABLE IF NOT EXISTS demo_local_orders (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, state TEXT NOT NULL, source TEXT NOT NULL, symbol TEXT NOT NULL, direction TEXT NOT NULL, stake_cents INTEGER NOT NULL, contract_id TEXT, buy_cents INTEGER, pnl_cents INTEGER, error_code TEXT)");
 // Any interrupted BUY may have reached the broker. Do NOT send another until reconciled.
 db.prepare("UPDATE demo_local_orders SET state='UNKNOWN',updated_at=? WHERE state IN ('PREPARING','SENDING')").run(epoch());
 const one=db.prepare('SELECT * FROM demo_local_orders WHERE id=?');
 const summary=db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(stake_cents),0) AS gross FROM demo_local_orders WHERE state IN ('SENDING','UNKNOWN','OPEN','SETTLED')");
 const active=db.prepare("SELECT COUNT(*) AS n FROM demo_local_orders WHERE state IN ('PENDING_APPROVAL','PREPARING','SENDING','UNKNOWN','OPEN')");
 const unresolved=db.prepare("SELECT COUNT(*) AS n FROM demo_local_orders WHERE state IN ('PREPARING','SENDING','UNKNOWN','OPEN')");
 const losses=db.prepare("SELECT COALESCE(SUM(CASE WHEN pnl_cents<0 THEN -pnl_cents ELSE 0 END),0) AS loss FROM demo_local_orders WHERE state='SETTLED' AND created_at>=?");
 const list=db.prepare('SELECT id,created_at,state,source,symbol,direction,stake_cents AS stakeCents,contract_id AS contractId,buy_cents AS buyCents,pnl_cents AS pnlCents,error_code AS errorCode FROM demo_local_orders ORDER BY created_at DESC LIMIT 60');
 const insert=db.prepare('INSERT INTO demo_local_orders(id,created_at,updated_at,state,source,symbol,direction,stake_cents) VALUES(?,?,?,?,?,?,?,?)');
 const change=db.prepare('UPDATE demo_local_orders SET state=?,updated_at=?,error_code=? WHERE id=?');
 const recordBuy=db.prepare("UPDATE demo_local_orders SET state='OPEN',updated_at=?,contract_id=?,buy_cents=? WHERE id=?");
 const recordSettlement=db.prepare("UPDATE demo_local_orders SET state='SETTLED',updated_at=?,pnl_cents=? WHERE id=?");

 function getSummary(){
  const stats=summary.get(),rows=list.all();
  return {mode:'DEMO_ONLY',realEnabled:false,maxConcurrent:MAX_CONCURRENT,
   campaignPurchases:stats.n,campaignGrossCents:stats.gross,maxPurchases:MAX_CAMPAIGN_PURCHASES,
   pendingOrOpen:unresolved.get().n,awaitingApproval:active.get().n-unresolved.get().n,
   orders:rows,canUpdate:active.get().n===0,
   warning:'Los contratos UNKNOWN requieren conciliación; jamás se repite un BUY sin confirmación.'};
 }
 function signalValid(symbol,direction){
  const s=marketSnapshot(symbol);
  return s&&s.fresh&&s.direction===direction&&s.ageReceivedMs!==null&&s.ageReceivedMs<=1000
    &&Number.isInteger(s.epoch)&&Math.abs(Date.now()-s.epoch*1000)<=2000;
 }
 function riskCheck(symbol,direction,stakeCents,balanceCents){
  if(!SYMBOLS.has(symbol)||!['CALL','PUT'].includes(direction)||!STAKES.has(stakeCents))
    throw Error('DEMO_PARAMETERS_INVALID');
  const a=getAccount();
  if(!a||a.currency!=='USD'||typeof a.accountId!=='string')throw Error('DEMO_ACCOUNT_NOT_VERIFIED');
  if(balanceCents<STOP_BALANCE_CENTS||balanceCents-stakeCents<STOP_BALANCE_CENTS)
    throw Error('DEMO_LOSS_STOP_100USD');
  const day=Math.floor(epoch()/86400)*86400;
  if(losses.get(day).loss>=MAX_DAILY_LOSS_CENTS)throw Error('DEMO_DAILY_LOSS_STOP');
  const s=summary.get();
  if(s.n>=MAX_CAMPAIGN_PURCHASES||s.gross+stakeCents>MAX_CAMPAIGN_COMMITTED_CENTS)
    throw Error('DEMO_CAMPAIGN_LIMIT');
  if(!signalValid(symbol,direction))throw Error('DEMO_SIGNAL_STALE_OR_CONTRARY');
 }
 function requestIntent({symbol,direction,stakeCents,source='LOCAL_OWNER'}){
  if(!['LOCAL_OWNER','MCP_OWNER_REVIEW'].includes(source))throw Error('DEMO_SOURCE_INVALID');
  const a=getAccount();
  if(!a||!Number.isFinite(a.balance)||epoch()-a.checkedAt>20)
    throw Error('DEMO_BALANCE_MUST_BE_REFRESHED');
  if(active.get().n>0)throw Error('DEMO_PENDING_CONTRACT_RECONCILIATION');
  riskCheck(symbol,direction,stakeCents,cents(a.balance));
  const id=randomUUID();
  insert.run(id,epoch(),epoch(),'PENDING_APPROVAL',source,symbol,direction,stakeCents);
  audit('DEMO_REVIEW_REQUEST','Solicitud pendiente. No se envió ningún BUY.');
  return {id,state:'PENDING_APPROVAL',accountType:'demo',symbol,direction,stakeCents,expiresAt:epoch()+45,
   brokerOrders:0,requiresOwnerConfirmation:true};
 }
 function cancel(id){
  const row=one.get(id);
  if(!row||row.state!=='PENDING_APPROVAL')throw Error('DEMO_INTENT_NOT_PENDING');
  change.run('CANCELLED',epoch(),null,id);
  return {state:'CANCELLED',brokerOrders:0};
 }
 function socketConnect(url){
  return new Promise((resolve,reject)=>{
   const socket=new WebSocket(url);let done=false;
   const t=setTimeout(()=>finish(Error('DEMO_SOCKET_TIMEOUT')),8000);
   function finish(error){if(done)return;done=true;clearTimeout(t);
    socket.removeEventListener('open',opened);socket.removeEventListener('error',failed);
    if(error){try{socket.close();}catch{}reject(error);}else resolve(socket);}
   const opened=()=>finish(null),failed=()=>finish(Error('DEMO_SOCKET_ERROR'));
   socket.addEventListener('open',opened);socket.addEventListener('error',failed);
  });
 }
 function sendAndWait(socket,request,expected,timeoutMs=8000){
  return new Promise((resolve,reject)=>{
   let ended=false;
   const t=setTimeout(()=>finish(Error('DEMO_RESPONSE_TIMEOUT')),timeoutMs);
   function finish(err,data){if(ended)return;ended=true;clearTimeout(t);
    socket.removeEventListener('message',onMessage);socket.removeEventListener('close',onClose);
    socket.removeEventListener('error',onError);
    if(err)reject(err);else resolve(data);}
   function onMessage(event){
    try{if(typeof event.data!=='string'||event.data.length>65536)throw Error('DEMO_REPLY_INVALID');
     const msg=JSON.parse(event.data);
     if(msg.req_id!==request.req_id)return;
     if(msg.error||msg.errors)throw Error('DEMO_BROKER_REJECTED');
     if(msg.msg_type===expected)finish(null,msg);
    }catch(error){finish(error);}
   }
   const onClose=()=>finish(Error('DEMO_SOCKET_CLOSED')),onError=()=>finish(Error('DEMO_SOCKET_ERROR'));
   socket.addEventListener('message',onMessage);socket.addEventListener('close',onClose);socket.addEventListener('error',onError);
   try{socket.send(JSON.stringify(request));}catch(e){finish(Error('DEMO_SEND_FAILED'));}
  });
 }
 async function readSettlement(socket,contractId){
  return new Promise((resolve,reject)=>{
   let done=false;const timer=setTimeout(()=>finish(null,{settled:false}),45000);
   function finish(err,val){if(done)return;done=true;clearTimeout(timer);
    socket.removeEventListener('message',onMsg);socket.removeEventListener('close',onClose);
    socket.removeEventListener('error',onError);if(err)reject(err);else resolve(val);}
   function onMsg(e){try{if(typeof e.data!=='string')return;const m=JSON.parse(e.data);
    if(m.error||m.errors){if(m.req_id===806)throw Error('DEMO_SETTLEMENT_REJECTED');return;}
    const c=m.proposal_open_contract;if(m.msg_type!=='proposal_open_contract'||!c)return;
    if(String(c.contract_id)!==String(contractId))return;
    if(c.is_sold===1||c.is_sold===true){
     const profit=Number(c.profit);
     if(!Number.isFinite(profit))throw Error('DEMO_SETTLEMENT_MONEY_INVALID');
     finish(null,{settled:true,pnlCents:cents(profit)});
    }
   }catch(err){finish(err);}}
   const onClose=()=>finish(null,{settled:false}),onError=()=>finish(null,{settled:false});
   socket.addEventListener('message',onMsg);socket.addEventListener('close',onClose);socket.addEventListener('error',onError);
   try{socket.send(JSON.stringify({proposal_open_contract:1,contract_id:Number(contractId),subscribe:1,req_id:806}));}
   catch{finish(null,{settled:false});}
  });
 }
 async function approve(id,confirmation){
  if(confirmation!=='CONFIRMAR COMPRA DEMO')throw Error('DEMO_CONFIRMATION_REQUIRED');
  const row=one.get(id);
  if(!row||row.state!=='PENDING_APPROVAL')throw Error('DEMO_INTENT_NOT_PENDING');
  if(epoch()-row.created_at>45){change.run('EXPIRED',epoch(),null,id);throw Error('DEMO_INTENT_EXPIRED');}
  const a=getAccount(),creds=await getCredentials();
  if(!a||a.accountId!==creds.accountId||a.currency!=='USD')throw Error('DEMO_ACCOUNT_MISMATCH');
  if(active.get().n!==1)throw Error('DEMO_ANOTHER_ORDER_PENDING');
  // Must verify the official DEMO USD balance again immediately before purchase.
  const fresh=await accountLookup(creds,a.accountId);
  if(fresh.accountId!==a.accountId)throw Error('DEMO_ACCOUNT_MISMATCH');
  riskCheck(row.symbol,row.direction,row.stake_cents,cents(fresh.balance));
  change.run('PREPARING',epoch(),null,id);
  let socket=null,dispatched=false,acknowledged=false;
  try{
   const url=await otpLookup(creds);
   if(new URL(url).pathname!=='/trading/v1/options/ws/demo')throw Error('DEMO_ONLY_REQUIRED');
   socket=await socketConnect(url);
   const request={proposal:1,amount:row.stake_cents/100,basis:'stake',
    contract_type:row.direction,currency:'USD',duration:5,duration_unit:'t',
    underlying_symbol:row.symbol,req_id:804};
   const t=performance.now(),quote=await sendAndWait(socket,request,'proposal');
   const proposal=quote.proposal||{};
   const price=Number(proposal.ask_price);
   if(typeof proposal.id!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(proposal.id)
     ||!Number.isFinite(price)||price<0||cents(price)>row.stake_cents)
     throw Error('DEMO_QUOTE_INVALID');
   if(performance.now()-t>2000||!signalValid(row.symbol,row.direction))throw Error('DEMO_QUOTE_STALE');
   change.run('SENDING',epoch(),null,id);
   // No automatic retries if the buy acknowledgement is lost.
   dispatched=true;
   const buy=await sendAndWait(socket,{buy:proposal.id,price,req_id:805},'buy',8000);
   if(!Number.isSafeInteger(Number(buy.buy?.contract_id))||Number(buy.buy.contract_id)<=0)
     throw Error('DEMO_BUY_ACK_INVALID');
   acknowledged=true;
   const contractId=String(buy.buy.contract_id),paid=Number(buy.buy.buy_price);
   recordBuy.run(epoch(),contractId,Number.isFinite(paid)?cents(paid):row.stake_cents,id);
   audit('DEMO_BUY_CONFIRMED','Contrato DEMO confirmado por broker');
   const result=await readSettlement(socket,contractId);
   if(result.settled){
    recordSettlement.run(epoch(),result.pnlCents,id);audit('DEMO_SETTLED','Resultado DEMO verificado');
   }
   return {state:result.settled?'SETTLED':'OPEN',id,contractId,
    pnlCents:result.settled?result.pnlCents:null,accountType:'demo',brokerOrders:1};
  }catch(error){
   // Explicit broker rejection after BUY means no purchase; network/timeout is UNKNOWN.
   const code=cleanError(error);
   const outcome=dispatched&&!acknowledged?(code==='DEMO_BROKER_REJECTED'?'REJECTED':'UNKNOWN')
     :acknowledged?'OPEN': 'REJECTED';
   change.run(outcome,epoch(),code,id);
   audit('DEMO_BUY_'+outcome,code);
   return {id,state:outcome,error:code,accountType:'demo',
    brokerOrders:outcome==='REJECTED'?0:null,
    note:outcome==='UNKNOWN'?'Revisar el broker; no volver a enviar BUY.':null};
  }finally{try{socket?.close();}catch{}}
 }
 async function reconcile(id){
  const row=one.get(id);
  if(!row||row.state!=='OPEN'||!row.contract_id)throw Error('DEMO_RECONCILE_MANUAL_REQUIRED');
  const creds=await getCredentials(),url=await otpLookup(creds);
  const socket=await socketConnect(url);
  try{
   const res=await sendAndWait(socket,{proposal_open_contract:1,contract_id:Number(row.contract_id),req_id:806},'proposal_open_contract');
   const contract=res.proposal_open_contract;
   if(contract?.is_sold===1||contract?.is_sold===true){
    const profit=Number(contract.profit);
    if(!Number.isFinite(profit))throw Error('DEMO_PROFIT_INVALID');
    recordSettlement.run(epoch(),cents(profit),id);
    return {id,state:'SETTLED',pnlCents:cents(profit)};
   }
   return {id,state:'OPEN',note:'La liquidación no ha sido confirmada.'};
  }finally{socket.close();}
 }
 return {getSummary,requestIntent,cancel,approve,reconcile,
  canUpdate:()=>active.get().n===0};
}
