import type { Hull, Vec3 } from '../types'
import { buildHullMesh } from '../geometry/buildMesh'
import { mirrorY } from '../geometry/points'
import { downloadText } from './dxf'

export type HullSvgView = 'isometric' | 'profile' | 'plan'

export interface HullSvgOptions {
  /** Projection used for the drawing. Default: isometric. */
  view?: HullSvgView
  /** Target drawing width in SVG user units (viewBox scales to fit). */
  padding?: number
  /** Stroke width in model units. */
  strokeWidth?: number
}

function project(
  p: Vec3,
  view: HullSvgView,
): { x: number; y: number } {
  if (view === 'profile') {
    // Side elevation: LOA × height (SVG y down → negate z)
    return { x: p.x, y: -p.z }
  }
  if (view === 'plan') {
    // Top: LOA × breadth
    return { x: p.x, y: -p.y }
  }
  // Isometric (30°): readable 3D wireframe
  const a = Math.PI / 6
  return {
    x: (p.x - p.y) * Math.cos(a),
    y: (p.x + p.y) * Math.sin(a) - p.z,
  }
}

function polylinePath(
  pts: Vec3[],
  view: HullSvgView,
): string {
  if (pts.length === 0) return ''
  return pts
    .map((p, i) => {
      const q = project(p, view)
      return `${i === 0 ? 'M' : 'L'}${fmt(q.x)} ${fmt(q.y)}`
    })
    .join(' ')
}

function fmt(n: number): string {
  return (Math.round(n * 1e4) / 1e4).toString()
}

function bothSides(poly: Vec3[]): Vec3[][] {
  const port = poly
  const starboard = poly.map(mirrorY)
  const onCenter = poly.every((p) => Math.abs(p.y) < 1e-9)
  return onCenter ? [port] : [port, starboard]
}

/**
 * Export the hull wireframe (chines + frames, both sides) as an SVG string.
 */
export function hullToSvg(hull: Hull, options: HullSvgOptions = {}): string {
  const view = options.view ?? 'isometric'
  const pad = options.padding ?? 0.35
  const stroke = options.strokeWidth ?? 0.02
  const mesh = buildHullMesh(hull)

  const paths: { d: string; cls: string }[] = []

  for (const poly of mesh.chinePolylines) {
    for (const side of bothSides(poly)) {
      const d = polylinePath(side, view)
      if (d) paths.push({ d, cls: 'chine' })
    }
  }
  for (const poly of mesh.framePolylines) {
    for (const side of bothSides(poly)) {
      const d = polylinePath(side, view)
      if (d) paths.push({ d, cls: 'frame' })
    }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const sample = (p: Vec3) => {
    const q = project(p, view)
    minX = Math.min(minX, q.x)
    minY = Math.min(minY, q.y)
    maxX = Math.max(maxX, q.x)
    maxY = Math.max(maxY, q.y)
  }
  for (const poly of mesh.chinePolylines) {
    for (const side of bothSides(poly)) for (const p of side) sample(p)
  }
  for (const poly of mesh.framePolylines) {
    for (const side of bothSides(poly)) for (const p of side) sample(p)
  }
  if (!Number.isFinite(minX)) {
    minX = 0
    minY = 0
    maxX = hull.loa
    maxY = 1
  }

  const vbX = minX - pad
  const vbY = minY - pad
  const vbW = Math.max(maxX - minX + pad * 2, 1e-3)
  const vbH = Math.max(maxY - minY + pad * 2, 1e-3)
  const unit = hull.units === 'm' ? 'm' : 'ft'
  const title = escapeXml(hull.name || 'Hull')

  const body = paths
    .map(
      (p) =>
        `  <path class="${p.cls}" d="${p.d}" fill="none"/>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(vbX)} ${fmt(vbY)} ${fmt(vbW)} ${fmt(vbH)}"
  width="100%" height="100%" role="img" aria-label="${title} ${view} wireframe">
  <title>${title}</title>
  <desc>Hard-chine hull wireframe (${view}), units ${unit}</desc>
  <style>
    .chine { stroke: #c4a35a; stroke-width: ${stroke * 1.4}; stroke-linecap: round; stroke-linejoin: round; }
    .frame { stroke: #5c5346; stroke-width: ${stroke}; stroke-linecap: round; stroke-linejoin: round; }
  </style>
${body}
</svg>
`
}

export function downloadHullSvg(
  hull: Hull,
  options: HullSvgOptions = {},
): void {
  const view = options.view ?? 'isometric'
  const slug = (hull.name || 'hull')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '')
  downloadText(`${slug || 'hull'}-${view}.svg`, hullToSvg(hull, options))
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
