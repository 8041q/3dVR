import React from 'react'
import { BackRow } from './ui/BackLink'

const REPOSITORY_URL = 'https://github.com/8041q/3dVR'

export default function AboutAtria({ signedIn = false }) {
  return <section className="account-about" aria-labelledby="about-atria-title">
    {!signedIn && <BackRow href="/account">Back to sign in</BackRow>}
    <div className="account-about__hero">
      <img src="/brand/3dvr-portal-v2.svg" width="72" height="72" alt="Atria 3DVR" />
      <div>
        <span className="account-eyebrow">ATRIA 3DVR</span>
        <h1 id="about-atria-title">Immersive experiences, hosted by you.</h1>
        <p>Atria Studio is an open-source, self-hosted workspace for building 360° tours, guided experiences, and interactive product presentations.</p>
      </div>
    </div>
    <div className="account-about__facts">
      <article>
        <span className="account-about__symbol" aria-hidden="true">⌂</span>
        <h2>Your server</h2>
        <p>Accounts, projects, media, and security controls live on the installation you manage.</p>
      </article>
      <article>
        <span className="account-about__symbol" aria-hidden="true">360°</span>
        <h2>Made for exploration</h2>
        <p>Design scenes, hotspots, guides, product interactions, and visitor-ready tours in one place.</p>
      </article>
      <article>
        <span className="account-about__symbol" aria-hidden="true">&lt;/&gt;</span>
        <h2>Open source</h2>
        <p>Inspect the code, follow releases, report an issue, or contribute improvements on GitHub.</p>
      </article>
    </div>
    <section className="account-panel account-about__links">
      <div>
        <h2>Built in the open</h2>
        <p>Find setup guidance, security notes, and the source for this installation in the project repository.</p>
      </div>
      <a className="account-button account-primary" href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">Open GitHub repository <span aria-hidden="true">↗</span></a>
    </section>
  </section>
}
