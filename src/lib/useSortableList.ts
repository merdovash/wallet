import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { idsEqual, moveId } from './reorderList'

export function useSortableList<T>({
  items,
  getId,
  onReorder,
}: {
  items: T[]
  getId: (item: T) => string
  onReorder: (orderedIds: string[]) => void
}) {
  const sourceIds = items.map(getId)
  const [draftIds, setDraftIds] = useState<string[] | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const nodes = useRef(new Map<string, HTMLElement>())
  const startIds = useRef(sourceIds)
  const draftIdsRef = useRef<string[] | null>(null)
  const draggingIdRef = useRef<string | null>(null)
  const pointerIdRef = useRef<number | null>(null)

  const orderedIds = draftIds ?? sourceIds
  const byId = new Map(items.map((item) => [getId(item), item] as const))
  const orderedItems = orderedIds
    .map((id) => byId.get(id))
    .filter((item): item is T => item != null)

  const setNode = useCallback((id: string, node: HTMLElement | null) => {
    if (node) nodes.current.set(id, node)
    else nodes.current.delete(id)
  }, [])

  function idFromY(clientY: number, ids: string[]): string | null {
    let closest: { id: string; dist: number } | null = null
    for (const id of ids) {
      const el = nodes.current.get(id)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (clientY >= rect.top && clientY <= rect.bottom) return id
      const mid = (rect.top + rect.bottom) / 2
      const dist = Math.abs(clientY - mid)
      if (!closest || dist < closest.dist) closest = { id, dist }
    }
    return closest?.id ?? null
  }

  function finish() {
    const next = draftIdsRef.current
    const original = startIds.current
    draggingIdRef.current = null
    pointerIdRef.current = null
    draftIdsRef.current = null
    setDraggingId(null)
    setDraftIds(null)
    if (next && !idsEqual(next, original)) onReorder(next)
  }

  function onHandlePointerDown(id: string, event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    pointerIdRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    startIds.current = sourceIds
    draggingIdRef.current = id
    draftIdsRef.current = sourceIds
    setDraftIds(sourceIds)
    setDraggingId(id)
  }

  function onHandlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (pointerIdRef.current !== event.pointerId || draggingIdRef.current == null) return
    event.preventDefault()
    const current = draftIdsRef.current ?? sourceIds
    const overId = idFromY(event.clientY, current)
    if (!overId) return
    const next = moveId(current, draggingIdRef.current, overId)
    if (idsEqual(next, current)) return
    draftIdsRef.current = next
    setDraftIds(next)
  }

  function onHandlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (pointerIdRef.current !== event.pointerId) return
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
    finish()
  }

  return {
    orderedItems,
    draggingId,
    setNode,
    handleProps: (id: string) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => onHandlePointerDown(id, event),
      onPointerMove: onHandlePointerMove,
      onPointerUp: onHandlePointerUp,
      onPointerCancel: onHandlePointerUp,
    }),
  }
}
