import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Grid, Line } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Hull, HullMesh, Vec3 } from '../core/types'
import { buildHullMesh } from '../core/geometry/buildMesh'
import { deckCenterline } from '../core/geometry/deck'
import { computeWaterline } from '../core/hydro/hydrostatics'

/** Naval (x,y,z) → Three.js (x, height, breadth) */
function toThree(p: Vec3): [number, number, number] {
  return [p.x, p.z, p.y]
}

/**
 * Lowest world Y of the hull after heel/trim (same transform as the viewer).
 * Used to keep the ground grid under the boat so it doesn't slice through.
 */
function hullMinWorldY(
  hull: Hull,
  waterZ: number | undefined,
  heelDeg: number,
  trimDeg: number,
): number {
  const heelRad = (heelDeg * Math.PI) / 180
  const trimRad = (trimDeg * Math.PI) / 180
  if (Math.abs(heelRad) < 1e-8 && Math.abs(trimRad) < 1e-8) return 0

  const draft = waterZ ?? 0
  const px = hull.loa / 2
  const py = draft
  const cosH = Math.cos(-heelRad)
  const sinH = Math.sin(-heelRad)
  const cosT = Math.cos(-trimRad)
  const sinT = Math.sin(-trimRad)

  let minY = Infinity
  const consider = (naval: Vec3) => {
    const x = naval.x - px
    const y = naval.z - py
    const z = naval.y
    // R_x(-heel) then R_z(-trim), matching nested viewer groups
    const y1 = y * cosH - z * sinH
    const y2 = x * sinT + y1 * cosT
    const worldY = y2 + py
    if (worldY < minY) minY = worldY
  }

  for (let fi = 0; fi < hull.frames.length; fi++) {
    const x = hull.frames[fi].x
    for (const chine of hull.chines) {
      const o = chine.offsets[fi]
      if (o) consider({ x, y: o.y, z: o.z })
    }
  }
  if (hull.closedTop) {
    for (const p of deckCenterline(hull)) consider(p)
  }

  return Number.isFinite(minY) ? minY : 0
}

function fromThree(x: number, y: number, z: number): Vec3 {
  return { x, y: z, z: y }
}

function meshGeometry(mesh: HullMesh): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const positions: number[] = []
  for (const t of mesh.triangles) {
    for (const p of [t.a, t.b, t.c]) {
      const [x, y, z] = toThree(p)
      positions.push(x, y, z)
    }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  return geo
}

function OffsetHandle({
  position,
  active,
  stationX,
  onSelect,
  onDrag,
  onDragEnd,
}: {
  position: [number, number, number]
  active: boolean
  stationX: number
  onSelect: () => void
  onDrag: (naval: Vec3) => void
  onDragEnd: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const dragging = useRef(false)
  const { camera, gl } = useThree()
  const plane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(1, 0, 0), -stationX),
    [stationX],
  )
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const pointer = useMemo(() => new THREE.Vector2(), [])
  const hit = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const el = gl.domElement

    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      const rect = el.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      if (raycaster.ray.intersectPlane(plane, hit)) {
        const naval = fromThree(hit.x, hit.y, hit.z)
        onDrag({
          x: stationX,
          y: Math.max(0, naval.y),
          z: Math.max(0, naval.z),
        })
      }
    }

    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      onDragEnd()
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointerleave', onUp)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', onUp)
    }
  }, [camera, gl, plane, pointer, raycaster, hit, onDrag, onDragEnd, stationX])

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    dragging.current = true
    onSelect()
  }

  return (
    <mesh
      position={position}
      onPointerDown={onPointerDown}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <sphereGeometry args={[active || hovered ? 0.12 : 0.09, 16, 16]} />
      <meshStandardMaterial
        color={active ? '#e85d04' : hovered ? '#f4a261' : '#2f5d50'}
        emissive={active ? '#5c2a00' : '#000000'}
      />
    </mesh>
  )
}

function FramePick({
  points,
  index,
  active,
  onSelect,
}: {
  points: [number, number, number][]
  index: number
  active: boolean
  onSelect: (i: number) => void
}) {
  return (
    <Line
      points={points}
      color={active ? '#e85d04' : '#3d5a80'}
      lineWidth={active ? 2.5 : 1}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(index)
      }}
    />
  )
}

