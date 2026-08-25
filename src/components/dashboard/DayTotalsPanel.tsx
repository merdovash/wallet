import { useMemo, useState } from 'react'
import {
  balanceOnDate,
  netWorthAmount,
  snapshotDates,
  type RateBook,
} from '../../engine/growthEngine'
import { accountKindLabel, isGrowthAccount, normalizeAccountKind } from '../../lib/accountKinds'
import { toBase } from '../../lib/currency'
import { resolvePivotForDate } from '../../lib/cbrRates'
import { formatCurrency, formatDateDisplay, signedAmount } from '../../lib/format'
import { buildPeriodReturn, dailyGrowthInterval } from '../../lib/monthlyReturns'
import { useFxModeStore } from '../../store/fxModeStore'
import { useWalletStore } from '../../store/walletStore'
import type { Account, AccountPoint, BalanceSnapshot, TotalPoint, WalletSettings } from '../../types/wallet'
import { DailyBreakdownPanel } from '../daily/DailyBreakdownPanel'
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

function pivotForDate(
  date: string,
  settings: WalletSettings,
  rateBook?: RateBook,
): Record<string, number> | null {
  return (
    (rateBook ? resolvePivotForDate(date, rateBook) : null) ??
    (settings.baseCurrency === 'RUB' ? settings.exchangeRates : null)
  )
}

