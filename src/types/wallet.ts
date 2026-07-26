export type AppSection = 'dashboard' | 'checkins' | 'accounts' | 'transfers' | 'report' | 'settings'

export interface Account {
  id: string
  name: string
  currency: string
  color: string
  archived: boolean
  sortOrder: number
}

export interface SnapshotLine {
  accountId: string
  amount: number
}

export interface BalanceSnapshot {
  id: string
  date: string
  note?: string
  lines: SnapshotLine[]
}

export interface Transfer {
  id: string
  date: string
  fromAccountId: string
  toAccountId: string
  /** Amount in the source account currency. */
  amount: number
  note?: string
}

/** Manual rates: 1 unit of currency → how many units of baseCurrency. */
export type ExchangeRates = Record<string, number>

export interface WalletSettings {
  baseCurrency: string
  /** Rates to base currency. Base itself is always 1. */
  exchangeRates: ExchangeRates
}

export const ACCOUNT_COLORS = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#4f46e5',
] as const

export const DEFAULT_SETTINGS: WalletSettings = {
  baseCurrency: 'RUB',
  exchangeRates: {
    RUB: 1,
    USD: 90,
    EUR: 100,
    USDT: 90,
  },
}

export interface TotalPoint {
  date: string
  total: number
  growth: number
}

export interface AccountPoint {
  date: string
  balance: number
  /** Balance adjusted so transfers do not look like growth. */
  growth: number
}

export interface AccountSummary {
  accountId: string
  balance: number
  balanceBase: number
  growth: number
  growthBase: number
}
