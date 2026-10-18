/**
 * 风险指标库（纯函数、零依赖）。
 *
 * 输入：逐期收益序列（+ 可选基准收益）。
 * 指标：历史 VaR / CVaR（Expected Shortfall）/ 下行偏差 / 最大回撤 /
 * Beta / Alpha（Jensen）/ 信息比率 / 跟踪误差。
 * 语义：收益序列按"资产收益"输入（如日收益率，小数形式 0.01 = 1%）。
 */

export interface RiskMetrics {
  /** 历史 VaR（正值表示损失），置信度默认 95% */
  var95: number
  /** CVaR / Expected Shortfall（95%） */
  cvar95: number
  /** 下行偏差（只统计负收益的波动） */
  downsideDeviation: number
  /** 最大回撤 %（从累计净值计算） */
  maxDrawdownPct: number
  /** Beta（对基准回归；无基准时 0） */
  beta: number
  /** Jensen Alpha（每期超额，小数） */
  alpha: number
  /** 信息比率（年化：超额收益 / 跟踪误差 × √365） */
  informationRatio: number
  /** 跟踪误差（年化 %） */
  trackingError: number
  /** 样本期数 */
  periods: number
}

/** 从收益序列计算风险指标。 */
export function riskMetrics(
  returns: readonly number[],
  options: { benchmarkReturns?: readonly number[]; confidence?: number } = {},
): RiskMetrics {
  const n = returns.length
  if (n < 2) throw new RangeError(`returns needs >= 2 periods, got ${n}`)
  const confidence = options.confidence ?? 0.95
  if (!Number.isFinite(confidence) || confidence <= 0 || confidence >= 1) {
    throw new RangeError(`confidence must be in (0, 1), got ${confidence}`)
  }
  // VaR / CVaR（历史法）
  const sorted = [...returns].sort((a, b) => a - b)
  const tailIdx = Math.max(0, Math.floor((1 - confidence) * n) - 1)
  const varCut = -sorted[tailIdx]!
  const tail = sorted.filter(r => r <= -varCut)
  const cvar95 = tail.length === 0 ? varCut : -(tail.reduce((a, b) => a + b, 0) / tail.length)
  // 下行偏差
  const downs = returns.filter(r => r < 0)
  const downMean = downs.length === 0 ? 0 : downs.reduce((a, b) => a + b, 0) / n
  const downVar = downs.length === 0 ? 0 : downs.reduce((a, x) => a + (x - downMean) ** 2, 0) / n
  const downsideDeviation = Math.sqrt(downVar)
  // 最大回撤（从累计净值）
  let nav = 1
  let peak = 1
  let maxDd = 0
  for (const r of returns) {
    nav *= 1 + r
    if (nav > peak) peak = nav
    const dd = (peak - nav) / peak
    if (dd > maxDd) maxDd = dd
  }
  const maxDrawdownPct = maxDd * 100
  // Beta / Alpha / IR / TE
  const bench = options.benchmarkReturns
  let beta = 0
  let alpha = 0
  let informationRatio = 0
  let trackingError = 0
  if (bench && bench.length === n) {
    const rMean = returns.reduce((a, b) => a + b, 0) / n
    const bMean = bench.reduce((a, b) => a + b, 0) / n
    let cov = 0
    let bVar = 0
    for (let i = 0; i < n; i++) {
      cov += (returns[i]! - rMean) * (bench[i]! - bMean)
      bVar += (bench[i]! - bMean) ** 2
    }
    cov /= n
    bVar /= n
    beta = bVar === 0 ? 0 : cov / bVar
    alpha = rMean - beta * bMean
    const excess = returns.map((r, i) => r - bench[i]!)
    const exMean = excess.reduce((a, b) => a + b, 0) / n
    const exVar = excess.reduce((a, x) => a + (x - exMean) ** 2, 0) / n
    const te = Math.sqrt(exVar)
    trackingError = te * Math.sqrt(365) * 100
    informationRatio = te === 0 ? 0 : (exMean / te) * Math.sqrt(365)
  }
  return { var95: varCut, cvar95, downsideDeviation, maxDrawdownPct, beta, alpha, informationRatio, trackingError, periods: n }
}

export interface VarBacktestResult {
  /** 实际失败次数（损失超过 VaR 的期数） */
  failures: number
  /** 期望失败次数 */
  expected: number
  /** Kupiec POF 似然比统计量 */
  lrStat: number
  /** 近似 p 值（卡方 1 自由度） */
  pValue: number
  /** 固定 5% 显著性水平下不拒绝（LR <= χ²₁(0.95)）；不是模型正确的证明 */
  passed: boolean
  periods: number
}

