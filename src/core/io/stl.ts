import type { Hull, MeshTriangle, Vec3 } from '../types'
import { deckCenterline } from '../geometry/deck'
import {
  fairedSurfaceGrid,
  longitudinalFairing,
  mirrorY,
} from '../geometry/points'

export interface HullStlOptions {
  /**
   * Scale from hull units into STL coordinates.
   * Default: millimetres (ft→304.8, m→1000).
   */
  scale?: number
}

function defaultScale(hull: Hull): number {
  return hull.units === 'm' ? 1000 : 304.8
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function norm(n: Vec3): Vec3 {
  const len = Math.hypot(n.x, n.y, n.z)
  if (len < 1e-12) return { x: 0, y: 0, z: 0 }
  return { x: n.x / len, y: n.y / len, z: n.z / len }
}

function triangleNormal(t: MeshTriangle): Vec3 {
  return norm(cross(sub(t.b, t.a), sub(t.c, t.a)))
}

function triangleArea2(t: MeshTriangle): number {
  const n = cross(sub(t.b, t.a), sub(t.c, t.a))
  return Math.hypot(n.x, n.y, n.z)
}

function Q(p: Vec3, digits = 6): Vec3 {
  const f = 10 ** digits
  return {
    x: Math.round(p.x * f) / f,
    y: Math.round(p.y * f) / f,
    z: Math.round(p.z * f) / f,
  }
}

function vertKey(p: Vec3): string {
  return `${p.x},${p.y},${p.z}`
}

function faceKey(t: MeshTriangle): string {
  return [vertKey(t.a), vertKey(t.b), vertKey(t.c)].sort().join('|')
}

function pushQuad(
  tris: MeshTriangle[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
): void {
  tris.push({ a, b, c: d }, { a: b, b: c, c: d })
}

function pushTri(tris: MeshTriangle[], a: Vec3, b: Vec3, c: Vec3): void {
  const t = { a: Q(a), b: Q(b), c: Q(c) }
  if (triangleArea2(t) < 1e-14) return
  if (
    vertKey(t.a) === vertKey(t.b) ||
    vertKey(t.b) === vertKey(t.c) ||
    vertKey(t.c) === vertKey(t.a)
  ) {
    return
  }
  tris.push(t)
}

/** Cap a half-section to the centreline (stem / stern / transom). */
function capSectionToCenterline(tris: MeshTriangle[], section: Vec3[]): void {
  for (let c = 0; c < section.length - 1; c++) {
    const p0 = section[c]
    const p1 = section[c + 1]
    if (p0.y < 1e-9 && p1.y < 1e-9) continue
    const c0 = { x: p0.x, y: 0, z: p0.z }
    const c1 = { x: p1.x, y: 0, z: p1.z }
    if (p0.y < 1e-9) {
      pushTri(tris, c0, p1, c1)
    } else if (p1.y < 1e-9) {
      pushTri(tris, c0, p0, c1)
    } else {
      pushTri(tris, c0, p0, p1)
      pushTri(tris, c0, p1, c1)
    }
  }
}

/**
 * Watertight triangle soup for STL export.
 * Built from the faired hull surface so seams share identical vertices.
 */
export function buildWatertightTriangles(hull: Hull): MeshTriangle[] {
  const fairing = longitudinalFairing(hull)
  const subdivisions = Math.max(4, Math.round(4 + fairing * 8))
  const deck = hull.closedTop ? deckCenterline(hull) : undefined
  const lines = fairedSurfaceGrid(hull, deck, subdivisions)
  if (lines.length < 2 || (lines[0]?.length ?? 0) < 2) return []

  const half: MeshTriangle[] = []
  const nLong = lines[0].length

  // Side shell
  for (let c = 0; c < lines.length - 1; c++) {
    const lower = lines[c]
    const upper = lines[c + 1]
    for (let i = 0; i < nLong - 1; i++) {
      pushQuad(half, lower[i], lower[i + 1], upper[i + 1], upper[i])
    }
  }

  // Flat keel to centreline when the keel is off the plane of symmetry
  const keel = lines[0]
  if (keel.some((p) => p.y > 1e-6)) {
    for (let i = 0; i < keel.length - 1; i++) {
      const a = { x: keel[i].x, y: 0, z: keel[i].z }
      const b = { x: keel[i + 1].x, y: 0, z: keel[i + 1].z }
      pushQuad(half, a, b, keel[i + 1], keel[i])
    }
  }

  // Ends — same transverse sampling as the shell so caps stay watertight
  const stern = lines.map((line) => line[0])
  const bow = lines.map((line) => line[nLong - 1])
  capSectionToCenterline(half, stern)
  capSectionToCenterline(half, bow)

  // Open boats: half-deck from sheer to centreline (mirrored with the hull)
  if (!hull.closedTop) {
    const sheer = lines[lines.length - 1]
    for (let i = 0; i < sheer.length - 1; i++) {
      const p0 = sheer[i]
      const p1 = sheer[i + 1]
      const c0 = { x: p0.x, y: 0, z: p0.z }
      const c1 = { x: p1.x, y: 0, z: p1.z }
      pushTri(half, p0, c0, c1)
      pushTri(half, p0, c1, p1)
    }
  }

  // Mirror to full hull
  const full: MeshTriangle[] = []
  for (const t of half) {
    const qt = { a: Q(t.a), b: Q(t.b), c: Q(t.c) }
    pushTri(full, qt.a, qt.b, qt.c)
    if (qt.a.y > 1e-9 || qt.b.y > 1e-9 || qt.c.y > 1e-9) {
      pushTri(full, mirrorY(qt.a), mirrorY(qt.c), mirrorY(qt.b))
    }
  }

  // Unique faces
  const seen = new Set<string>()
  const out: MeshTriangle[] = []
  for (const t of full) {
    if (triangleArea2(t) < 1e-14) continue
    const fk = faceKey(t)
    if (seen.has(fk)) continue
    seen.add(fk)
    out.push(t)
  }
  return out
}

/** Edge manifold stats after welding (for tests / diagnostics). */
export function meshManifoldStats(tris: MeshTriangle[]): {
  boundary: number
  manifold: number
  nonManifold: number
  degenerates: number
} {
  const edges = new Map<string, number>()
  let degenerates = 0
  for (const t of tris) {
    if (triangleArea2(t) < 1e-14) {
      degenerates++
      continue
    }
    const ek = (a: Vec3, b: Vec3) => {
      const ka = vertKey(a)
      const kb = vertKey(b)
      return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
    }
    for (const [a, b] of [
      [t.a, t.b],
      [t.b, t.c],
      [t.c, t.a],
    ] as const) {
      if (vertKey(a) === vertKey(b)) continue
      const k = ek(a, b)
      edges.set(k, (edges.get(k) || 0) + 1)
    }
  }
  let boundary = 0
  let manifold = 0
  let nonManifold = 0
  for (const c of edges.values()) {
    if (c === 1) boundary++
    else if (c === 2) manifold++
    else nonManifold++
  }
  return { boundary, manifold, nonManifold, degenerates }
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return n.toExponential(6)
}

/**
 * ASCII STL of a watertight hull solid.
 * Coordinates: naval X (LOA), Y (breadth), Z (height), scaled to mm by default.
 */
export function hullToStl(hull: Hull, options: HullStlOptions = {}): string {
  const scale = options.scale ?? defaultScale(hull)
  const triangles = buildWatertightTriangles(hull)
  const name = (hull.name || 'hull')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 64)

  const lines: string[] = [`solid ${name}`]
  for (const t of triangles) {
    const n = triangleNormal(t)
    lines.push(`  facet normal ${fmt(n.x)} ${fmt(n.y)} ${fmt(n.z)}`)
    lines.push('    outer loop')
    for (const p of [t.a, t.b, t.c]) {
      lines.push(
        `      vertex ${fmt(p.x * scale)} ${fmt(p.y * scale)} ${fmt(p.z * scale)}`,
      )
    }
    lines.push('    endloop')
    lines.push('  endfacet')
  }
  lines.push(`endsolid ${name}`)
  return lines.join('\n') + '\n'
}

export function downloadHullStl(
  hull: Hull,
  options: HullStlOptions = {},
): void {
  const slug = (hull.name || 'hull')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '')
  const blob = new Blob([hullToStl(hull, options)], {
    type: 'model/stl',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug || 'hull'}.stl`
  a.click()
  URL.revokeObjectURL(url)
}
