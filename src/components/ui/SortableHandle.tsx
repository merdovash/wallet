import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { dataQa } from '../../lib/dataQa'

export function SortableHandle({
  label,
  dataQa: qa,
  dragging = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  label: string
  dataQa?: string
  dragging?: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title="Перетащить"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={`flex h-11 w-10 shrink-0 touch-none items-center justify-center rounded-xl border text-slate-400 transition select-none dark:text-slate-500 ${
        dragging
          ? 'cursor-grabbing border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
          : 'cursor-grab border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300'
      }`}
      {...(qa ? dataQa(qa) : {})}
    >
      <GripIcon />
    </button>
  )
}

function GripIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden>
      <circle cx="5" cy="3.5" r="1.35" />
      <circle cx="11" cy="3.5" r="1.35" />
      <circle cx="5" cy="8" r="1.35" />
      <circle cx="11" cy="8" r="1.35" />
      <circle cx="5" cy="12.5" r="1.35" />
      <circle cx="11" cy="12.5" r="1.35" />
    </svg>
  )
}

export function sortableRowClass(dragging: boolean): string {
  return dragging
    ? 'relative z-10 rounded-xl bg-white shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700'
    : ''
}

export function SortableHint(): ReactNode {
  return (
    <p className="px-1 text-xs text-slate-500 dark:text-slate-400">
      Перетащите за шесть точек, чтобы поменять порядок.
    </p>
  )
}
