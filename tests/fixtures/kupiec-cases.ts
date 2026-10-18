import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { VarBacktestResult } from '../../src/dsh-risk/risk.js'

export interface KupiecCase {
  name: string
  periods: number
  failures: number
  confidence: number
  expected: VarBacktestResult
}

// Static independent references; derivation/generator recorded with #137 evidence.
export const kupiecCases: KupiecCase[] = JSON.parse(readFileSync(new URL('./kupiec-pof.json', import.meta.url), 'utf8'))

export function inputFor(c: KupiecCase) {
  return {
    returns: c.name === 'issue-137' ? [0, 0.01, -0.005] : Array.from({ length: c.periods }, (_, i) => i < c.failures ? -0.02 : 0),
    varSeries: new Array(c.periods).fill(c.name === 'issue-137' ? 0.02 : 0.01),
    confidence: c.confidence,
  }
}

export function assertKupiec(actual: VarBacktestResult, expected: VarBacktestResult) {
  for (const value of Object.values(actual)) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `non-finite result: ${value}`)
  }
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), actual, 'lossless JSON')
  assert.equal(actual.failures, expected.failures)
  assert.equal(actual.periods, expected.periods)
  assert.equal(actual.passed, expected.passed)
  assert.ok(Math.abs(actual.expected - expected.expected) <= 1e-10 * Math.max(1, expected.expected))
  assert.ok(actual.lrStat >= 0)
  assert.ok(Math.abs(actual.lrStat - expected.lrStat) <= 1e-10 * Math.max(1, expected.lrStat), `LR ${actual.lrStat} != ${expected.lrStat}`)
  assert.ok(actual.pValue >= 0 && actual.pValue <= 1)
  assert.ok(Math.abs(actual.pValue - expected.pValue) <= 1e-10, `p ${actual.pValue} != ${expected.pValue}`)
  // Absolute tolerance alone must not permit cancellation of representable tails.
  if (expected.pValue > 0 && expected.pValue < 1e-6) {
    assert.ok(actual.pValue > 0)
    assert.ok(Math.abs(actual.pValue / expected.pValue - 1) < 1e-10, 'tail relative error < 1e-10')
  }
}
