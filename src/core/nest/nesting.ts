import type { NestResult, NestSheet, NestedPlacement, Panel } from '../types'

export const DEFAULT_SHEET: NestSheet = {
  width: 4, // ft (48")
  height: 8, // ft (96")
}

export interface NestOptions {
  sheetCount?: number | 'auto'
  sheet?: NestSheet
  gap?: number
  /** Allow 180°/270° in addition to 0/90. */
  allowFlip?: boolean
  /** Max sheets when sheetCount is 'auto'. */
  maxSheets?: number
}

export interface NestStats {
  sheetsUsed: number
  panelsPlaced: number
  panelsOverflow: number
  /** Filled area / (sheetsUsed × sheet area), 0–1. */
  utilization: number
  totalPanelArea: number
  usedSheetArea: number
}

/** How identical sheets are tiled into one packing/display board. */
export interface SheetBoardLayout {
  sheet: NestSheet
  count: number
  /** Portrait sheets stack on +Y so short (width) edges touch. */
  stackVertical: boolean
  boardWidth: number
  boardHeight: number
  origins: { x: number; y: number }[]
}

/**
 * Lay sheets so shortest edges touch (zero seam).
 * Portrait (w ≤ h): stack along Y. Landscape (w > h): arrange along X.
 * Placement (x, y) is in this continuous board space; parts may span seams.
 */
export function sheetBoardLayout(
  sheet: NestSheet,
  count: number,
): SheetBoardLayout {
  const n = Math.max(1, count)
  const stackVertical = sheet.width <= sheet.height
  const origins = Array.from({ length: n }, (_, i) =>
    stackVertical
      ? { x: 0, y: i * sheet.height }
      : { x: i * sheet.width, y: 0 },
  )
  return {
    sheet,
    count: n,
    stackVertical,
    boardWidth: stackVertical ? sheet.width : n * sheet.width,
    boardHeight: stackVertical ? n * sheet.height : sheet.height,
    origins,
  }
}

export function sheetIndexContaining(
  layout: SheetBoardLayout,
  x: number,
  y: number,
): number {
  if (layout.stackVertical) {
    const i = Math.floor(y / Math.max(layout.sheet.height, 1e-9))
    return Math.max(0, Math.min(layout.count - 1, i))
  }
  const i = Math.floor(x / Math.max(layout.sheet.width, 1e-9))
  return Math.max(0, Math.min(layout.count - 1, i))
}

export function sheetsOverlappedByRect(
  layout: SheetBoardLayout,
  x: number,
  y: number,
  w: number,
  h: number,
): number[] {
  const out: number[] = []
  for (let i = 0; i < layout.count; i++) {
    const o = layout.origins[i]
    const sw = layout.sheet.width
    const sh = layout.sheet.height
    if (
      !(
        x + w <= o.x + 1e-9 ||
        o.x + sw <= x + 1e-9 ||
        y + h <= o.y + 1e-9 ||
        o.y + sh <= y + 1e-9
      )
    ) {
      out.push(i)
    }
  }
  return out
}

/** Highest sheet index touched by any placement (+1 = sheet count). */
export function requiredSheetCount(
  panels: Panel[],
  nest: NestResult,
): number {
  if (nest.sheets.length === 0) return 0
  const sheet = nest.sheets[0]
  const byId = new Map(panels.map((p) => [p.id, p]))
  let maxIdx = nest.sheets.length - 1
  for (const pl of nest.placements) {
    maxIdx = Math.max(maxIdx, pl.sheetIndex)
    const panel = byId.get(pl.panelId)
    if (!panel) continue
    const fp = panelFootprint(panel, pl.rotationDeg)
    // Probe against a generous layout so spanning past current count is seen
    const probe = sheetBoardLayout(
      sheet,
      Math.max(nest.sheets.length, pl.sheetIndex + 4),
    )
    for (const i of sheetsOverlappedByRect(probe, pl.x, pl.y, fp.w, fp.h)) {
      maxIdx = Math.max(maxIdx, i)
    }
  }
  return maxIdx + 1
}

