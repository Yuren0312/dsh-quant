/**
 * 消费者场景验证：模拟"npm 安装后"的 dsh 用户。
 *
 * 与单元测试不同，这里不使用模块映射——Loader 的 internal import 直接走
 * 真实 Node 解析（import(specifier)），从本目录的 node_modules 加载：
 *   - dsh-quant-indicators → 包的 exports → lib/index.js（构建产物）
 *   - @deepseek-ai/dsh-tools 等 → 消费者安装的依赖
 *
 * 运行（注意：在 consumer-test 目录下，tsx 会采用 quant-indicators/tsconfig.json，
 * 其无 paths 映射，因此走真实 node_modules 解析）：
 *   cd deepseek-harness && pnpm exec tsx ../quant-indicators/consumer-test/boot.ts
 */
import { Context } from '@deepseek-ai/cordis'
// Call IDs are strings at runtime. Derive the brand from execute so 0.1.x
// does not import the ToolCallId value introduced in 0.2.x.
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { pathToFileURL } from 'node:url'

const ctx = new Context()
ctx.baseUrl = new URL('.', import.meta.url).href
await ctx.plugin(Loader)
ctx.loader.builtins.include = Include
// dsh-tools 0.2.x 的 Loader 内部模块映射仍是 v2 形状；按官方测试同样的断言装配
ctx.loader.internal = {
  version: 'v2',
  async import(specifier: string) {
    // 真实 Node 解析：从本文件所在目录的 node_modules 链
    return import(specifier)
  },
} as unknown as NonNullable<typeof ctx.loader.internal>
await ctx.loader.create({ name: 'cordis:include', config: { path: new URL('./cordis.yml', import.meta.url).href } })
await ctx.loader.await()

console.log('✅ Loader booted via real node_modules resolution')
const names = ctx.tools.schemas().map(s => s.name).sort()
console.log('tools:', names.join(', '))
if (names.length !== 59) throw new Error(`expected 59 tools, got ${names.length}`)

const r = await ctx.tools.execute({
  callId: 'consumer-1' as Parameters<typeof ctx.tools.execute>[0]['callId'],
  name: 'quant_sma',
  arguments: { values: [1, 2, 3, 4, 5], window: 3 },
  signal: new AbortController().signal,
})
console.log('quant_sma →', JSON.stringify(r.value))
if (r.isError || JSON.stringify((r.value as { values: (number | null)[] }).values) !== JSON.stringify([null, null, 2, 3, 4])) {
  throw new Error('quant_sma result mismatch')
}

console.log('\n✅ consumer simulation passed: published package loads and executes')
await ctx.fiber.dispose()
