import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'

export interface MoneyFieldController {
  isFormulaMode: () => boolean
  /** Apply the formula. False leaves the field in formula mode. */
  commit: () => boolean
  element: () => HTMLElement | null
}

const fields = new Set<MoneyFieldController>()
const listeners = new Set<() => void>()
let submitListenerInstalled = false

function emit() {
  for (const listener of listeners) listener()
}

export function subscribeFormulaMode(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function formulaModeActive(): boolean {
  for (const field of fields) {
    if (field.isFormulaMode()) return true
  }
  return false
}

export function notifyFormulaMode(): void {
  emit()
}

export function registerMoneyField(field: MoneyFieldController): () => void {
  ensureSubmitListener()
  fields.add(field)
  return () => {
    fields.delete(field)
    emit()
  }
}

export function useFormulaModeActive(): boolean {
  return useSyncExternalStore(subscribeFormulaMode, formulaModeActive, () => false)
}

function triggerShake(el: HTMLElement) {
  el.classList.remove('money-field-shake')
  void el.offsetWidth
  el.classList.add('money-field-shake')
}

function isClippedByScrollParent(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  const margin = 8
  if (
    rect.top < margin ||
    rect.left < margin ||
    rect.bottom > window.innerHeight - margin ||
    rect.right > window.innerWidth - margin
  ) {
    return true
  }
  let parent = el.parentElement
  while (parent) {
    if (parent !== document.body && parent !== document.documentElement) {
      const style = getComputedStyle(parent)
      if (/(auto|scroll|hidden)/.test(style.overflowY) || /(auto|scroll|hidden)/.test(style.overflowX)) {
        const bounds = parent.getBoundingClientRect()
        if (rect.top < bounds.top + margin || rect.bottom > bounds.bottom - margin) return true
      }
    }
    parent = parent.parentElement
  }
  return false
}

export function revealInvalidMoneyField(el: HTMLElement | null, focus: boolean) {
  if (!el) return
  triggerShake(el)
  if (isClippedByScrollParent(el)) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
  }
  if (!focus) return
  const input = el.querySelector('input')
  if (input instanceof HTMLInputElement) input.focus({ preventScroll: true })
}

/**
 * Evaluate every money field that is in formula mode.
 * Invalid fields get a red state from the field itself, then shake and scroll.
 * Returns false when save must be aborted.
 */
export function commitOpenMoneyFormulas(): boolean {
  const pending = [...fields].filter((field) => field.isFormulaMode())
  if (pending.length === 0) return true
  const failed: MoneyFieldController[] = []
  flushSync(() => {
    for (const field of pending) {
      if (!field.commit()) failed.push(field)
    }
  })
  if (failed.length === 0) return true
  for (const field of failed) revealInvalidMoneyField(field.element(), false)
  revealInvalidMoneyField(failed[0]?.element() ?? null, true)
  return false
}

function ensureSubmitListener() {
  if (submitListenerInstalled || typeof document === 'undefined') return
  submitListenerInstalled = true
  document.addEventListener(
    'submit',
    (event) => {
      if (commitOpenMoneyFormulas()) return
      event.preventDefault()
      event.stopPropagation()
    },
    true,
  )
}
