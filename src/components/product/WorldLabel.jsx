import React, { useEffect, useMemo } from 'react'
import * as THREE from 'three'

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
  canvas.height = detail ? 280 : 180
  const context = canvas.getContext('2d')

  const palettes = {
    normal: ['rgba(8, 12, 19, 0.82)', 'rgba(255,255,255,0.30)'],
    quiet: ['rgba(8, 12, 19, 0.58)', 'rgba(255,255,255,0.18)'],
    error: ['rgba(48, 12, 16, 0.90)', 'rgba(255,170,175,0.55)'],
  }
  const [fill, stroke] = palettes[tone] || palettes.normal

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = fill
  context.strokeStyle = stroke
  context.lineWidth = 4
  context.beginPath()
  context.roundRect(6, 6, canvas.width - 12, canvas.height - 12, 32)
  context.fill()
  context.stroke()

  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#ffffff'
  context.font = '700 58px system-ui, sans-serif'
  context.fillText(title || '', canvas.width / 2, detail ? 88 : canvas.height / 2, canvas.width - 90)

  if (detail) {
    context.fillStyle = '#cbd5e1'
    context.font = '400 34px system-ui, sans-serif'
    const lines = wrapText(context, detail, canvas.width - 110, 2)
    lines.forEach((line, index) => {
      context.fillText(line, canvas.width / 2, 170 + index * 44, canvas.width - 110)
    })
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
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
  const height = detail ? width * 0.273 : width * 0.176

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
