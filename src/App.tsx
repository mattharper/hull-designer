import { Toolbar } from './components/Toolbar'
import { ModelPanel } from './components/ModelPanel'
import { HydroPanel } from './components/HydroPanel'
import { PatternsPanel } from './components/PatternsPanel'
import { useHullStore } from './store/hullStore'
import './App.css'

export default function App() {
  const mode = useHullStore((s) => s.mode)

  return (
    <div className="app">
      <Toolbar />
      <main className="main">
        {mode === 'model' && <ModelPanel />}
        {mode === 'hydro' && <HydroPanel />}
        {mode === 'patterns' && <PatternsPanel />}
      </main>
    </div>
  )
}
