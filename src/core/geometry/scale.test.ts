import { describe, expect, it } from 'vitest'
import { createSkiff } from '../samples'
import {
  hullExtents,
  scaleHull,
  scalesFromPercents,
  scalesFromTargets,
} from './scale'

describe('scaleHull', () => {
  it('scales length, beam, and height independently', () => {
    const hull = createSkiff()
    const before = hullExtents(hull)
    const scaled = scaleHull(hull, 2, 0.5, 1.5)
    const after = hullExtents(scaled)

    expect(after.length).toBeCloseTo(before.length * 2, 2)
    expect(after.halfBreadth).toBeCloseTo(before.halfBreadth * 0.5, 2)
    expect(after.height).toBeCloseTo(before.height * 1.5, 2)
    expect(scaled.loa).toBeCloseTo(hull.loa * 2, 2)
    expect(scaled.designDraft).toBeCloseTo(hull.designDraft * 1.5, 2)
    expect(scaled.cg.x).toBeCloseTo(hull.cg.x * 2, 2)
    expect(scaled.cg.z).toBeCloseTo(hull.cg.z * 1.5, 2)
    expect(scaled.derivedBulkheads[0].x).toBeCloseTo(
      hull.derivedBulkheads[0].x * 2,
      2,
    )
  })

  it('computes percent and target scale factors', () => {
    expect(scalesFromPercents(200, 50, 100)).toEqual({
      sx: 2,
      sy: 0.5,
      sz: 1,
    })
    const extents = { length: 10, halfBreadth: 2, height: 1, minX: 0, maxX: 10 }
    expect(scalesFromTargets(extents, 20, null, 2)).toEqual({
      sx: 2,
      sy: 1,
      sz: 2,
    })
  })
})
