import { getCopy } from '../data/copy'
import type { Locale } from '../types'
import { CheckIcon, CloseIcon } from './Icons'

interface BoundaryContractSectionProps {
  readonly locale: Locale
}

export function BoundaryContractSection({
  locale,
}: BoundaryContractSectionProps) {
  const t = getCopy(locale).boundaries

  return (
    <section id="boundaries" className="section-block">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">{t.eyebrow}</div>
          <h2 className="section-title">{t.title}</h2>
          <p className="section-subtitle">{t.subtitle}</p>
        </div>

        <div className="boundary-grid">
          {t.cards.map((card) => (
            <article key={card.badge} className="boundary-card">
              <span className="boundary-badge">{card.badge}</span>

              <div className="boundary-contrast-row">
                <div className="boundary-wrong">
                  <CloseIcon size={13} />
                  <span>{card.wrong}</span>
                </div>
                <div className="boundary-right">
                  <CheckIcon size={14} />
                  <span>{card.right}</span>
                </div>
              </div>

              <p className="boundary-desc">{card.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
