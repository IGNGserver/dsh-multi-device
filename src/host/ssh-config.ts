/**
 * System `~/.ssh/config` parser and SSH parameter resolver.
 *
 * Supports:
 * - `Host` blocks (including multiple patterns and `!negated` patterns)
 * - `Include` directives (relative to `~/.ssh` or absolute paths, with basic `*` globbing)
 * - `HostName`, `User`, `Port`, `IdentityFile`, `ProxyJump`, `ProxyCommand`, `ForwardAgent`,
 *   `ServerAliveInterval`, `StrictHostKeyChecking`
 * - `%h` (target hostname), `%u` (local username), `%r` (remote username), `%p` (port), `~` expansion
 * - Default SSH private key discovery (`~/.ssh/id_ed25519`, `~/.ssh/id_ecdsa`, `~/.ssh/id_rsa`)
 *
 * @module dsh-multi-device/host/ssh-config
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { SshConfigHostEntry, SshKeyEntry, SshTransportConfig } from '../contract.ts'

export interface ParsedSshConfigBlock {
  readonly patterns: readonly string[]
  readonly options: Readonly<Record<string, string[]>>
  readonly sourceFile: string
}

export interface ResolvedSshParameters {
  readonly aliasOrHost: string
  readonly hostName: string
  readonly port: number
  readonly user: string
  readonly identityFiles: readonly string[]
  readonly proxyJump?: string
  readonly proxyCommand?: string
  readonly forwardAgent?: boolean
  readonly serverAliveInterval?: number
  readonly strictHostKeyChecking?: string
}

const DEFAULT_KEY_NAMES = ['id_ed25519', 'id_ecdsa', 'id_rsa', 'id_dsa'] as const

/** Expand leading `~` or `~/...` to the user's home directory. */
export function expandHomePath(inputPath: string, home = homedir()): string {
  const trimmed = inputPath.trim()
  if (trimmed === '~') return home
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return resolve(home, trimmed.slice(2))
  }
  return trimmed
}

/** Return existing default private key paths in `~/.ssh`. */
export function discoverDefaultPrivateKeys(home = homedir()): string[] {
  const sshDir = join(home, '.ssh')
  const found: string[] = []
  for (const name of DEFAULT_KEY_NAMES) {
    const candidate = join(sshDir, name)
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        found.push(candidate)
      }
    } catch {
      // Ignore unreadable key candidates
    }
  }
  return found
}

/**
 * Discover candidate private keys under `<home>/.ssh` for the device form.
 *
 * Only files whose first bytes look like PEM/OpenSSH private-key material are
 * returned. Passphrase detection is best-effort (OpenSSH PEM header or the
 * legacy `Proc-Type: 4,ENCRYPTED` marker); the authoritative check remains the
 * SSH client's prompt/agent.
 */
