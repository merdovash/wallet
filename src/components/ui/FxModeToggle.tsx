import type { GrowthFxMode } from '../../engine/growthEngine'
import { useFxModeStore } from '../../store/fxModeStore'

interface FxModeToggleProps {
  className?: string
  /** Optional compact label above the control. */
  showLabel?: boolean
}

export function FxModeToggle({ className = '', showLabel = true }: FxModeToggleProps) {
  const fxMode = useFxModeStore((s) => s.fxMode)
  const setFxMode = useFxModeStore((s) => s.setFxMode)

  return (
    <div className={`space-y-1 ${className}`}>
      {showLabel ? (
        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Курс</p>
      ) : null}
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setFxMode('withFx')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            fxMode === 'withFx'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          С учётом курса
        </button>
        <button
          type="button"
          onClick={() => setFxMode('withoutFx')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            fxMode === 'withoutFx'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          Без учёта курса
        </button>
      </div>
    </div>
  )
}

export function fxModeLabel(mode: GrowthFxMode): string {
  return mode === 'withoutFx' ? 'без учёта курса' : 'с учётом курса'
}
