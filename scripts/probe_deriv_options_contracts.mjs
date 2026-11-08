#!/usr/bin/env node
/** Public Deriv WebSocket compatibility diagnostics. No credentials or buy orders. */
const endpoint='wss://api.derivws.com/trading/v1/options/ws/public';
const requests=[
  {active_symbols:'brief',req_id:71},
  {contracts_for:'R_100',req_id:72},
  {contracts_for:'1HZ100V',req_id:73},
  {proposal:1,amount:1,basis:'stake',contract_type:'CALL',currency:'USD',duration:20,duration_unit:'t',underlying_symbol:'R_100',req_id:74},
  {proposal:1,amount:0.10,basis:'stake',contract_type:'CALL',currency:'USD',duration:20,duration_unit:'t',underlying_symbol:'R_100',req_id:75},
  {proposal:1,amount:10,basis:'stake',contract_type:'CALL',currency:'USD',duration:20,duration_unit:'t',underlying_symbol:'R_100',req_id:76},
  {proposal:1,amount:1,basis:'stake',contract_type:'CALL',currency:'USD',duration:20,duration_unit:'t',underlying_symbol:'1HZ100V',req_id:77},
  {proposal:1,amount:10,basis:'stake',contract_type:'CALL',currency:'USD',duration:20,duration_unit:'t',underlying_symbol:'1HZ100V',req_id:78},
  {proposal:1,amount:1,basis:'stake',contract_type:'CALL',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_100',req_id:79},
  {proposal:1,amount:1,basis:'stake',contract_type:'PUT',currency:'USD',duration:20,duration_unit:'t',underlying_symbol:'R_100',req_id:80},
  {proposal:1,amount:0.35,basis:'stake',contract_type:'CALL',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_100',req_id:81},
  {proposal:1,amount:0.50,basis:'stake',contract_type:'CALL',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_100',req_id:82},
  {proposal:1,amount:0.75,basis:'stake',contract_type:'CALL',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_100',req_id:83},
  {proposal:1,amount:1,basis:'stake',contract_type:'PUT',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_100',req_id:84},
  {proposal:1,amount:0.35,basis:'stake',contract_type:'PUT',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_100',req_id:85},
  {proposal:1,amount:0.50,basis:'stake',contract_type:'PUT',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_100',req_id:86},
  {proposal:1,amount:0.75,basis:'stake',contract_type:'PUT',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_100',req_id:87},
  {proposal:1,amount:1,basis:'stake',contract_type:'CALL',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_100',req_id:88},
  {proposal:1,amount:0.90,basis:'stake',contract_type:'CALL',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_100',req_id:89},
  {proposal:1,amount:0.90,basis:'stake',contract_type:'PUT',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_100',req_id:90},
  {proposal:1,amount:0.10,basis:'stake',contract_type:'CALL',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_100',req_id:91},
  {proposal:1,amount:0.10,basis:'stake',contract_type:'PUT',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_100',req_id:92},
  {proposal:1,amount:0.25,basis:'stake',contract_type:'CALL',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_100',req_id:93},
  {proposal:1,amount:0.35,basis:'stake',contract_type:'CALL',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_75',req_id:94},
  {proposal:1,amount:0.35,basis:'stake',contract_type:'PUT',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_75',req_id:95},
  {proposal:1,amount:0.35,basis:'stake',contract_type:'CALL',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_10',req_id:96},
  {proposal:1,amount:0.35,basis:'stake',contract_type:'PUT',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'R_10',req_id:97},
  {proposal:1,amount:0.35,basis:'stake',contract_type:'CALL',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'1HZ100V',req_id:98},
  {proposal:1,amount:0.35,basis:'stake',contract_type:'PUT',currency:'USD',duration:5,duration_unit:'t',underlying_symbol:'1HZ100V',req_id:99}
];
const safe=x=>typeof x==='string'&&/^[A-Za-z0-9_]{1,64}$/.test(x)?x:'UNSPECIFIED';
const expected=new Set(requests.map(x=>x.req_id));
const report={endpoint:'public',readOnly:true,results:[]};
const ws=new WebSocket(endpoint);
const result=await new Promise(resolve=>{
 let done=false;
 const finish=reason=>{if(done)return;done=true;clearTimeout(timeout);report.status=reason;try{ws.close();}catch{}resolve(report);};
 const timeout=setTimeout(()=>finish('TIMEOUT'),13000);
 ws.addEventListener('open',()=>{try{for(const req of requests)ws.send(JSON.stringify(req));}catch{finish('SEND_FAILED');}});
 ws.addEventListener('message',event=>{
  try{
   if(typeof event.data!=='string'||event.data.length>250000)return;
   const obj=JSON.parse(event.data);
   if(!obj||!expected.has(obj.req_id))return;
   expected.delete(obj.req_id);
   const err=obj.error??(Array.isArray(obj.errors)?obj.errors[0]:null);
   const code=err&&typeof err==='object'?safe(err.code):null;
   const row={reqId:obj.req_id,code,msgType:obj.msg_type||null};
   if(obj.req_id===71){
    const rows=Array.isArray(obj.active_symbols)?obj.active_symbols:[];
    row.symbols=['R_100','1HZ100V'].map(symbol=>({symbol,present:rows.some(x=>x?.symbol===symbol)}));
    row.symbolCount=rows.length;
   }else if(obj.req_id===72||obj.req_id===73){
    const data=obj.contracts_for;
    const list=Array.isArray(data?.available)?data.available:Array.isArray(data?.contracts)?data.contracts:null;
    row.symbol=obj.req_id===72?'R_100':'1HZ100V';
    row.availableCount=list?.length??null;
    row.contractTypes=list===null?null:[...new Set(list.map(x=>x?.contract_type).filter(x=>typeof x==='string'))].slice(0,40);
   }else{
    const source=requests.find(x=>x.req_id===obj.req_id);
    row.stake=source?.amount??null;
    row.symbol=source?.underlying_symbol??null;
    row.durationTicks=source?.duration??null;
    row.contractType=source?.contract_type??null;
    row.proposalAccepted=!!obj.proposal&&!code;
    row.priceAvailable=obj.proposal?.ask_price!==undefined;
    if(obj.proposal&&!code){
      const p=obj.proposal;
      row.proposalIdLength=typeof p.id==='string'?p.id.length:null;
      row.proposalIdType=typeof p.id;
      row.askPrice=typeof p.ask_price==='string'||typeof p.ask_price==='number'?p.ask_price:null;
      row.payout=typeof p.payout==='string'||typeof p.payout==='number'?p.payout:null;
      row.hasPurchaseTime=Object.hasOwn(p,'purchase_time');
    }
    // Public endpoint only: safe bounded diagnostic text; no credentials exist here.
    row.brokerExplanation=typeof err?.message==='string'
      ?err.message.replace(/[^a-zA-Z0-9 .,;:()_-]/g,' ').slice(0,200):null;
   }
   report.results.push(row);
   if(!expected.size)finish('COMPLETE');
  }catch{finish('RESPONSE_INVALID');}
 });
 ws.addEventListener('error',()=>finish('NETWORK_ERROR'));
 ws.addEventListener('close',()=>finish('CLOSED_BEFORE_ALL_RESPONSES'));
});
console.log('PUBLIC_DERIV_DIAGNOSTIC '+JSON.stringify(result));
