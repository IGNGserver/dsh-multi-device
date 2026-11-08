/** Fail CI/release when checked-in runtime artifacts drift from the just-built source. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const drift = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'lib'], {
  cwd: root,
  encoding: 'utf8',
}).trim()
assert.equal(drift, '', `Rebuild produced uncommitted lib/** drift; synchronize the exact artifacts:\n${drift}`)

const budgets = new Map([
  ['lib/index.js', 600 * 1024],
  ['lib/client.js', 400 * 1024],
  ['lib/contract.js', 80 * 1024],
])
const sizes = []
for (const [path, budget] of budgets) {
  const size = statSync(resolve(root, path)).size
  assert.ok(size <= budget, `${path} is ${size} bytes, exceeding its ${budget}-byte budget`)
  sizes.push(`${path}=${(size / 1024).toFixed(1)}KiB/${(budget / 1024).toFixed(0)}KiB`)
}
console.log(`verify:artifacts OK (${sizes.join(', ')})`)
