/**
 * Manual Git match run.
 *
 * Semantics:
 * 1. Read the `origin` of every workspace already registered on every device.
 * 2. A repository that at least one device has and another device lacks is a
 *    seed. Repositories every device already tracks are left alone.
 * 3. Scan each device once (home + registered workspace parents) and look for
 *    the seed origins on disk.
 * 4. Register a workspace on the device that has the repository but had not
 *    registered it yet. Nothing is cloned, synced or written to the project.
 *
 * The run never starts by itself: `DeviceRegistry.startGitMatch()` is the only
 * entry point, and every step reports progress so the UI can show a live task
 * plus the persisted last outcome.
 *
 * @module dsh-multi-device/host/git-match
 */
import {
  type DeviceConnectionState,
  type DeviceId,
  type GitMatchCreatedWorkspace,
  type GitMatchDeviceReport,
  type GitMatchRun,
  normalizeGitRemote,
} from '../contract.ts'
import { discoverLocalGitRemoteAsync } from './git-aggregator.ts'
import {
  deriveScanRoots,
  type GitRepoScanResult,
  type ScannedRepository,
  primaryRepoByOrigin,
} from './git-scan.ts'

/** One device the run may read from or register a workspace on. */
export interface GitMatchDeviceTarget {
  readonly deviceId: DeviceId
  readonly deviceName: string
  readonly state: DeviceConnectionState
  /** True for this DSH host, which needs no SSH round-trip. */
  readonly local: boolean
  readonly home?: string
  readonly workspacePaths: readonly string[]
}

/** Host services the runner needs; implemented by `DeviceRegistry`. */
export interface GitMatchContext {
  readonly devices: () => readonly GitMatchDeviceTarget[]
  /** Read `origin` for registered workspaces on a remote device, in one round-trip. */
  readonly discoverRemoteOrigins: (
    deviceId: DeviceId,
    paths: readonly string[],
    signal?: AbortSignal,
  ) => Promise<Map<string, string>>
  /** Scan one remote device; resolves to an error string instead of throwing. */
  readonly scanRemoteRepos: (
    deviceId: DeviceId,
    roots: readonly string[],
    signal?: AbortSignal,
  ) => Promise<GitRepoScanResult>
  readonly scanLocalRepos: (roots: readonly string[]) => ScannedRepository[]
  readonly scanLocalReposAsync?: (roots: readonly string[], signal?: AbortSignal) => Promise<GitRepoScanResult>
  readonly createLocalWorkspace: (path: string) => Promise<{ ok: true } | { ok: false; error: string }>
  readonly createRemoteWorkspace: (
    deviceId: DeviceId,
    path: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  /** Cache a discovered origin so grouping sees it without another SSH call. */
  readonly noteOrigin: (deviceId: DeviceId, path: string, rawOrigin: string) => void
  readonly localHome: () => string
  readonly onProgress: (run: GitMatchRun) => void
  readonly now?: () => number
}

export function createIdleGitMatch(): GitMatchRun {
  return {
    status: 'idle',
    totalDevices: 0,
    processedDevices: 0,
    totalProjects: 0,
    processedProjects: 0,
    createdCount: 0,
    alreadyTrackedCount: 0,
    notFoundCount: 0,
    reports: [],
  }
}

interface SeedOrigin {
  readonly gitRemote: string
  readonly sourceDeviceName: string
  readonly sourceTitle: string
  readonly presentDeviceIds: Set<DeviceId>
}

interface MutableReport {
  deviceId: DeviceId
  deviceName: string
  state: DeviceConnectionState
  scanned: number
  created: GitMatchCreatedWorkspace[]
  alreadyTracked: number
  notFound: number
  errors: string[]
}

export class GitMatchRunner {
  private current: GitMatchRun = createIdleGitMatch()
  private cancelled = false
  private active = false
  private abortController = new AbortController()

  constructor(private readonly ctx: GitMatchContext) {}

  get state(): GitMatchRun {
    return this.current
  }

  get running(): boolean {
    return this.active
  }

  /** Abort the active scan/process; workspace creation finishes at its next safe point. */
  cancel(): boolean {
    if (!this.active) return false
    this.cancelled = true
    this.abortController.abort()
    return true
  }

  private now(): number {
    return this.ctx.now?.() ?? Date.now()
  }

  private emit(patch: Partial<GitMatchRun>): void {
    this.current = { ...this.current, ...patch }
    this.ctx.onProgress(this.current)
  }

