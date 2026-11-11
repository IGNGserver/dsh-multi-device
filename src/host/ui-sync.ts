/**
 * Passive controller-to-controller view-state files.
 *
 * Only Controllers install this plugin. Each Controller writes its own small
 * document into a connected remote's `$DSH_HOME/plugins/dsh-multi-device/views`
 * over the existing SSH transport; other Controllers reading the same remote
 * merge it. The remote never runs plugin code, never installs a daemon, and
 * only stores a bounded JSON file with fold/group/sort/archive-filter state.
 *
 * One file per Controller avoids read-modify-write races on a shared document.
 * Every field already carries an HLC, so a stale file cannot overwrite a newer
 * local observation.
 *
 * @module dsh-multi-device/host/ui-sync
 */

import { randomUUID } from 'node:crypto'
import type { UiScopeRecord, UiStateDocument } from './ui-state.ts'
import { parseUiStateDocument } from './ui-state.ts'

export interface UiSyncDocument {
  readonly version: 1
  readonly hostId: string
  readonly updatedAt: number
  readonly scopes: UiStateDocument['scopes']
}

export const UI_SYNC_VERSION = 1
export const UI_SYNC_SCOPE_LIMIT = 64

/** Directory under one remote DSH home. `dshHome` must be POSIX. */
export function uiSyncDir(dshHome: string): string {
  return `${dshHome.trim().replace(/\/+$/, '')}/plugins/dsh-multi-device/views`
}

/** Parse one Controller file; malformed content is ignored. */
export function parseUiSyncDocument(value: unknown): UiSyncDocument | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const raw = value as { version?: unknown; hostId?: unknown; updatedAt?: unknown }
  if (raw.version !== UI_SYNC_VERSION) return undefined
  if (typeof raw.hostId !== 'string' || !/^[A-Za-z0-9-]{1,80}$/.test(raw.hostId)) return undefined
  const scopes = parseUiStateDocument({ version: 1, scopes: (value as { scopes?: unknown }).scopes })
  if (scopes === undefined) return undefined
  return {
    version: UI_SYNC_VERSION,
    hostId: raw.hostId,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? Math.max(0, Math.trunc(raw.updatedAt)) : 0,
    scopes: scopes.scopes,
  }
}

/** Keep only remote-page scopes; the local page belongs to this Controller. */
export function collectRemoteScopes(scopes: ReadonlyMap<string, UiScopeRecord>): Record<string, UiScopeRecord> {
  const out: Record<string, UiScopeRecord> = {}
  let count = 0
  for (const [scope, record] of scopes) {
    if (count >= UI_SYNC_SCOPE_LIMIT) break
    if (!scope.startsWith('remote:')) continue
    out[scope] = record
    count += 1
  }
  return out
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

/** Read every Controller file from one directory; a missing directory is empty. */
export function buildReadUiSyncCommand(dir: string): string {
  const quoted = shellQuote(dir)
  return `if [ -d ${quoted} ]; then for f in ${quoted}/*.json; do [ -f "$f" ] || continue; cat "$f"; printf '\\036'; done; fi`
}

/** Atomically write this Controller's file; never touches another host's file. */
export function buildWriteUiSyncCommand(dir: string, hostId: string, scopes: Record<string, UiScopeRecord>): string {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(hostId)) throw new Error('Invalid UI-sync Host id')
  const document: UiSyncDocument = {
    version: UI_SYNC_VERSION,
    hostId,
    updatedAt: Date.now(),
    scopes,
  }
  const text = JSON.stringify(document)
  const encoded = Buffer.from(text, 'utf8').toString('base64')
  const path = `${dir}/${hostId}.json`
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
