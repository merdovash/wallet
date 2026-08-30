import { create } from 'zustand'
import { ACCOUNT_COLORS, DEFAULT_SETTINGS } from '../types/wallet'
import type {
  Account,
  AccountFund,
  BalanceSnapshot,
  SnapshotLine,
  SnapshotOrigin,
  Transfer,
  WalletSettings,
} from '../types/wallet'
import { normalizeAccountKind } from '../lib/accountKinds'
import { buildTransferSnapshotLines } from '../lib/transferCheckIn'
import type { RateBook } from '../engine/growthEngine'
import {
  createAccountApi,
  createAccountFundApi,
  createTransferApi,
  deleteAccountApi,
  deleteAccountFundApi,
  deleteSnapshotApi,
  deleteTransferApi,
  fetchWallet,
  importWalletApi,
  patchSettings,
  reorderAccountsApi,
  updateAccountApi,
  updateAccountFundApi,
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
  funds: AccountFund[]
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
      graceMonths?: number
    },
  ) => Promise<string>
  updateAccount: (
    id: string,
    patch: Partial<Omit<Account, 'id' | 'creditLimit' | 'linkedAccountId' | 'graceMonths'>> & {
      creditLimit?: number | null
      linkedAccountId?: string | null
      graceMonths?: number | null
    },
  ) => Promise<void>
  reorderAccounts: (orderedIds: string[]) => Promise<void>
  archiveAccount: (id: string, archived?: boolean) => Promise<void>
  deleteAccount: (id: string) => Promise<void>
  addSnapshot: (input: {
    date: string
    note?: string
    income?: number
    expense?: number
    origin?: SnapshotOrigin
    lines: SnapshotLine[]
  }) => Promise<string>
  updateSnapshot: (
    id: string,
    patch: Partial<Omit<BalanceSnapshot, 'id'>>,
  ) => Promise<void>
  deleteSnapshot: (id: string) => Promise<void>
  addTransfer: (input: Omit<Transfer, 'id'>) => Promise<string>
  /** Create transfer and upsert a locked transfer check-in with adjusted balances. */
  addTransferCheckIn: (
    input: Omit<Transfer, 'id'>,
    rateBook?: RateBook,
  ) => Promise<{ transferId: string; snapshotId: string }>
  deleteTransfer: (id: string) => Promise<void>
  addAccountFund: (input: {
    accountId: string
    name: string
    monthlyTarget: number
    priority?: number
  }) => Promise<string>
  updateAccountFund: (
    id: string,
    patch: Partial<{
      accountId: string
      name: string
      monthlyTarget: number
      priority: number
    }>,
  ) => Promise<void>
  deleteAccountFund: (id: string) => Promise<void>
}

function nextColor(accounts: Account[]): string {
  const used = new Set(accounts.map((a) => a.color))
  const free = ACCOUNT_COLORS.find((c) => !used.has(c))
  return free ?? ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length]!
}

function normalizeAccount(account: Account): Account {
  return {
    ...account,
    kind: normalizeAccountKind(account.kind),
  }
}

