import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../types'
import { createSkiff } from '../samples'
import {
  fairLongitudinalCurve,
  fairTransverseCurve,
  fairedSurfaceGrid,
  hardSectionAtX,
} from './points'

const controls: Vec3[] = [
  { x: 0, y: 1, z: 0.4 },
  { x: 4, y: 2, z: 0.2 },
  { x: 8, y: 2.2, z: 0.3 },
]

describe('fairLongitudinalCurve', () => {
  it('preserves every station control and adds fore–aft samples', () => {
    const points = fairLongitudinalCurve(controls, 0.8, 6)

    expect(points).toHaveLength(13)
    expect(points[0]).toEqual(controls[0])
    expect(points[6]).toEqual(controls[1])
    expect(points[12]).toEqual(controls[2])
  })

  it('returns straight segments at zero fairing', () => {
    const points = fairLongitudinalCurve(controls, 0, 2)

    expect(points[1].x).toBeCloseTo(2)
    expect(points[1].y).toBeCloseTo(1.5)
    expect(points[1].z).toBeCloseTo(0.3)
  })

  it('curves between stations when fairing is enabled', () => {
    const straight = fairLongitudinalCurve(controls, 0, 4)
    const faired = fairLongitudinalCurve(controls, 1, 4)

    expect(faired[2].y).not.toBeCloseTo(straight[2].y, 5)
    expect(faired.every((p) => p.y >= 0 && p.z >= 0)).toBe(true)
  })
})

describe('fairTransverseCurve / section bend', () => {
  const section: Vec3[] = [
    { x: 4, y: 0, z: 0 },
    { x: 4, y: 2, z: 0.3 },
    { x: 4, y: 2.2, z: 1.5 },
  ]

  it('keeps straight plates at zero transverse fairing', () => {
    const pts = fairTransverseCurve(section, 0, 2)
    expect(pts[1].y).toBeCloseTo(1)
    expect(pts[1].z).toBeCloseTo(0.15)
  })

  it('bends the section when transverse fairing is enabled', () => {
    const straight = fairTransverseCurve(section, 0, 4)
    const bent = fairTransverseCurve(section, 1, 4)
    expect(bent[2].y).not.toBeCloseTo(straight[2].y, 5)
  })

  it('adds transverse rows to the surface grid when enabled', () => {
    const hard = createSkiff()
    hard.transverseFairing = 0
    const round = { ...createSkiff(), transverseFairing: 0.8 }
    const hardGrid = fairedSurfaceGrid(hard)
    const roundGrid = fairedSurfaceGrid(round)
    expect(roundGrid.length).toBeGreaterThan(hardGrid.length)
  })

  it('hardSectionAtX respects transverse fairing', () => {
    const hull = createSkiff()
    hull.transverseFairing = 0
    const flat = hardSectionAtX(hull, 8)
    hull.transverseFairing = 1
    const bent = hardSectionAtX(hull, 8)
    expect(bent.length).toBeGreaterThan(flat.length)
  })
})
