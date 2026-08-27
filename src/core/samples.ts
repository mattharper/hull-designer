import type { Hull } from './types'

function id(prefix: string, i: number): string {
  return `${prefix}-${i}`
}

function openHull(
  partial: Omit<
    Hull,
    | 'closedTop'
    | 'deckHeights'
    | 'longitudinalFairing'
    | 'transverseFairing'
    | 'derivedBulkheads'
  >,
  longitudinalFairing = 1,
  transverseFairing = 0,
): Hull {
  return {
    ...partial,
    closedTop: false,
    deckHeights: [],
    longitudinalFairing,
    transverseFairing,
    derivedBulkheads: [],
  }
}

/** Simple flat-bottom skiff, ~16 ft LOA. */
export function createSkiff(): Hull {
  const loa = 16
  const xs = [0, 4, 8, 12, 16]
  const frames = xs.map((x, i) => ({
    id: id('f', i),
    x,
    bulkhead: false,
  }))

  const keel = [
    { y: 0, z: 0.4 },
    { y: 0, z: 0.15 },
    { y: 0, z: 0 },
    { y: 0, z: 0.1 },
    { y: 0, z: 0.35 },
  ]
  const chine = [
    { y: 1.2, z: 0.5 },
    { y: 2.0, z: 0.25 },
    { y: 2.4, z: 0.2 },
    { y: 2.1, z: 0.3 },
    { y: 1.0, z: 0.55 },
  ]
  const sheer = [
    { y: 1.4, z: 1.8 },
    { y: 2.2, z: 1.6 },
    { y: 2.5, z: 1.5 },
    { y: 2.3, z: 1.65 },
    { y: 1.2, z: 1.9 },
  ]

  return {
    ...openHull({
      version: 1,
      name: 'Flat-bottom Skiff',
      units: 'ft',
      loa,
      waterDensity: 64,
      designDraft: 0.55,
      cg: { x: 7.5, y: 0, z: 1.2 },
      frames,
      chines: [
        { id: id('c', 0), name: 'Keel', offsets: keel },
        { id: id('c', 1), name: 'Chine', offsets: chine },
        { id: id('c', 2), name: 'Sheer', offsets: sheer },
      ],
    }),
    derivedBulkheads: [
      { id: 'dbh-0', name: 'Forward BH', x: 4 },
      { id: 'dbh-1', name: 'Aft BH', x: 12 },
    ],
  }
}

/** Multi-chine dinghy, ~12 ft. */
export function createDinghy(): Hull {
  const loa = 12
  const xs = [0, 2.5, 5, 7.5, 10, 12]
  const frames = xs.map((x, i) => ({
    id: id('f', i),
    x,
    bulkhead: false,
  }))

  const keel = [
    { y: 0, z: 0.35 },
    { y: 0, z: 0.12 },
    { y: 0, z: 0 },
    { y: 0, z: 0 },
    { y: 0, z: 0.1 },
    { y: 0, z: 0.3 },
  ]
  const bilge = [
    { y: 0.6, z: 0.4 },
    { y: 1.1, z: 0.2 },
    { y: 1.4, z: 0.15 },
    { y: 1.35, z: 0.15 },
    { y: 1.0, z: 0.25 },
    { y: 0.5, z: 0.4 },
  ]
  const chine = [
    { y: 1.1, z: 0.7 },
    { y: 1.7, z: 0.55 },
    { y: 2.0, z: 0.5 },
    { y: 1.95, z: 0.5 },
    { y: 1.6, z: 0.6 },
    { y: 0.9, z: 0.75 },
  ]
  const sheer = [
    { y: 1.3, z: 1.55 },
    { y: 1.9, z: 1.4 },
    { y: 2.15, z: 1.35 },
    { y: 2.1, z: 1.35 },
    { y: 1.75, z: 1.45 },
    { y: 1.1, z: 1.6 },
  ]

  return {
    ...openHull({
      version: 1,
      name: 'Multi-chine Dinghy',
      units: 'ft',
      loa,
      waterDensity: 64,
      designDraft: 0.45,
      cg: { x: 5.5, y: 0, z: 1.0 },
      frames,
      chines: [
        { id: id('c', 0), name: 'Keel', offsets: keel },
        { id: id('c', 1), name: 'Bilge', offsets: bilge },
        { id: id('c', 2), name: 'Chine', offsets: chine },
        { id: id('c', 3), name: 'Sheer', offsets: sheer },
      ],
    }),
    derivedBulkheads: [
      { id: 'dbh-0', name: 'Mid BH', x: 5 },
      { id: 'dbh-1', name: 'Forward BH', x: 10 },
    ],
  }
}

