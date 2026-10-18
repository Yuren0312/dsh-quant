# DSH 0.2.1-rc.2 compatibility audit

Date: 2026-10-18, Asia/Shanghai. Requests: [#139](https://github.com/pengpengyi92/dsh-quant/issues/139) and [#140](https://github.com/pengpengyi92/dsh-quant/issues/140), both by **ziladan**.

## Provenance and scope

This work continues **hufeide's #136**, head `633ba45fa96063d0cc746c6618b28dfadba59908`, preserving the original commits and adaptation. It adds maintainer remediation for the previously requested changes and the new RC. The current master baseline is `6a444c21a651a2537e721e4bda7a04292c54b5b6`.

#135 was independently fixed by #138; #137 by #141. Both were already merged before this audit. Their regression tests are retained, and this compatibility change has **no diff in src/ relative to the current master**. Pulling master into the contributor lineage does not claim those fixes as compatibility work.

## Actual release and relevant API

- npm registry: `@deepseek-ai/dsh@0.2.1-rc.2` was published at `2026-10-17T08:36:31.655Z` and has the `next` tag. `latest` remains `0.2.0-rc.2`; `alpha` is `0.2.1-alpha.5` at inspection. Metadata and integrity are in [release.json](dsh-0.2.1-rc.2-evidence/release.json).
- Official [rc.2 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.2) adds model/Search/Fetch support. The [rc.1 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.1) documents compatibility checks preferring `engines.dsh`, with DSH peer dependencies as fallback.
- Inspected the **published** `dsh-tools`, `dsh-llm`, `dsh-plugin-manager`, and `dsh-app-boot` packages, not just version strings. `defineTool`, `ctx.tools.register`, schemas and the execution path used by this plugin remain compatible. Newer `execute` takes the branded `ToolCallId` and a canonical JSON result. The published `ToolCallId` function returns the same string; a type derived from `Parameters<typeof ctx.tools.execute>[0]['callId']` preserves that boundary without a runtime export absent in 0.1.x.
- The published app-boot evaluator was actually executed against master, #136 and candidate manifests. It rejects master on rc.2 due to the old peer ranges, accepts #136 and the corrected candidate, and rejects candidate on 0.3.0 / 1.0.0. See [host-gate-results.json](dsh-0.2.1-rc.2-evidence/host-gate-results.json). No version exemption or forced peer installation was used.

| Cohort | tools / system-prompt / llm | Cordis | Loader | Include |
| --- | --- | --- | --- | --- |
| Historical | 0.1.0-rc.6 | 4.0.1 | 1.0.2 | 1.0.6 |
| Previous RC | 0.2.0-rc.2 | 4.0.4 | 1.0.5 | 1.0.9 |
| Contributor lock | 0.2.1-alpha.3 | 4.0.5-alpha.2 | 1.0.6-alpha.2 | 1.0.10-alpha.2 |
| Requested RC | 0.2.1-rc.2 | 4.0.5 | 1.0.6 | 1.0.10 |

All transitive DeepSeek-family pins are recorded in `tests/fixtures/dsh-cohorts/`. Historical host fixtures intentionally override newer development Loader/Include minimums while preserving the production peer declarations. This verifies old consumers rather than silently abandoning them.

## Before and after

On Node 24.19.0 / npm 11.9.0, clean registry installs without `--force` or `--legacy-peer-deps`:

| Revision / host | Build + src types | Full suite | Registered / deterministic calls |
| --- | --- | --- | --- |
| master / rc.2, explicitly installed correct host deps | pass | 298/298 | 59 / 56 of 56 |
| original #136 / rc.2 | pass | 227/227 | 59 / 56 of 56 |
| original #136 / old | pass | 223 pass, Loader import fails | earlier defect reproduced |
| corrected candidate / old | pass | 298/298 | 59 / 56 of 56 |
| corrected candidate / previous RC | pass | 298/298 | 59 / 56 of 56 |
| corrected candidate / alpha | pass | 298/298 | 59 / 56 of 56 |
| corrected candidate / requested RC | pass | 298/298 | 59 / 56 of 56 |

All four corrected rows also pass explicit strict typechecking of verify.ts, both demos, consumer boot, Loader tests and smoke script. Every row passes a **packed tarball** installation beside its pinned host family, `npm ls` validation of shared peers, actual Loader boot, 59 registrations and the SMA known answer. Existing metrics and Kupiec real-runtime regressions run in each full suite.

Default RC lock: `npm ci --ignore-scripts` succeeds. Coverage succeeds at 94.27% lines. Benchmark succeeds via `node --import tsx benchmark/smoke.ts`. Existing packed pure-function consumer succeeds (88 exports). Literal local `npm test` and `npm run bench` hit the environment's tsx IPC `EPERM`; their CLI commands are **not claimed passing locally**. The equivalent Node import runner completed the checks above. GitHub CI remains an independent merge gate and runs the literal commands.

Three live API tools (`quant_market_fetch`, `quant_repo_stats`, `quant_npm_stats`) are explicitly unverified. This is package/runtime/Loader compatibility, not certification of every desktop UI, full CLI profile, live market endpoint or model-driven conversation.

## Maintainer changes and reproduction

- Retain #136's widened DSH/Cordis peer ranges and result narrowing; replace only its new-only call-ID runtime imports.
- Declare bounded `engines.dsh` consistently with supported peer lines; bound Loader/Include prerelease alternatives below major 2.
- Refresh the lockfile to the tested published RC family with official npm URLs. Attempting to update a partly locked alpha family produced ERESOLVE; the coherent fresh RC tree installed successfully. No ignored peer conflict is represented as passing.
- Add pinned four-row CI, script typechecking, deterministic smoke and packed Loader consumer checks. Original numerical fixes remain separate.

Run in a disposable checkout (the cohort installer deliberately replaces development dependencies and lockfile):

```sh
node scripts/install-dsh-cohort.mjs 0.2.1-rc.2
npm run build
npm run typecheck
npm run typecheck:scripts
node --import tsx --test tests/*.spec.ts
npm run test:compat
node scripts/consumer-runtime.mjs 0.2.1-rc.2
```

Repeat for the other three cohort names. `npm ci` verifies the committed default RC lock. Raw logs, original failing evidence and per-command exit codes are retained in [raw-results.zip](dsh-0.2.1-rc.2-evidence/raw-results.zip); [summary.json](dsh-0.2.1-rc.2-evidence/summary.json) includes its checksum.

This audit is pre-merge evidence. The GitHub PR review/checks record final acceptance. No version bump, release tag or npm publish is part of this task; merging source does not update npm users. Duplicate requests are linked in their own threads, with publication status explicitly stated.