function toBaseOnDate(
  amount: number,
  currency: string,
  date: string,
  settings: WalletSettings,
  rateBook?: RateBook,
): number {
  return toBase(
    amount,
    currency,
    settings.baseCurrency,
    settings.exchangeRates,
    pivotForDate(date, settings, rateBook),
  )
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
  const transfers = useWalletStore((s) => s.transfers)
  const fxMode = useFxModeStore((s) => s.fxMode)
  const [breakdownOpen, setBreakdownOpen] = useState(false)

  const checkInDates = useMemo(() => snapshotDates(snapshots), [snapshots])

  const dayBreakdown = useMemo(() => {
    if (!date || mode !== 'total') return null
    const interval = dailyGrowthInterval(date, checkInDates)
    if (!interval) return null
    return buildPeriodReturn(accounts, snapshots, settings, rateBook, transfers, interval)
  }, [date, mode, checkInDates, accounts, snapshots, settings, rateBook, transfers])

  const pointIndex = useMemo(
    () => (date ? series.findIndex((p) => p.date === date) : -1),
    [date, series],
  )
  const point = pointIndex >= 0 ? series[pointIndex] : undefined
  const prevPoint = pointIndex > 0 ? series[pointIndex - 1] : undefined

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
    const pivot = pivotForDate(date, settings, rateBook)
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
  const prevAccountPoint = prevPoint as AccountPoint | undefined
  const totalPoint = point as TotalPoint | undefined
  const prevTotalPoint = prevPoint as TotalPoint | undefined

  const accountDayGrowth = useMemo(() => {
    if (mode !== 'account' || !accountPoint) return null
    if (!prevAccountPoint) return accountPoint.growth
    return accountPoint.growth - prevAccountPoint.growth
  }, [mode, accountPoint, prevAccountPoint])

  const totalDayGrowth = useMemo(() => {
    if (mode !== 'total' || !totalPoint) return null
    if (!prevTotalPoint) return totalPoint.growth
    return totalPoint.growth - prevTotalPoint.growth
  }, [mode, totalPoint, prevTotalPoint])

  const accountCurrency = detailAccount?.currency ?? settings.baseCurrency
  const showAccountBase = Boolean(
    date && detailAccount && detailAccount.currency !== settings.baseCurrency,
  )

  const accountBalanceBase =
    date && accountPoint && showAccountBase
      ? toBaseOnDate(accountPoint.balance, accountCurrency, date, settings, rateBook)
      : null
  const accountGrowthBase =
    date && accountPoint && showAccountBase
      ? toBaseOnDate(accountPoint.growth, accountCurrency, date, settings, rateBook)
      : null
  const accountDayGrowthBase =
    date && accountDayGrowth != null && showAccountBase
      ? toBaseOnDate(accountDayGrowth, accountCurrency, date, settings, rateBook)
      : null

  function handleClose() {
    if (breakdownOpen) {
      setBreakdownOpen(false)
      return
    }
    onClose()
  }

  return (
    <>
      <StackPanel
        open={open && !!date}
        title={date ? formatDateDisplay(date) : 'Итоги'}
        onClose={handleClose}
      >
        {date && (
          <div className="space-y-4">
            {mode === 'total' ? (
              <>
                {dayBreakdown ? (
                  <button
                    type="button"
                    onClick={() => setBreakdownOpen(true)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-left text-sm font-medium text-blue-700 transition hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70"
                  >
                    <span>Расшифровка дня</span>
                    <span aria-hidden className="text-blue-400 dark:text-blue-500">
                      ›
                    </span>
                  </button>
                ) : null}
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
                    label="Прирост за день"
                    value={signedAmount(totalDayGrowth ?? 0, settings.baseCurrency)}
                    tone={
                      (totalDayGrowth ?? 0) > 0
                        ? 'up'
                        : (totalDayGrowth ?? 0) < 0
                          ? 'down'
                          : 'neutral'
                    }
                    hint={prevTotalPoint ? undefined : 'с первого чек-ина'}
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
                  <p className="text-sm text-slate-500 dark:text-slate-400">Комментарий: {snapshot.note}</p>
                ) : null}
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">Счета</h3>
                  {accountRows.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Нет остатков на эту дату.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                      {accountRows.map((row) => (
                        <li
                          key={row.id}
                          className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-slate-900 dark:text-slate-200">{row.name}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {accountKindLabel(row.kind)} · {row.currency}
                            </span>
                          </span>
                          <span className="shrink-0 text-right tabular-nums">
                            <span className="block text-slate-900 dark:text-slate-200">
                              {formatCurrency(row.display, row.currency)}
                            </span>
                            {row.currency !== settings.baseCurrency && (
                              <span className="text-xs text-slate-500 dark:text-slate-400">
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
                  value={formatCurrency(accountPoint?.balance ?? 0, accountCurrency)}
                  subValue={
                    accountBalanceBase != null && Number.isFinite(accountBalanceBase)
                      ? `≈ ${formatCurrency(accountBalanceBase, settings.baseCurrency)}`
                      : undefined
                  }
                />
                <Stat
                  label="Прирост за день"
                  value={signedAmount(accountDayGrowth ?? 0, accountCurrency)}
                  tone={
                    (accountDayGrowth ?? 0) > 0
                      ? 'up'
                      : (accountDayGrowth ?? 0) < 0
                        ? 'down'
                        : 'neutral'
                  }
                  subValue={
                    accountDayGrowthBase != null && Number.isFinite(accountDayGrowthBase)
                      ? `≈ ${signedAmount(accountDayGrowthBase, settings.baseCurrency)}`
                      : undefined
                  }
                  hint={prevAccountPoint ? undefined : 'с первого чек-ина'}
                />
                <Stat
                  label="Прирост с начала (без переводов)"
                  value={signedAmount(accountPoint?.growth ?? 0, accountCurrency)}
                  tone={
                    (accountPoint?.growth ?? 0) > 0
                      ? 'up'
                      : (accountPoint?.growth ?? 0) < 0
                        ? 'down'
                        : 'neutral'
                  }
                  subValue={
                    accountGrowthBase != null && Number.isFinite(accountGrowthBase)
                      ? `≈ ${signedAmount(accountGrowthBase, settings.baseCurrency)}`
                      : undefined
                  }
                />
              </div>
            )}
          </div>
        )}
      </StackPanel>

      <DailyBreakdownPanel
        open={breakdownOpen && !!date}
        onClose={() => setBreakdownOpen(false)}
        periodReturn={dayBreakdown}
        endDate={date}
        currency={settings.baseCurrency}
        fxMode={fxMode}
      />
    </>
  )
}

function Stat({
  label,
  value,
  subValue,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: string
  subValue?: string
  hint?: string
  tone?: 'up' | 'down' | 'neutral'
}) {
  const toneCls =
    tone === 'up'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'down'
        ? 'text-red-600'
        : 'text-slate-900 dark:text-slate-200'
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {label}
        {hint ? <span className="font-normal"> · {hint}</span> : null}
      </p>
      <p className={`mt-0.5 text-base font-semibold tabular-nums ${toneCls}`}>{value}</p>
      {subValue ? (
        <p className="mt-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">{subValue}</p>
      ) : null}
    </div>
  )
}
