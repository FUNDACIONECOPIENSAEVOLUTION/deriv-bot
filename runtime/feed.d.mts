export const PUBLIC_ENDPOINT: 'wss://api.derivws.com/trading/v1/options/ws/public';
export function encodePublicRequest(message: Record<string, unknown>): string;
export interface FeedSocket extends EventTarget {
  readonly readyState: number;
  send(message: string): void;
  close(): void;
}
export interface MarketStatus { state: string; code?: string; at: number; }
export class PublicFeed {
  constructor(options: {
    symbol: string;
    onHistory: (prices: number[]) => void;
    onTick: (tick: {symbol: string; quote: number; epoch: number}) => void;
    onStatus?: (status: MarketStatus) => void;
    socketFactory?: (url: string) => FeedSocket;
    now?: () => number;
  });
  start(): void;
  stop(): void;
}
