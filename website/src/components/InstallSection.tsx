import { useState } from 'react'
import { getCopy } from '../data/copy'
import type { Locale } from '../types'
import { CheckIcon, CopyIcon } from './Icons'

interface InstallSectionProps {
  readonly locale: Locale
}

export function InstallSection({ locale }: InstallSectionProps) {
  const t = getCopy(locale).install
  const [activeTabId, setActiveTabId] = useState<string>(t.tabs[0].id)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({
    0: true,
    1: true,
  })

  const currentTab =
    t.tabs.find((tab) => tab.id === activeTabId) ?? t.tabs[0]

  const handleCopy = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      // Fallback for restricted clipboard contexts
    }
    setCopiedId(id)
    window.setTimeout(() => {
      setCopiedId((cur) => (cur === id ? null : cur))
    }, 1800)
  }

  const checkedCount = Object.values(checkedItems).filter(Boolean).length

  return (
    <section id="install" className="section-block">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">{t.eyebrow}</div>
          <h2 className="section-title">{t.title}</h2>
          <p className="section-subtitle">{t.subtitle}</p>
        </div>

        <div className="install-panel">
          <div className="install-tabs-bar" role="tablist">
            {t.tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={tab.id === currentTab.id}
                className="install-tab-btn"
                data-active={tab.id === currentTab.id ? 'true' : 'false'}
                data-testid={`install-tab-${tab.id}`}
                onClick={() => setActiveTabId(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            style={{
              fontSize: 13.5,
              color: '#9ec0ff',
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(122, 170, 255, 0.22)',
              padding: '10px 14px',
              borderRadius: 10,
            }}
          >
            {currentTab.note}
          </div>

          <ol className="install-steps-list">
            {currentTab.steps.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ol>

          <div className="install-code-wrap">
            <div className="install-code-head">
              <span>{currentTab.codeLabel}</span>
              <button
                type="button"
                className="copy-code-btn"
                onClick={() => handleCopy(currentTab.id, currentTab.code)}
              >
                {copiedId === currentTab.id ? (
                  <>
                    <CheckIcon size={12} />
                    <span>{t.copiedBtn}</span>
                  </>
                ) : (
                  <>
                    <CopyIcon size={12} />
                    <span>{t.copyBtn}</span>
                  </>
                )}
              </button>
            </div>
            <pre className="install-code-pre">{currentTab.code}</pre>
          </div>

          <div className="checklist-box">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 4,
              }}
            >
              <strong style={{ fontSize: 13.5 }}>{t.checklistTitle}</strong>
              <span
                className="brand-version-pill tabular-nums"
                style={{
                  color:
                    checkedCount === t.checklist.length ? '#86efac' : '#9ec0ff',
                }}
              >
                {checkedCount}/{t.checklist.length}
              </span>
            </div>

            {t.checklist.map((item, idx) => {
              const checked = Boolean(checkedItems[idx])
              return (
                <button
                  key={idx}
                  type="button"
                  className="checklist-item"
                  data-checked={checked ? 'true' : 'false'}
                  onClick={() =>
                    setCheckedItems((prev) => ({
                      ...prev,
                      [idx]: !prev[idx],
                    }))
                  }
                >
                  <span className="checklist-box-mark">
                    {checked && <CheckIcon size={12} />}
                  </span>
                  <span>{item}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
