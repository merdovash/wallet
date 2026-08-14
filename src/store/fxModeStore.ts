import { create } from 'zustand'
import type { GrowthFxMode } from '../engine/growthEngine'

interface FxModeState {
  fxMode: GrowthFxMode
  setFxMode: (mode: GrowthFxMode) => void
}

/** In-memory only — shared across dashboard / types / monthly / daily while the SPA is open. */
export const useFxModeStore = create<FxModeState>((set) => ({
  fxMode: 'withFx',
  setFxMode: (fxMode) => set({ fxMode }),
}))
