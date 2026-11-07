/** Synchronous durable JSON snapshots: atomic replacement and stale-writer refusal. */
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

function bytes(path: string): string | undefined {
  try { return readFileSync(path, 'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
}
function digest(text: string | undefined): string {
  return text === undefined ? 'missing' : createHash('sha256').update(text).digest('hex')
}

function parseDocument<T>(text: string): T {
  const value = JSON.parse(text) as T
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new SyntaxError('Expected a JSON object document')
  return value
}

export function atomicWrite(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temp = `${path}.${randomUUID()}.tmp`
  let fd: number | undefined
  try {
    fd = openSync(temp, 'wx', 0o600)
    writeFileSync(fd, text)
    fsyncSync(fd)
    closeSync(fd); fd = undefined
    renameSync(temp, path)
    // Some platforms do not support flushing directory handles. File flush and
    // atomic rename remain mandatory; do not fall back to in-place copying.
    try { const dir = openSync(dirname(path), 'r'); try { fsyncSync(dir) } finally { closeSync(dir) } } catch { /* platform */ }
  } finally {
    if (fd !== undefined) closeSync(fd)
    if (existsSync(temp)) unlinkSync(temp)
  }
}

export class JsonSnapshotFile {
  private expected: string | undefined
  private unreadable = false
  constructor(readonly path: string, private readonly validate?: (value: Record<string, unknown>) => boolean) {}

  private parse<T>(text: string): T {
    const value = parseDocument<Record<string, unknown>>(text)
    if (this.validate !== undefined && !this.validate(value)) throw new SyntaxError('Unsupported JSON document schema')
    return value as T
  }

  read<T>(): T | undefined {
    this.unreadable = true
    const text = bytes(this.path)
    this.expected = digest(text)
    this.unreadable = false
    if (text === undefined) return undefined
    try { return this.parse<T>(text) }
    catch {
      this.unreadable = true
      const backup = bytes(`${this.path}.bak`)
      if (backup === undefined) throw new Error(`Invalid JSON at ${this.path}; preserve the file and restore a valid backup`)
      let recovered: T
      try { recovered = this.parse<T>(backup) }
      catch { throw new Error(`Invalid JSON and backup at ${this.path}; refusing to overwrite either`) }
      // Retain corrupt bytes for diagnosis, then restore only a valid backup.
      atomicWrite(`${this.path}.corrupt-${randomUUID()}`, text)
      try {
        this.unreadable = false
        this.write(recovered)
        return recovered
      } catch (error) {
        this.unreadable = true
        throw error
      }
    }
  }

  /** Reject predictable stale/busy writes before callers mutate live services. */
  assertWritable(): void {
    if (this.expected === undefined) this.read()
    if (this.unreadable) throw new Error(`Cannot overwrite unreadable state at ${this.path}`)
    if (existsSync(`${this.path}.lock`)) throw new Error(`Storage is busy at ${this.path}`)
    if (digest(bytes(this.path)) !== this.expected) {
      throw new Error(`Storage changed outside this Host: ${this.path}; reload before saving to avoid losing another writer's changes`)
    }
  }

  write(value: unknown): void {
    if (this.expected === undefined) this.read()
    if (this.unreadable) throw new Error(`Cannot overwrite unreadable state at ${this.path}`)
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
    const lock = `${this.path}.lock`
    let fd: number
    try { fd = openSync(lock, 'wx', 0o600) }
    catch { throw new Error(`Storage is busy at ${this.path}; retry after the other writer finishes (stale lock: ${lock})`) }
    try {
      writeFileSync(fd, `${process.pid}\n`)
      const current = bytes(this.path)
      const actual = digest(current)
      if (this.expected !== undefined && actual !== this.expected) {
        throw new Error(`Storage changed outside this Host: ${this.path}; reload before saving to avoid losing another writer's changes`)
      }
      const text = JSON.stringify(value, null, 2) + '\n'
      this.parse(text)
      // Only valid previous documents become backups. Never destroy the last
      // valid backup while recovering a corrupt primary.
      if (current !== undefined) {
        try { this.parse(current); atomicWrite(`${this.path}.bak`, current) } catch (error) {
          if (!(error instanceof SyntaxError)) throw error
        }
      }
      atomicWrite(this.path, text)
      this.expected = digest(text)
    } finally { closeSync(fd); unlinkSync(lock) }
  }
}

/** Each Profile owns its state. Legacy shared data is copied, never moved. */
export function resolvePluginStorage(home: string, profileDir?: string, profile = 'standalone'):
  { dataFile: string; secretsFile: string } {
  const dir = join(profileDir || join(home, 'profiles', profile), 'plugins', 'dsh-multi-device')
  const targets = { dataFile: join(dir, 'devices.json'), secretsFile: join(dir, 'secrets.json') }
  const legacy = [
    [targets.dataFile, join(home, 'plugins', 'dsh-multi-device.json')],
    [targets.secretsFile, join(home, 'plugins', 'dsh-multi-device-secrets.json')],
  ] as const
  for (const [target, source] of legacy) {
    if (existsSync(target) || !existsSync(source)) continue
    const sourceFile = new JsonSnapshotFile(source, value => value.version === 1 &&
      (target === targets.dataFile ? Array.isArray(value.devices) :
        typeof value.secrets === 'object' && value.secrets !== null && !Array.isArray(value.secrets)))
    const document = sourceFile.read<Record<string, unknown>>()
    if (document === undefined || document.version !== 1) throw new Error(`Unsupported legacy plugin state: ${source}`)
    if (target === targets.dataFile) document.hostId = randomUUID()
    const destination = new JsonSnapshotFile(target)
    if (destination.read() === undefined) destination.write(document)
  }
  return targets
}
