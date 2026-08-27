import { describe, expect, it } from 'vitest'
import { createSkiff } from '../samples'
import { hullToSvg } from './svg'

describe('hullToSvg', () => {
  it('emits a valid isometric SVG with chine and frame paths', () => {
    const svg = hullToSvg(createSkiff(), { view: 'isometric' })
    expect(svg).toContain('<svg')
    expect(svg).toContain('class="chine"')
    expect(svg).toContain('class="frame"')
    expect(svg).toContain('viewBox=')
    expect(svg).toMatch(/d="M/)
  })

  it('supports profile and plan views', () => {
    const hull = createSkiff()
    for (const view of ['profile', 'plan'] as const) {
      const svg = hullToSvg(hull, { view })
      expect(svg).toContain(`(${view})`)
      expect(svg).toContain('<path')
    }
  })
})
