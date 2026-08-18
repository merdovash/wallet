import { create } from 'zustand'
import type { DashboardPeriodKey } from '../lib/dashboardPeriod'

interface PeriodState {
  periodKey: DashboardPeriodKey
  setPeriodKey: (key: DashboardPeriodKey) => void
}

/** In-memory only — shared across dashboard and analytics while the SPA is open. */
export const usePeriodStore = create<PeriodState>((set) => ({
  periodKey: 'all',
  setPeriodKey: (periodKey) => set({ periodKey }),
}))
