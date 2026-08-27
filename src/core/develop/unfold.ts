import type { Hull, Panel, PanelPoint2, Vec3 } from '../types'
import {
  dist,
  fairedChineLines,
  halfHullPoints,
  hardSectionAtX,
} from '../geometry/points'
import { deckCenterline } from '../geometry/deck'

function bounds(pts: PanelPoint2[]): { width: number; height: number } {
  if (pts.length === 0) return { width: 0, height: 0 }
  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity
  for (const p of pts) {
    minU = Math.min(minU, p.u)
    maxU = Math.max(maxU, p.u)
    minV = Math.min(minV, p.v)
    maxV = Math.max(maxV, p.v)
  }
  return { width: maxU - minU, height: maxV - minV }
}

function normalizeOutline(pts: PanelPoint2[]): PanelPoint2[] {
  if (pts.length === 0) return pts
  let minU = Infinity
  let minV = Infinity
  for (const p of pts) {
    minU = Math.min(minU, p.u)
    minV = Math.min(minV, p.v)
  }
  return pts.map((p) => ({
    u: p.u - minU,
    v: p.v - minV,
    frameIndex: p.frameIndex,
  }))
}

/**
 * Unfold a ruled strip between two chine polylines into the UV plane,
 * preserving edge lengths of successive ruling triangles.
 */
export function unfoldStrake(
  lower: Vec3[],
  upper: Vec3[],
  name: string,
  id: string,
): Panel {
  if (lower.length < 2 || upper.length !== lower.length) {
    return {
      id,
      name,
      kind: 'strake',
      outline: [],
      marks: [],
      width: 0,
      height: 0,
    }
  }

  const n = lower.length
  const L: PanelPoint2[] = new Array(n)
  const U: PanelPoint2[] = new Array(n)

  L[0] = { u: 0, v: 0, frameIndex: 0 }
  U[0] = { u: 0, v: dist(lower[0], upper[0]), frameIndex: 0 }

  for (let i = 0; i < n - 1; i++) {
    const a = lower[i]
    const b = lower[i + 1]
    const c = upper[i + 1]
    const d = upper[i]

    const ab = dist(a, b)
    const bc = dist(b, c)
    const cd = dist(c, d)
    const db = dist(d, b)

    const La = L[i]
    const Ua = U[i]

    // Place L[i+1] on circ(L[i], |AB|) ∩ circ(U[i], |DB|).
    // Prefer the branch that continues the strip (opposite side of ruling).
    const bCands = circleIntersections(La, ab, Ua, db)
    const b2 =
      i === 0
        ? pickPreferForward(bCands, La)
        : pickOppositeSide(bCands, La, Ua, L[i - 1])
    L[i + 1] = { u: b2.u, v: b2.v, frameIndex: i + 1 }

    // Place U[i+1] on circ(L[i+1], |BC|) ∩ circ(U[i], |CD|),
    // opposite side of the diagonal from L[i] so the quad does not fold back.
    const cCands = circleIntersections(L[i + 1], bc, Ua, cd)
    const c2 = pickOppositeSide(cCands, L[i + 1], Ua, La)
    U[i + 1] = { u: c2.u, v: c2.v, frameIndex: i + 1 }
  }

  const outline = normalizeOutline([...L, ...U.slice().reverse()])
  const marks = normalizeOutline([...L, ...U])
  const b = bounds(outline)
  return {
    id,
    name,
    kind: 'strake',
    outline,
    marks,
    width: b.width,
    height: b.height,
  }
}

function circleIntersections(
  c0: PanelPoint2,
  r0: number,
  c1: PanelPoint2,
  r1: number,
): PanelPoint2[] {
  const dx = c1.u - c0.u
  const dy = c1.v - c0.v
  const d = Math.hypot(dx, dy)
  if (d < 1e-12) {
    return [{ u: c0.u + r0, v: c0.v }]
  }
  let r0c = r0
  let r1c = r1
  if (d > r0c + r1c) {
    const scale = (r0c + r1c) / d
    r0c *= scale
    r1c *= scale
  }
  if (d < Math.abs(r0c - r1c)) {
    if (r0c > r1c) r0c = r1c + d
    else r1c = r0c + d
  }
  const a = (r0c * r0c - r1c * r1c + d * d) / (2 * d)
  const hSq = Math.max(0, r0c * r0c - a * a)
  const h = Math.sqrt(hSq)
  const xm = c0.u + (a * dx) / d
  const ym = c0.v + (a * dy) / d
  const xs1 = xm + (h * dy) / d
  const ys1 = ym - (h * dx) / d
  const xs2 = xm - (h * dy) / d
  const ys2 = ym + (h * dx) / d
  if (h < 1e-12) return [{ u: xs1, v: ys1 }]
  return [
    { u: xs1, v: ys1 },
    { u: xs2, v: ys2 },
  ]
}

function cross2(
  a: PanelPoint2,
  b: PanelPoint2,
  p: PanelPoint2,
): number {
  return (b.u - a.u) * (p.v - a.v) - (b.v - a.v) * (p.u - a.u)
}

/** Pick the candidate on the opposite side of line A–B from `ref`. */
function pickOppositeSide(
  cands: PanelPoint2[],
  a: PanelPoint2,
  b: PanelPoint2,
  ref: PanelPoint2,
): PanelPoint2 {
  if (cands.length === 1) return cands[0]
  const refSide = Math.sign(cross2(a, b, ref))
  if (refSide === 0) return pickPreferForward(cands, a)
  const opposite = cands.filter((p) => Math.sign(cross2(a, b, p)) === -refSide)
  if (opposite.length > 0) return opposite[0]
  // Fallback: farthest from ref
  return cands.reduce((best, p) =>
    Math.hypot(p.u - ref.u, p.v - ref.v) >
    Math.hypot(best.u - ref.u, best.v - ref.v)
      ? p
      : best,
  )
}

