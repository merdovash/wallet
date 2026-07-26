import { create } from 'zustand'
import { ACCOUNT_COLORS, DEFAULT_SETTINGS } from '../types/wallet'
import type {
  Account,
  BalanceSnapshot,
  SnapshotLine,
  Transfer,
  WalletSettings,
} from '../types/wallet'
import {
  createAccountApi,
  createTransferApi,
  deleteAccountApi,
  deleteSnapshotApi,
  deleteTransferApi,
  fetchWallet,
  importWalletApi,
  patchSettings,
  reorderAccountsApi,
  updateAccountApi,
  updateSnapshotApi,
  upsertSnapshotApi,
  withFallbackRates,
} from '../lib/walletApi'

const LEGACY_STORAGE_KEY = 'wallet-storage'

interface WalletState {
  settings: WalletSettings
  accounts: Account[]
  snapshots: BalanceSnapshot[]
  transfers: Transfer[]
  loaded: boolean
  loading: boolean
  error: string | null
  loadAll: () => Promise<void>
  clear: () => void
  setSettings: (patch: Partial<WalletSettings>) => Promise<void>
  addAccount: (
    input: Omit<Account, 'id' | 'archived' | 'sortOrder'> & {
      sortOrder?: number
      creditLimit?: number
      linkedAccountId?: string
    },
  ) => Promise<string>
  updateAccount: (
    id: string,
    patch: Partial<Omit<Account, 'id'>> & {
      creditLimit?: number | null
      linkedAccountId?: string | null
    },
  ) => Promise<void>
  reorderAccounts: (orderedIds: string[]) => Promise<void>
  archiveAccount: (id: string, archived?: boolean) => Promise<void>
  deleteAccount: (id: string) => Promise<void>
  addSnapshot: (input: { date: string; note?: string; lines: SnapshotLine[] }) => Promise<string>
  updateSnapshot: (
    id: string,
    patch: Partial<Omit<BalanceSnapshot, 'id'>>,
  ) => Promise<void>
  deleteSnapshot: (id: string) => Promise<void>
  addTransfer: (input: Omit<Transfer, 'id'>) => Promise<string>
  deleteTransfer: (id: string) => Promise<void>
}

function nextColor(accounts: Account[]): string {
  const used = new Set(accounts.map((a) => a.color))
  const free = ACCOUNT_COLORS.find((c) => !used.has(c))
  return free ?? ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length]!
}

function normalizeAccount(account: Account): Account {
  return {
    ...account,
    kind: account.kind === 'credit' ? 'credit' : 'regular',
  }
}

function readLegacyLocalStorage(): {
  settings?: { baseCurrency?: string }
  accounts: Account[]
  snapshots: BalanceSnapshot[]
  transfers: Transfer[]
} | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      state?: {
        settings?: WalletSettings
        accounts?: Account[]
        snapshots?: BalanceSnapshot[]
        transfers?: Transfer[]
      }
    }
    const state = parsed.state
    if (!state) return null
    const accounts = state.accounts ?? []
    const snapshots = state.snapshots ?? []
    const transfers = state.transfers ?? []
    if (accounts.length === 0 && snapshots.length === 0 && transfers.length === 0) {
      return null
    }
    return {
      settings: state.settings,
      accounts,
      snapshots,
      transfers,
    }
  } catch {
    return null
  }
}

function clearLegacyLocalStorage(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export const useWalletStore = create<WalletState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS, exchangeRates: { ...DEFAULT_SETTINGS.exchangeRates } },
  accounts: [],
  snapshots: [],
  transfers: [],
  loaded: false,
  loading: false,
  error: null,

  clear: () =>
    set({
      settings: { ...DEFAULT_SETTINGS, exchangeRates: { ...DEFAULT_SETTINGS.exchangeRates } },
      accounts: [],
      snapshots: [],
      transfers: [],
      loaded: false,
      loading: false,
      error: null,
    }),

  loadAll: async () => {
    set({ loading: true, error: null })
    try {
      let bundle = await fetchWallet()
      const empty =
        bundle.accounts.length === 0 &&
        bundle.snapshots.length === 0 &&
        bundle.transfers.length === 0
      if (empty) {
        const legacy = readLegacyLocalStorage()
        if (legacy) {
          try {
            bundle = await importWalletApi(legacy)
            clearLegacyLocalStorage()
          } catch {
            /* keep empty server state if import fails (e.g. already imported) */
          }
        }
      }
      set({
        settings: withFallbackRates(bundle.settings.baseCurrency),
        accounts: bundle.accounts.map(normalizeAccount),
        snapshots: bundle.snapshots,
        transfers: bundle.transfers,
        loaded: true,
        loading: false,
      })
    } catch (err) {
      set({
        loading: false,
        loaded: false,
        error: err instanceof Error ? err.message : 'Не удалось загрузить данные',
      })
    }
  },

  setSettings: async (patch) => {
    if (patch.baseCurrency) {
      const settings = await patchSettings(patch.baseCurrency)
      set({ settings })
    }
  },

  addAccount: async (input) => {
    const account = await createAccountApi({
      name: input.name,
      currency: input.currency,
      color: input.color || nextColor(get().accounts),
      sortOrder: input.sortOrder,
      kind: input.kind ?? 'regular',
      creditLimit: input.creditLimit,
      linkedAccountId: input.linkedAccountId,
    })
    set((state) => ({ accounts: [...state.accounts, account] }))
    return account.id
  },

  updateAccount: async (id, patch) => {
    const account = await updateAccountApi(id, patch)
    set((state) => ({
      accounts: state.accounts.map((a) => (a.id === id ? account : a)),
    }))
  },

  reorderAccounts: async (orderedIds) => {
    const accounts = await reorderAccountsApi(orderedIds)
    set({ accounts })
  },

  archiveAccount: async (id, archived = true) => {
    const account = await updateAccountApi(id, { archived })
    set((state) => ({
      accounts: state.accounts.map((a) => (a.id === id ? account : a)),
    }))
  },

  deleteAccount: async (id) => {
    await deleteAccountApi(id)
    set((state) => ({
      accounts: state.accounts.filter((a) => a.id !== id),
      snapshots: state.snapshots.map((s) => ({
        ...s,
        lines: s.lines.filter((l) => l.accountId !== id),
      })),
      transfers: state.transfers.filter(
        (t) => t.fromAccountId !== id && t.toAccountId !== id,
      ),
    }))
  },

  addSnapshot: async (input) => {
    const snapshot = await upsertSnapshotApi(input)
    set((state) => {
      const others = state.snapshots.filter(
        (s) => s.id !== snapshot.id && s.date !== snapshot.date,
      )
      return { snapshots: [...others, snapshot] }
    })
    return snapshot.id
  },

  updateSnapshot: async (id, patch) => {
    const snapshot = await updateSnapshotApi(id, {
      date: patch.date,
      note: patch.note,
      lines: patch.lines,
    })
    set((state) => ({
      snapshots: state.snapshots.map((s) => (s.id === id ? snapshot : s)),
    }))
  },

  deleteSnapshot: async (id) => {
    await deleteSnapshotApi(id)
    set((state) => ({
      snapshots: state.snapshots.filter((s) => s.id !== id),
    }))
  },

  addTransfer: async (input) => {
    const transfer = await createTransferApi(input)
    set((state) => ({ transfers: [...state.transfers, transfer] }))
    return transfer.id
  },

  deleteTransfer: async (id) => {
    await deleteTransferApi(id)
    set((state) => ({
      transfers: state.transfers.filter((t) => t.id !== id),
    }))
  },
}))
