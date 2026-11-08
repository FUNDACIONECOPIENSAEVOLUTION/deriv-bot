/** Broker DEMO option indices checked via public CALL/PUT proposals, 5 ticks.
 * No symbol grants permission to use REAL endpoints or other trading products. */
export const DEMO_SUPPORTED_SYMBOLS=Object.freeze(['R_100','R_75','R_10','1HZ100V'] as const);
export type DemoSymbol=typeof DEMO_SUPPORTED_SYMBOLS[number];
export function isDemoSymbol(x:unknown):x is DemoSymbol{
 return typeof x==='string'&&DEMO_SUPPORTED_SYMBOLS.some(v=>v===x);
}
export function demoSymbolLabel(s:DemoSymbol):string{
 return {R_100:'Volatility 100',R_75:'Volatility 75',
  R_10:'Volatility 10','1HZ100V':'Volatility 100 (1s)'}[s];
}
