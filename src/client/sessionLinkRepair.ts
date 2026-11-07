/**
 * Repair the link between aggregated Workspace rows and the browser's Session
 * store.
 *
 * The sidebar renders a Workspace's children from the Session ids carried by
 * the projected row and **silently skips every id it has no summary for**. A
 * device that finishes its SSH handshake after the browser fetched
 * `session.list` therefore leaves its Workspaces visible but childless — the
 * "expanded, but no conversations" report.
 *
 * The Host already replays remote summaries, but that replay is an event and
 * events can be lost (a reconnected `$events` stream, a transport that started
 * before the replay, another plugin observing the same bus). This module adds
 * the missing second path: observe the projection against the live Session
 * store and, while ids are missing, ask DSH to refetch `session.list` — the
 * Host patches that call to merge every remote device, so one successful fetch
 * heals the whole generation.
 *
 * @module dsh-multi-device/client/sessionLinkRepair
 */
import { decodeSessionId, LOCAL_DEVICE_ID } from '../contract.ts'

/** Ids a Workspace row points at that the Session store cannot resolve. */
export interface SessionLinkGap {
  /** Distinct Session ids referenced by the current Workspace projection. */
  readonly referenced: number
  /** Referenced ids with no summary in the browser's Session store. */
  readonly missing: number
  /** Missing ids per owning device (`local` for plain local ids). */
  readonly byDevice: Readonly<Record<string, number>>
  /** First few missing ids, for the Diagnostics report only. */
  readonly sample: readonly string[]
}

/** What the Diagnostics panel reports about the repair loop. */
export interface SessionLinkReport extends SessionLinkGap {
  /** Epoch ms of the last check. */
  readonly checkedAt: number
  /** Connected devices at the last check. */
  readonly connectedDevices: number
  /** Refreshes attempted in the current repair budget. */
  readonly attempts: number
  /** Epoch ms of the last attempted `sessions.refresh()`. */
  readonly refreshedAt?: number
  /** Last `sessions.refresh()` failure, kept so Diagnostics can show it. */
  readonly lastError?: string
  /** Whether the last check found every referenced id resolvable. */
  readonly resolved: boolean
  /**
   * The initial backoff budget is spent but ids are still missing: the loop
   * now retries at the persistent interval. Surfaced so the UI can tell
   * "healing soon" apart from "silently broken".
   */
  readonly exhausted: boolean
}

/** Injectable side effects so the loop is testable without a browser. */
export interface SessionLinkRepairDeps {
  /** Compute the current gap from the projection and the Session store. */
  computeGap(): SessionLinkGap
  /** Whether a refresh can help right now (Aggregated Mode with a live device). */
  canRepair(): { readonly ok: boolean; readonly connectedDevices: number }
  /** Re-run DSH's `session.list` fetch. */
  refresh(): Promise<void>
}

export interface SessionLinkRepairOptions {
  /** Delays between attempts. The length is the initial attempt budget. */
  readonly delaysMs?: readonly number[]
  /**
   * After the initial budget is spent, keep retrying at this interval instead
   * of giving up silently. A lost replay used to leave Workspaces empty until
   * the next device-state change; a persistent slow retry heals them no
   * matter when the Host finally projects the missing summaries.
   */
  readonly persistentRetryMs?: number
  /** How many missing ids to keep in the report sample. */
  readonly maxSample?: number
  readonly setTimeoutFn?: (fn: () => void, ms: number) => unknown
  readonly clearTimeoutFn?: (handle: unknown) => void
  readonly now?: () => number
  /** Called after every check so the UI can react (diagnostics, toasts). */
  readonly onReport?: (report: SessionLinkReport) => void
}

/** Backoff for a store that keeps answering with the same incomplete list. */
export const DEFAULT_REPAIR_DELAYS_MS: readonly number[] = [400, 1_500, 4_000, 10_000, 20_000]

/**
 * Compute the gap between a Workspace projection and the Session store.
 *
 * Archived Sessions stay in the store, and subagent children never render as
 * rows, so both are excluded from the referenced set before the comparison.
 */
export function computeSessionLinkGap(
  workspaces: readonly { readonly sessionIds: readonly string[] }[],
  knownSessionIds: ReadonlySet<string> | Iterable<string>,
  options: { readonly excludedSessionIds?: ReadonlySet<string>; readonly maxSample?: number } = {},
): SessionLinkGap {
  const known = knownSessionIds instanceof Set ? knownSessionIds : new Set(knownSessionIds)
  const excluded = options.excludedSessionIds
  const referenced = new Set<string>()
  const missingByDevice: Record<string, number> = {}
  const sample: string[] = []
  let missing = 0

  for (const workspace of workspaces) {
    for (const sessionId of workspace.sessionIds) {
      if (referenced.has(sessionId)) continue
      referenced.add(sessionId)
      if (excluded?.has(sessionId) === true) continue
      if (known.has(sessionId)) continue
      missing += 1
      const decoded = decodeSessionId(sessionId)
      const deviceKey = String(decoded.deviceId)
      missingByDevice[deviceKey] = (missingByDevice[deviceKey] ?? 0) + 1
      if (sample.length < (options.maxSample ?? 8)) sample.push(sessionId)
    }
  }

  return {
    referenced: referenced.size,
    missing,
    byDevice: missingByDevice,
    sample,
  }
}