export function createSheets(
  count: number,
  sheet: NestSheet = DEFAULT_SHEET,
): NestSheet[] {
  return Array.from({ length: count }, () => ({ ...sheet }))
}

export function panelFootprint(
  panel: Panel,
  rotationDeg: number,
): { w: number; h: number } {
  const r = ((rotationDeg % 360) + 360) % 360
  if (r === 90 || r === 270) {
    return { w: panel.height, h: panel.width }
  }
  return { w: panel.width, h: panel.height }
}

interface FreeRect {
  x: number
  y: number
  w: number
  h: number
}

interface Candidate {
  x: number
  y: number
  rotationDeg: number
  flipped: boolean
  w: number
  h: number
  /** Lower is better (BSSF score). */
  score: number
  freeIndex: number
}

function rotationsFor(allowFlip: boolean): number[] {
  return allowFlip ? [0, 90, 180, 270] : [0, 90]
}

/**
 * MaxRects Best Short Side Fit on a continuous board of abutted sheets.
 * Parts may cross sheet seams; stock sheets share shortest edges.
 */
export function nestPanels(
  panels: Panel[],
  sheetCount: number | 'auto' = 3,
  sheet: NestSheet = DEFAULT_SHEET,
  gap = 0.05,
  options?: Pick<NestOptions, 'allowFlip' | 'maxSheets'>,
): NestResult {
  const allowFlip = options?.allowFlip ?? true
  const maxSheets =
    options?.maxSheets ??
    (typeof sheetCount === 'number' ? sheetCount : 12)

  const count =
    sheetCount === 'auto'
      ? Math.min(maxSheets, Math.max(1, estimateMinSheets(panels, sheet, gap)))
      : sheetCount

  let sheets = createSheets(count, sheet)
  const placements: NestedPlacement[] = []
  const overflow: Panel[] = []

  const sorted = [...panels].sort((a, b) => {
    const aa = a.width * a.height
    const bb = b.width * b.height
    if (bb !== aa) return bb - aa
    return Math.max(b.width, b.height) - Math.max(a.width, a.height)
  })

  const tryPlaceAll = (): boolean => {
    placements.length = 0
    overflow.length = 0
    const layout = sheetBoardLayout(sheet, sheets.length)
    const free: FreeRect[] = [
      {
        x: gap,
        y: gap,
        w: Math.max(0, layout.boardWidth - gap * 2),
        h: Math.max(0, layout.boardHeight - gap * 2),
      },
    ]

    for (const panel of sorted) {
      const cand = findBestPlacement(panel, free, allowFlip)
      if (!cand) {
        overflow.push(panel)
        continue
      }
      placements.push({
        panelId: panel.id,
        sheetIndex: sheetIndexContaining(
          layout,
          cand.x + cand.w * 0.5,
          cand.y + cand.h * 0.5,
        ),
        x: cand.x,
        y: cand.y,
        rotationDeg: cand.rotationDeg,
        flipped: cand.flipped,
      })
      placeInFreeList(free, cand, gap)
    }
    return overflow.length === 0
  }

  tryPlaceAll()

  // Auto: grow sheet count until everything fits or max reached
  if (sheetCount === 'auto' || overflow.length > 0) {
    while (overflow.length > 0 && sheets.length < maxSheets) {
      sheets = createSheets(sheets.length + 1, sheet)
      tryPlaceAll()
    }
  }

  // Remaining overflow: park off-board for visibility
  const layout = sheetBoardLayout(sheet, sheets.length)
  for (const panel of overflow) {
    placements.push({
      panelId: panel.id,
      sheetIndex: sheets.length - 1,
      x: gap,
      y:
        layout.boardHeight +
        gap +
        placements.filter((p) => p.y >= layout.boardHeight).length * 0.2,
      rotationDeg: 0,
      flipped: false,
    })
  }

  // Drop trailing empty sheets (keep at least the requested count when fixed).
  const byId = new Map(panels.map((p) => [p.id, p]))
  let maxUsed = 0
  const finalLayout = sheetBoardLayout(sheet, sheets.length)
  for (const pl of placements) {
    const panel = byId.get(pl.panelId)
    if (!panel) continue
    const fp = panelFootprint(panel, pl.rotationDeg)
    if (pl.y >= finalLayout.boardHeight - 1e-6) {
      maxUsed = Math.max(maxUsed, sheets.length - 1)
      continue
    }
    for (const i of sheetsOverlappedByRect(
      finalLayout,
      pl.x,
      pl.y,
      fp.w,
      fp.h,
    )) {
      maxUsed = Math.max(maxUsed, i)
    }
  }
  const minKeep =
    typeof sheetCount === 'number' ? sheetCount : 1
  const keep = Math.max(minKeep, maxUsed + 1)
  if (keep < sheets.length) {
    sheets = createSheets(keep, sheet)
  }

  return { sheets, placements }
}

