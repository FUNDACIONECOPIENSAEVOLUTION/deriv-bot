import {it,expect,describe} from 'vitest';
import { assessDailyDemoRisk,DEMO_MAX_OPEN,DEMO_STAKE_CENTS,
 DEMO_MIN_SETTLED_FOR_REVIEW,DEMO_DAILY_LOSS_FLOOR_CENTS } from '../src/demo-risk-policy';

const input={openContracts:0,unknownCount:0,exposureCents:0,
 lifetimeNetCents:0,dailyNetCents:0,dailySettled:0,haltedToday:false};

describe('DERIV virtual-dollar rule, not raw win percentage',()=>{
  it('permits 10 open positions at 10 virtual cents (USD 1 max exposure)',()=>{
    expect(DEMO_MAX_OPEN).toBe(10);expect(DEMO_STAKE_CENTS).toBe(100);
    expect(DEMO_DAILY_LOSS_FLOOR_CENTS).toBe(-1000);
    expect(DEMO_MIN_SETTLED_FOR_REVIEW).toBe(10);
    const s=assessDailyDemoRisk({...input,openContracts:9,exposureCents:9000});
    expect(s.allowed).toBe(true);expect(s.worstCaseDailyNetCents).toBe(-1000);
    expect(assessDailyDemoRisk({...input,openContracts:10,exposureCents:1000}).reason).toBe('DEMO_MAX_OPEN');
  });
  it('keeps trading after 6 wins and 4 losses if realized daily net is positive',()=>{
    // Example: 6 x +8c - 4 x 10c = +8c.
    const s=assessDailyDemoRisk({...input,lifetimeNetCents:8,dailyNetCents:8,dailySettled:10});
    expect(s.allowed).toBe(true);expect(s.dailyNetCents).toBe(8);
  });
  it('stops for the Bogotá day after 5 wins/5 losses with negative net despite 50% accuracy',()=>{
    const s=assessDailyDemoRisk({...input,lifetimeNetCents:-10,dailyNetCents:-10,dailySettled:10});
    expect(s.allowed).toBe(false);expect(s.reason).toBe('DEMO_DAY_NOT_PROFITABLE');
    expect(s.reviewTriggered).toBe(true);
  });
  it('keeps running after 20 settlements with small positive net, but stops if daily net reaches zero',()=>{
    expect(assessDailyDemoRisk({...input,dailySettled:20,dailyNetCents:5,lifetimeNetCents:5}).allowed).toBe(true);
    expect(assessDailyDemoRisk({...input,dailySettled:20,dailyNetCents:0}).reason).toBe('DEMO_DAY_NOT_PROFITABLE');
    expect(assessDailyDemoRisk({...input,dailySettled:20,dailyNetCents:15,haltedToday:true}).reason).toBe('DEMO_DAY_HALTED');
  });
  it('reserves possible worst-case losses of open contracts even during a profitable session',()=>{
    expect(assessDailyDemoRisk({...input,dailyNetCents:-100,openContracts:9,exposureCents:9000})
      .reason).toBe('DEMO_DAILY_RISK_FLOOR');
    expect(assessDailyDemoRisk({...input,dailySettled:20,dailyNetCents:80,
      openContracts:9,exposureCents:9000,lifetimeNetCents:8}).allowed).toBe(true);
  });
  it('halts on any uncertain buy and on exhausted research allocation',()=>{
    expect(assessDailyDemoRisk({...input,unknownCount:1,exposureCents:100}).reason).toBe('DEMO_BUY_OUTCOME_UNKNOWN');
    expect(assessDailyDemoRisk({...input,lifetimeNetCents:-995}).reason).toBe('DEMO_RESEARCH_ALLOCATION');
  });
  it('cannot silently exceed loss floor or use malformed accounting',()=>{
    expect(()=>assessDailyDemoRisk({...input,openContracts:11,exposureCents:1100})).toThrow('DEMO_RISK_INVALID');
    expect(()=>assessDailyDemoRisk({...input,openContracts:9,exposureCents:200})).toThrow('DEMO_RISK_INVALID');
    expect(()=>assessDailyDemoRisk({...input,dailyNetCents:NaN})).toThrow('DEMO_RISK_INVALID');
  });
});

it('limits the first experimental cohort to ten $1 virtual contracts',()=>{
  expect(assessDailyDemoRisk({...input,firstBatchBuys:9}).allowed).toBe(true);
  const stopped=assessDailyDemoRisk({...input,firstBatchBuys:10,dailyNetCents:900,dailySettled:10});
  expect(stopped.allowed).toBe(false);
  expect(stopped.reason).toBe('DEMO_FIRST_BATCH_COMPLETE');
});
