import { create } from 'zustand'

export interface PrimaryActionOverride {
  id: string
  label: string
  onClick: () => void
  disabled?: boolean
  title?: string
}

interface PrimaryActionState {
  override: PrimaryActionOverride | null
  setOverride: (action: PrimaryActionOverride | null) => void
}

/** Переопределение FAB (например «Сохранить» на панели редактирования). */
export const usePrimaryActionStore = create<PrimaryActionState>((set) => ({
  override: null,
  setOverride: (override) => set({ override }),
}))
