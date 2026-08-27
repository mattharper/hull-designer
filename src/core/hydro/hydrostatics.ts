import type { Hull, HydrostaticsResult, Vec3 } from '../types'
import { hardSectionAtX, fairedChineLines, interpolateAlongChine, lerp3 } from '../geometry/points'
import { deckCenterline } from '../geometry/deck'

const DEG = Math.PI / 180

interface Section {
  x: number
  /** Immersed polygon points in YZ (full beam, port+stbd), ordered CCW. */
  poly: { y: number; z: number }[]
  area: number
  cy: number
  cz: number
}

function rotatePoint(
  p: Vec3,
  heelRad: number,
  trimRad: number,
  pivot: Vec3,
): Vec3 {
  // Translate to pivot
  let x = p.x - pivot.x
  let y = p.y - pivot.y
  let z = p.z - pivot.z
  // Heel about X
  const ch = Math.cos(heelRad)
  const sh = Math.sin(heelRad)
  const y1 = y * ch - z * sh
  const z1 = y * sh + z * ch
  y = y1
  z = z1
  // Trim about Y
  const ct = Math.cos(trimRad)
  const st = Math.sin(trimRad)
  const x1 = x * ct + z * st
  const z2 = -x * st + z * ct
  x = x1
  z = z2
  return { x: x + pivot.x, y: y + pivot.y, z: z + pivot.z }
}

function sectionPolylineAtX(hull: Hull, x: number): Vec3[] {
  return hardSectionAtX(
    hull,
    x,
    hull.closedTop ? deckCenterline(hull) : undefined,
  )
}

/** Clip half-section to z <= draft (waterplane at z=draft in heeled frame ≈ global after rotate). */
function immersedHalfSection(
  halfPts: Vec3[],
  waterZ: number,
): { y: number; z: number }[] {
  if (halfPts.length === 0) return []
  // Build polyline from CL bottom up along chines, then back on waterline/CL
  const poly: { y: number; z: number }[] = []
  const pts = halfPts.map((p) => ({ y: p.y, z: p.z }))

  // Walk chines from keel to sheer, clipping to waterplane
  const clipped: { y: number; z: number }[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const prev = i > 0 ? pts[i - 1] : null
    if (p.z <= waterZ) {
      if (prev && prev.z > waterZ) {
        const t = (waterZ - prev.z) / (p.z - prev.z || 1e-12)
        clipped.push({
          y: prev.y + (p.y - prev.y) * t,
          z: waterZ,
        })
      }
      clipped.push(p)
    } else if (prev && prev.z <= waterZ) {
      const t = (waterZ - prev.z) / (p.z - prev.z || 1e-12)
      clipped.push({
        y: prev.y + (p.y - prev.y) * t,
        z: waterZ,
      })
    }
  }

  if (clipped.length === 0) return []

  // Close: keel CL points at z of first, waterline back to CL
  const first = clipped[0]
  const last = clipped[clipped.length - 1]
  poly.push({ y: 0, z: first.z })
  for (const p of clipped) poly.push(p)
  if (last.y > 1e-9) {
    poly.push({ y: 0, z: last.z })
  }
  return poly
}

function polygonAreaCentroid(
  poly: { y: number; z: number }[],
): { area: number; cy: number; cz: number } {
  if (poly.length < 3) return { area: 0, cy: 0, cz: 0 }
  let a = 0
  let cy = 0
  let cz = 0
  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[i]
    const p1 = poly[(i + 1) % poly.length]
    const cross = p0.y * p1.z - p1.y * p0.z
    a += cross
    cy += (p0.y + p1.y) * cross
    cz += (p0.z + p1.z) * cross
  }
  a *= 0.5
  if (Math.abs(a) < 1e-14) return { area: 0, cy: 0, cz: 0 }
  cy /= 6 * a
  cz /= 6 * a
  return { area: Math.abs(a), cy, cz }
}

