// Laboratorio de cuatro estrategias en un solo panel Windows.
// SOLO ESTADO: NO crea cuentas, NO distribuye saldo, NO compra ni eleva limites.
// 100 USD por bot es un PRESUPUESTO PLANIFICADO, no saldo custodiado.
const PROFILES=Object.freeze([
 {id:'A',name:'Rise/Fall',family:'DIGITAL_RISE_FALL',account:'OPTIONS_DEMO',
  role:'CURRENT_DEMO_ENGINE',study:'PREDICTIVE_5_10'},
 {id:'B',name:'Digitos',family:'DIGIT_OPTIONS',account:'OPTIONS_DEMO',
  role:'PUBLIC_TICK_SHADOW',study:'DIGITDIFF_PARITY_OVER_UNDER'},
 {id:'C',name:'Multipliers',family:'MULTIPLIERS',account:'OPTIONS_DEMO',
  role:'FUTURE_RESEARCH',study:'QUOTE_AND_CONTRACT_DISCOVERY_PENDING'},
 {id:'D',name:'CFD Buy/Sell',family:'CFD',account:'SEPARATE_MT5_DEMO',
  role:'FUTURE_RESEARCH',study:'MT5_DEMO_EA_BRIDGE_PENDING'}
]);
export function buildFourBotLabStatus({optionsConnected=false,marketConnected=false,
  riseFallSummary=null,digitReport=null}={}){
 const settled=Number.isSafeInteger(riseFallSummary?.settled)?
  Math.max(0,riseFallSummary.settled):0;
 const wins=Number.isSafeInteger(riseFallSummary?.wins)?
  Math.max(0,riseFallSummary.wins):0;
 const pnl=Number.isFinite(riseFallSummary?.netCents)?riseFallSummary.netCents:null;
 const observed=Number.isSafeInteger(digitReport?.ticksObserved)?
  Math.max(0,digitReport.ticksObserved):0;
 const digitCases=Array.isArray(digitReport?.symbols)?
  digitReport.symbols.reduce((a,s)=>a+(s.evaluated?.DIGITDIFF?.n||0),0):0;
 const bots=PROFILES.map(profile=>{
  const base={...profile,plannedBudgetUsd:100,budgetFunded:false,budgetEnforced:false,
   liveRealTrading:false,autonomousTradingEnabled:false,paperPnlUsd:null,
   benchmarkStartAt:null};
  if(profile.id==='A')return {...base,
   status:optionsConnected&&marketConnected?'DEMO_OWNER_APPROVAL_ONLY':
    optionsConnected?'WAITING_PUBLIC_TICKS':'WAITING_OPTIONS_DEMO_AUTH',
   samples:settled,winRate:settled?Number((wins/settled).toFixed(4)):null,
   historicalDemoPnlUsd:pnl===null?null:Number((pnl/100).toFixed(2)),
   pnlLabel:'ALL_HISTORICAL_OPTIONS_DEMO_TRADES_NOT_A_NEW_100USD_BUDGET',
   note:'Motor existente: solo compras DEMO autorizadas en el panel; el historico no se atribuye a un nuevo experimento de US$100.'};
  if(profile.id==='B')return {...base,
   status:marketConnected&&observed?'PUBLIC_SHADOW_OBSERVING':'WAITING_PUBLIC_DIGIT_TICKS',
   samples:digitCases,priceTicksObserved:observed,
   note:'Predicciones de digitos de un tick en memoria; sin propuestas, ordenes ni P&L contractual.'};
  if(profile.id==='C')return {...base,status:'CONTRACT_DISCOVERY_REQUIRED',
   samples:0,note:'Pendiente verificar contratos y cuotas Multipliers en Deriv antes de habilitar estudios de rentabilidad.'};
  return {...base,status:'SEPARATE_MT5_DEMO_REQUIRED',samples:0,
   note:'CFD Buy/Sell necesita cuenta MT5 DEMO y puente local EA MQL5; no usa el WebSocket de Options.'};
 });
 return {schemaVersion:1,mode:'FOUR_BOT_RESEARCH_PANEL',localComputerOnly:true,
  readOnly:true,realEnabled:false,accountType:'OPTIONS_DEMO_FOR_A_B_C',
  bots,plannedTotalUsd:400,plannedBudgetPerBotUsd:100,
  budgetFunded:false,budgetsEnforced:false,realBotBalancesProvided:false,
  currentExecutionModel:'SINGLE_OPTIONS_DEMO_ENGINE_MANUAL_AUTHORIZATION',
  parallelBuyEnabled:false,parallelObservationActive:marketConnected,
  globalRiskPolicy:'PRESERVE_EXISTING_DEMO_GLOBAL_LIMITS',
  sharedBalanceWarning:'La misma cuenta DEMO de Opciones comparte un saldo: los 100 USD por bot NO estan segregados ni impiden compras hasta implementar un gestor transaccional de riesgo por bot.',
  accountsWarning:'CFD requiere cuenta derivada MT5 DEMO separada, su propia autenticacion y gestion de margen.',
  comparisonWarning:'No comparar rentabilidad de modalidades sin cuotas oficiales, costes, riesgo, P&L realizado y periodo prospectivo identico. N/D significa sin operaciones, NO cero perdida.'};
}
