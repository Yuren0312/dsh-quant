#!/usr/bin/env python3
"""Independent Kupiec reference: Decimal (800 digits) LR + Python math.erfc.
Run from any directory; overwrites only tests/fixtures/kupiec-pof.json.
Uses the exact binary64 confidence received by the TypeScript API.
"""
import json, math
from decimal import Decimal, localcontext
from pathlib import Path
cases = [
 ('issue-137',3,0,.95),('zero-short',2,0,.95),('zero-before-cutoff',37,0,.95),('zero-after-cutoff',38,0,.95),
 ('zero-long',100,0,.95),('zero-99-short',100,0,.99),('zero-99-long',200,0,.99),
 ('all-short-pass',2,2,.5),('all-longer-reject',3,3,.5),('all-95',3,3,.95),('all-long-tail',100,100,.95),('all-underflow',1000,1000,.95),
 ('partial-match',20,1,.95),('partial-match-exact',100,50,.5),('partial-pass',100,7,.95),('partial-reject',100,20,.95),
 ('partial-long-pass',1000,60,.95),('partial-long-reject',1000,100,.95),('partial-tiny-tail',1000,200,.95),
 ('critical-rounding',3,0,math.exp(-3.8412/6)),('critical-reject',3,0,math.exp(-3.8416/6)),
 ('tiny-confidence-zero',3,0,5e-324),('tiny-confidence-all',3,3,5e-324),('tiny-confidence-partial',3,2,1e-300),
 ('near-one-zero',3,0,math.nextafter(1,0)),('near-one-all',3,3,math.nextafter(1,0)),('near-one-partial',3,1,math.nextafter(1,0)),
 ('near-match-long',100000,5000,.95),
 ('near-match-below',100000,5000,.95-1e-10),('near-match-above',100000,5000,.95+1e-10),
 ('match-high-rate',100,99,.01),
 ('sf-series-edge',3,0,math.exp(-1.999999/6)),('sf-fraction-edge',3,0,math.exp(-2.000001/6)),
]
rows=[]
with localcontext() as ctx:
 ctx.prec=800
 for name,n,k,c in cases:
  q=Decimal.from_float(c); p=1-q; h=Decimal(k)/n
  lr=Decimal(0)
  if k: lr+=k*(h.ln()-p.ln())
  if k<n: lr+=(n-k)*((1-h).ln()-q.ln())
  lr=float(2*lr)
  rows.append(dict(name=name,periods=n,failures=k,confidence=c,expected=dict(failures=k,expected=float(n*p),lrStat=lr,pValue=math.erfc(math.sqrt(lr/2)),passed=lr<=3.841458820694124,periods=n)))
(Path(__file__).resolve().parents[1] / 'tests/fixtures/kupiec-pof.json').write_text(json.dumps(rows,indent=2,allow_nan=False)+'\n')
print('generated',len(rows),'independent Decimal/math.erfc baselines')
