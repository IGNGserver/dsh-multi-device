import type { SiteCopy } from '../data/copy'

interface FeaturesSectionProps {
  readonly copy: SiteCopy
}

export function FeaturesSection({ copy }: FeaturesSectionProps) {
  return (
    <section id="features" className="section-band">
      <div className="shell-container">
        <div className="section-head">
          <span className="section-eyebrow">{copy.features.eyebrow}</span>
          <h2 className="section-title">{copy.features.title}</h2>
          <p className="section-subtitle">{copy.features.subtitle}</p>
        </div>

        <div className="cards-grid cards-grid--3">
          {copy.features.cards.map((card) => (
            <article key={card.title} className="surface-card">
              <span className="surface-card__tag">{card.tag}</span>
              <h3 className="surface-card__title">{card.title}</h3>
              <p className="surface-card__body">{card.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
