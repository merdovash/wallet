import { useMemo } from 'react'
import {
  balanceOnDate,
  netWorthAmount,
  type RateBook,
} from '../../engine/growthEngine'
import { accountKindLabel, isGrowthAccount, normalizeAccountKind } from '../../lib/accountKinds'
import { toBase } from '../../lib/currency'
import { resolvePivotForDate } from '../../lib/cbrRates'
import { formatCurrency, formatDateDisplay, signedAmount } from '../../lib/format'
import type { Account, AccountPoint, BalanceSnapshot, TotalPoint, WalletSettings } from '../../types/wallet'
import { StackPanel } from '../ui/StackPanel'

interface DayTotalsPanelProps {
  open: boolean
  date: string | null
  onClose: () => void
  mode: 'total' | 'account'
  accounts: Account[]
  snapshots: BalanceSnapshot[]
  settings: WalletSettings
  rateBook?: RateBook
  series: TotalPoint[] | AccountPoint[]
  accountId?: string | null
}

export function DayTotalsPanel({
  open,
  date,
  onClose,
  mode,
  accounts,
  snapshots,
  settings,
  rateBook,
  series,
  accountId,
}: DayTotalsPanelProps) {
  const point = useMemo(
    () => (date ? series.find((p) => p.date === date) : undefined),
    [date, series],
  )

  const snapshot = useMemo(
    () => (date ? snapshots.find((s) => s.date === date) : undefined),
    [date, snapshots],
  )

  const total = useMemo(() => {
    if (!date || mode !== 'total') return null
    return (point as TotalPoint | undefined)?.total ?? null
  }, [date, mode, point])

  const accountRows = useMemo(() => {
    if (!date || mode !== 'total') return []
    const pivot =
      (rateBook ? resolvePivotForDate(date, rateBook) : null) ??
      (settings.baseCurrency === 'RUB' ? settings.exchangeRates : null)
    return accounts
      .filter((a) => !a.archived && isGrowthAccount(a))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((account) => {
        const recorded = balanceOnDate(account.id, date, snapshots)
        if (recorded == null) return null
        const nw = netWorthAmount(account, recorded)
        const display =
          account.kind === 'credit'
            ? Math.max(0, (account.creditLimit ?? 0) - recorded)
            : recorded
        return {
          id: account.id,
          name: account.name,
          kind: normalizeAccountKind(account.kind),
          currency: account.currency,
          display,
          base: toBase(nw, account.currency, settings.baseCurrency, settings.exchangeRates, pivot),
        }
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
  }, [date, mode, accounts, snapshots, settings, rateBook])

  const detailAccount = accountId ? accounts.find((a) => a.id === accountId) : null
  const accountPoint = point as AccountPoint | undefined
  const totalPoint = point as TotalPoint | undefined

  return (
    <StackPanel
      open={open && !!date}
      title={date ? formatDateDisplay(date) : 'Итоги'}
      onClose={onClose}
    >
      {date && (
        <div className="space-y-4">
          {mode === 'total' ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Stat
                  label="Капитал роста"
                  value={formatCurrency(total ?? 0, settings.baseCurrency)}
                />
                <Stat
                  label="Прирост к первому чек-ину"
                  value={signedAmount(totalPoint?.growth ?? 0, settings.baseCurrency)}
                  tone={
                    (totalPoint?.growth ?? 0) > 0
                      ? 'up'
                      : (totalPoint?.growth ?? 0) < 0
                        ? 'down'
                        : 'neutral'
                  }
                />
                <Stat
                  label="Доход за день"
                  value={formatCurrency(snapshot?.income ?? 0, settings.baseCurrency)}
                />
                <Stat
                  label="Расход за день"
                  value={formatCurrency(snapshot?.expense ?? 0, settings.baseCurrency)}
                />
              </div>
              {snapshot?.note ? (
                <p className="text-sm text-slate-500">Комментарий: {snapshot.note}</p>
              ) : null}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Счета</h3>
                {accountRows.length === 0 ? (
                  <p className="text-sm text-slate-500">Нет остатков на эту дату.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {accountRows.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-900">{row.name}</span>
                          <span className="text-xs text-slate-500">
                            {accountKindLabel(row.kind)} · {row.currency}
                          </span>
                        </span>
                        <span className="shrink-0 text-right tabular-nums">
                          <span className="block text-slate-900">
                            {formatCurrency(row.display, row.currency)}
                          </span>
                          {row.currency !== settings.baseCurrency && (
                            <span className="text-xs text-slate-500">
                              ≈ {formatCurrency(row.base, settings.baseCurrency)}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat
                label="Остаток"
                value={formatCurrency(
                  accountPoint?.balance ?? 0,
                  detailAccount?.currency ?? settings.baseCurrency,
                )}
              />
              <Stat
                label="Прирост (без переводов)"
                value={signedAmount(
                  accountPoint?.growth ?? 0,
                  detailAccount?.currency ?? settings.baseCurrency,
                )}
                tone={
                  (accountPoint?.growth ?? 0) > 0
                    ? 'up'
                    : (accountPoint?.growth ?? 0) < 0
                      ? 'down'
                      : 'neutral'
                }
              />
            </div>
          )}
        </div>
      )}
    </StackPanel>
  )
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'up' | 'down' | 'neutral'
}) {
  const toneCls =
    tone === 'up' ? 'text-emerald-700' : tone === 'down' ? 'text-red-600' : 'text-slate-900'
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 text-base font-semibold tabular-nums ${toneCls}`}>{value}</p>
    </div>
  )
}
