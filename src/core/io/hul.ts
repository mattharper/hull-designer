/**
 * Carlson Design Hulls (*.hul) importer.
 *
 * Format (ASCII, one number per line, CRLF):
 *   nChines                 // 2–6 (keel … sheer)
 *   for station 0..4:       // stem → stern (5 design bulkheads)
 *     for chine 0..n-1:
 *       X  // half-breadth, inches
 *       Y  // height above baseline, inches
 *       Z  // station from stem, inches (may vary on raked stem/transom)
 *   … optional faired points / frame list / metadata text …
 *
 * Carlson: stem at Z=0, X out from CL, Y up.
 * Ours: stern at x=0, bow at loa; y half-breadth; z up. Units: feet.
 */

import type { Hull } from '../types'
import { MAX_CHINES, MAX_FRAMES } from '../types'

const IN_TO_FT = 1 / 12

export interface HulMeta {
  name?: string
  description?: string
  author?: string
  date?: string
}

export function isHulText(text: string): boolean {
  const lines = text.replace(/\r/g, '').split('\n')
  for (const line of lines) {
    const s = line.trim()
    if (!s) continue
    const n = Number(s)
    return Number.isFinite(n) && n >= 2 && n <= 6 && Math.abs(n - Math.round(n)) < 1e-9
  }
  return false
}

export function parseHul(text: string, fileName = 'imported'): Hull {
  const tokens = tokenize(text)
  if (tokens.numbers.length < 1 + 5 * 2 * 3) {
    throw new Error('Invalid .HUL file: not enough numeric data')
  }

  const nChines = Math.round(tokens.numbers[0])
  if (nChines < 2 || nChines > 6) {
    throw new Error(`Invalid .HUL chine count: ${nChines} (expected 2–6)`)
  }
  if (nChines > MAX_CHINES) {
    throw new Error(`Maximum ${MAX_CHINES} chines`)
  }

  const need = 1 + 5 * nChines * 3
  if (tokens.numbers.length < need) {
    throw new Error('Invalid .HUL file: truncated control points')
  }

  // stations[s][c] = { x:beam, y:height, z:stationFromStem } in inches
  const stations: { beam: number; height: number; sta: number }[][] = []
  let idx = 1
  for (let s = 0; s < 5; s++) {
    const row: { beam: number; height: number; sta: number }[] = []
    for (let c = 0; c < nChines; c++) {
      row.push({
        beam: Math.abs(tokens.numbers[idx++]),
        height: tokens.numbers[idx++],
        sta: tokens.numbers[idx++],
      })
    }
    stations.push(row)
  }

  // Frame longitudinal position: mean station of the section (handles rake).
  const staMean = stations.map(
    (row) => row.reduce((a, p) => a + p.sta, 0) / row.length,
  )
  const staMin = Math.min(...staMean)
  const staMax = Math.max(...staMean)
  const loaIn = Math.max(staMax - staMin, 1e-3)

  if (5 > MAX_FRAMES) {
    throw new Error(`Maximum ${MAX_FRAMES} frames`)
  }

  // Carlson stem(Z=0) → our bow; Carlson stern → our x=0.
  const frames = staMean.map((sta, i) => {
    const x = ((staMax - sta) * IN_TO_FT)
    return {
      id: `f-${i}`,
      x: round3(x),
      bulkhead: i > 0 && i < 4, // middle three are construction-shaped bulkheads
    }
  })

  // After flip, frames are bow…stern in Carlson order; sort stern→bow (ascending x).
  const order = frames
    .map((f, i) => ({ i, x: f.x }))
    .sort((a, b) => a.x - b.x)
  const sortedFrames = order.map((o, fi) => ({
    ...frames[o.i],
    id: `f-${fi}`,
  }))

  const chineNames = defaultChineNames(nChines)
  const chines = chineNames.map((name, c) => ({
    id: `c-${c}`,
    name,
    offsets: order.map(({ i: s }) => {
      const p = stations[s][c]
      return {
        y: round3(p.beam * IN_TO_FT),
        z: round3(Math.max(0, p.height) * IN_TO_FT),
      }
    }),
  }))

  const loa = round3(loaIn * IN_TO_FT)
  const maxZ = Math.max(...chines.flatMap((ch) => ch.offsets.map((o) => o.z)), 0.1)
  const designDraft = round3(maxZ * 0.35)

  const meta = tokens.meta
  const baseName = fileName.replace(/\.(hul)$/i, '')
  const name = meta.name?.trim() || baseName || 'Carlson hull'

  return {
    version: 1,
    name,
    units: 'ft',
    loa,
    waterDensity: 64,
    designDraft,
    cg: {
      x: round3(loa * 0.45),
      y: 0,
      z: round3(maxZ * 0.55),
    },
    frames: sortedFrames,
    chines,
    closedTop: false,
    deckHeights: [],
    longitudinalFairing: 1,
    transverseFairing: 0,
    derivedBulkheads: [],
  }
}

function defaultChineNames(n: number): string[] {
  if (n === 2) return ['Keel', 'Sheer']
  if (n === 3) return ['Keel', 'Chine', 'Sheer']
  const names = ['Keel']
  for (let i = 1; i < n - 1; i++) names.push(`Chine ${i}`)
  names.push('Sheer')
  return names
}

function tokenize(text: string): {
  numbers: number[]
  meta: HulMeta
} {
  const numbers: number[] = []
  const strings: string[] = []
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const s = raw.trim()
    if (!s) continue
    const n = Number(s)
    if (strings.length === 0 && Number.isFinite(n)) {
      numbers.push(n)
    } else {
      strings.push(s)
    }
  }
  // Once a non-numeric line appears, remaining lines are metadata
  // (but some files interleave zeros after text — ignore trailing nums in strings)
  const meta: HulMeta = {}
  if (strings.length > 0) meta.name = strings[0]
  if (strings.length > 1) meta.description = strings[1]
  if (strings.length > 2) meta.author = strings[2]
  if (strings.length > 3) meta.date = strings[3]
  return { numbers, meta }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
