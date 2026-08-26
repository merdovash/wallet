import { create } from 'zustand'

export interface PrimaryActionOverride {
  id: string
  label: string
  onClick: () => void
  disabled?: boolean
  title?: string
  /**
   * section — заменяет основное действие страницы (напр. «Добавить счёт»).
   * panel — только «Сохранить» в шапке StackPanel (не в toolbar/FAB).
   */
  scope?: 'section' | 'panel'
}

interface PrimaryActionState {
  override: PrimaryActionOverride | null
  setOverride: (action: PrimaryActionOverride | null) => void
}

/** Переопределение FAB / primary (например «Сохранить» или «Добавить счёт»). */
export const usePrimaryActionStore = create<PrimaryActionState>((set) => ({
  override: null,
  setOverride: (override) => set({ override }),
}))