/**
 * Watch the projection and keep asking DSH to refetch while ids are missing.
 *
 * One instance per browser generation. `noteChange()` is cheap and idempotent:
 * it only schedules work when the previous attempt finished or none is pending,
 * so a busy `$events` stream cannot turn the repair into a refresh storm.
 */
export class SessionLinkRepair {
  private readonly delays: readonly number[]
  private readonly persistentRetryMs: number
  private readonly maxSample: number
  private readonly setTimeoutFn: (fn: () => void, ms: number) => unknown
  private readonly clearTimeoutFn: (handle: unknown) => void
  private readonly now: () => number
  private readonly onReport: ((report: SessionLinkReport) => void) | undefined

  private attempts = 0
  private refreshError: string | undefined
  private timer: unknown
  private inFlight = false
  private disposed = false
  private lastReport: SessionLinkReport | undefined

  constructor(
    private readonly deps: SessionLinkRepairDeps,
    options: SessionLinkRepairOptions = {},
  ) {
    this.delays = options.delaysMs ?? DEFAULT_REPAIR_DELAYS_MS
    this.persistentRetryMs = options.persistentRetryMs ?? 60_000
    this.maxSample = options.maxSample ?? 8
    this.setTimeoutFn = options.setTimeoutFn ?? ((fn, ms) => globalThis.setTimeout(fn, ms))
    this.clearTimeoutFn = options.clearTimeoutFn ?? (handle => {
      globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>)
    })
    this.now = options.now ?? (() => Date.now())
    this.onReport = options.onReport
  }

  /** Delay before the next attempt once the initial budget is spent. */
  private nextDelay(): number {
    return this.attempts < this.delays.length
      ? this.delays[this.attempts] ?? this.delays[this.delays.length - 1] ?? 0
      : this.persistentRetryMs
  }

  /** Recompute the gap and schedule a refresh when it is non-empty. */
  noteChange(): SessionLinkReport | undefined {
    if (this.disposed) return this.lastReport
    const report = this.check()
    if (report.missing === 0) return report
    if (this.inFlight || this.timer !== undefined) return report
    const gate = this.deps.canRepair()
    if (!gate.ok) return report
    this.timer = this.setTimeoutFn(() => {
      this.timer = undefined
      void this.attempt()
    }, this.nextDelay())
    return report
  }

  /**
   * Forget attempted refreshes. Called when the inputs legitimately change —
   * a device connects, the mode switches, the user opens a Workspace — so a
   * later gap is retried even after the budget was spent.
   */
  resetBudget(): void {
    this.attempts = 0
  }

  /** Stop every pending timer. */
  dispose(): void {
    this.disposed = true
    if (this.timer !== undefined) {
      this.clearTimeoutFn(this.timer)
      this.timer = undefined
    }
  }

  /** Latest report, for the Diagnostics payload. */
  report(): SessionLinkReport | undefined {
    return this.lastReport
  }

  private check(): SessionLinkReport {
    const gap = this.deps.computeGap()
    const gate = this.deps.canRepair()
    const report: SessionLinkReport = {
      ...gap,
      checkedAt: this.now(),
      connectedDevices: gate.connectedDevices,
      attempts: this.attempts,
      ...(this.lastReport?.refreshedAt !== undefined ? { refreshedAt: this.lastReport.refreshedAt } : {}),
      ...(this.refreshError !== undefined ? { lastError: this.refreshError } : {}),
      resolved: gap.missing === 0,
      exhausted: gap.missing > 0 && this.attempts >= this.delays.length,
    }
    this.lastReport = report
    this.onReport?.(report)
    return report
  }

  private async attempt(): Promise<void> {
    if (this.disposed) return
    this.inFlight = true
    this.attempts += 1
    this.lastReport = { ...this.check(), attempts: this.attempts, refreshedAt: this.now() }
    try {
      await this.deps.refresh()
      this.refreshError = undefined
    } catch (error) {
      // A failed refresh is itself a data point: the next attempt retries and
      // the Diagnostics report keeps both the attempt count and the reason.
      this.refreshError = error instanceof Error ? error.message : String(error)
    } finally {
      this.inFlight = false
    }
    if (this.disposed) return
    const report = this.check()
    if (report.missing > 0 && this.deps.canRepair().ok) {
      this.timer = this.setTimeoutFn(() => {
        this.timer = undefined
        void this.attempt()
      }, this.nextDelay())
    }
  }
}

let activeRepair: SessionLinkRepair | undefined

/** Publish the browser generation's repair loop for the Diagnostics report. */
export function setActiveSessionLinkRepair(repair: SessionLinkRepair | undefined): void {
  activeRepair = repair
}

/** Read the active repair report (undefined outside a browser generation). */
export function readSessionLinkReport(): SessionLinkReport | undefined {
  return activeRepair?.report()
}

/** Owning device of a namespaced Session id, or `local` for a plain id. */
export function sessionOwnerKey(sessionId: string): string {
  const decoded = decodeSessionId(sessionId)
  return decoded.isRemote ? String(decoded.deviceId) : LOCAL_DEVICE_ID
}
