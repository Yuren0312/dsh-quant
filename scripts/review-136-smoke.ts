// Maintainer audit: deterministic runtime smoke, no external API requests.
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { apply } from '../src/index.js'
const close = Array.from({length:120},(_,i)=>100+i*.02+Math.sin(i*.5)*3)
const returns = close.map((x,i)=>i ? x/close[i-1]!-1:0)
const candles = close.map((x,i)=>({openTime:1700000000000+i*86400000,open:x,high:x+1,low:x-1,close:x,volume:1000+i}))
const ohlc={close,high:close.map(x=>x+1),low:close.map(x=>x-1)}
const matrix=returns.map((r,i)=>[r,Math.cos(i)*.01])
const fixtures: Record<string, any> = {}
for (const n of ['sma','ema','rsi','macd','bollinger','roc','series_stats','series_quality','data_annotate','data_pit']) fixtures['quant_'+n]={values:close,...(['sma','ema'].includes(n)?{window:3}:{})}
for (const n of ['atr','kdj','williams_r','cci','adx']) fixtures['quant_'+n]=ohlc
for (const n of ['backtest','backtest_grid','backtest_bollinger','backtest_rsi','volatility']) fixtures['quant_'+n]={close}
Object.assign(fixtures,{
 quant_obv:{close,volume:close.map(()=>1000)},
 quant_backtest_portfolio:{assets:[{name:'A',close},{name:'B',close:close.map((x,i)=>x+Math.cos(i))}]},
 quant_portfolio_optimize:{returns:matrix}, quant_data_guide:{channel:'akshare'},
 quant_data_compare:{dataType:'日线行情'},quant_data_advice:{dataType:'日线行情'},quant_data_quality:{candles},
 quant_channel_guide:{channel:'akshare'},quant_factor_evaluate:{factorValues:close,forwardReturns:returns},
 quant_ic_decay:{factor:close,returns},quant_factor_combine:{factors:[close,returns]},
 quant_layered_backtest:{factor:matrix,returns:matrix,layers:2},quant_attribution:{returns:matrix,weights:[.5,.5]},
 quant_factor_correlation:{factors:[close,returns]},quant_deflated_sharpe:{observedSharpe:1,numPeriods:120},
 quant_parameter_sensitivity:{baseValue:10,steps:3,metricValues:[1,1.1,1]},quant_chart:{kind:'candles',candles},
 quant_metrics:{equityCurve:close,trades:[]},quant_fund:{equityCurve:close},quant_risk:{returns},
 quant_stress_test:{weights:[.5,.5],betas:[1,.8],assetVolsPct:[20,15]},
 quant_var_backtest:{returns,varSeries:returns.map(()=>process.argv.includes('--zero-exceedances') ? .02 : .006)},quant_resample:{candles,period:'week'},
 quant_report:{strategy:'deterministic smoke fixture'},quant_oss_pulse:{stars:3},
 quant_factor_neutralize:{factorValues:close},quant_walk_forward:{returns,features:[close],trainWindow:30,testWindow:10},
 quant_drawdown:{equity:close},quant_execute_sim:{close,orders:[{index:1,side:'buy',valueFraction:.5}]},
 quant_trade_quality:{fills:[]},quant_trading_cost:{quantity:10,price:100},
 quant_rebalance_schedule:{driftPerPeriod:.01,costPerRebalance:.002},quant_bond:{couponRate:.03,periodsToMaturity:2,ytm:.04},
 quant_option:{spot:100,strike:100,timeToMaturity:1,riskFreeRate:.05,volatility:.2,type:'call'},
 quant_linear_model:{X:close.map(x=>[x]),y:returns,lambda:1},quant_research_pipeline:{candles}
})
const skipped = new Set(['quant_market_fetch','quant_repo_stats','quant_npm_stats'])
const ctx=new Context()
try {
 await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin({name:'dsh-quant',inject:['tools'],apply})
 const names=ctx.tools.schemas().map(s=>s.name).sort(); assert.equal(names.length,59)
 let passed=0,failed=0
 for(const name of names){
  if(skipped.has(name)){console.log('UNVERIFIED live API',name);continue}
  assert.ok(fixtures[name],`missing fixture ${name}`)
  const r=await ctx.tools.execute({callId:name as Parameters<typeof ctx.tools.execute>[0]['callId'],name,arguments:fixtures[name],signal:new AbortController().signal})
  try {assert.equal(r.isError,false,r.error?.message);assert.deepEqual(JSON.parse(JSON.stringify(r.value)),r.value);passed++;console.log('PASS',name)}
  catch(e){failed++;console.log('FAIL',name,String(e))}
 }
 console.log(JSON.stringify({registered:names.length,passed,failed,unverified:skipped.size}));process.exitCode=failed?1:0
}finally{await ctx.fiber.dispose()}
