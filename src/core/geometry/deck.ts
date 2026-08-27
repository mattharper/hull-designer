import type { Hull, Vec3 } from '../types'
import { halfHullPoints } from './points'

/** Default deck CL height from sheer (slight crown). */
export function defaultDeckHeights(hull: Hull): number[] {
  const sheer = hull.chines[hull.chines.length - 1]
  return hull.frames.map((_, i) => {
    const sz = sheer?.offsets[i]?.z ?? 0.5
    return Math.round((sz + 0.05) * 100) / 100
  })
}

/** Keep deckHeights aligned with frame count. */
export function syncDeckHeights(hull: Hull): Hull {
  const n = hull.frames.length
  let deckHeights = hull.deckHeights?.slice(0, n) ?? []
  if (hull.closedTop) {
    const defaults = defaultDeckHeights(hull)
    while (deckHeights.length < n) {
      deckHeights.push(defaults[deckHeights.length] ?? defaults[defaults.length - 1] ?? 0.5)
    }
  }
  return {
    ...hull,
    closedTop: hull.closedTop ?? false,
    deckHeights: hull.closedTop ? deckHeights : (hull.deckHeights ?? []),
  }
}

export function deckCenterline(hull: Hull): Vec3[] {
  if (!hull.closedTop) return []
  const heights =
    hull.deckHeights.length === hull.frames.length
      ? hull.deckHeights
      : defaultDeckHeights(hull)
  return hull.frames.map((f, i) => ({
    x: f.x,
    y: 0,
    z: heights[i] ?? 0,
  }))
}

/** Half-section outline including deck CL when closed (keel → … → sheer → deck). */
export function halfSectionOutline(hull: Hull, frameIndex: number): Vec3[] {
  const lines = halfHullPoints(hull)
  const pts = lines.map((line) => line[frameIndex])
  if (hull.closedTop) {
    const deck = deckCenterline(hull)[frameIndex]
    if (deck) pts.push(deck)
  }
  return pts
}
