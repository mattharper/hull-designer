import { useCallback, useMemo, useRef, useState } from 'react'
import type { Hull } from '../core/types'
import {
  fairLongitudinalCurve,
  halfHullPoints,
  longitudinalFairing,
} from '../core/geometry/points'
import { deckCenterline } from '../core/geometry/deck'

interface Props {
  hull: Hull
  selectedFrame: number
  selectedChine: number
  selectedDeck: boolean
  selectedDerivedBulkheadId: string | null
  onSelectFrame: (frameIndex: number) => void
  onSelectChine: (chineIndex: number) => void
  onSelectDeck: () => void
  onSelectDerivedBulkhead: (id: string | null) => void
  onFrameXChange: (frameIndex: number, x: number) => void
  onHeightChange: (chineIndex: number, frameIndex: number, z: number) => void
  onDeckHeightChange: (frameIndex: number, z: number) => void
  onDerivedBulkheadXChange: (id: string, x: number) => void
}

type DragMode =
  | { kind: 'frameX'; frameIndex: number }
  | { kind: 'height'; chineIndex: number; frameIndex: number }
  | { kind: 'deck'; frameIndex: number }
  | { kind: 'derivedBh'; id: string }

const CHINE_COLORS = [
  '#5c5346',
  '#3d5a80',
  '#2f5d50',
  '#8a5a2b',
  '#6b3a5a',
  '#4a6fa5',
  '#7a8f4a',
  '#a65d3f',
  '#2a6f6f',
  '#6a4c93',
]

/**
 * Profile (side) view: chine lines along LOA.
 * Drag chine/deck points vertically for height; top markers move frame X.
 */
