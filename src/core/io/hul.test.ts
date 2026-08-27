import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseHul, isHulText } from './hul'
import { validateHull } from './json'

const hulls = resolve(dirname(fileURLToPath(import.meta.url)), '../../../hulls')

describe('parseHul', () => {
  it('detects Carlson .HUL text', () => {
    const text = readFileSync(resolve(hulls, 'BOX.HUL'), 'utf8')
    expect(isHulText(text)).toBe(true)
  })

  it('imports BOX as a rectangular hull in feet', () => {
    const text = readFileSync(resolve(hulls, 'BOX.HUL'), 'utf8')
    const hull = parseHul(text, 'BOX.HUL')
    validateHull(hull)
    expect(hull.chines).toHaveLength(3)
    expect(hull.frames).toHaveLength(5)
    // 100 in LOA → ~8.333 ft
    expect(hull.loa).toBeCloseTo(100 / 12, 2)
    // half-beam 25 in → ~2.083 ft
    const mid = hull.frames.findIndex((f) => Math.abs(f.x - hull.loa / 2) < 0.5)
    const sheer = hull.chines[2].offsets[mid >= 0 ? mid : 2]
    expect(sheer.y).toBeCloseTo(25 / 12, 2)
    expect(sheer.z).toBeCloseTo(25 / 12, 2)
    // keel on centerline
    expect(hull.chines[0].offsets.every((o) => o.y < 0.05)).toBe(true)
  })

  it('imports 10FTSKIF with raked stem/transom', () => {
    const text = readFileSync(resolve(hulls, '10FTSKIF.HUL'), 'utf8')
    const hull = parseHul(text, '10FTSKIF.HUL')
    validateHull(hull)
    expect(hull.chines).toHaveLength(6)
    expect(hull.loa).toBeGreaterThan(9)
    expect(hull.loa).toBeLessThan(12)
    expect(hull.name.length).toBeGreaterThan(0)
  })

  it('imports SHARPIE1 two-chine hull', () => {
    const text = readFileSync(resolve(hulls, 'SHARPIE1.HUL'), 'utf8')
    const hull = parseHul(text, 'SHARPIE1.HUL')
    validateHull(hull)
    expect(hull.chines).toHaveLength(2)
    expect(hull.frames[0].x).toBeLessThan(hull.frames[4].x)
  })
})
