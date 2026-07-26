import type {
  Account,
  BalanceSnapshot,
  Transfer,
  WalletSettings,
} from '../types/wallet'
import {
  accountGrowth,
  balanceOnDate,
  convertAmount,
  netTransfersIn,
  type RateBook,
  sortSnapshots,
  sortTransfers,
} from './growthEngine'

export interface CreditMonthBucket {
  /** YYYY-MM of spending */
  month: string
  spent: number
  repaid: number
  remaining: number
  dueDate: string
  overdue: boolean
}

export interface CreditFloatMonthRow {
  /** Calendar month of the benefit / context (YYYY-MM) */
  month: string
  earned: number
  earnedBase: number
  spent: number
  repaid: number
  remaining: number
  dueDate: string
  overdue: boolean
  avgDebt: number
  maxDebt: number
}

export interface CreditFloatSummary {
  creditAccountId: string
  linkedAccountId?: string
  cumulativeEarned: number
  cumulativeEarnedBase: number
  totalDebt: number
  months: CreditFloatMonthRow[]
}

function compareDate(a: string, b: string): number {
  return a.localeCompare(b)
}

/** Debt from available credit remainder. */
export function creditDebt(limit: number, available: number): number {
  return Math.max(0, limit - available)
}

/** YYYY-MM from ISO date. */
export function monthKey(date: string): string {
  return date.slice(0, 7)
}