/** Convenience: optimized nest with auto sheet count and scarfed length if needed. */
export function autoLayoutPanels(
  panels: Panel[],
  sheet: NestSheet = DEFAULT_SHEET,
  gap = 0.05,
): NestResult {
  if (panels.length === 0) {
    return { sheets: createSheets(1, sheet), placements: [] }
  }

  const longest = Math.max(
    ...panels.map((p) => Math.max(p.width, p.height)),
    0,
  )
  const short = Math.min(sheet.width, sheet.height)
  const long = Math.max(sheet.width, sheet.height)
  const maxSheets = 12

  // Prefer stock size (parts may span sheets), then orientation swap, then scarf.
  const candidates: NestSheet[] = [
    sheet,
    { width: sheet.height, height: sheet.width },
  ]
  if (!panelsFitBoard(panels, sheet, gap, maxSheets)) {
    candidates.push(
      { width: short, height: Math.max(long, longest + gap * 2) },
      { width: Math.max(long, longest + gap * 2), height: short },
    )
  }

  let best: NestResult | null = null
  let bestScore = Infinity

  for (const s of candidates) {
    if (!panelsFitBoard(panels, s, gap, maxSheets)) continue

    const result = nestPanels(panels, 'auto', s, gap, {
      allowFlip: true,
      maxSheets,
    })
    const stats = computeNestStats(panels, result, gap)
    if (stats.panelsOverflow > 0) continue
    const sizePenalty =
      Math.abs(s.width - sheet.width) + Math.abs(s.height - sheet.height)
    const score =
      stats.sheetsUsed * 1e6 +
      s.width * s.height * stats.sheetsUsed * 0.001 +
      sizePenalty * 10 -
      stats.utilization * 100
    if (score < bestScore) {
      bestScore = score
      best = result
    }
  }

  if (best) return best

  // Fallback: force scarfed sheet tall enough for every panel on one board strip
  const forced: NestSheet = {
    width: short,
    height: Math.max(long, longest + gap * 2),
  }
  return nestPanels(panels, 'auto', forced, gap, {
    allowFlip: true,
    maxSheets,
  })
}

function panelsFitBoard(
  panels: Panel[],
  sheet: NestSheet,
  gap: number,
  maxSheets: number,
): boolean {
  const layout = sheetBoardLayout(sheet, maxSheets)
  const maxW = layout.boardWidth - gap * 2
  const maxH = layout.boardHeight - gap * 2
  return panels.every((p) => {
    const a = panelFootprint(p, 0)
    const b = panelFootprint(p, 90)
    return (
      (a.w <= maxW + 1e-9 && a.h <= maxH + 1e-9) ||
      (b.w <= maxW + 1e-9 && b.h <= maxH + 1e-9)
    )
  })
}

