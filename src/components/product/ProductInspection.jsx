import React, { forwardRef, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import ProductInspector3D from './ProductInspector3D'
import { InteractionProvider } from '../../contexts/InteractionContext'

function Icon({ name }) {
  const paths = {
    close: <path d="m6 6 12 12M6 18 18 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    fit: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8z" />,
    reset: <path d="M3 4v6h6M3 10a9 9 0 1 1 .8 7" />,
    views: <><path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9" /></>,
  }
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const FEATURE_COPY = {
  motion: ['Animations', 'Choose an animation to see how the product moves.'],
  finishes: ['Choose a finish', 'Select a colour or material to try it on the model.'],
  details: ['Product details', 'Choose a detail here or select its numbered point on the model.'],
}
const VIEW_PRESETS = [['front', 'Front'], ['back', 'Back'], ['left', 'Left'], ['right', 'Right'], ['top', 'Top'], ['angle', '3D angle']]

export const InspectionSurface = forwardRef(function InspectionSurface({ inspection, onClose, onStatusChange, compact = false, setup = false, initialFeature }, forwardedRef) {
  const inspector = useRef(null)
  const views = useRef(null)
  const initialSelection = useRef(false)
  const [controls, setControls] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const title = useId()
  const renderInspection = useMemo(() => setup
    ? { ...inspection, viewer: { ...inspection.viewer, autoRotate: false } }
    : inspection, [inspection, setup])
  const attach = useCallback((value) => {
    inspector.current = value
    if (typeof forwardedRef === 'function') forwardedRef(value)
    else if (forwardedRef) forwardedRef.current = value
  }, [forwardedRef])
  const ready = controls?.status.state === 'ready'
  const error = controls?.status.state === 'error'
  const annotation = controls?.activeAnnotation
  const featureTabs = controls?.tabs.filter((tab) => tab.id !== 'view') || []
  const activeTab = controls?.activeTab || 'view'
  const options = controls?.options || []
  const showSidebar = !setup && ready && featureTabs.length > 0 && activeTab !== 'view'
  const playback = options.filter((option) => ['motion:toggle', 'motion:replay', 'motion:speed'].includes(option.id))
  const choices = options.filter((option) => !playback.includes(option))

  useEffect(() => {
    if (setup || !controls || controls.status.state !== 'ready' || initialSelection.current) return
    const first = controls.tabs.find((tab) => tab.id === initialFeature) || controls.tabs.find((tab) => tab.id !== 'view')
    initialSelection.current = true
    if (first) controls.selectTab(first.id)
  }, [controls, setup, initialFeature])

  useEffect(() => {
    const closeViews = (event) => {
      if (views.current?.open && !views.current.contains(event.target)) views.current.open = false
    }
    document.addEventListener('pointerdown', closeViews)
    return () => document.removeEventListener('pointerdown', closeViews)
  }, [])

  function keyDown(event) {
    event.stopPropagation()
    if (event.target !== event.currentTarget || !ready) return
    const commands = { ArrowLeft: 'rotateLeft', ArrowRight: 'rotateRight', '+': 'zoomIn', '=': 'zoomIn', '-': 'zoomOut', '0': 'resetView', f: 'fitView' }
    if (commands[event.key]) { event.preventDefault(); inspector.current?.[commands[event.key]]?.() }
  }

  return (
    <section className={['product-inspection', compact && 'product-inspection--compact', setup && 'product-inspection--setup', !showSidebar && 'product-inspection--stage-only'].filter(Boolean).join(' ')} aria-label={setup ? 'Set the starting view' : undefined} aria-labelledby={setup ? undefined : title} onKeyDown={(event) => event.stopPropagation()}>
      {!setup && <header className="product-inspection__header">
        <div><span className="product-inspection__eyebrow">3D inspection</span><h2 id={title}>{inspection.title || 'Product'}</h2></div>
        {onClose && <button type="button" className="product-inspection__icon" aria-label="Close inspection" onClick={onClose}><Icon name="close" /></button>}
      </header>}
      <div className="product-inspection__workspace">
        <div className="product-inspection__stage" tabIndex={0} aria-label="Interactive 3D model. Drag to rotate, scroll or pinch to zoom. Shift-drag or use two fingers to pan. Arrow keys rotate, plus and minus zoom, F fits the model." onKeyDown={keyDown}>
          <div className="product-inspection__canvas">
            <InteractionProvider>
              <Canvas camera={{ fov: 45, position: [0, 0, 4], near: 0.001, far: 200 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
                <ProductInspector3D key={attempt} ref={attach} inspection={renderInspection} standalone showControls={false} showAnnotations={!setup} onControlsChange={setControls} onStatusChange={onStatusChange} />
              </Canvas>
            </InteractionProvider>
          </div>
          {!ready && <div className="product-inspection__status" role={error ? 'alert' : 'status'}>
            <strong>{error ? 'Model unavailable' : 'Loading model…'}</strong>
            {error ? <><p>{controls.status.error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button></>
              : <progress aria-label="Loading model" value={controls?.status.progress || 0} max="1" />}
          </div>}
          <div className="product-inspection__stage-footer">
            <div className="product-inspection__tools" role="group" aria-label="Camera controls">
              <details className="product-inspection__views" ref={views} onKeyDown={(event) => {
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); views.current.open = false; views.current.querySelector('summary').focus() }
              }}>
                <summary aria-label="Choose a camera view"><Icon name="views" /><span>Views</span></summary>
                <div className="product-inspection__presets" role="group" aria-label="Camera views">
                  {VIEW_PRESETS.filter(([name]) => inspection.viewer?.orbitMode !== 'turntable' || name !== 'top').map(([name, label]) =>
                    <button key={name} type="button" disabled={!ready} onClick={() => { inspector.current?.setView(name); views.current.open = false; views.current.querySelector('summary').focus() }}>{label}</button>)}
                </div>
              </details>
              <span className="product-inspection__tool-divider" />
              {[['minus', 'Zoom out', 'zoomOut'], ['plus', 'Zoom in', 'zoomIn'], ['fit', 'Fit model', 'fitView'], ['reset', 'Reset view', 'resetView']].map(([icon, label, method]) =>
                <button key={method} type="button" disabled={!ready} title={label} aria-label={label} onClick={() => inspector.current?.[method]?.()}><Icon name={icon} /></button>)}
            </div>
            <span className="product-inspection__gesture">Drag to rotate · Scroll or pinch to zoom</span>
          </div>
        </div>
        {showSidebar && <aside className="product-inspection__sidebar" aria-label="Product interactions">
          <nav className="product-inspection__tabs" aria-label="Explore the product">
            {featureTabs.map((tab) => <button type="button" key={tab.id} aria-pressed={activeTab === tab.id} onClick={() => controls.selectTab(tab.id)}>{tab.id === 'motion' ? 'Animations' : tab.label}</button>)}
          </nav>
          <div className="product-inspection__options" tabIndex={0} aria-label={(FEATURE_COPY[activeTab]?.[0] || 'Product') + ' options'}>
            <h3>{FEATURE_COPY[activeTab]?.[0]}</h3>
            <p className="product-inspection__help">{FEATURE_COPY[activeTab]?.[1]}</p>
            <div className="product-inspection__choices">
              {choices.map((option, index) => {
                const variant = inspection.materialVariants?.find((item) => option.id === 'finish:' + item.id)
                return <button type="button" key={option.id} aria-pressed={Boolean(option.selected)} onClick={option.activate}>
                  {variant && <span className="product-inspection__swatch" style={{ backgroundColor: variant.color || '#ddd', backgroundImage: variant.textureUrl ? 'url(' + variant.textureUrl + ')' : undefined }} />}
                  {activeTab === 'details' && <span className="product-inspection__point-number">{index + 1}</span>}
                  <span>{option.label}</span>{option.selected && <span className="product-inspection__check" aria-hidden="true">✓</span>}
                </button>
              })}
            </div>
            {playback.length > 0 && <div className="product-inspection__playback"><h4>Playback</h4><div>{playback.map((option) => <button type="button" key={option.id} onClick={option.activate}>{option.label}</button>)}</div></div>}
            {controls.finishStatus && <p role="status" className="product-inspection__help">{controls.finishStatus.message}</p>}
            {annotation && activeTab === 'details' && <article className="product-inspection__detail">
              <header><strong>{annotation.label || 'Detail'}</strong><button type="button" aria-label="Close detail" onClick={controls.closeAnnotation}><Icon name="close" /></button></header>
              <p>{annotation.body || 'No description added.'}</p>
            </article>}
          </div>
        </aside>}
      </div>
    </section>
  )
})

const ProductInspection = forwardRef(function ProductInspection(props, ref) {
  const dialog = useRef(null)
  useEffect(() => {
    const opener = document.activeElement
    dialog.current.showModal()
    return () => { if (opener?.isConnected) opener.focus() }
  }, [])
  return <dialog ref={dialog} className="product-inspection-dialog" aria-label={(props.inspection.title || 'Product') + ' inspection'} onCancel={(event) => { event.preventDefault(); props.onClose() }}>
    <InspectionSurface {...props} ref={ref} />
  </dialog>
})
export default ProductInspection
