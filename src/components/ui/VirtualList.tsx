import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

interface VirtualListProps<T> {
  items: T[]
  /** Fixed row height in px (includes margin if any). */
  itemHeight: number
  /** Max height of the scroll viewport. */
  height: number
  overscan?: number
  className?: string
  /** Stable key for each item. */
  getKey: (item: T, index: number) => string
  renderItem: (item: T, index: number) => ReactNode
}

/**
 * Lightweight fixed-row virtual list (no extra dependency).
 */
export function VirtualList<T>({
  items,
  itemHeight,
  height,
  overscan = 4,
  className = '',
  getKey,
  renderItem,
}: VirtualListProps<T>) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)

  const onScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    setScrollTop(el.scrollTop)
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    setScrollTop(el.scrollTop)
  }, [items.length, itemHeight, height])

  const totalHeight = items.length * itemHeight
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  const visibleCount = Math.ceil(height / itemHeight) + overscan * 2
  const endIndex = Math.min(items.length, startIndex + visibleCount)
  const offsetY = startIndex * itemHeight

  const slice = items.slice(startIndex, endIndex)

  return (
    <div
      ref={scrollerRef}
      onScroll={onScroll}
      className={`overflow-y-auto overscroll-contain ${className}`}
      style={{ height, WebkitOverflowScrolling: 'touch' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` } satisfies CSSProperties}>
          {slice.map((item, i) => {
            const index = startIndex + i
            return (
              <div key={getKey(item, index)} style={{ height: itemHeight }}>
                {renderItem(item, index)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
