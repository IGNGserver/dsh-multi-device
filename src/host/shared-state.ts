/**
 * Optional cross-Host read-state file.
 *
 * A single DSH Host already shares unread state with every browser attached to
 * it. When the same user runs DSH on several machines, each Host has its own
 * data file, so this module lets every Host publish a tiny section into each
 * remote device's DSH home over the existing SSH transport. Sessions IDs and
 * timestamps only; message bodies never leave the device.
 *
 * The file is Host-versioned and merges per Session by the newest `at`
 * timestamp (reads win ties), which makes concurrent Hosts converge instead of
 * treating the last writer as authoritative for every Session.
 *
 * @module dsh-multi-device/host/shared-state
 */

import { randomUUID } from 'node:crypto'

export interface SharedReadEntry {
  readonly unread: boolean
  readonly at: number
}

export interface SharedReadHostSection {
  readonly updatedAt: number
  readonly sessions: Record<string, SharedReadEntry>
}

export interface SharedReadDocument {
  readonly version: 1
  readonly hosts: Record<string, SharedReadHostSection>
}

export const SHARED_READ_STATE_VERSION = 1
/** One pushed section stays far below the SSH command-line limit. */
export const SHARED_READ_SECTION_LIMIT = 300
export const SHARED_READ_HOST_LIMIT = 20

function validEntry(value: unknown): SharedReadEntry | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const entry = value as { unread?: unknown; at?: unknown }
  if (typeof entry.unread !== 'boolean') return undefined
  if (typeof entry.at !== 'number' || !Number.isFinite(entry.at)) return undefined
  return { unread: entry.unread, at: Math.max(0, Math.trunc(entry.at)) }
}

function validSessions(value: unknown): Record<string, SharedReadEntry> {
  const out: Record<string, SharedReadEntry> = {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return out
  let count = 0
  for (const [sessionId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (count >= SHARED_READ_SECTION_LIMIT) break
    if (sessionId === '' || sessionId.length > 512) continue
    if (sessionId === '__proto__' || sessionId === 'constructor' || sessionId === 'prototype') continue
    const entry = validEntry(raw)
    if (entry !== undefined) {
      out[sessionId] = entry
      count += 1
    }
  }
  return out
}

/** Parse and bound a state file; malformed content is ignored, never thrown. */
export function parseSharedReadDocument(text: string): SharedReadDocument | undefined {
  if (text.trim() === '') return undefined
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    // Read commands frame whole JSON documents, including pretty legacy files.
    const parts = text.includes('\u001e') ? text.split('\u001e') : text.split(/\r?\n/)
    const hosts: Record<string, SharedReadHostSection> = {}
    let valid = false
    for (const part of parts) {
      if (part.trim() === '') continue
      let document: SharedReadDocument | undefined
      try {
        // Parse each frame once; do not recursively split malformed fragments.
        const candidate = JSON.parse(part) as unknown
        document = parseSharedReadDocument(JSON.stringify(candidate))
      } catch { continue }
      if (document === undefined) continue
      valid = true
      for (const [id, section] of Object.entries(document.hosts)) {
        if (hosts[id] === undefined && Object.keys(hosts).length >= SHARED_READ_HOST_LIMIT) continue
        if (hosts[id] === undefined || section.updatedAt >= hosts[id].updatedAt) hosts[id] = section
      }
    }
    return valid ? { version: 1, hosts } : undefined
  }
  if (typeof raw !== 'object' || raw === null) return undefined
  const doc = raw as { version?: unknown; hosts?: unknown }
  if (doc.version !== SHARED_READ_STATE_VERSION) return undefined
  if (typeof doc.hosts !== 'object' || doc.hosts === null || Array.isArray(doc.hosts)) return undefined
  const hosts: Record<string, SharedReadHostSection> = {}
  let hostCount = 0
  for (const [hostId, rawSection] of Object.entries(doc.hosts as Record<string, unknown>)) {
    if (hostCount >= SHARED_READ_HOST_LIMIT) break
    if (hostId === '' || hostId.length > 80) continue
    if (hostId === '__proto__' || hostId === 'constructor' || hostId === 'prototype') continue
    if (typeof rawSection !== 'object' || rawSection === null) continue
    const section = rawSection as { updatedAt?: unknown; sessions?: unknown }
    const updatedAt = typeof section.updatedAt === 'number' && Number.isFinite(section.updatedAt)
      ? Math.max(0, Math.trunc(section.updatedAt))
      : 0
    hosts[hostId] = { updatedAt, sessions: validSessions(section.sessions) }
    hostCount += 1
  }
  return { version: SHARED_READ_STATE_VERSION, hosts }
}

/**
 * Merge every Host section into the local Session map.
 *
 * Newest `at` wins; a read at the same instant wins over unread so two Hosts
 * clearing the same completion cannot resurrect the dot.
 */
export function mergeSharedReadEntries(
  local: Readonly<Record<string, SharedReadEntry>>,
  doc: SharedReadDocument,
): Record<string, SharedReadEntry> {
  const merged: Record<string, SharedReadEntry> = { ...local }
  for (const section of Object.values(doc.hosts)) {
    for (const [sessionId, remote] of Object.entries(section.sessions)) {
      const current = merged[sessionId]
      if (
        current === undefined ||
        remote.at > current.at ||
        (remote.at === current.at && current.unread && !remote.unread)
      ) {
        merged[sessionId] = remote
      }
    }
  }
  return merged
}

/**
 * Write this Host's section while preserving every other Host's section.
 * Entries are capped by recency so the SSH command stays bounded.
 */
export function buildSharedReadDocument(
  existing: SharedReadDocument | undefined,
  hostId: string,
  sessions: Readonly<Record<string, SharedReadEntry>>,
  now: number,
): SharedReadDocument {
  const ordered = Object.entries(sessions)
    .sort((left, right) => right[1].at - left[1].at)
    .slice(0, SHARED_READ_SECTION_LIMIT)
  const ownSessions = Object.fromEntries(ordered)
  const hosts: Record<string, SharedReadHostSection> = {
    [hostId]: { updatedAt: now, sessions: ownSessions },
  }
  // Preserve peers, newest first, but keep the whole JSON well below the
  // per-argument SSH limit even if many Hosts share one device.
  let remaining = 600 - Object.keys(ownSessions).length
  const peers = Object.entries(existing?.hosts ?? {})
    .filter(([id]) => id !== hostId)
    .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    .slice(0, SHARED_READ_HOST_LIMIT)
  for (const [id, section] of peers) {
    if (remaining <= 0) break
    const peerSessions: Record<string, SharedReadEntry> = {}
    const entries = Object.entries(section.sessions)
      .sort((left, right) => right[1].at - left[1].at)
      .slice(0, remaining)
    for (const [sessionId, entry] of entries) {
      peerSessions[sessionId] = entry
      remaining -= 1
    }
    hosts[id] = { updatedAt: section.updatedAt, sessions: peerSessions }
  }
  return { version: SHARED_READ_STATE_VERSION, hosts }
}

/** True for a POSIX DSH home path the plugin can address through `sh`. */
export function isPosixRemoteHome(remoteHome: string | undefined): boolean {
  if (remoteHome === undefined) return false
  const trimmed = remoteHome.trim()
  if (trimmed === '' || trimmed.includes('\0')) return false
  if (!trimmed.startsWith('/')) return false
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) return false
  if (trimmed.startsWith('\\\\') || trimmed.startsWith('%') || trimmed.startsWith('~')) return false
  return true
}