/** Closed-top SUP-style board, ~10 ft. */
export function createSupBoard(): Hull {
  const loa = 10
  const xs = [0, 2, 4, 6, 8, 10]
  const frames = xs.map((x, i) => ({
    id: id('f', i),
    x,
    bulkhead: false,
  }))

  const keel = [
    { y: 0, z: 0.12 },
    { y: 0, z: 0.04 },
    { y: 0, z: 0 },
    { y: 0, z: 0 },
    { y: 0, z: 0.03 },
    { y: 0, z: 0.1 },
  ]
  const rail = [
    { y: 0.55, z: 0.22 },
    { y: 1.05, z: 0.18 },
    { y: 1.25, z: 0.16 },
    { y: 1.2, z: 0.16 },
    { y: 0.95, z: 0.18 },
    { y: 0.45, z: 0.22 },
  ]
  const sheer = [
    { y: 0.6, z: 0.38 },
    { y: 1.1, z: 0.42 },
    { y: 1.3, z: 0.45 },
    { y: 1.25, z: 0.45 },
    { y: 1.0, z: 0.42 },
    { y: 0.5, z: 0.38 },
  ]

  const hull: Hull = {
    version: 1,
    name: 'SUP Board',
    units: 'ft',
    loa,
    waterDensity: 64,
    designDraft: 0.2,
    cg: { x: 4.8, y: 0, z: 0.28 },
    frames,
    chines: [
      { id: id('c', 0), name: 'Keel', offsets: keel },
      { id: id('c', 1), name: 'Rail', offsets: rail },
      { id: id('c', 2), name: 'Sheer', offsets: sheer },
    ],
    closedTop: true,
    deckHeights: sheer.map((s) => Math.round((s.z + 0.08) * 100) / 100),
    longitudinalFairing: 0.85,
    transverseFairing: 0,
    derivedBulkheads: [
      { id: 'dbh-0', name: 'Standing area BH', x: 4 },
      { id: 'dbh-1', name: 'Nose BH', x: 8 },
    ],
  }
  return hull
}

/**
 * Approximate reconstruction of a KT Super K2–style wing-foil board
 * from product photos + published dims (6'3" × 21" × 95 L).
 * Hard-chine stand-in for beveled rails; closed deck; volume ≈ 95 L.
 *
 * Side view: strong nose kick from ~midship, nearly flat mid→tail,
 * max thickness under front-foot / mid-forward; squash tail.
 * Low chine + outer chine approximate the bottom bevel / soft-V entry.
 */
