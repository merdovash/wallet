import {
  balanceOnDate,
  netWorthAmount,
  type RateBook,
} from '../engine/growthEngine'
import { normalizeAccountKind } from './accountKinds'
import { toBase } from './currency'
import { resolvePivotForDate } from './cbrRates'
import type { Account, BalanceSnapshot, WalletSettings } from '../types/wallet'

export interface PersonalCoefficients {
  /** Net flow into growth portfolio ÷ total income over the period. */
  savingsRate: number | null
  /** Operational + cash balance ÷ average monthly expense. */
  liquidityCushionMonths: number | null
  /** Credit card debt ÷ average monthly income. */
  debtLoad: number | null
  totalIncome: number
  totalExpense: number
  netFlowToPortfolio: number
  liquidBalance: number
  creditDebt: number
  avgMonthlyIncome: number | null
  avgMonthlyExpense: number | null
}

const AVG_MONTH_DAYS = 30.4375

function daysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, Math.round((end - start) / 86_400_000))
}

function monthSpan(startDate: string, endDate: string): number {
  const days = daysBetween(startDate, endDate)
  return Math.max(1, days / AVG_MONTH_DAYS)
}

function pivotFor(
  date: string,
  settings: WalletSettings,
  rateBook?: RateBook,
): Record<string, number> | null {
  if (rateBook) {
    const pivot = resolvePivotForDate(date, rateBook)
    if (pivot) return pivot
  }
  if (settings.baseCurrency === 'RUB') return settings.exchangeRates
  return null
}

function sumCheckInCashflow(
  snapshots: BalanceSnapshot[],
  startDate: string,
  endDate: string,
): { income: number; expense: number } {
  let income = 0
  let expense = 0
  for (const snap of snapshots) {
    if (snap.date.localeCompare(startDate) <= 0) continue
    if (snap.date.localeCompare(endDate) > 0) continue
    income += snap.income ?? 0
    expense += snap.expense ?? 0
  }
  return { income, expense }
}

function liquidBalanceOnDate(
  accounts: Account[],
  date: string,
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  rateBook?: RateBook,
): number {
  const pivot = pivotFor(date, settings, rateBook)
  let total = 0
  for (const account of accounts) {
    if (account.archived) continue
    const kind = normalizeAccountKind(account.kind)
    if (kind !== 'operational' && kind !== 'cash') continue
    const bal = balanceOnDate(account.id, date, snapshots)
    if (bal == null) continue
    total += toBase(
      netWorthAmount(account, bal),
      account.currency,
      settings.baseCurrency,
      settings.exchangeRates,
      pivot,
    )
  }
  return total
}

function creditDebtOnDate(
  accounts: Account[],
  date: string,
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  rateBook?: RateBook,
): number {
  const pivot = pivotFor(date, settings, rateBook)
  let debt = 0
  for (const account of accounts) {
    if (account.archived) continue
    if (normalizeAccountKind(account.kind) !== 'credit') continue
    const bal = balanceOnDate(account.id, date, snapshots)
    if (bal == null) continue
    const nw = netWorthAmount(account, bal)
    if (nw >= 0) continue
    debt += toBase(
      -nw,
      account.currency,
      settings.baseCurrency,
      settings.exchangeRates,
      pivot,
    )
  }
  return debt
}

export function buildPersonalCoefficients(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  rateBook: RateBook | undefined,
  startDate: string,
  endDate: string,
  netFlowToPortfolio: number,
): PersonalCoefficients {
  const { income: totalIncome, expense: totalExpense } = sumCheckInCashflow(
    snapshots,
    startDate,
    endDate,
  )
  const months = monthSpan(startDate, endDate)
  const avgMonthlyIncome = totalIncome > 0 ? totalIncome / months : null
  const avgMonthlyExpense = totalExpense > 0 ? totalExpense / months : null

  const savingsRate =
    totalIncome > 0 && Number.isFinite(netFlowToPortfolio)
      ? netFlowToPortfolio / totalIncome
      : null

  const liquidBalance = liquidBalanceOnDate(accounts, endDate, snapshots, settings, rateBook)
  const liquidityCushionMonths =
    avgMonthlyExpense != null && avgMonthlyExpense > 0
      ? liquidBalance / avgMonthlyExpense
      : null

  const creditDebt = creditDebtOnDate(accounts, endDate, snapshots, settings, rateBook)
  const debtLoad =
    avgMonthlyIncome != null && avgMonthlyIncome > 0 ? creditDebt / avgMonthlyIncome : null

  return {
    savingsRate,
    liquidityCushionMonths,
    debtLoad,
    totalIncome,
    totalExpense,
    netFlowToPortfolio,
    liquidBalance,
    creditDebt,
    avgMonthlyIncome,
    avgMonthlyExpense,
  }
}
