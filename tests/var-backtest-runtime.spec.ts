import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { apply } from '../src/index.js'
import type { VarBacktestResult } from '../src/dsh-risk/risk.js'
import { assertKupiec, inputFor, kupiecCases } from './fixtures/kupiec-cases.ts'

test('quant_var_backtest: real runtime validates finite, statistically correct results (#137)', async t => {
  const ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin({ name: 'dsh-quant', inject: ['tools'], apply })
    assert.ok(ctx.tools.schemas().some(s => s.name === 'quant_var_backtest'))
    for (const c of kupiecCases) {
      await t.test(c.name, async () => {
        const result = await ctx.tools.execute({
          callId: `kupiec-${c.name}` as Parameters<typeof ctx.tools.execute>[0]['callId'],
          name: 'quant_var_backtest', arguments: inputFor(c),
          signal: new AbortController().signal,
        })
        assert.equal(result.isError, false, result.error?.message)
        assertKupiec(result.value as VarBacktestResult, c.expected)
      })
    }
    for (const confidence of [0, 1, -0.1, 1.1]) {
      await t.test(`invalid confidence ${confidence}`, async () => {
        const result = await ctx.tools.execute({
          callId: `kupiec-invalid-${confidence}` as Parameters<typeof ctx.tools.execute>[0]['callId'],
          name: 'quant_var_backtest', arguments: { returns: [0, 0], varSeries: [0.01, 0.01], confidence },
          signal: new AbortController().signal,
        })
        assert.equal(result.isError, true)
        assert.match(result.error?.message ?? '', /confidence/)
      })
    }
  } finally {
    await ctx.fiber.dispose()
  }
})