/** Path under the remote DSH home. `remoteHome` must be non-empty POSIX. */
export function sharedReadStatePath(remoteHome: string): string {
  const base = remoteHome.trim().replace(/\/+$/, '')
  return `${base}/plugins/dsh-multi-device/read-state.json`
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

/** Read command; a missing file is an empty document, not a failure. */
export function buildReadSharedStateCommand(path: string): string {
  return `if [ -f ${shellQuote(path)} ]; then cat ${shellQuote(path)}; printf '\\036'; fi; for f in ${shellQuote(`${path}.hosts`)}/*.json; do [ -f "$f" ] || continue; cat "$f"; printf '\\036'; done`
}

/** Atomic write through a sibling temp file, with GNU/BSD base64 fallback. */
export function buildWriteSharedStateCommand(path: string, document: SharedReadDocument, hostId?: string): string {
  // Concurrent Hosts never replace one shared read/merge/write snapshot. Each
  // owns one atomic file; readers merge the independent documents (plus legacy).
  if (hostId !== undefined) {
    if (!/^[A-Za-z0-9-]{1,80}$/.test(hostId)) throw new Error('Invalid shared state Host id')
    path = `${path}.hosts/${hostId}.json`
    document = { version: 1, hosts: { [hostId]: document.hosts[hostId] ?? { updatedAt: 0, sessions: {} } } }
  }
  const text = JSON.stringify(document)
  const encoded = Buffer.from(text, 'utf8').toString('base64')
  const slash = path.lastIndexOf('/')
  const dir = slash > 0 ? path.slice(0, slash) : '.'
  const tmp = `${path}.${randomUUID()}.tmp`
  const script = [
    `set -e; umask 077; mkdir -p ${shellQuote(dir)}`,
    `trap 'rm -f ${shellQuote(tmp).replaceAll("'", "'\\''")}' EXIT HUP INT TERM`,
    `if printf %s ${shellQuote(encoded)} | base64 -d > ${shellQuote(tmp)} 2>/dev/null; then`,
    `  mv -f ${shellQuote(tmp)} ${shellQuote(path)}`,
    'else',
    `  printf %s ${shellQuote(encoded)} | base64 -D > ${shellQuote(tmp)} && mv -f ${shellQuote(tmp)} ${shellQuote(path)}`,
    'fi',
  ].join('\n')
  return `sh -c ${shellQuote(script)}`
}
