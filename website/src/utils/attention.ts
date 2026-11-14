import type { AttentionTone, DeviceRecord, DshSessionItem, Locale } from '../types'

export interface DeviceAttentionSummary {
  readonly pendingSessions: readonly DshSessionItem[]
  readonly runningSessions: readonly DshSessionItem[]
  readonly unreadSessions: readonly DshSessionItem[]
  readonly segments: readonly {
    readonly tone: AttentionTone
    readonly count: number
  }[]
  readonly totalActive: number
}

/**
 * Mirrors src/attention.ts exclusive urgency order:
 *   pending (Amber) > running (Blue) > done/unread (Green)
 */
export function summarizeDeviceAttention(device: DeviceRecord): DeviceAttentionSummary {
  const pendingSessions: DshSessionItem[] = []
  const runningSessions: DshSessionItem[] = []
  const unreadSessions: DshSessionItem[] = []

  for (const session of device.sessions) {
    if (session.status === 'pending') {
      pendingSessions.push(session)
    } else if (session.status === 'running') {
      runningSessions.push(session)
    } else if (session.status === 'unread') {
      unreadSessions.push(session)
    }
  }

  const segments: { tone: AttentionTone; count: number }[] = []
  if (pendingSessions.length > 0) {
    segments.push({ tone: 'pending', count: pendingSessions.length })
  }
  if (runningSessions.length > 0) {
    segments.push({ tone: 'running', count: runningSessions.length })
  }
  if (unreadSessions.length > 0) {
    segments.push({ tone: 'done', count: unreadSessions.length })
  }

  return {
    pendingSessions,
    runningSessions,
    unreadSessions,
    segments,
    totalActive:
      pendingSessions.length + runningSessions.length + unreadSessions.length,
  }
}

export function formatCountCell(count: number): string {
  return count > 99 ? '99' : String(count)
}

export function formatTaskbarSummary(
  devices: readonly DeviceRecord[],
  locale: Locale,
): string {
  let running = 0
  let pending = 0
  let unread = 0

  for (const dev of devices) {
    if (!dev.enabled) continue
    const summary = summarizeDeviceAttention(dev)
    running += summary.runningSessions.length
    pending += summary.pendingSessions.length
    unread += summary.unreadSessions.length
  }

  const parts: string[] = []
  if (locale === 'zh') {
    if (running > 0) parts.push(`${running}跑`)
    if (pending > 0) parts.push(`${pending}待`)
    if (unread > 0) parts.push(`${unread}结`)
  } else {
    if (running > 0) parts.push(`${running} run`)
    if (pending > 0) parts.push(`${pending} wait`)
    if (unread > 0) parts.push(`${unread} done`)
  }

  return parts.join(' ')
}
