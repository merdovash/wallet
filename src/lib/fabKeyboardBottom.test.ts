import { describe, expect, it } from 'vitest'
import {
  FAB_KEYBOARD_GAP_PX,
  fabBottomAboveKeyboard,
  isKeyboardTarget,
  visualViewportBottomOverlap,
} from './fabKeyboardBottom'

describe('visualViewportBottomOverlap', () => {
  it('is 0 without a visual viewport', () => {
    expect(visualViewportBottomOverlap(800, null)).toBe(0)
    expect(visualViewportBottomOverlap(800, undefined)).toBe(0)
  })

  it('is 0 when layout and visual viewports match (Android resize / keyboard closed)', () => {
    expect(visualViewportBottomOverlap(800, { height: 800, offsetTop: 0 })).toBe(0)
  })

  it('equals the overlay below the visual viewport (iOS keyboard)', () => {
    expect(visualViewportBottomOverlap(800, { height: 500, offsetTop: 0 })).toBe(300)
  })

  it('accounts for visualViewport.offsetTop when the focused field scrolls', () => {
    expect(visualViewportBottomOverlap(800, { height: 500, offsetTop: 40 })).toBe(260)
  })
})

describe('fabBottomAboveKeyboard', () => {
  it('keeps the CSS default when the keyboard is not open', () => {
    expect(fabBottomAboveKeyboard(300, false)).toBeNull()
  })

  it('keeps the CSS default when the layout viewport already resized', () => {
    expect(fabBottomAboveKeyboard(0, true)).toBeNull()
  })

  it('ignores URL-bar-sized shrinks even if a field is focused', () => {
    expect(fabBottomAboveKeyboard(40, true)).toBeNull()
  })

  it('sits just above the keyboard when it overlays the layout', () => {
    expect(fabBottomAboveKeyboard(300, true)).toBe(300 + FAB_KEYBOARD_GAP_PX)
  })
})

describe('isKeyboardTarget', () => {
  it('is false without a DOM element', () => {
    expect(isKeyboardTarget(null)).toBe(false)
  })
})
