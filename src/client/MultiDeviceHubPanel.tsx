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
import {
  type DeviceId,
  type DeviceView,
  type DisplayMode,
  LOCAL_DEVICE_ID,
  type SshConfigHostEntry,
  type SshKeyEntry,
  type UpsertDeviceInput,
} from '../contract.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
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
  if (dev?.ssh === undefined) return false
  return (
    (dev.ssh.remotePort !== undefined && dev.ssh.remotePort !== 3080) ||
    (dev.ssh.port !== undefined && dev.ssh.port !== 22) ||
    (dev.ssh.username !== undefined && dev.ssh.username !== '') ||
    (dev.ssh.privateKeyPath !== undefined && dev.ssh.privateKeyPath !== '') ||
    (dev.ssh.proxyJump !== undefined && dev.ssh.proxyJump !== '')
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
  const [sshPort, setSshPort] = useState(String(device?.ssh?.port ?? 22))
  const [sshKeyPath, setSshKeyPath] = useState(device?.ssh?.privateKeyPath ?? '')
  const [sshPassphrase, setSshPassphrase] = useState('')
  const [sshProxyJump, setSshProxyJump] = useState(device?.ssh?.proxyJump ?? '')

  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
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
      sshPort.trim() !== '' && explicitPort > 0 && (explicitPort !== 22 || parsedHost.port === undefined)
        ? explicitPort
        : (parsedHost.port ?? 22)
    const parsedRemotePort = Number(remotePort)

    return {
      ...(device !== undefined ? { id: device.id } : {}),
      name: name.trim() || effectiveHost || 'remote-device',
      ...(device?.label !== undefined ? { label: device.label } : {}),
      enabled: true,
      keepNativeAlive: device?.keepNativeAlive ?? true,
      transport: {
        kind: 'ssh',
        host: effectiveHost,
        ...(effectiveUser !== undefined && effectiveUser !== '' ? { username: effectiveUser } : {}),
        ...(effectiveSshPort > 0 ? { port: effectiveSshPort } : {}),
        ...(sshKeyPath.trim() !== '' ? { privateKeyPath: sshKeyPath.trim() } : {}),
        ...(sshPassphrase.trim() !== '' ? { passphrase: sshPassphrase.trim() } : {}),
        ...(sshProxyJump.trim() !== '' ? { proxyJump: sshProxyJump.trim() } : {}),
        remotePort: parsedRemotePort > 0 ? parsedRemotePort : 3080,
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
    setSshHost(entry.alias)
    if (name.trim() === '') setName(entry.alias)
    setSshUser(entry.user ?? '')
    setSshPort(String(entry.port ?? 22))
    setSshKeyPath(entry.identityFile ?? '')
    setSshProxyJump(entry.proxyJump ?? '')
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
          <select
            className="dsh-md-native-select dsh-md-native-select-compact"
            value=""
            aria-label={t('importSshPlaceholder')}
            disabled={busy}
            onChange={(e) => handleImportSshHost(e.currentTarget.value)}
          >
            <option value="" disabled>
              {t('importSshPlaceholder')}
            </option>
            {sshConfigHosts.map((h) => (
              <option key={h.alias} value={h.alias}>
                {h.alias} ({h.user ? `${h.user}@` : ''}{h.hostName}{h.port && h.port !== 22 ? `:${String(h.port)}` : ''})
              </option>
            ))}
          </select>
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
              disabled={busy}
              onChange={(e) => setSshPort(e.currentTarget.value)}
            />
          </div>

          <div className="dsh-md-field">
            <label className="dsh-md-field-label" htmlFor={`${formId}-key`}>
              {t('sshKeySelect')}
            </label>
            <select
              id={`${formId}-key`}
              className="dsh-md-native-select"
              value={sshKeyPath}
              disabled={busy}
              onChange={(e) => setSshKeyPath(e.currentTarget.value)}
            >
              <option value="">{t('sshKeyAuto')}</option>
              {hasCustomKeyPath && (
                <option value={sshKeyPath}>{sshKeyPath}</option>
              )}
              {sshKeys.map((key) => (
                <option key={key.path} value={key.path}>
                  {key.name}{key.encrypted ? ' (encrypted)' : ''}{key.permissionsTooOpen ? ' (!)' : ''}
                </option>
              ))}
            </select>
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
            {saving ? t('savingDevice') : t('saveDevice')}
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
  const modeSegId = useId()

  const [addingNew, setAddingNew] = useState(false)
  const [editingDeviceId, setEditingDeviceId] = useState<DeviceId | null>(null)
  const [sshKeys, setSshKeys] = useState<readonly SshKeyEntry[]>([])
  const [aggBusy, setAggBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeviceView | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
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
            options={[
              { value: 'aggregated', label: t('modeAggregated') },
              {
                value: 'native',
                label: t('modeNative'),
                disabled: !hasDevices,
                ...(!hasDevices ? { title: t('modeNativeNoDeviceHint') } : {}),
              },
            ]}
            onChange={(next) => {
              clientStore.setDisplayMode(next)
              if (next === 'native') {
                onCloseSettings?.()
              }
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

        {snapshot.aggregationConfig.autoGitAggregate && mergedWorkspaces.length > 0 && (
          <div className="dsh-md-merged-repos">
            <div className="dsh-md-merged-repos-label">{t('targetDeviceHeading')}</div>
            {mergedWorkspaces.map((lws) => (
              <div key={lws.logicalWorkspaceId} className="dsh-md-merged-repo-row">
                <span className="dsh-md-merged-repo-name" title={lws.gitRemote ?? lws.title}>
                  {lws.title}
                </span>
                <select
                  className="dsh-md-native-select dsh-md-native-select-compact"
                  value={lws.targetDeviceId}
                  aria-label={`${lws.title} - ${t('targetDeviceHeading')}`}
                  onChange={(e) => {
                    void clientStore.setPreferredDevice(
                      lws.logicalWorkspaceId,
                      e.currentTarget.value as DeviceId,
                    )
                  }}
                >
                  {lws.members.map(m => (
                    <option key={`${m.deviceId}:${m.path}`} value={m.deviceId}>
                      {m.deviceId === LOCAL_DEVICE_ID ? 'Local' : m.deviceName} ({m.path})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Remote Devices List & Inline Editor (aligned with DSH Models Settings cards) */}
      <div className="dsh-md-devices-block">
        <div className="dsh-md-devices-header">
          <h3 className="dsh-md-devices-heading">{t('devicesHeading')}</h3>
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
                      <Tag>
                        <span className="dsh-md-code-text">{formatCompactDeviceTarget(dev)}</span>
                      </Tag>
                      {dev.latencyMs !== undefined && dev.state === 'connected' && (
                        <Tag>{dev.latencyMs}ms</Tag>
                      )}
                      {dev.runningSessionCount > 0 && (
                        <Tag>{t('runningCount').replace('{count}', String(dev.runningSessionCount))}</Tag>
                      )}
                      {dev.pendingApprovalCount > 0 && (
                        <Tag>{t('pendingCount').replace('{count}', String(dev.pendingApprovalCount))}</Tag>
                      )}
                    </div>

                    <div className="dsh-md-row-actions">
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<IconRightUpOutlineRegular size={13} />}
                        onClick={() => {
                          clientStore.selectNativeDevice(dev.id)
                          onCloseSettings?.()
                        }}
                      >
                        {t('openNative')}
                      </Button>

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
