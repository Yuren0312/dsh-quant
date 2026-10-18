// Install the actual packed plugin beside an exact host family, then boot the
// existing real-Loader consumer fixture using Node's normal package resolution.
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const version = process.argv[2]
const supported = ['0.1.0-rc.6', '0.2.0-rc.2', '0.2.1-alpha.3', '0.2.1-rc.2']
if (!supported.includes(version)) throw new Error(`Unknown DSH cohort: ${version}`)
const pins = JSON.parse(readFileSync(new URL(`../tests/fixtures/dsh-cohorts/${version}.json`, import.meta.url)))
const temp = mkdtempSync(join(tmpdir(), 'dsh-quant-consumer-'))
function run(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' })
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr ?? ''}`)
  return result.stdout
}
try {
  const packed = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temp], root, true))[0]
  writeFileSync(join(temp, 'package.json'), JSON.stringify({
    name: 'dsh-quant-compat-consumer', version: '0.0.0', private: true, type: 'module',
    dependencies: { ...pins, tsx: '4.23.15', 'dsh-quant': `file:${resolve(temp, packed.filename)}` },
  }, null, 2))
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], temp)
  // Invalid/duplicate peers must fail rather than silently testing two runtimes.
  run('npm', ['ls', '@deepseek-ai/cordis', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-system-prompt'], temp)
  for (const name of ['boot.ts', 'cordis.yml']) copyFileSync(join(root, 'consumer-test', name), join(temp, name))
  run(process.execPath, ['--import', 'tsx', 'boot.ts'], temp)
} finally {
  rmSync(temp, { recursive: true, force: true })
}
