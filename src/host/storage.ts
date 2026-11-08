/** Durable JSON snapshots: atomic replacement, stale-writer refusal, and async I/O variants. */
import { createHash, randomUUID, webcrypto } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { acquireStorageLock, acquireStorageLockAsync, assertStorageLockAvailable, assertStorageLockAvailableAsync } from './storage-lock.ts'

function bytes(path: string): string | undefined {
  try { return readFileSync(path, 'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
}
function digest(text: string | undefined): string {
  return text === undefined ? 'missing' : createHash('sha256').update(text).digest('hex')
}
async function bytesAsync(path: string): Promise<string | undefined> {
  try { return await readFile(path, 'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
}
async function digestAsync(text: string | undefined): Promise<string> {
  if (text === undefined) return 'missing'
  const hash = await webcrypto.subtle.digest('SHA-256', Buffer.from(text, 'utf8'))
  return Buffer.from(hash).toString('hex')
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

export async function atomicWriteAsync(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temp = `${path}.${randomUUID()}.tmp`
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(temp, 'wx', 0o600)
    await handle.writeFile(text)
    await handle.sync()
    await handle.close(); handle = undefined
    await rename(temp, path)
    try { const directory = await open(dirname(path), 'r'); try { await directory.sync() } finally { await directory.close() } } catch { /* platform */ }
  } finally {
    if (handle !== undefined) await handle.close().catch(() => {})
    await rm(temp, { force: true }).catch(() => {})
  }
}

export class JsonSnapshotFile {
  private expected: string | undefined
  private unreadable = false
  private pendingWrites: Promise<void> = Promise.resolve()
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
    assertStorageLockAvailable(`${this.path}.lock`)
    if (digest(bytes(this.path)) !== this.expected) {
      throw new Error(`Storage changed outside this Host: ${this.path}; reload before saving to avoid losing another writer's changes`)
    }
  }

  write(value: unknown): void {
    if (this.expected === undefined) this.read()
    if (this.unreadable) throw new Error(`Cannot overwrite unreadable state at ${this.path}`)
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
    const lease = acquireStorageLock(`${this.path}.lock`)
    try {
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
    } finally { lease.release() }
  }

  /** Async reads wait for earlier writes on this instance before refreshing CAS state. */
  async readAsync<T>(): Promise<T | undefined> {
    await this.pendingWrites
    return await this.readAsyncNow<T>()
  }

  private async readAsyncNow<T>(): Promise<T | undefined> {
    this.unreadable = true
    const text = await bytesAsync(this.path)
    this.expected = await digestAsync(text)
    this.unreadable = false
    if (text === undefined) return undefined
    try { return this.parse<T>(text) }
    catch {
      this.unreadable = true
      const backup = await bytesAsync(`${this.path}.bak`)
      if (backup === undefined) throw new Error(`Invalid JSON at ${this.path}; preserve the file and restore a valid backup`)
      let recovered: T
      try { recovered = this.parse<T>(backup) }
      catch { throw new Error(`Invalid JSON and backup at ${this.path}; refusing to overwrite either`) }
      await atomicWriteAsync(`${this.path}.corrupt-${randomUUID()}`, text)
      try {
        this.unreadable = false
        await this.writeAsyncNow(recovered)
        return recovered
      } catch (error) {
        this.unreadable = true
        throw error
      }
    }
  }

  async assertWritableAsync(): Promise<void> {
    await this.pendingWrites
    if (this.expected === undefined) await this.readAsyncNow()
    if (this.unreadable) throw new Error(`Cannot overwrite unreadable state at ${this.path}`)
    await assertStorageLockAvailableAsync(`${this.path}.lock`)
    if (await digestAsync(await bytesAsync(this.path)) !== this.expected) {
      throw new Error(`Storage changed outside this Host: ${this.path}; reload before saving to avoid losing another writer's changes`)
    }
  }

  /** Serialize asynchronous writes per file; the CAS comparison remains inside the lease. */
  writeAsync(value: unknown): Promise<void> {
    const operation = this.pendingWrites.then(async () => await this.writeAsyncNow(value))
    this.pendingWrites = operation.catch(() => {})
    return operation
  }

  private async writeAsyncNow(value: unknown): Promise<void> {
    if (this.expected === undefined) await this.readAsyncNow()
    if (this.unreadable) throw new Error(`Cannot overwrite unreadable state at ${this.path}`)
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
    const lease = await acquireStorageLockAsync(`${this.path}.lock`)
    try {
      const current = await bytesAsync(this.path)
      const actual = await digestAsync(current)
      if (this.expected !== undefined && actual !== this.expected) {
        throw new Error(`Storage changed outside this Host: ${this.path}; reload before saving to avoid losing another writer's changes`)
      }
      const text = JSON.stringify(value, null, 2) + '\n'
      this.parse(text)
      if (current !== undefined) {
        try { this.parse(current); await atomicWriteAsync(`${this.path}.bak`, current) } catch (error) {
          if (!(error instanceof SyntaxError)) throw error
        }
      }
      await atomicWriteAsync(this.path, text)
      this.expected = await digestAsync(text)
    } finally { await lease.release() }
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
