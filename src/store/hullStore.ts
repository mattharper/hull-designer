import { create } from 'zustand'
import type {
  AppMode,
  Hull,
  NestResult,
  NestedPlacement,
  Panel,
  Units,
  Vec2,
} from '../core/types'
import { MAX_CHINES, MAX_FRAMES } from '../core/types'
import { createSkiff } from '../core/samples'
import { developAllPanels } from '../core/develop/unfold'
import { DEFAULT_SHEET, autoLayoutPanels, computeNestStats, nestPanels, requiredSheetCount } from '../core/nest/nesting'
import type { NestStats } from '../core/nest/nesting'
import { computeHydrostatics } from '../core/hydro/hydrostatics'
import type { HydrostaticsResult } from '../core/types'
import { developabilityWarnings } from '../core/geometry/buildMesh'
import { defaultDeckHeights, syncDeckHeights } from '../core/geometry/deck'

export type HydroFloatMode = 'draft' | 'displacement'

interface HydroControls {
  draft: number
  /** Target displacement weight when floatMode is 'displacement'. */
  targetDisplacement: number
  floatMode: HydroFloatMode
  heelDeg: number
  trimDeg: number
}

interface NestControls {
  sheetCount: number
  sheetWidth: number
  sheetHeight: number
  gap: number
  allowFlip: boolean
}

interface HullState {
  hull: Hull
  mode: AppMode
  selectedFrame: number
  selectedChine: number
  /** When true, body/profile deck handle is the selection focus. */
  selectedDeck: boolean
  selectedDerivedBulkheadId: string | null
  hydro: HydroControls
  nest: NestControls
  nestOverrides: NestedPlacement[]

  setMode: (mode: AppMode) => void
  setHull: (hull: Hull) => void
  setName: (name: string) => void
  setUnits: (units: Units) => void
  setSelectedFrame: (i: number) => void
  setSelectedChine: (i: number) => void
  setSelectedDeck: (v: boolean) => void
  setOffset: (chineIndex: number, frameIndex: number, offset: Partial<Vec2>) => void
  setChineName: (chineIndex: number, name: string) => void
  setFrameX: (frameIndex: number, x: number) => void
  setFrameBulkhead: (frameIndex: number, bulkhead: boolean) => void
  setLongitudinalFairing: (fairing: number) => void
  setTransverseFairing: (fairing: number) => void
  setClosedTop: (closed: boolean) => void
  setDeckHeight: (frameIndex: number, z: number) => void
  addDerivedBulkhead: () => void
  removeDerivedBulkhead: (id: string) => void
  setDerivedBulkheadX: (id: string, x: number) => void
  setDerivedBulkheadName: (id: string, name: string) => void
  setSelectedDerivedBulkheadId: (id: string | null) => void
  addFrame: () => void
  removeFrame: (index: number) => void
  addChine: () => void
  removeChine: (index: number) => void
  setDesignDraft: (draft: number) => void
  setCg: (axis: 'x' | 'y' | 'z', value: number) => void
  setHydro: (partial: Partial<HydroControls>) => void
  setNest: (partial: Partial<NestControls>) => void
  updatePlacement: (panelId: string, partial: Partial<NestedPlacement>) => void
  clearNestOverrides: () => void
  applyAutolayout: () => NestStats

  getWarnings: () => string[]
  getHydrostatics: () => HydrostaticsResult
  getPanels: () => Panel[]
  getNestResult: () => NestResult
}

function syncHull(hull: Hull): Hull {
  return syncDeckHeights(syncChineOffsets(hull))
}

