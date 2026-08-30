import {
  balanceOnDate,
  convertAmount,
  snapshotDates,
  type RateBook,
} from '../engine/growthEngine'
import type {
  Account,
  AccountFund,
  BalanceSnapshot,
  Transfer,
  WalletSettings,
} from '../types/wallet'
import {
  allocateInboundTransfer,
  allocateOutboundTransfer,
  applyAllocation,
  applyFilledMonth,
  freeMoneyFund,
  isFreeMoneyFund,
  yearMonth,
} from './fundAllocation'

const EPS = 1e-8

function inboundAmountInAccountCurrency(
  transfer: Transfer,
  accountId: string,
  accounts: Account[],
  settings: WalletSettings,
  rateBook?: RateBook,
): number {
  if (transfer.toAccountId !== accountId) return 0
  const from = accounts.find((a) => a.id === transfer.fromAccountId)
  const to = accounts.find((a) => a.id === accountId)
  if (!from || !to) return transfer.amount
  if (from.currency === to.currency) return transfer.amount
  const converted = convertAmount(
    transfer.amount,
    from.currency,
    to.currency,
    settings,
    transfer.date,
    rateBook,
  )
  return Number.isFinite(converted) ? converted : transfer.amount
}

function inOpenClosedInterval(date: string, t0: string | null, t1: string): boolean {
  if (t0 && date.localeCompare(t0) <= 0) return false
  if (date.localeCompare(t1) > 0) return false
  return true
}

function emptyBalances(funds: AccountFund[]): Record<string, number> {
  const balances: Record<string, number> = {}
  for (const fund of funds) balances[fund.id] = 0
  return balances
}

function sumBalances(balances: Record<string, number>): number {
  let sum = 0
  for (const value of Object.values(balances)) sum += value
  return sum
}

function distributeGrowth(
  delta: number,
  balances: Record<string, number>,
  funds: AccountFund[],
): void {
  if (!Number.isFinite(delta) || Math.abs(delta) < EPS) return
  const free = freeMoneyFund(funds)
  const freeId = free?.id
  const ids = funds.map((f) => f.id)
  const positiveTotal = ids.reduce((s, id) => s + Math.max(0, balances[id] ?? 0), 0)

  if (positiveTotal <= EPS) {
    if (freeId) balances[freeId] = (balances[freeId] ?? 0) + delta
    else if (ids[0]) balances[ids[0]] = (balances[ids[0]] ?? 0) + delta
    return
  }

  if (delta >= 0) {
    const weighted = ids.filter((id) => Math.max(0, balances[id] ?? 0) > 0)
    let assigned = 0
    for (let i = 0; i < weighted.length; i += 1) {
      const id = weighted[i]!
      const weight = Math.max(0, balances[id] ?? 0)
      const isLast = i === weighted.length - 1
      const share = isLast ? delta - assigned : (weight / positiveTotal) * delta
      balances[id] = (balances[id] ?? 0) + share
      assigned += share
    }
    return
  }

  let remaining = -delta
  for (const id of ids) {
    if (remaining <= EPS) break
    const available = Math.max(0, balances[id] ?? 0)
    if (available <= 0) continue
    const take = Math.min(available, remaining * (available / positiveTotal))
    balances[id] = (balances[id] ?? 0) - take
    remaining -= take
  }
  if (remaining > EPS) {
    for (const id of ids) {
      if (remaining <= EPS) break
      const available = Math.max(0, balances[id] ?? 0)
      const take = Math.min(available, remaining)
      balances[id] = (balances[id] ?? 0) - take
      remaining -= take
    }
  }
  if (remaining > EPS && freeId) {
    balances[freeId] = (balances[freeId] ?? 0) - remaining
  }
}

function normalizeToAccountBalance(
  balances: Record<string, number>,
  funds: AccountFund[],
  accountBalance: number,
): void {
  const free = freeMoneyFund(funds)
  if (!free) return
  const others = sumBalances(balances) - (balances[free.id] ?? 0)
  balances[free.id] = accountBalance - others
}

