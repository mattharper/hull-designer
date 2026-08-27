import { describe, expect, it } from 'vitest'
import { createTestBarge } from '../samples'
import {
  computeHydrostatics,
  computeWaterline,
  findDraftForDisplacement,
} from './hydrostatics'

describe('computeHydrostatics', () => {
  it('matches prismatic barge displacement at half draft', () => {
    const length = 10
    const beam = 4
    const depth = 2
    const draft = 1
    const hull = createTestBarge(length, beam, depth)
    hull.designDraft = draft
    const h = computeHydrostatics(hull, { draft, heelDeg: 0, trimDeg: 0 })

    const expectedVol = length * beam * draft
    expect(h.displacementVolume).toBeGreaterThan(expectedVol * 0.9)
    expect(h.displacementVolume).toBeLessThan(expectedVol * 1.1)
    expect(h.lcb).toBeGreaterThan(length * 0.4)
    expect(h.lcb).toBeLessThan(length * 0.6)
    expect(h.vcb).toBeGreaterThan(draft * 0.4)
    expect(h.vcb).toBeLessThan(draft * 0.6)
    expect(Math.abs(h.tcb)).toBeLessThan(0.05)
    expect(h.lwl).toBeGreaterThan(length * 0.9)
    expect(h.bwl).toBeGreaterThan(beam * 0.9)
  })

  it('produces nonzero GZ at heel for barge', () => {
    const hull = createTestBarge(10, 4, 2)
    hull.cg = { x: 5, y: 0, z: 1.2 }
    const upright = computeHydrostatics(hull, { draft: 1, heelDeg: 0 })
    const heeled = computeHydrostatics(hull, { draft: 1, heelDeg: 10 })
    expect(Math.abs(upright.gz)).toBeLessThan(0.05)
    expect(Math.abs(heeled.gz)).toBeGreaterThan(0.01)
  })

  it('CLA area is positive when immersed', () => {
    const hull = createTestBarge(10, 4, 2)
    const h = computeHydrostatics(hull, { draft: 1 })
    expect(h.claArea).toBeGreaterThan(0)
  })

  it('finds draft for a target displacement', () => {
    const hull = createTestBarge(10, 4, 2)
    const atDraft = computeHydrostatics(hull, { draft: 1 })
    const solved = findDraftForDisplacement(hull, atDraft.displacementWeight, {
      heelDeg: 0,
      trimDeg: 0,
    })
    expect(solved.draft).toBeCloseTo(1, 2)
    expect(solved.displacementWeight).toBeCloseTo(
      atDraft.displacementWeight,
      0,
    )
  })

  it('traces a waterline on the hull at draft', () => {
    const hull = createTestBarge(10, 4, 2)
    const lines = computeWaterline(hull, { draft: 1, heelDeg: 0, trimDeg: 0 })
    expect(lines.length).toBeGreaterThan(0)
    const loop = lines[0]
    expect(loop.length).toBeGreaterThan(10)
    // All points on the waterplane
    for (const p of loop) {
      expect(p.z).toBeCloseTo(1, 5)
    }
    // Full beam ~4 at midships
    const ys = loop.map((p) => p.y)
    expect(Math.max(...ys)).toBeGreaterThan(1.8)
    expect(Math.min(...ys)).toBeLessThan(-1.8)
  })
})
