import { getCopy } from '../data/copy'
import type { Locale } from '../types'
import { MultiDeviceLogo } from './Icons'

interface FooterProps {
  readonly locale: Locale
}

export function Footer({ locale }: FooterProps) {
  const t = getCopy(locale).footer

  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
            <span className="brand-logo-box" style={{ width: 26, height: 26 }}>
              <MultiDeviceLogo size={15} />
            </span>
            <strong style={{ fontSize: 14 }}>dsh-multi-device</strong>
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--dsw-alias-label-secondary)',
            }}
          >
            {t.summary}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--dsw-alias-label-caption)',
            }}
          >
            {t.mit}
          </div>
        </div>

        <div className="footer-links">
          <a
            href="https://github.com/IGNGserver/dsh-multi-device"
            target="_blank"
            rel="noreferrer"
          >
            {t.links.repo}
          </a>
          <a
            href="https://github.com/IGNGserver/dsh-multi-device/releases"
            target="_blank"
            rel="noreferrer"
          >
            {t.links.releases}
          </a>
          <a
            href="https://github.com/IGNGserver/dsh-multi-device/blob/main/NATIVE-ARCHITECTURE.md"
            target="_blank"
            rel="noreferrer"
          >
            {t.links.arch}
          </a>
          <a
            href="https://github.com/IGNGserver/dsh-multi-device/issues"
            target="_blank"
            rel="noreferrer"
          >
            {t.links.issues}
          </a>
        </div>
      </div>
    </footer>
  )
}
