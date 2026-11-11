/**
 * Host-owned sidebar view state.
 *
 * DSH persists `groupExpansion`/`groupBy`/`orderBy`/`archivedFilter` in each
 * browser origin's localStorage. That makes the same Host look different in
 * two browsers, and the same remote device look different in two Controllers.
 * This module keeps one presentation record per scope in the plugin Host:
 *
 * - `local` is this Host's own DSH page (applied by the client entry).
 * - `remote:<key>` is one remote device page (applied by the injected bridge).
 *
 * Scope keys use the transport identity, not the per-Controller device ID, so
 * two Controllers that point at the same SSH host converge without sharing a
 * random local ID. Records are last-writer-wins per field with a compact HLC;
 * wall-clock skew therefore cannot resurrect an older fold state. Nothing here
 * contains Session bodies, workspace paths, or credentials.
 *
 * @module dsh-multi-device/host/ui-state
 */

import {
  sanitizeWorkspaceViewState,
  type WorkspaceArchivedFilter,
  type WorkspaceGroupBy,
  type WorkspaceOrderBy,
  type WorkspaceViewState,
} from '../contract.ts'

export interface UiField<T> {
  readonly value: T
  /** Hybrid logical clock: fixed-width wall ms, counter, Host id. */
  readonly at: string
}

export interface UiScopeRecord {
  readonly groups: Record<string, UiField<boolean>>
  readonly groupBy?: UiField<WorkspaceGroupBy>
  readonly orderBy?: UiField<WorkspaceOrderBy>
  readonly archivedFilter?: UiField<WorkspaceArchivedFilter>
}

export interface UiStateDocument {
  readonly version: 1
  readonly scopes: Record<string, UiScopeRecord>
}

export const UI_STATE_VERSION = 1
export const UI_SCOPE_LIMIT = 64
export const UI_GROUP_LIMIT = 1_000
const HLC_PATTERN = /^\d{16}:\d{6}:[A-Za-z0-9_-]{1,80}$/

/** Fixed-width HLC; string order is causal order for a fixed Host id length. */
export function formatHlc(ms: number, counter: number, hostId: string): string {
  return `${Math.max(0, Math.trunc(ms)).toString().padStart(16, '0')}:${Math.max(0, Math.trunc(counter)).toString().padStart(6, '0')}:${hostId}`
}

export function isHlc(value: unknown): value is string {
  return typeof value === 'string' && HLC_PATTERN.test(value)
}

/** Monotonic HLC source; `observe` folds a remote clock into the local one. */
export class HlcClock {
  private ms = 0
  private counter = 0
  constructor(private readonly hostId: string) {}

  next(now = Date.now()): string {
    const wall = Math.max(0, Math.trunc(now))
    if (wall > this.ms) {
      this.ms = wall
      this.counter = 0
    } else {
      this.counter += 1
    }
    return formatHlc(this.ms, this.counter, this.hostId)
  }

  observe(value: unknown): void {
    if (!isHlc(value)) return
    const [rawMs, rawCounter] = value.split(':')
    const ms = Number(rawMs)
    const counter = Number(rawCounter)
    if (!Number.isFinite(ms) || !Number.isFinite(counter)) return
    if (ms > this.ms || (ms === this.ms && counter > this.counter)) {
      this.ms = ms
      this.counter = counter
    }
  }
}

function validScopeKey(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value.length <= 256 &&
    value !== '__proto__' && value !== 'constructor' && value !== 'prototype'
}

function field<T>(value: unknown, at: unknown, isValid: (candidate: unknown) => candidate is T): UiField<T> | undefined {
  return isValid(value) && isHlc(at) ? { value, at } : undefined
}

function sanitizeRecord(value: unknown): UiScopeRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const groups: Record<string, UiField<boolean>> = {}
  if (typeof raw.groups === 'object' && raw.groups !== null && !Array.isArray(raw.groups)) {
    let count = 0
    for (const [key, entry] of Object.entries(raw.groups as Record<string, unknown>)) {
      if (count >= UI_GROUP_LIMIT) break
      if (!validScopeKey(key)) continue
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
      const group = entry as { value?: unknown; at?: unknown }
      const parsed = field(group.value, group.at, (candidate): candidate is boolean => typeof candidate === 'boolean')
      if (parsed === undefined) continue
      groups[key] = parsed
      count += 1
    }
  }
  const groupBy = field(raw.groupBy && typeof raw.groupBy === 'object' ? (raw.groupBy as { value?: unknown }).value : undefined,
    raw.groupBy && typeof raw.groupBy === 'object' ? (raw.groupBy as { at?: unknown }).at : undefined,
    (candidate): candidate is WorkspaceGroupBy => candidate === 'workspace' || candidate === 'flat' || candidate === 'workspace-tree')
  const orderBy = field(raw.orderBy && typeof raw.orderBy === 'object' ? (raw.orderBy as { value?: unknown }).value : undefined,
    raw.orderBy && typeof raw.orderBy === 'object' ? (raw.orderBy as { at?: unknown }).at : undefined,
    (candidate): candidate is WorkspaceOrderBy => candidate === 'updated' || candidate === 'manual')
  const archivedFilter = field(raw.archivedFilter && typeof raw.archivedFilter === 'object' ? (raw.archivedFilter as { value?: unknown }).value : undefined,
    raw.archivedFilter && typeof raw.archivedFilter === 'object' ? (raw.archivedFilter as { at?: unknown }).at : undefined,
    (candidate): candidate is WorkspaceArchivedFilter => candidate === 'default' || candidate === 'show' || candidate === 'only')
  return {
    groups,
    ...(groupBy === undefined ? {} : { groupBy }),
    ...(orderBy === undefined ? {} : { orderBy }),
    ...(archivedFilter === undefined ? {} : { archivedFilter }),
  }
}

