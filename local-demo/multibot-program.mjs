// Coordinador 10x10 por modalidad. Un clic local autoriza SOLO motor Options DEMO A.
// B obtiene 100 observaciones prospectivas de UN simbolo y NO compra contratos.
// C y D no se simulan: requieren contratos/cuenta MT5 y controles de margen.
// No opera REAL, no comparte credenciales, no reserva cuatro saldos ficticios.
const ROUNDS=10,PER_ROUND=10,MAX=ROUNDS*PER_ROUND;
const PREFER=['1HZ10V','1HZ25V','1HZ50V','R_10','R_25'];
const isN=n=>Number.isSafeInteger(n)&&n>=0;
const bounded=n=>Math.min(MAX,Math.max(0,n));
export function createMultibotDemoProgram({
 program,digitShadow,isOptionsConnected=()=>false,isMarketConnected=()=>false,
 audit=()=>{}
}={}){
 if(typeof program?.start!=='function'||typeof program?.stop!=='function'||
  typeof program?.status!=='function'||typeof digitShadow?.status!=='function')
  throw Error('MULTIBOT_DEPENDENCIES_REQUIRED');
 let current=null;
 function symbolRows(){
  const report=digitShadow.status();
  return Array.isArray(report.symbols)?report.symbols:[];
 }
 function count(row){
  const x=row?.evaluated?.DIGITDIFF?.n;
  return isN(x)?x:0;
 }
 function digitProgress(){
  if(!current)return {status:'NOT_STARTED',symbol:null,observed:0,
   roundsCompleted:0,roundCurrent:0,withinRound:0};
  if(current.stopRequested)return {...current.bStatus,status:'STOPPED'};
  const rows=symbolRows();
  if(!current.bSymbol){
   const available=rows.filter(r=>isN(r?.pipSize)&&r.pipSize<=10&&
    isN(r?.evaluated?.DIGITDIFF?.n)&&r.evaluated.DIGITDIFF.n>0);
   available.sort((a,b)=>{
    const ia=PREFER.indexOf(a.symbol),ib=PREFER.indexOf(b.symbol);
    return (ia===-1?999:ia)-(ib===-1?999)||a.symbol.localeCompare(b.symbol);
   });
   if(available.length){
    current.bSymbol=available[0].symbol;
    current.bBaseline=count(available[0]);
   }
  }
  if(!current.bSymbol){
   current.bStatus={status:'WAITING_VALID_PUBLIC_DIGITS',symbol:null,observed:0,
    roundsCompleted:0,roundCurrent:0,withinRound:0};
   return current.bStatus;
  }
  const row=rows.find(r=>r.symbol===current.bSymbol);
  const samples=bounded((row?count(row):current.bBaseline)-current.bBaseline);
  const roundsCompleted=Math.floor(samples/PER_ROUND);
  current.bStatus={status:samples>=MAX?'OBSERVATION_COMPLETE':'OBSERVING_NO_BUY',
   symbol:current.bSymbol,observed:samples,roundsCompleted,
   roundCurrent:samples>=MAX?ROUNDS:roundsCompleted+1,
   withinRound:samples%PER_ROUND};
  return current.bStatus;
 }
 function status(){
  const b=digitProgress();
  const p=current?program.status().programs?.find(x=>x.id===current.aProgramId):null;
  const aState=p?.state|| (current?'UNKNOWN_PROGRAM_STATE':'NOT_STARTED');
  const aRounds=isN(p?.roundsCompleted)?p.roundsCompleted:0;
  const aSettled=isN(p?.settled)?p.settled:0;
  const aNet=Number.isSafeInteger(p?.netCents)?p.netCents:null;
  return {mode:'UNIFIED_MULTIBOT_DEMO_10X10',localOnly:true,realEnabled:false,
   requiresLocalOwnerConsent:true,coordinatorStarted:!!current,
   coordinatorId:current?.id||null,stopRequested:!!current?.stopRequested,
   fullFourBotExecution:false,parallelFinancialBuyEnabled:false,
   budgetsPlannedUsd:400,perBotBudgetPlannedUsd:100,
   budgetsFunded:false,budgetsEnforced:false,
   roundsPerBot:ROUNDS,maxPerRound:PER_ROUND,maxPerBot:MAX,
   policy:{profitExit:'TRAILING_GREEN',profitTargetCents:50,
    globalProtection:true,downshiftAfterTwoLosses:true,
    originalStakeCents:100,reducedStakeCents:50,
    continueAfterNegativeRound:false,
    note:'Verde progresivo avanza entre tandas; rojo no activa martingala.'},
   bots:[
    {id:'A',name:'Rise/Fall',type:'OFFICIAL_OPTIONS_DEMO',
     state:aState,tradeEnabledWhenAuthorized:true,
     roundsCompleted:aRounds,settled:aSettled,
     netCents:aNet,programId:current?.aProgramId||null,
     note:'Solo el motor DEMO A compra tras autorizacion local; estado y PnL oficiales del programa.'},
    {id:'B',name:'Digitos',type:'PUBLIC_DIGIT_OBSERVATION',
     state:b.status,symbol:b.symbol,roundsCompleted:b.roundsCompleted,
     roundCurrent:b.roundCurrent,observed:b.observed,
     withinRound:b.withinRound,netCents:null,tradeEnabledWhenAuthorized:false,
     note:'10x10 OBSERVACIONES de un tick publico, no son contratos ni rentabilidad; sin regla verde monetaria.'},
    {id:'C',name:'Multipliers',type:'CONTRACT_DISCOVERY_REQUIRED',
     state:'BLOCKED_NO_VERIFIED_EXECUTOR',roundsCompleted:0,
     settled:0,netCents:null,tradeEnabledWhenAuthorized:false,
     note:'No habilitar sin contratos y cotizaciones Deriv verificadas, riesgo y gestion de cierre.'},
    {id:'D',name:'CFD Buy/Sell',type:'SEPARATE_MT5_DEMO_REQUIRED',
     state:'BLOCKED_NO_MT5_DEMO',roundsCompleted:0,
     settled:0,netCents:null,tradeEnabledWhenAuthorized:false,
     note:'No existe conector MT5 DEMO autorizado ni gestor de margen. No se ejecutan CFD.'}
   ],
   warning:'Un programa local inicia A DEMO y B observacional; C/D esperan integracion. No se puede prometer 400 compras ni resultados con contratos no soportados.'
  };
 }
 function start({confirmation}={}){
  if(confirmation!=='AUTORIZAR MULTIBOT DEMO 10X10 A Y SOMBRA B')
   throw Error('MULTIBOT_LOCAL_APPROVAL_REQUIRED');
  if(current&&(!current.stopRequested)&&
   (program.status().running||digitProgress().observed<MAX))
   throw Error('MULTIBOT_SESSION_ALREADY_ACTIVE');
  if(program.status().running)throw Error('DEMO_PROGRAM_ALREADY_RUNNING');
  if(!isOptionsConnected())throw Error('DEMO_OPTIONS_ACCOUNT_REQUIRED');
  if(!isMarketConnected())throw Error('DEMO_MARKET_FEED_REQUIRED');
  // El programa existente aplica límites de riesgo DEMO y rechaza órdenes OPEN.
  const result=program.start({
   rounds:10,perRound:10,stakeCents:100,concurrency:1,
   symbol:'AUTO',mode:'RESEARCH_FIVE_ONLY',
   continueAfterNegativeRound:false,profitTargetCents:50,
   exitPolicy:'TRAILING_GREEN',globalProtection:true,
   downshiftAfterTwoLosses:true,
   confirmation:'CONFIRMAR PROGRAMA DEMO 10X10'
  });
  current={id:result.id,aProgramId:result.id,startedAt:Date.now(),
   stopRequested:false,bSymbol:null,bBaseline:0,bStatus:null};
  audit('MULTIBOT_DEMO_10X10_AUTHORIZED',result.id+
   ' A=OPTIONS_DEMO B=PUBLIC_SHADOW C=BLOCKED D=BLOCKED');
  return status();
 }
 function stop(){
  if(!current||current.stopRequested)return {stopped:false,reason:'MULTIBOT_NOT_RUNNING'};
  current.stopRequested=true;
  const running=program.status().running;
  if(running&&program.status().id===current.aProgramId)program.stop();
  audit('MULTIBOT_DEMO_10X10_STOP_REQUESTED',current.id);
  return {stopped:true,reason:'STOP_A_AND_B_NO_RESUME',id:current.id};
 }
 return {start,stop,status};
}
