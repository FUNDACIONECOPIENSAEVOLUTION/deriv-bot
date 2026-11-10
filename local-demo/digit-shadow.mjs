// Estudio PRECUENCIAL de contratos de digitos en ticks publicos Deriv.
// Nunca cotiza ni envia BUY. No se infiere payout ni rentabilidad real.
// El pip_size recibido del broker determina el ultimo digito mostrado.
const uniform={DIGITDIFF:.9,DIGITPARITY:.5,DIGITOVER2:.7,DIGITUNDER7:.7};
const options=Object.keys(uniform);
const round=(n,places=5)=>Number.isFinite(n)?Number(n.toFixed(places)):null;
export function lastDigitFromTick(quote,pipSize){
 const value=typeof quote==='number'?quote:Number(quote);
 if(!Number.isFinite(value)||value<=0||!Number.isInteger(pipSize)||pipSize<0||pipSize>10)
  return null;
 const displayed=value.toFixed(pipSize);
 const char=displayed.replace('.','').at(-1);
 return char&&/^[0-9]$/.test(char)?Number(char):null;
}
function wilson(wins,n,z=1.96){
 if(!n)return {lower:null,upper:null};
 const p=wins/n,d=1+z*z/n,s=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
 const c=(p+z*z/(2*n))/d;
 return {lower:round(Math.max(0,c-s)),upper:round(Math.min(1,c+s))};
}
export function breakEvenFromQuote(ask,payout){
 if(!Number.isFinite(ask)||!Number.isFinite(payout)||ask<=0||payout<=ask)
  return null;
 return round(ask/payout,7);
}
export function predictDigitCandidates(digits){
 if(!Array.isArray(digits)||digits.length<30||
  digits.some(d=>!Number.isInteger(d)||d<0||d>9))return null;
 const count=Array(10).fill(0);
 for(const d of digits)count[d]++;
 const least=count.indexOf(Math.min(...count));
 const evens=count[0]+count[2]+count[4]+count[6]+count[8];
 const odd=digits.length-evens;
 // Paridad mayoritaria precompra: regla exploratoria SIN ventaja probada.
 return {DIGITDIFF:{barrier:least},DIGITPARITY:{isEven:evens>=odd},
  DIGITOVER2:{barrier:2},
  DIGITUNDER7:{barrier:7}};
}
export function createDigitShadowObserver({windowSize=50,maxSymbols=20}={}){
 if(!Number.isInteger(windowSize)||windowSize<30||windowSize>500||
  !Number.isInteger(maxSymbols)||maxSymbols<1||maxSymbols>100)
  throw Error('DIGIT_SHADOW_CONFIG_INVALID');
 const states=new Map();
 const fresh=()=>({history:[],pipSize:null,lastSeq:0,lastEpoch:0,pending:null,
  seen:0,invalid:0,interrupts:0,
  outcome:Object.fromEntries(options.map(x=>[x,{n:0,wins:0}])),
  frequencies:Array(10).fill(0)});
 let interrupted=0;
 function interrupt(){
  for(const state of states.values()){
   state.history.length=0;state.pending=null;state.lastSeq=0;state.lastEpoch=0;
   state.interrupts++;
  }
  interrupted++;
 }
 function onTick({symbol,quote,pipSize,epoch,seq}={}){
  if(typeof symbol!=='string'||!(/^[A-Za-z0-9_]{2,30}$/).test(symbol)||
   !Number.isSafeInteger(seq)||seq<=0||!Number.isSafeInteger(epoch)||epoch<=0)
   return false;
  if(!states.has(symbol)){
   if(states.size>=maxSymbols)return false;
   states.set(symbol,fresh());
  }
  const state=states.get(symbol);
  const digit=lastDigitFromTick(quote,pipSize);
  if(digit===null){state.invalid++;state.pending=null;state.history.length=0;
   state.lastSeq=0;state.lastEpoch=0;return false;}
  if(state.lastSeq&&
   (seq!==state.lastSeq+1||epoch<state.lastEpoch||state.pipSize!==pipSize)){
   state.pending=null;state.history.length=0;state.interrupts++;
  }
  if(state.pending){
   const p=state.pending;
   const won={DIGITDIFF:digit!==p.DIGITDIFF.barrier,
    DIGITPARITY:(digit%2===0)===p.DIGITPARITY.isEven,
    DIGITOVER2:digit>2,DIGITUNDER7:digit<7};
   for(const id of options){
    const row=state.outcome[id];row.n++;row.wins+=Number(won[id]);
   }
  }
  state.seen++;
  state.frequencies[digit]++;
  state.pipSize=pipSize;state.lastSeq=seq;state.lastEpoch=epoch;
  state.history.push(digit);
  if(state.history.length>windowSize)state.history.shift();
  state.pending=predictDigitCandidates(state.history);
  return true;
 }
 function status(){
  let total=0;
  const symbols=[...states].map(([symbol,s])=>{
   total+=s.seen;
   return {symbol,pipSize:s.pipSize,ticksObserved:s.seen,
    windowCount:s.history.length,pendingNextTick:!!s.pending,
    interruptions:s.interrupts,invalidTicks:s.invalid,
    recentDigitFrequencies:s.history.reduce((a,d)=>(a[d]++,a),Array(10).fill(0)),
    evaluated:Object.fromEntries(options.map(id=>{
     const {n,wins}=s.outcome[id],interval=wilson(wins,n);
     return [id,{n,wins,losses:n-wins,hitRate:round(n?wins/n:null),
      referenceProbability:uniform[id],ci95:interval}];
    }))};
  });
  return {mode:'DIGIT_LAST_TICK_ONE_STEP_SHADOW',readOnly:true,
   brokerOrders:0,realEnabled:false,affectsBuy:false,
   payoutAvailable:false,netProfitAvailable:false,
   instrumentAvailabilityConfirmed:false,
   symbolsObserved:states.size,ticksObserved:total,interruptions:interrupted,
   candidates:['DIGITDIFF','DIGITPARITY(EVEN/ODD)','DIGITOVER2','DIGITUNDER7'],
   symbols,method:'Predecir con hasta 50 digitos anteriores; puntuar en el SIGUIENTE tick publico antes de incorporarlo al historial. Los resultados no son ejecuciones ni cuotas verificadas.',
   warnings:['No usar win rate de digitos para inferir rentabilidad sin propuesta Deriv real.',
    'No operar DIGITDIFF por acierto ~90%: su payout puede anular la ventaja.',
    'Sin pip_size oficial no se calcula el digito; no reconstruye historia numerica.',
    'Cambios de conexion, gaps y reinicios pueden sesgar las ventanas; no usar como autorizacion de compra.']};
 }
 return {onTick,interrupt,status};
}
