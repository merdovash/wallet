import { useEffect, useRef, type ReactNode } from 'react'

interface StackPanelProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Extra controls in the header, shown before «Закрыть» (e.g. Save). */
  headerActions?: ReactNode
}

/** Нижняя стековая панель (sheet) поверх контента. */
export function StackPanel({ open, title, onClose, children, headerActions }: StackPanelProps) {
  const openedAtRef = useRef(0)

  useEffect(() => {
    if (!open) return
    openedAtRef.current = Date.now()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  function handleBackdropClick() {
    if (Date.now() - openedAtRef.current < 400) return
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        aria-label="Закрыть"
        onClick={handleBackdropClick}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 z-10 flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-b-0 border-slate-200 bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-2xl"
        style={{ animation: 'stack-panel-up 200ms ease-out' }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-slate-900">{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              onClick={onClose}
            >
              Закрыть
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  )
}
