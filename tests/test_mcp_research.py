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

    def test_rejects_history_from_other_request(self):
        with self.assertRaisesRegex(ValueError, "Identificador"):
            lab._verify_history_response({"req_id": 999, "echo_req": {"ticks_history": "R_100"}}, "R_100")

    def test_rejects_history_from_other_symbol(self):
        with self.assertRaisesRegex(ValueError, "Símbolo"):
            lab._verify_history_response({"req_id": 105, "echo_req": {"ticks_history": "R_75"}}, "R_100")

    def test_rejects_history_without_request_identity(self):
        with self.assertRaisesRegex(ValueError, "Identificador"):
            lab._verify_history_response({"echo_req": {"ticks_history": "R_100"}}, "R_100")

    def test_accepts_matching_history_identity(self):
        lab._verify_history_response({"req_id": 105, "echo_req": {"ticks_history": "R_100"}}, "R_100")

    def test_invalid_symbol_blocked_before_socket(self):
        with self.assertRaises(ValueError):
            asyncio.run(lab._market_data("INVALID_SYMBOL", 200))


    def test_history_accepts_valid_ticks_with_duplicate_second(self):
        now = 2_000_000_000
        prices = [100.0 + 0.01 * i for i in range(100)]
        times = [now - 100 + i for i in range(100)]
        times[25] = times[24]  # Múltiples ticks en un segundo son posibles
        p, t = lab._validate_history(prices, times, now_epoch=now)
        self.assertEqual(len(p), 100)
        self.assertEqual(t[24], t[25])

    def test_history_rejects_partial_response_even_if_well_formed(self):
        now = 2_000_000_000
        prices = [100.0] * 100
        times = [now - 100 + i for i in range(100)]
        with self.assertRaisesRegex(ValueError, "cantidad distinta"):
            lab._validate_history(prices, times, now_epoch=now, max_points=200, expected_count=200)

    def test_history_accepts_exact_requested_count(self):
        now = 2_000_000_000
        prices = [100.0] * 100
        times = [now - 100 + i for i in range(100)]
        p, t = lab._validate_history(prices, times, now_epoch=now, expected_count=100)
        self.assertEqual((len(p), len(t)), (100, 100))

    def test_history_rejects_mismatched_lengths(self):
        now = 2_000_000_000
        with self.assertRaisesRegex(ValueError, "longitud"):
            lab._validate_history([100.0] * 100, [now] * 99, now_epoch=now)

    def test_history_rejects_out_of_order_times(self):
        now = 2_000_000_000
        times = [now - 100 + i for i in range(100)]
        times[40] = times[39] - 5
        with self.assertRaisesRegex(ValueError, "fuera de orden"):
            lab._validate_history([100.0] * 100, times, now_epoch=now)

    def test_history_rejects_stale_data(self):
        now = 2_000_000_000
        with self.assertRaisesRegex(ValueError, "obsoleto"):
            lab._validate_history([100.0] * 100, [now - 2000 + i for i in range(100)], now_epoch=now)

    def test_history_rejects_future_timestamp(self):
        now = 2_000_000_000
        with self.assertRaisesRegex(ValueError, "imposibles"):
            lab._validate_history([100.0] * 100, [now + 200 + i for i in range(100)], now_epoch=now)

    def test_history_rejects_nan_price(self):
        now = 2_000_000_000
        prices = [100.0] * 100
        prices[10] = math.nan
        with self.assertRaisesRegex(ValueError, "inválidos"):
            lab._validate_history(prices, [now - 100 + i for i in range(100)], now_epoch=now)

    def test_history_rejects_noninteger_epoch(self):
        now = 2_000_000_000
        times = [now - 100 + i for i in range(100)]
        times[10] += 0.5
        with self.assertRaisesRegex(ValueError, "inválidos"):
            lab._validate_history([100.0] * 100, times, now_epoch=now)


class AsyncResearchTests(unittest.IsolatedAsyncioTestCase):
    async def test_new_paper_mcp_tool_calls_bot_engine_without_deriv_orders(self):
        import time
        delta = [0.025, -0.017, 0.020, -0.014, 0.019, -0.012, 0.018]
        p = []
        value = 550.0
        for i in range(1000):
            value += delta[i % len(delta)]
            p.append(round(value, 5))
        now = int(time.time())
        t = [now - 999 + i for i in range(1000)]
        async def fake(symbol, count):
            self.assertEqual((symbol, count), ("R_100", 1000))
            return p, t
        with patch.object(lab, "_market_data", fake):
            report = await lab.simulate_ten_bot_paper_trades()
        self.assertEqual(report["mode"], "PAPER_REPLAY_PUBLIC_HISTORY")
        self.assertEqual(report["brokerOrdersExecuted"], 0)
        self.assertEqual(report["summary"]["trades"], 10)
        self.assertEqual(report["summary"]["callTrades"] + report["summary"]["putTrades"], 10)
        self.assertEqual(report["summary"]["endBalanceCents"],
                         report["summary"]["startBalanceCents"] + report["summary"]["pnlCents"])

    async def test_paper_mcp_blocks_other_symbols_before_network(self):
        with self.assertRaises(ValueError):
            await lab.simulate_ten_bot_paper_trades("R_75")

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
