import { describe, expect, it } from 'vitest'
import {
  assessBrowserNativeAccess,
  type BrowserNativeAccessCode,
} from '../src/host/browser-relay.ts'

const proxyUrl = 'http://127.0.0.1:42001/?md_token=secret&md_client=browser-a#session'

function decision(pageUrl: string, url: string | undefined = proxyUrl, desktopGuest = false) {
  return assessBrowserNativeAccess({ pageUrl, proxyUrl: url, desktopGuest })
}

function rejected(pageUrl: string, url: string, code: BrowserNativeAccessCode, desktopGuest = false) {
  const result = decision(pageUrl, url, desktopGuest)
  expect(result).toMatchObject({ status: 'unsupported', code, message: expect.any(String) })
  expect(result).not.toHaveProperty('url')
  expect(JSON.stringify(result)).not.toContain('secret')
  return result
}

describe('browser native proxy deployment capabilities', () => {
  it('is a pure module usable without window, Node HTTP, auth or Host services', () => {
    expect(typeof window).toBe('undefined')
    expect(decision('http://127.0.0.1:3080/')).toEqual({
      status: 'available', transport: 'local-browser', url: proxyUrl,
    })
  })

  it.each([undefined, ''])('reports an unallocated proxy without inventing a URL (%s)', url => {
    const result = assessBrowserNativeAccess({ pageUrl: 'http://127.0.0.1:3080', proxyUrl: url })
    expect(result).toMatchObject({ status: 'unavailable', code: 'proxy-not-ready' })
    expect(result).not.toHaveProperty('url')
  })

  it.each([
    ['http://localhost:3080/', 'http://localhost:42001/?md_token=secret&md_client=browser-a#session'],
    ['http://LOCALHOST:3080/', 'http://localhost:42001/?md_token=secret&md_client=browser-a#session'],
    ['http://127.0.0.1:3080/', proxyUrl],
  ])('aligns loopback cookie site, not the dedicated origin, for %s', (page, expected) => {
    const result = decision(page)
    expect(result).toEqual({ status: 'available', transport: 'local-browser', url: expected })
    if (result.status === 'available') expect(new URL(result.url).origin).not.toBe(new URL(page).origin)
  })

  it('normalizes localhost back to IPv4 for an IPv4 parent', () => {
    expect(decision('http://127.0.0.1:3080/', 'http://localhost:42001/?md_token=secret')).toMatchObject({
      status: 'available', url: 'http://127.0.0.1:42001/?md_token=secret',
    })
  })

  it.each([
    'http://192.168.1.50:3080/', 'https://dsh.example.test/',
    'http://host.local:3080/', 'http://127.0.0.2:3080/',
    'http://localhost.example.test:3080/', 'http://[::ffff:7f00:1]:3080/',
  ])('does not return a Host loopback URL to remote/unproven browser %s', page => {
    rejected(page, proxyUrl, 'remote-browser-loopback')
  })

  it.each(['https://localhost:3080/', 'https://127.0.0.1:3080/', 'https://[::1]:3080/'])(
    'does not assume browser mixed-content exceptions or cross-scheme cookies for %s', page => {
      rejected(page, proxyUrl, 'https-http-proxy')
    },
  )

  it('does not synthesize an IPv6 proxy listener or silently rely on cross-site cookies', () => {
    rejected('http://[::1]:3080/', proxyUrl, 'ipv6-parent-ipv4-proxy')
    rejected('http://[::1]:3080/', 'http://[::1]:42001/?md_token=secret', 'ipv6-proxy-not-listening')
  })

  it.each([
    ['http://127.0.0.1:3080/', 'http://127.0.0.1:3080/?md_token=secret'],
    ['https://host.example/', 'https://host.example/multi-device/native/a/?md_token=secret'],
    ['http://localhost:3080/', 'http://127.0.0.1:3080/?md_token=secret'],
    ['http://127.0.0.1:3080/', 'http://localhost:3080/?md_token=secret'],
  ])('rejects remote HTML on the Host origin, including normalized aliases (%s)', (page, url) => {
    rejected(page, url, 'same-origin-unsafe')
  })

  it.each(['https://native-a.example.test/', 'http://192.168.1.50:42001/', 'https://127.0.0.1.evil.test/'])(
    'does not claim arbitrary public URLs have implemented auth/isolation: %s', url => {
      rejected('https://host.example.test/', url, 'public-proxy-not-supported')
    },
  )

  it('does not turn the existing HTTP listener into TLS by URL rewriting', () => {
    rejected('https://localhost:3080/', 'https://localhost:42001/?md_token=secret', 'loopback-protocol-not-supported')
  })

  it('rejects path-prefix relays instead of pretending base/fetch rewriting covers the web platform', () => {
    rejected('http://127.0.0.1:3080/', 'http://127.0.0.1:42001/multi-device/native/a/?md_token=secret', 'prefixed-relay-not-supported')
  })

  it.each([
    '/multi-device/native/a/', '//127.0.0.1:42001/', 'not a url',
    'javascript:alert(1)', 'data:text/html,remote', 'file:///remote.html',
    'http://user:secret@127.0.0.1:42001/', 'http://127.0.0.1:42001/\n?md_token=secret',
    ' http://127.0.0.1:42001/', 'http://127.0.0.1:42001/?md_token=secret ',
  ])('rejects invalid/unsafe proxy URL without echoing it: %s', url => {
    rejected('http://127.0.0.1:3080/', url, 'invalid-proxy-url')
  })

  it.each(['invalid', '/relative', ' http://localhost:3080/', 'http://user:secret@localhost:3080/'])(
    'rejects untrustworthy page locations: %s', page => {
      rejected(page, proxyUrl, 'invalid-page-url')
    },
  )

  it.each(['file:///app/index.html', 'dsh-app://app/index.html', 'data:text/html,app'])(
    'does not infer Desktop privilege from page protocol: %s', page => {
      rejected(page, proxyUrl, 'page-protocol-not-supported')
    },
  )

  it('permits a verified local Desktop guest even when the shell is HTTPS/app/remote', () => {
    for (const page of ['dsh-app://app/index.html', 'https://127.0.0.1:3080/', 'https://host.example.test/']) {
      expect(decision(page, proxyUrl, true)).toEqual({ status: 'available', transport: 'desktop-guest', url: proxyUrl })
    }
  })

  it('does not grant a Desktop bridge permission to serve unsafe origins/prefixes', () => {
    rejected('https://host.example.test/', 'https://host.example.test/multi-device/native/a/', 'same-origin-unsafe', true)
    rejected('dsh-app://app/index.html', 'https://native.example.test/', 'public-proxy-not-supported', true)
    rejected('dsh-app://app/index.html', 'http://127.0.0.1:42001/native/', 'prefixed-relay-not-supported', true)
    rejected('dsh-app://app/index.html', 'http://[::1]:42001/', 'ipv6-proxy-not-listening', true)
  })
})