export function createSuperK2(): Hull {
  const loa = 6.25
  const halfMax = 21 / 12 / 2 // 0.875 ft
  const s = 1.1 // thickness scale → ~95 L (4 chines + bevel)
  // 8 stations stern → bow (app max)
  const xs = [0, 0.7, 1.5, 2.4, 3.3, 4.2, 5.2, 6.25]
  // Plan half-breadth / max — squash tail, wide point slightly forward of mid, pointed nose
  const planFrac = [0.62, 0.78, 0.92, 0.99, 1.0, 0.94, 0.58, 0.07]
  // Flat bottom plate inside rail bevel (outer hard chine)
  const flatFrac = [0.78, 0.82, 0.86, 0.88, 0.88, 0.84, 0.68, 0.32]
  // Inner low chine as fraction of outer chine half-breadth (slight V / double-chine bottom)
  const lowFrac = [0.48, 0.5, 0.52, 0.55, 0.55, 0.52, 0.45, 0.35]
  // Bottom rocker (keel z): flat mid–tail, rising nose kick
  const rocker0 = [0.025, 0.008, 0, 0, 0.012, 0.045, 0.11, 0.2]
  // Local thickness (deck≈keel+thick): peak mid-forward / front foot
  const thick0 = [0.34, 0.4, 0.44, 0.47, 0.5, 0.47, 0.38, 0.26]

  const r3 = (n: number) => Math.round(n * 1000) / 1000
  const plan = planFrac.map((f) => f * halfMax)
  const rocker = rocker0.map((z) => z * s)
  const thick = thick0.map((t) => t * s)
  const outerY = plan.map((p, i) => p * flatFrac[i])
  const outerZ = rocker.map((r, i) => r + thick[i] * 0.1)
  const lowY = outerY.map((y, i) => y * lowFrac[i])
  const lowZ = rocker.map((r, i) => r + thick[i] * 0.03)
  const sheerY = plan
  const sheerZ = rocker.map((r, i) => r + thick[i] * 0.93)
  const deck = sheerZ.map((z, i) => z + thick[i] * 0.04)

  const frames = xs.map((x, i) => ({
    id: id('f', i),
    x,
    bulkhead: false,
  }))

  return {
    version: 1,
    name: "KT Super K2 6'3 95L",
    units: 'ft',
    loa,
    waterDensity: 64,
    designDraft: 0.18,
    cg: { x: 2.6, y: 0, z: 0.3 },
    frames,
    chines: [
      {
        id: id('c', 0),
        name: 'Keel',
        offsets: rocker.map((z) => ({ y: 0, z: r3(z) })),
      },
      {
        id: id('c', 1),
        name: 'Low chine',
        offsets: lowY.map((y, i) => ({ y: r3(y), z: r3(lowZ[i]) })),
      },
      {
        id: id('c', 2),
        name: 'Chine',
        offsets: outerY.map((y, i) => ({ y: r3(y), z: r3(outerZ[i]) })),
      },
      {
        id: id('c', 3),
        name: 'Sheer',
        offsets: sheerY.map((y, i) => ({ y: r3(y), z: r3(sheerZ[i]) })),
      },
    ],
    closedTop: true,
    deckHeights: deck.map(r3),
    longitudinalFairing: 0.92,
    transverseFairing: 0,
    derivedBulkheads: [
      { id: 'dbh-0', name: 'Mast track BH', x: 1.3 },
      { id: 'dbh-1', name: 'Stance BH', x: 3.4 },
    ],
  }
}

/** Rectangular barge for hydrostatic unit tests. */
export function createTestBarge(
  length = 10,
  beam = 4,
  depth = 2,
): Hull {
  const frames = [0, length].map((x, i) => ({
    id: id('f', i),
    x,
    bulkhead: false,
  }))
  const half = beam / 2
  return openHull(
    {
      version: 1,
      name: 'Test Barge',
      units: 'ft',
      loa: length,
      waterDensity: 64,
      designDraft: depth / 2,
      cg: { x: length / 2, y: 0, z: depth / 2 },
      frames,
      chines: [
        {
          id: id('c', 0),
          name: 'Keel',
          offsets: [
            { y: 0, z: 0 },
            { y: 0, z: 0 },
          ],
        },
        {
          id: id('c', 1),
          name: 'Chine',
          offsets: [
            { y: half, z: 0 },
            { y: half, z: 0 },
          ],
        },
        {
          id: id('c', 2),
          name: 'Sheer',
          offsets: [
            { y: half, z: depth },
            { y: half, z: depth },
          ],
        },
      ],
    },
    0,
  )
}

export const SAMPLE_HULLS: Record<string, () => Hull> = {
  skiff: createSkiff,
  dinghy: createDinghy,
  sup: createSupBoard,
  k2: createSuperK2,
}
