import { useEffect, useState } from 'react'
import {
  fabBottomAboveKeyboard,
  isKeyboardTarget,
  visualViewportBottomOverlap,
} from './fabKeyboardBottom'

const MOBILE_MQ = '(max-width: 767px)'
const BLUR_GRACE_MS = 50

/**
 * `bottom` CSS value that keeps the mobile FAB visible above the on-screen keyboard.
 * `undefined` = use the stylesheet offset (tab bar + safe area).
 */
export function useFabKeyboardBottom(): string | undefined {
  const [bottom, setBottom] = useState<string | undefined>(undefined)

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ)
    let blurTimer = 0
    let raf = 0

    function read() {
      if (!mq.matches) {
        setBottom(undefined)
        return
      }
      const vv = window.visualViewport
      const overlap = visualViewportBottomOverlap(
        window.innerHeight,
        vv ? { height: vv.height, offsetTop: vv.offsetTop } : null,
      )
      const px = fabBottomAboveKeyboard(overlap, isKeyboardTarget(document.activeElement))
      setBottom(px == null ? undefined : `${px}px`)
    }

    function schedule() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(read)
    }

    function onFocusIn() {
      window.clearTimeout(blurTimer)
      schedule()
    }

    function onFocusOut() {
      window.clearTimeout(blurTimer)
      blurTimer = window.setTimeout(schedule, BLUR_GRACE_MS)
    }

    read()
    mq.addEventListener('change', schedule)
    window.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('scroll', schedule)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(blurTimer)
      mq.removeEventListener('change', schedule)
      window.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('scroll', schedule)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  return bottom
}
