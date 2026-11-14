import { getCopy } from '../data/copy'
import type { Locale } from '../types'
import { ExternalLinkIcon, GitHubIcon, MultiDeviceLogo } from './Icons'

interface TopNavProps {
  readonly locale: Locale
  readonly onToggleLocale: () => void
}

export function TopNav({ locale, onToggleLocale }: TopNavProps) {
  const t = getCopy(locale).nav

  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <a href="#top" className="brand-cluster">
          <span className="brand-logo-box">
            <MultiDeviceLogo size={18} />
          </span>
          <span className="brand-name">DSH Multi-Device</span>
          <span className="brand-version-pill">{t.badge}</span>
        </a>

        <nav className="nav-links" aria-label="Primary">
          <a href="#convergence" className="nav-link">
            {t.convergence}
          </a>
          <a href="#workbench" className="nav-link">
            {t.workbench}
          </a>
          <a href="#architecture" className="nav-link">
            {t.architecture}
          </a>
          <a href="#boundaries" className="nav-link">
            {t.boundaries}
          </a>
          <a href="#install" className="nav-link">
            {t.install}
          </a>
        </nav>

        <div className="nav-actions">
          <button
            type="button"
            className="lang-btn"
            onClick={onToggleLocale}
            data-testid="locale-toggle"
          >
            {t.langToggle}
          </button>
          <a
            href="https://github.com/IGNGserver/dsh-multi-device"
            target="_blank"
            rel="noreferrer"
            className="nav-ghost-btn"
          >
            <GitHubIcon size={14} />
            <span>{t.github}</span>
          </a>
          <a
            href="https://github.com/IGNGserver/dsh-multi-device/releases"
            target="_blank"
            rel="noreferrer"
            className="nav-primary-btn"
          >
            <span>{t.releases}</span>
            <ExternalLinkIcon size={13} />
          </a>
        </div>
      </div>
    </header>
  )
}