function HullMeshView({
  hull,
  highlightFrame,
  selectedChine,
  waterZ,
  heelDeg = 0,
  trimDeg = 0,
  editable,
  onSelectFrame,
  onSelectChine,
  onOffsetChange,
  onDraggingChange,
  onDeckHeightChange,
  onSelectDeck,
}: {
  hull: Hull
  highlightFrame: number
  selectedChine: number
  waterZ?: number
  /** Heel degrees — matches hydrostatics (hull rolls, water stays level). */
  heelDeg?: number
  /** Trim degrees — bow up positive, matches hydrostatics. */
  trimDeg?: number
  editable?: boolean
  onSelectFrame?: (i: number) => void
  onSelectChine?: (i: number) => void
  onOffsetChange?: (
    chineIndex: number,
    frameIndex: number,
    y: number,
    z: number,
  ) => void
  onDraggingChange?: (dragging: boolean) => void
  onDeckHeightChange?: (frameIndex: number, z: number) => void
  onSelectDeck?: () => void
}) {
  const mesh = useMemo(() => buildHullMesh(hull), [hull])
  const geo = useMemo(() => meshGeometry(mesh), [mesh])

  const frameLines = mesh.framePolylines.map((poly) =>
    poly.map((p) => toThree(p) as [number, number, number]),
  )
  const chineLines = mesh.chinePolylines.map((poly) =>
    poly.map((p) => toThree(p) as [number, number, number]),
  )

  const draft = waterZ ?? 0
  const heelRad = (heelDeg * Math.PI) / 180
  const trimRad = (trimDeg * Math.PI) / 180
  // Pivot matches hydrostatics: naval (loa/2, 0, draft) → Three (loa/2, draft, 0)
  const pivot: [number, number, number] = [hull.loa / 2, draft, 0]
  const attitude = Math.abs(heelDeg) > 1e-6 || Math.abs(trimDeg) > 1e-6
  const splitAtWater = waterZ !== undefined && Number.isFinite(waterZ)

  // World-space horizontal clip at the waterplane (Three Y = waterZ).
  // Kept side is where normal·p + constant >= 0.
  const abovePlanes = useMemo(() => {
    if (!splitAtWater) return []
    return [new THREE.Plane(new THREE.Vector3(0, 1, 0), -waterZ!)]
  }, [splitAtWater, waterZ])
  const belowPlanes = useMemo(() => {
    if (!splitAtWater) return []
    return [new THREE.Plane(new THREE.Vector3(0, -1, 0), waterZ!)]
  }, [splitAtWater, waterZ])

  const hullContent = (
    <group renderOrder={2}>
      {splitAtWater ? (
        <>
          <mesh geometry={geo} renderOrder={2}>
            <meshStandardMaterial
              color="#6b8f71"
              side={THREE.DoubleSide}
              depthWrite
              metalness={0.1}
              roughness={0.65}
              clippingPlanes={abovePlanes}
              clipShadows
            />
          </mesh>
          <mesh geometry={geo} renderOrder={2}>
            <meshStandardMaterial
              color="#2a6f82"
              side={THREE.DoubleSide}
              depthWrite
              metalness={0.15}
              roughness={0.55}
              clippingPlanes={belowPlanes}
              clipShadows
            />
          </mesh>
          <mesh geometry={geo} renderOrder={2}>
            <meshBasicMaterial
              color="#1a2e1c"
              wireframe
              transparent
              opacity={0.2}
              depthWrite={false}
              clippingPlanes={abovePlanes}
            />
          </mesh>
          <mesh geometry={geo} renderOrder={2}>
            <meshBasicMaterial
              color="#0d3a45"
              wireframe
              transparent
              opacity={0.2}
              depthWrite={false}
              clippingPlanes={belowPlanes}
            />
          </mesh>
        </>
      ) : (
        <>
          <mesh geometry={geo} renderOrder={2}>
            <meshStandardMaterial
              color="#6b8f71"
              side={THREE.DoubleSide}
              depthWrite
              metalness={0.1}
              roughness={0.65}
            />
          </mesh>
          <mesh geometry={geo} renderOrder={2}>
            <meshBasicMaterial
              color="#1a2e1c"
              wireframe
              transparent
              opacity={0.25}
              depthWrite={false}
            />
          </mesh>
        </>
      )}
      {chineLines.map((pts, i) => (
        <Line key={`c-${i}`} points={pts} color="#c4a35a" lineWidth={1.5} />
      ))}
      {frameLines.map((pts, i) => (
        <FramePick
          key={`f-${i}`}
          points={pts}
          index={i}
          active={i === highlightFrame}
          onSelect={(idx) => onSelectFrame?.(idx)}
        />
      ))}

      {editable &&
        hull.chines.map((chine, ci) => {
          const o = chine.offsets[highlightFrame]
          if (!o) return null
          const frame = hull.frames[highlightFrame]
          const pos = toThree({ x: frame.x, y: o.y, z: o.z })
          return (
            <OffsetHandle
              key={`${chine.id}-${frame.id}`}
              position={pos}
              stationX={frame.x}
              active={ci === selectedChine}
              onSelect={() => {
                onSelectFrame?.(highlightFrame)
                onSelectChine?.(ci)
                onDraggingChange?.(true)
              }}
              onDrag={(naval) => {
                onOffsetChange?.(ci, highlightFrame, naval.y, naval.z)
              }}
              onDragEnd={() => onDraggingChange?.(false)}
            />
          )
        })}

      {editable &&
        hull.closedTop &&
        (() => {
          const deck = deckCenterline(hull)[highlightFrame]
          if (!deck) return null
          const frame = hull.frames[highlightFrame]
          return (
            <OffsetHandle
              key={`deck-${frame.id}`}
              position={toThree(deck)}
              stationX={frame.x}
              active
              onSelect={() => {
                onSelectFrame?.(highlightFrame)
                onSelectDeck?.()
                onDraggingChange?.(true)
              }}
              onDrag={(naval) => {
                onDeckHeightChange?.(highlightFrame, naval.z)
              }}
              onDragEnd={() => onDraggingChange?.(false)}
            />
          )
        })()}
    </group>
  )

  return (
    <group>
      {attitude ? (
        <group position={pivot}>
          {/* Hydro: heel about X then trim about Y → Three heel -X, trim -Z */}
          <group rotation={[0, 0, -trimRad]}>
            <group rotation={[-heelRad, 0, 0]}>
              <group position={[-pivot[0], -pivot[1], -pivot[2]]}>
                {hullContent}
              </group>
            </group>
          </group>
        </group>
      ) : (
        hullContent
      )}
    </group>
  )
}

