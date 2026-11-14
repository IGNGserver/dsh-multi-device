import type { SiteCopy } from '../data/copy'
import { REPO_URL } from '../data/copy'
import type { Locale, ResolvedTheme, ThemeMode } from '../types'
import { FishLogo, MonitorIcon, MoonIcon, SunIcon } from './Icons'

interface TopNavProps {
  readonly locale: Locale
  readonly onToggleLocale: () => void
  readonly themeMode: ThemeMode
  readonly resolvedTheme: ResolvedTheme
  readonly onChangeTheme: (mode: ThemeMode) => void
  readonly copy: SiteCopy
}

export function TopNav({
  locale,
  onToggleLocale,
  themeMode,
  resolvedTheme,
  onChangeTheme,
  copy,
}: TopNavProps) {
  return (
    <header className="top-nav" data-resolved-theme={resolvedTheme}>
      <div className="top-nav__inner">
        <a className="brand" href="#top" aria-label={copy.brand}>
          <span className="brand__mark">
            <FishLogo size={20} />
          </span>
          <span className="brand__name">{copy.brand}</span>
          <span className="brand__badge">{copy.brandTag}</span>
        </a>

        <nav
          className="top-nav__links"
          aria-label={locale === 'zh' ? '主导航' : 'Main navigation'}
        >
          <a href="#workbench">{copy.nav.workbench}</a>
          <a href="#features">{copy.nav.features}</a>
          <a href="#guarantees">{copy.nav.guarantees}</a>
          <a href="#install">{copy.nav.install}</a>
          <a href="#architecture">{copy.nav.architecture}</a>
        </nav>

        <div className="top-nav__actions">
          <div
            className="theme-segmented"
            role="group"
            aria-label={copy.nav.themeLabel}
            data-testid="theme-switcher"
          >
            <button
              type="button"
              className={`theme-segmented__btn${themeMode === 'system' ? ' is-active' : ''}`}
              aria-pressed={themeMode === 'system'}
              data-testid="theme-opt-system"
              onClick={() => onChangeTheme('system')}
              title={copy.nav.themeOptions.system}
            >
              <MonitorIcon />
              <span>{copy.nav.themeOptions.system}</span>
            </button>
            <button
              type="button"
              className={`theme-segmented__btn${themeMode === 'light' ? ' is-active' : ''}`}
              aria-pressed={themeMode === 'light'}
              data-testid="theme-opt-light"
              onClick={() => onChangeTheme('light')}
              title={copy.nav.themeOptions.light}
            >
              <SunIcon />
              <span>{copy.nav.themeOptions.light}</span>
            </button>
            <button
              type="button"
              className={`theme-segmented__btn${themeMode === 'dark' ? ' is-active' : ''}`}
              aria-pressed={themeMode === 'dark'}
              data-testid="theme-opt-dark"
              onClick={() => onChangeTheme('dark')}
              title={copy.nav.themeOptions.dark}
            >
              <MoonIcon />
              <span>{copy.nav.themeOptions.dark}</span>
            </button>
          </div>

          <button
            type="button"
            className="nav-ghost-btn"
            data-testid="locale-toggle"
            aria-label={locale === 'zh' ? 'Switch to English' : '切换为中文'}
            onClick={onToggleLocale}
          >
            {copy.nav.localeToggle}
          </button>

          <a
            className="nav-ghost-btn nav-github-link"
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
          >
            {copy.nav.github}
          </a>

          <a className="nav-primary-btn" href="#install">
            {copy.nav.cta}
          </a>
        </div>
      </div>
    </header>
  )
}
