import { useMemo, useRef, useState } from 'react'
import { useHullStore } from '../store/hullStore'
import {
  nestPanels,
  panelFootprint,
  transformedOutline,
  plotPointTable,
  computeNestStats,
  sheetBoardLayout,
  sheetIndexContaining,
  requiredSheetCount,
} from '../core/nest/nesting'
import { developAllPanels } from '../core/develop/unfold'
import { downloadText, panelsToDxf } from '../core/io/dxf'
import type { NestResult, NestedPlacement, Panel } from '../core/types'

export function PatternsPanel() {
  const hull = useHullStore((s) => s.hull)
  const nestCtrl = useHullStore((s) => s.nest)
  const nestOverrides = useHullStore((s) => s.nestOverrides)
  const setNest = useHullStore((s) => s.setNest)
  const updatePlacement = useHullStore((s) => s.updatePlacement)
  const applyAutolayout = useHullStore((s) => s.applyAutolayout)
  const clearNestOverrides = useHullStore((s) => s.clearNestOverrides)
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null)
  const [view, setView] = useState<'panels' | 'nest'>('nest')
  const [lastStats, setLastStats] = useState<string | null>(null)

  const panels = useMemo(() => developAllPanels(hull), [hull])
  const nest = useMemo(() => {
    const base = nestPanels(
      panels,
      nestCtrl.sheetCount,
      { width: nestCtrl.sheetWidth, height: nestCtrl.sheetHeight },
      nestCtrl.gap,
      {
        allowFlip: nestCtrl.allowFlip,
        maxSheets: Math.max(nestCtrl.sheetCount, 12),
      },
    )
    if (nestOverrides.length >= panels.length && panels.length > 0) {
      const sheetCount = Math.max(
        nestCtrl.sheetCount,
        requiredSheetCount(panels, {
          sheets: Array.from(
            {
              length: Math.max(
                nestCtrl.sheetCount,
                ...nestOverrides.map((p) => p.sheetIndex + 1),
              ),
            },
            () => ({
              width: nestCtrl.sheetWidth,
              height: nestCtrl.sheetHeight,
            }),
          ),
          placements: nestOverrides,
        }),
      )
      return {
        sheets: Array.from({ length: sheetCount }, () => ({
          width: nestCtrl.sheetWidth,
          height: nestCtrl.sheetHeight,
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
  }, [panels, nestCtrl, nestOverrides])

  const stats = useMemo(
    () => computeNestStats(panels, nest, nestCtrl.gap),
    [panels, nest, nestCtrl.gap],
  )

  const panelMap = useMemo(
    () => new Map(panels.map((p) => [p.id, p])),
    [panels],
  )

  const selected = selectedPanelId
    ? nest.placements.find((p) => p.panelId === selectedPanelId)
    : null

  const exportDxf = () => {
    const scale = hull.units === 'ft' ? 12 : 1000
    const dxf = panelsToDxf(panels, nest, scale)
    downloadText(
      `${hull.name.replace(/\s+/g, '-').toLowerCase()}-panels.dxf`,
      dxf,
    )
  }

  const exportPlot = () => {
    downloadText(
      `${hull.name.replace(/\s+/g, '-').toLowerCase()}-plot.txt`,
      plotPointTable(panels, nest),
    )
  }

  const onAutolayout = () => {
    const s = applyAutolayout()
    setLastStats(
      `${s.sheetsUsed} sheet${s.sheetsUsed === 1 ? '' : 's'} · ${(s.utilization * 100).toFixed(0)}% fill` +
        (s.panelsOverflow ? ` · ${s.panelsOverflow} overflow` : ''),
    )
    setView('nest')
  }

  return (
    <div className="mode-layout">
      <aside className="side-panel">
        <section>
          <h2>View</h2>
          <div className="btn-row">
            <button
              type="button"
              className={view === 'nest' ? 'active' : ''}
              onClick={() => setView('nest')}
            >
              Nesting
            </button>
            <button
              type="button"
              className={view === 'panels' ? 'active' : ''}
              onClick={() => setView('panels')}
            >
              Panels
            </button>
          </div>
        </section>

        <section>
          <h2>Autolayout</h2>
          <p className="hint">
            MaxRects packer — drag panels on the sheet to adjust. Scarfs sheet
            length only when a panel is longer than the stock size.
          </p>
          <div className="btn-row">
            <button type="button" className="active" onClick={onAutolayout}>
              Run autolayout
            </button>
            <button
              type="button"
              onClick={() => {
                clearNestOverrides()
                setLastStats(null)
              }}
            >
              Reset
            </button>
          </div>
          <table className="results">
            <tbody>
              <tr>
                <th>Sheets used</th>
                <td>{stats.sheetsUsed}</td>
              </tr>
              <tr>
                <th>Utilization</th>
                <td>{(stats.utilization * 100).toFixed(1)}%</td>
              </tr>
              <tr>
                <th>Placed</th>
                <td>
                  {stats.panelsPlaced}/{panels.length}
                </td>
              </tr>
              {stats.panelsOverflow > 0 && (
                <tr>
                  <th>Overflow</th>
                  <td>{stats.panelsOverflow}</td>
                </tr>
              )}
            </tbody>
          </table>
          {lastStats && <p className="hint">{lastStats}</p>}
          <label className="checkbox" style={{ marginTop: '0.5rem' }}>
            <input
              type="checkbox"
              checked={nestCtrl.allowFlip}
              onChange={(e) => setNest({ allowFlip: e.target.checked })}
            />
            Allow 180° / 270°
          </label>
        </section>

        <section>
          <h2>Sheets</h2>
          <div className="field-grid">
            <label>
              Count
              <select
                value={Math.min(12, Math.max(1, nestCtrl.sheetCount))}
                onChange={(e) =>
                  setNest({
                    sheetCount: Number(e.target.value),
                  })
                }
              >
                {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Width ({hull.units})
              <input
                type="number"
                step="0.1"
                value={nestCtrl.sheetWidth}
                onChange={(e) =>
                  setNest({ sheetWidth: parseFloat(e.target.value) || 1 })
                }
              />
            </label>
            <label>
              Height ({hull.units})
              <input
                type="number"
                step="0.1"
                value={nestCtrl.sheetHeight}
                onChange={(e) =>
                  setNest({ sheetHeight: parseFloat(e.target.value) || 1 })
                }
              />
            </label>
            <label>
              Gap ({hull.units})
              <input
                type="number"
                step="0.01"
                value={nestCtrl.gap}
                onChange={(e) =>
                  setNest({ gap: parseFloat(e.target.value) || 0 })
                }
              />
            </label>
          </div>
        </section>

        <section>
          <h2>Panels ({panels.length})</h2>
          <ul className="select-list">
            {panels.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={selectedPanelId === p.id ? 'active' : ''}
                  onClick={() => setSelectedPanelId(p.id)}
                >
                  {p.name}
                  <span className="meta">
                    {p.width.toFixed(2)}×{p.height.toFixed(2)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {selected && selectedPanelId && (
          <section>
            <h2>Placement</h2>
            <div className="field-grid">
              <label>
                Sheet
                <input
                  type="number"
                  min={0}
                  max={nest.sheets.length - 1}
                  value={selected.sheetIndex}
                  onChange={(e) => {
                    const next = parseInt(e.target.value, 10) || 0
                    const layout = sheetBoardLayout(
                      nest.sheets[0] ?? {
                        width: nestCtrl.sheetWidth,
                        height: nestCtrl.sheetHeight,
                      },
                      nest.sheets.length,
                    )
                    const from = layout.origins[selected.sheetIndex] ?? {
                      x: 0,
                      y: 0,
                    }
                    const to = layout.origins[next] ?? from
                    updatePlacement(selectedPanelId, {
                      sheetIndex: next,
                      x: selected.x - from.x + to.x,
                      y: selected.y - from.y + to.y,
                    })
                  }}
                />
              </label>
              <label>
                X
                <input
                  type="number"
                  step="0.05"
                  value={Number(selected.x.toFixed(3))}
                  onChange={(e) =>
                    updatePlacement(selectedPanelId, {
                      x: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  step="0.05"
                  value={Number(selected.y.toFixed(3))}
                  onChange={(e) =>
                    updatePlacement(selectedPanelId, {
                      y: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label>
                Rotation
                <select
                  value={selected.rotationDeg}
                  onChange={(e) =>
                    updatePlacement(selectedPanelId, {
                      rotationDeg: parseFloat(e.target.value),
                    })
                  }
                >
                  <option value={0}>0°</option>
                  <option value={90}>90°</option>
                  <option value={180}>180°</option>
                  <option value={270}>270°</option>
                </select>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={selected.flipped}
                  onChange={(e) =>
                    updatePlacement(selectedPanelId, {
                      flipped: e.target.checked,
                    })
                  }
                />
                Flip
              </label>
            </div>
          </section>
        )}

        <section>
          <h2>Export</h2>
          <div className="btn-row">
            <button type="button" onClick={exportDxf}>
              DXF
            </button>
            <button type="button" onClick={exportPlot}>
              Plot points
            </button>
          </div>
        </section>
      </aside>

      <div className="viewport pattern-viewport">
        {view === 'panels' ? (
          <PanelGallery
            panels={panels}
            selectedId={selectedPanelId}
            onSelect={setSelectedPanelId}
          />
        ) : (
          <NestCanvas
            panels={panelMap}
            nest={nest}
            selectedId={selectedPanelId}
            onSelect={setSelectedPanelId}
            onMove={updatePlacement}
          />
        )}
      </div>
    </div>
  )
}

function PanelGallery({
  panels,
  selectedId,
  onSelect,
}: {
  panels: Panel[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="panel-gallery">
      {panels.map((panel) => {
        const pad = 0.1
        const w = Math.max(panel.width, 0.1)
        const h = Math.max(panel.height, 0.1)
        const vb = `${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`
        const d =
          panel.outline
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.u} ${h - p.v}`)
            .join(' ') + ' Z'
        return (
          <button
            key={panel.id}
            type="button"
            className={`panel-card ${selectedId === panel.id ? 'active' : ''}`}
            onClick={() => onSelect(panel.id)}
          >
            <svg viewBox={vb} className="panel-svg">
              <path d={d} fill="#d4c4a8" stroke="#2c3e2d" strokeWidth={0.02} />
            </svg>
            <span>{panel.name}</span>
          </button>
        )
      })}
    </div>
  )
}

function clientToSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const p = pt.matrixTransform(ctm.inverse())
  return { x: p.x, y: p.y }
}

function NestCanvas({
  panels,
  nest,
  selectedId,
  onSelect,
  onMove,
}: {
  panels: Map<string, Panel>
  nest: NestResult
  selectedId: string | null
  onSelect: (id: string) => void
  onMove: (panelId: string, partial: Partial<NestedPlacement>) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{
    panelId: string
    grabX: number
    grabY: number
    pointerId: number
  } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const sheet = nest.sheets[0] ?? { width: 4, height: 8 }
  const layout = sheetBoardLayout(sheet, Math.max(1, nest.sheets.length))
  const boardW = layout.boardWidth
  const boardH = layout.boardHeight
  const pad = 0.3
  const vb = `${-pad} ${-pad} ${boardW + pad * 2} ${boardH + pad * 2}`

  const boardPoint = (svgX: number, svgY: number) => ({
    x: svgX,
    y: boardH - svgY,
  })

  const endDrag = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    setDraggingId(null)
    try {
      svgRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  return (
    <svg
      ref={svgRef}
      viewBox={vb}
      className={`nest-svg${draggingId ? ' nesting-dragging' : ''}`}
      role="img"
      aria-label="Nesting board — drag panels to move"
      onPointerMove={(e) => {
        const drag = dragRef.current
        const svg = svgRef.current
        if (!drag || !svg || drag.pointerId !== e.pointerId) return
        const panel = panels.get(drag.panelId)
        const pl = nest.placements.find((p) => p.panelId === drag.panelId)
        if (!panel || !pl) return
        const svgPt = clientToSvg(svg, e.clientX, e.clientY)
        const board = boardPoint(svgPt.x, svgPt.y)
        const fp = panelFootprint(panel, pl.rotationDeg)
        let x = board.x - drag.grabX
        let y = board.y - drag.grabY
        x = Math.max(0, Math.min(Math.max(0, boardW - fp.w), x))
        y = Math.max(0, Math.min(Math.max(0, boardH - fp.h), y))
        onMove(drag.panelId, {
          sheetIndex: sheetIndexContaining(layout, x + fp.w * 0.5, y + fp.h * 0.5),
          x: Math.round(x * 1000) / 1000,
          y: Math.round(y * 1000) / 1000,
        })
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {nest.sheets.map((s, i) => {
        const o = layout.origins[i]
        return (
          <g key={i}>
            <rect
              x={o.x}
              y={boardH - o.y - s.height}
              width={s.width}
              height={s.height}
              fill="#f7f2e8"
              stroke="#5c5346"
              strokeWidth={0.03}
            />
            <text
              x={o.x + 0.1}
              y={boardH - o.y - s.height + 0.25}
              fontSize={0.2}
              fill="#5c5346"
            >
              Sheet {i + 1}
            </text>
          </g>
        )
      })}
      {nest.placements.map((pl) => {
        const panel = panels.get(pl.panelId)
        if (!panel) return null
        const pts = transformedOutline(panel, pl)
        const d =
          pts
            .map(
              (p, i) =>
                `${i === 0 ? 'M' : 'L'} ${p.x} ${boardH - p.y}`,
            )
            .join(' ') + ' Z'
        const active = selectedId === pl.panelId
        const dragging = draggingId === pl.panelId
        return (
          <path
            key={pl.panelId}
            d={d}
            fill={dragging ? '#d4925a' : active ? '#e8a87c' : '#8fbc8f'}
            stroke="#1f2a1f"
            strokeWidth={active || dragging ? 0.04 : 0.02}
            style={{ cursor: dragging ? 'grabbing' : 'grab' }}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.preventDefault()
              e.stopPropagation()
              const svg = svgRef.current
              if (!svg) return
              onSelect(pl.panelId)
              const svgPt = clientToSvg(svg, e.clientX, e.clientY)
              const board = boardPoint(svgPt.x, svgPt.y)
              dragRef.current = {
                panelId: pl.panelId,
                grabX: board.x - pl.x,
                grabY: board.y - pl.y,
                pointerId: e.pointerId,
              }
              setDraggingId(pl.panelId)
              svg.setPointerCapture(e.pointerId)
            }}
          >
            <title>{panel.name} — drag to move</title>
          </path>
        )
      })}
    </svg>
  )
}
