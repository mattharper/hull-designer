import { useCallback, useMemo, useRef, useState } from 'react'
import type { Hull } from '../core/types'
import {
  fairTransverseCurve,
  transverseFairing,
} from '../core/geometry/points'

interface Props {
  hull: Hull
  frameIndex: number
  selectedChine: number
  selectedDeck: boolean
  onSelectChine: (chineIndex: number) => void
  onSelectDeck: () => void
  onOffsetChange: (chineIndex: number, y: number, z: number) => void
  onDeckHeightChange: (z: number) => void
}

type DragTarget = { kind: 'chine'; index: number } | { kind: 'deck' }

/**
 * Body-plan editor: look aft at the selected frame.
 * Chine handles stay at controls; outline may bend when section fairing is on.
 */
export function FrameBodyPlan({
  hull,
  frameIndex,
  selectedChine,
  selectedDeck,
  onSelectChine,
  onSelectDeck,
  onOffsetChange,
  onDeckHeightChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState<DragTarget | null>(null)

  const points = useMemo(
    () =>
      hull.chines.map((c) => ({
        y: c.offsets[frameIndex]?.y ?? 0,
        z: c.offsets[frameIndex]?.z ?? 0,
        name: c.name,
      })),
    [hull, frameIndex],
  )

  const deckZ = hull.closedTop
    ? (hull.deckHeights[frameIndex] ?? points[points.length - 1]?.z ?? 0)
    : null

  const tFair = transverseFairing(hull)
  const outline = useMemo(() => {
    const controls = (
      hull.closedTop && deckZ !== null
        ? [...points, { y: 0, z: deckZ }]
        : points
    ).map((p) => ({
      x: hull.frames[frameIndex]?.x ?? 0,
      y: p.y,
      z: p.z,
    }))
    if (tFair < 1e-6 || controls.length < 2) return controls
    const tSub = Math.max(2, Math.round(2 + tFair * 6))
    return fairTransverseCurve(controls, tFair, tSub)
  }, [points, deckZ, tFair, hull.closedTop, hull.frames, frameIndex])

  const bounds = useMemo(() => {
    let maxY = 1
    let maxZ = 1
    for (const c of hull.chines) {
      for (const o of c.offsets) {
        maxY = Math.max(maxY, Math.abs(o.y) * 1.15, 0.5)
        maxZ = Math.max(maxZ, o.z * 1.15, 0.5)
      }
    }
    for (const z of hull.deckHeights ?? []) {
      maxZ = Math.max(maxZ, z * 1.15)
    }
    return { maxY, maxZ }
  }, [hull])

  const pad = 0.35
  const vb = useMemo(() => {
    const { maxY, maxZ } = bounds
    return `${-maxY - pad} ${-maxZ - pad} ${maxY * 2 + pad * 2} ${maxZ + pad * 2}`
  }, [bounds, pad])

  const screenToYz = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { y: 0, z: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { y: 0, z: 0 }
    const local = pt.matrixTransform(ctm.inverse())
    return {
      y: Math.max(0, Math.round(Math.abs(local.x) * 200) / 200),
      z: Math.max(0, Math.round(-local.y * 200) / 200),
    }
  }, [])

  const onPointerDown = (target: DragTarget, e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setDragging(target)
    if (target.kind === 'deck') onSelectDeck()
    else onSelectChine(target.index)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const { y, z } = screenToYz(e.clientX, e.clientY)
    if (dragging.kind === 'deck') onDeckHeightChange(z)
    else onOffsetChange(dragging.index, y, z)
  }

  const endDrag = (e: React.PointerEvent) => {
    if (!dragging) return
    try {
      ;(e.target as Element).releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    setDragging(null)
  }

  const pathD = (side: 1 | -1) =>
    outline
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${side * p.y} ${-p.z}`)
      .join(' ')

  const frame = hull.frames[frameIndex]
  const r = Math.max(bounds.maxY, bounds.maxZ) * 0.035

  return (
    <div className="frame-editor">
      <div className="frame-editor-header">
        <strong>Body plan</strong>
        <span>
          Frame {frameIndex + 1}
          {frame ? ` · x=${frame.x.toFixed(2)}` : ''}
        </span>
        <span className="hint">
          {tFair > 0.05
            ? 'Rounded section — drag chines; bend via Section fairing'
            : 'Hard chines — drag Y/Z; fairing is fore–aft'}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={vb}
        className="body-plan-svg"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={-bounds.maxZ}
          stroke="#8a8070"
          strokeWidth={0.025}
        />
        <line
          x1={-bounds.maxY}
          y1={0}
          x2={bounds.maxY}
          y2={0}
          stroke="#8a8070"
          strokeWidth={0.025}
        />

        <path
          d={pathD(-1)}
          fill="none"
          stroke="#a8b5a0"
          strokeWidth={0.03}
          strokeDasharray="0.08 0.06"
        />
        <path d={pathD(1)} fill="none" stroke="#2f5d50" strokeWidth={0.045} />

        {hull.closedTop && deckZ !== null && (
          <circle
            cx={0}
            cy={-deckZ}
            r={selectedDeck || dragging?.kind === 'deck' ? r * 1.45 : r * 1.1}
            fill={
              selectedDeck || dragging?.kind === 'deck' ? '#e85d04' : '#8b5e3c'
            }
            stroke="#fffdf8"
            strokeWidth={0.025}
            style={{ cursor: 'ns-resize', touchAction: 'none' }}
            onPointerDown={(e) => onPointerDown({ kind: 'deck' }, e)}
          />
        )}

        {points.map((p, i) => (
          <circle
            key={`g-${hull.chines[i].id}`}
            cx={-p.y}
            cy={-p.z}
            r={r * 0.65}
            fill="#a8b5a0"
            style={{ pointerEvents: 'none' }}
          />
        ))}

        {points.map((p, i) => {
          const active =
            (!selectedDeck && i === selectedChine) ||
            (dragging?.kind === 'chine' && dragging.index === i)
          return (
            <g key={hull.chines[i].id}>
              <circle
                cx={p.y}
                cy={-p.z}
                r={active ? r * 1.4 : r}
                fill={active ? '#e85d04' : '#2f5d50'}
                stroke="#fffdf8"
                strokeWidth={0.025}
                style={{ cursor: 'grab', touchAction: 'none' }}
                onPointerDown={(e) =>
                  onPointerDown({ kind: 'chine', index: i }, e)
                }
              />
              <text
                x={p.y + r * 1.5}
                y={-p.z - r}
                fontSize={0.11}
                fill="#5c5346"
                style={{ pointerEvents: 'none' }}
              >
                {p.name}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
