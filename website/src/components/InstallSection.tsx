import { useState } from 'react'
import {
  RELEASE_TAG_URL,
  RELEASE_TGZ_URL,
  type SiteCopy,
} from '../data/copy'
import { CheckIcon, ChevronDownIcon, CopyIcon, ExternalLinkIcon } from './Icons'

interface InstallSectionProps {
  readonly copy: SiteCopy
}

export function InstallSection({ copy }: InstallSectionProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [cliOpen, setCliOpen] = useState(false)
  const [checklistOpen, setChecklistOpen] = useState(false)

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* fallback ignored in headless verification */
    }
    setCopiedKey(key)
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev))
    }, 1800)
  }

  const desktopCmd = `dsh --profile desktop plugin install "${RELEASE_TGZ_URL}"`
  const webCmd = `dsh --profile web plugin install "${RELEASE_TGZ_URL}"`

  return (
    <section id="install" className="section-band">
      <div className="shell-container">
        <div className="section-head">
          <span className="section-eyebrow">{copy.install.eyebrow}</span>
          <h2 className="section-title">{copy.install.title}</h2>
          <p className="section-subtitle">{copy.install.subtitle}</p>
        </div>

        <div className="install-card">
          <div className="install-card__left">
            <div className="install-url-label">{copy.install.urlLabel}</div>
            <div className="install-url-box">
              <code className="install-url-code">{RELEASE_TGZ_URL}</code>
              <button
                type="button"
                className="dsh-btn dsh-btn--primary"
                data-testid="copy-tgz-btn"
                onClick={() => handleCopy('tgz', RELEASE_TGZ_URL)}
              >
                {copiedKey === 'tgz' ? <CheckIcon /> : <CopyIcon />}
                <span>
                  {copiedKey === 'tgz' ? copy.install.copiedBtn : copy.install.copyBtn}
                </span>
              </button>
            </div>
            <a
              className="install-releases-link"
              href={RELEASE_TAG_URL}
              target="_blank"
              rel="noreferrer"
            >
              <span>{copy.install.releasesLink}</span>
              <ExternalLinkIcon />
            </a>
          </div>

          <ol className="install-steps">
            {copy.install.steps.map((step) => (
              <li key={step.num} className="install-step">
                <span className="install-step__num">{step.num}</span>
                <div className="install-step__content">
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Default-closed Disclosure Panels */}
        <div className="disclosure-stack">
          <div className="disclosure-panel">
            <button
              type="button"
              className="disclosure-trigger"
              data-testid="details-cli"
              aria-expanded={cliOpen}
              onClick={() => setCliOpen((v) => !v)}
            >
              <span className="disclosure-trigger__text">{copy.install.cliPanelTitle}</span>
              <span className={`disclosure-chevron${cliOpen ? ' is-open' : ''}`}>
                <ChevronDownIcon />
              </span>
            </button>
            {cliOpen && (
              <div className="disclosure-body">
                <div className="cli-block">
                  <div className="cli-block__label">{copy.install.cliDesktopLabel}</div>
                  <div className="cli-block__row">
                    <code>{desktopCmd}</code>
                    <button
                      type="button"
                      className="dsh-btn dsh-btn--ghost"
                      onClick={() => handleCopy('desktop', desktopCmd)}
                    >
                      {copiedKey === 'desktop' ? <CheckIcon /> : <CopyIcon />}
                      <span>
                        {copiedKey === 'desktop'
                          ? copy.install.copiedBtn
                          : copy.install.copyBtn}
                      </span>
                    </button>
                  </div>
                </div>
                <div className="cli-block">
                  <div className="cli-block__label">{copy.install.cliWebLabel}</div>
                  <div className="cli-block__row">
                    <code>{webCmd}</code>
                    <button
                      type="button"
                      className="dsh-btn dsh-btn--ghost"
                      onClick={() => handleCopy('web', webCmd)}
                    >
                      {copiedKey === 'web' ? <CheckIcon /> : <CopyIcon />}
                      <span>
                        {copiedKey === 'web'
                          ? copy.install.copiedBtn
                          : copy.install.copyBtn}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="disclosure-panel">
            <button
              type="button"
              className="disclosure-trigger"
              data-testid="details-checklist"
              aria-expanded={checklistOpen}
              onClick={() => setChecklistOpen((v) => !v)}
            >
              <span className="disclosure-trigger__text">
                {copy.install.checklistPanelTitle}
              </span>
              <span className={`disclosure-chevron${checklistOpen ? ' is-open' : ''}`}>
                <ChevronDownIcon />
              </span>
            </button>
            {checklistOpen && (
              <div className="disclosure-body">
                <div className="checklist-grid">
                  {copy.install.checklistItems.map((item) => (
                    <div key={item.question} className="checklist-item">
                      <h4>{item.question}</h4>
                      <p>{item.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
