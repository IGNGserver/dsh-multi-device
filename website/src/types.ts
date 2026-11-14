export type Locale = 'zh' | 'en'

export type SessionStatus = 'idle' | 'pending' | 'running' | 'unread'

export type AttentionTone = 'pending' | 'running' | 'done'

export interface TrajectoryBlock {
  readonly id: string
  readonly kind: 'user' | 'assistant' | 'tool' | 'diff' | 'approval'
  readonly title?: { readonly zh: string; readonly en: string }
  readonly subtitle?: string
  readonly content: { readonly zh: string; readonly en: string }
  readonly code?: string
  readonly diffLines?: readonly {
    readonly type: 'ctx' | 'add' | 'del'
    readonly lineOld?: number
    readonly lineNew?: number
    readonly text: string
  }[]
  readonly command?: string
  readonly status?: 'done' | 'ongoing' | 'warning'
  readonly metrics?: string
}

export interface DshSessionItem {
  readonly id: string
  readonly rawSessionId: string
  readonly workspaceId: string
  readonly workspaceName: string
  readonly workspacePath: string
  readonly title: { readonly zh: string; readonly en: string }
  readonly updatedLabel: { readonly zh: string; readonly en: string }
  readonly status: SessionStatus
  readonly pendingKind?: 'approval' | 'question'
  readonly subagentCount?: number
  readonly model: string
  readonly effort: string
  readonly contextPercent: number
  readonly blocks: readonly TrajectoryBlock[]
}

export interface DshWorkspaceGroup {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly branch: string
}

export interface DeviceRecord {
  readonly id: string
  readonly name: string
  readonly isLocal?: boolean
  readonly osLabel: string
  readonly sshSummary: string
  readonly proxyUrl?: string
  readonly dshVersion: string
  readonly latencyMs?: number
  readonly connected: boolean
  readonly stale: boolean
  readonly enabled: boolean
  readonly keepAliveMounted: boolean
  readonly workspaces: readonly DshWorkspaceGroup[]
  readonly sessions: readonly DshSessionItem[]
  readonly activeSessionId: string
  readonly draftText: string
  readonly draftChip?: string
  /** Spatial 3D scatter pose at scroll = 0 */
  readonly scatterPose: {
    readonly x: number
    readonly y: number
    readonly z: number
    readonly rotateX: number
    readonly rotateY: number
    readonly rotateZ: number
    readonly scale: number
  }
}
