/**
 * Multi-Device Management & Git Aggregation Hub Panel (`MultiDeviceHubPanel`).
 *
 * Used both as a dedicated main panel (`multi-device-hub`) and inside
 * Settings → Built-in plugins (`settings.plugins.tab`).
 *
 * Provides three tabs:
 * 1. Devices & SSH Connections (with `~/.ssh/config` one-click host import, SSH tunnel / HTTP(S)
 *    direct configuration, persistent token/cookie/auto-SSH auth, and live connection test).
 * 2. Git Workspace Aggregation (toggle `autoGitAggregate`, inspect merged Logical Workspaces,
 *    pick preferred device for "+ New Session", split/restore workspaces, and create custom
 *    manual aggregation rules).
 * 3. Native Viewport (embedded Keep-Alive remote DSH Web UI with 1-click fullscreen toggle).
 *
 * @module dsh-multi-device/client/MultiDeviceHubPanel
 */
import React, { useEffect, useState } from 'react'
import {
  type DeviceAuthMode,
  type DeviceId,
  type DeviceView,
  LOCAL_DEVICE_ID,
  type SshKeyEntry,
  type SshTunnelEngine,
  type UpsertDeviceInput,
  workspaceMemberKey,
} from '../contract.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { clientStore, type HubTabId, useMultiDeviceState } from './state.ts'

