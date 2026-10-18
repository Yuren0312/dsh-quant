#!/usr/bin/env python3
"""After npm run build, compare 185 numerical cases to an independent oracle.
No Python packages required. Prints summary JSON; exits nonzero on mismatch.
"""
import json
import math
import subprocess
from decimal import Decimal, localcontext
from pathlib import Path

root = Path(__file__).resolve().parents[1]
js = r'''
import { kupiecTest } from './lib/dsh-risk/risk.js'
const cases = []
const run = (n,k,c) => cases.push({n,k,c,result:kupiecTest(
  Array.from({length:n},(_,i)=>i<k?-1:0),new Array(n).fill(.5),c)})
for (const n of [2,3,10,100,1000])
  for (const k of new Set([0,1,Math.floor(n/2),n-1,n]))
    for (const c of [1e-300,1e-16,.01,.5,.95,.99,1-Number.EPSILON/2]) run(n,k,c)
for (const n of [100,1000,100000])
  for (const shift of [-1e-8,-1e-10,0,1e-10,1e-8]) run(n,n/20,.95+shift)
for (const lr of [1e-12,1e-8,.1,1,1.999999,2,2.000001,3.8412,3.841458820694124,3.8416,10,100,500,1000,1400,1450])
  run(3,0,Math.exp(-lr/6))
console.log(JSON.stringify(cases))
'''
rows = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js], cwd=root))
worst_abs = worst_rel = worst_lr = 0
errors = []
with localcontext() as ctx:
    ctx.prec = 800
    for row in rows:
        n, k = row['n'], row['k']
        q = Decimal.from_float(row['c'])
        p, h = 1 - q, Decimal(k) / n
        lr = Decimal(0)
        if k:
            lr += k * (h.ln() - p.ln())
        if k < n:
            lr += (n-k) * ((1-h).ln() - q.ln())
        lr = float(2 * lr)
        pv = math.erfc(math.sqrt(lr / 2))
        actual = row['result']
        abs_err = abs(pv - actual['pValue'])
        lr_err = abs(lr - actual['lrStat']) / max(1, lr)
        rel_err = abs_err / pv if pv > 1e-300 else 0
        worst_abs = max(worst_abs, abs_err)
        worst_rel = max(worst_rel, rel_err)
        worst_lr = max(worst_lr, lr_err)
        if (not all(math.isfinite(v) for v in actual.values()) or
                actual['lrStat'] < 0 or not 0 <= actual['pValue'] <= 1 or
                abs_err > 1e-10 or lr_err > 1e-10 or rel_err > 1e-10 or
                (lr <= 3.841458820694124) != actual['passed']):
            errors.append({**row, 'reference': {'lrStat': lr, 'pValue': pv}})
print(json.dumps(dict(cases=len(rows), max_p_absolute_error=worst_abs,
                     max_p_relative_error_above_1e_300=worst_rel,
                     max_lr_scaled_error=worst_lr, discrepancies=errors), indent=2))
raise SystemExit(bool(errors))
