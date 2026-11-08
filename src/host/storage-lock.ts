/** Conservative process-owned lock files with dead-local-owner recovery. */
import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { open, readFile, rename, unlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { hostname } from 'node:os'

interface LockMetadata {
  readonly version: 1
  readonly pid: number
  readonly hostname: string
  readonly owner: string
  readonly createdAt: number
}
export interface StorageLockLease { readonly owner: string; release(): void }
export interface AsyncStorageLockLease { readonly owner: string; release(): Promise<void> }

function metadata(owner = randomUUID()): LockMetadata {
  return { version: 1, pid: process.pid, hostname: hostname(), owner, createdAt: Date.now() }
}
function serialize(value: LockMetadata): string { return JSON.stringify(value) }
function parse(text: string): LockMetadata | undefined {
  try {
    const value = JSON.parse(text) as Partial<LockMetadata>
    if (value.version !== 1 || !Number.isSafeInteger(value.pid) || value.pid! <= 0 ||
      typeof value.hostname !== 'string' || typeof value.owner !== 'string' || value.owner.length < 8 ||
      !Number.isFinite(value.createdAt)) return undefined
    return value as LockMetadata
  } catch { return undefined }
}
function deadLocalOwner(value: LockMetadata | undefined): boolean {
  if (value === undefined || value.hostname !== hostname()) return false
  try { process.kill(value.pid, 0); return false }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH' }
}
function readSync(path: string): LockMetadata | undefined | null {
  try { return parse(readFileSync(path, 'utf8')) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; return undefined }
}
async function readAsync(path: string): Promise<LockMetadata | undefined | null> {
  try { return parse(await readFile(path, 'utf8')) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; return undefined }
}
function removeIfOwnerSync(path: string, owner: string): void {
  if (readSync(path)?.owner !== owner) return
  try { unlinkSync(path) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}
async function removeIfOwnerAsync(path: string, owner: string): Promise<void> {
  if ((await readAsync(path))?.owner !== owner) return
  try { await unlink(path) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}
function openSyncLease(path: string): StorageLockLease {
  const owner = randomUUID()
  const fd = openSync(path, 'wx', 0o600)
  try { writeFileSync(fd, serialize(metadata(owner))); fsyncSync(fd) }
  catch (error) {
    try { closeSync(fd) } finally { removeIfOwnerSync(path, owner) }
    throw error
  }
  return { owner, release: () => { try { closeSync(fd) } finally { removeIfOwnerSync(path, owner) } } }
}
async function openAsyncLease(path: string): Promise<AsyncStorageLockLease> {
  const owner = randomUUID()
  const handle: FileHandle = await open(path, 'wx', 0o600)
  try { await handle.writeFile(serialize(metadata(owner))); await handle.sync() }
  catch (error) {
    try { await handle.close() } finally { await removeIfOwnerAsync(path, owner) }
    throw error
  }
  return { owner, release: async () => { try { await handle.close() } finally { await removeIfOwnerAsync(path, owner) } } }
}

/** Rename a confirmed dead local lock aside; invalid/remote/alive files remain untouched. */
function recoverDeadLocalSync(path: string): boolean {
  const current = readSync(path)
  if (current === null) return true
  if (!deadLocalOwner(current)) return false
  const quarantine = `${path}.stale-${randomUUID()}`
  try { renameSync(path, quarantine) }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' }
  try { unlinkSync(quarantine) } catch { /* Diagnosable residue does not relock the primary path. */ }
  return true
}
async function recoverDeadLocalAsync(path: string): Promise<boolean> {
  const current = await readAsync(path)
  if (current === null) return true
  if (!deadLocalOwner(current)) return false
  const quarantine = `${path}.stale-${randomUUID()}`
  try { await rename(path, quarantine) }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' }
  try { await unlink(quarantine) } catch { /* Best-effort quarantine cleanup. */ }
  return true
}
function recoveryGuardSync(lock: string): StorageLockLease | undefined {
  const path = `${lock}.recovery`
  try { return openSyncLease(path) } catch { /* Try a dead guard once below. */ }
  if (!recoverDeadLocalSync(path)) return undefined
  try { return openSyncLease(path) } catch { return undefined }
}
async function recoveryGuardAsync(lock: string): Promise<AsyncStorageLockLease | undefined> {
  const path = `${lock}.recovery`
  try { return await openAsyncLease(path) } catch { /* Try a dead guard once below. */ }
  if (!(await recoverDeadLocalAsync(path))) return undefined
  try { return await openAsyncLease(path) } catch { return undefined }
}
function recoverWithGuardSync(lock: string): boolean {
  const guard = recoveryGuardSync(lock)
  if (guard === undefined) return false
  try { return recoverDeadLocalSync(lock) } finally { guard.release() }
}
async function recoverWithGuardAsync(lock: string): Promise<boolean> {
  const guard = await recoveryGuardAsync(lock)
  if (guard === undefined) return false
  try { return await recoverDeadLocalAsync(lock) } finally { await guard.release() }
}
function busy(path: string): Error { return new Error(`Storage is busy at ${path}; retry after the other writer finishes`) }

export function acquireStorageLock(path: string): StorageLockLease {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return openSyncLease(path) } catch { /* Recover only a confirmed stale owner. */ }
    if (!recoverWithGuardSync(path)) throw busy(path)
  }
  throw busy(path)
}
export async function acquireStorageLockAsync(path: string): Promise<AsyncStorageLockLease> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return await openAsyncLease(path) } catch { /* Recover only a confirmed stale owner. */ }
    if (!(await recoverWithGuardAsync(path))) throw busy(path)
  }
  throw busy(path)
}
export function assertStorageLockAvailable(path: string): void {
  if (!existsSync(path)) return
  if (!recoverWithGuardSync(path)) throw busy(path)
}
export async function assertStorageLockAvailableAsync(path: string): Promise<void> {
  if (!existsSync(path)) return
  if (!(await recoverWithGuardAsync(path))) throw busy(path)
}
