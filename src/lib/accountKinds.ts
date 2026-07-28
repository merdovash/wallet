import type { Account, AccountKind } from '../types/wallet'

export const ACCOUNT_KINDS = [
  'operational',
  'fund',
  'deposit',
  'investment',
  'cash',
  'credit',
] as const satisfies readonly AccountKind[]

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  operational: 'Оперативный',
  fund: 'Фонд',
  deposit: 'Вклад',
  investment: 'Инвестиции',
  cash: 'Наличка',
  credit: 'Кредитка',
}

/** Display order on the types summary tab. */
export const ACCOUNT_KIND_ORDER: AccountKind[] = [
  'operational',
  'fund',
  'deposit',
  'investment',
  'cash',
  'credit',
]

/** Kinds whose balance changes count toward portfolio growth. */
const GROWTH_KINDS = new Set<AccountKind>(['fund', 'deposit', 'investment'])

export function normalizeAccountKind(kind: string | null | undefined): AccountKind {
  if (kind === 'credit') return 'credit'
  if (kind === 'cash') return 'cash'
  if (kind === 'investment') return 'investment'
  if (kind === 'deposit') return 'deposit'
  if (kind === 'fund') return 'fund'
  if (kind === 'operational') return 'operational'
  // Legacy: bank / regular → operational (checking-like)
  if (kind === 'bank' || kind === 'regular') return 'operational'
  return 'operational'
}

export function isCreditKind(kind: AccountKind): boolean {
  return kind === 'credit'
}

/** Operational, cash and credit are excluded from growth / return metrics. */
export function isGrowthKind(kind: AccountKind): boolean {
  return GROWTH_KINDS.has(kind)
}

export function isGrowthAccount(account: Pick<Account, 'kind' | 'archived'>): boolean {
  if (account.archived) return false
  return isGrowthKind(normalizeAccountKind(account.kind))
}

export function accountKindLabel(kind: AccountKind): string {
  return ACCOUNT_KIND_LABELS[kind]
}

export function growthAccounts<T extends Pick<Account, 'kind' | 'archived'>>(accounts: T[]): T[] {
  return accounts.filter(isGrowthAccount)
}
