import type { Chine, Frame, Hull, Vec3 } from '../types'

export function chinePoint(frame: Frame, chine: Chine, frameIndex: number): Vec3 {
  const o = chine.offsets[frameIndex]
  return { x: frame.x, y: o.y, z: o.z }
}

/** Control points at shape stations (hard-chine section corners). */
export function halfHullPoints(hull: Hull): Vec3[][] {
  return hull.chines.map((chine) =>
    hull.frames.map((frame, i) => chinePoint(frame, chine, i)),
  )
}

export function longitudinalFairing(hull: Hull): number {
  return Math.min(
    1,
    Math.max(0, hull.longitudinalFairing ?? hull.sectionFairing ?? 1),
  )
}

export function transverseFairing(hull: Hull): number {
  return Math.min(1, Math.max(0, hull.transverseFairing ?? 0))
}

/**
 * Fair a longitudinal curve through station controls (fore–aft).
 *
 * `fairing=0` keeps straight segments between stations. Higher values blend
 * toward a cubic Hermite curve that still passes through every station.
 */
export function fairLongitudinalCurve(
  controls: Vec3[],
  fairing: number,
  subdivisions = 8,
): Vec3[] {
  return fairCurveThrough(controls, fairing, subdivisions)
}

/**
 * Fair a transverse section through chine corners (in the body-plan plane).
 * `fairing=0` keeps straight segments (hard chines / flat plates).
 */
export function fairTransverseCurve(
  controls: Vec3[],
  fairing: number,
  subdivisions = 4,
): Vec3[] {
  return fairCurveThrough(controls, fairing, subdivisions)
}

/**
 * Shared Hermite blend: `fairing=0` → polyline, `1` → cubic through controls.
 */
function fairCurveThrough(
  controls: Vec3[],
  fairing: number,
  subdivisions: number,
): Vec3[] {
  if (controls.length < 2) return controls.map((p) => ({ ...p }))

  const blend = Math.min(1, Math.max(0, fairing))
  const steps = Math.max(1, Math.round(subdivisions))
  const result: Vec3[] = []

  for (let i = 0; i < controls.length - 1; i++) {
    const p0 = controls[Math.max(0, i - 1)]
    const p1 = controls[i]
    const p2 = controls[i + 1]
    const p3 = controls[Math.min(controls.length - 1, i + 2)]

    for (let step = 0; step < steps; step++) {
      const t = step / steps
      const linear = lerp3(p1, p2, t)
      const cubic = hermite3(p0, p1, p2, p3, t)
      result.push({
        x: linear.x + (cubic.x - linear.x) * blend,
        y: Math.max(0, linear.y + (cubic.y - linear.y) * blend),
        z: Math.max(0, linear.z + (cubic.z - linear.z) * blend),
      })
    }
  }
  result.push({ ...controls[controls.length - 1] })
  return result
}

/** Longitudinally faired half-hull chine polylines (and optional deck CL). */
export function fairedChineLines(
  hull: Hull,
  deck?: Vec3[],
  subdivisions = 8,
): Vec3[][] {
  const fairing = longitudinalFairing(hull)
  const controls = halfHullPoints(hull)
  const lines = controls.map((line) =>
    fairLongitudinalCurve(line, fairing, subdivisions),
  )
  if (deck && deck.length >= 2) {
    lines.push(fairLongitudinalCurve(deck, fairing, subdivisions))
  }
  return lines
}

/**
 * Surface grid after longitudinal + transverse fairing.
 * Returns rows of roughly-longitudinal polylines (for ruled/skinned mesh).
 * When transverse fairing is 0, rows are the chine (and deck) lines.
 */
export function fairedSurfaceGrid(
  hull: Hull,
  deck?: Vec3[],
  longSubdivisions = 8,
): Vec3[][] {
  const chineLines = fairedChineLines(hull, deck, longSubdivisions)
  const tFair = transverseFairing(hull)
  if (tFair < 1e-6 || chineLines.length < 2) return chineLines

  const tSub = Math.max(2, Math.round(2 + tFair * 6))
  const nLong = chineLines[0]?.length ?? 0
  if (nLong < 2) return chineLines

  // sections[i] = faired transverse polyline at longitudinal sample i
  const sections: Vec3[][] = []
  for (let i = 0; i < nLong; i++) {
    const controls = chineLines.map((line) => line[i])
    sections.push(fairTransverseCurve(controls, tFair, tSub))
  }

  // Convert to rows (constant transverse parameter) for quad skinning
  const nTrans = sections[0]?.length ?? 0
  const rows: Vec3[][] = []
  for (let j = 0; j < nTrans; j++) {
    rows.push(sections.map((sec) => sec[j]))
  }
  return rows
}

function hermite3(
  p0: Vec3,
  p1: Vec3,
  p2: Vec3,
  p3: Vec3,
  t: number,
): Vec3 {
  const t2 = t * t
  const t3 = t2 * t
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + t
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2

  const m1 = {
    x: (p2.x - p0.x) * 0.5,
    y: (p2.y - p0.y) * 0.5,
    z: (p2.z - p0.z) * 0.5,
  }
  const m2 = {
    x: (p3.x - p1.x) * 0.5,
    y: (p3.y - p1.y) * 0.5,
    z: (p3.z - p1.z) * 0.5,
  }

  return {
    x: h00 * p1.x + h10 * m1.x + h01 * p2.x + h11 * m2.x,
    y: h00 * p1.y + h10 * m1.y + h01 * p2.y + h11 * m2.y,
    z: h00 * p1.z + h10 * m1.z + h01 * p2.z + h11 * m2.z,
  }
}

export function mirrorY(p: Vec3): Vec3 {
  return { x: p.x, y: -p.y, z: p.z }
}

export function dist(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.hypot(dx, dy, dz)
}

export function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  }
}

/** Sample a longitudinally faired polyline at station X. */
export function interpolateAlongChine(
  points: Vec3[],
  x: number,
): Vec3 | null {
  if (points.length === 0) return null
  if (x <= points[0].x) return { ...points[0], x }
  if (x >= points[points.length - 1].x) {
    return { ...points[points.length - 1], x }
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (x >= a.x && x <= b.x) {
      const t = (x - a.x) / (b.x - a.x || 1)
      return lerp3(a, b, t)
    }
  }
  return null
}

/**
 * Half-section at X: chines sampled from longitudinally faired curves, then
 * optionally faired transversely (round section vs hard-chine flats).
 */
export function hardSectionAtX(
  hull: Hull,
  x: number,
  deck?: Vec3[],
): Vec3[] {
  const fairing = longitudinalFairing(hull)
  const controls = halfHullPoints(hull)
  const pts: Vec3[] = []
  for (const line of controls) {
    const faired = fairLongitudinalCurve(line, fairing, 8)
    const p = interpolateAlongChine(faired, x)
    if (p) pts.push(p)
  }
  if (deck && deck.length >= 2) {
    const fairedDeck = fairLongitudinalCurve(deck, fairing, 8)
    const d = interpolateAlongChine(fairedDeck, x)
    if (d) pts.push(d)
  }
  const tFair = transverseFairing(hull)
  if (tFair < 1e-6 || pts.length < 2) return pts
  const tSub = Math.max(2, Math.round(2 + tFair * 6))
  return fairTransverseCurve(pts, tFair, tSub)
}
