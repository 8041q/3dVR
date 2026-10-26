import React from 'react'

export function ProjectIssues({ issues, onResolve }) {
  return <div className="project-issues">{issues.map((issue, index) => (
    <button type="button" key={`${issue.message}-${index}`} onClick={() => onResolve(issue)}>
      <span>{issue.message}</span><span aria-hidden="true">→</span>
    </button>
  ))}</div>
}

export default function WorkflowOverview({ scenes, guides, startSceneId, issues, onChoose, onPreview, onReview, onResolve }) {
  const hotspots = scenes.flatMap((scene) => scene.hotspots || [])
  const start = scenes.find((scene) => scene.id === startSceneId)
  const steps = [
    { number: '01', title: 'Build your scenes', text: 'Add a panorama for each room, then choose where visitors begin.', tool: 'scene', detail: `${scenes.length} scene${scenes.length === 1 ? '' : 's'} · Starts in ${start?.title || 'a scene you choose'}` },
    { number: '02', title: 'Connect the experience', text: 'Place clickable hotspots to move between rooms, show information or open a product.', tool: 'hotspots', detail: `${hotspots.length} hotspot${hotspots.length === 1 ? '' : 's'} across your scenes` },
    { number: '03', title: 'Guide your visitors', text: 'Optional: arrange a guided tour with instructions, focus points and narration.', tool: 'guides', detail: guides.length ? `${guides.length} guided tour${guides.length === 1 ? '' : 's'}` : 'Optional · visitors can explore freely' },
  ]
  return (
    <div className="workflow-overview">
      <div className="workflow-intro"><span className="editor-eyebrow">Your workspace</span><h2>Build a tour,<br />one step at a time.</h2><p>Everything you edit is a draft. Preview it as a visitor, then publish when you’re ready.</p></div>
      <div className="workflow-steps">{steps.map((step) => (
        <button type="button" className="workflow-step" key={step.tool} onClick={() => onChoose(step.tool)}>
          <span className="workflow-step__number">{step.number}</span>
          <span><strong>{step.title}</strong><span>{step.text}</span><small>{step.detail}</small></span>
          <span aria-hidden="true">↗</span>
        </button>
      ))}</div>
      <div className="workflow-finish"><span className="workflow-step__number">04</span><div><strong>Try it. Share it.</strong><p>Preview includes your latest edits. Publishing updates the link your visitors use.</p><div className="button-row"><button onClick={onPreview}>Open preview ↗</button><button className="primary" onClick={onReview}>Review & publish</button></div></div></div>
      <div className="workflow-readiness"><div className="editor-subheading">{issues.length ? `${issues.length} item${issues.length === 1 ? '' : 's'} to finish` : 'Ready for a test run'}</div>{issues.length ? <ProjectIssues issues={issues} onResolve={onResolve} /> : <p>Your scenes and actions are configured. Open Preview to check the visitor experience.</p>}</div>
    </div>
  )
}
