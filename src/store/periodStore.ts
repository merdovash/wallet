import { create } from 'zustand'
import type { DashboardPeriodKey } from '../lib/dashboardPeriod'

interface PeriodState {
  periodKey: DashboardPeriodKey
  customStart: string
  customEnd: string
  setPeriodKey: (key: Exclude<DashboardPeriodKey, 'custom'>) => void
  setCustomRange: (start: string, end: string) => void
}

/** In-memory only — shared across dashboard and analytics while the SPA is open. */
export const usePeriodStore = create<PeriodState>((set) => ({
  periodKey: 'all',
  customStart: '',
  customEnd: '',
  setPeriodKey: (periodKey) => set({ periodKey }),
  setCustomRange: (customStart, customEnd) =>
    set({ periodKey: 'custom', customStart, customEnd }),
}))
