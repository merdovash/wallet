import type { GrowthFxMode } from '../../engine/growthEngine'
import { useFxModeStore } from '../../store/fxModeStore'

interface FxModeToggleProps {
  className?: string
  /** Optional compact label above the control. */
  showLabel?: boolean
  /** Shorter button labels for tight toolbars (e.g. dashboard mobile). */
  compact?: boolean
}

export function FxModeToggle({
  className = '',
  showLabel = true,
  compact = false,
}: FxModeToggleProps) {
  const fxMode = useFxModeStore((s) => s.fxMode)
  const setFxMode = useFxModeStore((s) => s.setFxMode)

  const withLabel = compact ? 'С курсом' : 'С учётом курса'
  const withoutLabel = compact ? 'Без курса' : 'Без учёта курса'
  const btnClass = compact
    ? 'rounded-md px-2 py-0.5 text-[11px] font-medium transition sm:px-2.5 sm:py-1 sm:text-xs'
    : 'rounded-md px-2.5 py-1 text-xs font-medium transition'

  return (
    <div className={`${showLabel ? 'space-y-1' : ''} ${className}`}>
      {showLabel ? (
        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Курс</p>
      ) : null}
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setFxMode('withFx')}
          className={`${btnClass} ${
            fxMode === 'withFx'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          {withLabel}
        </button>
        <button
          type="button"
          onClick={() => setFxMode('withoutFx')}
          className={`${btnClass} ${
            fxMode === 'withoutFx'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          {withoutLabel}
        </button>
      </div>
    </div>
  )
}

export function fxModeLabel(mode: GrowthFxMode): string {
  return mode === 'withoutFx' ? 'без учёта курса' : 'с учётом курса'
}
