import { useState } from 'react'
import type { SiteCopy } from '../data/copy'
import { ChevronDownIcon } from './Icons'

interface ArchitectureSectionProps {
  readonly copy: SiteCopy
}

export function ArchitectureSection({ copy }: ArchitectureSectionProps) {
  const [open, setOpen] = useState(false)

  return (
    <section id="architecture" className="section-band section-band--compact">
      <div className="shell-container">
        <div className="disclosure-panel disclosure-panel--architecture">
          <button
            type="button"
            className="disclosure-trigger"
            data-testid="details-architecture"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="disclosure-trigger__meta">
              <span className="section-eyebrow section-eyebrow--inline">
                {copy.architecture.eyebrow}
              </span>
              <span className="disclosure-trigger__text">
                {copy.architecture.panelTitle}
              </span>
              <span className="disclosure-trigger__sub">
                {copy.architecture.panelSummary}
              </span>
            </span>
            <span className={`disclosure-chevron${open ? ' is-open' : ''}`}>
              <ChevronDownIcon />
            </span>
          </button>

          {open && (
            <div className="disclosure-body">
              <div className="arch-details-grid">
                {copy.architecture.items.map((item) => (
                  <article key={item.title} className="arch-detail-card">
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