  /** Execute the run. Resolves with the final state; never throws. */
  async execute(): Promise<GitMatchRun> {
    if (this.active) return this.current
    this.active = true
    this.cancelled = false
    this.abortController = new AbortController()

    const devices = [...this.ctx.devices()].sort((a, b) => {
      if (a.local !== b.local) return a.local ? -1 : 1
      return a.deviceName.localeCompare(b.deviceName)
    })
    const reports: MutableReport[] = devices.map(device => ({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      state: device.state,
      scanned: 0,
      created: [],
      alreadyTracked: 0,
      notFound: 0,
      errors: [],
    }))
    const reportOf = new Map<DeviceId, MutableReport>(reports.map(r => [r.deviceId, r]))

    const startedAt = this.now()
    this.current = {
      ...createIdleGitMatch(),
      status: 'running',
      startedAt,
      phase: 'discovering',
      totalDevices: devices.length,
    }
    this.ctx.onProgress(this.current)

    try {
      const seeds = await this.collectSeeds(devices, reportOf)
      if (this.cancelled) return this.finish('cancelled', reports)

      this.emit({
        phase: 'scanning',
        totalProjects: seeds.length,
        processedProjects: 0,
      })

      const scannedByDevice = new Map<DeviceId, Map<string, ScannedRepository>>()
      const completeScans = new Set<DeviceId>()
      let processedDevices = 0
      for (const device of devices) {
        if (this.cancelled) return this.finish('cancelled', reports)
        this.emit({
          phase: 'scanning',
          currentDeviceId: device.deviceId,
          currentDeviceName: device.deviceName,
          currentProject: undefined,
        })

        if (!this.isReachable(device)) {
          // Recorded once during the discovery phase.
          processedDevices += 1
          this.emit({ processedDevices })
          continue
        }

        const roots = [...new Set([...deriveScanRoots(device.home, device.workspacePaths), ...device.workspacePaths])]
        let scan: GitRepoScanResult
        try {
          if (device.local) {
            scan = this.ctx.scanLocalReposAsync !== undefined
              ? await this.ctx.scanLocalReposAsync(roots, this.abortController.signal)
              : { ok: true, repos: this.ctx.scanLocalRepos(roots) }
          } else {
            scan = await this.ctx.scanRemoteRepos(device.deviceId, roots, this.abortController.signal)
          }
        } catch (error) {
          scan = { ok: false, error: error instanceof Error ? error.message : String(error) }
        }

        const repos = scan.repos ?? []
        const report = reportOf.get(device.deviceId)
        if (report !== undefined) report.scanned = repos.length
        if (scan.ok || scan.repos !== undefined) scannedByDevice.set(device.deviceId, primaryRepoByOrigin(repos))
        if (!scan.ok) report?.errors.push(scan.error)
        if (scan.ok && scan.truncated === true) report?.errors.push('Scan reached its repository limit; unmatched projects were not classified as missing')
        if (scan.ok && scan.truncated !== true) completeScans.add(device.deviceId)
        if (this.cancelled) return this.finish('cancelled', reports)

        processedDevices += 1
        this.emit({ processedDevices })
      }

      this.emit({ phase: 'creating' })
      const orderedSeeds = [...seeds].sort((a, b) => a.gitRemote.localeCompare(b.gitRemote))
      let processedProjects = 0
      for (const seed of orderedSeeds) {
        if (this.cancelled) return this.finish('cancelled', reports)
        this.emit({ currentProject: seed.gitRemote })

        for (const device of devices) {
          const report = reportOf.get(device.deviceId)
          if (report === undefined) continue
          if (seed.presentDeviceIds.has(device.deviceId)) {
            report.alreadyTracked += 1
            continue
          }
          if (!this.isReachable(device)) {
            // Already recorded as a device error during the scan phase.
            continue
          }
          const scanned = scannedByDevice.get(device.deviceId)
          if (scanned === undefined) continue
          const repo = scanned.get(seed.gitRemote)
          if (repo === undefined) {
            if (completeScans.has(device.deviceId)) report.notFound += 1
            continue
          }

          const created = device.local
            ? await this.ctx.createLocalWorkspace(repo.path)
            : await this.ctx.createRemoteWorkspace(device.deviceId, repo.path)
          if (!created.ok) {
            report.errors.push(`${repo.path}: ${created.error}`)
            continue
          }
          this.ctx.noteOrigin(device.deviceId, repo.path, repo.rawOrigin)
          report.created.push({
            path: repo.path,
            gitRemote: seed.gitRemote,
            title: seed.sourceTitle,
            sourceDeviceName: seed.sourceDeviceName,
          })
        }

        processedProjects += 1
        this.emit({ processedProjects })
      }

      return this.finish(this.cancelled ? 'cancelled' : 'completed', reports)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return this.finish('failed', reports, message)
    }
  }

