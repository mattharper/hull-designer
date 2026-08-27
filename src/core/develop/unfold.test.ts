import { describe, expect, it } from 'vitest'
import { createSkiff, createTestBarge } from '../samples'
import { developAllPanels, developDerivedBulkhead, unfoldStrake } from './unfold'
import { fairedChineLines, halfHullPoints } from '../geometry/points'

describe('panel develop', () => {
  it('unfolds a rectangular strake to expected size', () => {
    const hull = createTestBarge(10, 4, 2)
    const lines = halfHullPoints(hull)
    // Chine to sheer: vertical wall 2 ft high, 10 ft long
    const panel = unfoldStrake(lines[1], lines[2], 'side', 'side')
    expect(panel.width).toBeGreaterThan(9.5)
    expect(panel.width).toBeLessThan(10.5)
    expect(panel.height).toBeGreaterThan(1.8)
    expect(panel.height).toBeLessThan(2.2)
  })

  it('develops skiff panels including derived bulkheads', () => {
    const panels = developAllPanels(createSkiff())
    expect(panels.length).toBeGreaterThan(4)
    expect(panels.some((p) => p.kind === 'strake')).toBe(true)
    expect(panels.some((p) => p.kind === 'bulkhead')).toBe(true)
    expect(panels.some((p) => p.id.startsWith('bulkhead-derived-'))).toBe(true)
    expect(panels.some((p) => p.kind === 'stem')).toBe(true)
  })

  it('cuts a derived bulkhead between shape stations', () => {
    const hull = createSkiff()
    const mid = developDerivedBulkhead(hull, 'dbh-0')
    expect(mid).not.toBeNull()
    expect(mid!.outline.length).toBeGreaterThan(4)
    expect(mid!.width).toBeGreaterThan(1)
  })

  it('avoids zigzag reverse folds on faired strake edges', () => {
    const hull = createSkiff()
    const lines = fairedChineLines(hull, undefined, 8)
    const panel = unfoldStrake(lines[0], lines[1], 'keel-chine', 'kc')
    const n = lines[0].length
    const lower = panel.marks.slice(0, n)
    const turns: number[] = []
    for (let i = 1; i < lower.length - 1; i++) {
      const a = lower[i - 1]
      const b = lower[i]
      const c = lower[i + 1]
      const ax = b.u - a.u
      const ay = b.v - a.v
      const bx = c.u - b.u
      const by = c.v - b.v
      const cross = ax * by - ay * bx
      const dot = ax * bx + ay * by
      const ang = (Math.atan2(cross, dot) * 180) / Math.PI
      turns.push(ang)
    }
    const reversals = turns.filter((t) => Math.abs(t) > 90)
    expect(reversals.length).toBe(0)
    expect(panel.width).toBeGreaterThan(1)
    expect(panel.height).toBeGreaterThan(0.1)
  })
})
