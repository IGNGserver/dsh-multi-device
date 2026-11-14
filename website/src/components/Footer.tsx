import {
  RELEASE_TAG_URL,
  RELEASE_VERSION,
  REPO_URL,
  type SiteCopy,
} from '../data/copy'
import { FishLogo } from './Icons'

interface FooterProps {
  readonly copy: SiteCopy
}

export function Footer({ copy }: FooterProps) {
  return (
    <footer className="site-footer">
      <div className="shell-container site-footer__inner">
        <div className="site-footer__brand">
          <FishLogo size={18} />
          <span>{copy.footer.note}</span>
        </div>

        <div className="site-footer__links">
          <span>{RELEASE_VERSION}</span>
          <span>·</span>
          <span>{copy.footer.license}</span>
          <span>·</span>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            {copy.footer.repo}
          </a>
          <span>·</span>
          <a href={RELEASE_TAG_URL} target="_blank" rel="noreferrer">
            {copy.footer.releases}
          </a>
        </div>
      </div>
    </footer>
  )
}
