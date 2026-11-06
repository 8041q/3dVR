import React from 'react'
import { BackRow } from './ui/BackLink'

const REPOSITORY_URL = 'https://github.com/8041q/3dVR'
const ISSUES_URL = `${REPOSITORY_URL}/issues`
const AUTHOR_NAME = '8041q'
const AUTHOR_URL = 'https://github.com/8041q'

const icons = {
  server: <><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></>,
  sphere: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="9" ry="3.6" /><path d="M12 3v18" /></>,
  code: <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />,
}

const FACTS = [
  {
    icon: 'server',
    title: 'Your server',
    body: 'Accounts, projects, media, and security controls live on the installation you manage.',
  },
  {
    icon: 'sphere',
    title: 'Made for exploration',
    body: 'Design scenes, hotspots, guides, product interactions, and visitor-ready tours in one place.',
  },
  {
    icon: 'code',
    title: 'Open source',
    body: 'Inspect the code, follow releases, report an issue, or contribute improvements on GitHub.',
  },
]

export default function AboutAtria({ signedIn = false }) {
  return <section className="account-about" aria-labelledby="about-atria-title">
    {!signedIn && <BackRow href="/account">Back to sign in</BackRow>}

    <header className="account-about__hero">
      <div className="account-about__intro">
        <span className="account-eyebrow">ABOUT ATRIA 3DVR</span>
        <h1 id="about-atria-title">Immersive experiences, hosted by you.</h1>
        <p>Atria Studio is an open-source, self-hosted workspace for building 360° tours, guided experiences, and interactive product presentations.</p>
        <ul className="account-about__tags" aria-label="Highlights">
          <li className="account-badge">Self-hosted</li>
          <li className="account-badge">Open source</li>
          <li className="account-badge">360° tours</li>
        </ul>
        <a className="account-about__author" href={AUTHOR_URL} target="_blank" rel="noopener noreferrer">
          <span className="account-about__author-text">
            <small>Created and maintained by</small>
            <strong>{AUTHOR_NAME}</strong>
          </span>
        </a>
      </div>
      <div className="account-about__orbit" aria-hidden="true">
        <div /><div /><div />
        <span className="account-about__logo">
          <img src="/brand/3dvr-portal-v2.svg" width="72" height="72" alt="" />
        </span>
      </div>
    </header>

    <div className="account-about__facts">
      {FACTS.map(({ icon, title, body }) => <article key={title}>
        <span className="account-about__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">{icons[icon]}</svg>
        </span>
        <h2>{title}</h2>
        <p>{body}</p>
      </article>)}
    </div>

    <section className="account-panel account-panel--highlight account-about__links" aria-labelledby="about-atria-source">
      <div className="account-about__links-copy">
        <h2 id="about-atria-source">Built in the open</h2>
        <p>Find setup guidance, security notes, and the source for this installation in the project repository.</p>
        <code className="account-about__repo">8041q/3dVR</code>
      </div>
      <div className="account-actions">
        <a className="account-button" href={ISSUES_URL} target="_blank" rel="noopener noreferrer">Report an issue</a>
        <a className="account-button account-primary" href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">Open GitHub repository <span aria-hidden="true">↗</span></a>
      </div>
    </section>
  </section>
}