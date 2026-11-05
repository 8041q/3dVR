import React from 'react'

export default function ProjectWatermark({ title, offline }) {
  return <div className="project-watermark" data-viewer-chrome="top">
    <img src="/brand/3dvr-portal-v2.svg" width="44" height="44" alt="" />
    <div><span className="project-watermark__brand">Atria 3DVR <span>Virtual tours</span></span><strong>{title}</strong>{offline && <small>Offline</small>}</div>
  </div>
}
