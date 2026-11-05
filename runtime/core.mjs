/** Motor PAPER: importes enteros en centavos. No contiene API de cuenta u órdenes. */
export const SYMBOLS = new Set(['R_100', 'R_75', 'R_10', '1HZ100V', '1HZ10V']);
const dateFormat = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'});
export function dayAt(epoch) {
  const p = Object.fromEntries(dateFormat.formatToParts(new Date(epoch * 1000)).map(x=>[x.type,x.value]));
  return p.year+'-'+p.month+'-'+p.day;
}
function cents(value, name) {
  const raw=String(value);
  if(!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw Error(name+': usa USD con máximo dos decimales');
  const amount=Math.round(Number(raw)*100);
  if(!Number.isSafeInteger(amount)||amount>100000000) throw Error(name+': importe fuera de rango');
  return amount;
}
function integer(value,min,max,name) {
  const n=Number(value);
  if(!Number.isInteger(n)||n<min||n>max)throw Error(name+': fuera de rango');
  return n;
}
export function readConfig(env={}) {
  if((env.TRADING_MODE||'PAPER')!=='PAPER')throw Error('Este servicio admite únicamente PAPER');
  const symbol=env.SYMBOL||'R_100';
  if(!SYMBOLS.has(symbol))throw Error('Símbolo no permitido');
  if(env.PAPER_ENABLED!==undefined&&!['true','false'].includes(env.PAPER_ENABLED))throw Error('PAPER_ENABLED debe ser true o false');
  const config={
    version:1, mode:'PAPER', strategy:'sma-rsi-v1', symbol,
    enabled:env.PAPER_ENABLED==='true',
    initialCents:cents(env.INITIAL_USD||'10','INITIAL_USD'),
    stakeCents:cents(env.STAKE_USD||'0.10','STAKE_USD'),
    dailyLossCents:cents(env.DAILY_LOSS_USD||'0.30','DAILY_LOSS_USD'),
    costCents:cents(env.PAPER_COST_USD||'0','PAPER_COST_USD'),
    payoutPct:integer(env.PAYOUT_HYPOTHESIS_PCT||80,1,200,'PAYOUT_HYPOTHESIS_PCT'),
    horizon:integer(env.HORIZON_TICKS||20,2,80,'HORIZON_TICKS'),
    cooldown:integer(env.COOLDOWN_TICKS||35,1,1000,'COOLDOWN_TICKS'),
    maxDailyTrades:integer(env.MAX_DAILY_TRADES||12,1,1000,'MAX_DAILY_TRADES'),
  };
  if(!config.initialCents||!config.stakeCents||!config.dailyLossCents)throw Error('Capital, importe y límite deben ser positivos');
  if(config.stakeCents+config.costCents>config.initialCents)throw Error('Capital insuficiente para el importe y costo');
  if(config.stakeCents+config.costCents>config.dailyLossCents)throw Error('El riesgo de una simulación supera el límite diario');
  return Object.freeze(config);
}
export function initialState(config,epoch) {
  return {version:1,balanceCents:config.initialCents,acceptedTicks:0,prices:[],position:null,
    daily:{date:dayAt(epoch),lossCents:0,opened:0},completed:0,wins:0,voided:0,
    lastOpenTick:-100000,lastEpoch:null,lastQuote:null};
}
export function signal(prices) {
  if(prices.length<30)return 0;
  const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
  const fast=mean(prices.slice(-8)),slow=mean(prices.slice(-21));
  const diff=(fast/slow-1)*100;
  let up=0,down=0;
  const tail=prices.slice(-15);
  for(let i=1;i<tail.length;i++){const d=tail[i]-tail[i-1];up+=Math.max(0,d);down+=Math.max(0,-d);}
  const rsi=up===0&&down===0?50:down===0?100:100-100/(1+up/down);
  const recent=prices.slice(-30),returns=recent.slice(1).map((x,i)=>(x/recent[i]-1)*100);
  const avg=mean(returns),vol=Math.sqrt(mean(returns.map(x=>(x-avg)**2)));
  const trend=diff>.002?1:diff<-.002?-1:0;
  const momentum=rsi>=54&&rsi<=75?1:rsi<=46&&rsi>=25?-1:0;
  return vol<=.45&&trend&&trend===momentum?trend:0;
}
export function entryBlock(state,config,epoch) {
  if(!config.enabled)return 'COLLECTION_ONLY';
  if(state.position)return 'POSITION_OPEN';
  if(state.prices.length<30)return 'WARMUP';
  const daily=state.daily.date===dayAt(epoch)?state.daily:{lossCents:0,opened:0};
  const worst=config.stakeCents+config.costCents;
  if(worst>state.balanceCents)return 'INSUFFICIENT_VIRTUAL_BALANCE';
  if(daily.lossCents+worst>config.dailyLossCents)return 'DAILY_LOSS_BUDGET';
  if(daily.opened>=config.maxDailyTrades)return 'DAILY_TRADE_LIMIT';
  if(state.acceptedTicks-state.lastOpenTick<config.cooldown)return 'COOLDOWN';
  return '';
}
export function seedHistory(state,prices) {
  if(!Array.isArray(prices)||prices.length<30||prices.some(x=>!Number.isFinite(x)||x<=0))throw Error('Historial inválido');
  const next=structuredClone(state);next.prices=prices.slice(-300);return next;
}
export function onTick(state,config,tick,{nowEpoch=Math.floor(Date.now()/1000)}={}) {
  if(tick.symbol!==config.symbol||!Number.isFinite(tick.quote)||tick.quote<=0||
     !Number.isSafeInteger(tick.epoch)||Math.abs(nowEpoch-tick.epoch)>30||
     (state.lastEpoch!==null&&tick.epoch<state.lastEpoch))throw Error('Tick inválido, obsoleto o fuera de orden');
  const next=structuredClone(state),events=[];
  if(next.daily.date!==dayAt(tick.epoch))next.daily={date:dayAt(tick.epoch),lossCents:0,opened:0};
  next.acceptedTicks++;next.lastEpoch=tick.epoch;next.lastQuote=tick.quote;
  next.prices.push(tick.quote);next.prices=next.prices.slice(-300);
  let closed=false;
  if(next.position) {
    const p=next.position;p.ticksHeld++;
    if(p.ticksHeld>=config.horizon) {
      // Empates se consideran pérdidas en este experimento, no liquidaciones Deriv.
      const won=(tick.quote-p.entryQuote)*p.direction>0;
      const pnlCents=(won?Math.round(p.stakeCents*p.payoutPct/100):-p.stakeCents)-p.costCents;
      const trade={...p,status:'CLOSED',exitEpoch:tick.epoch,exitQuote:tick.quote,won,pnlCents};
      next.balanceCents+=pnlCents;next.daily.lossCents+=Math.max(0,-pnlCents);
      next.completed++;next.wins+=Number(won);next.position=null;closed=true;
      events.push({type:'paper_closed',epoch:tick.epoch,trade});
    }
  }
  if(!closed&&!entryBlock(next,config,tick.epoch)) {
    const direction=signal(next.prices);
    if(direction) {
      const p={id:config.symbol+'-'+tick.epoch+'-'+next.acceptedTicks,symbol:config.symbol,
        direction,entryEpoch:tick.epoch,entryQuote:tick.quote,ticksHeld:0,
        stakeCents:config.stakeCents,payoutPct:config.payoutPct,costCents:config.costCents};
      next.position=p;next.daily.opened++;next.lastOpenTick=next.acceptedTicks;
      events.push({type:'paper_opened',epoch:tick.epoch,trade:{...p,status:'OPEN'}});
    }
  }
  return {state:next,events};
}
export function invalidatePosition(state,reason,epoch) {
  const next=structuredClone(state),events=[];
  if(next.position) {
    events.push({type:'paper_voided',epoch,trade:{...next.position,status:'VOID',reason,pnlCents:0,exitEpoch:epoch,exitQuote:null}});
    next.position=null;next.voided++;
  }
  // No se inventa el movimiento durante un corte ni se reutiliza el historial viejo.
  next.prices=[];next.lastEpoch=null;next.lastQuote=null;
  return {state:next,events};
}