export function MultiDeviceHubPanel({
  t,
  defaultTab = 'devices',
}: {
  t: (key: MultiDeviceLocaleKey) => string
  defaultTab?: HubTabId
}): React.ReactElement {
  const state = useMultiDeviceState()
  const [tab, setTab] = useState<HubTabId>(defaultTab)
  const [editingDevice, setEditingDevice] = useState<DeviceView | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  // Device Form State
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [sshHost, setSshHost] = useState('')
  const [sshUser, setSshUser] = useState('')
  const [sshPort, setSshPort] = useState('22')
  const [sshKeyPath, setSshKeyPath] = useState('')
  const [sshPassphrase, setSshPassphrase] = useState('')
  const [sshKeys, setSshKeys] = useState<readonly SshKeyEntry[]>([])
  const [sshProxyJump, setSshProxyJump] = useState('')
  const [remotePort, setRemotePort] = useState('3080')
  const [sshEngine, setSshEngine] = useState<SshTunnelEngine>('auto')
  const [authMode, setAuthMode] = useState<DeviceAuthMode>('auto')
  const [authCredential, setAuthCredential] = useState('')
  const [keepNativeAlive, setKeepNativeAlive] = useState(true)

  const [testing, setTesting] = useState(false)
  const [testFeedback, setTestFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Manual Rule Builder State
  const [ruleTitle, setRuleTitle] = useState('')
  const [ruleGitRemote, setRuleGitRemote] = useState('')
  const [selectedMemberKeys, setSelectedMemberKeys] = useState<Set<string>>(() => new Set())
  const [remoteWorkspaceDeviceId, setRemoteWorkspaceDeviceId] = useState('')
  const [remoteWorkspacePath, setRemoteWorkspacePath] = useState('')
  const [remoteWorkspaceError, setRemoteWorkspaceError] = useState<string | null>(null)
  const [sessionNotice, setSessionNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const resetForm = (dev?: DeviceView): void => {
    setTestFeedback(null)
    setSaveError(null)
    if (dev === undefined) {
      setEditingDevice(null)
      setName('')
      setLabel('')
      setSshHost('')
      setSshUser('')
      setSshPort('22')
      setSshKeyPath('')
      setSshPassphrase('')
      setSshProxyJump('')
      setRemotePort('3080')
      setSshEngine('auto')
      setAuthMode('auto')
      setAuthCredential('')
      setKeepNativeAlive(true)
      return
    }
    setEditingDevice(dev)
    setName(dev.name)
    setLabel(dev.label ?? '')
    setSshHost(dev.ssh?.host ?? '')
    setSshUser(dev.ssh?.username ?? '')
    setSshPort(String(dev.ssh?.port ?? 22))
    setSshKeyPath(dev.ssh?.privateKeyPath ?? '')
    setSshPassphrase('')
    setSshProxyJump(dev.ssh?.proxyJump ?? '')
    setRemotePort(String(dev.ssh?.remotePort ?? 3080))
    setSshEngine(dev.ssh?.engine ?? 'auto')
    setAuthMode('auto')
    setAuthCredential('')
    setKeepNativeAlive(dev.keepNativeAlive)
  }

  const buildInputFromForm = (): UpsertDeviceInput => ({
    ...(editingDevice !== null ? { id: editingDevice.id } : {}),
    name: name.trim() || sshHost.trim() || 'remote-device',
    ...(label.trim() !== '' ? { label: label.trim() } : {}),
    enabled: true,
    keepNativeAlive,
    transport: {
      kind: 'ssh',
      host: sshHost.trim(),
      ...(sshUser.trim() !== '' ? { username: sshUser.trim() } : {}),
      ...(Number(sshPort) > 0 ? { port: Number(sshPort) } : {}),
      ...(sshKeyPath.trim() !== '' ? { privateKeyPath: sshKeyPath.trim() } : {}),
      ...(sshPassphrase.trim() !== '' ? { passphrase: sshPassphrase.trim() } : {}),
      ...(sshProxyJump.trim() !== '' ? { proxyJump: sshProxyJump.trim() } : {}),
      remotePort: Number(remotePort) > 0 ? Number(remotePort) : 3080,
      engine: sshEngine,
    },
    auth: {
      mode: authMode,
      ...(authCredential.trim() !== '' ? { credential: authCredential.trim() } : {}),
    },
  })

  const refreshSshKeys = async (): Promise<void> => {
    setSshKeys(await clientStore.listSshKeys())
  }

  useEffect(() => {
    if (showAddForm || editingDevice !== null) {
      void refreshSshKeys()
    }
  }, [showAddForm, editingDevice])

  const handleImportSshHost = (alias: string): void => {
    const entry = state.snapshot.sshConfigHosts.find(h => h.alias === alias)
    if (entry === undefined) return
    setSshHost(entry.alias)
    if (name.trim() === '') setName(entry.alias)
    setSshUser(entry.user ?? '')
    setSshPort(String(entry.port ?? 22))
    setSshKeyPath(entry.identityFile ?? '')
    setSshProxyJump(entry.proxyJump ?? '')
  }

  const handleTestConnection = async (): Promise<void> => {
    setTesting(true)
    setTestFeedback(null)
    const res = await clientStore.testDevice(buildInputFromForm())
    setTesting(false)
    if (res.ok) {
      setTestFeedback({
        ok: true,
        text: `✓ Connected (DSH ${res.remoteDshVersion ?? res.protocolVersion}, RTT ${res.latencyMs}ms)`,
      })
    } else {
      setTestFeedback({ ok: false, text: `✕ ${res.error}` })
    }
  }

  const handleSaveDevice = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setSaveError(null)
    const res = await clientStore.upsertDevice(buildInputFromForm())
    if (!res.ok) {
      setSaveError(res.error ?? 'Failed to save device')
      return
    }
    setShowAddForm(false)
    setEditingDevice(null)
  }

  const handleCreateRemoteWorkspace = async (): Promise<void> => {
    setRemoteWorkspaceError(null)
    if (remoteWorkspaceDeviceId === '' || remoteWorkspacePath.trim() === '') {
      setRemoteWorkspaceError(t('remoteWorkspaceRequired'))
      return
    }
    const res = await clientStore.createRemoteWorkspace({
      deviceId: remoteWorkspaceDeviceId as DeviceId,
      path: remoteWorkspacePath.trim(),
    })
    if (!res.ok) {
      setRemoteWorkspaceError(res.error ?? t('remoteWorkspaceFailed'))
      return
    }
    setRemoteWorkspacePath('')
  }

  const handleCreateSession = async (deviceId: DeviceId, workspaceId: string): Promise<void> => {
    setSessionNotice(null)
    const res = await clientStore.createRemoteSession({ deviceId, workspaceId })
    setSessionNotice(
      res.ok
        ? `✓ ${t('newSessionCreated')} ${res.sessionId ?? ''}`
        : `✕ ${t('newSessionFailed')}: ${res.error ?? ''}`,
    )
  }

  const { snapshot } = state

  return (
    <div className="dsh-md-hub-root">
      <div className="dsh-md-hub-header">
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{t('panelTitle')}</h2>
          {!snapshot.hostStatus.aggregatedGatewayActive && snapshot.hostStatus.aggregatedGatewayError && (
            <div style={{ marginTop: 4, fontSize: 12, color: '#f59e0b' }}>
              ⚠ {t('gatewayDegradedNotice')} ({snapshot.hostStatus.aggregatedGatewayError})
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="dsh-md-mode-seg">
            <button
              type="button"
              className="dsh-md-mode-btn"
              data-active={state.displayMode === 'aggregated' ? 'true' : 'false'}
              onClick={() => clientStore.setDisplayMode('aggregated')}
            >
              {t('modeAggregated')}
            </button>
            <button
              type="button"
              className="dsh-md-mode-btn"
              data-active={state.displayMode === 'native' ? 'true' : 'false'}
              onClick={() => clientStore.setDisplayMode('native')}
            >
              {t('modeNative')}
            </button>
          </div>
          <button
            type="button"
            className="dsh-md-btn dsh-md-btn-primary"
            onClick={() => {
              resetForm()
              setTab('devices')
              setShowAddForm(true)
            }}
          >
            + {t('addDevice')}
          </button>
        </div>
      </div>

      <div className="dsh-md-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className="dsh-md-tab"
          data-active={tab === 'devices' ? 'true' : 'false'}
          onClick={() => setTab('devices')}
        >
          {t('tabDevices')} ({snapshot.devices.length})
        </button>
        <button
          type="button"
          role="tab"
          className="dsh-md-tab"
          data-active={tab === 'git' ? 'true' : 'false'}
          onClick={() => setTab('git')}
        >
          {t('tabGitAggregation')} ({snapshot.logicalWorkspaces.length})
        </button>
        <button
          type="button"
          role="tab"
          className="dsh-md-tab"
          data-active={tab === 'native' ? 'true' : 'false'}
          onClick={() => setTab('native')}
        >
          {t('tabNative')}
        </button>
      </div>

      {tab === 'devices' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(showAddForm || editingDevice !== null) && (
            <form className="dsh-md-card" onSubmit={(e) => { void handleSaveDevice(e) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 14 }}>
                  {editingDevice !== null ? t('editDevice') : t('addDevice')}
                </strong>
                {snapshot.sshConfigHosts.length > 0 && (
                  <select
                    className="dsh-md-select"
                    defaultValue=""
                    aria-label={t('importSshConfig')}
                    onChange={(e) => handleImportSshHost(e.currentTarget.value)}
                  >
                    <option value="" disabled>
                      ⚡ {t('selectSshHostPlaceholder')}
                    </option>
                    {snapshot.sshConfigHosts.map((h) => (
                      <option key={h.alias} value={h.alias}>
                        {h.alias} ({h.user ? `${h.user}@` : ''}{h.hostName}{h.port && h.port !== 22 ? `:${h.port}` : ''})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="dsh-md-grid">
                <div className="dsh-md-field">
                  <label>{t('deviceName')}</label>
                  <input
                    className="dsh-md-input"
                    required
                    value={name}
                    placeholder={t('deviceNamePlaceholder')}
                    onChange={e => setName(e.currentTarget.value)}
                  />
                </div>
                <div className="dsh-md-field">
                  <label>{t('deviceLabel')}</label>
                  <input
                    className="dsh-md-input"
                    value={label}
                    placeholder={t('deviceLabelPlaceholder')}
                    onChange={e => setLabel(e.currentTarget.value)}
                  />
                </div>
              </div>

              <div className="dsh-md-grid">
                <div className="dsh-md-field">
                  <label>{t('sshHost')}</label>
                  <input
                    className="dsh-md-input"
                    required
                    value={sshHost}
                    placeholder={t('sshHostPlaceholder')}
                    onChange={e => setSshHost(e.currentTarget.value)}
                  />
                </div>
                <div className="dsh-md-field">
                  <label>{t('sshUser')}</label>
                  <input
                    className="dsh-md-input"
                    value={sshUser}
                    placeholder="root / ubuntu"
                    onChange={e => setSshUser(e.currentTarget.value)}
                  />
                </div>
                <div className="dsh-md-field">
                  <label>{t('sshPort')}</label>
                  <input
                    className="dsh-md-input"
                    type="number"
                    value={sshPort}
                    onChange={e => setSshPort(e.currentTarget.value)}
                  />
                </div>
                <div className="dsh-md-field">
                  <label>{t('remoteDshPort')}</label>
                  <input
                    className="dsh-md-input"
                    type="number"
                    value={remotePort}
                    onChange={e => setRemotePort(e.currentTarget.value)}
                  />
                </div>
                <div className="dsh-md-field">
                  <label>{t('sshKeySelect')}</label>
                  <select
                    className="dsh-md-select"
                    value={sshKeyPath}
                    onChange={e => setSshKeyPath(e.currentTarget.value)}
                  >
                    <option value="">{t('sshKeyAuto')}</option>
                    {sshKeys.map(key => (
                      <option key={key.path} value={key.path}>
                        {key.name}{key.encrypted ? ' (🔒)' : ''}{key.permissionsTooOpen ? ' ⚠' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="dsh-md-field">
                  <label>{t('sshKeyPath')}</label>
                  <input
                    className="dsh-md-input"
                    value={sshKeyPath}
                    placeholder="~/.ssh/id_ed25519"
                    onChange={e => setSshKeyPath(e.currentTarget.value)}
                  />
                </div>
                <div className="dsh-md-field">
                  <label>{t('sshKeyPassphrase')}</label>
                  <input
                    className="dsh-md-input"
                    type="password"
                    autoComplete="new-password"
                    value={sshPassphrase}
                    placeholder={t('sshKeyPassphrasePlaceholder')}
                    onChange={e => setSshPassphrase(e.currentTarget.value)}
                  />
                </div>
                <div className="dsh-md-field">
                  <label>{t('sshProxyJump')}</label>
                  <input
                    className="dsh-md-input"
                    value={sshProxyJump}
                    placeholder="bastion-host"
                    onChange={e => setSshProxyJump(e.currentTarget.value)}
                  />
                </div>
                <div className="dsh-md-field">
                  <label>{t('sshEngine')}</label>
                  <select
                    className="dsh-md-select"
                    value={sshEngine}
                    onChange={e => setSshEngine(e.currentTarget.value as SshTunnelEngine)}
                  >
                    <option value="auto">{t('sshEngineAuto')}</option>
                    <option value="system-ssh">{t('sshEngineSystem')}</option>
                    <option value="ssh2">{t('sshEngineSsh2')}</option>
                  </select>
                </div>
              </div>

              <div className="dsh-md-grid">
                <div className="dsh-md-field">
                  <label>{t('authMode')}</label>
                  <select
                    className="dsh-md-select"
                    value={authMode}
                    onChange={e => setAuthMode(e.currentTarget.value as DeviceAuthMode)}
                  >
                    <option value="auto">{t('authAuto')}</option>
                    <option value="token">{t('authToken')}</option>
                    <option value="cookie">{t('authCookie')}</option>
                    <option value="bearer">{t('authBearer')}</option>
                    <option value="none">{t('authNone')}</option>
                  </select>
                </div>
                {authMode !== 'none' && (
                  <div className="dsh-md-field">
                    <label>{t('authCredential')}</label>
                    <input
                      className="dsh-md-input"
                      type="password"
                      autoComplete="new-password"
                      value={authCredential}
                      placeholder={t('authCredentialPlaceholder')}
                      onChange={e => setAuthCredential(e.currentTarget.value)}
                    />
                  </div>
                )}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={keepNativeAlive}
                  onChange={e => setKeepNativeAlive(e.currentTarget.checked)}
                />
                {t('keepNativeAlive')}
              </label>

              {testFeedback !== null && (
                <div style={{ fontSize: 12, color: testFeedback.ok ? '#10b981' : '#ef4444' }}>
                  {testFeedback.text}
                </div>
              )}
              {saveError !== null && (
                <div style={{ fontSize: 12, color: '#ef4444' }}>{saveError}</div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="dsh-md-btn"
                  disabled={testing}
                  onClick={() => { void handleTestConnection() }}
                >
                  {testing ? t('testingConnection') : t('testConnection')}
                </button>
                <button
                  type="button"
                  className="dsh-md-btn"
                  onClick={() => {
                    setShowAddForm(false)
                    setEditingDevice(null)
                  }}
                >
                  {t('cancel')}
                </button>
                <button type="submit" className="dsh-md-btn dsh-md-btn-primary">
                  {t('saveDevice')}
                </button>
              </div>
            </form>
          )}

          {actionError !== null && tab === 'devices' && (
            <div style={{ fontSize: 12, color: '#ef4444' }}>{actionError}</div>
          )}

          {snapshot.devices.length === 0 ? (
            <div className="dsh-md-card" style={{ alignItems: 'center', textAlign: 'center', padding: 32 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{t('noDevicesTitle')}</div>
              <div style={{ fontSize: 13, color: 'var(--dsw-alias-label-tertiary, #9ca3af)', maxWidth: 460 }}>
                {t('noDevicesDesc')}
              </div>
            </div>
          ) : (
            <div className="dsh-md-grid">
              {snapshot.devices.map((dev) => (
                <div key={dev.id} className="dsh-md-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="dsh-md-dot" data-state={dev.state} />
                      <strong style={{ fontSize: 14 }}>{dev.name}</strong>
                      {dev.label !== undefined && <span className="dsh-md-badge">{dev.label}</span>}
                    </div>
                    <span className="dsh-md-badge">
                      {dev.state === 'connected'
                        ? t('statusConnected')
                        : dev.state === 'connecting'
                          ? t('statusConnecting')
                          : dev.state === 'reconnecting'
                            ? t('statusReconnecting')
                            : dev.state === 'error'
                              ? t('statusError')
                              : t('statusDisabled')}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary, #9ca3af)', wordBreak: 'break-all' }}>
                    {dev.targetSummary}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <span className="dsh-md-badge"> Workspaces: {dev.workspaceCount}</span>
                    <span className="dsh-md-badge">Sessions: {dev.sessionCount}</span>
                    {dev.runningSessionCount > 0 && (
                      <span className="dsh-md-badge" style={{ color: '#60a5fa' }}>
                        Running: {dev.runningSessionCount}
                      </span>
                    )}
                    {dev.pendingApprovalCount > 0 && (
                      <span className="dsh-md-badge" style={{ color: '#f59e0b' }}>
                        Pending Approval: {dev.pendingApprovalCount}
                      </span>
                    )}
                    {dev.latencyMs !== undefined && (
                      <span className="dsh-md-badge">{dev.latencyMs}ms</span>
                    )}
                    {dev.remoteDshVersion !== undefined && (
                      <span className="dsh-md-badge">DSH {dev.remoteDshVersion}</span>
                    )}
                  </div>

                  {dev.lastError !== undefined && (
                    <div style={{ fontSize: 11, color: '#ef4444', wordBreak: 'break-word' }}>
                      {dev.lastError}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 6, marginTop: 'auto', pt: 4 } as React.CSSProperties}>
                    <button
                      type="button"
                      className="dsh-md-btn dsh-md-btn-primary"
                      onClick={() => clientStore.selectNativeDevice(dev.id)}
                    >
                      {t('openNative')}
                    </button>
                    <button
                      type="button"
                      className="dsh-md-btn"
                      onClick={() => {
                        void clientStore.reconnectDevice(dev.id).then((res) => {
                          setActionError(res.ok ? null : `${t('actionFailed')}: ${res.error ?? ''}`)
                        })
                      }}
                    >
                      {t('reconnect')}
                    </button>
                    <button
                      type="button"
                      className="dsh-md-btn"
                      onClick={() => {
                        resetForm(dev)
                        setTab('devices')
                        setShowAddForm(true)
                      }}
                    >
                      {t('editDevice')}
                    </button>
                    <button
                      type="button"
                      className="dsh-md-btn dsh-md-btn-danger"
                      onClick={() => {
                        void clientStore.removeDevice(dev.id).then((res) => {
                          setActionError(res.ok ? null : `${t('actionFailed')}: ${res.error ?? ''}`)
                        })
                      }}
                    >
                      {t('remove')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'git' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="dsh-md-card" style={{ borderColor: 'rgba(96, 165, 250, 0.35)' }}>
            <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary, #9ca3af)' }}>
              {t('aggregatedScopeNotice')}
            </div>
            {sessionNotice !== null && (
              <div style={{ fontSize: 12, color: sessionNotice.startsWith('✓') ? '#10b981' : '#ef4444' }}>
                {sessionNotice}
              </div>
            )}
            {actionError !== null && (
              <div style={{ fontSize: 12, color: '#ef4444' }}>{actionError}</div>
            )}
          </div>
          <div className="dsh-md-card">
            <strong style={{ fontSize: 14 }}>{t('gitAutoTitle')}</strong>
            <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary, #9ca3af)' }}>
              {t('gitAutoDesc')}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={snapshot.aggregationConfig.autoGitAggregate}
                onChange={(e) => {
                  const enabled = e.currentTarget.checked
                  void clientStore.updateAggregationConfig({
                    autoGitAggregate: enabled,
                  }).then((res) => {
                    setActionError(res.ok ? null : `${t('actionFailed')}: ${res.error ?? ''}`)
                  })
                }}
              />
              {t('gitAutoToggle')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={snapshot.aggregationConfig.prefixUnmatchedWithDevice}
                onChange={(e) => {
                  const enabled = e.currentTarget.checked
                  void clientStore.updateAggregationConfig({
                    prefixUnmatchedWithDevice: enabled,
                  }).then((res) => {
                    setActionError(res.ok ? null : `${t('actionFailed')}: ${res.error ?? ''}`)
                  })
                }}
              />
              {t('gitPrefixToggle')}
            </label>
          </div>

          <div className="dsh-md-card">
            <strong style={{ fontSize: 14 }}>{t('logicalWorkspacesHeading')}</strong>
            {snapshot.logicalWorkspaces.map((lws) => (
              <div
                key={lws.logicalWorkspaceId}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '0.5px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.1))',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong>{lws.title}</strong>
                    <span className="dsh-md-badge">{lws.kind.toUpperCase()}</span>
                    {lws.gitRemote !== undefined && (
                      <span className="dsh-md-badge" style={{ color: '#60a5fa' }}>
                        ⎇ {lws.gitRemote}
                      </span>
                    )}
                    <span className="dsh-md-badge">Sessions: {lws.sessionIds.length}</span>
                  </div>

                  {lws.members.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <span>{t('targetDeviceForNewSession')}</span>
                      <select
                        className="dsh-md-select"
                        style={{ height: 26 }}
                        value={lws.targetDeviceId}
                        onChange={(e) => {
                          void clientStore.setPreferredDevice(
                            lws.logicalWorkspaceId,
                            e.currentTarget.value as DeviceId,
                          )
                        }}
                      >
                        {lws.members.map(m => (
                          <option key={`${m.deviceId}:${m.path}`} value={m.deviceId}>
                            {m.deviceName} ({m.path})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {lws.members.map((m) => {
                    const memberKey = workspaceMemberKey(m.deviceId, m.path)
                    const isExcluded = snapshot.aggregationConfig.excludedMemberKeys.includes(memberKey)
                    return (
                      <span key={memberKey} className="dsh-md-badge">
                        🖥 {m.deviceId === LOCAL_DEVICE_ID ? 'Local' : m.deviceName}: {m.path} ({m.sessionCount})
                        {m.deviceId !== LOCAL_DEVICE_ID && (
                          <button
                            type="button"
                            title={t('newSessionHere')}
                            onClick={() => { void handleCreateSession(m.deviceId, m.remoteWorkspaceId) }}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: '#60a5fa',
                              cursor: 'pointer',
                              marginLeft: 4,
                              fontSize: 11,
                            }}
                          >
                            ＋
                          </button>
                        )}
                        {lws.kind === 'git' && (
                          <button
                            type="button"
                            title={t('splitWorkspace')}
                            onClick={() => {
                              void clientStore.setMemberExcluded(memberKey, !isExcluded).then((res) => {
                                setActionError(res.ok ? null : `${t('actionFailed')}: ${res.error ?? ''}`)
                              })
                            }}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: '#f59e0b',
                              cursor: 'pointer',
                              marginLeft: 4,
                              fontSize: 11,
                            }}
                          >
                            {isExcluded ? t('restoreAutoMerge') : '×'}
                          </button>
                        )}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {snapshot.devices.length > 0 && (
            <div className="dsh-md-card">
              <strong style={{ fontSize: 14 }}>{t('remoteWorkspaceHeading')}</strong>
              <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary, #9ca3af)' }}>
                {t('remoteWorkspaceDesc')}
              </div>
              <div className="dsh-md-grid">
                <div className="dsh-md-field">
                  <label>{t('remoteWorkspaceDevice')}</label>
                  <select
                    className="dsh-md-select"
                    value={remoteWorkspaceDeviceId}
                    onChange={e => setRemoteWorkspaceDeviceId(e.currentTarget.value)}
                  >
                    <option value="">{t('remoteWorkspaceDevicePlaceholder')}</option>
                    {snapshot.devices.map(device => (
                      <option key={device.id} value={device.id}>
                        {device.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="dsh-md-field">
                  <label>{t('remoteWorkspacePath')}</label>
                  <input
                    className="dsh-md-input"
                    value={remoteWorkspacePath}
                    placeholder={t('remoteWorkspacePlaceholder')}
                    onChange={e => setRemoteWorkspacePath(e.currentTarget.value)}
                  />
                </div>
              </div>
              {remoteWorkspaceError !== null && (
                <div style={{ fontSize: 12, color: '#ef4444' }}>{remoteWorkspaceError}</div>
              )}
              <div>
                <button
                  type="button"
                  className="dsh-md-btn dsh-md-btn-primary"
                  onClick={() => { void handleCreateRemoteWorkspace() }}
                >
                  + {t('addRemoteWorkspace')}
                </button>
              </div>
            </div>
          )}

          {snapshot.allPhysicalWorkspaces.length > 0 && (
            <div className="dsh-md-card">
              <strong style={{ fontSize: 14 }}>{t('manualRuleBuilderTitle')}</strong>
              <div className="dsh-md-grid">
                <div className="dsh-md-field">
                  <input
                    className="dsh-md-input"
                    value={ruleTitle}
                    placeholder={t('manualRuleNamePlaceholder')}
                    onChange={e => setRuleTitle(e.currentTarget.value)}
                  />
                </div>
                <div className="dsh-md-field">
                  <input
                    className="dsh-md-input"
                    value={ruleGitRemote}
                    placeholder={t('manualRuleGitPlaceholder')}
                    onChange={e => setRuleGitRemote(e.currentTarget.value)}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {snapshot.allPhysicalWorkspaces.map((pw) => {
                  const key = workspaceMemberKey(pw.deviceId, pw.path)
                  const checked = selectedMemberKeys.has(key)
                  return (
                    <label
                      key={key}
                      className="dsh-md-badge"
                      style={{ cursor: 'pointer', padding: '4px 8px' }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = new Set(selectedMemberKeys)
                          if (e.currentTarget.checked) next.add(key)
                          else next.delete(key)
                          setSelectedMemberKeys(next)
                        }}
                      />
                      {pw.deviceName}: {pw.path}
                    </label>
                  )
                })}
              </div>
              <div>
                <button
                  type="button"
                  className="dsh-md-btn dsh-md-btn-primary"
                  disabled={ruleTitle.trim() === '' || (selectedMemberKeys.size === 0 && ruleGitRemote.trim() === '')}
                  onClick={() => {
                    void clientStore.upsertManualRule({
                      id: `rule-${Date.now()}`,
                      title: ruleTitle.trim(),
                      memberKeys: [...selectedMemberKeys],
                      ...(ruleGitRemote.trim() !== '' ? { gitRemote: ruleGitRemote.trim() } : {}),
                    })
                    setRuleTitle('')
                    setRuleGitRemote('')
                    setSelectedMemberKeys(new Set())
                  }}
                >
                  + {t('createManualRule')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'native' && (
        <div className="dsh-md-card" style={{ alignItems: 'flex-start' }}>
          <strong style={{ fontSize: 14 }}>{t('nativeTabHintTitle')}</strong>
          <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary, #9ca3af)' }}>
            {t('nativeTabHint')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="dsh-md-btn dsh-md-btn-primary"
              onClick={() => clientStore.setDisplayMode('native')}
            >
              {t('openNative')}
            </button>
            <button type="button" className="dsh-md-btn" onClick={() => setTab('devices')}>
              ⚙ {t('tabDevices')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
