import { useEffect, useRef } from 'react'

const ATTR = 'data-focus-key'

/**
 * Remember the last focused field inside a container and restore focus
 * (and usually the mobile keyboard) after the tab/app returns from background.
 */
export function useRestoreFocusOnResume(active: boolean) {
  const rootRef = useRef<HTMLDivElement>(null)
  const lastKeyRef = useRef<string | null>(null)
  const wasHiddenRef = useRef(false)

  useEffect(() => {
    if (!active) {
      lastKeyRef.current = null
      wasHiddenRef.current = false
      return
    }

    function rememberFocus(e: Event) {
      const target = e.target
      if (!(target instanceof HTMLElement)) return
      const key = target.getAttribute(ATTR)
      if (key) lastKeyRef.current = key
    }

    function restore() {
      const key = lastKeyRef.current
      const root = rootRef.current
      if (!key || !root) return

      const el = root.querySelector<HTMLElement>(`[${ATTR}="${key}"]`)
      if (!el || typeof el.focus !== 'function') return

      el.focus({ preventScroll: true })
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const len = el.value.length
        try {
          el.setSelectionRange(len, len)
        } catch {
          /* some input types reject selection */
        }
      }
    }

    function onVisibilityOrPage() {
      if (document.visibilityState === 'hidden') {
        wasHiddenRef.current = true
        return
      }
      if (!wasHiddenRef.current) return
      wasHiddenRef.current = false

      // Mobile browsers need a short delay after resume before focus sticks.
      window.setTimeout(restore, 0)
      window.setTimeout(restore, 120)
      window.setTimeout(restore, 320)
    }

    const root = rootRef.current
    root?.addEventListener('focusin', rememberFocus)
    document.addEventListener('visibilitychange', onVisibilityOrPage)
    window.addEventListener('pageshow', onVisibilityOrPage)

    return () => {
      root?.removeEventListener('focusin', rememberFocus)
      document.removeEventListener('visibilitychange', onVisibilityOrPage)
      window.removeEventListener('pageshow', onVisibilityOrPage)
    }
  }, [active])

  function focusKeyProps(key: string) {
    return { [ATTR]: key } as { 'data-focus-key': string }
  }

  return { rootRef, focusKeyProps }
}
