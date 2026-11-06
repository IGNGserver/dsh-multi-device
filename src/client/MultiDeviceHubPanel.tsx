/**
 * Native Settings Section for `dsh-multi-device` (`MultiDeviceHubPanel`).
 *
 * Mounted inside Settings → Multi-Device (`settings.section`, `id: 'multi-device'`)
 * and Plugins → dsh-multi-device (`plugins.bundle.config`).
 *
 * Built 100% with `@deepseek-ai/dsh-client-ui-primitives` following the layout and
 * interaction conventions of `@deepseek-ai/dsh-client-ui-settings-general` and
 * `@deepseek-ai/dsh-client-ui-settings-models`:
 * 1. Global preferences: Display Mode (`SegmentedControl`) & Auto Git Repository
 *    Aggregation (`Switch`, plus default target device selector only when multi-device
 *    repositories actually exist).
 * 2. Remote Devices list: Clean row cards with `StateDot`, `Tag`, 1-click Native UI
 *    entry, reconnect, inline edit, and `Modal`-confirmed removal.
 * 3. Streamlined Add/Edit form: Only 3 core inputs visible by default (SSH Host,
 *    optional Display Name, optional Launch URL / Token), with `~/.ssh/config` quick
 *    fill and a collapsed `DisclosureRow` for non-default ports, keys, or ProxyJump.
 *
 * @module dsh-multi-device/client/MultiDeviceHubPanel
 */
import {
  Button,
  DisclosureRow,
  IconEditOutlineRegular,
  IconPlusOutlineRegular,
  IconRefreshOutlineRegular,
  IconRightUpOutlineRegular,
  IconTrashOutlineRegular,
  IconWarningOutlineRegular,
  Input,
  Modal,
  SegmentedControl,
  StateDot,
  Switch,
  Tag,
  Toast,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import React, { useEffect, useId, useState } from 'react'
import { copyText } from './clipboard.ts'
import { DshSelect } from './DshSelect.tsx'
import {
  type DeviceId,
  type DeviceView,
  type DisplayMode,
  type GitMatchRun,
  LOCAL_DEVICE_ID,
  type SshConfigHostEntry,
  type SshKeyEntry,
  type UpsertDeviceInput,
} from '../contract.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import type { MultiDeviceDiagnostics } from '../runtime.ts'
import { UnreadCountBadge } from './UnreadCountBadge.tsx'
import { deviceTargetsForWorkspace } from './sessionDevice.ts'
import { countableUnreadIds, unreadCountForDevice } from './unreadCounts.ts'
import {
  clientStore,
  deviceStateToDotState,
  type HubTabId,
  parseSshHostInput,
  useMultiDeviceState,
} from './state.ts'

const EYE_CONTOUR =
  'M1.5 8C2.9 5.25 5.25 3.5 8 3.5C10.75 3.5 13.1 5.25 14.5 8C13.1 10.75 10.75 12.5 8 12.5C5.25 12.5 2.9 10.75 1.5 8Z'
const EYE_PATH = `${EYE_CONTOUR}M10 8C10 9.1 9.1 10 8 10C6.9 10 6 9.1 6 8C6 6.9 6.9 6 8 6C9.1 6 10 6.9 10 8Z`
const EYE_OFF_PATH = `${EYE_CONTOUR}M2.5 2.5L13.5 13.5`

function formatCompactDeviceTarget(dev: DeviceView): string {
  if (dev.ssh !== undefined) {
    const userPart = dev.ssh.username !== undefined && dev.ssh.username !== '' ? `${dev.ssh.username}@` : ''
    const sshPortPart = dev.ssh.port !== undefined && dev.ssh.port !== 22 ? `:${String(dev.ssh.port)}` : ''
    const remotePortPart =
      dev.ssh.remotePort !== undefined && dev.ssh.remotePort !== 3080
        ? ` → :${String(dev.ssh.remotePort)}`
        : ''
    return `${userPart}${dev.ssh.host}${sshPortPart}${remotePortPart}`
  }
  return dev.targetSummary
}

function hasCustomAdvancedFields(dev: DeviceView | undefined): boolean {
  if (dev === undefined) return false
  if (dev.enabled === false) return true
  if (dev.ssh === undefined) return false
  return (
    (dev.ssh.remotePort !== undefined && dev.ssh.remotePort !== 3080) ||
    (dev.ssh.port !== undefined && dev.ssh.port !== 22) ||
    (dev.ssh.username !== undefined && dev.ssh.username !== '') ||
    (dev.ssh.privateKeyPath !== undefined && dev.ssh.privateKeyPath !== '') ||
    (dev.ssh.proxyJump !== undefined && dev.ssh.proxyJump !== '') ||
    (dev.ssh.remoteDshHome !== undefined && dev.ssh.remoteDshHome !== '') ||
    dev.ssh.bootstrapFromRemoteCredentials === false
  )
}

function SecretCredentialInput({
  id,
  value,
  placeholder,
  disabled,
  t,
  onChange,
}: {
  id: string
  value: string
  placeholder: string
  disabled: boolean
  t: (key: MultiDeviceLocaleKey) => string
  onChange: (next: string) => void
}): React.ReactElement {
  const [revealedValue, setRevealedValue] = useState<string | undefined>(undefined)
  const revealed = value.length > 0 && revealedValue === value

  return (
    <div className="dsh-md-secret-wrap">
      <Input
        id={id}
        className="dsh-md-secret-input"
        type={revealed ? 'text' : 'password'}
        autoComplete="new-password"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          setRevealedValue(undefined)
          onChange(e.currentTarget.value)
        }}
      />
      {value.length > 0 && (
        <Button
          variant="ghost"
          size="icon"
          className="dsh-md-secret-toggle"
          aria-label={t(revealed ? 'keyHide' : 'keyReveal')}
          aria-pressed={revealed}
          disabled={disabled}
          onClick={() => {
            setRevealedValue(revealed ? undefined : value)
          }}
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.3}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d={revealed ? EYE_OFF_PATH : EYE_PATH} />
          </svg>
        </Button>
      )}
    </div>
  )
}

