# Issue #137: finite and statistically correct Kupiec POF

Date: 2026-10-18 (Asia/Shanghai). Base: `29401154b45d5620e052276b60fb5d0279226a75` (`master`).
Scope: [#137](https://github.com/pengpengyi92/dsh-quant/issues/137) only.

## Derivation and decision rule

Let `n` be the observation count, `x` the exceedance count, `p = 1-confidence`
(the **VaR** exceedance probability), and `h = x/n`. The binomial coefficient
cancels between the null and unrestricted maximum likelihoods:

```
L0   = (1-p)^(n-x) p^x
Lhat = (1-h)^(n-x) h^x
LR   = -2 log(L0/Lhat)
     = 2 [(n-x) log((1-h)/(1-p)) + x log(h/p)]
```

Using the continuous convention `0 log 0 = 0` gives:

- `x=0`: `LR = -2 n log(1-p)`.
- `x=n`: `LR = -2 n log(p)`.
- `0<x<n`: use the general expression above.

For `0<p<1` and finite `n`, both boundaries are finite. Neither boundary
justifies a sentinel or a forced decision. The asymptotic null distribution
is chi-square with **one** degree of freedom. Its right-tail probability is
`pValue = erfc(sqrt(LR/2))`. At fixed test size `alpha=0.05`, non-rejection is
`LR <= 3.841458820694124`, equivalent mathematically to `pValue >= 0.05`.
The VaR confidence is independent of this fixed test size. The old truncated
cutoff `3.841` incorrectly rejected statistics in the small interval above it.

`passed` means failure to reject unconditional coverage; it does not establish
model quality or independence of exceedances. This remains the asymptotic
Kupiec test, **not** an exact finite-sample binomial test. The existing minimum
of two observations remains in force; short-sample results should be
interpreted with the limited power/calibration of the asymptotic reference.

## Implementation and contract

- Reject non-finite confidence, confidence outside `(0,1)`, non-finite returns
  or VaR values, unequal lengths, and insufficient observations. Sparse numeric
  arrays are also rejected rather than silently counted as non-exceedances.
- Compute log probabilities from the original confidence, with `log1p` where
  subtraction loses precision. This includes representable confidence values
  so small that `1-confidence` rounds to one. Skip zero-count logarithm terms.
- Near the maximum likelihood estimate, ordinary log terms cancel. Evaluate
  the sum of two Poisson deviances with `v=(a-b)/(a+b)` and
  `a log(a/b)+b-a = (a-b)v + 2a(v^3/3+v^5/5+...)`. The linear terms cancel
  analytically between the exceedance and non-exceedance counts.
- Replace the old A&S CDF approximation with the erf power series for
  `sqrt(LR/2)<1`, and Laplace's continued fraction for the complementary tail
  otherwise. This avoids both premature `1-CDF` cancellation and inaccurate
  relative tail probabilities. A tail below binary64 range can legitimately
  round to numeric zero; it is never forced to zero because of an event count.
- Keep the same six required output fields: integer `failures` and `periods`,
  numeric `expected`, `lrStat`, `pValue`, and boolean `passed`. No nullable union,
  string sentinel, or serialization coercion is added. The actual tool runtime
  enforces the unchanged output schema and lossless JSON contract.
- Keep the strict comparison `return < -VaR`: equality is not an exceedance.
  Update the tool description and remove its obsolete infinity render branch.

The generator was run and the `quant_var_backtest` entry synchronized in
`mcp/tools.json`. The baseline manifest contains only 46 of the 59 current tools;
this PR deliberately retains the unrelated entries/metadata rather than mixing
in a repository-wide stale-manifest repair. Runtime tests use the actual plugin.

## Representative actual results

| n | x | VaR confidence | LR | p-value | passed |
|---:|---:|---:|---:|---:|:---:|
| 3 | 0 | 0.95 | 0.30775976632530344 | 0.5790581467152063 | true |
| 100 | 0 | 0.95 | 10.258658877510115 | 0.0013604454302787962 | false |
| 2 | 2 | 0.50 | 2.772588722239781 | 0.09589096714246555 | true |
| 3 | 3 | 0.50 | 4.1588830833596715 | 0.0414167064873683 | false |
| 100 | 7 | 0.95 | 0.753015201501984 | 0.38552327600857783 | true |
| 100 | 20 | 0.95 | 27.955733336530123 | 1.241226455307216e-7 | false |

The original input is preserved exactly:

```json
{"returns":[0,0.01,-0.005],"varSeries":[0.02,0.02,0.02],"confidence":0.95}
```

All 33 static cases are in `tests/fixtures/kupiec-pof.json`, with reproducible
input construction in `tests/fixtures/kupiec-cases.ts`. For other cases,
`returns[i]` is `-0.02` for `i < failures`, otherwise `0`; VaR is `0.01` for each
period. No randomness or external market data is used. Cases cover zero/all/
partial exceedances, 37/38 observations around the zero-exceedance cutoff,
99% VaR, long samples, LR around the full critical value, the survival-function
branch boundary, near-null cancellation, extreme confidence, positive tiny
p-values, legitimate underflow, and rejected invalid inputs.

## Validation

Node `v24.19.0`; existing installed dependencies were reused in isolated test
directories. No package manifests or lockfiles were changed.

| dsh-tools / system-prompt / llm | Cordis | Build + typecheck | Full suite | Built-package runtime cases |
|---|---|---|---:|---:|
| 0.1.0-rc.6 | 4.0.1 | pass | 296/296 | 33/33 |
| 0.2.0-rc.2 | 4.0.4 | pass | 296/296 | 33/33 |
| 0.2.1-alpha.3 | 4.0.5-alpha.2 | pass | 296/296 | 33/33 |

The original `risk.ts` from the base commit was restored in an isolated
pre-fix comparison directory with the final regression tests. On the alpha
runtime this gives **3/73 passing regression checks** (70 failures, including
the parent runtime test). The tight new numerical tolerances also expose the
old approximate p-value errors; these are not 70 separate user-facing bugs.
The original zero-exceedance call is rejected as `value is not lossless JSON`.

The final standalone targeted regression set has 73 checks. It is included in
each passing full suite. The separate audit imports **built `lib/index.js`**,
executes all 33 cases through `Context`, `SystemPrompt`, `ToolRuntime`, and the
registered `quant_var_backtest` tool, and checks equality with the pure result.

An additional **185-case independent numerical sweep** uses Python Decimal
(800 digits, exact binary64 input confidence) for LR and `math.erfc` for the
survival probability. All decisions agree. Maximum absolute p-value error is
`4.9960036108132044e-15`; maximum relative p-value error above `1e-300` is
`1.2478128755518723e-13`; maximum scaled LR error is `3.3306690738754696e-16`.
Static regression p-value and scaled LR tolerances are `1e-10`, including a
relative tail check so that erroneously returning zero cannot pass.

On the alpha family, benchmark smoke passes; coverage command exits zero with
**94.17% overall line coverage** and **100% lines / 98.65% branches** in `risk.ts`.
The literal `npm test` completes build/typecheck but its `tsx --test` child
cannot create an IPC socket locally (`listen EPERM`). It is **not claimed
passing**. The equivalent suite was run with
`node --import tsx --test --test-reporter=tap tests/*.spec.ts`, as recorded above.
The packed-package consumer test also passes (88 exports).
GitHub CI is a separate merge gate; local results are not a substitute for it.

### Reproduce

```sh
npm ci
npm run build
npm run typecheck
node --import tsx --test tests/risk-kupiec.spec.ts tests/var-backtest-runtime.spec.ts
node --import tsx --test tests/*.spec.ts
node --import tsx scripts/verify-kupiec.ts /tmp/kupiec-runtime.json
python3 scripts/check-kupiec-reference.py
# Optional: regenerate the independent static reference values.
python3 scripts/generate-kupiec-fixtures.py
```

The JSON evidence records exact expected and actual outputs plus runtime
results. Long inputs are stored as fixture names with the deterministic
constructor above. In **pre-fix diagnostics only**, non-finite numbers are
explicit strings such as `"Infinity"`, preserving evidence without silently
turning them into JSON null; this encoding is never used in production output.
Full commands, exit codes and raw logs are in
[`issue-137-evidence/raw-results.zip`](issue-137-evidence/raw-results.zip).
The evidence summary lists its SHA-256 for integrity checking.

## Scope and attribution

[#135](https://github.com/pengpengyi92/dsh-quant/issues/135) is the separate
`tradeMetrics: undefined` report by `klauschenshu-arch`.
[#136](https://github.com/pengpengyi92/dsh-quant/pull/136) is `hufeide`'s separate
dsh compatibility contribution. [#138](https://github.com/pengpengyi92/dsh-quant/pull/138)
contains the independent #135 omission fix and its audit. All three were open
at this task's initial check. This branch starts directly from `master`; it
neither incorporates their fixes nor changes their issue, review or PR states.
Only #137 should be linked for automatic closure on this PR's merge. No version
bump, release tag, or npm publication is part of this change.

## Mathematical references

- [MathWorks POF algorithm](https://www.mathworks.com/help/risk/varbacktest.pof.html):
  general likelihood ratio, explicit zero/all boundaries, chi-square(1) limit.
- [NIST chi-square critical values](https://www.itl.nist.gov/div898/handbook/eda/section3/eda3674.htm):
  upper-tail rejection at fixed significance.
- [NIST DLMF 7.6.1](https://dlmf.nist.gov/7.6.E1): erf power series.
- [NIST DLMF 7.9.1](https://dlmf.nist.gov/7.9.E1): equivalent Laplace continued fraction.