function normalizeSnapshot(snapshot: BalanceSnapshot): BalanceSnapshot {
  return {
    ...snapshot,
    origin: snapshot.origin === 'transfer' ? 'transfer' : 'manual',
    income: snapshot.income != null && Number.isFinite(snapshot.income) ? snapshot.income : 0,
    expense: snapshot.expense != null && Number.isFinite(snapshot.expense) ? snapshot.expense : 0,
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
  funds: [],
  loaded: false,
  loading: false,
  error: null,

  clear: () =>
    set({
      settings: { ...DEFAULT_SETTINGS, exchangeRates: { ...DEFAULT_SETTINGS.exchangeRates } },
      accounts: [],
      snapshots: [],
      transfers: [],
      funds: [],
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
        settings: withFallbackRates(bundle.settings),
        accounts: bundle.accounts.map(normalizeAccount),
        snapshots: bundle.snapshots.map(normalizeSnapshot),
        transfers: bundle.transfers,
        funds: bundle.funds ?? [],
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
    const current = get().settings
    const settings = await patchSettings({
      baseCurrency: patch.baseCurrency ?? current.baseCurrency,
      annualInflationPct:
        patch.annualInflationPct !== undefined
          ? patch.annualInflationPct
          : current.annualInflationPct,
      keyRatePct:
        patch.keyRatePct !== undefined ? patch.keyRatePct : current.keyRatePct,
    })
    set({ settings })
  },

  addAccount: async (input) => {
    const account = await createAccountApi({
      name: input.name,
      currency: input.currency,
      color: input.color || nextColor(get().accounts),
      sortOrder: input.sortOrder,
      kind: input.kind ?? 'operational',
      creditLimit: input.creditLimit,
      linkedAccountId: input.linkedAccountId,
      graceMonths: input.graceMonths,
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
      funds: state.funds.filter((f) => f.accountId !== id),
    }))
  },

  addSnapshot: async (input) => {
    const snapshot = normalizeSnapshot(await upsertSnapshotApi(input))
    set((state) => {
      const others = state.snapshots.filter(
        (s) => s.id !== snapshot.id && s.date !== snapshot.date,
      )
      return { snapshots: [...others, snapshot] }
    })
    return snapshot.id
  },

  updateSnapshot: async (id, patch) => {
    const snapshot = normalizeSnapshot(
      await updateSnapshotApi(id, {
        date: patch.date,
        note: patch.note,
        income: patch.income,
        expense: patch.expense,
        origin: patch.origin,
        lines: patch.lines,
      }),
    )
    set((state) => ({
      snapshots: state.snapshots.map((s) => (s.id === id ? snapshot : s)),
    }))
  },

  deleteSnapshot: async (id) => {
    const snap = get().snapshots.find((s) => s.id === id)
    await deleteSnapshotApi(id)
    const sameDateTransfers =
      snap?.origin === 'transfer'
        ? get().transfers.filter((t) => t.date === snap.date)
        : []
    for (const t of sameDateTransfers) {
      await deleteTransferApi(t.id)
    }
    set((state) => ({
      snapshots: state.snapshots.filter((s) => s.id !== id),
      transfers:
        snap?.origin === 'transfer'
          ? state.transfers.filter((t) => t.date !== snap.date)
          : state.transfers,
    }))
  },

  addTransfer: async (input) => {
    const transfer = await createTransferApi(input)
    set((state) => ({ transfers: [...state.transfers, transfer] }))
    return transfer.id
  },

  addTransferCheckIn: async (input, rateBook) => {
    const state = get()
    const lines = buildTransferSnapshotLines({
      date: input.date,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: input.amount,
      accounts: state.accounts,
      snapshots: state.snapshots,
      settings: state.settings,
      rateBook,
    })
    const transfer = await createTransferApi(input)
    const snapshot = normalizeSnapshot(
      await upsertSnapshotApi({
        date: input.date,
        note: input.note,
        origin: 'transfer',
        lines,
      }),
    )
    set((prev) => {
      const others = prev.snapshots.filter(
        (s) => s.id !== snapshot.id && s.date !== snapshot.date,
      )
      return {
        transfers: [...prev.transfers, transfer],
        snapshots: [...others, snapshot],
      }
    })
    return { transferId: transfer.id, snapshotId: snapshot.id }
  },

  deleteTransfer: async (id) => {
    await deleteTransferApi(id)
    set((state) => ({
      transfers: state.transfers.filter((t) => t.id !== id),
    }))
  },

  addAccountFund: async (input) => {
    const { fund, funds } = await createAccountFundApi(input)
    set({ funds })
    return fund.id
  },

  updateAccountFund: async (id, patch) => {
    const fund = await updateAccountFundApi(id, patch)
    set((state) => ({
      funds: state.funds.map((f) => (f.id === id ? fund : f)),
    }))
  },

  deleteAccountFund: async (id) => {
    await deleteAccountFundApi(id)
    set((state) => ({
      funds: state.funds.filter((f) => f.id !== id),
    }))
  },
}))