/** Persisted outcome of the previous manual Git match run. */
function GitMatchLastResult({
  run,
  t,
}: {
  run: GitMatchRun
  t: (key: MultiDeviceLocaleKey) => string
}): React.ReactElement {
  const finished = run.finishedAt !== undefined ? new Date(run.finishedAt) : undefined
  const created = run.reports.flatMap(report => report.created)
  const errors = run.reports.filter(report => report.error !== undefined)
  const tone =
    run.status === 'failed' ? 'dsh-md-gitmatch-status-error' : 'dsh-md-gitmatch-status-ok'

  return (
    <div className="dsh-md-gitmatch-result">
      <div className="dsh-md-gitmatch-line">
        <span className={tone}>
          {t(
            run.status === 'completed'
              ? 'gitMatchStatusCompleted'
              : run.status === 'cancelled'
                ? 'gitMatchStatusCancelled'
                : 'gitMatchStatusFailed',
          )}
        </span>
        {finished !== undefined && (
          <span className="dsh-md-gitmatch-detail">
            {t('gitMatchFinishedAt').replace('{time}', finished.toLocaleString())}
          </span>
        )}
      </div>
      <div className="dsh-md-gitmatch-line">
        <span>{t('gitMatchCreatedCount').replace('{count}', String(run.createdCount))}</span>
        <span>{t('gitMatchNotFoundCount').replace('{count}', String(run.notFoundCount))}</span>
        <span>{t('gitMatchAlreadyCount').replace('{count}', String(run.alreadyTrackedCount))}</span>
      </div>
      {run.error !== undefined && <div className="dsh-md-gitmatch-detail">{run.error}</div>}
      {created.length > 0 && (
        <ul className="dsh-md-gitmatch-created">
          {created.map(item => (
            <li key={`${item.gitRemote}:${item.path}`} className="dsh-md-gitmatch-detail">
              <span className="dsh-md-ellipsis" title={`${item.gitRemote} → ${item.path}`}>
                {item.gitRemote}
              </span>
              <span className="dsh-md-gitmatch-path" title={item.path}>{item.path}</span>
            </li>
          ))}
        </ul>
      )}
      {errors.length > 0 && (
        <ul className="dsh-md-gitmatch-created">
          {errors.map(report => (
            <li key={report.deviceId} className="dsh-md-gitmatch-detail">
              <span>{report.deviceName}</span>
              <span className="dsh-md-gitmatch-path">{report.error}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DeviceEditorForm({
  device,
  sshConfigHosts,
  sshKeys,
  t,
  onSaved,
  onCancel,
}: {
  device?: DeviceView
  sshConfigHosts: readonly SshConfigHostEntry[]
  sshKeys: readonly SshKeyEntry[]
  t: (key: MultiDeviceLocaleKey) => string
  onSaved: () => void
  onCancel: () => void
}): React.ReactElement {
  const formId = useId()
  const [sshHost, setSshHost] = useState(device?.ssh?.host ?? '')
  const [name, setName] = useState(device?.name ?? '')
  const [authCredential, setAuthCredential] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(() => hasCustomAdvancedFields(device))
  const [remotePort, setRemotePort] = useState(String(device?.ssh?.remotePort ?? 3080))
  const [sshUser, setSshUser] = useState(device?.ssh?.username ?? '')
  const [sshPort, setSshPort] = useState(
    device?.ssh?.port !== undefined && device.ssh.port !== 22 ? String(device.ssh.port) : '',
  )
  const [sshKeyPath, setSshKeyPath] = useState(device?.ssh?.privateKeyPath ?? '')
  const [sshPassphrase, setSshPassphrase] = useState('')
  const [sshProxyJump, setSshProxyJump] = useState(device?.ssh?.proxyJump ?? '')
  const [remoteDshHome, setRemoteDshHome] = useState(device?.ssh?.remoteDshHome ?? '')
  const [bootstrapCredentials, setBootstrapCredentials] = useState(
    device?.ssh?.bootstrapFromRemoteCredentials !== false,
  )
  const [deviceEnabled, setDeviceEnabled] = useState(device?.enabled !== false)

  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveAnyway, setSaveAnyway] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const selectedKeyEntry = sshKeys.find(k => k.path === sshKeyPath)
  const showPassphraseField = selectedKeyEntry?.encrypted === true
  const busy = testing || saving

  const buildInput = (): UpsertDeviceInput => {
    const parsedHost = parseSshHostInput(sshHost)
    const effectiveHost = parsedHost.host
    const effectiveUser = sshUser.trim() || parsedHost.username
    const explicitPort = Number(sshPort)
    const effectiveSshPort =
      sshPort.trim() !== '' && Number.isInteger(explicitPort) && explicitPort > 0 && explicitPort <= 65535
        ? explicitPort
        : parsedHost.port
    const parsedRemotePort = Number(remotePort)

    return {
      ...(device !== undefined ? { id: device.id } : {}),
      name: name.trim() || effectiveHost || 'remote-device',
      ...(device?.label !== undefined ? { label: device.label } : {}),
      enabled: deviceEnabled,
      keepNativeAlive: device?.keepNativeAlive ?? true,
      transport: {
        kind: 'ssh',
        host: effectiveHost,
        ...(effectiveUser !== undefined && effectiveUser !== '' ? { username: effectiveUser } : {}),
        ...(effectiveSshPort !== undefined && effectiveSshPort > 0 ? { port: effectiveSshPort } : {}),
        ...(sshKeyPath.trim() !== '' ? { privateKeyPath: sshKeyPath.trim() } : {}),
        ...(sshPassphrase.trim() !== '' ? { passphrase: sshPassphrase.trim() } : {}),
        ...(sshProxyJump.trim() !== '' ? { proxyJump: sshProxyJump.trim() } : {}),
        remotePort: parsedRemotePort > 0 ? parsedRemotePort : 3080,
        ...(remoteDshHome.trim() !== '' ? { remoteDshHome: remoteDshHome.trim() } : {}),
        ...(bootstrapCredentials ? { bootstrapFromRemoteCredentials: true } : {}),
        engine: device?.ssh?.engine ?? 'auto',
      },
      auth: {
        mode: 'auto',
        ...(authCredential.trim() !== '' ? { credential: authCredential.trim() } : {}),
      },
    }
  }

  const handleImportSshHost = (alias: string): void => {
    const entry = sshConfigHosts.find(h => h.alias === alias)
    if (entry === undefined) return
    setTestResult(null)
    setSaveError(null)
    setSaveAnyway(false)
    setSshHost(entry.alias)
    if (name.trim() === '') setName(entry.alias)
    // Leave explicit overrides blank so `ssh <alias>` uses `~/.ssh/config` directly.
    setSshUser('')
    setSshPort('')
    setSshKeyPath('')
    setSshProxyJump('')
  }

  const handleTest = async (): Promise<void> => {
    if (sshHost.trim() === '' || busy) return
    setTesting(true)
    setTestResult(null)
    setSaveError(null)
    const res = await clientStore.testDevice(buildInput())
    setTesting(false)
    if (res.ok) {
      setTestResult({
        ok: true,
        text: `${t('testPassed')} · DSH ${res.remoteDshVersion ?? res.protocolVersion} · ${String(res.latencyMs)}ms`,
      })
    } else {
      setTestResult({ ok: false, text: res.error })
    }
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (sshHost.trim() === '' || busy) return
    setSaving(true)
    setSaveError(null)

    // Saving without a preflight used to look successful while the remote
    // rejected every request with a bare 401. Probe auth/tunnel first; on
    // failure keep the form open and require an explicit "save anyway".
    if (!saveAnyway) {
      const preflight = await clientStore.testDevice(buildInput())
      if (!preflight.ok) {
        setSaving(false)
        setTestResult({ ok: false, text: preflight.error })
        setSaveAnyway(true)
        return
      }
      setTestResult({
        ok: true,
        text: `${t('testPassed')} · DSH ${preflight.remoteDshVersion ?? preflight.protocolVersion} · ${String(preflight.latencyMs)}ms`,
      })
    }

    const res = await clientStore.upsertDevice(buildInput())
    setSaving(false)
    if (!res.ok) {
      setSaveError(res.error ?? t('actionFailed'))
      return
    }
    onSaved()
  }

  const hasCustomKeyPath =
    sshKeyPath.trim() !== '' && !sshKeys.some(k => k.path === sshKeyPath)

  return (
    <form className="dsh-md-editor" onSubmit={(e) => { void handleSubmit(e) }}>
      <div className="dsh-md-editor-top">
        <span className="dsh-md-editor-title">
          {device !== undefined ? t('editDevice') : t('addDevice')}
        </span>
        {sshConfigHosts.length > 0 && (
          <DshSelect
            compact
            clearOnSelect
            value=""
            placeholder={t('importSshPlaceholder')}
            ariaLabel={t('importSshPlaceholder')}
            disabled={busy}
            options={sshConfigHosts.map((h) => ({
              value: h.alias,
              label: h.alias,
              description: `${h.user ? `${h.user}@` : ''}${h.hostName}${h.port && h.port !== 22 ? `:${String(h.port)}` : ''}`,
            }))}
            onChange={(alias) => handleImportSshHost(alias)}
          />
        )}
      </div>

      <div className="dsh-md-form-grid">
        <div className="dsh-md-field">
          <label className="dsh-md-field-label" htmlFor={`${formId}-host`}>
            {t('sshHost')}
          </label>
          <Input
            id={`${formId}-host`}
            required
            value={sshHost}
            placeholder={t('sshHostPlaceholder')}
            disabled={busy}
            onChange={(e) => {
              setSshHost(e.currentTarget.value)
              setTestResult(null)
              setSaveAnyway(false)
            }}
          />
        </div>

        <div className="dsh-md-field">
          <label className="dsh-md-field-label" htmlFor={`${formId}-name`}>
            {t('deviceName')}
          </label>
          <Input
            id={`${formId}-name`}
            value={name}
            placeholder={sshHost.trim() !== '' ? parseSshHostInput(sshHost).host : t('deviceNamePlaceholder')}
            disabled={busy}
            onChange={(e) => setName(e.currentTarget.value)}
          />
        </div>
      </div>

      <div className="dsh-md-field">
        <label className="dsh-md-field-label" htmlFor={`${formId}-token`}>
          {t('authCredential')}
        </label>
        <SecretCredentialInput
          id={`${formId}-token`}
          value={authCredential}
          placeholder={t('authCredentialPlaceholder')}
          disabled={busy}
          t={t}
          onChange={(next) => {
            setAuthCredential(next)
            setTestResult(null)
          }}
        />
      </div>

      <DisclosureRow
        title={<span className="dsh-md-field-label">{t('advancedOptions')}</span>}
        open={advancedOpen}
        expandable
        expandOnRowClick
        onToggle={() => setAdvancedOpen(prev => !prev)}
      >
        <div className="dsh-md-form-grid dsh-md-advanced-body">
          <div className="dsh-md-field">
            <label className="dsh-md-field-label" htmlFor={`${formId}-rport`}>
              {t('remoteDshPort')}
            </label>
            <Input
              id={`${formId}-rport`}
              type="number"
              min={1}
              max={65535}
              value={remotePort}
              disabled={busy}
              onChange={(e) => setRemotePort(e.currentTarget.value)}
            />
          </div>

          <div className="dsh-md-field">
            <label className="dsh-md-field-label" htmlFor={`${formId}-user`}>
              {t('sshUser')}
            </label>
            <Input
              id={`${formId}-user`}
              value={sshUser}
              placeholder={t('sshUserPlaceholder')}
              disabled={busy}
              onChange={(e) => setSshUser(e.currentTarget.value)}
            />
          </div>

          <div className="dsh-md-field">
            <label className="dsh-md-field-label" htmlFor={`${formId}-port`}>
              {t('sshPort')}
            </label>
            <Input
              id={`${formId}-port`}
              type="number"
              min={1}
              max={65535}
              value={sshPort}
              placeholder={t('sshPortPlaceholder')}
              disabled={busy}
              onChange={(e) => setSshPort(e.currentTarget.value)}
            />
          </div>

          <div className="dsh-md-field">
            <label className="dsh-md-field-label" htmlFor={`${formId}-key`}>
              {t('sshKeySelect')}
            </label>
            <DshSelect
              id={`${formId}-key`}
              value={sshKeyPath}
              placeholder={t('sshKeyAuto')}
              disabled={busy}
              options={[
                { value: '', label: t('sshKeyAuto'), description: t('sshKeyAutoDesc') },
                ...(hasCustomKeyPath ? [{ value: sshKeyPath, label: sshKeyPath, description: sshKeyPath }] : []),
                ...sshKeys.map((key) => ({
                  value: key.path,
                  label: key.name,
                  description: key.path,
                  badge: key.encrypted ? 'encrypted' : key.permissionsTooOpen ? '(!)' : undefined,
                })),
              ]}
              onChange={(next) => setSshKeyPath(next)}
            />
          </div>

          {showPassphraseField && (
            <div className="dsh-md-field">
              <label className="dsh-md-field-label" htmlFor={`${formId}-passphrase`}>
                {t('sshKeyPassphrase')}
              </label>
              <SecretCredentialInput
                id={`${formId}-passphrase`}
                value={sshPassphrase}
                placeholder={t('sshKeyPassphrasePlaceholder')}
                disabled={busy}
                t={t}
                onChange={setSshPassphrase}
              />
            </div>
          )}

          <div className="dsh-md-field">
            <label className="dsh-md-field-label" htmlFor={`${formId}-jump`}>
              {t('sshProxyJump')}
            </label>
            <Input
              id={`${formId}-jump`}
              value={sshProxyJump}
              placeholder={t('sshProxyJumpPlaceholder')}
              disabled={busy}
              onChange={(e) => setSshProxyJump(e.currentTarget.value)}
            />
          </div>

          <div className="dsh-md-field">
            <label className="dsh-md-field-label" htmlFor={`${formId}-home`}>
              {t('remoteDshHome')}
            </label>
            <Input
              id={`${formId}-home`}
              value={remoteDshHome}
              placeholder={t('remoteDshHomePlaceholder')}
              disabled={busy}
              onChange={(e) => setRemoteDshHome(e.currentTarget.value)}
            />
          </div>

          <div className="dsh-md-field dsh-md-field-span">
            <Switch
              checked={bootstrapCredentials}
              disabled={busy}
              label={t('authBootstrap')}
              onChange={setBootstrapCredentials}
            />
          </div>

          {device !== undefined && (
            <div className="dsh-md-field dsh-md-field-span">
              <Switch
                checked={deviceEnabled}
                disabled={busy}
                label={t('deviceEnabledLabel')}
                onChange={setDeviceEnabled}
              />
            </div>
          )}
        </div>
      </DisclosureRow>

      {saveError !== null && (
        <p className="dsh-md-error-text" role="alert">
          {saveError}
        </p>
      )}

      <div className="dsh-md-editor-footer">
        <div className="dsh-md-editor-footer-left">
          <Button
            variant="outline"
            size="sm"
            disabled={busy || sshHost.trim() === ''}
            icon={testing ? <StateDot state="ongoing" size={12} /> : undefined}
            onClick={() => { void handleTest() }}
          >
            {testing ? t('testingConnection') : t('testConnection')}
          </Button>
          {testResult !== null && (
            testResult.ok ? (
              <span className="dsh-md-success-text">
                <StateDot state="done" size={8} />
                {testResult.text}
              </span>
            ) : (
              <span className="dsh-md-error-text" role="alert">
                {testResult.text}
              </span>
            )
          )}
        </div>

        <div className="dsh-md-editor-footer-right">
          <Button variant="outline" size="sm" disabled={busy} onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={busy || sshHost.trim() === ''}
          >
            {saving ? t('savingDevice') : saveAnyway ? t('saveAnyway') : t('saveDevice')}
          </Button>
        </div>
      </div>
    </form>
  )
}

export function MultiDeviceHubPanel({
  t,
  onCloseSettings,
  hideHeader = false,
}: {
  t: (key: MultiDeviceLocaleKey) => string
  defaultTab?: HubTabId
  onCloseSettings?: () => void
  hideHeader?: boolean
}): React.ReactElement {
  const state = useMultiDeviceState()
  const { snapshot } = state
  // Same visibility rules as the sidebar: archived rows and subagent children
  // have no standalone row, so they must not inflate a device's reminder count.
  const unread = countableUnreadIds(
    snapshot.unreadSessionIds,
    snapshot.archivedSessionIds,
    snapshot.subagentSessionIds,
  )
  const modeSegId = useId()

  const [addingNew, setAddingNew] = useState(false)
  const [editingDeviceId, setEditingDeviceId] = useState<DeviceId | null>(null)
  const [sshKeys, setSshKeys] = useState<readonly SshKeyEntry[]>([])
  const [aggBusy, setAggBusy] = useState(false)
  const [modeBusy, setModeBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeviceView | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<MultiDeviceDiagnostics | null>(null)
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false)
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false)
  const [toastNotice, setToastNotice] = useState<{
    seq: number
    text: string
    tone?: 'success' | 'warning' | 'error'
  } | null>(null)

  const pushToast = (text: string, tone?: 'success' | 'warning' | 'error'): void => {
    setToastNotice(prev => ({
      seq: (prev?.seq ?? 0) + 1,
      text,
      ...(tone !== undefined ? { tone } : {}),
    }))
  }

  useEffect(() => {
    if (addingNew || editingDeviceId !== null) {
      void clientStore.listSshKeys().then(setSshKeys)
    }
  }, [addingNew, editingDeviceId])

  const mergedWorkspaces = snapshot.logicalWorkspaces.filter(w => w.members.length > 1)
  const hasDevices = snapshot.devices.length > 0
  const gitMatch = snapshot.gitMatch
  const gitMatchRunning = gitMatch.status === 'running'
  const [gitMatchBusy, setGitMatchBusy] = useState(false)

  const startGitMatch = (): void => {
    if (gitMatchBusy || gitMatchRunning) return
    setGitMatchBusy(true)
    void clientStore
      .startGitMatch()
      .then((res) => {
        if (!res.ok) pushToast(`${t('actionFailed')}: ${res.error ?? ''}`, 'error')
      })
      .finally(() => {
        setGitMatchBusy(false)
      })
  }

  const handleConfirmDelete = async (): Promise<void> => {
    if (deleteTarget === null || deleting) return
    setDeleting(true)
    setDeleteError(null)
    const res = await clientStore.removeDevice(deleteTarget.id)
    setDeleting(false)
    if (!res.ok) {
      setDeleteError(res.error ?? t('actionFailed'))
      return
    }
    if (editingDeviceId === deleteTarget.id) {
      setEditingDeviceId(null)
    }
    setDeleteTarget(null)
    pushToast(t('savedNotice'), 'success')
  }

  /**
   * Copy the report text. Clipboard access can be denied in an embedded frame,
   * so the failure path tells the user to select the visible <pre> instead.
   */
  const copyDiagnosticsText = async (value: MultiDeviceDiagnostics): Promise<void> => {
    const copied = await copyText(JSON.stringify(value, null, 2))
    if (copied) {
      setDiagnosticsCopied(true)
      pushToast(t('diagnosticsCopied'), 'success')
    } else {
      pushToast(t('diagnosticsCopyFailed'), 'error')
    }
  }

  /**
   * Ask the Host for a support report. The browser adds the viewport and Native
   * Mode bar geometry it alone can see, so a clipped mode switch shows up in the
   * report rather than only in a screenshot.
   */
  const runDiagnostics = (): void => {
    if (diagnosticsBusy) return
    setDiagnosticsBusy(true)
    setDiagnosticsCopied(false)
    void clientStore
      .fetchDiagnostics()
      .then((res) => {
        if (!res.ok) {
          pushToast(`${t('actionFailed')}: ${res.error}`, 'error')
          return
        }
        setDiagnostics(res.value)
        void copyDiagnosticsText(res.value)
      })
      .finally(() => {
        setDiagnosticsBusy(false)
      })
  }

  return (
    <div className="dsh-md-section">
      {!hideHeader && (
        <div>
          <h2 className="dsh-md-section-title">{t('settingsSectionTitle')}</h2>
          <p className="dsh-md-section-intro">{t('settingsSectionIntro')}</p>
        </div>
      )}

      {!snapshot.hostStatus.aggregatedGatewayActive &&
        snapshot.hostStatus.aggregatedGatewayError !== undefined && (
          <p className="dsh-md-notice-warn" role="status">
            <IconWarningOutlineRegular size={14} />
            <span>
              {t('gatewayDegradedNotice')} ({snapshot.hostStatus.aggregatedGatewayError})
            </span>
          </p>
        )}

      {/* Global Preferences (aligned with DSH General Settings rows) */}
      <div className="dsh-md-pref-list">
        <div className="dsh-md-pref-row">
          <div>
            <div className="dsh-md-pref-title">{t('modeRowTitle')}</div>
            <div className="dsh-md-pref-desc">{t('modeRowDesc')}</div>
          </div>
          <SegmentedControl<DisplayMode>
            id={modeSegId}
            label={t('modeRowTitle')}
            value={state.displayMode}
            disabled={modeBusy}
            options={[
              { value: 'aggregated', label: t('modeAggregated') },
              { value: 'native', label: t('modeNative') },
            ]}
            onChange={(next) => {
              if (modeBusy || next === state.displayMode) return
              setModeBusy(true)
              void clientStore.setDisplayMode(next).then((res) => {
                setModeBusy(false)
                if (!res.ok) {
                  pushToast(`${t('actionFailed')}: ${res.error ?? ''}`, 'error')
                  return
                }
                if (next === 'native') onCloseSettings?.()
              })
            }}
          />
        </div>

        <div className="dsh-md-pref-row">
          <div>
            <div className="dsh-md-pref-title">{t('gitAutoTitle')}</div>
            <div className="dsh-md-pref-desc">{t('gitAutoDesc')}</div>
          </div>
          <Switch
            checked={snapshot.aggregationConfig.autoGitAggregate}
            label={t('gitAutoTitle')}
            disabled={aggBusy}
            onChange={(enabled) => {
              setAggBusy(true)
              void clientStore
                .updateAggregationConfig({ autoGitAggregate: enabled })
                .then((res) => {
                  if (!res.ok) {
                    pushToast(`${t('actionFailed')}: ${res.error ?? ''}`, 'error')
                  }
                })
                .finally(() => {
                  setAggBusy(false)
                })
            }}
          />
        </div>

        <div className="dsh-md-pref-row">
          <div>
            <div className="dsh-md-pref-title">{t('nativePaneTitle')}</div>
            <div className="dsh-md-pref-desc">{t('nativePaneDesc')}</div>
          </div>
          <Switch
            checked={snapshot.ui?.nativePane !== false}
            label={t('nativePaneTitle')}
            onChange={(enabled) => {
              void clientStore.setUiPreferences({ nativePane: enabled }).then((res) => {
                if (!res.ok) pushToast(`${t('actionFailed')}: ${res.error ?? ''}`, 'error')
              })
            }}
          />
        </div>

        <div className="dsh-md-pref-row">
          <div>
            <div className="dsh-md-pref-title">{t('rowDeviceDotTitle')}</div>
            <div className="dsh-md-pref-desc">{t('rowDeviceDotDesc')}</div>
          </div>
          <Switch
            checked={snapshot.ui?.sessionRowDeviceDot === true}
            label={t('rowDeviceDotTitle')}
            onChange={(enabled) => {
              void clientStore.setUiPreferences({ sessionRowDeviceDot: enabled }).then((res) => {
                if (!res.ok) pushToast(`${t('actionFailed')}: ${res.error ?? ''}`, 'error')
              })
            }}
          />
        </div>

        <div className="dsh-md-pref-row">
          <div>
            <div className="dsh-md-pref-title">{t('crossHostReadStateTitle')}</div>
            <div className="dsh-md-pref-desc">{t('crossHostReadStateDesc')}</div>
          </div>
          <Switch
            checked={snapshot.ui?.crossHostReadState === true}
            label={t('crossHostReadStateTitle')}
            onChange={(enabled) => {
              void clientStore.setUiPreferences({ crossHostReadState: enabled }).then((res) => {
                if (!res.ok) pushToast(`${t('actionFailed')}: ${res.error ?? ''}`, 'error')
              })
            }}
          />
        </div>

        <div className="dsh-md-gitmatch">
          <div className="dsh-md-gitmatch-head">
            <div>
              <div className="dsh-md-pref-title">{t('gitMatchTitle')}</div>
              <div className="dsh-md-pref-desc">{t('gitMatchDesc')}</div>
            </div>
            <div className="dsh-md-gitmatch-actions">
              {gitMatchRunning ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void clientStore.cancelGitMatch()
                  }}
                >
                  {t('gitMatchCancel')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={gitMatchBusy}
                  icon={<IconRefreshOutlineRegular size={13} />}
                  onClick={startGitMatch}
                >
                  {gitMatchBusy ? t('gitMatchStarting') : t('gitMatchStart')}
                </Button>
              )}
            </div>
          </div>

          {gitMatchRunning && (
            <div className="dsh-md-gitmatch-progress" role="status">
              <div className="dsh-md-gitmatch-line">
                <span className="dsh-md-gitmatch-phase">
                  {t(
                    gitMatch.phase === 'discovering'
                      ? 'gitMatchPhaseDiscovering'
                      : gitMatch.phase === 'creating'
                        ? 'gitMatchPhaseCreating'
                        : 'gitMatchPhaseScanning',
                  )}
                </span>
                {gitMatch.currentDeviceName !== undefined && (
                  <span className="dsh-md-gitmatch-detail">{gitMatch.currentDeviceName}</span>
                )}
                {gitMatch.currentProject !== undefined && (
                  <span className="dsh-md-gitmatch-detail dsh-md-ellipsis">
                    {gitMatch.currentProject}
                  </span>
                )}
              </div>
              <div className="dsh-md-gitmatch-line">
                <span>{t('gitMatchDeviceProgress')
                  .replace('{done}', String(gitMatch.processedDevices))
                  .replace('{total}', String(gitMatch.totalDevices))}</span>
                <span>{t('gitMatchProjectProgress')
                  .replace('{done}', String(gitMatch.processedProjects))
                  .replace('{total}', String(gitMatch.totalProjects))}</span>
                <span>{t('gitMatchCreatedCount').replace('{count}', String(gitMatch.createdCount))}</span>
              </div>
            </div>
          )}

          {!gitMatchRunning && gitMatch.status !== 'idle' && (
            <GitMatchLastResult run={gitMatch} t={t} />
          )}
        </div>

        {snapshot.aggregationConfig.autoGitAggregate && mergedWorkspaces.length > 0 && (
          <div className="dsh-md-subpanel">
            <div className="dsh-md-subpanel-header">
              <div className="dsh-md-subpanel-title-wrap">
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.3}
                  aria-hidden="true"
                  className="dsh-md-subpanel-icon"
                >
                  <circle cx="4" cy="4" r="2" />
                  <circle cx="4" cy="12" r="2" />
                  <circle cx="12" cy="7" r="2" />
                  <path d="M4 6v4M4 8c2.5 0 4.5-1 6-1" strokeLinecap="round" />
                </svg>
                <span className="dsh-md-subpanel-title">{t('targetDeviceHeading')}</span>
              </div>
              <span className="dsh-md-subpanel-desc">{t('targetDeviceSubDesc')}</span>
            </div>
            <div className="dsh-md-merged-repos-list">
              {mergedWorkspaces.map((lws) => {
                const targets = deviceTargetsForWorkspace(snapshot, lws, t('nativeLocalTab'))
                const selectOptions = targets.map((target) => ({
                  value: target.deviceId,
                  label: target.name,
                  description: target.online ? target.path : `${target.path} · ${t('deviceOfflineShort')}`,
                  dotState: deviceStateToDotState(target.state),
                  disabled: !target.online,
                }))
                const effective = targets.find(
                  target => target.deviceId === lws.effectiveTargetDeviceId,
                )
                const fallbackHint =
                  lws.effectiveTargetDeviceId !== lws.targetDeviceId && effective !== undefined
                    ? t('targetFallbackHint').replace('{device}', effective.name)
                    : lws.effectiveTargetOnline
                      ? undefined
                      : t('targetAllOfflineHint')

                return (
                  <div key={lws.logicalWorkspaceId} className="dsh-md-merged-repo-card">
                    <div className="dsh-md-merged-repo-info">
                      <span className="dsh-md-merged-repo-name" title={lws.title}>
                        {lws.title}
                      </span>
                      {lws.gitRemote && (
                        <span className="dsh-md-merged-repo-remote" title={lws.gitRemote}>
                          {lws.gitRemote}
                        </span>
                      )}
                      {fallbackHint !== undefined && (
                        <span className="dsh-md-merged-repo-hint" role="status">
                          {fallbackHint}
                        </span>
                      )}
                    </div>
                    <DshSelect
                      compact
                      value={lws.targetDeviceId}
                      placeholder={t('selectDevicePlaceholder')}
                      ariaLabel={`${lws.title} - ${t('targetDeviceHeading')}`}
                      options={selectOptions}
                      onChange={(next) => {
                        void clientStore.setPreferredDevice(
                          lws.logicalWorkspaceId,
                          next as DeviceId,
                        )
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {snapshot.aggregationConfig.excludedMemberKeys.length > 0 && (
          <div className="dsh-md-subpanel">
            <div className="dsh-md-subpanel-header">
              <div className="dsh-md-subpanel-title-wrap">
                <span className="dsh-md-subpanel-title">{t('excludedWorkspacesHeading')}</span>
              </div>
              <span className="dsh-md-subpanel-desc">{t('excludedWorkspacesDesc')}</span>
            </div>
            <div className="dsh-md-merged-repos-list">
              {snapshot.aggregationConfig.excludedMemberKeys.map((memberKey) => (
                <div key={memberKey} className="dsh-md-merged-repo-card">
                  <div className="dsh-md-merged-repo-info">
                    <span className="dsh-md-merged-repo-remote" title={memberKey}>
                      {memberKey}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void clientStore.setMemberExcluded(memberKey, false)
                    }}
                  >
                    {t('restoreAggregation')}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="dsh-md-devices-block">
        <div className="dsh-md-devices-header">
          <div className="dsh-md-devices-heading-group">
            <h3 className="dsh-md-devices-heading">{t('devicesHeading')}</h3>
            {hasDevices && (
              <span className="dsh-md-devices-count-pill">{snapshot.devices.length}</span>
            )}
          </div>
          {!addingNew && (
            <Button
              variant="outline"
              size="sm"
              icon={<IconPlusOutlineRegular size={13} />}
              onClick={() => {
                setEditingDeviceId(null)
                setAddingNew(true)
              }}
            >
              {t('addDevice')}
            </Button>
          )}
        </div>

        {addingNew && (
          <div className="dsh-md-card">
            <DeviceEditorForm
              sshConfigHosts={snapshot.sshConfigHosts}
              sshKeys={sshKeys}
              t={t}
              onSaved={() => {
                setAddingNew(false)
                pushToast(t('savedNotice'), 'success')
              }}
              onCancel={() => setAddingNew(false)}
            />
          </div>
        )}

        {!hasDevices && !addingNew ? (
          <div className="dsh-md-card dsh-md-empty-card">
            <div className="dsh-md-row-name">{t('noDevicesTitle')}</div>
            <div className="dsh-md-pref-desc">{t('noDevicesDesc')}</div>
          </div>
        ) : hasDevices ? (
          <ul className="dsh-md-rows">
            {snapshot.devices.map((dev) => {
              const isEditing = editingDeviceId === dev.id
              return (
                <li key={dev.id} className="dsh-md-card">
                  <div className="dsh-md-row-head">
                    <div className="dsh-md-row-identity">
                      <StateDot state={deviceStateToDotState(dev.state)} size={8} />
                      <span className="dsh-md-row-name">{dev.name}</span>
                      <UnreadCountBadge
                        count={unreadCountForDevice(unread, dev.id)}
                        t={t}
                      />
                      <span className="dsh-md-device-endpoint" title={formatCompactDeviceTarget(dev)}>
                        {formatCompactDeviceTarget(dev)}
                      </span>
                      {dev.latencyMs !== undefined && dev.state === 'connected' && (
                        <span className="dsh-md-latency-text">{dev.latencyMs}ms</span>
                      )}
                      {dev.runningSessionCount > 0 && (
                        <span className="dsh-md-session-count-badge">
                          {t('runningCount').replace('{count}', String(dev.runningSessionCount))}
                        </span>
                      )}
                      {dev.pendingApprovalCount > 0 && (
                        <Tag>{t('pendingCount').replace('{count}', String(dev.pendingApprovalCount))}</Tag>
                      )}
                      {dev.authState === 'required' && (
                        <span className="dsh-md-auth-required-tag">{t('authRequired')}</span>
                      )}
                    </div>

                    <div className="dsh-md-row-actions">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={modeBusy}
                        icon={<IconRightUpOutlineRegular size={13} />}
                        onClick={() => {
                          if (modeBusy) return
                          setModeBusy(true)
                          void clientStore.selectNativeDevice(dev.id).then((res) => {
                            setModeBusy(false)
                            if (!res.ok) {
                              pushToast(`${t('actionFailed')}: ${res.error ?? ''}`, 'error')
                              return
                            }
                            onCloseSettings?.()
                          })
                        }}
                      >
                        {t('openNative')}
                      </Button>

                      <div className="dsh-md-icon-actions-group">
                        <Tooltip label={t('reconnect')} side="top">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('reconnect')}
                            onClick={() => {
                              void clientStore.reconnectDevice(dev.id).then((res) => {
                                if (res.ok) {
                                  pushToast(t('reconnectedNotice'), 'success')
                                } else {
                                  pushToast(`${t('actionFailed')}: ${res.error ?? ''}`, 'error')
                                }
                              })
                            }}
                          >
                            <IconRefreshOutlineRegular size={14} />
                          </Button>
                        </Tooltip>

                        <Tooltip label={t('editDevice')} side="top">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('editDevice')}
                            aria-expanded={isEditing}
                            onClick={() => {
                              setAddingNew(false)
                              setEditingDeviceId(isEditing ? null : dev.id)
                            }}
                          >
                            <IconEditOutlineRegular size={14} />
                          </Button>
                        </Tooltip>

                        <Tooltip label={t('remove')} side="top">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('remove')}
                            onClick={() => {
                              setDeleteError(null)
                              setDeleteTarget(dev)
                            }}
                          >
                            <IconTrashOutlineRegular size={14} />
                          </Button>
                        </Tooltip>
                      </div>
                    </div>
                  </div>

                  {!isEditing && dev.lastError !== undefined && (
                    <p className="dsh-md-error-text">{dev.lastError}</p>
                  )}

                  {isEditing && (
                    <DeviceEditorForm
                      device={dev}
                      sshConfigHosts={snapshot.sshConfigHosts}
                      sshKeys={sshKeys}
                      t={t}
                      onSaved={() => {
                        setEditingDeviceId(null)
                        pushToast(t('savedNotice'), 'success')
                      }}
                      onCancel={() => setEditingDeviceId(null)}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>

      {/* Support report: display mode, per-device staging, and the browser's
          own viewport/tab-bar geometry in one copyable block. An "empty
          workspace group" report is decided here instead of by guessing which
          surface the user is looking at. */}
      <div className="dsh-md-diagnostics">
        <div className="dsh-md-pref-row">
          <div>
            <div className="dsh-md-pref-title">{t('diagnosticsTitle')}</div>
            <div className="dsh-md-pref-desc">{t('diagnosticsDesc')}</div>
          </div>
          <div className="dsh-md-diagnostics-actions">
            <Button variant="outline" size="sm" disabled={diagnosticsBusy} onClick={runDiagnostics}>
              {diagnosticsBusy ? `${t('diagnosticsRun')}…` : t('diagnosticsRun')}
            </Button>
            {diagnostics !== null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { void copyDiagnosticsText(diagnostics) }}
              >
                {diagnosticsCopied ? t('diagnosticsCopied') : t('diagnosticsCopy')}
              </Button>
            )}
          </div>
        </div>
        <p className="dsh-md-diagnostics-mode">
          {t('diagnosticsModeLine')
            .replace('{mode}', t(state.displayMode === 'native' ? 'modeNative' : 'modeAggregated'))
            .replace('{devices}', String(snapshot.devices.length))
            .replace('{connected}', String(snapshot.devices.filter(device => device.state === 'connected').length))
            .replace('{workspaces}', String(snapshot.logicalWorkspaces.length))}
        </p>
        {diagnostics !== null && (
          <pre className="dsh-md-diagnostics-output">{JSON.stringify(diagnostics, null, 2)}</pre>
        )}
      </div>

      {/* Native Delete Confirmation Modal */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => {
          if (!deleting) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
        title={
          deleteTarget === null
            ? ''
            : t('deleteTitle').replace('{name}', deleteTarget.name)
        }
        closeLabel={t('close')}
        description={deleteTarget === null ? undefined : t('deleteDescription')}
        footer={
          <>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => {
                setDeleteTarget(null)
                setDeleteError(null)
              }}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={deleting}
              onClick={() => { void handleConfirmDelete() }}
            >
              {deleting ? t('deletingDevice') : t('deleteConfirm')}
            </Button>
          </>
        }
      >
        {deleteError !== null ? (
          <p className="dsh-md-error-text" role="alert">
            {deleteError}
          </p>
        ) : null}
      </Modal>

      {toastNotice !== null && (
        <Toast
          key={toastNotice.seq}
          text={toastNotice.text}
          tone={toastNotice.tone}
          onDone={() => setToastNotice(null)}
        />
      )}
    </div>
  )
}