/** Parse a persisted/wire document; malformed content is ignored, never thrown. */
export function parseUiStateDocument(value: unknown): UiStateDocument | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const raw = value as { version?: unknown; scopes?: unknown }
  if (raw.version !== UI_STATE_VERSION) return undefined
  if (typeof raw.scopes !== 'object' || raw.scopes === null || Array.isArray(raw.scopes)) return undefined
  const scopes: Record<string, UiScopeRecord> = {}
  let count = 0
  for (const [key, entry] of Object.entries(raw.scopes as Record<string, unknown>)) {
    if (count >= UI_SCOPE_LIMIT) break
    if (!validScopeKey(key)) continue
    const record = sanitizeRecord(entry)
    if (record === undefined) continue
    if (Object.keys(record.groups).length === 0 && record.groupBy === undefined &&
        record.orderBy === undefined && record.archivedFilter === undefined) continue
    scopes[key] = record
    count += 1
  }
  return { version: UI_STATE_VERSION, scopes }
}

/** Convert one record to the browser-facing shape. */
export function uiScopeState(record: UiScopeRecord | undefined): WorkspaceViewState | undefined {
  if (record === undefined) return undefined
  const groups: Record<string, boolean> = {}
  for (const [key, entry] of Object.entries(record.groups)) groups[key] = entry.value
  return {
    groups,
    ...(record.groupBy === undefined ? {} : { groupBy: record.groupBy.value }),
    ...(record.orderBy === undefined ? {} : { orderBy: record.orderBy.value }),
    ...(record.archivedFilter === undefined ? {} : { archivedFilter: record.archivedFilter.value }),
  }
}

function newer<T>(left: UiField<T> | undefined, right: UiField<T> | undefined): UiField<T> | undefined {
  if (left === undefined) return right
  if (right === undefined) return left
  return right.at > left.at ? right : left
}

/** Merge per field so two browsers folding different workspaces both survive. */
export function mergeUiScope(
  local: UiScopeRecord | undefined,
  remote: UiScopeRecord | undefined,
): UiScopeRecord | undefined {
  if (local === undefined) return remote
  if (remote === undefined) return local
  const groups: Record<string, UiField<boolean>> = { ...local.groups }
  for (const [key, entry] of Object.entries(remote.groups)) {
    groups[key] = newer(groups[key], entry)!
  }
  const groupBy = newer(local.groupBy, remote.groupBy)
  const orderBy = newer(local.orderBy, remote.orderBy)
  const archivedFilter = newer(local.archivedFilter, remote.archivedFilter)
  return {
    groups,
    ...(groupBy === undefined ? {} : { groupBy }),
    ...(orderBy === undefined ? {} : { orderBy }),
    ...(archivedFilter === undefined ? {} : { archivedFilter }),
  }
}

/** Apply a browser report, stamping every changed field with a fresh HLC. */
export function patchUiScope(
  record: UiScopeRecord | undefined,
  patch: WorkspaceViewState,
  clock: HlcClock,
): UiScopeRecord {
  const next: UiScopeRecord = record === undefined
    ? { groups: {} }
    : { groups: { ...record.groups }, ...(record.groupBy === undefined ? {} : { groupBy: record.groupBy }),
        ...(record.orderBy === undefined ? {} : { orderBy: record.orderBy }),
        ...(record.archivedFilter === undefined ? {} : { archivedFilter: record.archivedFilter }) }
  let groups = next.groups
  for (const [key, expanded] of Object.entries(patch.groups)) {
    if (Object.keys(groups).length >= UI_GROUP_LIMIT && groups[key] === undefined) break
    if (groups[key]?.value === expanded) continue
    groups[key] = { value: expanded, at: clock.next() }
  }
  let groupBy = next.groupBy
  let orderBy = next.orderBy
  let archivedFilter = next.archivedFilter
  if (patch.groupBy !== undefined && patch.groupBy !== groupBy?.value) {
    groupBy = { value: patch.groupBy, at: clock.next() }
  }
  if (patch.orderBy !== undefined && patch.orderBy !== orderBy?.value) {
    orderBy = { value: patch.orderBy, at: clock.next() }
  }
  if (patch.archivedFilter !== undefined && patch.archivedFilter !== archivedFilter?.value) {
    archivedFilter = { value: patch.archivedFilter, at: clock.next() }
  }
  const out: UiScopeRecord = {
    groups,
    ...(groupBy === undefined ? {} : { groupBy }),
    ...(orderBy === undefined ? {} : { orderBy }),
    ...(archivedFilter === undefined ? {} : { archivedFilter }),
  }
  return out
}

/** Stable scope key for one remote device; transport identity, not local ID. */
export function remoteUiScopeKey(transport: {
  readonly kind: 'ssh' | 'direct'
  readonly host?: string
  readonly username?: string
  readonly port?: number
  readonly baseUrl?: string
}): string {
  if (transport.kind === 'ssh') {
    const host = (transport.host ?? '').trim().toLowerCase()
    const user = (transport.username ?? '').trim().toLowerCase()
    return `remote:ssh:${user}@${host}:${transport.port ?? 22}`
  }
  try {
    const url = new URL(transport.baseUrl ?? '')
    return `remote:http:${url.protocol}//${url.host}`
  } catch {
    return `remote:http:${(transport.baseUrl ?? '').trim().toLowerCase()}`
  }
}

/** Normalize a browser patch without throwing. */
export function parseUiStatePatch(value: unknown): WorkspaceViewState | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const parsed = sanitizeWorkspaceViewState(value)
  return parsed
}
