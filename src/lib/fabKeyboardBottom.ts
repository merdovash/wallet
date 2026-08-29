/** Gap between the FAB and the top of the on-screen keyboard. */
export const FAB_KEYBOARD_GAP_PX = 12

/**
 * Ignore small visual-viewport shrinks (URL bar, toolbars).
 * A real keyboard is typically 200px+.
 */
export const FAB_KEYBOARD_OPEN_THRESHOLD_PX = 64

export type VisualViewportBox = {
  height: number
  offsetTop: number
}

/** How many CSS pixels of the layout viewport sit below the visual viewport. */
export function visualViewportBottomOverlap(
  layoutInnerHeight: number,
  viewport: VisualViewportBox | null | undefined,
): number {
  if (!viewport) return 0
  return Math.max(0, Math.round(layoutInnerHeight - viewport.height - viewport.offsetTop))
}

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'radio',
  'file',
  'submit',
  'reset',
  'range',
  'color',
  'hidden',
  'image',
])

/** Fields that typically open the on-screen keyboard or a bottom picker. */
export function isKeyboardTarget(el: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag !== 'INPUT') return false
  return !NON_TEXT_INPUT_TYPES.has((el as HTMLInputElement).type)
}

/**
 * Pixel `bottom` for a `position: fixed` FAB when the keyboard overlays the layout.
 * `null` = keep the CSS default (above the tab bar).
 *
 * When the layout viewport itself shrinks (Android Chrome), overlap is ~0 and
 * `fixed; bottom: 4.75rem` already sits above the keyboard — do not add extra offset.
 */
export function fabBottomAboveKeyboard(
  overlapPx: number,
  keyboardLikelyOpen: boolean,
  gapPx = FAB_KEYBOARD_GAP_PX,
  thresholdPx = FAB_KEYBOARD_OPEN_THRESHOLD_PX,
): number | null {
  if (!keyboardLikelyOpen || overlapPx < thresholdPx) return null
  return overlapPx + gapPx
}