export function listLocalSshKeys(home = homedir()): SshKeyEntry[] {
  const sshDir = join(home, '.ssh')
  if (!existsSync(sshDir)) return []
  const entries: SshKeyEntry[] = []
  let names: string[]
  try {
    names = readdirSync(sshDir)
  } catch {
    return []
  }

  for (const name of names.sort()) {
    if (name.endsWith('.pub')) continue
    if (name === 'config' || name === 'known_hosts' || name === 'authorized_keys') continue
    if (name.startsWith('.')) continue
    const path = join(sshDir, name)
    let mode: number
    let text: string
    try {
      const stat = statSync(path)
      if (!stat.isFile()) continue
      mode = stat.mode
      text = readFileSync(path, 'utf8').slice(0, 4096)
    } catch {
      continue
    }
    if (!/-----BEGIN (?:OPENSSH |RSA |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/.test(text)) continue
    const publicKeyPath = existsSync(`${path}.pub`) ? `${path}.pub` : undefined
    entries.push({
      path,
      name,
      ...(publicKeyPath !== undefined ? { publicKeyPath } : {}),
      encrypted:
        /-----BEGIN ENCRYPTED PRIVATE KEY-----/.test(text) ||
        /^Proc-Type:\s*4,ENCRYPTED/im.test(text) ||
        /ENCRYPTED/.test(text),
      permissionsTooOpen: (mode & 0o077) !== 0,
    })
  }

  return entries
}

/**
 * Parse a `user@host:port` or `ssh://user@host:port` shorthand into fields.
 */
export function parseSshTargetSpec(spec: string): {
  readonly host: string
  readonly username?: string
  readonly port?: number
} {
  const trimmed = spec.trim()
  if (trimmed.startsWith('ssh://')) {
    try {
      const url = new URL(trimmed)
      return {
        host: url.hostname,
        ...(url.username !== '' ? { username: decodeURIComponent(url.username) } : {}),
        ...(url.port !== '' ? { port: Number(url.port) } : {}),
      }
    } catch {
      // Fall through to manual parsing
    }
  }
  let remainder = trimmed
  let username: string | undefined
  const atIndex = remainder.lastIndexOf('@')
  if (atIndex > 0) {
    username = remainder.slice(0, atIndex)
    remainder = remainder.slice(atIndex + 1)
  }
  let host = remainder
  let port: number | undefined
  const colonIndex = remainder.lastIndexOf(':')
  if (colonIndex > 0 && !remainder.includes('[')) {
    const maybePort = Number(remainder.slice(colonIndex + 1))
    if (Number.isInteger(maybePort) && maybePort > 0 && maybePort <= 65535) {
      host = remainder.slice(0, colonIndex)
      port = maybePort
    }
  }
  return {
    host,
    ...(username !== undefined && username !== '' ? { username } : {}),
    ...(port !== undefined ? { port } : {}),
  }
}

/**
 * Parse raw `~/.ssh/config` text into blocks, optionally resolving `Include` files.
 */
export function parseSshConfigText(
  content: string,
  sourceFile = '~/.ssh/config',
  resolveInclude?: (pattern: string, fromFile: string) => { path: string; content: string }[],
  visited = new Set<string>(),
): ParsedSshConfigBlock[] {
  const blocks: ParsedSshConfigBlock[] = []
  let currentPatterns: string[] = ['*']
  let currentOptions: Record<string, string[]> = Object.create(null)

  const flushBlock = (): void => {
    if (Object.keys(currentOptions).length > 0) {
      blocks.push({
        patterns: [...currentPatterns],
        options: currentOptions,
        sourceFile,
      })
    }
  }

  const lines = content.split(/\r?\n/)
  for (const rawLine of lines) {
    const line = stripSshComment(rawLine).trim()
    if (line === '') continue
    const parsed = splitDirective(line)
    if (parsed === undefined) continue
    const key = parsed.key.toLowerCase()
    const rawValue = parsed.value

    if (key === 'host') {
      flushBlock()
      currentPatterns = tokenizeArgs(rawValue)
      currentOptions = Object.create(null)
      continue
    }

    if (key === 'match') {
      flushBlock()
      // Treat Match all as wildcard; ignore complex conditional Match blocks safely
      const tokens = tokenizeArgs(rawValue)
      currentPatterns = tokens.length === 1 && tokens[0]?.toLowerCase() === 'all' ? ['*'] : []
      currentOptions = Object.create(null)
      continue
    }

    if (key === 'include' && resolveInclude !== undefined) {
      for (const pattern of tokenizeArgs(rawValue)) {
        for (const inc of resolveInclude(pattern, sourceFile)) {
          if (visited.has(inc.path)) continue
          visited.add(inc.path)
          blocks.push(...parseSshConfigText(inc.content, inc.path, resolveInclude, visited))
        }
      }
      continue
    }

    if (currentPatterns.length === 0) continue
    const existing = currentOptions[key] ?? []
    existing.push(unquoteValue(rawValue))
    currentOptions[key] = existing
  }

  flushBlock()
  return blocks
}

/**
 * Load and parse the user's `~/.ssh/config` (and any included files).
 */
export function loadSystemSshConfigBlocks(
  configFile = join(homedir(), '.ssh', 'config'),
): ParsedSshConfigBlock[] {
  const expanded = expandHomePath(configFile)
  if (!existsSync(expanded)) return []
  let content: string
  try {
    content = readFileSync(expanded, 'utf8')
  } catch {
    return []
  }
  const visited = new Set<string>([expanded])
  return parseSshConfigText(
    content,
    expanded,
    (pattern) => expandIncludeFiles(pattern),
    visited,
  )
}

let cachedDefaultHosts: { at: number; configFile: string; home: string; hosts: SshConfigHostEntry[] } | undefined
const SSH_CONFIG_CACHE_TTL_MS = 3_000

/**
 * List concrete (non-wildcard) SSH host entries from `~/.ssh/config` for UI discovery/import.
 */
export function listSshConfigHosts(
  configFile = join(homedir(), '.ssh', 'config'),
  home = homedir(),
): SshConfigHostEntry[] {
  const now = Date.now()
  if (
    cachedDefaultHosts !== undefined &&
    cachedDefaultHosts.configFile === configFile &&
    cachedDefaultHosts.home === home &&
    now - cachedDefaultHosts.at < SSH_CONFIG_CACHE_TTL_MS
  ) {
    return cachedDefaultHosts.hosts
  }
  const blocks = loadSystemSshConfigBlocks(configFile)
  const hosts = extractConcreteHostsFromBlocks(blocks, home)
  cachedDefaultHosts = { at: now, configFile, home, hosts }
  return hosts
}

/**
 * Extract concrete host entries from parsed SSH config blocks, applying cascading wildcard rules.
 */
export function extractConcreteHostsFromBlocks(
  blocks: readonly ParsedSshConfigBlock[],
  home = homedir(),
): SshConfigHostEntry[] {
  const seenAliases = new Set<string>()
  const entries: SshConfigHostEntry[] = []

  for (const block of blocks) {
    for (const pattern of block.patterns) {
      if (pattern.startsWith('!') || pattern.includes('*') || pattern.includes('?')) continue
      if (seenAliases.has(pattern)) continue
      seenAliases.add(pattern)

      let hasExplicitUser = false
      let hasExplicitPort = false
      for (const candidate of blocks) {
        if (!matchesHostPatterns(pattern, candidate.patterns)) continue
        if (candidate.options['user']?.[0] !== undefined) hasExplicitUser = true
        if (candidate.options['port']?.[0] !== undefined) hasExplicitPort = true
      }

      const resolved = resolveSshParametersFromBlocks(pattern, blocks, home)
      entries.push({
        alias: pattern,
        hostName: resolved.hostName,
        ...(hasExplicitUser && resolved.user !== '' ? { user: resolved.user } : {}),
        ...(hasExplicitPort ? { port: resolved.port } : { port: 22 }),
        ...(resolved.identityFiles[0] !== undefined ? { identityFile: resolved.identityFiles[0] } : {}),
        ...(resolved.proxyJump !== undefined ? { proxyJump: resolved.proxyJump } : {}),
        ...(resolved.proxyCommand !== undefined ? { proxyCommand: resolved.proxyCommand } : {}),
        ...(resolved.forwardAgent !== undefined ? { forwardAgent: resolved.forwardAgent } : {}),
        sourceFile: block.sourceFile,
      })
    }
  }

  return entries
}

/**
 * Resolve effective SSH parameters for a given `SshTransportConfig` by combining explicit
 * user settings with matching `~/.ssh/config` blocks (first-match-wins per OpenSSH semantics).
 */
export function resolveSshConfigForTransport(
  transport: SshTransportConfig,
  blocks: readonly ParsedSshConfigBlock[] = loadSystemSshConfigBlocks(),
  home = homedir(),
): ResolvedSshParameters {
  const parsedSpec = parseSshTargetSpec(transport.host)
  const targetHost = parsedSpec.host
  const base = resolveSshParametersFromBlocks(targetHost, blocks, home)

  const explicitUser = transport.username?.trim() || parsedSpec.username
  const explicitPort = transport.port ?? parsedSpec.port
  const explicitKey = transport.privateKeyPath?.trim()
  const explicitJump = transport.proxyJump?.trim()

  const identityFiles: string[] = []
  if (explicitKey !== undefined && explicitKey !== '') {
    identityFiles.push(expandHomePath(explicitKey, home))
  }
  for (const file of base.identityFiles) {
    if (!identityFiles.includes(file)) identityFiles.push(file)
  }
  if (identityFiles.length === 0) {
    for (const defKey of discoverDefaultPrivateKeys(home)) {
      if (!identityFiles.includes(defKey)) identityFiles.push(defKey)
    }
  }

  return {
    aliasOrHost: targetHost,
    hostName: base.hostName,
    port: explicitPort ?? base.port,
    user: explicitUser !== undefined && explicitUser !== '' ? explicitUser : base.user,
    identityFiles,
    ...(explicitJump !== undefined && explicitJump !== ''
      ? { proxyJump: explicitJump }
      : base.proxyJump !== undefined
        ? { proxyJump: base.proxyJump }
        : {}),
    ...(base.proxyCommand !== undefined ? { proxyCommand: base.proxyCommand } : {}),
    ...(base.forwardAgent !== undefined ? { forwardAgent: base.forwardAgent } : {}),
    ...(base.serverAliveInterval !== undefined ? { serverAliveInterval: base.serverAliveInterval } : {}),
    ...(base.strictHostKeyChecking !== undefined ? { strictHostKeyChecking: base.strictHostKeyChecking } : {}),
  }
}

/**
 * Apply OpenSSH first-match-wins rules across parsed blocks for a target host alias.
 */
export function resolveSshParametersFromBlocks(
  targetHost: string,
  blocks: readonly ParsedSshConfigBlock[],
  home = homedir(),
): ResolvedSshParameters {
  let hostName: string | undefined
  let user: string | undefined
  let port: number | undefined
  const identityFiles: string[] = []
  let proxyJump: string | undefined
  let proxyCommand: string | undefined
  let forwardAgent: boolean | undefined
  let serverAliveInterval: number | undefined
  let strictHostKeyChecking: string | undefined

  for (const block of blocks) {
    if (!matchesHostPatterns(targetHost, block.patterns)) continue
    const opts = block.options

    if (hostName === undefined && opts['hostname']?.[0] !== undefined) {
      hostName = opts['hostname'][0]
    }
    if (user === undefined && opts['user']?.[0] !== undefined) {
      user = opts['user'][0]
    }
    if (port === undefined && opts['port']?.[0] !== undefined) {
      const p = Number(opts['port'][0])
      if (Number.isInteger(p) && p > 0 && p <= 65535) port = p
    }
    if (opts['identityfile'] !== undefined) {
      for (const rawKey of opts['identityfile']) {
        if (!identityFiles.includes(rawKey)) identityFiles.push(rawKey)
      }
    }
    if (proxyJump === undefined && opts['proxyjump']?.[0] !== undefined) {
      const pj = opts['proxyjump'][0]
      if (pj.toLowerCase() !== 'none') proxyJump = pj
    }
    if (proxyCommand === undefined && opts['proxycommand']?.[0] !== undefined) {
      const pc = opts['proxycommand'][0]
      if (pc.toLowerCase() !== 'none') proxyCommand = pc
    }
    if (forwardAgent === undefined && opts['forwardagent']?.[0] !== undefined) {
      forwardAgent = opts['forwardagent'][0].toLowerCase() === 'yes'
    }
    if (serverAliveInterval === undefined && opts['serveraliveinterval']?.[0] !== undefined) {
      const interval = Number(opts['serveraliveinterval'][0])
      if (Number.isInteger(interval) && interval > 0) serverAliveInterval = interval
    }
    if (strictHostKeyChecking === undefined && opts['stricthostkeychecking']?.[0] !== undefined) {
      strictHostKeyChecking = opts['stricthostkeychecking'][0]
    }
  }

  const localUser = safeLocalUsername()
  const finalUser = user ?? localUser
  const finalPort = port ?? 22
  const finalHostName = expandSshTokens(hostName ?? targetHost, {
    h: targetHost,
    u: localUser,
    r: finalUser,
    p: String(finalPort),
  })
  const tokenMap = {
    h: finalHostName,
    u: localUser,
    r: finalUser,
    p: String(finalPort),
  }

  const expandedIdentityFiles: string[] = []
  for (const file of identityFiles) {
    const expanded = expandHomePath(expandSshTokens(file, tokenMap), home)
    if (!expandedIdentityFiles.includes(expanded)) expandedIdentityFiles.push(expanded)
  }

  return {
    aliasOrHost: targetHost,
    hostName: finalHostName,
    port: finalPort,
    user: finalUser,
    identityFiles: expandedIdentityFiles,
    ...(proxyJump !== undefined ? { proxyJump: expandSshTokens(proxyJump, tokenMap) } : {}),
    ...(proxyCommand !== undefined ? { proxyCommand: expandSshTokens(proxyCommand, tokenMap) } : {}),
    ...(forwardAgent !== undefined ? { forwardAgent } : {}),
    ...(serverAliveInterval !== undefined ? { serverAliveInterval } : {}),
    ...(strictHostKeyChecking !== undefined ? { strictHostKeyChecking } : {}),
  }
}

function safeLocalUsername(): string {
  try {
    return userInfo().username
  } catch {
    return process.env.USER ?? process.env.USERNAME ?? 'root'
  }
}

function expandSshTokens(
  input: string,
  tokens: { h: string; u: string; r: string; p: string },
): string {
  return input.replace(/%([%hurp])/g, (_match, token: string) => {
    if (token === '%') return '%'
    if (token === 'h') return tokens.h
    if (token === 'u') return tokens.u
    if (token === 'r') return tokens.r
    if (token === 'p') return tokens.p
    return token
  })
}

function matchesHostPatterns(host: string, patterns: readonly string[]): boolean {
  let matchedPositive = false
  for (const rawPattern of patterns) {
    if (rawPattern.startsWith('!')) {
      const negated = rawPattern.slice(1)
      if (globToRegExp(negated).test(host)) return false
    } else if (globToRegExp(rawPattern).test(host)) {
      matchedPositive = true
    }
  }
  return matchedPositive
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i')
}

function stripSshComment(line: string): string {
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    if (ch === '#' && !inQuotes) return line.slice(0, i)
  }
  return line
}

