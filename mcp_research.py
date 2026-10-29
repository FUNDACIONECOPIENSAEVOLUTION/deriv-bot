"""Ecopiensa Quant Lab: MCP de investigación exclusivamente de lectura.

Exposición LOCAL por defecto: no publicar /mcp en Internet sin HTTPS + OAuth,
autorización por usuario, limitación de peticiones y monitorización de abuso.

No contiene credenciales Deriv, no conoce cuentas y no dispone de ninguna
herramienta para comprar, vender, transferir o retirar dinero.
"""
from __future__ import annotations

import asyncio
import json
import math
import os
from datetime import datetime, timezone
from typing import Any

from mcp.server.fastmcp import FastMCP
from websockets.asyncio.client import connect

ENDPOINT = "wss://api.derivws.com/trading/v1/options/ws/public"
SYMBOLS = frozenset(("1HZ100V", "R_100", "R_75", "R_10", "1HZ10V"))
MAX_HISTORY = 2000
server = FastMCP(
    "ecopiensa-quant-research",
    host=os.getenv("MCP_HOST", "127.0.0.1"),
    port=int(os.getenv("MCP_PORT", "8788")),
    stateless_http=True,
)


def _validate_history(prices: Any, times: Any, *, now_epoch: int | None = None,
                      max_points: int = MAX_HISTORY) -> tuple[list[float], list[int]]:
    """Rechaza series corruptas u obsoletas antes de analizar datos públicos.

    Los tiempos de Deriv tienen resolución de segundos; se permiten empates
    entre ticks consecutivos, pero no retrocesos temporales.
    """
    if not isinstance(prices, list) or not isinstance(times, list):
        raise ValueError("Historial con formato inesperado")
    if not 100 <= len(prices) <= max_points or len(prices) != len(times):
        raise ValueError("Historial incompleto o longitud de precios/tiempos desigual")
    try:
        if any(isinstance(v, bool) for v in prices):
            raise ValueError("Precio booleano no permitido")
        p = [float(v) for v in prices]
        if any(not math.isfinite(v) or v <= 0 for v in p):
            raise ValueError("Historial con precios inválidos")
        if any(isinstance(v, bool) for v in times):
            raise ValueError("Tiempo booleano no permitido")
        t = [int(v) for v in times]
        if any(float(v) != epoch for v, epoch in zip(times, t)):
            raise ValueError("Historial con épocas no enteras")
    except (TypeError, OverflowError, ValueError) as exc:
        raise ValueError("Historial con precios o marcas de tiempo inválidos") from exc
    if any(t[i] < t[i - 1] for i in range(1, len(t))):
        raise ValueError("Historial con marcas de tiempo fuera de orden")
    now = int(datetime.now(tz=timezone.utc).timestamp()) if now_epoch is None else now_epoch
    if t[0] < 946684800 or t[-1] > now + 120:
        raise ValueError("Historial con marcas de tiempo imposibles")
    if now - t[-1] > 900:
        raise ValueError("Historial público obsoleto: última cotización hace más de 15 minutos")
    return p, t


async def _market_data(symbol: str, count: int) -> tuple[list[float], list[int]]:
    if symbol not in SYMBOLS:
        raise ValueError("Símbolo no permitido. Opciones: " + ", ".join(sorted(SYMBOLS)))
    if not isinstance(count, int) or isinstance(count, bool) or not 100 <= count <= MAX_HISTORY:
        raise ValueError("Cantidad de ticks fuera del rango 100-2000")
    async with asyncio.timeout(20):
        async with connect(ENDPOINT, max_size=1_500_000, ping_interval=15) as ws:
            await ws.send(json.dumps({"ticks_history": symbol, "count": count, "end": "latest",
                                      "style": "ticks", "req_id": 105}))
            for _ in range(6):
                raw = await asyncio.wait_for(ws.recv(), 12)
                response = json.loads(raw)
                if response.get("error"):
                    raise ValueError("La API Deriv rechazó el historial")
                if response.get("msg_type") == "history":
                    obj = response.get("history", {})
                    prices = obj.get("prices", [])
                    times = obj.get("times", [])
                    return _validate_history(prices, times, max_points=count)
            raise ValueError("No hubo respuesta de historial")
            

def _ema(p: list[float], idx: int, period: int) -> float:
    if idx + 1 < period:
        return math.nan
    smoothing = 2 / (period + 1)
    value = sum(p[:period]) / period
    for i in range(period, idx + 1):
        value = p[i] * smoothing + value * (1 - smoothing)
    return value


def _signal(p: list[float], idx: int, rule: str) -> int:
    if idx < 25:
        return 0
    mov = p[idx] - p[idx - 5]
    momentum = 1 if mov > 0 else -1 if mov < 0 else 0
    if rule == "momentum":
        return momentum
    if rule == "reversion":
        return -momentum
    if rule == "ema":
        e8, e21 = _ema(p, idx, 8), _ema(p, idx, 21)
        return 1 if e8 > e21 else -1 if e8 < e21 else 0
    if rule == "ruptura":
        past = p[idx - 20:idx]
        return 1 if p[idx] > max(past) else -1 if p[idx] < min(past) else 0
    if rule == "consenso":
        ema = _signal(p, idx, "ema")
        breakout = _signal(p, idx, "ruptura")
        return ema if ema and ema == momentum else momentum if breakout and breakout == momentum else 0
    return 0


