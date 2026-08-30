import type { AccountFund } from '../types/wallet'

export const FREE_MONEY_SYSTEM_KEY = 'free_money' as const
export const FREE_MONEY_NAME = 'Свободные деньги'

export function isFreeMoneyFund(fund: Pick<AccountFund, 'systemKey'>): boolean {
  return fund.systemKey === FREE_MONEY_SYSTEM_KEY
}

export function yearMonth(date: string): string {
  return date.slice(0, 7)
}

export function userFundsByInboundPriority(funds: AccountFund[]): AccountFund[] {
  return funds
    .filter((f) => !isFreeMoneyFund(f))
    .slice()
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

export function userFundsByOutboundPriority(funds: AccountFund[]): AccountFund[] {
  return funds
    .filter((f) => !isFreeMoneyFund(f))
    .slice()
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

export function freeMoneyFund(funds: AccountFund[]): AccountFund | undefined {
  return funds.find(isFreeMoneyFund)
}

/**
 * Split an inbound transfer by remaining monthly targets, highest priority first.
 * Remainder goes to free money. Allocations sum to `amount` (or the whole amount if no free money).
 */
export function allocateInboundTransfer(
  amount: number,
  funds: AccountFund[],
  filledThisMonth: Readonly<Record<string, number>>,
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const fund of funds) result[fund.id] = 0
  if (!(amount > 0) || !Number.isFinite(amount)) return result

  let leftover = amount
  for (const fund of userFundsByInboundPriority(funds)) {
    const filled = filledThisMonth[fund.id] ?? 0
    const remaining = Math.max(0, fund.monthlyTarget - filled)
    const take = Math.min(remaining, leftover)
    result[fund.id] = take
    leftover -= take
    if (leftover <= 0) break
  }

  const free = freeMoneyFund(funds)
  if (free) {
    result[free.id] = leftover
  } else if (leftover > 0) {
    const first = userFundsByInboundPriority(funds)[0]
    if (first) result[first.id] += leftover
  }
  return result
}

/**
 * Withdraw from free money first, then user funds from lowest priority up.
 */
export function allocateOutboundTransfer(
  amount: number,
  funds: AccountFund[],
  balances: Readonly<Record<string, number>>,
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const fund of funds) result[fund.id] = 0
  if (!(amount > 0) || !Number.isFinite(amount)) return result

  let leftover = amount
  const order: AccountFund[] = []
  const free = freeMoneyFund(funds)
  if (free) order.push(free)
  order.push(...userFundsByOutboundPriority(funds))

  for (const fund of order) {
    const available = Math.max(0, balances[fund.id] ?? 0)
    const take = Math.min(available, leftover)
    result[fund.id] = take
    leftover -= take
    if (leftover <= 0) break
  }

  if (leftover > 0 && free) {
    result[free.id] += leftover
  } else if (leftover > 0) {
    const last = order[order.length - 1]
    if (last) result[last.id] += leftover
  }
  return result
}

export function applyAllocation(
  balances: Record<string, number>,
  allocation: Record<string, number>,
  sign: 1 | -1,
): void {
  for (const [id, value] of Object.entries(allocation)) {
    balances[id] = (balances[id] ?? 0) + sign * value
  }
}

export function applyFilledMonth(
  filledThisMonth: Record<string, number>,
  allocation: Record<string, number>,
  funds: AccountFund[],
): void {
  for (const fund of userFundsByInboundPriority(funds)) {
    const add = allocation[fund.id] ?? 0
    if (add <= 0) continue
    filledThisMonth[fund.id] = (filledThisMonth[fund.id] ?? 0) + add
  }
}