function splitDirective(line: string): { key: string; value: string } | undefined {
  const match = /^([A-Za-z0-9]+)(?:\s*=\s*|\s+)(.+)$/.exec(line)
  if (!match || match[1] === undefined || match[2] === undefined) return undefined
  return { key: match[1], value: match[2].trim() }
}

function tokenizeArgs(value: string): string[] {
  const result: string[] = []
  const regex = /"([^"]*)"|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(value)) !== null) {
    result.push(match[1] ?? match[2] ?? '')
  }
  return result.filter(Boolean)
}

function unquoteValue(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1)
  }
  return value
}

/**
 * Resolve an `Include` pattern from the user's ssh config.
 *
 * ssh_config(5): "Files without absolute paths are assumed to be in ~/.ssh if
 * included in a user configuration file". The base is the user config root,
 * not the directory of the file that contains the directive, so nested
 * includes still resolve under ~/.ssh. Absolute and `~/` patterns are kept.
 */
export function resolveUserIncludePattern(pattern: string): string {
  const expanded = expandHomePath(pattern)
  return isAbsolute(expanded) ? expanded : resolve(join(homedir(), '.ssh'), expanded)
}

function expandIncludeFiles(pattern: string): { path: string; content: string }[] {
  const expandedPattern = resolveUserIncludePattern(pattern)
  const dir = dirname(expandedPattern)
  const filePattern = expandedPattern.slice(dir.length + 1)
  if (!existsSync(dir)) return []

  try {
    if (!filePattern.includes('*') && !filePattern.includes('?')) {
      if (existsSync(expandedPattern) && statSync(expandedPattern).isFile()) {
        return [{ path: expandedPattern, content: readFileSync(expandedPattern, 'utf8') }]
      }
      return []
    }
    const regex = globToRegExp(filePattern)
    const entries = readdirSync(dir).sort()
    const results: { path: string; content: string }[] = []
    for (const entry of entries) {
      if (!regex.test(entry)) continue
      const fullPath = join(dir, entry)
      try {
        if (statSync(fullPath).isFile()) {
          results.push({ path: fullPath, content: readFileSync(fullPath, 'utf8') })
        }
      } catch {
        // Ignore unreadable file
      }
    }
    return results
  } catch {
    return []
  }
}
