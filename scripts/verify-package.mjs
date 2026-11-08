/** Validate distributable metadata and (optionally) the actual npm pack file list. */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
assert.equal(manifest.name, 'dsh-multi-device')
assert.equal(manifest.version, readFileSync(resolve(root, 'VERSION'), 'utf8').trim())
assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
assert.equal(manifest.exports['./icon'], './icon.svg')
assert.equal(manifest.exports['./locale/*.json'], './locale/*.json')
assert.equal(manifest.dependencies?.ssh2, undefined)
assert.equal(manifest.optionalDependencies?.ssh2, undefined)
assert.equal(manifest.peerDependenciesMeta.ssh2.optional, true)
assert.equal(manifest.scripts.prepare, undefined, 'End users install prebuilt packages without a prepare script')
const required = ['package.json', 'VERSION', 'cordis.patch.yml', 'README.md', 'RELEASE.md', 'LICENSE', 'locale/en.json', 'locale/zh.json', 'icon.svg']
for (const language of ['en', 'zh']) {
  const { meta } = JSON.parse(readFileSync(resolve(root, `locale/${language}.json`), 'utf8'))
  assert.ok(typeof meta.title === 'string' && meta.title.length > 0)
  assert.ok(typeof meta.description === 'string' && meta.description.length > 0)
}
const icon = readFileSync(resolve(root, 'icon.svg'), 'utf8')
assert.ok(icon.includes('<svg') && icon.includes('viewBox='))
assert.ok(!/<script|<foreignObject|(?:href|src)\s*=\s*["'](?:https?:|file:|\/)/i.test(icon))
assert.ok(statSync(resolve(root, 'icon.svg')).size <= 256 * 1024)

function runtimeFiles(directory, prefix = 'lib') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = `${prefix}/${entry.name}`
    return entry.isDirectory() ? runtimeFiles(resolve(directory, entry.name), path) : [path]
  })
}

const packIndex = process.argv[2]
if (packIndex !== undefined) {
  const [packed] = JSON.parse(readFileSync(resolve(packIndex), 'utf8'))
  const paths = new Set(packed.files.map(file => file.path))
  required.push(manifest.main, manifest.exports['./client'].default.slice(2), manifest.exports['./contract'].default.slice(2), manifest.types)
  for (const path of required) assert.ok(paths.has(path), `Missing packed runtime/resource: ${path}`)
  const expectedRuntime = runtimeFiles(resolve(root, 'lib')).sort()
  const packedRuntime = [...paths].filter(path => path.startsWith('lib/')).sort()
  assert.deepEqual(packedRuntime, expectedRuntime, 'Packed lib/** inventory must exactly match the verified build output')
  assert.ok([...paths].every(path => !path.includes('node_modules/') && !path.endsWith('.log')))
}
console.log(`verify:package OK (${manifest.version}${packIndex === undefined ? ', metadata only' : ', actual packed inventory'})`)
