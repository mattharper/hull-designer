import type { Hull, HullMesh, MeshTriangle, Vec3 } from '../types'
import {
  fairedChineLines,
  fairedSurfaceGrid,
  halfHullPoints,
  longitudinalFairing,
  mirrorY,
  transverseFairing,
} from './points'
import { deckCenterline } from './deck'

function pushQuad(
  tris: MeshTriangle[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
): void {
  tris.push({ a, b, c: d }, { a: b, b: c, c: d })
}

export function buildHullMesh(hull: Hull): HullMesh {
  const controlLines = halfHullPoints(hull)
  const deck = deckCenterline(hull)
  const fairing = longitudinalFairing(hull)
  const longSub = Math.max(4, Math.round(4 + fairing * 8))
  // Longitudinally (and optionally transversely) faired surface for skinning.
  const surfaceLines = fairedSurfaceGrid(
    hull,
    hull.closedTop ? deck : undefined,
    longSub,
  )
  // True chine/deck lines for wireframe overlays (not transverse samples).
  const chineDisplay = fairedChineLines(
    hull,
    hull.closedTop ? deck : undefined,
    longSub,
  )
  const halfTriangles: MeshTriangle[] = []
  const edges: [Vec3, Vec3][] = []
  const nLong = surfaceLines[0]?.length ?? 0

  for (let c = 0; c < surfaceLines.length - 1; c++) {
    const lower = surfaceLines[c]
    const upper = surfaceLines[c + 1]
    for (let i = 0; i < nLong - 1; i++) {
      const a = lower[i]
      const b = lower[i + 1]
      const d = upper[i]
      const e = upper[i + 1]
      pushQuad(halfTriangles, a, b, e, d)
      edges.push([a, b], [d, e], [a, d], [b, e])
    }
  }

  for (const line of chineDisplay) {
    for (let i = 0; i < line.length - 1; i++) {
      edges.push([line[i], line[i + 1]])
    }
  }

  // Hard-chine station edges at control frames only
  const framePolylines = hull.frames.map((_, f) => {
    const poly = controlLines.map((line) => line[f])
    if (hull.closedTop && deck[f]) poly.push(deck[f])
    return poly
  })
  for (const section of framePolylines) {
    for (let c = 0; c < section.length - 1; c++) {
      edges.push([section[c], section[c + 1]])
    }
  }

  const keel = surfaceLines[0]
  if (keel && keel.some((p) => p.y > 1e-6)) {
    for (let i = 0; i < keel.length - 1; i++) {
      const a = { x: keel[i].x, y: 0, z: keel[i].z }
      const b = { x: keel[i + 1].x, y: 0, z: keel[i + 1].z }
      pushQuad(halfTriangles, a, b, keel[i + 1], keel[i])
    }
  }

  const stemFace = (section: Vec3[]) => {
    for (let c = 0; c < section.length - 1; c++) {
      const p0 = section[c]
      const p1 = section[c + 1]
      // Both on the centreline → zero area
      if (p0.y < 1e-9 && p1.y < 1e-9) continue
      const c0 = { x: p0.x, y: 0, z: p0.z }
      const c1 = { x: p1.x, y: 0, z: p1.z }
      if (p0.y < 1e-9) {
        // p0 already on CL: single triangle p0–p1–c1
        if (Math.hypot(p1.y, p1.z - p0.z) < 1e-12) continue
        halfTriangles.push({ a: c0, b: p1, c: c1 })
      } else if (p1.y < 1e-9) {
        if (Math.hypot(p0.y, p0.z - p1.z) < 1e-12) continue
        halfTriangles.push({ a: c0, b: p0, c: c1 })
      } else {
        halfTriangles.push({ a: c0, b: p0, c: p1 })
        if (Math.abs(c1.z - c0.z) > 1e-9) {
          halfTriangles.push({ a: c0, b: p1, c: c1 })
        }
      }
    }
  }
  if (nLong > 0) {
    stemFace(surfaceLines.map((line) => line[0]))
    stemFace(surfaceLines.map((line) => line[nLong - 1]))
  }

  const triangles: MeshTriangle[] = []
  for (const t of halfTriangles) {
    triangles.push(t)
    if (
      Math.abs(t.a.y) > 1e-9 ||
      Math.abs(t.b.y) > 1e-9 ||
      Math.abs(t.c.y) > 1e-9
    ) {
      triangles.push({ a: mirrorY(t.a), b: mirrorY(t.c), c: mirrorY(t.b) })
    }
  }

  const chinePolylines =
    hull.closedTop && deck.length
      ? [
          ...chineDisplay.slice(0, controlLines.length),
          chineDisplay[chineDisplay.length - 1],
        ]
      : chineDisplay

  return {
    halfTriangles,
    triangles,
    edges,
    framePolylines,
    chinePolylines,
  }
}

/** Approximate developability: max dihedral twist between adjacent rulings. */
export function developabilityWarnings(hull: Hull): string[] {
  const warnings: string[] = []
  if (transverseFairing(hull) > 0.05) {
    warnings.push(
      'Transverse fairing rounds the sections; construction panels are still unfolded as ruled strips between chines (approx).',
    )
  }
  if (longitudinalFairing(hull) > 0.05) {
    warnings.push(
      'Longitudinal fairing bends chines fore–aft; strake develop remains a ruled-surface approximation between faired edges.',
    )
  }
  const lines = halfHullPoints(hull)
  for (let c = 0; c < lines.length - 1; c++) {
    const lower = lines[c]
    const upper = lines[c + 1]
    let maxTwist = 0
    for (let f = 0; f < hull.frames.length - 2; f++) {
      const r0 = {
        x: upper[f].x - lower[f].x,
        y: upper[f].y - lower[f].y,
        z: upper[f].z - lower[f].z,
      }
      const r1 = {
        x: upper[f + 1].x - lower[f + 1].x,
        y: upper[f + 1].y - lower[f + 1].y,
        z: upper[f + 1].z - lower[f + 1].z,
      }
      const n0 = cross(r0, {
        x: lower[f + 1].x - lower[f].x,
        y: lower[f + 1].y - lower[f].y,
        z: lower[f + 1].z - lower[f].z,
      })
      const n1 = cross(r1, {
        x: lower[f + 2].x - lower[f + 1].x,
        y: lower[f + 2].y - lower[f + 1].y,
        z: lower[f + 2].z - lower[f + 1].z,
      })
      maxTwist = Math.max(maxTwist, angleBetween(n0, n1))
    }
    if (maxTwist > (15 * Math.PI) / 180) {
      const nameA = hull.chines[c].name
      const nameB = hull.chines[c + 1].name
      warnings.push(
        `Strake ${nameA}–${nameB} may not be developable (twist ${(
          (maxTwist * 180) /
          Math.PI
        ).toFixed(1)}°)`,
      )
    }
  }
  return warnings
}

function cross(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function angleBetween(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  const la = Math.hypot(a.x, a.y, a.z)
  const lb = Math.hypot(b.x, b.y, b.z)
  if (la < 1e-12 || lb < 1e-12) return 0
  const d = (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb)
  return Math.acos(Math.min(1, Math.max(-1, d)))
}