function mirrorFullSection(
  half: { y: number; z: number }[],
): { y: number; z: number }[] {
  if (half.length === 0) return []
  // half includes CL points; build full: port then starboard reverse
  const stbd = half
    .slice()
    .reverse()
    .map((p) => ({ y: -p.y, z: p.z }))
  const full = [...half]
  for (const p of stbd) {
    if (Math.abs(p.y) < 1e-9) continue
    full.push(p)
  }
  return full
}

function integrateSections(sections: Section[]): {
  volume: number
  lcb: number
  tcb: number
  vcb: number
  lwl: number
  bwl: number
  waterplaneArea: number
} {
  if (sections.length < 2) {
    return {
      volume: 0,
      lcb: 0,
      tcb: 0,
      vcb: 0,
      lwl: 0,
      bwl: 0,
      waterplaneArea: 0,
    }
  }

  let volume = 0
  let mx = 0
  let my = 0
  let mz = 0
  let xMinWl = Infinity
  let xMaxWl = -Infinity
  let maxBwl = 0
  let wpArea = 0

  for (let i = 0; i < sections.length - 1; i++) {
    const s0 = sections[i]
    const s1 = sections[i + 1]
    const dx = s1.x - s0.x
    const aAvg = 0.5 * (s0.area + s1.area)
    const dV = aAvg * dx
    volume += dV
    mx += dV * 0.5 * (s0.x + s1.x)
    my += dV * 0.5 * (s0.cy + s1.cy)
    mz += dV * 0.5 * (s0.cz + s1.cz)

    if (s0.area > 0) {
      xMinWl = Math.min(xMinWl, s0.x)
      xMaxWl = Math.max(xMaxWl, s0.x)
      for (const p of s0.poly) maxBwl = Math.max(maxBwl, Math.abs(p.y) * 2)
    }
    if (s1.area > 0) {
      xMinWl = Math.min(xMinWl, s1.x)
      xMaxWl = Math.max(xMaxWl, s1.x)
    }

    // Waterplane strip: breadth at waterline approx max |y| on section
    const b0 = s0.poly.reduce((m, p) => Math.max(m, Math.abs(p.y)), 0) * 2
    const b1 = s1.poly.reduce((m, p) => Math.max(m, Math.abs(p.y)), 0) * 2
    wpArea += 0.5 * (b0 + b1) * dx
  }

  const lwl = Number.isFinite(xMinWl) ? xMaxWl - xMinWl : 0
  return {
    volume,
    lcb: volume > 0 ? mx / volume : 0,
    tcb: volume > 0 ? my / volume : 0,
    vcb: volume > 0 ? mz / volume : 0,
    lwl,
    bwl: maxBwl,
    waterplaneArea: wpArea,
  }
}

function lateralArea(
  hull: Hull,
  draft: number,
  heelRad: number,
  trimRad: number,
  pivot: Vec3,
): { area: number; x: number; z: number } {
  const lines = fairedChineLines(
    hull,
    hull.closedTop ? deckCenterline(hull) : undefined,
    8,
  )
  if (lines.length === 0) return { area: 0, x: 0, z: 0 }

  const sheer = lines[lines.length - 1]
  const keel = lines[0]
  const samples = 40
  const poly: { x: number; z: number }[] = []

  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const x =
      hull.frames[0].x +
      t * (hull.frames[hull.frames.length - 1].x - hull.frames[0].x)
    const k = interpolateAlongChine(keel, x)
    if (!k) continue
    const rk = rotatePoint(k, heelRad, trimRad, pivot)
    if (rk.z <= draft) poly.push({ x: rk.x, z: rk.z })
    else {
      // find waterline intersection along ruling toward sheer
      const s = interpolateAlongChine(sheer, x)
      if (!s) continue
      const rs = rotatePoint(s, heelRad, trimRad, pivot)
      if (rs.z < draft && rk.z > draft) {
        const u = (draft - rk.z) / (rs.z - rk.z || 1e-12)
        const p = lerp3(rk, rs, u)
        poly.push({ x: p.x, z: draft })
      }
    }
  }
  // Close along waterline and stem
  if (poly.length < 2) return { area: 0, x: 0, z: 0 }
  const closed = [...poly]
  // waterline back
  for (let i = poly.length - 1; i >= 0; i--) {
    closed.push({ x: poly[i].x, z: draft })
  }

  let area = 0
  let cx = 0
  let cz = 0
  for (let i = 0; i < closed.length - 1; i++) {
    const p0 = closed[i]
    const p1 = closed[i + 1]
    const cross = p0.x * p1.z - p1.x * p0.z
    area += cross
    cx += (p0.x + p1.x) * cross
    cz += (p0.z + p1.z) * cross
  }
  area *= 0.5
  if (Math.abs(area) < 1e-14) return { area: 0, x: 0, z: 0 }
  return {
    area: Math.abs(area),
    x: cx / (6 * area),
    z: cz / (6 * area),
  }
}

