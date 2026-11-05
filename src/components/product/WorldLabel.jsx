import React, { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { drawWorldSurface, worldAppearance } from '../../theme/worldAppearance'

function wrapText(context, text, maxWidth, maxLines = 2) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line)
      line = word
      if (lines.length >= maxLines - 1) break
    } else {
      line = candidate
    }
  }

  if (line && lines.length < maxLines) lines.push(line)
  return lines
}

function makeTexture(title, detail, tone) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = detail ? 230 : 180
  const context = canvas.getContext('2d')

  const colors = worldAppearance()
  const error = tone === 'error'
  drawWorldSurface(context, {
    fill: error ? colors['danger-surface'] : colors.surface,
    stroke: error ? colors.danger : colors.line,
    radius: 36,
  })

  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = error ? colors.danger : colors.ink
  context.font = `650 58px ${colors.font}`
  context.fillText(title || '', canvas.width / 2, detail ? 70 : canvas.height / 2, canvas.width - 90)

  if (detail) {
    context.fillStyle = colors.muted
    context.font = `400 34px ${colors.font}`
    const lines = wrapText(context, detail, canvas.width - 110, 2)
    lines.forEach((line, index) => {
      context.fillText(line, canvas.width / 2, 142 + index * 39, canvas.width - 110)
    })
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

export default function WorldLabel({
  title,
  detail = '',
  position = [0, 0, 0],
  width = 1.7,
  tone = 'normal',
}) {
  const texture = useMemo(() => makeTexture(title, detail, tone), [detail, title, tone])
  const height = detail ? width * (230 / 1024) : width * (180 / 1024)

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh position={position} renderOrder={55}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        side={THREE.DoubleSide}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
