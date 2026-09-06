import { create } from 'zustand'

export interface CheckInPrefillTransfer {
  fromAccountId: string
  toAccountId: string
  amount: string
  toAmount: string
  note: string
}

export interface CheckInPrefill {
  date: string
  amounts: Record<string, string>
  pendingTransfers: CheckInPrefillTransfer[]
}

interface CheckInUiState {
  open: boolean
  snapshotId: string | null
  prefill: CheckInPrefill | null
  openCreate: (prefill?: CheckInPrefill | null) => void
  openEdit: (snapshotId: string) => void
  close: () => void
}

/** Глобальное открытие панели чек-ина (FAB, дашборд, список). */
export const useCheckInUiStore = create<CheckInUiState>((set) => ({
  open: false,
  snapshotId: null,
  prefill: null,
  openCreate: (prefill = null) => set({ open: true, snapshotId: null, prefill }),
  openEdit: (snapshotId) => set({ open: true, snapshotId, prefill: null }),
  close: () => set({ open: false, snapshotId: null, prefill: null }),
}))