export function FrameProfile({
  hull,
  selectedFrame,
  selectedChine,
  selectedDeck,
  selectedDerivedBulkheadId,
  onSelectFrame,
  onSelectChine,
  onSelectDeck,
  onSelectDerivedBulkhead,
  onFrameXChange,
  onHeightChange,
  onDeckHeightChange,
  onDerivedBulkheadXChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState<DragMode | null>(null)

  const maxZ = useMemo(() => {
    let m = 1
    for (const c of hull.chines) {
      for (const o of c.offsets) m = Math.max(m, o.z)
    }
    for (const z of hull.deckHeights ?? []) m = Math.max(m, z)
    return Math.max(m * 1.2, 1)
  }, [hull])

  const xMin = hull.frames[0]?.x ?? 0
  const xMax = hull.frames[hull.frames.length - 1]?.x ?? hull.loa
  const padX = Math.max((xMax - xMin) * 0.06, 0.35)
  const padZ = Math.max(maxZ * 0.08, 0.2)
  const vb = `${xMin - padX} ${-maxZ - padZ} ${xMax - xMin + padX * 2} ${maxZ + padZ * 2}`

  const screenToXZ = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, z: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, z: 0 }
    const local = pt.matrixTransform(ctm.inverse())
    return {
      x: Math.round(local.x * 100) / 100,
      z: Math.max(0, Math.round(-local.y * 200) / 200),
    }
  }, [])

  const startFrameX = (frameIndex: number, e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setDragging({ kind: 'frameX', frameIndex })
    onSelectFrame(frameIndex)
  }

  const startHeight = (
    chineIndex: number,
    frameIndex: number,
    e: React.PointerEvent,
  ) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setDragging({ kind: 'height', chineIndex, frameIndex })
    onSelectFrame(frameIndex)
    onSelectChine(chineIndex)
  }

  const startDeck = (frameIndex: number, e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setDragging({ kind: 'deck', frameIndex })
    onSelectFrame(frameIndex)
    onSelectDeck()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const { x, z } = screenToXZ(e.clientX, e.clientY)
    if (dragging.kind === 'frameX') onFrameXChange(dragging.frameIndex, x)
    else if (dragging.kind === 'deck') onDeckHeightChange(dragging.frameIndex, z)
    else if (dragging.kind === 'derivedBh')
      onDerivedBulkheadXChange(dragging.id, x)
    else onHeightChange(dragging.chineIndex, dragging.frameIndex, z)
  }

  const endDrag = (e: React.PointerEvent) => {
    if (!dragging) return
    try {
      ;(e.target as Element).releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
    setDragging(null)
  }

  const pointR = Math.max((xMax - xMin) * 0.012, maxZ * 0.035, 0.07)
  const tick = Math.max((xMax - xMin) * 0.015, 0.07)
  const sheer = hull.chines[hull.chines.length - 1]
  const showDeck =
    hull.closedTop && hull.deckHeights.length === hull.frames.length

  return (
    <div className="frame-editor">
      <div className="frame-editor-header">
        <strong>Profile</strong>
        <span className="hint">
          Drag chine/deck for height · markers move X · purple = derived BH
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={vb}
        className="profile-svg"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <line
          x1={xMin - padX * 0.3}
          y1={0}
          x2={xMax + padX * 0.3}
          y2={0}
          stroke="#8a8070"
          strokeWidth={0.03}
        />
        <text x={xMax + padX * 0.05} y={-maxZ + 0.15} fontSize={0.16} fill="#5c5346">
          Z↑
        </text>
        <text x={xMax - 0.4} y={0.35} fontSize={0.16} fill="#5c5346">
          X→
        </text>

        {(hull.derivedBulkheads ?? []).map((bh) => {
          const active =
            selectedDerivedBulkheadId === bh.id ||
            (dragging?.kind === 'derivedBh' && dragging.id === bh.id)
          const top = maxZ * 0.85
          return (
            <g key={bh.id}>
              <line
                x1={bh.x}
                y1={0.08}
                x2={bh.x}
                y2={-top}
                stroke={active ? '#7b2d8e' : '#9b59b6'}
                strokeWidth={active ? 0.05 : 0.03}
                strokeDasharray="0.12 0.07"
                style={{ cursor: 'ew-resize', touchAction: 'none' }}
                onPointerDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  ;(e.target as Element).setPointerCapture(e.pointerId)
                  setDragging({ kind: 'derivedBh', id: bh.id })
                  onSelectDerivedBulkhead(bh.id)
                }}
              />
              <circle
                cx={bh.x}
                cy={-top}
                r={active ? pointR * 1.2 : pointR}
                fill={active ? '#7b2d8e' : '#9b59b6'}
                stroke="#fffdf8"
                strokeWidth={0.02}
                style={{ cursor: 'ew-resize', touchAction: 'none' }}
                onPointerDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  ;(e.target as Element).setPointerCapture(e.pointerId)
                  setDragging({ kind: 'derivedBh', id: bh.id })
                  onSelectDerivedBulkhead(bh.id)
                }}
              />
              <text
                x={bh.x + pointR}
                y={-top - pointR}
                fontSize={0.13}
                fill="#7b2d8e"
                style={{ pointerEvents: 'none' }}
              >
                {bh.name}
              </text>
            </g>
          )
        })}

        {hull.frames.map((f, i) => {
          const active = i === selectedFrame
          const top = sheer?.offsets[i]?.z ?? maxZ * 0.5
          const lineTop = Math.max(top, maxZ * 0.3)
          return (
            <g key={`st-${f.id}`}>
              <line
                x1={f.x}
                y1={0.08}
                x2={f.x}
                y2={-lineTop}
                stroke={active ? '#e85d04' : '#b0a898'}
                strokeWidth={active ? 0.04 : 0.025}
                strokeDasharray={f.bulkhead ? undefined : '0.1 0.08'}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectFrame(i)}
              />
              <rect
                x={f.x - tick}
                y={-lineTop - tick * 2.2}
                width={tick * 2}
                height={tick * 2}
                rx={tick * 0.3}
                fill={active ? '#e85d04' : '#3d5a80'}
                stroke="#fffdf8"
                strokeWidth={0.02}
                style={{ cursor: 'ew-resize', touchAction: 'none' }}
                onPointerDown={(e) => startFrameX(i, e)}
              />
              <text
                x={f.x}
                y={0.32}
                fontSize={0.16}
                textAnchor="middle"
                fill="#5c5346"
                style={{ pointerEvents: 'none' }}
              >
                F{i + 1}
              </text>
            </g>
          )
        })}

        {hull.chines.map((chine, ci) => {
          const color = CHINE_COLORS[ci % CHINE_COLORS.length]
          const controls = halfHullPoints(hull)[ci]
          const faired = fairLongitudinalCurve(
            controls,
            longitudinalFairing(hull),
            10,
          )
          const path = faired
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${-p.z}`)
            .join(' ')
          const chineActive = !selectedDeck && ci === selectedChine
          return (
            <g key={chine.id}>
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={chineActive ? 0.055 : 0.035}
                opacity={chineActive ? 1 : 0.75}
                style={{ pointerEvents: 'none' }}
              />
              {chine.offsets.map((o, fi) => {
                const x = hull.frames[fi]?.x ?? 0
                const active =
                  (!selectedDeck && ci === selectedChine && fi === selectedFrame) ||
                  (dragging?.kind === 'height' &&
                    dragging.chineIndex === ci &&
                    dragging.frameIndex === fi)
                return (
                  <circle
                    key={`${chine.id}-${fi}`}
                    cx={x}
                    cy={-o.z}
                    r={active ? pointR * 1.35 : pointR}
                    fill={active ? '#e85d04' : color}
                    stroke="#fffdf8"
                    strokeWidth={0.025}
                    style={{ cursor: 'ns-resize', touchAction: 'none' }}
                    onPointerDown={(e) => startHeight(ci, fi, e)}
                  >
                    <title>
                      {chine.name} @ F{fi + 1}: Z={o.z.toFixed(2)}
                    </title>
                  </circle>
                )
              })}
              <text
                x={(hull.frames[hull.frames.length - 1]?.x ?? xMax) + pointR * 1.2}
                y={-(chine.offsets[chine.offsets.length - 1]?.z ?? 0)}
                fontSize={0.14}
                fill={color}
                dominantBaseline="middle"
                style={{ pointerEvents: 'none' }}
              >
                {chine.name}
              </text>
            </g>
          )
        })}

        {showDeck ? (
          <g>
            <path
              d={fairLongitudinalCurve(
                deckCenterline(hull),
                longitudinalFairing(hull),
                10,
              )
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${-p.z}`)
                .join(' ')}
              fill="none"
              stroke="#8b5e3c"
              strokeWidth={selectedDeck ? 0.06 : 0.04}
              style={{ pointerEvents: 'none' }}
            />
            {hull.deckHeights.map((z, fi) => {
              const x = hull.frames[fi]?.x ?? 0
              const active =
                (selectedDeck && fi === selectedFrame) ||
                (dragging?.kind === 'deck' && dragging.frameIndex === fi)
              return (
                <circle
                  key={`deck-${fi}`}
                  cx={x}
                  cy={-z}
                  r={active ? pointR * 1.4 : pointR * 1.1}
                  fill={active ? '#e85d04' : '#8b5e3c'}
                  stroke="#fffdf8"
                  strokeWidth={0.025}
                  style={{ cursor: 'ns-resize', touchAction: 'none' }}
                  onPointerDown={(e) => startDeck(fi, e)}
                >
                  <title>
                    Deck @ F{fi + 1}: Z={z.toFixed(2)}
                  </title>
                </circle>
              )
            })}
            <text
              x={(hull.frames[hull.frames.length - 1]?.x ?? xMax) + pointR * 1.2}
              y={-(hull.deckHeights[hull.deckHeights.length - 1] ?? 0)}
              fontSize={0.14}
              fill="#8b5e3c"
              dominantBaseline="middle"
              style={{ pointerEvents: 'none' }}
            >
              Deck
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  )
}