export function computeNestStats(
  panels: Panel[],
  nest: NestResult,
  gap = 0.05,
): NestStats {
  const byId = new Map(panels.map((p) => [p.id, p]))
  let totalPanelArea = 0
  let panelsOverflow = 0
  const usedSheets = new Set<number>()

  if (nest.sheets.length === 0) {
    return {
      sheetsUsed: 0,
      panelsPlaced: 0,
      panelsOverflow: nest.placements.length,
      utilization: 0,
      totalPanelArea: 0,
      usedSheetArea: 0,
    }
  }

  const layout = sheetBoardLayout(nest.sheets[0], nest.sheets.length)

  for (const pl of nest.placements) {
    const panel = byId.get(pl.panelId)
    if (!panel) continue
    const fp = panelFootprint(panel, pl.rotationDeg)
    totalPanelArea += fp.w * fp.h
    const onBoard =
      pl.x >= -1e-6 &&
      pl.y >= -1e-6 &&
      pl.x + fp.w <= layout.boardWidth + 1e-6 &&
      pl.y + fp.h <= layout.boardHeight + 1e-6
    if (!onBoard) {
      panelsOverflow++
      continue
    }
    for (const i of sheetsOverlappedByRect(layout, pl.x, pl.y, fp.w, fp.h)) {
      usedSheets.add(i)
    }
  }
  const sheetsUsed = usedSheets.size
  const sheetArea = nest.sheets[0].width * nest.sheets[0].height
  const usedSheetArea = sheetsUsed * sheetArea
  void gap
  return {
    sheetsUsed,
    panelsPlaced: nest.placements.length - panelsOverflow,
    panelsOverflow,
    utilization: usedSheetArea > 0 ? totalPanelArea / usedSheetArea : 0,
    totalPanelArea,
    usedSheetArea,
  }
}

function estimateMinSheets(
  panels: Panel[],
  sheet: NestSheet,
  gap: number,
): number {
  const usable = Math.max(
    1e-6,
    (sheet.width - gap * 2) * (sheet.height - gap * 2),
  )
  const area = panels.reduce((s, p) => s + p.width * p.height, 0)
  // 65% fill heuristic + 1
  return Math.max(1, Math.ceil(area / (usable * 0.65)))
}

function findBestPlacement(
  panel: Panel,
  free: FreeRect[],
  allowFlip: boolean,
): Candidate | null {
  let best: Candidate | null = null
  const rots = rotationsFor(allowFlip)

  for (let fi = 0; fi < free.length; fi++) {
    const fr = free[fi]
    for (const rot of rots) {
      const fp = panelFootprint(panel, rot)
      const w = fp.w
      const h = fp.h
      if (w <= fr.w + 1e-9 && h <= fr.h + 1e-9) {
        const leftoverW = fr.w - w
        const leftoverH = fr.h - h
        const shortSide = Math.min(leftoverW, leftoverH)
        const longSide = Math.max(leftoverW, leftoverH)
        // BSSF primary, bottom-left tie-break
        const score = shortSide * 1000 + longSide + fr.y * 0.01 + fr.x * 0.001
        if (!best || score < best.score) {
          best = {
            x: fr.x,
            y: fr.y,
            rotationDeg: rot,
            // Mirror is independent of rotation; packer uses rotation only.
            flipped: false,
            w,
            h,
            score,
            freeIndex: fi,
          }
        }
      }
    }
  }
  return best
}

/**
 * Split free rectangles after placing a panel (MaxRects split rule).
 */
function placeInFreeList(
  freeList: FreeRect[],
  cand: Candidate,
  gap: number,
): void {
  const placed = {
    x: cand.x,
    y: cand.y,
    w: cand.w + gap,
    h: cand.h + gap,
  }

  const next: FreeRect[] = []
  for (const fr of freeList) {
    if (!rectsOverlap(fr, placed)) {
      next.push(fr)
      continue
    }
    // Left
    if (placed.x > fr.x + 1e-9) {
      next.push({
        x: fr.x,
        y: fr.y,
        w: placed.x - fr.x,
        h: fr.h,
      })
    }
    // Right
    const right = placed.x + placed.w
    if (right < fr.x + fr.w - 1e-9) {
      next.push({
        x: right,
        y: fr.y,
        w: fr.x + fr.w - right,
        h: fr.h,
      })
    }
    // Bottom
    if (placed.y > fr.y + 1e-9) {
      next.push({
        x: fr.x,
        y: fr.y,
        w: fr.w,
        h: placed.y - fr.y,
      })
    }
    // Top
    const top = placed.y + placed.h
    if (top < fr.y + fr.h - 1e-9) {
      next.push({
        x: fr.x,
        y: top,
        w: fr.w,
        h: fr.y + fr.h - top,
      })
    }
  }

  freeList.length = 0
  freeList.push(...pruneFreeList(next))
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return !(
    a.x + a.w <= b.x + 1e-9 ||
    b.x + b.w <= a.x + 1e-9 ||
    a.y + a.h <= b.y + 1e-9 ||
    b.y + b.h <= a.y + 1e-9
  )
}

