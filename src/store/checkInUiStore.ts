import { create } from 'zustand'

interface CheckInUiState {
  open: boolean
  snapshotId: string | null
  openCreate: () => void
  openEdit: (snapshotId: string) => void
  close: () => void
}

/** Глобальное открытие панели чек-ина (FAB, дашборд, список). */
export const useCheckInUiStore = create<CheckInUiState>((set) => ({
  open: false,
  snapshotId: null,
  openCreate: () => set({ open: true, snapshotId: null }),
  openEdit: (snapshotId) => set({ open: true, snapshotId }),
  close: () => set({ open: false, snapshotId: null }),
}))
