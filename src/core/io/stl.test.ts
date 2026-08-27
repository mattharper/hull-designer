import { describe, expect, it } from 'vitest'
import {
  createSkiff,
  createDinghy,
  createSupBoard,
  createSuperK2,
} from '../samples'
import {
  buildWatertightTriangles,
  hullToStl,
  meshManifoldStats,
} from './stl'

describe('hullToStl', () => {
  it('emits ASCII STL with facets', () => {
    const hull = createSkiff()
    const stl = hullToStl(hull)
    expect(stl.startsWith('solid ')).toBe(true)
    expect(stl).toContain('facet normal')
    expect(stl).toContain('vertex ')
    expect(stl).toContain('endsolid')
    const facets = stl.match(/endfacet/g)?.length ?? 0
    expect(facets).toBeGreaterThan(10)
  })

  it('scales feet to millimetres by default', () => {
    const stl = hullToStl(createSkiff())
    const verts = [...stl.matchAll(/vertex\s+([^\s]+)/g)].map((m) =>
      Math.abs(Number(m[1])),
    )
    expect(Math.max(...verts)).toBeGreaterThan(100)
  })

  it('exports a manifold watertight mesh for sample hulls', () => {
    for (const hull of [
      createSkiff(),
      createDinghy(),
      createSupBoard(),
      createSuperK2(),
    ]) {
      const tris = buildWatertightTriangles(hull)
      const stats = meshManifoldStats(tris)
      expect(stats.degenerates, hull.name).toBe(0)
      expect(stats.nonManifold, hull.name).toBe(0)
      expect(stats.boundary, hull.name).toBe(0)
      expect(tris.length, hull.name).toBeGreaterThan(10)
    }
  })
})
