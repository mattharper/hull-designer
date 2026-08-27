import { describe, expect, it } from 'vitest'
import { createSkiff } from '../samples'
import { developAllPanels } from '../develop/unfold'
import {
  autoLayoutPanels,
  computeNestStats,
  nestPanels,
  panelFootprint,
  placementBounds,
  sheetBoardLayout,
  sheetsOverlappedByRect,
  transformedOutline,
} from './nesting'
import type { Panel } from '../types'

function rectPanel(id: string, w: number, h: number): Panel {
  return {
    id,
    name: id,
    kind: 'strake',
    width: w,
    height: h,
    outline: [
      { u: 0, v: 0 },
      { u: w, v: 0 },
      { u: w, v: h },
      { u: 0, v: h },
    ],
    marks: [],
  }
}

describe('nestPanels autolayout', () => {
  it('places all skiff panels without overlap on sheets', () => {
    const panels = developAllPanels(createSkiff())
    // Scarfed-length sheet typical for long strakes
    const sheet = { width: 4, height: 20 }
    const nest = nestPanels(panels, 5, sheet, 0.05, {
      allowFlip: true,
    })
    const stats = computeNestStats(panels, nest)
    expect(nest.placements).toHaveLength(panels.length)
    expect(stats.panelsOverflow).toBe(0)
    expect(stats.sheetsUsed).toBeGreaterThan(0)
    expect(stats.utilization).toBeGreaterThan(0.05)
  })

  it('autoLayout fits panels on stock sheets (may span seams)', () => {
    const panels = developAllPanels(createSkiff())
    const nest = autoLayoutPanels(panels, { width: 4, height: 8 }, 0.05)
    const stats = computeNestStats(panels, nest)
    expect(stats.panelsOverflow).toBe(0)
    expect(nest.sheets.length).toBeGreaterThanOrEqual(stats.sheetsUsed)
    expect(stats.sheetsUsed).toBeGreaterThan(0)
  })

  it('prefers fewer sheets when possible', () => {
    const small = developAllPanels(createSkiff()).slice(0, 2)
    const nest = autoLayoutPanels(small, { width: 8, height: 8 }, 0.05)
    const stats = computeNestStats(small, nest)
    expect(stats.panelsOverflow).toBe(0)
    expect(stats.sheetsUsed).toBeGreaterThan(0)
    expect(nest.sheets.length).toBeLessThanOrEqual(12)
  })

  it('keeps rotated outlines inside the packed AABB', () => {
    const panel = rectPanel('p', 2, 1)
    for (const rot of [0, 90, 180, 270]) {
      const placement = {
        panelId: panel.id,
        sheetIndex: 0,
        x: 0.5,
        y: 0.25,
        rotationDeg: rot,
        flipped: false,
      }
      const fp = panelFootprint(panel, rot)
      const b = placementBounds(panel, placement)
      expect(b.x).toBeCloseTo(placement.x, 6)
      expect(b.y).toBeCloseTo(placement.y, 6)
      expect(b.w).toBeCloseTo(fp.w, 6)
      expect(b.h).toBeCloseTo(fp.h, 6)
      const pts = transformedOutline(panel, placement)
      for (const p of pts) {
        expect(p.x).toBeGreaterThanOrEqual(placement.x - 1e-9)
        expect(p.y).toBeGreaterThanOrEqual(placement.y - 1e-9)
        expect(p.x).toBeLessThanOrEqual(placement.x + fp.w + 1e-9)
        expect(p.y).toBeLessThanOrEqual(placement.y + fp.h + 1e-9)
      }
    }
  })

  it('does not mark packer rotations as flipped', () => {
    const panels = [rectPanel('a', 3, 1), rectPanel('b', 1, 2)]
    const nest = nestPanels(panels, 1, { width: 4, height: 8 }, 0.05, {
      allowFlip: true,
    })
    for (const pl of nest.placements) {
      expect(pl.flipped).toBe(false)
    }
  })

  it('lays portrait sheets with short edges touching (stacked on Y)', () => {
    const layout = sheetBoardLayout({ width: 4, height: 8 }, 3)
    expect(layout.stackVertical).toBe(true)
    expect(layout.boardWidth).toBe(4)
    expect(layout.boardHeight).toBe(24)
    expect(layout.origins).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 8 },
      { x: 0, y: 16 },
    ])
  })

  it('lays landscape sheets with short edges touching (row on X)', () => {
    const layout = sheetBoardLayout({ width: 8, height: 4 }, 3)
    expect(layout.stackVertical).toBe(false)
    expect(layout.boardWidth).toBe(24)
    expect(layout.boardHeight).toBe(4)
  })

  it('allows a long panel to span two sheets', () => {
    const panel = rectPanel('long', 3, 12)
    const nest = nestPanels([panel], 2, { width: 4, height: 8 }, 0.05, {
      allowFlip: true,
    })
    const stats = computeNestStats([panel], nest)
    expect(stats.panelsOverflow).toBe(0)
    const pl = nest.placements[0]
    const fp = panelFootprint(panel, pl.rotationDeg)
    const layout = sheetBoardLayout(nest.sheets[0], nest.sheets.length)
    const hit = sheetsOverlappedByRect(layout, pl.x, pl.y, fp.w, fp.h)
    expect(hit.length).toBeGreaterThanOrEqual(2)
  })
})
