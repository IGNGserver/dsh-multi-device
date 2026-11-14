/**
 * Native Settings Section for `dsh-multi-device` (`MultiDeviceHubPanel`).
 *
 * Mounted inside Settings → Multi-Device (`settings.section`, `id: 'multi-device'`)
 * and Plugins → dsh-multi-device (`plugins.bundle.config`).
 *
 * Built 100% with `@deepseek-ai/dsh-client-ui-primitives` following the layout and
 * interaction conventions of `@deepseek-ai/dsh-client-ui-settings-general` and
 * `@deepseek-ai/dsh-client-ui-settings-models`:
 * 1. Preferences that only serve the device tab strip: cross-Host read state.
 * 2. Remote Devices list: row cards with `StateDot`, `Tag`, open-device action,
 *    reconnect, inline edit, per-device attention detail and `Modal`-confirmed removal.
 * 3. Streamlined Add/Edit form: Only 3 core inputs visible by default (SSH Host,
 *    optional Display Name, optional Launch URL / Token), with `~/.ssh/config` quick
 *    fill and a collapsed `DisclosureRow` for non-default ports, keys, or ProxyJump.
 *
 * @module dsh-multi-device/client/MultiDeviceHubPanel
 */
import {
  Button,
  DisclosureRow,
  IconCheckCircleFillRegular,
  IconEditOutlineRegular,
  IconPlusOutlineRegular,
  IconRefreshOutlineRegular,
  IconRightUpOutlineRegular,
  IconTrashOutlineRegular,
  Input,
  Modal,
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
  type SshConfigHostEntry,
  type SshKeyEntry,
  type UpsertDeviceInput,
} from '../contract.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import type { MultiDeviceDiagnostics } from '../runtime.ts'
import { attentionUnreadIds } from '../attention.ts'
import { AttentionDetails } from './AttentionDetails.tsx'
import { countableUnreadIds, EMPTY_UNREAD_SESSION_IDS, groupUnreadSessionIds } from './unreadCounts.ts'
import {
  clientStore,
  deviceStateToDotState,
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
          size="sm"
          className="dsh-md-icon-btn isCompact dsh-md-secret-toggle"
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

function DeviceEditorForm({
  device,
  sshConfigHosts,
  sshKeys,
  t,
  onSaved,
  onCancel,
  onRemove,
}: {
  device?: DeviceView
  sshConfigHosts: readonly SshConfigHostEntry[]
  sshKeys: readonly SshKeyEntry[]
  t: (key: MultiDeviceLocaleKey) => string
  onSaved: () => void
  onCancel: () => void
  onRemove?: () => void
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
    device === undefined || device.ssh?.bootstrapFromRemoteCredentials === true,
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
        bootstrapFromRemoteCredentials: bootstrapCredentials,
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
    // rejected every request with a bare 401. Probe auth/tunnel first when
    // enabled; saving as disabled skips connection probing intentionally.
    if (!saveAnyway && deviceEnabled) {
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
          {onRemove !== undefined && (
            <Button
              variant="ghost"
              size="sm"
              className="dsh-md-danger-action"
              disabled={busy}
              icon={<IconTrashOutlineRegular size={13} />}
              onClick={onRemove}
            >
              {t('remove')}
            </Button>
          )}
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
  onCloseSettings?: () => void
  hideHeader?: boolean
}): React.ReactElement {
  const state = useMultiDeviceState()
  const { snapshot } = state
  // Same visibility rules as the tab strip: archived and subagent Sessions
  // have no standalone row, so none of them may inflate a device's reminder count.
  const unread = snapshot.attentionByDevice !== undefined
    ? attentionUnreadIds(snapshot.attentionByDevice)
    : countableUnreadIds(
        snapshot.unreadSessionIds,
        snapshot.archivedSessionIds,
        snapshot.subagentSessionIds,
      )
  const unreadByDevice = groupUnreadSessionIds(unread)

  const [addingNew, setAddingNew] = useState(false)
  const [editingDeviceId, setEditingDeviceId] = useState<DeviceId | null>(null)
  const [togglingDeviceId, setTogglingDeviceId] = useState<DeviceId | null>(null)
  const [sshKeys, setSshKeys] = useState<readonly SshKeyEntry[]>([])
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

  const hasDevices = snapshot.devices.length > 0

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

  const handleToggleDeviceEnabled = async (dev: DeviceView, nextEnabled: boolean): Promise<void> => {
    if (togglingDeviceId === dev.id) return
    setTogglingDeviceId(dev.id)
    const res = await clientStore.setDeviceEnabled(dev.id, nextEnabled)
    setTogglingDeviceId(prev => (prev === dev.id ? null : prev))
    if (!res.ok) {
      pushToast(`${t('actionFailed')}: ${res.error ?? ''}`, 'error')
      return
    }
    const key = nextEnabled ? 'deviceEnabledNotice' : 'deviceDisabledNotice'
    pushToast(t(key).replace('{name}', dev.name), 'success')
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

      {/* Global Preferences (aligned with DSH General Settings rows) */}
      <div className="dsh-md-pref-list">
        <div className="dsh-md-pref-row">
          <div>
            <div className="dsh-md-pref-title">{t('taskbarSummaryTitle')}</div>
            <div className="dsh-md-pref-desc">{t('taskbarSummaryDesc')}</div>
          </div>
          <Switch
            checked={snapshot.ui?.taskbarSummary === true}
            label={t('taskbarSummaryTitle')}
            onChange={(enabled) => {
              void clientStore.setUiPreferences({ taskbarSummary: enabled }).then((res) => {
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
        <div className="dsh-md-pref-row">
          <div>
            <div className="dsh-md-pref-title">{t('crossHostUiStateTitle')}</div>
            <div className="dsh-md-pref-desc">{t('crossHostUiStateDesc')}</div>
          </div>
          <Switch
            checked={snapshot.ui?.crossHostUiState === true}
            label={t('crossHostUiStateTitle')}
            onChange={(enabled) => {
              void clientStore.setUiPreferences({ crossHostUiState: enabled }).then((res) => {
                if (!res.ok) pushToast(`${t('actionFailed')}: ${res.error ?? ''}`, 'error')
              })
            }}
          />
        </div>
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
              const isDisabled = dev.enabled === false
              const deviceUnread = (unreadByDevice.get(dev.id) ?? EMPTY_UNREAD_SESSION_IDS).length
              return (
                <li key={dev.id} className={isDisabled ? 'dsh-md-card isDisabled' : 'dsh-md-card'}>
                  <div className="dsh-md-row-head">
                    <div className="dsh-md-row-identity">
                      <StateDot state={deviceStateToDotState(isDisabled ? 'disabled' : dev.state)} size={8} />
                      <span className="dsh-md-row-name">{dev.name}</span>
                      {isDisabled ? (
                        <Tag tone="outline">{t('deviceDisabledTag')}</Tag>
                      ) : (
                        <AttentionDetails
                          view={snapshot.attentionByDevice?.[dev.id]}
                          deviceName={dev.name}
                          t={t}
                          fallback={{
                            runningCount: snapshot.attentionByDevice === undefined ? dev.runningSessionCount : undefined,
                            pendingCount: snapshot.attentionByDevice === undefined ? dev.pendingApprovalCount : undefined,
                            unreadSessionIds: unreadByDevice.get(dev.id) ?? EMPTY_UNREAD_SESSION_IDS,
                            fresh: snapshot.attentionByDevice === undefined && dev.state === 'connected' && dev.catalogStale !== true,
                          }}
                        />
                      )}
                      <span className="dsh-md-device-endpoint" title={formatCompactDeviceTarget(dev)}>
                        {formatCompactDeviceTarget(dev)}
                      </span>
                      {!isDisabled && dev.latencyMs !== undefined && dev.state === 'connected' && (
                        <span className="dsh-md-latency-text">{dev.latencyMs}ms</span>
                      )}

                      {!isDisabled && dev.authState === 'required' && (
                        <span className="dsh-md-auth-required-tag">{t('authRequired')}</span>
                      )}
                    </div>

                    <div className="dsh-md-row-actions">
                      {!isDisabled && (
                        <Button
                          variant="outline"
                          size="sm"
                          icon={<IconRightUpOutlineRegular size={13} />}
                          onClick={() => {
                            void clientStore.selectNativeDevice(dev.id).then((res) => {
                              if (!res.ok) {
                                pushToast(`${t('actionFailed')}: ${res.error ?? ''}`, 'error')
                                return
                              }
                              onCloseSettings?.()
                            })
                          }}
                        >
                          {t('openDevice')}
                        </Button>
                      )}

                      <div className="dsh-md-icon-actions-group">
                        {!isDisabled && deviceUnread > 0 && (
                          <Tooltip label={t('clearUnread')} side="top">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="dsh-md-icon-btn"
                              aria-label={t('clearUnread')}
                              onClick={() => {
                                void clientStore.markDeviceRead(dev.id).then((res) => {
                                  if (res.ok) {
                                    pushToast(
                                      t('clearedUnreadNotice').replace('{count}', String(res.changed)),
                                      'success',
                                    )
                                  } else {
                                    pushToast(`${t('actionFailed')}: ${res.error ?? ''}`, 'error')
                                  }
                                })
                              }}
                            >
                              <IconCheckCircleFillRegular size={14} />
                            </Button>
                          </Tooltip>
                        )}

                        {!isDisabled && (
                          <Tooltip label={t('reconnect')} side="top">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="dsh-md-icon-btn"
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
                        )}

                        <Tooltip label={t('editDevice')} side="top">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="dsh-md-icon-btn"
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
                            size="sm"
                            className="dsh-md-icon-btn isDanger"
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

                      <Tooltip label={t(isDisabled ? 'enableDevice' : 'disableDevice')} side="top">
                        <span className="dsh-md-device-toggle">
                          <Switch
                            checked={!isDisabled}
                            disabled={togglingDeviceId === dev.id}
                            label={`${t(isDisabled ? 'enableDevice' : 'disableDevice')}: ${dev.name}`}
                            onChange={(checked) => { void handleToggleDeviceEnabled(dev, checked) }}
                          />
                        </span>
                      </Tooltip>
                    </div>
                  </div>

                  {!isEditing && !isDisabled && dev.lastError !== undefined && (
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
                      onRemove={() => {
                        setDeleteError(null)
                        setDeleteTarget(dev)
                      }}
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
          {t('diagnosticsSummaryLine')
            .replace('{devices}', String(snapshot.devices.length))
            .replace('{connected}', String(snapshot.devices.filter(device => device.state === 'connected').length))}
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
