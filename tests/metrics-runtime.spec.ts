import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { apply } from '../src/index.js'

for (const withTrades of [false, true]) {
  test(`quant_metrics lossless JSON: ${withTrades ? 'trades: []' : 'trades omitted'} (#135)`, async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin({ name: 'dsh-quant', inject: ['tools'], apply })
      assert.equal(ctx.tools.schemas().length, 59)
      const result = await ctx.tools.execute({
        callId: `metrics-${withTrades}` as Parameters<typeof ctx.tools.execute>[0]['callId'],
        name: 'quant_metrics',
        arguments: {
          equityCurve: [1, 1.02, 1.01, 1.05, 1.03, 1.08],
          ...(withTrades ? { trades: [] } : {}),
        },
        signal: new AbortController().signal,
      })
      assert.equal(result.isError, false, result.error?.message)
      assert.deepEqual(JSON.parse(JSON.stringify(result.value)), result.value)
      assert.equal(Object.hasOwn(result.value as object, 'tradeMetrics'), withTrades)
      if (withTrades) {
        assert.deepEqual((result.value as { tradeMetrics: unknown }).tradeMetrics, {
          tradeCount: 0, winRate: 0, avgReturnPct: 0, profitFactor: 0, avgHoldingPeriods: 0,
        })
      }
    } finally {
      await ctx.fiber.dispose()
    }
  })
}