def _sample(p: list[float], a: int, b: int, rule: str,
            horizon: int, payout: float, stake: float, initial: float) -> dict[str, Any]:
    balance, peak, drawdown, wins, trades = initial, initial, 0.0, 0, 0
    for i in range(max(25, a), b - horizon, horizon):
        direction = _signal(p, i, rule)
        if not direction:
            continue
        if balance < stake:
            break
        won = (p[i + horizon] - p[i]) * direction > 0
        pnl = stake * payout if won else -stake
        balance += pnl
        peak = max(peak, balance)
        drawdown = max(drawdown, peak - balance)
        trades += 1
        wins += int(won)
    return {
        "trades": trades, "wins": wins,
        "win_rate": round(wins / trades, 4) if trades else None,
        "hypothetical_pnl_usd": round(balance - initial, 2),
        "hypothetical_max_drawdown_usd": round(drawdown, 2),
        "ended_due_to_insufficient_virtual_balance": balance < stake,
    }


@server.tool()
def get_project_status() -> dict[str, Any]:
    """Describe de qué forma puede usarse el bot de Ecopiensa y sus límites.
    
    Solo lectura. No muestra cuentas privadas ni abre órdenes.
    """
    return {
        "project": "Ecopiensa Quant Lab / Deriv IA Trader",
        "version": "1.1 (MCP de investigación)",
        "web": "https://fundacionecopiensaevolution.github.io/deriv-bot/",
        "backtest": "https://fundacionecopiensaevolution.github.io/deriv-bot/laboratorio.html",
        "connection": "Datos públicos Deriv Options WebSocket",
        "permissions": ["public_market_data_read", "paper_research_analysis"],
        "real_trading_enabled": False,
        "demo_trading_enabled": False,
        "guaranteed_profit": False,
        "note": "Conectar este servidor a una cuenta ChatGPT elegible requiere despliegue seguro, revisión y autorización. La existencia del archivo Python no crea una conexión.",
    }


@server.tool()
async def get_market_snapshot(symbol: str = "R_100", count: int = 200) -> dict[str, Any]:
    """Leer ticks públicos recientes de Deriv; calcular variación y última cotización.
    
    No requiere claves, no consulta saldos ni ejecuta órdenes.
    """
    p, times = await _market_data(symbol, count)
    last = p[-1]
    up = sum(max(0, p[i] - p[i - 1]) for i in range(len(p) - 14, len(p)))
    down = sum(max(0, p[i - 1] - p[i]) for i in range(len(p) - 14, len(p)))
    rsi = 100 if down == 0 and up > 0 else 50 if down == 0 else 100 - 100 / (1 + up / down)
    return {
        "symbol": symbol,
        "source": "Deriv public WebSocket - no auth",
        "sample_count": len(p),
        "last_quote": last,
        "first_quote": p[0],
        "change_percent": round((last / p[0] - 1) * 100, 6),
        "rsi_14_approx": round(rsi, 2),
        "first_tick_utc": datetime.fromtimestamp(times[0], tz=timezone.utc).isoformat() if times else None,
        "last_tick_utc": datetime.fromtimestamp(times[-1], tz=timezone.utc).isoformat() if times else None,
        "advice": "Esto es análisis descriptivo, no señal validada. Sin garantía de beneficio.",
        "executed_orders": 0,
    }


@server.tool()
async def compare_research_strategies(
    symbol: str = "R_100", history_count: int = 1000,
    horizon_ticks: int = 10, payout_hypothesis_percent: float = 80.0,
) -> dict[str, Any]:
    """Comparar cinco estrategias fijas con desarrollo 60% y prueba temporal 40%.

    Payout ficticio: NO usa contratos reales ni constituye recomendación.
    Los algoritmos NO se optimizan contra la prueba final.
    """
    if isinstance(horizon_ticks, bool) or not 2 <= horizon_ticks <= 80:
        raise ValueError("horizon_ticks entre 2 y 80")
    if not math.isfinite(payout_hypothesis_percent) or not 1 <= payout_hypothesis_percent <= 200:
        raise ValueError("payout hipotético entre 1 y 200 por ciento")
    if not 250 <= history_count <= MAX_HISTORY:
        raise ValueError("history_count entre 250 y 2000")
    p, times = await _market_data(symbol, history_count)
    split = int(len(p) * 0.60)
    payout = payout_hypothesis_percent / 100
    names = ("ema", "momentum", "reversion", "ruptura", "consenso")
    entries = []
    for name in names:
        entries.append({
            "strategy": name,
            "development": _sample(p, 0, split, name, horizon_ticks, payout, 1.0, 77.92),
            "held_out_test": _sample(p, split, len(p), name, horizon_ticks, payout, 1.0, 77.92),
        })
    return {
        "source": "Deriv public WebSocket",
        "mode": "HYPOTHETICAL_RESEARCH_ONLY",
        "symbol": symbol,
        "first_epoch": times[0] if times else None,
        "last_epoch": times[-1] if times else None,
        "data_points": len(p),
        "development_points": split,
        "held_out_points": len(p) - split,
        "payout_assumption_percent": payout_hypothesis_percent,
        "break_even_winrate": round(1 / (1 + payout), 4),
        "results": entries,
        "caution": "No ejecución en Deriv. Seleccionar la mejor estrategia a posteriori sesga la comparación. Los pagos reales son distintos y variables. No garantiza retornos.",
        "executed_orders": 0,
    }


if __name__ == "__main__":
    server.run(transport="streamable-http")
