import { useEffect, useMemo, useState } from 'react'
import { useHullStore } from '../store/hullStore'
import {
  computeHydrostatics,
  findDraftForDisplacement,
} from '../core/hydro/hydrostatics'
import {
  toLiters,
  toMetricArea,
  toMetricLength,
  toMetricMoment,
  toMetricWeight,
  toUsArea,
  toUsLength,
  toUsMoment,
  toUsVolumeFt3,
  toUsWeight,
} from '../core/units/convert'
import { HullViewer } from '../viewer/HullScene'
import type { HydroFloatMode } from '../store/hullStore'

function fmt(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

function ResultRow({
  label,
  metric,
  us,
}: {
  label: string
  metric: string
  us: string
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{metric}</td>
      <td>{us}</td>
    </tr>
  )
}

export function HydroPanel() {
  const hull = useHullStore((s) => s.hull)
  const hydro = useHullStore((s) => s.hydro)
  const setHydro = useHullStore((s) => s.setHydro)
  const setDesignDraft = useHullStore((s) => s.setDesignDraft)
  const setCg = useHullStore((s) => s.setCg)
  const [showWaterPlane, setShowWaterPlane] = useState(false)

  const result = useMemo(() => {
    if (hydro.floatMode === 'displacement') {
      return findDraftForDisplacement(hull, hydro.targetDisplacement, {
        heelDeg: hydro.heelDeg,
        trimDeg: hydro.trimDeg,
      })
    }
    return computeHydrostatics(hull, {
      draft: hydro.draft,
      heelDeg: hydro.heelDeg,
      trimDeg: hydro.trimDeg,
    })
  }, [hull, hydro])

  // Keep store draft / design draft in sync when solving from displacement
  useEffect(() => {
    if (hydro.floatMode !== 'displacement') return
    if (Math.abs(result.draft - hydro.draft) < 1e-4) return
    setDesignDraft(result.draft)
  }, [hydro.floatMode, hydro.draft, result.draft, setDesignDraft])

  const unit = hull.units
  const wt = unit === 'ft' ? 'lb' : 'kg'
  const len = unit

  const setFloatMode = (floatMode: HydroFloatMode) => {
    if (floatMode === hydro.floatMode) return
    if (floatMode === 'displacement') {
      const current = computeHydrostatics(hull, {
        draft: hydro.draft,
        heelDeg: hydro.heelDeg,
        trimDeg: hydro.trimDeg,
      })
      setHydro({
        floatMode,
        targetDisplacement: Math.round(current.displacementWeight),
      })
    } else {
      setHydro({ floatMode })
    }
  }

  const L = (v: number, d = 3) => `${fmt(toMetricLength(v, unit), d)} m`
  const U = (v: number, d = 3) => `${fmt(toUsLength(v, unit), d)} ft`
  const Lm = (v: number, d = 3) => `${fmt(toMetricLength(v, unit), d)}`
  const Um = (v: number, d = 3) => `${fmt(toUsLength(v, unit), d)}`

  return (
    <div className="mode-layout">
      <aside className="side-panel">
        <section>
          <h2>Flotation</h2>
          <div className="btn-row">
            <button
              type="button"
              className={hydro.floatMode === 'draft' ? 'active' : ''}
              onClick={() => setFloatMode('draft')}
            >
              Draft
            </button>
            <button
              type="button"
              className={hydro.floatMode === 'displacement' ? 'active' : ''}
              onClick={() => setFloatMode('displacement')}
            >
              Displacement
            </button>
          </div>
          <div className="field-grid">
            {hydro.floatMode === 'draft' ? (
              <label>
                Draft ({len})
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  value={hydro.draft}
                  onChange={(e) => {
                    const v = Math.max(0, parseFloat(e.target.value) || 0)
                    setHydro({ draft: v })
                    setDesignDraft(v)
                  }}
                />
              </label>
            ) : (
              <label>
                Displacement ({wt})
                <input
                  type="number"
                  step={unit === 'ft' ? 50 : 20}
                  min="0"
                  value={hydro.targetDisplacement}
                  onChange={(e) => {
                    const v = Math.max(0, parseFloat(e.target.value) || 0)
                    setHydro({ targetDisplacement: v })
                  }}
                />
              </label>
            )}
            {hydro.floatMode === 'displacement' && (
              <p className="hint">
                Solved draft: {fmt(result.draft)} {len}
                {result.displacementWeight + 1 < hydro.targetDisplacement
                  ? ' (hull fully immersed — target exceeds buoyancy)'
                  : ''}
              </p>
            )}
            {hydro.floatMode === 'draft' && (
              <p className="hint">
                Displacement at this draft: {fmt(result.displacementWeight, 1)}{' '}
                {wt}
              </p>
            )}
          </div>
        </section>

        <section>
          <h2>Attitude</h2>
          <div className="field-grid">
            <label>
              Heel (°)
              <input
                type="range"
                min={-45}
                max={45}
                step={1}
                value={hydro.heelDeg}
                onChange={(e) =>
                  setHydro({ heelDeg: parseFloat(e.target.value) })
                }
              />
              <span className="range-val">{hydro.heelDeg}°</span>
            </label>
            <label>
              Trim (°)
              <input
                type="range"
                min={-15}
                max={15}
                step={0.5}
                value={hydro.trimDeg}
                onChange={(e) =>
                  setHydro({ trimDeg: parseFloat(e.target.value) })
                }
              />
              <span className="range-val">{hydro.trimDeg}°</span>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showWaterPlane}
                onChange={(e) => setShowWaterPlane(e.target.checked)}
              />
              Show water plane
            </label>
          </div>
        </section>

        <section>
          <h2>Center of gravity</h2>
          <div className="field-grid">
            <label>
              LCG ({len})
              <input
                type="number"
                step="0.1"
                value={hull.cg.x}
                onChange={(e) => setCg('x', parseFloat(e.target.value) || 0)}
              />
            </label>
            <label>
              TCG ({len})
              <input
                type="number"
                step="0.05"
                value={hull.cg.y}
                onChange={(e) => setCg('y', parseFloat(e.target.value) || 0)}
              />
            </label>
            <label>
              VCG ({len})
              <input
                type="number"
                step="0.05"
                value={hull.cg.z}
                onChange={(e) => setCg('z', parseFloat(e.target.value) || 0)}
              />
            </label>
          </div>
        </section>

        <section>
          <h2>Results</h2>
          <table className="results results-dual">
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">Metric</th>
                <th scope="col">US</th>
              </tr>
            </thead>
            <tbody>
              <ResultRow
                label="Draft"
                metric={L(result.draft)}
                us={U(result.draft)}
              />
              <ResultRow
                label="Displacement"
                metric={`${fmt(toMetricWeight(result.displacementWeight, unit), 1)} kg`}
                us={`${fmt(toUsWeight(result.displacementWeight, unit), 1)} lb`}
              />
              <ResultRow
                label="Volume"
                metric={`${fmt(toLiters(result.displacementVolume, unit), 1)} L`}
                us={`${fmt(toUsVolumeFt3(result.displacementVolume, unit), 3)} ft³`}
              />
              <ResultRow
                label="LWL"
                metric={L(result.lwl)}
                us={U(result.lwl)}
              />
              <ResultRow
                label="BWL"
                metric={L(result.bwl)}
                us={U(result.bwl)}
              />
              <ResultRow
                label="LCB"
                metric={L(result.lcb)}
                us={U(result.lcb)}
              />
              <ResultRow
                label="TCB"
                metric={L(result.tcb)}
                us={U(result.tcb)}
              />
              <ResultRow
                label="VCB"
                metric={L(result.vcb)}
                us={U(result.vcb)}
              />
              <ResultRow
                label="Waterplane"
                metric={`${fmt(toMetricArea(result.waterplaneArea, unit))} m²`}
                us={`${fmt(toUsArea(result.waterplaneArea, unit))} ft²`}
              />
              <ResultRow
                label="CLA area"
                metric={`${fmt(toMetricArea(result.claArea, unit))} m²`}
                us={`${fmt(toUsArea(result.claArea, unit))} ft²`}
              />
              <ResultRow
                label="CLA X / Z"
                metric={`${Lm(result.claX)} / ${Lm(result.claZ)} m`}
                us={`${Um(result.claX)} / ${Um(result.claZ)} ft`}
              />
              <ResultRow
                label="GZ"
                metric={L(result.gz)}
                us={U(result.gz)}
              />
              <ResultRow
                label="Righting moment"
                metric={`${fmt(toMetricMoment(result.rightingMoment, unit), 1)} kg·m`}
                us={`${fmt(toUsMoment(result.rightingMoment, unit), 1)} lb·ft`}
              />
            </tbody>
          </table>
        </section>
      </aside>

      <div className="viewport">
        <HullViewer
          hull={hull}
          highlightFrame={0}
          showWater
          showWaterPlane={showWaterPlane}
          waterZ={result.draft}
          heelDeg={result.heelDeg}
          trimDeg={result.trimDeg}
          centerOfBuoyancy={
            result.immersed
              ? { x: result.lcb, y: result.tcb, z: result.vcb }
              : null
          }
        />
      </div>
    </div>
  )
}