/** χ²₁ 右尾 = erfc(sqrt(x/2))，避免 1-CDF 抵消可表示的小概率。 */
function chi2Sf1(x: number): number {
  if (x <= 0) return 1
  const z = Math.sqrt(x / 2)
  if (z < 1) {
    // erf power series (DLMF 7.6.1); here erfc >= erfc(1) so subtraction is safe.
    let term = z
    let sum = z
    for (let k = 1; k <= 32; k++) {
      term *= -(x / 2) / k
      const increment = term / (2 * k + 1)
      sum += increment
      if (Math.abs(increment) <= Number.EPSILON * Math.abs(sum)) break
    }
    return Math.min(1, Math.max(0, 1 - 2 * sum / Math.sqrt(Math.PI)))
  }
  // Laplace's continued fraction, equivalent to DLMF 7.9.1:
  // erfc(z) = exp(-z²)/sqrt(π) / (z + (1/2)/(z + 1/(z + ...))).
  // Lentz evaluation; z >= 1 keeps every denominator positive and bounded away from 0.
  let f = z
  let c = z
  let d = 0
  for (let k = 1; k <= 512; k++) {
    const a = k / 2
    d = 1 / (z + a * d)
    c = z + a / c
    const delta = c * d
    f *= delta
    if (Math.abs(delta - 1) <= 2 * Number.EPSILON) break
  }
  // Underflow to 0 is legitimate only when the tail is below double precision's range.
  return Math.exp(-x / 2) / (Math.sqrt(Math.PI) * f)
}

// χ² with 1 degree of freedom, 95th percentile (fixed test size α = 0.05).
const KUPIEC_CRITICAL_95 = 3.841458820694124

/** a*log(a/b)+b-a near a=b, without cancellation (|v| < 0.1). */
function devianceNearMean(a: number, b: number): number {
  const v = (a - b) / (a + b)
  let sum = (a - b) * v
  let term = 2 * a * v
  // log(a/b) = 2*atanh(v) = 2*(v + v³/3 + v⁵/5 + ...).
  for (let j = 1; j <= 16; j++) {
    term *= v * v
    const next = sum + term / (2 * j + 1)
    if (next === sum) break
    sum = next
  }
  return sum
}

/**
 * Kupiec POF 检验：VaR 序列的失败率回测。
 * returns 与 varSeries 等长；varSeries[i] 为第 i 期预期的 VaR（正值损失）。
 * p = 1 - confidence；confidence 是 VaR 水平，不是检验显著性水平。
 * LR = 2[(n-x) log((1-x/n)/(1-p)) + x log((x/n)/p)]，约定 0 log 0 = 0。
 * 零/全部失败均有有限的边界值。p 值使用渐近 χ²₁，短样本并非精确二项检验。
 */
export function kupiecTest(
  returns: readonly number[],
  varSeries: readonly number[],
  confidence = 0.95,
): VarBacktestResult {
  const n = returns.length
  if (n < 2) throw new RangeError(`returns needs >= 2 periods, got ${n}`)
  if (varSeries.length !== n) throw new RangeError(`varSeries length ${varSeries.length} != ${n}`)
  if (!Number.isFinite(confidence) || confidence <= 0 || confidence >= 1) {
    throw new RangeError(`confidence must be in (0, 1), got ${confidence}`)
  }
  const p = 1 - confidence
  let failures = 0
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(returns[i])) throw new RangeError(`returns[${i}] must be finite`)
    if (!Number.isFinite(varSeries[i])) throw new RangeError(`varSeries[${i}] must be finite`)
    if (returns[i]! < -varSeries[i]!) failures++
  }
  const expected = p * n
  const x = failures
  // Keep both log probabilities accurate even when 1-confidence rounds to 1.
  const logP = Math.log1p(-confidence)
  const logQ = confidence > 0.5 ? Math.log1p(-p) : Math.log(confidence)
  const pHat = x / n
  // Omit zero-count terms instead of evaluating 0 * log(0).
  const failureTerm = x === 0 ? 0 : x * (Math.log(pHat) - logP)
  const successTerm = x === n ? 0 : (n - x) * (Math.log1p(-pHat) - logQ)
  let lrStat = 2 * (failureTerm + successTerm)
  const expectedSuccesses = n * confidence
  if (x > 0 && x < n &&
      Math.abs(x - expected) < 0.1 * (x + expected) &&
      Math.abs(n - x - expectedSuccesses) < 0.1 * (n - x + expectedSuccesses)) {
    // Near the MLE the two log terms cancel. Sum two nonnegative Poisson
    // deviances instead; their linear terms cancel because E[x]+E[n-x]=n.
    lrStat = 2 * (devianceNearMean(x, expected) + devianceNearMean(n - x, expectedSuccesses))
  }
  // Suppress only floating-point roundoff: the mathematical deviance is nonnegative.
  lrStat = Math.max(0, lrStat)
  const pValue = chi2Sf1(lrStat)
  return { failures: x, expected, lrStat, pValue, passed: lrStat <= KUPIEC_CRITICAL_95, periods: n }
}
