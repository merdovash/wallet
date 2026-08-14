import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface StackPanelProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Extra controls in the header, shown before «Закрыть» (e.g. Save). */
  headerActions?: ReactNode
}

const DISMISS_DRAG_PX = 72

/** Нижняя стековая панель (sheet) поверх контента. */
export function StackPanel({ open, title, onClose, children, headerActions }: StackPanelProps) {
  const openedAtRef = useRef(0)
  const dragStartYRef = useRef<number | null>(null)
  const dragOffsetRef = useRef(0)
  const [dragOffset, setDragOffset] = useState(0)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!open) return
    openedAtRef.current = Date.now()
    dragOffsetRef.current = 0
    setDragOffset(0)
    setDragging(false)
    dragStartYRef.current = null
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

  useEffect(() => {
    if (!dragging) return

    function onPointerMove(e: PointerEvent) {
      if (dragStartYRef.current == null) return
      const next = Math.max(0, e.clientY - dragStartYRef.current)
      dragOffsetRef.current = next
      setDragOffset(next)
    }

    function onPointerEnd() {
      endDrag()
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerEnd)
    document.addEventListener('pointercancel', onPointerEnd)
    return () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerEnd)
      document.removeEventListener('pointercancel', onPointerEnd)
    }
  }, [dragging, onClose])

  if (!open) return null

  function handleBackdropClick() {
    if (Date.now() - openedAtRef.current < 400) return
    onClose()
  }

  function beginDrag(clientY: number) {
    dragStartYRef.current = clientY
    setDragging(true)
  }

  function endDrag() {
    if (dragStartYRef.current == null) return
    const shouldClose = dragOffsetRef.current >= DISMISS_DRAG_PX
    dragStartYRef.current = null
    dragOffsetRef.current = 0
    setDragging(false)
    setDragOffset(0)
    if (shouldClose) onClose()
  }

  function onDragHandlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    e.preventDefault()
    beginDrag(e.clientY)
  }

  const sheetStyle = {
    transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
    transition: dragging ? 'none' : 'transform 200ms ease-out',
    animation: dragOffset > 0 ? undefined : 'stack-panel-up 200ms ease-out',
  }

  return createPortal(
    <div className="fixed inset-0 isolate z-[100]">
      <div
        className="absolute inset-0 z-0 bg-slate-900/40"
        aria-hidden
        onClick={handleBackdropClick}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 z-10 flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-b-0 border-slate-200 bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        style={sheetStyle}
      >
        <div className="flex shrink-0 flex-col items-center border-b border-slate-100 dark:border-slate-800">
          <div
            className="mt-2 h-1 w-10 shrink-0 cursor-grab touch-none rounded-full bg-slate-300 active:cursor-grabbing"
            aria-hidden
            onPointerDown={onDragHandlePointerDown}
          />
          <div className="flex w-full items-center justify-between gap-3 px-4 py-3">
            <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-slate-900 dark:text-slate-200">
              {title}
            </h2>
            <div className="relative z-20 flex shrink-0 items-center gap-2">
              {headerActions}
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                onClick={onClose}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-4">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
