// Centro de decisiones: SOLO DATOS. No compra, no habilita REAL,
// no confunde ticks de sombra con contratos oficiales ni elige una
// estrategia como rentable sin una muestra cronológica suficiente.
const safePct=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b>0?
 Number((100*a/b).toFixed(2)):null;
const asNum=x=>Number.isFinite(Number(x))?Number(x):null;
function normalizeKey(x){return String(x??'SIN_DATO').trim();}
const statusRank={PRELIMINARY_UNCORRECTED_FOR_MULTIPLE_TESTING:1,
 NO_DEMONSTRATED_EDGE:2,INSUFFICIENT_CHRONOLOGICAL_SAMPLE:3};
export function buildDemoDecisionDesk({profitability,shadow,selection,risk}={}){
 if(profitability?.mode!=='SOLO_LECTURA_DEMO'||
    shadow?.readOnly!==true||selection?.readOnly!==true)
  throw Error('DECISION_DESK_REQUIRES_READ_ONLY_SOURCES');
 const official=profitability.segmentation||{};
 const pairGroups=official.marketHorizonPolicyDirection||[];
 const oldGroups=official.marketHorizon||[];
 const byPair=new Map(pairGroups.map(x=>[x.key,x]));
 const byMarket=new Map(oldGroups.map(x=>[x.key,x]));
 const chosen=selection.subscribedSymbols||[];
 const excluded=selection.excludedAdvertisedSymbols||[];
 const candidates=[];
 for(const market of selection.rows||[]){
  if(!chosen.includes(market.symbol))continue; // Universo del motor actual
  for(const model of market.models||[]){
   if(![5,10].includes(model.durationTicks)||!['CALL','PUT'].includes(model.direction))
    continue;
   const key=[market.symbol,model.durationTicks,model.policy,model.direction].map(normalizeKey).join('|');
   const history=byPair.get(key)||null;
   const broad=byMarket.get([market.symbol,model.durationTicks].join('|'))||null;
   const test=history?.chronological?.holdout;
   const strict=Boolean(model.strictValidated);
   const riskVeto=Boolean(model.riskVeto);
   // Precio ASK/Payout DEBEN solicitarse al broker para esta entrada.
   let reason=!market.fresh?'PUBLIC_TICK_FEED_NOT_FRESH':
    riskVeto?'ADAPTIVE_OR_MARKET_RISK_VETO':
    !strict?'STATISTICAL_EDGE_NOT_VALIDATED':
    !history?'NO_MATCHING_OFFICIAL_SETTLEMENTS':
    history.status!=='PRELIMINARY_UNCORRECTED_FOR_MULTIPLE_TESTING'?
       'HISTORICAL_HOLDOUT_NOT_PROFITABLE_OR_INSUFFICIENT':
    'OFFICIAL_QUOTE_AND_OWNER_REVIEW_REQUIRED';
   const score=(model.validationHitRate??0)*10+
    (test?.roi??-1)*3+(model.strictValidated?10:0)-
    (riskVeto?100:0)-(market.fresh?0:50);
   candidates.push({symbol:market.symbol,durationTicks:model.durationTicks,
    direction:model.direction,policy:model.policy,
    feedFresh:Boolean(market.fresh),riskVeto,riskReason:model.riskReason??null,
    trainTickCases:model.trainingDecisions,validationTickCases:model.validationDecisions,
    tickValidationHitRatePct:safePct(model.validationHitRate||0,1),
    officialContracts:history?.n??0,
    officialWinRatePct:history?safePct(history.wins,history.n):null,
    officialRoiPct:history?safePct(history.roi,1):null,
    officialHoldoutN:test?.n??0,
    officialHoldoutRoiPct:test?safePct(test.roi,1):null,
    matchingMarketHorizonContracts:broad?.n??0,
    matchingMarketHorizonNetCents:broad?.netCents??null,
    evidenceStatus:history?.status||'NO_MATCHING_CONTRACTS',
    brokerQuoteValidated:false,eligibleForImmediateBuy:false,
    requiresOwnerConfirmation:true,reason,rankingScore:Math.round(score*100)/100
   });
  }
 }
 candidates.sort((a,b)=>
  Number(a.riskVeto)-Number(b.riskVeto)||
  Number(b.feedFresh)-Number(a.feedFresh)||
  Number(b.officialHoldoutRoiPct??-1e9)-Number(a.officialHoldoutRoiPct??-1e9)||
  b.officialContracts-a.officialContracts||b.rankingScore-a.rankingScore||
  a.symbol.localeCompare(b.symbol)||a.durationTicks-b.durationTicks);
 const shadowBuckets=new Map();
 for(const x of shadow.results||[]){
  if(!['5','10',5,10].includes(x.horizonTicks))continue;
  if(!Number.isFinite(+x.n)||+x.n<=0||!Number.isFinite(+x.correct))continue;
  const key=x.policy+'|'+x.horizonTicks;
  const row=shadowBuckets.get(key)||{policy:x.policy,durationTicks:+x.horizonTicks,
   observedDirections:0,favorableDirections:0,
   symbols:new Set()};
  row.observedDirections+=+x.n;row.favorableDirections+=+x.correct;row.symbols.add(x.symbol);
  shadowBuckets.set(key,row);
 }
 const observed=[...shadowBuckets.values()].map(x=>({
  policy:x.policy,durationTicks:x.durationTicks,
  observedDirections:x.observedDirections,favorableDirections:x.favorableDirections,
  directionalHitRatePct:safePct(x.favorableDirections,x.observedDirections),
  marketsObserved:x.symbols.size,
  brokerPnlUsd:null,
  evidence:x.observedDirections>=200?'HISTORICAL_SHADOW_ONLY':
   'SHADOW_SAMPLE_TOO_SMALL',
  canAutomaticallyBuy:false
 })).sort((a,b)=>
  b.observedDirections-a.observedDirections||
  b.directionalHitRatePct-a.directionalHitRatePct||
  a.policy.localeCompare(b.policy));
 const total=profitability.total||{};
 const riskStopped=Boolean(risk?.dailyLossStopActive||risk?.accountFloorStopActive);
 return {mode:'DERIV_DEMO_DECISION_DESK_READ_ONLY',readOnly:true,realEnabled:false,
  brokerOrders:0,autoTradeEnabled:false,ownerConfirmationRequired:true,
  quoteChecked:false,allCurrentCandidatesRequireBrokerQuote:true,
  riskStopActive:riskStopped,
  sampleSources:{officialSettled:total.n||0,shadowLabels:shadow.samplesStored||0,
   snapshotCandidates:candidates.length},
  allTimeOfficial:{n:total.n||0,wins:total.wins||0,losses:total.losses||0,
   winRatePct:safePct(total.winRate,1),netUsd:asNum(total.netCents)!==null?
     Number((total.netCents/100).toFixed(2)):null,
   roiPct:safePct(total.roi,1),
   breakEvenWinRatePct:safePct(total.breakEvenWinRate,1)},
  eligibleToBuyNow:0, // No se conoce precio ASK/payout en esta vista
  candidateRanking:candidates,
  shadowPolicyComparison:observed,
  authorizedMarkets:chosen,excludedMarkets:excluded,
  recommendation:'VALIDATE_STATISTICAL_EDGE_AND_BROKER_QUOTE_FIRST',
  explanation:'El ranking es descriptivo, NO una senal BUY. El historico de contratos liquidados y las observaciones de ticks miden cosas distintas. Ninguna cotizacion activa esta incluida. La solicitud MCP solo prepara una intencion pendiente de aprobacion local.',
  warnings:['La rentabilidad pasada no demuestra ventaja futura.',
   'Multiples modelos comparten ticks, no son muestras independientes.',
   'La muestra posterior se escogio mirando resultados previos; evitar fuga de datos.',
   'No hay ordenes automaticas, compra REAL ni retiro.']};
}