function WaterPlane({
  loa,
  waterZ,
}: {
  loa: number
  waterZ: number
}) {
  // Drawn before the hull (lower renderOrder, no depth write) so the boat
  // paints on top and above/below the waterline stays readable.
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[loa / 2, waterZ, 0]}
      renderOrder={1}
    >
      <planeGeometry args={[Math.max(loa * 2.2, 12), Math.max(loa * 1.4, 8)]} />
      <meshBasicMaterial
        color="#3d8aa0"
        transparent
        opacity={0.4}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/** Hull∩waterplane curves in the attitude frame (level water, heeled hull). */
function WaterlineOverlay({
  hull,
  waterZ,
  heelDeg,
  trimDeg,
}: {
  hull: Hull
  waterZ: number
  heelDeg: number
  trimDeg: number
}) {
  const lines = useMemo(
    () =>
      computeWaterline(hull, {
        draft: waterZ,
        heelDeg,
        trimDeg,
      }),
    [hull, waterZ, heelDeg, trimDeg],
  )

  if (lines.length === 0) return null

  return (
    <group renderOrder={3}>
      {lines.map((poly, i) => {
        const pts = poly.map((p) => toThree(p) as [number, number, number])
        if (pts.length < 2) return null
        return (
          <Line
            key={`wl-${i}`}
            points={pts}
            color="#e85d04"
            lineWidth={3}
            depthTest={false}
            renderOrder={3}
          />
        )
      })}
    </group>
  )
}

/** CB in the same attitude frame as waterline / hydrostatics results. */
function CenterOfBuoyancyMarker({
  point,
  loa,
}: {
  point: Vec3
  loa: number
}) {
  const r = Math.max(0.06, loa * 0.012)
  return (
    <mesh position={toThree(point)} renderOrder={4}>
      <sphereGeometry args={[r, 20, 20]} />
      <meshStandardMaterial
        color="#1d4ed8"
        emissive="#1e3a8a"
        emissiveIntensity={0.35}
        metalness={0.2}
        roughness={0.4}
        depthTest={false}
      />
    </mesh>
  )
}

