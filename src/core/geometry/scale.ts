import type { Hull } from '../types'

export interface HullExtents {
  /** Longitudinal span (max frame x − min frame x). */
  length: number
  /** Maximum half-breadth. */
  halfBreadth: number
  /** Maximum height above baseline. */
  height: number
  minX: number
  maxX: number
}

export function hullExtents(hull: Hull): HullExtents {
  let minX = Infinity
  let maxX = -Infinity
  let halfBreadth = 0
  let height = 0

  for (const f of hull.frames) {
    minX = Math.min(minX, f.x)
    maxX = Math.max(maxX, f.x)
  }
  if (!Number.isFinite(minX)) {
    minX = 0
    maxX = hull.loa
  }

  for (const c of hull.chines) {
    for (const o of c.offsets) {
      halfBreadth = Math.max(halfBreadth, Math.abs(o.y))
      height = Math.max(height, o.z)
    }
  }
  for (const z of hull.deckHeights ?? []) {
    height = Math.max(height, z)
  }

  return {
    length: Math.max(maxX - minX, 1e-9),
    halfBreadth: Math.max(halfBreadth, 1e-9),
    height: Math.max(height, 1e-9),
    minX,
    maxX,
  }
}

/**
 * Scale hull geometry about origin (stern/baseline/CL).
 * X → frames, LOA, bulkheads, LCG
 * Y → half-breadths, TCG
 * Z → heights, deck, draft, VCG
 */
export function scaleHull(
  hull: Hull,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
): Hull {
  const sx = scaleX > 0 && Number.isFinite(scaleX) ? scaleX : 1
  const sy = scaleY > 0 && Number.isFinite(scaleY) ? scaleY : 1
  const sz = scaleZ > 0 && Number.isFinite(scaleZ) ? scaleZ : 1

  if (sx === 1 && sy === 1 && sz === 1) return structuredClone(hull)

  const next = structuredClone(hull)
  next.loa = roundDim(next.loa * sx)
  next.designDraft = roundDim(next.designDraft * sz)
  next.cg = {
    x: roundDim(next.cg.x * sx),
    y: roundDim(next.cg.y * sy),
    z: roundDim(next.cg.z * sz),
  }
  next.frames = next.frames.map((f) => ({
    ...f,
    x: roundDim(f.x * sx),
  }))
  next.chines = next.chines.map((c) => ({
    ...c,
    offsets: c.offsets.map((o) => ({
      y: roundDim(o.y * sy),
      z: roundDim(o.z * sz),
    })),
  }))
  next.deckHeights = (next.deckHeights ?? []).map((z) => roundDim(z * sz))
  next.derivedBulkheads = (next.derivedBulkheads ?? []).map((b) => ({
    ...b,
    x: roundDim(b.x * sx),
  }))
  return next
}

/** Scale factors from percent values (100 = unchanged). */
export function scalesFromPercents(
  pctX: number,
  pctY: number,
  pctZ: number,
): { sx: number; sy: number; sz: number } {
  return {
    sx: pctX / 100,
    sy: pctY / 100,
    sz: pctZ / 100,
  }
}

/**
 * Scale factors so each axis reaches a target max size.
 * Pass `null`/`undefined` to leave that axis unchanged.
 */
export function scalesFromTargets(
  extents: HullExtents,
  targetLength: number | null,
  targetHalfBreadth: number | null,
  targetHeight: number | null,
): { sx: number; sy: number; sz: number } {
  return {
    sx:
      targetLength != null && targetLength > 0
        ? targetLength / extents.length
        : 1,
    sy:
      targetHalfBreadth != null && targetHalfBreadth > 0
        ? targetHalfBreadth / extents.halfBreadth
        : 1,
    sz:
      targetHeight != null && targetHeight > 0
        ? targetHeight / extents.height
        : 1,
  }
}

function roundDim(n: number): number {
  return Math.round(n * 1000) / 1000
}