/** First step: prefer the candidate with larger U (forward along the strip). */
function pickPreferForward(
  cands: PanelPoint2[],
  origin: PanelPoint2,
): PanelPoint2 {
  if (cands.length === 1) return cands[0]
  return cands.reduce((best, p) => (p.u >= best.u ? p : best), cands[0])
  void origin
}

/** Half-breadth hard-chine section at X (chines faired longitudinally). */
export function halfSectionAtX(hull: Hull, x: number): Vec3[] {
  return hardSectionAtX(
    hull,
    x,
    hull.closedTop ? deckCenterline(hull) : undefined,
  )
}

function panelFromHalfSection(
  half: Vec3[],
  id: string,
  name: string,
): Panel | null {
  if (half.length < 2) return null
  const outline: PanelPoint2[] = []
  outline.push({ u: 0, v: half[0].z })
  for (const p of half) outline.push({ u: p.y, v: p.z })
  for (let i = half.length - 1; i >= 0; i--) {
    outline.push({ u: -half[i].y, v: half[i].z })
  }
  outline.push({ u: 0, v: half[0].z })
  const norm = normalizeOutline(outline)
  const b = bounds(norm)
  return {
    id,
    name,
    kind: 'bulkhead',
    outline: norm,
    marks: [],
    width: b.width,
    height: b.height,
  }
}

/** Bulkhead at a shape station (when frame.bulkhead is set). */
export function developStationBulkhead(
  hull: Hull,
  frameIndex: number,
): Panel | null {
  const frame = hull.frames[frameIndex]
  if (!frame?.bulkhead) return null
  const half = halfSectionAtX(hull, frame.x)
  return panelFromHalfSection(
    half,
    `bulkhead-station-${frame.id}`,
    `Bulkhead (station) @ ${frame.x.toFixed(2)}`,
  )
}

/** Derived bulkhead — shape from interpolation, not a control station. */
export function developDerivedBulkhead(
  hull: Hull,
  bulkheadId: string,
): Panel | null {
  const bh = hull.derivedBulkheads?.find((b) => b.id === bulkheadId)
  if (!bh) return null
  const half = halfSectionAtX(hull, bh.x)
  return panelFromHalfSection(
    half,
    `bulkhead-derived-${bh.id}`,
    `${bh.name} @ ${bh.x.toFixed(2)}`,
  )
}

/** @deprecated use developStationBulkhead */
export function developBulkhead(hull: Hull, frameIndex: number): Panel | null {
  return developStationBulkhead(hull, frameIndex)
}

function developEnd(hull: Hull, frameIndex: number, kind: 'stem' | 'stern'): Panel {
  const lines = halfHullPoints(hull)
  const half = lines.map((line) => line[frameIndex])
  let u = 0
  const port: PanelPoint2[] = [{ u: 0, v: 0 }]
  for (let i = 0; i < half.length - 1; i++) {
    u += dist(half[i], half[i + 1])
    port.push({ u, v: 0 })
  }
  const maxY = Math.max(...half.map((p) => p.y), 0.1)
  const outline: PanelPoint2[] = [
    ...port.map((p) => ({ u: p.u, v: 0 })),
    ...port
      .slice()
      .reverse()
      .map((p) => ({ u: p.u, v: maxY })),
    { u: 0, v: 0 },
  ]
  const norm = normalizeOutline(outline)
  const b = bounds(norm)
  const frame = hull.frames[frameIndex]
  return {
    id: `${kind}-${frame.id}`,
    name: kind === 'stem' ? 'Stem pattern' : 'Stern pattern',
    kind,
    outline: norm,
    marks: [],
    width: b.width,
    height: b.height,
  }
}

export function developAllPanels(hull: Hull): Panel[] {
  const deck = hull.closedTop ? deckCenterline(hull) : undefined
  const lines = fairedChineLines(hull, undefined, 8)
  const panels: Panel[] = []

  for (let c = 0; c < lines.length - 1; c++) {
    const name = `${hull.chines[c].name}–${hull.chines[c + 1].name}`
    panels.push(
      unfoldStrake(lines[c], lines[c + 1], `${name} (port)`, `strake-${c}-port`),
    )
    panels.push(
      unfoldStrake(
        lines[c],
        lines[c + 1],
        `${name} (stbd)`,
        `strake-${c}-stbd`,
      ),
    )
  }

  if (hull.closedTop && deck) {
    const faired = fairedChineLines(hull, deck, 8)
    const sheer = faired[faired.length - 2]
    const deckLine = faired[faired.length - 1]
    if (sheer && deckLine) {
      const deckPanel = unfoldStrake(sheer, deckLine, 'Deck (port)', 'deck-port')
      deckPanel.kind = 'deck'
      panels.push(deckPanel)
      const deckStbd = unfoldStrake(sheer, deckLine, 'Deck (stbd)', 'deck-stbd')
      deckStbd.kind = 'deck'
      panels.push(deckStbd)
    }
  }

  for (let f = 0; f < hull.frames.length; f++) {
    const bh = developStationBulkhead(hull, f)
    if (bh) panels.push(bh)
  }

  for (const db of hull.derivedBulkheads ?? []) {
    const bh = developDerivedBulkhead(hull, db.id)
    if (bh) panels.push(bh)
  }

  if (hull.frames.length > 0) {
    panels.push(developEnd(hull, hull.frames.length - 1, 'stem'))
    panels.push(developEnd(hull, 0, 'stern'))
  }

  return panels.filter((p) => p.outline.length >= 3)
}
