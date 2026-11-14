import { useEffect, useState } from 'react'
import { ArchitectureSection } from './components/ArchitectureSection'
import { BoundaryContractSection } from './components/BoundaryContractSection'
import { FeaturesSection } from './components/FeaturesSection'
import { Footer } from './components/Footer'
import { InstallSection } from './components/InstallSection'
import { InteractiveWorkbench } from './components/InteractiveWorkbench'
import { TopNav } from './components/TopNav'
import { SITE_COPY } from './data/copy'
import type { Locale, ResolvedTheme, ThemeMode } from './types'

const THEME_STORAGE_KEY = 'dsh-md-site-theme'

function readStoredThemeMode(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (raw === 'system' || raw === 'light' || raw === 'dark') {
      return raw
    }
  } catch {
    /* ignore storage error */
  }
  return 'system'
}

function getSystemDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function App() {
  const [locale, setLocale] = useState<Locale>('zh')
  const [themeMode, setThemeMode] = useState<ThemeMode>(readStoredThemeMode)
  const [systemDark, setSystemDark] = useState<boolean>(getSystemDark)

  const resolvedTheme: ResolvedTheme =
    themeMode === 'dark' || (themeMode === 'system' && systemDark) ? 'dark' : 'light'

  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeMode)
    } catch {
      /* ignore */
    }
  }, [themeMode])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.themeMode = themeMode
    root.dataset.theme = resolvedTheme
    root.style.colorScheme = resolvedTheme

    if (resolvedTheme === 'dark') {
      document.body.setAttribute('data-ds-dark-theme', 'true')
    } else {
      document.body.removeAttribute('data-ds-dark-theme')
    }

    const themeMeta = document.getElementById('dsh-md-theme-color')
    if (themeMeta) {
      themeMeta.setAttribute('content', resolvedTheme === 'dark' ? '#151517' : '#ffffff')
    }
  }, [themeMode, resolvedTheme])

  const copy = SITE_COPY[locale]

  return (
    <div className="app-shell">
      <TopNav
        locale={locale}
        onToggleLocale={() => setLocale((prev) => (prev === 'zh' ? 'en' : 'zh'))}
        themeMode={themeMode}
        resolvedTheme={resolvedTheme}
        onChangeTheme={setThemeMode}
        copy={copy}
      />

      <main id="top">
        <InteractiveWorkbench locale={locale} copy={copy} />
        <FeaturesSection copy={copy} />
        <BoundaryContractSection copy={copy} />
        <InstallSection copy={copy} />
        <ArchitectureSection copy={copy} />
      </main>

      <Footer copy={copy} />
    </div>
  )
}

export default App
