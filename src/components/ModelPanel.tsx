import { useMemo } from 'react'
import { useHullStore } from '../store/hullStore'
import { MAX_CHINES, MAX_FRAMES } from '../core/types'
import { developabilityWarnings } from '../core/geometry/buildMesh'
import { HullViewer } from '../viewer/HullScene'
import { FrameBodyPlan } from './FrameBodyPlan'
import { FrameProfile } from './FrameProfile'

export function ModelPanel() {
  const hull = useHullStore((s) => s.hull)
  const selectedFrame = useHullStore((s) => s.selectedFrame)
  const selectedChine = useHullStore((s) => s.selectedChine)
  const setSelectedFrame = useHullStore((s) => s.setSelectedFrame)
  const setSelectedChine = useHullStore((s) => s.setSelectedChine)
  const setOffset = useHullStore((s) => s.setOffset)
  const setFrameX = useHullStore((s) => s.setFrameX)
  const setFrameBulkhead = useHullStore((s) => s.setFrameBulkhead)
  const addFrame = useHullStore((s) => s.addFrame)
  const removeFrame = useHullStore((s) => s.removeFrame)
  const addChine = useHullStore((s) => s.addChine)
  const removeChine = useHullStore((s) => s.removeChine)
  const setChineName = useHullStore((s) => s.setChineName)
  const setLongitudinalFairing = useHullStore((s) => s.setLongitudinalFairing)
  const setTransverseFairing = useHullStore((s) => s.setTransverseFairing)
  const setClosedTop = useHullStore((s) => s.setClosedTop)
  const setDeckHeight = useHullStore((s) => s.setDeckHeight)
  const selectedDeck = useHullStore((s) => s.selectedDeck)
  const setSelectedDeck = useHullStore((s) => s.setSelectedDeck)
  const derivedBulkheads = useHullStore((s) => s.hull.derivedBulkheads)
  const selectedDerivedBulkheadId = useHullStore((s) => s.selectedDerivedBulkheadId)
  const setSelectedDerivedBulkheadId = useHullStore(
    (s) => s.setSelectedDerivedBulkheadId,
  )
  const addDerivedBulkhead = useHullStore((s) => s.addDerivedBulkhead)
  const removeDerivedBulkhead = useHullStore((s) => s.removeDerivedBulkhead)
  const setDerivedBulkheadX = useHullStore((s) => s.setDerivedBulkheadX)
  const setDerivedBulkheadName = useHullStore((s) => s.setDerivedBulkheadName)
  const warnings = useMemo(() => developabilityWarnings(hull), [hull])

  const selectedDerived = derivedBulkheads?.find(
    (b) => b.id === selectedDerivedBulkheadId,
  )

  const offset = hull.chines[selectedChine]?.offsets[selectedFrame]

  return (
    <div className="mode-layout model-layout">
      <aside className="side-panel">
        <section>
          <h2>Frames ({hull.frames.length}/{MAX_FRAMES})</h2>
          <div className="btn-row">
            <button
              type="button"
              onClick={addFrame}
              disabled={hull.frames.length >= MAX_FRAMES}
            >
              Add frame
            </button>
            <button
              type="button"
              onClick={() => removeFrame(selectedFrame)}
              disabled={hull.frames.length <= 2}
            >
              Remove
            </button>
          </div>
          <ul className="select-list">
            {hull.frames.map((f, i) => (
              <li key={f.id}>
                <button
                  type="button"
                  className={i === selectedFrame ? 'active' : ''}
                  onClick={() => setSelectedFrame(i)}
                >
                  F{i + 1} · x={f.x.toFixed(2)}
                  {f.bulkhead ? ' · BH' : ''}
                </button>
              </li>
            ))}
          </ul>
          {hull.frames[selectedFrame] && (
            <div className="field-grid">
              <label>
                Station X
                <input
                  type="number"
                  step="0.1"
                  value={hull.frames[selectedFrame].x}
                  onChange={(e) =>
                    setFrameX(selectedFrame, parseFloat(e.target.value) || 0)
                  }
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={hull.frames[selectedFrame].bulkhead}
                  onChange={(e) =>
                    setFrameBulkhead(selectedFrame, e.target.checked)
                  }
                />
                Also cut BH at this station
              </label>
            </div>
          )}
        </section>

        <section>
          <h2>Derived bulkheads ({derivedBulkheads?.length ?? 0})</h2>
          <p className="hint">
            Construction sections — cut from the faired shape, not control stations.
          </p>
          <div className="btn-row">
            <button type="button" onClick={addDerivedBulkhead}>
              Add bulkhead
            </button>
            <button
              type="button"
              onClick={() =>
                selectedDerivedBulkheadId &&
                removeDerivedBulkhead(selectedDerivedBulkheadId)
              }
              disabled={!selectedDerivedBulkheadId}
            >
              Remove
            </button>
          </div>
          <ul className="select-list">
            {(derivedBulkheads ?? []).map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className={
                    selectedDerivedBulkheadId === b.id ? 'active' : ''
                  }
                  onClick={() => setSelectedDerivedBulkheadId(b.id)}
                >
                  {b.name}
                  <span className="meta">x={b.x.toFixed(2)}</span>
                </button>
              </li>
            ))}
          </ul>
          {selectedDerived && (
            <div className="field-grid">
              <label>
                Name
                <input
                  type="text"
                  value={selectedDerived.name}
                  onChange={(e) =>
                    setDerivedBulkheadName(
                      selectedDerived.id,
                      e.target.value,
                    )
                  }
                />
              </label>
              <label>
                Station X
                <input
                  type="number"
                  step="0.1"
                  value={selectedDerived.x}
                  onChange={(e) =>
                    setDerivedBulkheadX(
                      selectedDerived.id,
                      parseFloat(e.target.value) || 0,
                    )
                  }
                />
              </label>
            </div>
          )}
        </section>

        <section>
          <h2>Chines ({hull.chines.length}/{MAX_CHINES})</h2>
          <div className="btn-row">
            <button
              type="button"
              onClick={addChine}
              disabled={hull.chines.length >= MAX_CHINES}
            >
              Add chine
            </button>
            <button
              type="button"
              onClick={() => removeChine(selectedChine)}
              disabled={hull.chines.length <= 2}
            >
              Remove
            </button>
          </div>
          <ul className="select-list">
            {hull.chines.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={i === selectedChine ? 'active' : ''}
                  onClick={() => setSelectedChine(i)}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
          {hull.chines[selectedChine] && (
            <div className="field-grid">
              <label>
                Name
                <input
                  type="text"
                  value={hull.chines[selectedChine].name}
                  onChange={(e) => setChineName(selectedChine, e.target.value)}
                />
              </label>
            </div>
          )}
        </section>

        <section>
          <h2>Longitudinal fairing</h2>
          <div className="field-grid">
            <label>
              Fore–aft bend (
              {Math.round(
                (hull.longitudinalFairing ?? hull.sectionFairing ?? 0) * 100,
              )}
              %)
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={hull.longitudinalFairing ?? hull.sectionFairing ?? 0}
                onChange={(e) =>
                  setLongitudinalFairing(parseFloat(e.target.value))
                }
              />
            </label>
            <p className="hint">
              Bends each chine smoothly between stations (plywood bend
              fore–aft).
            </p>
          </div>
        </section>

        <section>
          <h2>Section bend</h2>
          <div className="field-grid">
            <label>
              Transverse fairing (
              {Math.round((hull.transverseFairing ?? 0) * 100)}%)
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={hull.transverseFairing ?? 0}
                onChange={(e) =>
                  setTransverseFairing(parseFloat(e.target.value))
                }
              />
            </label>
            <p className="hint">
              0% = hard chines (flat plates between frames). Higher values
              round each section through the chines.
            </p>
          </div>
        </section>

        <section>
          <h2>Deck</h2>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={hull.closedTop}
              onChange={(e) => setClosedTop(e.target.checked)}
            />
            Closed top (board / SUP)
          </label>
          {hull.closedTop && (
            <div className="field-grid" style={{ marginTop: '0.45rem' }}>
              <label>
                Deck CL height @ F{selectedFrame + 1}
                <input
                  type="number"
                  step="0.02"
                  value={hull.deckHeights[selectedFrame] ?? 0}
                  onChange={(e) =>
                    setDeckHeight(
                      selectedFrame,
                      parseFloat(e.target.value) || 0,
                    )
                  }
                  onFocus={() => setSelectedDeck(true)}
                />
              </label>
              <p className="hint">
                Closes sheer→centerline. Drag deck points in body plan or profile.
              </p>
            </div>
          )}
        </section>

        <section>
          <h2>Selected offset</h2>
          <p className="hint">
            {hull.chines[selectedChine]?.name} @ frame {selectedFrame + 1}
          </p>
          {offset && (
            <div className="field-grid">
              <label>
                Half-breadth Y
                <input
                  type="number"
                  step="0.05"
                  value={offset.y}
                  onChange={(e) =>
                    setOffset(selectedChine, selectedFrame, {
                      y: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label>
                Height Z
                <input
                  type="number"
                  step="0.05"
                  value={offset.z}
                  onChange={(e) =>
                    setOffset(selectedChine, selectedFrame, {
                      z: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </label>
            </div>
          )}
        </section>

        <section>
          <h2>Offset table</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Chine</th>
                  {hull.frames.map((f, i) => (
                    <th key={f.id}>F{i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hull.chines.map((c, ci) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    {c.offsets.map((o, fi) => (
                      <td
                        key={fi}
                        className={
                          ci === selectedChine && fi === selectedFrame
                            ? 'cell-active'
                            : ''
                        }
                      >
                        <button
                          type="button"
                          className="cell-btn"
                          onClick={() => {
                            setSelectedChine(ci)
                            setSelectedFrame(fi)
                          }}
                        >
                          {o.y.toFixed(2)}/{o.z.toFixed(2)}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {warnings.length > 0 && (
          <section className="warnings">
            <h2>Developability</h2>
            <ul>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>
        )}
      </aside>

      <div className="model-workspace">
        <div className="viewport">
          <HullViewer
            hull={hull}
            highlightFrame={selectedFrame}
            selectedChine={selectedChine}
            editable
            onSelectFrame={setSelectedFrame}
            onSelectChine={setSelectedChine}
            onOffsetChange={(ci, fi, y, z) => setOffset(ci, fi, { y, z })}
            onDeckHeightChange={setDeckHeight}
            onSelectDeck={() => setSelectedDeck(true)}
          />
          <p className="viewport-hint">
            Drag spheres on the selected frame · enable Closed top for a decked board
          </p>
        </div>
        <div className="frame-editors">
          <FrameBodyPlan
            hull={hull}
            frameIndex={selectedFrame}
            selectedChine={selectedChine}
            selectedDeck={selectedDeck}
            onSelectChine={setSelectedChine}
            onSelectDeck={() => setSelectedDeck(true)}
            onOffsetChange={(ci, y, z) =>
              setOffset(ci, selectedFrame, { y, z })
            }
            onDeckHeightChange={(z) => setDeckHeight(selectedFrame, z)}
          />
          <FrameProfile
            hull={hull}
            selectedFrame={selectedFrame}
            selectedChine={selectedChine}
            selectedDeck={selectedDeck}
            selectedDerivedBulkheadId={selectedDerivedBulkheadId}
            onSelectFrame={setSelectedFrame}
            onSelectChine={setSelectedChine}
            onSelectDeck={() => setSelectedDeck(true)}
            onSelectDerivedBulkhead={setSelectedDerivedBulkheadId}
            onFrameXChange={setFrameX}
            onHeightChange={(ci, fi, z) => setOffset(ci, fi, { z })}
            onDeckHeightChange={setDeckHeight}
            onDerivedBulkheadXChange={setDerivedBulkheadX}
          />
        </div>
      </div>
    </div>
  )
}