export function maxHullHeight(hull: Hull): number {
  let maxZ = 0
  for (const c of hull.chines) {
    for (const o of c.offsets) maxZ = Math.max(maxZ, o.z)
  }
  for (const z of hull.deckHeights ?? []) maxZ = Math.max(maxZ, z)
  return Math.max(maxZ, 1e-3)
}

/**
 * Solve draft for a target displacement weight (lb or kg).
 * Bisection on draft; displacement grows with draft for typical attitudes.
 */
export function findDraftForDisplacement(
  hull: Hull,
  targetWeight: number,
  opts?: { heelDeg?: number; trimDeg?: number; iterations?: number },
): HydrostaticsResult {
  const heelDeg = opts?.heelDeg ?? 0
  const trimDeg = opts?.trimDeg ?? 0
  const iterations = opts?.iterations ?? 36
  const target = Math.max(0, targetWeight)

  if (target <= 0) {
    return computeHydrostatics(hull, { draft: 0, heelDeg, trimDeg })
  }

  const hiMax = maxHullHeight(hull) * 1.25
  const atMax = computeHydrostatics(hull, {
    draft: hiMax,
    heelDeg,
    trimDeg,
  })
  if (atMax.displacementWeight <= target) return atMax

  let lo = 0
  let hi = hiMax
  let result = atMax

  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) * 0.5
    result = computeHydrostatics(hull, { draft: mid, heelDeg, trimDeg })
    if (result.displacementWeight < target) lo = mid
    else hi = mid
  }

  return computeHydrostatics(hull, {
    draft: (lo + hi) * 0.5,
    heelDeg,
    trimDeg,
  })
}

/**
 * Waterline curves on the hull in the heeled/trimmed frame (same as hydrostatics):
 * points lie on z = draft after attitude rotation. Suitable for rendering beside a
 * level waterplane while the hull mesh is attitude-transformed the same way.
 */
