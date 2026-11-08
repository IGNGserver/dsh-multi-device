import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { execSshCommand, setSshSpawn, SSH2_MISSING_MESSAGE } from '../src/host/tunnel.ts'

vi.mock('ssh2', () => { throw new Error('not installed in the base plugin') })
afterEach(() => { setSshSpawn(null) })

describe('prebuilt official installation contract', () => {
  it('keeps native build dependencies out of the base dependency graph', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    expect(manifest.dependencies.ssh2).toBeUndefined()
    expect(manifest.optionalDependencies?.ssh2).toBeUndefined()
    expect(manifest.peerDependenciesMeta.ssh2.optional).toBe(true)
    expect(manifest.scripts.prepare).toBeUndefined()
    expect(manifest.exports['./icon']).toBe('./icon.svg')
    for (const lang of ['en', 'zh']) {
      const locale = JSON.parse(readFileSync(new URL(`../locale/${lang}.json`, import.meta.url), 'utf8'))
      expect(locale.meta.title.length).toBeGreaterThan(0)
      expect(locale.meta.description.length).toBeGreaterThan(0)
    }
  })

  it('selects system ssh even if an old saved passphrase is present', async () => {
    const spawn = vi.fn(() => {
      const child = new EventEmitter() as any
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = vi.fn()
      queueMicrotask(() => { child.stdout.emit('data', Buffer.from('fixture')); child.emit('close', 0) })
      return child
    })
    setSshSpawn(spawn)
    expect(await execSshCommand({ kind: 'ssh', host: 'fixture.invalid', engine: 'auto', passphrase: 'old-value' }, 'true')).toEqual({ ok: true, stdout: 'fixture' })
    expect(spawn.mock.calls[0]?.[0]).toBe('ssh')
  })

  it('bounds system ssh stdout and stderr and kills the producer', async () => {
    for (const channel of ['stdout', 'stderr'] as const) {
      const child = new EventEmitter() as any
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = vi.fn()
      setSshSpawn(() => child)
      const pending = execSshCommand({ kind: 'ssh', host: 'fixture.invalid', engine: 'system-ssh' }, 'true', 30_000)
      child[channel].emit('data', Buffer.alloc(channel === 'stdout' ? 2 * 1024 * 1024 + 1 : 256 * 1024 + 1))
      expect(await pending).toEqual({ ok: false, error: `ssh command exceeded its ${channel} limit` })
      expect(child.kill).toHaveBeenCalledWith('SIGKILL')
      child.emit('close', 0)
    }
  })

  it('honors external cancellation without allowing a late close to change the result', async () => {
    const child = new EventEmitter() as any
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = vi.fn()
    setSshSpawn(() => child)
    const controller = new AbortController()
    const pending = execSshCommand({ kind: 'ssh', host: 'fixture.invalid', engine: 'system-ssh' }, 'true', 30_000, controller.signal)
    controller.abort()
    expect(await pending).toEqual({ ok: false, error: 'ssh command aborted' })
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    child.stdout.emit('data', Buffer.from('late'))
    child.emit('close', 0)
  })

  it('reports an actionable missing optional engine instead of installing or silently falling back', async () => {
    const result = await execSshCommand({ kind: 'ssh', host: 'fixture.invalid', engine: 'ssh2' }, 'true')
    expect(result).toEqual({ ok: false, error: SSH2_MISSING_MESSAGE })
  })
})
