import { useEffect, useRef, useState } from 'react'
import { useHullStore } from '../store/hullStore'
import { SAMPLE_HULLS, createSkiff } from '../core/samples'
import { downloadHull } from '../core/io/json'
import { downloadHullSvg, type HullSvgView } from '../core/io/svg'
import { downloadHullStl } from '../core/io/stl'
import {
  fetchLibraryHull,
  fetchLibraryIndex,
  libraryDisplayName,
  parseHullText,
} from '../core/io/library'
import type { AppMode } from '../core/types'
import { ScaleDialog } from './ScaleDialog'

const MODES: { id: AppMode; label: string }[] = [
  { id: 'model', label: 'Model' },
  { id: 'hydro', label: 'Hydro' },
  { id: 'patterns', label: 'Patterns' },
]

export function Toolbar() {
  const mode = useHullStore((s) => s.mode)
  const setMode = useHullStore((s) => s.setMode)
  const hull = useHullStore((s) => s.hull)
  const setHull = useHullStore((s) => s.setHull)
  const setName = useHullStore((s) => s.setName)
  const setUnits = useHullStore((s) => s.setUnits)
  const fileRef = useRef<HTMLInputElement>(null)
  const [scaleOpen, setScaleOpen] = useState(false)
  const [library, setLibrary] = useState<string[]>([])
  const [libraryError, setLibraryError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchLibraryIndex()
      .then((files) => {
        if (!cancelled) {
          setLibrary(files)
          setLibraryError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLibrary([])
          setLibraryError(
            err instanceof Error ? err.message : 'Library unavailable',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <header className="toolbar">
        <div className="brand">
          <span className="brand-mark">Hull Designer</span>
          <input
            className="hull-name"
            value={hull.name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Hull name"
          />
        </div>

        <nav className="mode-tabs" aria-label="Mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={mode === m.id ? 'active' : ''}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </nav>

        <div className="toolbar-actions">
          <select
            aria-label="Units"
            value={hull.units}
            onChange={(e) => setUnits(e.target.value as 'ft' | 'm')}
          >
            <option value="ft">Feet</option>
            <option value="m">Meters</option>
          </select>

          <select
            aria-label="Load sample"
            defaultValue=""
            onChange={(e) => {
              const key = e.target.value
              if (key && SAMPLE_HULLS[key]) setHull(SAMPLE_HULLS[key]())
              e.target.value = ''
            }}
          >
            <option value="" disabled>
              Samples…
            </option>
            <option value="skiff">Flat-bottom Skiff</option>
            <option value="dinghy">Multi-chine Dinghy</option>
            <option value="sup">SUP Board</option>
            <option value="k2">KT Super K2 95L</option>
          </select>

          <select
            className="library-select"
            aria-label="Load from hull library"
            defaultValue=""
            disabled={library.length === 0}
            title={libraryError ?? 'Carlson .HUL library'}
            onChange={async (e) => {
              const file = e.target.value
              e.target.value = ''
              if (!file) return
              try {
                setHull(await fetchLibraryHull(file))
              } catch (err) {
                alert(
                  err instanceof Error ? err.message : 'Failed to load hull',
                )
              }
            }}
          >
            <option value="" disabled>
              {library.length === 0 ? 'Library…' : `Library (${library.length})…`}
            </option>
            {library.map((file) => (
              <option key={file} value={file}>
                {libraryDisplayName(file)}
              </option>
            ))}
          </select>

          <button type="button" onClick={() => setHull(createSkiff())}>
            New
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            Open
          </button>
          <button type="button" onClick={() => downloadHull(hull)}>
            Save
          </button>
          <select
            aria-label="Export SVG"
            defaultValue=""
            onChange={(e) => {
              const view = e.target.value as HullSvgView | ''
              e.target.value = ''
              if (view) downloadHullSvg(hull, { view })
            }}
          >
            <option value="" disabled>
              Export SVG…
            </option>
            <option value="isometric">Isometric</option>
            <option value="profile">Profile</option>
            <option value="plan">Plan</option>
          </select>
          <button type="button" onClick={() => downloadHullStl(hull)}>
            STL
          </button>
          <button type="button" onClick={() => setScaleOpen(true)}>
            Scale…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.hull.json,.hul,.HUL,application/json,text/plain"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                const text = await file.text()
                setHull(parseHullText(text, file.name))
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Failed to open hull')
              }
              e.target.value = ''
            }}
          />
        </div>
      </header>

      <ScaleDialog
        hull={hull}
        open={scaleOpen}
        onClose={() => setScaleOpen(false)}
        onApply={setHull}
      />
    </>
  )
}