export function computeWaterline(
  hull: Hull,
  opts?: { draft?: number; heelDeg?: number; trimDeg?: number },
): Vec3[][] {
  const draft = opts?.draft ?? hull.designDraft
  const heelRad = (opts?.heelDeg ?? 0) * DEG
  const trimRad = (opts?.trimDeg ?? 0) * DEG
  const pivot: Vec3 = { x: hull.loa / 2, y: 0, z: draft }

  const x0 = hull.frames[0]?.x ?? 0
  const x1 = hull.frames[hull.frames.length - 1]?.x ?? hull.loa
  const nStations = Math.max(48, hull.frames.length * 10)

  const port: Vec3[] = []
  const stbd: Vec3[] = []

  for (let i = 0; i <= nStations; i++) {
    const x = x0 + ((x1 - x0) * i) / nStations
    const half = sectionPolylineAtX(hull, x)
    if (half.length < 2) continue

    const crossings: Vec3[] = []
    for (const side of [1, -1] as const) {
      const pts = half.map((p) =>
        rotatePoint(
          { x: p.x, y: side * Math.abs(p.y), z: p.z },
          heelRad,
          trimRad,
          pivot,
        ),
      )
      for (let j = 0; j < pts.length - 1; j++) {
        const a = pts[j]
        const b = pts[j + 1]
        const da = a.z - draft
        const db = b.z - draft
        if (da === 0) {
          crossings.push({ x: a.x, y: a.y, z: draft })
          continue
        }
        if (da * db > 0) continue
        if (Math.abs(b.z - a.z) < 1e-12) continue
        const t = (draft - a.z) / (b.z - a.z)
        if (t < -1e-6 || t > 1 + 1e-6) continue
        crossings.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: draft,
        })
      }
    }

    if (crossings.length === 0) continue
    crossings.sort((a, b) => a.y - b.y)
    port.push(crossings[0])
    stbd.push(crossings[crossings.length - 1])
  }

  const lines: Vec3[][] = []
  if (port.length >= 2 && stbd.length >= 2) {
    // Closed waterline loop on the hull/waterplane intersection
    const loop = [
      ...port,
      ...stbd.slice().reverse(),
      port[0],
    ]
    lines.push(loop)
  } else if (port.length >= 2) {
    lines.push(port)
  } else if (stbd.length >= 2) {
    lines.push(stbd)
  }
  return lines
}

export function computeHydrostatics(
  hull: Hull,
  opts?: { draft?: number; heelDeg?: number; trimDeg?: number },
): HydrostaticsResult {
  const draft = opts?.draft ?? hull.designDraft
  const heelDeg = opts?.heelDeg ?? 0
  const trimDeg = opts?.trimDeg ?? 0
  const heelRad = heelDeg * DEG
  const trimRad = trimDeg * DEG
  const pivot: Vec3 = {
    x: hull.loa / 2,
    y: 0,
    z: draft,
  }

  // Sample stations along length
  const x0 = hull.frames[0]?.x ?? 0
  const x1 = hull.frames[hull.frames.length - 1]?.x ?? hull.loa
  const nStations = Math.max(20, hull.frames.length * 4)
  const sections: Section[] = []

  for (let i = 0; i <= nStations; i++) {
    const x = x0 + ((x1 - x0) * i) / nStations
    const half = sectionPolylineAtX(hull, x)
    const rotated = half.map((p) => rotatePoint(p, heelRad, trimRad, pivot))
    const immersedHalf = immersedHalfSection(rotated, draft)
    const full = mirrorFullSection(immersedHalf)
    const { area, cy, cz } = polygonAreaCentroid(full)
    sections.push({ x, poly: full, area, cy, cz })
  }

  const integ = integrateSections(sections)
  const weight = integ.volume * hull.waterDensity
  const cla = lateralArea(hull, draft, heelRad, trimRad, pivot)

  // GZ: horizontal lever between CG and CB in heeled frame
  // At heel, righting lever ≈ (vcb - kg)*sin(heel) + (tcb)*cos... simplified:
  // Use transverse offset of CB relative to CG after heel
  const kg = hull.cg.z
  const gz =
    (integ.vcb - kg) * Math.sin(heelRad) +
    (integ.tcb - hull.cg.y) * Math.cos(heelRad)

  return {
    draft,
    heelDeg,
    trimDeg,
    displacementVolume: integ.volume,
    displacementWeight: weight,
    lwl: integ.lwl,
    bwl: integ.bwl,
    lcb: integ.lcb,
    tcb: integ.tcb,
    vcb: integ.vcb,
    wettedArea: 0, // optional refinement
    waterplaneArea: integ.waterplaneArea,
    claArea: cla.area,
    claX: cla.x,
    claZ: cla.z,
    gz,
    rightingMoment: weight * gz,
    immersed: integ.volume > 1e-9,
  }
}
