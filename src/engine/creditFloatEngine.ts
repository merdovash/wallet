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
  modifiedDietzReturn,
  netTransfersIn,
  type DatedCapitalFlow,
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

export interface CreditFloatDayRow {
  /** Check-in date where linked-account change is attributed (YYYY-MM-DD). */
  date: string
  /** Calendar month (YYYY-MM). */
  month: string
  linkedGrowth: number
  linkedGrowthBase: number
  floatSharePct: number | null
  earned: number
  earnedBase: number
  baseGrowth: number
  baseGrowthBase: number
  creditGrowth: number
  creditGrowthBase: number
  interestGrowth: number
  interestGrowthBase: number
  /** Capital baskets used for the split (linked currency / base). */
  baseCapital: number
  baseCapitalBase: number
  creditCapital: number
  creditCapitalBase: number
  interestCapital: number
  interestCapitalBase: number
  /** Locked float earnings after this day (linked currency). */
  lockedEarnings: number
  lockedEarningsBase: number
  baseSharePct: number | null
  creditSharePct: number | null
  interestSharePct: number | null
  avgDebt: number
}

export interface CreditFloatMonthRow {
  /** Calendar month of the benefit / context (YYYY-MM) */
  month: string
  /** Full linked-account growth for the month (ex-transfers). */
  linkedGrowth: number
  linkedGrowthBase: number
  /** Share of linked growth attributed to credit funds: earned / G (0..1). */
  floatSharePct: number | null
  /** creditGrowth + interestGrowth (interest-free credit benefit). */
  earned: number
  earnedBase: number
  /** Growth on own (non-credit) capital. */
  baseGrowth: number
  baseGrowthBase: number
  /** Growth attributed to float principal (debt / repayments). */
  creditGrowth: number
  creditGrowthBase: number
  /** Growth on previously locked float earnings. */
  interestGrowth: number
  interestGrowthBase: number
  /** Locked float earnings after this month (linked currency). */
  lockedEarnings: number
  lockedEarningsBase: number
  /** Capital basket shares for the month (0..1). */
  baseSharePct: number | null
  creditSharePct: number | null
  interestSharePct: number | null
  spent: number
  repaid: number
  remaining: number
  dueDate: string
  overdue: boolean
  avgDebt: number
  maxDebt: number
  /** Days with linked-account growth in this month (newest first in UI). */
  days: CreditFloatDayRow[]
}

