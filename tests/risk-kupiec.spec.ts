import assert from 'node:assert/strict'
import { test } from 'node:test'
import { kupiecTest } from '../src/dsh-risk/risk.ts'
import { assertKupiec, inputFor, kupiecCases } from './fixtures/kupiec-cases.ts'

for (const c of kupiecCases) {
  test(`kupiecTest: ${c.name}`, () => {
    const a = inputFor(c)
    assertKupiec(kupiecTest(a.returns, a.varSeries, a.confidence), c.expected)
  })
}

test('kupiecTest: VaR equality is not an exceedance; default confidence is 0.95', () => {
  const returns = [-0.01, -0.02, 0]
  const vars = [0.01, 0.01, 0.01]
  const r = kupiecTest(returns, vars)
  assert.equal(r.failures, 1)
  assert.deepEqual(r, kupiecTest(returns, vars, 0.95))
  assert.deepEqual(returns, [-0.01, -0.02, 0])
  assert.deepEqual(vars, [0.01, 0.01, 0.01])
})

test('kupiecTest: input preconditions', () => {
  assert.throws(() => kupiecTest([], []), />= 2/)
  assert.throws(() => kupiecTest([0.01], [0.02]), />= 2/)
  assert.throws(() => kupiecTest([0.01, 0.02], [0.01]), /varSeries length/)
  for (const c of [0, 1, -0.1, 1.1, NaN, Infinity, -Infinity]) {
    assert.throws(() => kupiecTest([0, 0], [0.01, 0.01], c), /confidence/)
  }
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.throws(() => kupiecTest([0, bad], [0.01, 0.01]), /returns\[1\]/)
    assert.throws(() => kupiecTest([0, 0], [0.01, bad]), /varSeries\[1\]/)
  }
  assert.throws(() => kupiecTest(new Array(2), [0.01, 0.01]), /returns\[0\]/)
})
