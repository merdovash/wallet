import type {
  Account,
  AccountFund,
  BalanceSnapshot,
  SnapshotLine,
  SnapshotOrigin,
  Transfer,
  WalletSettings,
} from '../types/wallet'
import { DEFAULT_SETTINGS } from '../types/wallet'

export interface WalletBundle {
  settings: { baseCurrency: string; annualInflationPct?: number | null; keyRatePct?: number | null }
  accounts: Account[]
  snapshots: BalanceSnapshot[]
  transfers: Transfer[]
  funds?: AccountFund[]
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string }
    return body.error ?? response.statusText
  } catch {
    return response.statusText
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  if (!response.ok) throw new Error(await parseError(response))
  return (await response.json()) as T
}

export function withFallbackRates(settings: {
  baseCurrency: string
  annualInflationPct?: number | null
  keyRatePct?: number | null
}): WalletSettings {
  return {
    baseCurrency: settings.baseCurrency,
    annualInflationPct: settings.annualInflationPct ?? null,
    keyRatePct: settings.keyRatePct ?? null,
    exchangeRates: {
      ...DEFAULT_SETTINGS.exchangeRates,
      [settings.baseCurrency]: 1,
    },
  }
}

export async function patchSettings(patch: {
  baseCurrency?: string
  annualInflationPct?: number | null
  keyRatePct?: number | null
}): Promise<WalletSettings> {
  const body = await api<{
    settings: { baseCurrency: string; annualInflationPct?: number | null; keyRatePct?: number | null }
  }>('/api/wallet/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return withFallbackRates(body.settings)
}
export async function fetchWallet(): Promise<WalletBundle> {
  return api<WalletBundle>('/api/wallet')
}

export async function createAccountApi(
  input: Omit<Account, 'id' | 'archived' | 'sortOrder'> & { sortOrder?: number },
): Promise<Account> {
  const body = await api<{ account: Account }>('/api/wallet/accounts', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return body.account
}

export async function updateAccountApi(
  id: string,
  patch: Partial<Omit<Account, 'id' | 'creditLimit' | 'linkedAccountId' | 'graceMonths'>> & {
    creditLimit?: number | null
    linkedAccountId?: string | null
    graceMonths?: number | null
  },
): Promise<Account> {
  const body = await api<{ account: Account }>(`/api/wallet/accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return body.account
}

export async function deleteAccountApi(id: string): Promise<void> {
  await api(`/api/wallet/accounts/${id}`, { method: 'DELETE' })
}

export async function reorderAccountsApi(orderedIds: string[]): Promise<Account[]> {
  const body = await api<{ accounts: Account[] }>('/api/wallet/accounts/order', {
    method: 'PUT',
    body: JSON.stringify({ orderedIds }),
  })
  return body.accounts
}

export async function upsertSnapshotApi(input: {
  date: string
  note?: string
  income?: number
  expense?: number
  origin?: SnapshotOrigin
  lines: SnapshotLine[]
}): Promise<BalanceSnapshot> {
  const body = await api<{ snapshot: BalanceSnapshot }>('/api/wallet/snapshots', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return body.snapshot
}

export async function updateSnapshotApi(
  id: string,
  patch: {
    date?: string
    note?: string
    income?: number
    expense?: number
    origin?: SnapshotOrigin
    lines?: SnapshotLine[]
  },
): Promise<BalanceSnapshot> {
  const body = await api<{ snapshot: BalanceSnapshot }>(`/api/wallet/snapshots/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return body.snapshot
}

export async function deleteSnapshotApi(id: string): Promise<void> {
  await api(`/api/wallet/snapshots/${id}`, { method: 'DELETE' })
}

export async function createTransferApi(input: Omit<Transfer, 'id'>): Promise<Transfer> {
  const body = await api<{ transfer: Transfer }>('/api/wallet/transfers', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return body.transfer
}

export async function deleteTransferApi(id: string): Promise<void> {
  await api(`/api/wallet/transfers/${id}`, { method: 'DELETE' })
}

export async function createAccountFundApi(input: {
  accountId: string
  name: string
  monthlyTarget: number
  priority?: number
}): Promise<{ fund: AccountFund; funds: AccountFund[] }> {
  return api<{ fund: AccountFund; funds: AccountFund[] }>('/api/wallet/funds', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateAccountFundApi(
  id: string,
  patch: Partial<{
    accountId: string
    name: string
    monthlyTarget: number
    priority: number
  }>,
): Promise<AccountFund> {
  const body = await api<{ fund: AccountFund }>(`/api/wallet/funds/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return body.fund
}

export async function deleteAccountFundApi(id: string): Promise<void> {
  await api(`/api/wallet/funds/${id}`, { method: 'DELETE' })
}

export async function importWalletApi(payload: {
  settings?: { baseCurrency?: string }
  accounts: Account[]
  snapshots: BalanceSnapshot[]
  transfers: Transfer[]
}): Promise<WalletBundle> {
  return api<WalletBundle>('/api/wallet/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