export interface CreditFloatSummary {
  creditAccountId: string
  linkedAccountId?: string
  cumulativeEarned: number
  cumulativeEarnedBase: number
  /** Sum of interestGrowth across days (compounding on locked earnings). */
  cumulativeInterestBase: number
  totalDebt: number
  totalDebtBase: number
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

export const DEFAULT_GRACE_MONTHS = 3

/** Clamp / default grace length for a credit account. */
export function resolveGraceMonths(account: Pick<Account, 'graceMonths'>): number {
  const n = account.graceMonths
  if (n != null && Number.isFinite(n) && n >= 1 && n <= 12) return Math.floor(n)
  return DEFAULT_GRACE_MONTHS
}

/**
 * Grace due date: spending in calendar month N must be closed by end of month N+graceMonths.
 * Default graceMonths=3: March 2026 → 2026-06-30.
 */
export function graceDueDate(spendMonth: string, graceMonths = DEFAULT_GRACE_MONTHS): string {
  const [ys, ms] = spendMonth.split('-')
  const year = Number(ys)
  const month = Number(ms)
  const months = graceMonths >= 1 && graceMonths <= 12 ? Math.floor(graceMonths) : DEFAULT_GRACE_MONTHS
  if (!year || !month) return spendMonth
  const due = new Date(Date.UTC(year, month - 1 + months, 1))
  return lastDayOfMonth(due.getUTCFullYear(), due.getUTCMonth() + 1)
}

function monthStart(ym: string): string {
  return `${ym}-01`
}

function monthEnd(ym: string): string {
  const [ys, ms] = ym.split('-')
  return lastDayOfMonth(Number(ys), Number(ms))
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

/** Sum of transfers linked → credit over (t0, t1] in the linked account currency. */
function repaymentsFromLinked(
  linkedAccountId: string,
  creditAccountId: string,
  t0: string,
  t1: string,
  transfers: Transfer[],
): number {
  let sum = 0
  for (const t of sortTransfers(transfers)) {
    if (compareDate(t.date, t0) <= 0) continue
    if (compareDate(t.date, t1) > 0) continue
    if (t.fromAccountId !== linkedAccountId || t.toAccountId !== creditAccountId) continue
    sum += t.amount
  }
  return sum
}

/** Dated net capital flows into an account (account currency) for Modified Dietz. */
function accountCapitalFlows(
  accountId: string,
  t0: string,
  t1: string,
  transfers: Transfer[],
  accounts: Account[],
  settings: WalletSettings,
  rateBook?: RateBook,
): DatedCapitalFlow[] {
  const map = new Map(accounts.map((a) => [a.id, a]))
  const account = map.get(accountId)
  if (!account) return []
  const byDate = new Map<string, number>()
  for (const t of sortTransfers(transfers)) {
    if (compareDate(t.date, t0) <= 0) continue
    if (compareDate(t.date, t1) > 0) continue
    if (t.fromAccountId === accountId) {
      byDate.set(t.date, (byDate.get(t.date) ?? 0) - t.amount)
      continue
    }
    if (t.toAccountId === accountId) {
      const from = map.get(t.fromAccountId)
      const amount =
        from && from.currency !== account.currency
          ? convertAmount(t.amount, from.currency, account.currency, settings, t.date, rateBook)
          : t.amount
      byDate.set(t.date, (byDate.get(t.date) ?? 0) + amount)
    }
  }
  return [...byDate.entries()]
    .filter(([, amount]) => amount !== 0)
    .sort(([a], [b]) => compareDate(a, b))
    .map(([date, amount]) => ({ date, amount }))
}

export type LinkedFloatAttribution = {
  linkedGrowth: number
  weightedCapital: number
  /** Principal used for the credit basket: max(avg debt, linked→card repayments). */
  floatPrincipal: number
  /** Locked earnings basket after clamp to remaining weighted capital. */
  lockedCapital: number
  baseCapital: number
  baseGrowth: number
  creditGrowth: number
  interestGrowth: number
  /** Share of linked growth attributed to credit funds: earned / G. */
  floatSharePct: number | null
  baseSharePct: number | null
  creditSharePct: number | null
  interestSharePct: number | null
  /** creditGrowth + interestGrowth. */
  earned: number
}

function emptyLinkedFloatAttribution(
  overrides: Partial<LinkedFloatAttribution> = {},
): LinkedFloatAttribution {
  return {
    linkedGrowth: 0,
    weightedCapital: 0,
    floatPrincipal: 0,
    lockedCapital: 0,
    baseCapital: 0,
    baseGrowth: 0,
    creditGrowth: 0,
    interestGrowth: 0,
    floatSharePct: null,
    baseSharePct: null,
    creditSharePct: null,
    interestSharePct: null,
    earned: 0,
    ...overrides,
  }
}

/**
 * Split linked-account growth into base / credit / interest-on-locked baskets.
 * Float principal = max(average credit debt, linked→card repayments).
 * Previously locked earnings compound as a third basket on later days.
 */
export function attributedLinkedFloatYield(
  linkedAccountId: string,
  creditAccountId: string,
  startDate: string,
  endDate: string,
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  accounts: Account[],
  settings: WalletSettings,
  floatPrincipalInLinkedCurrency: number,
  rateBook?: RateBook,
  lockedEarningsInLinkedCurrency = 0,
): LinkedFloatAttribution {
  if (compareDate(startDate, endDate) >= 0) return emptyLinkedFloatAttribution()

  const repaid = repaymentsFromLinked(
    linkedAccountId,
    creditAccountId,
    startDate,
    endDate,
    transfers,
  )
  const floatPrincipal = Math.max(0, floatPrincipalInLinkedCurrency, repaid)

  const startBal = balanceOnDate(linkedAccountId, startDate, snapshots)
  const growth =
    accountGrowth(
      linkedAccountId,
      startDate,
      endDate,
      snapshots,
      transfers,
      accounts,
      settings,
      rateBook,
    ) ?? 0
  if (startBal == null) {
    return emptyLinkedFloatAttribution({ linkedGrowth: growth, floatPrincipal })
  }

  const flows = accountCapitalFlows(
    linkedAccountId,
    startDate,
    endDate,
    transfers,
    accounts,
    settings,
    rateBook,
  )
  const { weightedCapital } = modifiedDietzReturn(
    startBal,
    growth,
    startDate,
    endDate,
    flows,
  )

  if (!Number.isFinite(weightedCapital) || weightedCapital <= 0) {
    return emptyLinkedFloatAttribution({
      linkedGrowth: growth,
      weightedCapital,
      floatPrincipal,
    })
  }

  const creditCap = Math.min(floatPrincipal, weightedCapital)
  const lockedCapital = Math.min(
    Math.max(0, lockedEarningsInLinkedCurrency),
    Math.max(0, weightedCapital - creditCap),
  )
  const baseCapital = Math.max(0, weightedCapital - creditCap - lockedCapital)
  const totalCap = baseCapital + creditCap + lockedCapital

  if (totalCap <= 0) {
    return emptyLinkedFloatAttribution({
      linkedGrowth: growth,
      weightedCapital,
      floatPrincipal,
      lockedCapital,
      baseCapital,
    })
  }

  const baseSharePct = baseCapital / totalCap
  const creditSharePct = creditCap / totalCap
  const interestSharePct = lockedCapital / totalCap
  const baseGrowth = growth * baseSharePct
  const creditGrowth = growth * creditSharePct
  const interestGrowth = growth * interestSharePct
  const earned = creditGrowth + interestGrowth
  const floatSharePct = growth !== 0 ? earned / growth : creditSharePct + interestSharePct

  return {
    linkedGrowth: growth,
    weightedCapital,
    floatPrincipal,
    lockedCapital,
    baseCapital,
    baseGrowth,
    creditGrowth,
    interestGrowth,
    floatSharePct,
    baseSharePct,
    creditSharePct,
    interestSharePct,
    earned,
  }
}

/** @deprecated use attributedLinkedFloatYield */
export function attributedLinkedRepaymentYield(
  linkedAccountId: string,
  creditAccountId: string,
  startDate: string,
  endDate: string,
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  accounts: Account[],
  settings: WalletSettings,
  rateBook?: RateBook,
): number {
  return attributedLinkedFloatYield(
    linkedAccountId,
    creditAccountId,
    startDate,
    endDate,
    snapshots,
    transfers,
    accounts,
    settings,
    0,
    rateBook,
  ).earned
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

  const graceMonths = resolveGraceMonths(credit)
  return ordered.map((m) => {
    const b = buckets.get(m)!
    const remaining = Math.max(0, b.spent - b.repaid)
    const dueDate = graceDueDate(m, graceMonths)
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

/** Average credit debt over [t0, t1] from known endpoints (credit currency). */
function averageDebtInInterval(
  credit: Account,
  t0: string,
  t1: string,
  snapshots: BalanceSnapshot[],
): number {
  const d0 = debtOnDate(credit, t0, snapshots)
  const d1 = debtOnDate(credit, t1, snapshots)
  if (d0 != null && d1 != null) return (d0 + d1) / 2
  return d1 ?? d0 ?? 0
}

/** Snapshot dates that explicitly mention the linked account (ascending). */
function linkedChangeDates(
  linkedAccountId: string,
  snapshots: BalanceSnapshot[],
  asOfDate: string,
): string[] {
  const dates = new Set<string>()
  for (const snap of sortSnapshots(snapshots)) {
    if (compareDate(snap.date, asOfDate) > 0) continue
    if (snap.lines.some((l) => l.accountId === linkedAccountId)) {
      dates.add(snap.date)
    }
  }
  return [...dates].sort(compareDate)
}

/**
 * Daily float benefit with cumulative three-basket split between linked-account
 * check-ins; months roll up day rows for the Float UI.
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
  const totalDebt = credit.kind === 'credit' ? (debtOnDate(credit, asOfDate, snapshots) ?? 0) : 0
  const totalDebtBase = convertAmount(
    totalDebt,
    credit.currency,
    settings.baseCurrency,
    settings,
    asOfDate,
    rateBook,
  )
  const empty: CreditFloatSummary = {
    creditAccountId: credit.id,
    linkedAccountId: credit.linkedAccountId,
    cumulativeEarned: 0,
    cumulativeEarnedBase: 0,
    cumulativeInterestBase: 0,
    totalDebt,
    totalDebtBase,
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
  if (!linkedId) return empty

  const linkedDates = linkedChangeDates(linkedId, snapshots, asOfDate)
  if (linkedDates.length < 2) return empty

  const firstCreditDate = sortSnapshots(snapshots)
    .map((s) => s.date)
    .find((d) => compareDate(d, asOfDate) <= 0 && balanceOnDate(credit.id, d, snapshots) != null)
  if (!firstCreditDate) return empty

  const linked = accounts.find((a) => a.id === linkedId)
  const linkedCurrency = linked?.currency ?? credit.currency

  const toBase = (amount: number, onDate: string) =>
    convertAmount(amount, linkedCurrency, settings.baseCurrency, settings, onDate, rateBook)

  let lockedEarnings = 0
  let cumulativeEarnedBase = 0
  let cumulativeInterestBase = 0
  const dayRows: CreditFloatDayRow[] = []

  for (let i = 1; i < linkedDates.length; i += 1) {
    const t0 = linkedDates[i - 1]!
    const t1 = linkedDates[i]!
    if (compareDate(t1, firstCreditDate) < 0) continue
    if (compareDate(t0, firstCreditDate) < 0 && compareDate(t1, firstCreditDate) >= 0) {
      // First interval that reaches credit history: start from firstCreditDate if later.
    }
    const start = compareDate(t0, firstCreditDate) < 0 ? firstCreditDate : t0
    if (compareDate(start, t1) >= 0) continue

    const avgDebt = averageDebtInInterval(credit, start, t1, snapshots)
    const avgDebtInLinked =
      credit.currency === linkedCurrency
        ? avgDebt
        : convertAmount(avgDebt, credit.currency, linkedCurrency, settings, t1, rateBook)

    const attr = attributedLinkedFloatYield(
      linkedId,
      credit.id,
      start,
      t1,
      snapshots,
      transfers,
      accounts,
      settings,
      avgDebtInLinked,
      rateBook,
      lockedEarnings,
    )

    // Only surface days where the linked account actually changed (ex-transfers).
    if (Math.abs(attr.linkedGrowth) < 1e-9) {
      lockedEarnings += attr.earned
      continue
    }

    lockedEarnings += attr.earned

    const creditCapital = Math.min(attr.floatPrincipal, attr.weightedCapital)
    dayRows.push({
      date: t1,
      month: monthKey(t1),
      linkedGrowth: attr.linkedGrowth,
      linkedGrowthBase: toBase(attr.linkedGrowth, t1),
      floatSharePct: attr.floatSharePct,
      earned: attr.earned,
      earnedBase: toBase(attr.earned, t1),
      baseGrowth: attr.baseGrowth,
      baseGrowthBase: toBase(attr.baseGrowth, t1),
      creditGrowth: attr.creditGrowth,
      creditGrowthBase: toBase(attr.creditGrowth, t1),
      interestGrowth: attr.interestGrowth,
      interestGrowthBase: toBase(attr.interestGrowth, t1),
      baseCapital: attr.baseCapital,
      baseCapitalBase: toBase(attr.baseCapital, t1),
      creditCapital,
      creditCapitalBase: toBase(creditCapital, t1),
      interestCapital: attr.lockedCapital,
      interestCapitalBase: toBase(attr.lockedCapital, t1),
      lockedEarnings,
      lockedEarningsBase: toBase(lockedEarnings, t1),
      baseSharePct: attr.baseSharePct,
      creditSharePct: attr.creditSharePct,
      interestSharePct: attr.interestSharePct,
      avgDebt,
    })

    cumulativeEarnedBase += toBase(attr.earned, t1)
    cumulativeInterestBase += toBase(attr.interestGrowth, t1)
  }

  const byMonth = new Map<string, CreditFloatDayRow[]>()
  for (const day of dayRows) {
    const list = byMonth.get(day.month) ?? []
    list.push(day)
    byMonth.set(day.month, list)
  }

  const monthKeys = [...byMonth.keys()].sort(compareDate)
  const rows: CreditFloatMonthRow[] = monthKeys.map((ym) => {
    const days = byMonth.get(ym) ?? []
    const linkedGrowth = days.reduce((s, d) => s + d.linkedGrowth, 0)
    const linkedGrowthBase = days.reduce((s, d) => s + d.linkedGrowthBase, 0)
    const earned = days.reduce((s, d) => s + d.earned, 0)
    const earnedBase = days.reduce((s, d) => s + d.earnedBase, 0)
    const baseGrowth = days.reduce((s, d) => s + d.baseGrowth, 0)
    const baseGrowthBase = days.reduce((s, d) => s + d.baseGrowthBase, 0)
    const creditGrowth = days.reduce((s, d) => s + d.creditGrowth, 0)
    const creditGrowthBase = days.reduce((s, d) => s + d.creditGrowthBase, 0)
    const interestGrowth = days.reduce((s, d) => s + d.interestGrowth, 0)
    const interestGrowthBase = days.reduce((s, d) => s + d.interestGrowthBase, 0)
    const last = days[days.length - 1]!
    const bucket = bucketByMonth.get(ym)

    let maxDebt = 0
    let debtSum = 0
    let debtCount = 0
    const start = monthStart(ym)
    const end = monthEnd(ym)
    const periodEnd = compareDate(end, asOfDate) < 0 ? end : asOfDate
    for (const snap of sortSnapshots(snapshots)) {
      if (compareDate(snap.date, start) < 0) continue
      if (compareDate(snap.date, periodEnd) > 0) break
      const d = debtOnDate(credit, snap.date, snapshots)
      if (d == null) continue
      maxDebt = Math.max(maxDebt, d)
      debtSum += d
      debtCount += 1
    }

    return {
      month: ym,
      linkedGrowth,
      linkedGrowthBase,
      floatSharePct: linkedGrowth !== 0 ? earned / linkedGrowth : null,
      earned,
      earnedBase,
      baseGrowth,
      baseGrowthBase,
      creditGrowth,
      creditGrowthBase,
      interestGrowth,
      interestGrowthBase,
      lockedEarnings: last.lockedEarnings,
      lockedEarningsBase: last.lockedEarningsBase,
      baseSharePct: linkedGrowth !== 0 ? baseGrowth / linkedGrowth : null,
      creditSharePct: linkedGrowth !== 0 ? creditGrowth / linkedGrowth : null,
      interestSharePct: linkedGrowth !== 0 ? interestGrowth / linkedGrowth : null,
      spent: bucket?.spent ?? 0,
      repaid: bucket?.repaid ?? 0,
      remaining: bucket?.remaining ?? 0,
      dueDate: bucket?.dueDate ?? graceDueDate(ym, resolveGraceMonths(credit)),
      overdue: bucket?.overdue ?? false,
      avgDebt: debtCount > 0 ? debtSum / debtCount : last.avgDebt,
      maxDebt,
      days: [...days].sort((a, b) => compareDate(b.date, a.date)),
    }
  })

  return {
    creditAccountId: credit.id,
    linkedAccountId: linkedId,
    cumulativeEarned: lockedEarnings,
    cumulativeEarnedBase,
    cumulativeInterestBase,
    totalDebt,
    totalDebtBase,
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
