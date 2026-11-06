export type Candle={time:number;open:number;high:number;low:number;close:number;partial:boolean};
export const CANDLE_LIMIT:number;
export const PROVIDERS:ReadonlyArray<{id:string;name:string;symbol:string;capability:string;url:string}>;
export function validateCandles(rows:unknown,now?:number):Candle[];
export function addCandleTick(candles:Candle[],tick:{epoch:number;quote:number}):Candle[];
export function mergeCandleHistory(current:Candle[],history:Candle[]):Candle[];
export function equityPoints(trades:Array<Record<string,any>>,balanceCents:number):Array<{time:number;value:number}>;
export function publicMarketSnapshot(provider:string,options?:{fetcher?:typeof fetch;now?:number}):Promise<{
  provider:string;symbol:string;capability:string;intervalSeconds:number;candles:Candle[];
  fetchedAt:number;latestCandleTime:number;state:string;source:string;
}>;
