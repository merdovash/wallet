import type { AccountKind } from '../types/wallet'

export const ACCOUNT_KINDS = ['bank', 'cash', 'credit', 'investment'] as const

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  bank: 'Банк',
  cash: 'Наличка',
  credit: 'Кредитка',
  investment: 'Инвестиции',
}

/** Display order on the types summary tab. */
export const ACCOUNT_KIND_ORDER: AccountKind[] = ['bank', 'cash', 'credit', 'investment']

export function normalizeAccountKind(kind: string | null | undefined): AccountKind {
  if (kind === 'credit') return 'credit'
  if (kind === 'cash') return 'cash'
  if (kind === 'investment') return 'investment'
  if (kind === 'bank' || kind === 'regular') return 'bank'
  return 'bank'
}

export function isCreditKind(kind: AccountKind): boolean {
  return kind === 'credit'
}

export function accountKindLabel(kind: AccountKind): string {
  return ACCOUNT_KIND_LABELS[kind]
}