/** Last day of calendar month as YYYY-MM-DD. */
export function lastDayOfMonth(year: number, month1to12: number): string {
  const utc = new Date(Date.UTC(year, month1to12, 0))
  const y = utc.getUTCFullYear()
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const d = String(utc.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Grace due date: spending in calendar month N must be closed by end of month N+3.
 * March 2026 → 2026-06-30.
 */
export function graceDueDate(spendMonth: string): string {
  const [ys, ms] = spendMonth.split('-')
  const year = Number(ys)
  const month = Number(ms)
  if (!year || !month) return spendMonth
  const due = new Date(Date.UTC(year, month - 1 + 3, 1))
  return lastDayOfMonth(due.getUTCFullYear(), due.getUTCMonth() + 1)
}

function monthStart(ym: string): string {
  return `${ym}-01`
}

function monthEnd(ym: string): string {
  const [ys, ms] = ym.split('-')
  return lastDayOfMonth(Number(ys), Number(ms))
}

function addMonth(ym: string, delta: number): string {
  const [ys, ms] = ym.split('-')
  const d = new Date(Date.UTC(Number(ys), Number(ms) - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function enumerateMonths(fromYm: string, toYm: string): string[] {
  if (compareDate(fromYm, toYm) > 0) return []
  const out: string[] = []
  let cur = fromYm
  while (compareDate(cur, toYm) <= 0) {
    out.push(cur)
    cur = addMonth(cur, 1)
  }
  return out
}

function repaymentsToCard(
  creditAccountId: string,
  t0: string,
  t1: string,
  transfers: Transfer[],
  accounts: Account[],
  settings?: WalletSettings,
  rateBook?: RateBook,
): number {
  const net = netTransfersIn(creditAccountId, t0, t1, transfers, accounts, settings, rateBook)
  // Incoming repayments increase available; only count positive inflow as repayment.
  return Math.max(0, net)
}

/**
 * Infer spending month buckets and apply repayments FIFO (oldest month first).
 */
export function buildCreditBuckets(
  credit: Account,
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  accounts: Account[],
  asOfDate: string,
  settings?: WalletSettings,
  rateBook?: RateBook,
): CreditMonthBucket[] {
  if (credit.kind !== 'credit') return []
  const limit = credit.creditLimit ?? 0
  const sorted = sortSnapshots(snapshots)
  const allDates = sorted.map((s) => s.date).filter((d) => compareDate(d, asOfDate) <= 0)
  const knownDates = allDates.filter((d) => balanceOnDate(credit.id, d, snapshots) != null)
  if (knownDates.length === 0) return []

  const spentByMonth = new Map<string, number>()

  const firstAvail = balanceOnDate(credit.id, knownDates[0]!, snapshots)
  if (firstAvail != null) {
    const initialDebt = creditDebt(limit, firstAvail)
    if (initialDebt > 0) {
      const mk = monthKey(knownDates[0]!)
      spentByMonth.set(mk, (spentByMonth.get(mk) ?? 0) + initialDebt)
    }
  }

  for (let i = 1; i < knownDates.length; i += 1) {
    const t0 = knownDates[i - 1]!
    const t1 = knownDates[i]!
    const avail0 = balanceOnDate(credit.id, t0, snapshots)
    const avail1 = balanceOnDate(credit.id, t1, snapshots)
    if (avail0 == null || avail1 == null) continue
    const repaid = repaymentsToCard(credit.id, t0, t1, transfers, accounts, settings, rateBook)
    const spend = Math.max(0, avail0 - avail1 + repaid)
    if (spend <= 0) continue
    const mk = monthKey(t1)
    spentByMonth.set(mk, (spentByMonth.get(mk) ?? 0) + spend)
  }

  const months = [...spentByMonth.keys()].sort(compareDate)
  const buckets = new Map<string, { spent: number; repaid: number }>()
  for (const m of months) {
    buckets.set(m, { spent: spentByMonth.get(m) ?? 0, repaid: 0 })
  }

  // FIFO repayments across all transfers to the card up to asOfDate.
  let repayQueue = 0
  for (const t of sortTransfers(transfers)) {
    if (compareDate(t.date, asOfDate) > 0) continue
    if (t.toAccountId !== credit.id) continue
    let amount = t.amount
    const from = accounts.find((a) => a.id === t.fromAccountId)
    if (from && settings && from.currency !== credit.currency) {
      amount = convertAmount(t.amount, from.currency, credit.currency, settings, t.date, rateBook)
    }
    repayQueue += amount
  }

  const ordered = [...buckets.keys()].sort(compareDate)
  for (const m of ordered) {
    const b = buckets.get(m)!
    const apply = Math.min(b.spent, repayQueue)
    b.repaid = apply
    repayQueue -= apply
  }

  return ordered.map((m) => {
    const b = buckets.get(m)!
    const remaining = Math.max(0, b.spent - b.repaid)
    const dueDate = graceDueDate(m)
    return {
      month: m,
      spent: b.spent,
      repaid: b.repaid,
      remaining,
      dueDate,
      overdue: remaining > 1e-9 && compareDate(asOfDate, dueDate) > 0,
    }
  })
}

function debtOnDate(credit: Account, date: string, snapshots: BalanceSnapshot[]): number | null {
  const avail = balanceOnDate(credit.id, date, snapshots)
  if (avail == null) return null
  return creditDebt(credit.creditLimit ?? 0, avail)
}

/**
 * Monthly float benefit from linked wallet growth (ex-transfers), plus grace context.
 */
export function buildCreditFloatSummary(
  credit: Account,
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  accounts: Account[],
  settings: WalletSettings,
  asOfDate: string,
  rateBook?: RateBook,
): CreditFloatSummary {
  const empty: CreditFloatSummary = {
    creditAccountId: credit.id,
    linkedAccountId: credit.linkedAccountId,
    cumulativeEarned: 0,
    cumulativeEarnedBase: 0,
    totalDebt: debtOnDate(credit, asOfDate, snapshots) ?? 0,
    months: [],
  }
  if (credit.kind !== 'credit') return empty

  const buckets = buildCreditBuckets(
    credit,
    snapshots,
    transfers,
    accounts,
    asOfDate,
    settings,
    rateBook,
  )
  const bucketByMonth = new Map(buckets.map((b) => [b.month, b]))

  const linkedId = credit.linkedAccountId
  const knownCreditDates = sortSnapshots(snapshots)
    .map((s) => s.date)
    .filter((d) => compareDate(d, asOfDate) <= 0 && balanceOnDate(credit.id, d, snapshots) != null)

  if (knownCreditDates.length === 0) return empty

  const firstYm = monthKey(knownCreditDates[0]!)
  const lastYm = monthKey(asOfDate)
  const months = enumerateMonths(firstYm, lastYm)

  const rows: CreditFloatMonthRow[] = []
  let cumulativeEarned = 0
  let cumulativeEarnedBase = 0

  for (const ym of months) {
    const start = monthStart(ym)
    const end = monthEnd(ym)
    const periodEnd = compareDate(end, asOfDate) < 0 ? end : asOfDate

    let earned = 0
    if (linkedId && compareDate(periodEnd, start) > 0) {
      earned =
        accountGrowth(linkedId, start, periodEnd, snapshots, transfers, accounts, settings, rateBook) ??
        0
    }

    const linkedCurrency =
      accounts.find((a) => a.id === linkedId)?.currency ?? credit.currency
    const earnedBase = linkedId
      ? convertAmount(earned, linkedCurrency, settings.baseCurrency, settings, periodEnd, rateBook)
      : earned

    cumulativeEarned += earned
    cumulativeEarnedBase += earnedBase

    // Debt stats within month from snapshot dates
    let maxDebt = 0
    let debtSum = 0
    let debtCount = 0
    for (const snap of sortSnapshots(snapshots)) {
      if (compareDate(snap.date, start) < 0) continue
      if (compareDate(snap.date, periodEnd) > 0) break
      const d = debtOnDate(credit, snap.date, snapshots)
      if (d == null) continue
      maxDebt = Math.max(maxDebt, d)
      debtSum += d
      debtCount += 1
    }
    const avgDebt =
      debtCount > 0 ? debtSum / debtCount : (debtOnDate(credit, periodEnd, snapshots) ?? 0)

    const bucket = bucketByMonth.get(ym)
    rows.push({
      month: ym,
      earned,
      earnedBase,
      spent: bucket?.spent ?? 0,
      repaid: bucket?.repaid ?? 0,
      remaining: bucket?.remaining ?? 0,
      dueDate: bucket?.dueDate ?? graceDueDate(ym),
      overdue: bucket?.overdue ?? false,
      avgDebt,
      maxDebt,
    })
  }

  return {
    creditAccountId: credit.id,
    linkedAccountId: linkedId,
    cumulativeEarned,
    cumulativeEarnedBase,
    totalDebt: debtOnDate(credit, asOfDate, snapshots) ?? 0,
    months: rows,
  }
}

/** Aggregate float benefit across all active credit cards. */
export function buildAllCreditFloatSummaries(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  settings: WalletSettings,
  asOfDate: string,
  rateBook?: RateBook,
): { totalEarnedBase: number; cards: CreditFloatSummary[] } {
  const cards = accounts
    .filter((a) => !a.archived && a.kind === 'credit')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((credit) =>
      buildCreditFloatSummary(credit, snapshots, transfers, accounts, settings, asOfDate, rateBook),
    )
  const totalEarnedBase = cards.reduce((sum, c) => sum + c.cumulativeEarnedBase, 0)
  return { totalEarnedBase, cards }
}