  /** Devices that are usable right now. Local always is; remotes need a live client. */
  private isReachable(device: GitMatchDeviceTarget): boolean {
    if (device.local) return true
    return device.state === 'connected'
  }

  /**
   * Read every registered workspace origin, then keep the repositories that at
   * least one device is missing.
   */
  private async collectSeeds(
    devices: readonly GitMatchDeviceTarget[],
    reportOf: ReadonlyMap<DeviceId, MutableReport>,
  ): Promise<SeedOrigin[]> {
    const seeds = new Map<string, SeedOrigin>()

    for (const device of devices) {
      if (this.cancelled) break
      this.emit({
        phase: 'discovering',
        currentDeviceId: device.deviceId,
        currentDeviceName: device.deviceName,
      })
      if (!this.isReachable(device)) {
        reportOf.get(device.deviceId)?.errors.push(
          device.state === 'disabled' ? 'Device is disabled' : 'Device is not connected',
        )
        continue
      }

      let origins: Map<string, string>
      try {
        origins = device.local
          ? await this.discoverLocalOrigins(device.workspacePaths)
          : await this.ctx.discoverRemoteOrigins(device.deviceId, device.workspacePaths, this.abortController.signal)
      } catch (error) {
        reportOf.get(device.deviceId)?.errors.push(error instanceof Error ? error.message : String(error))
        continue
      }

      for (const [path, rawOrigin] of origins) {
        const gitRemote = normalizeGitRemote(rawOrigin)
        if (gitRemote === undefined) continue
        const seed = seeds.get(gitRemote)
        if (seed === undefined) {
          seeds.set(gitRemote, {
            gitRemote,
            sourceDeviceName: device.deviceName,
            sourceTitle: titleFromPath(path),
            presentDeviceIds: new Set([device.deviceId]),
          })
          continue
        }
        seed.presentDeviceIds.add(device.deviceId)
      }
    }

    const enabledCount = devices.filter(device => device.state !== 'disabled').length
    return [...seeds.values()].filter(seed => seed.presentDeviceIds.size < enabledCount)
  }

  private async discoverLocalOrigins(paths: readonly string[]): Promise<Map<string, string>> {
    const found = new Map<string, string>()
    for (const path of paths) {
      if (this.abortController.signal.aborted) throw new Error('Git origin discovery cancelled')
      try {
        const raw = await discoverLocalGitRemoteAsync(path, this.abortController.signal)
        if (raw !== undefined && raw.trim() !== '') found.set(path, raw)
      } catch (error) {
        if (this.abortController.signal.aborted) throw error
        // Discovery is best-effort; the strict scan reports broken metadata later.
      }
    }
    return found
  }

  private finish(
    status: 'completed' | 'cancelled' | 'failed',
    reports: readonly MutableReport[],
    error?: string,
  ): GitMatchRun {
    const finished: GitMatchDeviceReport[] = reports.map(report => ({
      deviceId: report.deviceId,
      deviceName: report.deviceName,
      state: report.state,
      scanned: report.scanned,
      created: [...report.created],
      alreadyTracked: report.alreadyTracked,
      notFound: report.notFound,
      ...(report.errors.length > 0 ? { error: report.errors.join('; ') } : {}),
    }))

    const createdCount = finished.reduce((sum, report) => sum + report.created.length, 0)
    const alreadyTrackedCount = finished.reduce((sum, report) => sum + report.alreadyTracked, 0)
    const notFoundCount = finished.reduce((sum, report) => sum + report.notFound, 0)

    this.current = {
      ...this.current,
      status,
      phase: 'finished',
      finishedAt: this.now(),
      createdCount,
      alreadyTrackedCount,
      notFoundCount,
      reports: finished,
      ...(error !== undefined ? { error } : {}),
      currentDeviceId: undefined,
      currentDeviceName: undefined,
      currentProject: undefined,
      processedProjects: this.current.totalProjects,
      processedDevices: this.current.totalDevices,
    }
    this.active = false
    this.ctx.onProgress(this.current)
    return this.current
  }
}

/** Best-effort repository name used as the workspace title on the target device. */
export function titleFromPath(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean)
  return parts.at(-1) ?? path
}