function syncChineOffsets(hull: Hull): Hull {
  const n = hull.frames.length
  return {
    ...hull,
    closedTop: hull.closedTop ?? false,
    deckHeights: hull.deckHeights ?? [],
    longitudinalFairing:
      hull.longitudinalFairing ?? hull.sectionFairing ?? 1,
    transverseFairing: hull.transverseFairing ?? 0,
    derivedBulkheads: hull.derivedBulkheads ?? [],
    chines: hull.chines.map((c) => {
      const offsets = c.offsets.slice(0, n)
      while (offsets.length < n) {
        const prev = offsets[offsets.length - 1] ?? { y: 0, z: 0 }
        offsets.push({ ...prev })
      }
      return { ...c, offsets }
    }),
  }
}

export const useHullStore = create<HullState>((set, get) => ({
  hull: createSkiff(),
  mode: 'model',
  selectedFrame: 0,
  selectedChine: 0,
  selectedDeck: false,
  selectedDerivedBulkheadId: null,
  hydro: (() => {
    const skiff = createSkiff()
    const disp = computeHydrostatics(skiff, { draft: skiff.designDraft })
      .displacementWeight
    return {
      draft: skiff.designDraft,
      targetDisplacement: Math.round(disp),
      floatMode: 'draft' as const,
      heelDeg: 0,
      trimDeg: 0,
    }
  })(),
  nest: {
    sheetCount: 3,
    sheetWidth: DEFAULT_SHEET.width,
    sheetHeight: DEFAULT_SHEET.height,
    gap: 0.05,
    allowFlip: true,
  },
  nestOverrides: [],

  setMode: (mode) => set({ mode }),
  setHull: (hull) => {
    const synced = syncHull(hull)
    const disp = computeHydrostatics(synced, { draft: synced.designDraft })
      .displacementWeight
    set({
      hull: synced,
      hydro: {
        ...get().hydro,
        draft: synced.designDraft,
        targetDisplacement: Math.round(disp),
      },
      nestOverrides: [],
      selectedFrame: 0,
      selectedChine: 0,
      selectedDeck: false,
      selectedDerivedBulkheadId: null,
    })
  },
  setName: (name) => set({ hull: { ...get().hull, name } }),
  setUnits: (units) => set({ hull: { ...get().hull, units } }),
  setSelectedFrame: (i) => set({ selectedFrame: i }),
  setSelectedChine: (i) => set({ selectedChine: i, selectedDeck: false }),
  setSelectedDeck: (v) => set({ selectedDeck: v }),
  setSelectedDerivedBulkheadId: (id) => set({ selectedDerivedBulkheadId: id }),

  setOffset: (chineIndex, frameIndex, offset) => {
    const hull = structuredClone(get().hull)
    const o = hull.chines[chineIndex].offsets[frameIndex]
    hull.chines[chineIndex].offsets[frameIndex] = { ...o, ...offset }
    set({ hull })
  },

  setChineName: (chineIndex, name) => {
    const hull = structuredClone(get().hull)
    hull.chines[chineIndex].name = name
    set({ hull })
  },

  setFrameX: (frameIndex, x) => {
    const hull = structuredClone(get().hull)
    hull.frames[frameIndex].x = x
    hull.frames.sort((a, b) => a.x - b.x)
    set({ hull: syncHull(hull) })
  },

  setFrameBulkhead: (frameIndex, bulkhead) => {
    const hull = structuredClone(get().hull)
    hull.frames[frameIndex].bulkhead = bulkhead
    set({ hull })
  },

  setLongitudinalFairing: (fairing) => {
    const hull = structuredClone(get().hull)
    hull.longitudinalFairing = Math.min(1, Math.max(0, fairing))
    delete hull.sectionFairing
    set({ hull })
  },

  setTransverseFairing: (fairing) => {
    const hull = structuredClone(get().hull)
    hull.transverseFairing = Math.min(1, Math.max(0, fairing))
    set({ hull })
  },

  setClosedTop: (closed) => {
    const hull = structuredClone(get().hull)
    hull.closedTop = closed
    if (closed) {
      hull.deckHeights = defaultDeckHeights(hull)
    }
    set({ hull: syncHull(hull), selectedDeck: closed })
  },

  setDeckHeight: (frameIndex, z) => {
    const hull = structuredClone(get().hull)
    if (!hull.closedTop) return
    const heights = [...(hull.deckHeights.length ? hull.deckHeights : defaultDeckHeights(hull))]
    heights[frameIndex] = Math.max(0, z)
    hull.deckHeights = heights
    set({ hull, selectedDeck: true })
  },

  addDerivedBulkhead: () => {
    const hull = structuredClone(get().hull)
    const x0 = hull.frames[0]?.x ?? 0
    const x1 = hull.frames[hull.frames.length - 1]?.x ?? hull.loa
    const existing = hull.derivedBulkheads ?? []
    const x = Math.round(((x0 + x1) / 2) * 100) / 100
    const bh = {
      id: `dbh-${Date.now()}`,
      name: `Bulkhead ${existing.length + 1}`,
      x,
    }
    hull.derivedBulkheads = [...existing, bh].sort((a, b) => a.x - b.x)
    set({ hull, selectedDerivedBulkheadId: bh.id })
  },

  removeDerivedBulkhead: (id) => {
    const hull = structuredClone(get().hull)
    hull.derivedBulkheads = (hull.derivedBulkheads ?? []).filter((b) => b.id !== id)
    set({
      hull,
      selectedDerivedBulkheadId:
        get().selectedDerivedBulkheadId === id
          ? null
          : get().selectedDerivedBulkheadId,
    })
  },

  setDerivedBulkheadX: (id, x) => {
    const hull = structuredClone(get().hull)
    const bh = hull.derivedBulkheads?.find((b) => b.id === id)
    if (!bh) return
    bh.x = x
    hull.derivedBulkheads = [...hull.derivedBulkheads].sort((a, b) => a.x - b.x)
    set({ hull, selectedDerivedBulkheadId: id })
  },

  setDerivedBulkheadName: (id, name) => {
    const hull = structuredClone(get().hull)
    const bh = hull.derivedBulkheads?.find((b) => b.id === id)
    if (!bh) return
    bh.name = name
    set({ hull })
  },

  addFrame: () => {
    const hull = structuredClone(get().hull)
    if (hull.frames.length >= MAX_FRAMES) return
    const last = hull.frames[hull.frames.length - 1]
    const prev = hull.frames[hull.frames.length - 2] ?? last
    const x = last.x + Math.max(0.5, last.x - prev.x)
    hull.loa = Math.max(hull.loa, x)
    hull.frames.push({
      id: `f-${Date.now()}`,
      x,
      bulkhead: false,
    })
    set({
      hull: syncHull(hull),
      selectedFrame: hull.frames.length - 1,
    })
  },

  removeFrame: (index) => {
    const hull = structuredClone(get().hull)
    if (hull.frames.length <= 2) return
    hull.frames.splice(index, 1)
    hull.chines.forEach((c) => c.offsets.splice(index, 1))
    if (hull.deckHeights.length > index) hull.deckHeights.splice(index, 1)
    set({
      hull: syncHull(hull),
      selectedFrame: Math.max(0, index - 1),
    })
  },

  addChine: () => {
    const hull = structuredClone(get().hull)
    if (hull.chines.length >= MAX_CHINES) return
    const top = hull.chines[hull.chines.length - 1]
    hull.chines.push({
      id: `c-${Date.now()}`,
      name: `Chine ${hull.chines.length}`,
      offsets: top.offsets.map((o) => ({
        y: o.y * 0.95,
        z: o.z + 0.3,
      })),
    })
    set({
      hull,
      selectedChine: hull.chines.length - 1,
    })
  },

  removeChine: (index) => {
    const hull = structuredClone(get().hull)
    if (hull.chines.length <= 2) return
    hull.chines.splice(index, 1)
    set({
      hull,
      selectedChine: Math.max(0, index - 1),
    })
  },

  setDesignDraft: (draft) =>
    set({
      hull: { ...get().hull, designDraft: draft },
      hydro: { ...get().hydro, draft },
    }),

  setCg: (axis, value) =>
    set({
      hull: {
        ...get().hull,
        cg: { ...get().hull.cg, [axis]: value },
      },
    }),

  setHydro: (partial) => set({ hydro: { ...get().hydro, ...partial } }),
  setNest: (partial) =>
    set({ nest: { ...get().nest, ...partial }, nestOverrides: [] }),

  updatePlacement: (panelId, partial) => {
    const { nest, nestOverrides } = get()
    const panels = developAllPanels(get().hull)
    let overrides = [...nestOverrides]

    // Freeze the current layout into overrides on first manual edit
    if (overrides.length < panels.length) {
      const base = nestPanels(
        panels,
        nest.sheetCount,
        { width: nest.sheetWidth, height: nest.sheetHeight },
        nest.gap,
        {
          allowFlip: nest.allowFlip,
          maxSheets: Math.max(nest.sheetCount, 12),
        },
      )
      const map = new Map(base.placements.map((p) => [p.panelId, { ...p }]))
      for (const o of overrides) {
        const prev = map.get(o.panelId)
        map.set(o.panelId, prev ? { ...prev, ...o } : { ...o })
      }
      overrides = [...map.values()]
    }

    const existing = overrides.find((p) => p.panelId === panelId)
    if (existing) Object.assign(existing, partial)
    set({ nestOverrides: overrides })
  },

  clearNestOverrides: () => set({ nestOverrides: [] }),

  applyAutolayout: () => {
    const { nest } = get()
    const panels = developAllPanels(get().hull)
    const sheet = { width: nest.sheetWidth, height: nest.sheetHeight }
    const result = autoLayoutPanels(panels, sheet, nest.gap)
    const stats = computeNestStats(panels, result, nest.gap)
    const sheetsNeeded = Math.max(1, stats.sheetsUsed || result.sheets.length)
    const usedSheet = result.sheets[0] ?? sheet
    set({
      nest: {
        ...nest,
        sheetCount: sheetsNeeded,
        sheetWidth: usedSheet.width,
        sheetHeight: usedSheet.height,
        allowFlip: true,
      },
      nestOverrides: result.placements,
    })
    return stats
  },

  getWarnings: () => developabilityWarnings(get().hull),

  getHydrostatics: () => {
    const { hull, hydro } = get()
    return computeHydrostatics(hull, hydro)
  },

  getPanels: () => developAllPanels(get().hull),

  getNestResult: () => {
    const { nest, nestOverrides } = get()
    const panels = developAllPanels(get().hull)
    const base = nestPanels(
      panels,
      nest.sheetCount,
      { width: nest.sheetWidth, height: nest.sheetHeight },
      nest.gap,
      { allowFlip: nest.allowFlip, maxSheets: Math.max(nest.sheetCount, 12) },
    )
    // If overrides cover all panels (e.g. from autolayout), use those sheets
    if (nestOverrides.length >= panels.length) {
      const probeCount = Math.max(
        nest.sheetCount,
        ...nestOverrides.map((p) => p.sheetIndex + 1),
      )
      const sheetCount = Math.max(
        nest.sheetCount,
        requiredSheetCount(panels, {
          sheets: Array.from({ length: probeCount }, () => ({
            width: nest.sheetWidth,
            height: nest.sheetHeight,
          })),
          placements: nestOverrides,
        }),
      )
      return {
        sheets: Array.from({ length: sheetCount }, () => ({
          width: nest.sheetWidth,
          height: nest.sheetHeight,
        })),
        placements: nestOverrides,
      }
    }
    if (nestOverrides.length === 0) return base
    const map = new Map(base.placements.map((p) => [p.panelId, p]))
    for (const o of nestOverrides) {
      const prev = map.get(o.panelId)
      if (prev) map.set(o.panelId, { ...prev, ...o })
      else map.set(o.panelId, o)
    }
    return { sheets: base.sheets, placements: [...map.values()] }
  },
}))