function pruneFreeList(rects: FreeRect[]): FreeRect[] {
  const out: FreeRect[] = []
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i]
    if (a.w < 1e-6 || a.h < 1e-6) continue
    let contained = false
    for (let j = 0; j < rects.length; j++) {
      if (i === j) continue
      const b = rects[j]
      if (
        a.x >= b.x - 1e-9 &&
        a.y >= b.y - 1e-9 &&
        a.x + a.w <= b.x + b.w + 1e-9 &&
        a.y + a.h <= b.y + b.h + 1e-9
      ) {
        contained = true
        break
      }
    }
    if (!contained) out.push(a)
  }
  return out
}

/**
 * Map panel outline into board coordinates.
 * Placement (x, y) is the bottom-left of the axis-aligned footprint after
 * flip + rotation, matching `panelFootprint` used by the packer.
 */
export function transformedOutline(
  panel: Panel,
  placement: NestedPlacement,
): { x: number; y: number }[] {
  const rad = (placement.rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const local = panel.outline.map((p) => {
    const u = p.u
    const v = placement.flipped ? panel.height - p.v : p.v
    return {
      x: u * cos - v * sin,
      y: u * sin + v * cos,
    }
  })
  let minX = Infinity
  let minY = Infinity
  for (const p of local) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
  }
  if (!Number.isFinite(minX)) {
    minX = 0
    minY = 0
  }
  return local.map((p) => ({
    x: placement.x + (p.x - minX),
    y: placement.y + (p.y - minY),
  }))
}

/** Axis-aligned bounds of a placed panel on the board. */
export function placementBounds(
  panel: Panel,
  placement: NestedPlacement,
): { x: number; y: number; w: number; h: number } {
  const pts = transformedOutline(panel, placement)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  if (!Number.isFinite(minX)) {
    return { x: placement.x, y: placement.y, w: 0, h: 0 }
  }
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  }
}

/** Carlson-style hand-plot coordinate table (sheet-local per overlapped sheet). */
export function plotPointTable(panels: Panel[], nest: NestResult): string {
  const byId = new Map(panels.map((p) => [p.id, p]))
  const lines: string[] = ['Hull Designer — Nesting plot points', '']
  if (nest.sheets.length === 0) return lines.join('\n')

  const layout = sheetBoardLayout(nest.sheets[0], nest.sheets.length)

  for (let s = 0; s < nest.sheets.length; s++) {
    const sheet = nest.sheets[s]
    const origin = layout.origins[s]
    lines.push(
      `Sheet ${s + 1} (${sheet.width.toFixed(3)} × ${sheet.height.toFixed(3)})`,
    )
    for (const pl of nest.placements) {
      const panel = byId.get(pl.panelId)
      if (!panel) continue
      const fp = panelFootprint(panel, pl.rotationDeg)
      const hit = sheetsOverlappedByRect(layout, pl.x, pl.y, fp.w, fp.h)
      if (!hit.includes(s)) continue
      lines.push(`  ${panel.name}`)
      const pts = transformedOutline(panel, pl)
      pts.forEach((pt, i) => {
        lines.push(
          `    ${i + 1}: X=${(pt.x - origin.x).toFixed(4)}  Y=${(pt.y - origin.y).toFixed(4)}`,
        )
      })
    }
    lines.push('')
  }
  return lines.join('\n')
}
