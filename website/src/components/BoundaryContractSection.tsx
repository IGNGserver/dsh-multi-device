import type { SiteCopy } from '../data/copy'
import { ShieldCheckIcon } from './Icons'

interface BoundaryContractSectionProps {
  readonly copy: SiteCopy
}

export function BoundaryContractSection({ copy }: BoundaryContractSectionProps) {
  return (
    <section id="guarantees" className="section-band section-band--subtle">
      <div className="shell-container">
        <div className="section-head">
          <span className="section-eyebrow">{copy.guarantees.eyebrow}</span>
          <h2 className="section-title">{copy.guarantees.title}</h2>
          <p className="section-subtitle">{copy.guarantees.subtitle}</p>
        </div>

        <div className="cards-grid cards-grid--2">
          {copy.guarantees.items.map((item) => (
            <article key={item.badge} className="guarantee-card">
              <div className="guarantee-card__top">
                <span className="guarantee-card__icon">
                  <ShieldCheckIcon />
                </span>
                <span className="guarantee-card__num">{item.badge}</span>
              </div>
              <h3 className="guarantee-card__title">{item.title}</h3>
              <p className="guarantee-card__body">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
