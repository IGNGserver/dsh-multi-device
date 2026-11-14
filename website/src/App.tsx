import { useEffect, useMemo, useState } from 'react'
import { ArchitectureSection } from './components/ArchitectureSection'
import { BoundaryContractSection } from './components/BoundaryContractSection'
import { ConvergenceStage } from './components/ConvergenceStage'
import { Footer } from './components/Footer'
import { InstallSection } from './components/InstallSection'
import { InteractiveWorkbench } from './components/InteractiveWorkbench'
import { SpatialBackdrop } from './components/SpatialBackdrop'
import { TopNav } from './components/TopNav'
import { createInitialDevices } from './data/workspaceFixtures'
import type { Locale } from './types'

export function App() {
  const [locale, setLocale] = useState<Locale>('zh')
  const stageDevices = useMemo(() => createInitialDevices(), [])

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])

  return (
    <>
      <SpatialBackdrop />
      <div className="site-shell">
        <TopNav
          locale={locale}
          onToggleLocale={() => setLocale((cur) => (cur === 'zh' ? 'en' : 'zh'))}
        />

        <main>
          <ConvergenceStage devices={stageDevices} locale={locale} />
          <InteractiveWorkbench locale={locale} />
          <ArchitectureSection locale={locale} />
          <BoundaryContractSection locale={locale} />
          <InstallSection locale={locale} />
        </main>

        <Footer locale={locale} />
      </div>
    </>
  )
}
