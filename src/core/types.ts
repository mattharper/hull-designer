/** Naval coords: x longitudinal (stern→bow), y half-breadth, z height from baseline. */

export const MAX_FRAMES = 8
export const MAX_CHINES = 10

export type Units = 'ft' | 'm'

export interface Vec2 {
  y: number
  z: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Frame {
  id: string
  /** Station position along LOA (0 = stern, loa = bow). */
  x: number
  /**
   * When true, also cut a bulkhead pattern at this shape station.
   * Prefer `derivedBulkheads` for construction bulkheads that do not define shape.
   */
  bulkhead: boolean
}

export interface Chine {
  id: string
  name: string
  /** Per-frame offsets; length must match frames. */
  offsets: Vec2[]
}

/**
 * Construction bulkhead that does not define hull shape.
 * Outline is interpolated from the frame×chine grid at `x`.
 */
export interface DerivedBulkhead {
  id: string
  name: string
  /** Longitudinal position (same axis as frame.x). */
  x: number
}

export interface CenterOfGravity {
  x: number
  y: number
  z: number
}

export interface Hull {
  version: 1
  name: string
  units: Units
  /** Length overall. */
  loa: number
  /** Water density (slug/ft³ or kg/m³ depending on units). */
  waterDensity: number
  designDraft: number
  cg: CenterOfGravity
  frames: Frame[]
  chines: Chine[]
  /**
   * When true, deck closes the top (SUP / windsurfer / sealed hull).
   * Deck centerline heights are in `deckHeights` (one Z per frame, y=0).
   */
  closedTop: boolean
  /** Deck centerline Z at each frame; length matches frames when closedTop. */
  deckHeights: number[]
  /**
   * Fore–aft bend of each chine through the stations: 0 = straight between
   * frames, 1 = fully faired cubic.
   */
  longitudinalFairing: number
  /**
   * Transverse bend of each section through the chines: 0 = hard chines
   * (flat plates between chines), 1 = fully faired round section.
   */
  transverseFairing: number
  /**
   * @deprecated Prefer `longitudinalFairing`. Kept for older JSON loads.
   */
  sectionFairing?: number
  /** Bulkheads cut from the faired hull; do not add shape control points. */
  derivedBulkheads: DerivedBulkhead[]
}

export interface MeshTriangle {
  a: Vec3
  b: Vec3
  c: Vec3
}

export interface HullMesh {
  /** Half-hull triangles (port, y≥0). */
  halfTriangles: MeshTriangle[]
  /** Full hull triangles (mirrored). */
  triangles: MeshTriangle[]
  /** Wireframe edges for display. */
  edges: [Vec3, Vec3][]
  /** Frame polylines (half-breadth). */
  framePolylines: Vec3[][]
  /** Chine polylines (half-breadth). */
  chinePolylines: Vec3[][]
}

export interface HydrostaticsResult {
  draft: number
  heelDeg: number
  trimDeg: number
  displacementVolume: number
  displacementWeight: number
  lwl: number
  bwl: number
  lcb: number
  tcb: number
  vcb: number
  wettedArea: number
  waterplaneArea: number
  claArea: number
  claX: number
  claZ: number
  /** Righting lever (GZ) about longitudinal axis at heel. */
  gz: number
  /** Righting moment = displacementWeight * gz. */
  rightingMoment: number
  immersed: boolean
}

export interface PanelPoint2 {
  u: number
  v: number
  /** Optional lofting mark (frame index). */
  frameIndex?: number
}

export type PanelKind = 'strake' | 'bulkhead' | 'stem' | 'stern' | 'deck'

export interface Panel {
  id: string
  name: string
  kind: PanelKind
  /** Closed outline in developed plane. */
  outline: PanelPoint2[]
  /** Interior loft marks. */
  marks: PanelPoint2[]
  /** Bounding box in developed coords. */
  width: number
  height: number
}

export interface NestSheet {
  width: number
  height: number
}

export interface NestedPlacement {
  panelId: string
  /** Primary sheet (contains placement centroid); parts may span adjacent sheets. */
  sheetIndex: number
  /** Bottom-left of rotated AABB in continuous board coordinates. */
  x: number
  y: number
  rotationDeg: number
  flipped: boolean
}

export interface NestResult {
  sheets: NestSheet[]
  placements: NestedPlacement[]
}

export type AppMode = 'model' | 'hydro' | 'patterns'