export function HullViewer({
  hull,
  highlightFrame,
  selectedChine = 0,
  showWater,
  showWaterPlane = false,
  waterZ,
  heelDeg = 0,
  trimDeg = 0,
  centerOfBuoyancy,
  editable,
  onSelectFrame,
  onSelectChine,
  onOffsetChange,
  onDeckHeightChange,
  onSelectDeck,
}: {
  hull: Hull
  highlightFrame: number
  selectedChine?: number
  /** When true with waterZ, color hull above/below waterline and draw waterline. */
  showWater?: boolean
  /** Translucent waterplane mesh; defaults off. */
  showWaterPlane?: boolean
  waterZ?: number
  heelDeg?: number
  trimDeg?: number
  /** CB in hydro attitude frame (LCB, TCB, VCB). */
  centerOfBuoyancy?: Vec3 | null
  editable?: boolean
  onSelectFrame?: (i: number) => void
  onSelectChine?: (i: number) => void
  onOffsetChange?: (
    chineIndex: number,
    frameIndex: number,
    y: number,
    z: number,
  ) => void
  onDeckHeightChange?: (frameIndex: number, z: number) => void
  onSelectDeck?: () => void
}) {
  const [orbitEnabled, setOrbitEnabled] = useState(true)
  const hasDraft =
    Boolean(showWater) && waterZ !== undefined && Number.isFinite(waterZ)
  const drawPlane = hasDraft && showWaterPlane
  const showCb =
    hasDraft &&
    centerOfBuoyancy != null &&
    Number.isFinite(centerOfBuoyancy.x) &&
    Number.isFinite(centerOfBuoyancy.y) &&
    Number.isFinite(centerOfBuoyancy.z)
  // Keep the ground grid under the heeled/trimmed hull so the plane does not
  // cut through the open shell (which reads as the grid "showing through").
  const gridY = useMemo(() => {
    const heel = heelDeg ?? 0
    const trim = trimDeg ?? 0
    if (Math.abs(heel) < 1e-6 && Math.abs(trim) < 1e-6) return 0
    return (
      hullMinWorldY(hull, hasDraft ? waterZ : undefined, heel, trim) - 0.02
    )
  }, [hull, hasDraft, waterZ, heelDeg, trimDeg])

  return (
    <Canvas
      camera={{
        position: [hull.loa * 0.6, hull.loa * 0.45, hull.loa * 0.7],
        fov: 40,
      }}
      gl={{ localClippingEnabled: true }}
      style={{ width: '100%', height: '100%', background: '#e8e4dc' }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[10, 20, 10]} intensity={0.9} />
      <directionalLight position={[-8, 6, -4]} intensity={0.35} />
      <Grid
        args={[40, 40]}
        cellSize={1}
        sectionSize={4}
        fadeDistance={50}
        position={[hull.loa / 2, gridY, 0]}
        cellColor="#b0a898"
        sectionColor="#8a8070"
        infiniteGrid={false}
        renderOrder={0}
      />
      {drawPlane && <WaterPlane loa={hull.loa} waterZ={waterZ!} />}
      <HullMeshView
        hull={hull}
        highlightFrame={highlightFrame}
        selectedChine={selectedChine}
        waterZ={hasDraft ? waterZ : undefined}
        heelDeg={heelDeg}
        trimDeg={trimDeg}
        editable={editable}
        onSelectFrame={onSelectFrame}
        onSelectChine={onSelectChine}
        onOffsetChange={onOffsetChange}
        onDeckHeightChange={onDeckHeightChange}
        onSelectDeck={onSelectDeck}
        onDraggingChange={(d) => setOrbitEnabled(!d)}
      />
      {hasDraft && (
        <WaterlineOverlay
          hull={hull}
          waterZ={waterZ!}
          heelDeg={heelDeg}
          trimDeg={trimDeg}
        />
      )}
      {showCb && (
        <CenterOfBuoyancyMarker point={centerOfBuoyancy!} loa={hull.loa} />
      )}
      <OrbitControls
        makeDefault
        enabled={orbitEnabled}
        target={[hull.loa / 2, Math.max(0.8, (waterZ ?? 0.8) * 0.5), 0]}
      />
    </Canvas>
  )
}
