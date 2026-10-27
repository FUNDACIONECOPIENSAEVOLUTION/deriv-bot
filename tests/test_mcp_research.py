"""Pruebas sin acceso a Deriv: protege la lógica de investigación contra regresiones."""
import asyncio
import math
import unittest
from unittest.mock import patch
import mcp_research as lab


class RiskFreeResearchTests(unittest.TestCase):
    def test_signal_uses_prior_values_only(self):
        a = [100 + 0.04 * i for i in range(100)]
        b = a.copy()
        b[85:] = [i * 1000 for i in range(15)]
        for rule in ("ema", "momentum", "reversion", "ruptura", "consenso"):
            self.assertEqual(lab._signal(a, 70, rule), lab._signal(b, 70, rule))

    def test_directional_hypothetical_payoff(self):
        prices = [100 + i for i in range(150)]
        out = lab._sample(prices, 0, 80, "momentum", 5, 0.8, 1.0, 77.92)
        self.assertGreater(out["trades"], 0)
        self.assertEqual(out["wins"], out["trades"])
        self.assertGreater(out["hypothetical_pnl_usd"], 0)

    def test_zero_balance_blocks(self):
        prices = [100 + i for i in range(150)]
        out = lab._sample(prices, 0, 80, "momentum", 5, 0.8, 1.0, 0.2)
        self.assertEqual(out["trades"], 0)
        self.assertEqual(out["hypothetical_pnl_usd"], 0)
        self.assertTrue(out["ended_due_to_insufficient_virtual_balance"])

    def test_no_real_trading_tool(self):
        exposed = ("get_project_status", "get_market_snapshot", "compare_research_strategies")
        for name in exposed:
            self.assertTrue(hasattr(lab, name))
        for name in ("buy", "sell", "withdraw", "transfer", "real_trade", "execute_order"):
            self.assertFalse(hasattr(lab, name))

    def test_invalid_symbol_blocked_before_socket(self):
        with self.assertRaises(ValueError):
            asyncio.run(lab._market_data("INVALID_SYMBOL", 200))


class AsyncResearchTests(unittest.IsolatedAsyncioTestCase):
    async def test_comparison_uses_temporal_split(self):
        prices = [100 + 0.02 * i + 0.12 * math.sin(i / 3) for i in range(450)]
        times = [1800000000 + i for i in range(450)]
        async def fake(symbol, count):
            self.assertEqual(symbol, "R_100")
            self.assertEqual(count, 450)
            return prices, times
        with patch.object(lab, "_market_data", fake):
            result = await lab.compare_research_strategies("R_100", 450, 10, 80)
        self.assertEqual(result["development_points"], 270)
        self.assertEqual(result["held_out_points"], 180)
        self.assertEqual(result["executed_orders"], 0)
        self.assertEqual(len(result["results"]), 5)
        self.assertEqual(result["mode"], "HYPOTHETICAL_RESEARCH_ONLY")


if __name__ == "__main__":
    unittest.main()