function applyTransfersInInterval(
  funds: AccountFund[],
  balances: Record<string, number>,
  filledByMonth: Map<string, Record<string, number>>,
  transfers: Transfer[],
  accountId: string,
  t0: string | null,
  t1: string,
  accounts: Account[],
  settings: WalletSettings,
  rateBook?: RateBook,
): void {
  const relevant = transfers
    .filter(
      (t) =>
        (t.toAccountId === accountId || t.fromAccountId === accountId) &&
        inOpenClosedInterval(t.date, t0, t1),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

  for (const transfer of relevant) {
    const month = yearMonth(transfer.date)
    let filled = filledByMonth.get(month)
    if (!filled) {
      filled = {}
      filledByMonth.set(month, filled)
    }

    if (transfer.toAccountId === accountId) {
      const amount = inboundAmountInAccountCurrency(
        transfer,
        accountId,
        accounts,
        settings,
        rateBook,
      )
      const allocation = allocateInboundTransfer(amount, funds, filled)
      applyAllocation(balances, allocation, 1)
      applyFilledMonth(filled, allocation, funds)
    } else {
      const allocation = allocateOutboundTransfer(transfer.amount, funds, balances)
      applyAllocation(balances, allocation, -1)
    }
  }
}

export interface FundBalanceRow {
  fund: AccountFund
  balance: number
  share: number
  filledThisMonth: number
  remainingThisMonth: number
}

export interface AccountFundsState {
  accountId: string
  asOfDate: string | null
  accountBalance: number
  rows: FundBalanceRow[]
}

function buildRows(
  funds: AccountFund[],
  balances: Record<string, number>,
  filledThisMonth: Record<string, number>,
  accountBalance: number,
): FundBalanceRow[] {
  const denom = Math.abs(accountBalance) > EPS ? Math.abs(accountBalance) : 0
  const sorted = funds.slice().sort((a, b) => {
    if (isFreeMoneyFund(a) !== isFreeMoneyFund(b)) return isFreeMoneyFund(a) ? 1 : -1
    return b.priority - a.priority || a.name.localeCompare(b.name)
  })
  return sorted.map((fund) => {
    const balance = balances[fund.id] ?? 0
    const filled = isFreeMoneyFund(fund) ? 0 : (filledThisMonth[fund.id] ?? 0)
    return {
      fund,
      balance,
      share: denom > 0 ? balance / accountBalance : 0,
      filledThisMonth: filled,
      remainingThisMonth: isFreeMoneyFund(fund)
        ? 0
        : Math.max(0, fund.monthlyTarget - filled),
    }
  })
}

export function buildAccountFundsState(
  accountId: string,
  funds: AccountFund[],
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  accounts: Account[],
  settings: WalletSettings,
  rateBook?: RateBook,
  asOfDate?: string,
): AccountFundsState {
  const accountFunds = funds.filter((f) => f.accountId === accountId)
  const empty: AccountFundsState = {
    accountId,
    asOfDate: asOfDate ?? null,
    accountBalance: 0,
    rows: [],
  }
  if (accountFunds.length === 0) return empty

  const dates = snapshotDates(snapshots)
  const endDate = asOfDate ?? dates[dates.length - 1] ?? null
  const datesToWalk = endDate ? dates.filter((d) => d.localeCompare(endDate) <= 0) : dates

  const balances = emptyBalances(accountFunds)
  const filledByMonth = new Map<string, Record<string, number>>()
  let prevDate: string | null = null
  let lastBalance = 0

  for (const date of datesToWalk) {
    const recorded = balanceOnDate(accountId, date, snapshots)
    if (recorded == null) continue
    applyTransfersInInterval(
      accountFunds,
      balances,
      filledByMonth,
      transfers,
      accountId,
      prevDate,
      date,
      accounts,
      settings,
      rateBook,
    )
    const growth = recorded - sumBalances(balances)
    distributeGrowth(growth, balances, accountFunds)
    normalizeToAccountBalance(balances, accountFunds, recorded)
    lastBalance = recorded
    prevDate = date
  }

  if (endDate && prevDate !== endDate) {
    applyTransfersInInterval(
      accountFunds,
      balances,
      filledByMonth,
      transfers,
      accountId,
      prevDate,
      endDate,
      accounts,
      settings,
      rateBook,
    )
    const snapOnEnd = snapshots.some(
      (s) => s.date === endDate && s.lines.some((l) => l.accountId === accountId),
    )
    if (snapOnEnd) {
      const recorded = balanceOnDate(accountId, endDate, snapshots)
      if (recorded != null) {
        const growth = recorded - sumBalances(balances)
        distributeGrowth(growth, balances, accountFunds)
        normalizeToAccountBalance(balances, accountFunds, recorded)
        lastBalance = recorded
      }
    } else {
      lastBalance = sumBalances(balances)
    }
  }

  const month = yearMonth(endDate ?? '')
  const filledThisMonth = month ? (filledByMonth.get(month) ?? {}) : {}

  return {
    accountId,
    asOfDate: endDate,
    accountBalance: lastBalance,
    rows: buildRows(accountFunds, balances, filledThisMonth, lastBalance),
  }
}

export function previewInboundAllocation(
  accountId: string,
  amountInAccountCurrency: number,
  transferDate: string,
  funds: AccountFund[],
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  accounts: Account[],
  settings: WalletSettings,
  rateBook?: RateBook,
): FundBalanceRow[] {
  const state = buildAccountFundsState(
    accountId,
    funds,
    snapshots,
    transfers,
    accounts,
    settings,
    rateBook,
    transferDate,
  )
  const accountFunds = funds.filter((f) => f.accountId === accountId)
  if (accountFunds.length === 0) return []

  const filled: Record<string, number> = {}
  for (const row of state.rows) {
    if (!isFreeMoneyFund(row.fund)) filled[row.fund.id] = row.filledThisMonth
  }
  const allocation = allocateInboundTransfer(amountInAccountCurrency, accountFunds, filled)
  return state.rows
    .map((row) => ({
      ...row,
      balance: allocation[row.fund.id] ?? 0,
    }))
    .filter((row) => Math.abs(row.balance) > EPS)
}
