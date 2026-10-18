/** Deterministic #137 audit of the built package through the actual dsh runtime.
 * npm run build && node --import tsx scripts/verify-kupiec.ts [output.json]
 * Long inputs are losslessly specified by tests/fixtures/kupiec-cases.ts::inputFor.
 */
import assert from 'node:assert/strict'
import { writeFileSync, readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { apply, kupiecTest } from '../lib/index.js'
import { assertKupiec, inputFor, kupiecCases } from '../tests/fixtures/kupiec-cases.ts'

const ctx = new Context()
const results: object[] = []
let failures = 0
try {
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin({ name: 'dsh-quant', inject: ['tools'], apply })
  for (const c of kupiecCases) {
    const args = inputFor(c)
    const actual = kupiecTest(args.returns, args.varSeries, args.confidence)
    const runtime = await ctx.tools.execute({
      callId: `audit-${c.name}` as Parameters<typeof ctx.tools.execute>[0]['callId'],
      name: 'quant_var_backtest', arguments: args, signal: new AbortController().signal,
    })
    let error: string | undefined
    try {
      assertKupiec(actual, c.expected)
      assert.equal(runtime.isError, false, runtime.error?.message)
      assert.deepEqual(runtime.value, actual)
    } catch (e) { failures++; error = String(e) }
    results.push({
      case: c.name,
      input: c.name === 'issue-137' ? args : { fixture: c.name, generator: 'tests/fixtures/kupiec-cases.ts::inputFor' },
      expected: c.expected, actual,
      runtime: { isError: runtime.isError, ...(runtime.isError ? { error: runtime.error } : { value: runtime.value }) },
      passed: error === undefined, ...(error ? { error } : {}),
    })
  }
} finally { await ctx.fiber.dispose() }
const dependencies = Object.fromEntries(['cordis', 'dsh-tools', 'dsh-system-prompt', 'dsh-llm'].map(p =>
  [p, JSON.parse(readFileSync(new URL(`../node_modules/@deepseek-ai/${p}/package.json`, import.meta.url), 'utf8')).version]))
const report = { generatedAt: new Date().toISOString(), node: process.version, dependencies,
  tests: results.length, passed: results.length - failures, failed: failures, results }
// Diagnostics only: preserve any failing non-JSON number explicitly, never coerce to null.
const output = JSON.stringify(report, (_key, value) => typeof value === 'number' && !Number.isFinite(value) ? String(value) : value, 2) + '\n'
if (process.argv[2]) writeFileSync(process.argv[2], output)
else console.log(output)
console.log(JSON.stringify({ tests: results.length, passed: results.length - failures, failed: failures, dependencies }))
process.exitCode = failures ? 1 : 0
