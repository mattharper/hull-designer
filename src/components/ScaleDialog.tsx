import { useEffect, useMemo, useState } from 'react'
import type { Hull } from '../core/types'
import {
  hullExtents,
  scaleHull,
  scalesFromPercents,
  scalesFromTargets,
} from '../core/geometry/scale'

type ScaleMode = 'percent' | 'target'

interface Props {
  hull: Hull
  open: boolean
  onClose: () => void
  onApply: (hull: Hull) => void
}

export function ScaleDialog({ hull, open, onClose, onApply }: Props) {
  const extents = useMemo(() => hullExtents(hull), [hull])
  const [mode, setMode] = useState<ScaleMode>('percent')
  const [uniform, setUniform] = useState(true)
  const [pctX, setPctX] = useState(100)
  const [pctY, setPctY] = useState(100)
  const [pctZ, setPctZ] = useState(100)
  const [targetX, setTargetX] = useState(extents.length)
  const [targetY, setTargetY] = useState(extents.halfBreadth)
  const [targetZ, setTargetZ] = useState(extents.height)

  useEffect(() => {
    if (!open) return
    setPctX(100)
    setPctY(100)
    setPctZ(100)
    setTargetX(round3(extents.length))
    setTargetY(round3(extents.halfBreadth))
    setTargetZ(round3(extents.height))
  }, [open, extents])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const factors = useMemo(() => {
    if (mode === 'percent') return scalesFromPercents(pctX, pctY, pctZ)
    return scalesFromTargets(extents, targetX, targetY, targetZ)
  }, [mode, pctX, pctY, pctZ, targetX, targetY, targetZ, extents])

  const preview = useMemo(
    () => ({
      length: extents.length * factors.sx,
      halfBreadth: extents.halfBreadth * factors.sy,
      height: extents.height * factors.sz,
      beam: extents.halfBreadth * factors.sy * 2,
    }),
    [extents, factors],
  )

  if (!open) return null

  const unit = hull.units
  const setUniformPct = (value: number) => {
    setPctX(value)
    setPctY(value)
    setPctZ(value)
  }

  const onPctChange = (axis: 'x' | 'y' | 'z', value: number) => {
    if (uniform) {
      setUniformPct(value)
      return
    }
    if (axis === 'x') setPctX(value)
    if (axis === 'y') setPctY(value)
    if (axis === 'z') setPctZ(value)
  }

  const onTargetChange = (axis: 'x' | 'y' | 'z', value: number) => {
    if (uniform) {
      const sx = value / extents.length
      setTargetX(value)
      setTargetY(round3(extents.halfBreadth * sx))
      setTargetZ(round3(extents.height * sx))
      return
    }
    if (axis === 'x') setTargetX(value)
    if (axis === 'y') setTargetY(value)
    if (axis === 'z') setTargetZ(value)
  }

  const apply = () => {
    onApply(scaleHull(hull, factors.sx, factors.sy, factors.sz))
    onClose()
  }

  const valid =
    factors.sx > 0 &&
    factors.sy > 0 &&
    factors.sz > 0 &&
    Number.isFinite(factors.sx) &&
    Number.isFinite(factors.sy) &&
    Number.isFinite(factors.sz)

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scale-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog-header">
          <h2 id="scale-dialog-title">Scale model</h2>
          <button type="button" className="dialog-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="dialog-body">
          <p className="hint">
            Current: length {extents.length.toFixed(3)} {unit} · half-breadth{' '}
            {extents.halfBreadth.toFixed(3)} {unit} · height{' '}
            {extents.height.toFixed(3)} {unit}
          </p>

          <div className="btn-row">
            <button
              type="button"
              className={mode === 'percent' ? 'active' : ''}
              onClick={() => setMode('percent')}
            >
              By percent
            </button>
            <button
              type="button"
              className={mode === 'target' ? 'active' : ''}
              onClick={() => setMode('target')}
            >
              To target size
            </button>
          </div>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={uniform}
              onChange={(e) => {
                setUniform(e.target.checked)
                if (e.target.checked) {
                  if (mode === 'percent') setUniformPct(pctX)
                  else onTargetChange('x', targetX)
                }
              }}
            />
            Uniform scale (lock X/Y/Z)
          </label>

          {mode === 'percent' ? (
            <div className="field-grid">
              <label>
                Length X (%)
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={pctX}
                  onChange={(e) =>
                    onPctChange('x', parseFloat(e.target.value) || 0)
                  }
                />
              </label>
              <label>
                Half-breadth Y (%)
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={pctY}
                  disabled={uniform}
                  onChange={(e) =>
                    onPctChange('y', parseFloat(e.target.value) || 0)
                  }
                />
              </label>
              <label>
                Height Z (%)
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={pctZ}
                  disabled={uniform}
                  onChange={(e) =>
                    onPctChange('z', parseFloat(e.target.value) || 0)
                  }
                />
              </label>
            </div>
          ) : (
            <div className="field-grid">
              <label>
                Target length ({unit})
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={targetX}
                  onChange={(e) =>
                    onTargetChange('x', parseFloat(e.target.value) || 0)
                  }
                />
              </label>
              <label>
                Target half-breadth ({unit})
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={targetY}
                  disabled={uniform}
                  onChange={(e) =>
                    onTargetChange('y', parseFloat(e.target.value) || 0)
                  }
                />
              </label>
              <label>
                Target height ({unit})
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={targetZ}
                  disabled={uniform}
                  onChange={(e) =>
                    onTargetChange('z', parseFloat(e.target.value) || 0)
                  }
                />
              </label>
            </div>
          )}

          <table className="results">
            <tbody>
              <tr>
                <th>Scale factors</th>
                <td>
                  {factors.sx.toFixed(3)} × {factors.sy.toFixed(3)} ×{' '}
                  {factors.sz.toFixed(3)}
                </td>
              </tr>
              <tr>
                <th>Result length</th>
                <td>
                  {preview.length.toFixed(3)} {unit}
                </td>
              </tr>
              <tr>
                <th>Result beam</th>
                <td>
                  {preview.beam.toFixed(3)} {unit}
                </td>
              </tr>
              <tr>
                <th>Result height</th>
                <td>
                  {preview.height.toFixed(3)} {unit}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer className="dialog-footer">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="active"
            disabled={!valid}
            onClick={apply}
          >
            Apply scale
          </button>
        </footer>
      </div>
    </div>
  )
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
