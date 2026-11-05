import { fillTileUrl } from './cubemapGeometry.js'

export function panoramaKey(scene) {
  return JSON.stringify([scene?.id, scene?.image, scene?.panorama?.manifestUrl])
}

export function hasPanorama(scene) {
  return [scene?.image, scene?.panorama?.manifestUrl].some((url) => typeof url === 'string' && url.trim())
}

export function readPanoramaManifest(value, url) {
  const faces = new Set(value?.faces?.map?.((face) => face.id))
  if (value?.kind !== 'multires-cubemap' || value.projection !== 'cubemap-multires'
    || !Array.isArray(value.faces) || value.faces.length !== 6
    || !['front', 'right', 'back', 'left', 'up', 'down'].every((face) => faces.has(face))
    || !Array.isArray(value.levels) || !value.levels.length
    || value.levels.some((level) => level?.id == null || !Number.isFinite(level.faceSize) || level.faceSize <= 0
      || !Number.isInteger(level.tilesPerEdge) || level.tilesPerEdge < 1
      || typeof level.tileUrlTemplate !== 'string' || !level.tileUrlTemplate)) {
    throw new Error('Unsupported panorama manifest.')
  }
  const base = new URL(url, globalThis.location?.href || 'http://localhost/')
  return {
    ...value,
    levels: value.levels.map((level) => {
      // URL normalizes braces in some parts of the URL. Preserve tile tokens.
      const template = level.tileUrlTemplate.replaceAll('{', '__3dvr_open__').replaceAll('}', '__3dvr_close__')
      const resolved = new URL(template, base)
      if (!['http:', 'https:'].includes(resolved.protocol)) throw new Error('Unsupported panorama tile URL.')
      return { ...level, tileUrlTemplate: resolved.href.replaceAll('__3dvr_open__', '{').replaceAll('__3dvr_close__', '}') }
    }),
  }
}

export function panoramaTiles(manifest, level) {
  return manifest.faces.flatMap(({ id: face }) =>
    Array.from({ length: level.tilesPerEdge ** 2 }, (_, index) => ({
      face,
      row: Math.floor(index / level.tilesPerEdge),
      col: index % level.tilesPerEdge,
      level,
    })))
}

export function basePanoramaTiles(manifest) {
  const level = manifest.levels.find((item) => item.id === manifest.baseLevel) || manifest.levels[0]
  return panoramaTiles(manifest, level)
}

export function panoramaTileUrl({ level, face, row, col }) {
  return fillTileUrl(level.tileUrlTemplate, { face, level: level.id, row, col })
}
