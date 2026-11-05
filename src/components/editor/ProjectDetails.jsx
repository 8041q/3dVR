import React from 'react'
import { PROJECT_METADATA_LIMITS } from '../../projectMetadata.js'
import './projectDetails.css'

function formatDate(value) {
  if (!value) return 'Not yet published'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ProjectDetails({ project, meta, onChange }) {
  const metadata = project.metadata || {}
  function updateMetadata(key, value) {
    onChange((current) => ({ ...current, metadata: { ...current.metadata, [key]: value } }))
  }
  function field(key, label, placeholder, { multiline = false, hint } = {}) {
    const Input = multiline ? 'textarea' : 'input'
    return (
      <label className={multiline ? 'project-details__wide' : undefined}>
        {label}
        <Input value={metadata[key] || ''} maxLength={PROJECT_METADATA_LIMITS[key]}
          placeholder={placeholder} rows={multiline ? 3 : undefined}
          aria-describedby={hint ? `project-${key}-hint` : undefined}
          onChange={(event) => updateMetadata(key, event.target.value)} />
        {hint && <small id={`project-${key}-hint`}>{hint}</small>}
      </label>
    )
  }
  return (
    <div className="project-details">
      <div className="project-details__main">
        <section className="project-details__section" aria-labelledby="project-about-title">
          <h3 id="project-about-title">About this project</h3>
          <p>Give your experience a name and tell people what it’s about.</p>
          <div className="project-details__fields">
            <label>Project title
              <input value={project.title || ''} maxLength={300} placeholder="Untitled project"
                onChange={(event) => onChange((current) => ({ ...current, title: event.target.value }))} />
            </label>
            {field('author', 'Author', 'Person or team who created this project')}
            {field('description', 'Description', 'Describe the space, experience, or purpose of this project.', { multiline: true })}
            {field('language', 'Content language', 'e.g. en, pt-PT', { hint: 'Describes the content; does not translate the interface.' })}
            {field('keywords', 'Keywords', 'e.g. architecture, showroom, training', { hint: 'Separate topics with commas.' })}
          </div>
        </section>
        <section className="project-details__section" aria-labelledby="project-credits-title">
          <h3 id="project-credits-title">Organization & credits</h3>
          <p>Credit the people and organization behind the project.</p>
          <div className="project-details__fields">
            {field('organization', 'Organization', 'Studio, company, or institution')}
            {field('contributors', 'Contributors & acknowledgments', 'Photography, 3D models, narration, and other contributions.', { multiline: true })}
          </div>
        </section>
        <section className="project-details__section" aria-labelledby="project-rights-title">
          <h3 id="project-rights-title">Rights & usage</h3>
          <p>Document how this project may be used and who owns the content.</p>
          <div className="project-details__fields">
            <div className="project-details__wide">
              {field('license', 'License', 'e.g. All rights reserved or CC BY 4.0', { hint: 'Use a license name or URL. Leave blank if you haven’t specified one.' })}
            </div>
            {field('rights', 'Copyright & usage notes', 'Copyright holder, attribution requirements, or usage restrictions.', { multiline: true })}
          </div>
        </section>
        <section className="project-details__section" aria-labelledby="project-start-title">
          <h3 id="project-start-title">Starting scene</h3>
          <p>Choose where visitors enter the published experience.</p>
          <label>Starting scene
            <select value={project.startSceneId || ''} disabled={!project.scenes?.length}
              onChange={(event) => onChange((current) => ({ ...current, startSceneId: event.target.value }))}>
              {!project.scenes?.length && <option value="">Add a scene first</option>}
              {(project.scenes || []).map((scene) => <option key={scene.id} value={scene.id}>{scene.title || scene.id}</option>)}
            </select>
          </label>
        </section>
      </div>
      <aside className="project-details__summary" aria-label="Project information">
        <h3>Project information</h3>
        <p>Details are saved with your draft and included in published project data and exports. Add information you’re happy to share.</p>
        <dl>
          <div><dt>Project ID</dt><dd>{project.id}</dd></div>
          <div><dt>Created</dt><dd>{meta?.createdAt ? formatDate(meta.createdAt) : 'Unavailable'}</dd></div>
          <div><dt>Draft last saved</dt><dd>{meta?.updatedAt ? formatDate(meta.updatedAt) : 'Unavailable'}</dd></div>
          <div><dt>Last published</dt><dd>{formatDate(meta?.publishedAt)}</dd></div>
          <div><dt>Content</dt><dd>{project.scenes?.length || 0} {project.scenes?.length === 1 ? 'scene' : 'scenes'} · {project.guides?.length || 0} {project.guides?.length === 1 ? 'guide' : 'guides'}</dd></div>
        </dl>
        {meta?.publishedRevision && <details className="project-details__revision">
          <summary>Published revision</summary><code>{meta.publishedRevision}</code>
        </details>}
      </aside>
    </div>
  )
}
