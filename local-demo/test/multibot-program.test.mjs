import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMultibotDemoProgram} from '../multibot-program.mjs';
function harness({connected=true,market=true}={}){
 let launches=0,stops=0,last=null,running=false;
 const p={
  start:args=>{launches++;last=args;running=true;return {id:'demo-test-001'};},
  stop:()=>{stops++;running=false;return {stopped:true};},
  status:()=>({running,id:running?'demo-test-001':null,
   programs:launches?[{id:'demo-test-001',state:running?'RUNNING':'STOPPED',
    roundsCompleted:2,settled:16,netCents:170}]:[]})
 };
 let digitCount=40;
 const digits={status:()=>({symbols:[{
  symbol:'1HZ10V',pipSize:3,
  evaluated:{DIGITDIFF:{n:digitCount,wins:Math.floor(digitCount*.9)}}}]})};
 const x=createMultibotDemoProgram({program:p,digitShadow:digits,
  isOptionsConnected:()=>connected,isMarketConnected:()=>market});
 return {x,setCount:n=>{digitCount=n;},get:()=>({launches,stops,last})};
}
test('Sin autorizacion local exacta no lanza ningun bot financiero',()=>{
 const {x,get}=harness();
 assert.throws(()=>x.start({confirmation:'CONFIRMAR PROGRAMA DEMO 10X10'}),/MULTIBOT_LOCAL_APPROVAL_REQUIRED/);
 assert.equal(get().launches,0);
 assert.equal(x.status().coordinatorStarted,false);
 assert.equal(x.status().fullFourBotExecution,false);
});
test('Un unico clic activa A 10x10 con proteccion verde; B es sombra sin BUY',()=>{
 const {x,get}=harness();
 const s=x.start({confirmation:'AUTORIZAR MULTIBOT DEMO 10X10 A Y SOMBRA B'});
 assert.equal(get().launches,1);
 assert.equal(get().last.rounds,10);
 assert.equal(get().last.perRound,10);
 assert.equal(get().last.stakeCents,100);
 assert.equal(get().last.mode,'RESEARCH_FIVE_ONLY');
 assert.equal(get().last.exitPolicy,'TRAILING_GREEN');
 assert.equal(get().last.profitTargetCents,50);
 assert.equal(get().last.globalProtection,true);
 assert.equal(get().last.downshiftAfterTwoLosses,true);
 assert.equal(get().last.continueAfterNegativeRound,false);
 assert.equal(s.bots[0].netCents,170);
 assert.equal(s.bots[0].settled,16);
 assert.equal(s.bots[1].symbol,'1HZ10V');
 assert.equal(s.bots[1].observed,0);
 assert.equal(s.bots[1].netCents,null);
 assert.equal(s.bots[2].tradeEnabledWhenAuthorized,false);
 assert.equal(s.bots[3].tradeEnabledWhenAuthorized,false);
 assert.equal(s.budgetsEnforced,false);
 assert.equal(s.realEnabled,false);
});
test('B marca 10 tandas de 10 predicciones prospectivas, sin atribuir PnL',()=>{
 const {x,setCount}=harness();
 x.start({confirmation:'AUTORIZAR MULTIBOT DEMO 10X10 A Y SOMBRA B'});
 setCount(66);
 let b=x.status().bots[1];
 assert.equal(b.observed,26);
 assert.equal(b.roundsCompleted,2);
 assert.equal(b.roundCurrent,3);
 assert.equal(b.withinRound,6);
 setCount(140);b=x.status().bots[1];
 assert.equal(b.observed,100);
 assert.equal(b.roundsCompleted,10);
 assert.equal(b.state,'OBSERVATION_COMPLETE');
 assert.equal(b.netCents,null);
 setCount(190);assert.equal(x.status().bots[1].observed,100);
});
test('No activa 10x10 al faltar cuenta DEMO o datos del mercado',()=>{
 for(const config of [{connected:false},{market:false}]){
  const {x,get}=harness(config);
  assert.throws(()=>x.start({confirmation:'AUTORIZAR MULTIBOT DEMO 10X10 A Y SOMBRA B'}),
   /DEMO_.*_REQUIRED/);
  assert.equal(get().launches,0);
 }
});
test('Duplicacion bloqueada y parada afecta solo el programa iniciado',()=>{
 const {x,get}=harness();
 x.start({confirmation:'AUTORIZAR MULTIBOT DEMO 10X10 A Y SOMBRA B'});
 assert.throws(()=>x.start({confirmation:'AUTORIZAR MULTIBOT DEMO 10X10 A Y SOMBRA B'}),
  /MULTIBOT_SESSION_ALREADY_ACTIVE/);
 const result=x.stop();
 assert.equal(result.stopped,true);
 assert.equal(get().stops,1);
 assert.equal(x.status().bots[1].state,'STOPPED');
 assert.equal(x.stop().stopped,false);
});
