import type { Hull } from '../types'
import { MAX_CHINES, MAX_FRAMES } from '../types'
import { syncDeckHeights } from '../geometry/deck'

export function serializeHull(hull: Hull): string {
  return JSON.stringify(hull, null, 2)
}

export function parseHull(json: string): Hull {
  const data = JSON.parse(json) as Hull
  validateHull(data)
  return syncDeckHeights({
    ...data,
    closedTop: data.closedTop ?? false,
    deckHeights: data.deckHeights ?? [],
    longitudinalFairing:
      data.longitudinalFairing ?? data.sectionFairing ?? 1,
    transverseFairing: data.transverseFairing ?? 0,
    derivedBulkheads: data.derivedBulkheads ?? [],
  })
}

export function validateHull(hull: Hull): void {
  if (hull.version !== 1) throw new Error('Unsupported hull version')
  if (!hull.frames?.length) throw new Error('Hull needs at least one frame')
  if (!hull.chines?.length) throw new Error('Hull needs at least one chine')
  if (hull.frames.length > MAX_FRAMES) {
    throw new Error(`Maximum ${MAX_FRAMES} frames`)
  }
  if (hull.chines.length > MAX_CHINES) {
    throw new Error(`Maximum ${MAX_CHINES} chines`)
  }
  for (const chine of hull.chines) {
    if (chine.offsets.length !== hull.frames.length) {
      throw new Error(
        `Chine "${chine.name}" offset count must match frame count`,
      )
    }
  }
}

export function downloadHull(hull: Hull): void {
  const blob = new Blob([serializeHull(hull)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${hull.name.replace(/\s+/g, '-').toLowerCase()}.hull.json`
  a.click()
  URL.revokeObjectURL(url)
}
