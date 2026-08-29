import { useMemo, useState } from 'react'
import { buildCurrencyReport } from '../../lib/currencyReport'
import { formatCurrency, signedAmount } from '../../lib/format'
import { useFxModeStore } from '../../store/fxModeStore'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Card, EmptyState } from '../ui/FormControls'

function formatShare(share: number): string {
  return `${(share * 100).toFixed(1).replace('.', ',')}%`
}

function accountCountLabel(count: number): string {
  if (count === 1) return '1 счёт'
  if (count > 1 && count < 5) return `${count} счёта`
  return `${count} счетов`
}

interface CurrencyReportTableProps {
  accountCount: number
  onOpenAccount: (accountId: string) => void
  /** When true, base currency row is always last (legacy currencies tab). */
  baseCurrencyLast?: boolean
  /** When true, hide base-currency accounts entirely. */
  foreignOnly?: boolean
  /** Include operational/cash/etc. in growth column. */
  allKindsGrowth?: boolean
  /** Column title for growth / FX difference. */
  growthColumnLabel?: string
  /** Follow dashboard FX toggle (default). Currencies tab can force withFx. */
  respectFxMode?: boolean
}

export function CurrencyReportTable({
  accountCount,
  onOpenAccount,
  baseCurrencyLast = false,
  foreignOnly = false,
  allKindsGrowth = false,
  growthColumnLabel = 'Прирост',
  respectFxMode = true,
}: CurrencyReportTableProps) {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)
  const fxMode = useFxModeStore((s) => s.fxMode)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const effectiveFxMode = respectFxMode ? fxMode : 'withFx'
  const withoutFx = effectiveFxMode === 'withoutFx'

  const report = useMemo(
    () =>
      buildCurrencyReport(accounts, snapshots, transfers, settings, rateBook, {
        baseCurrencyLast,
        foreignOnly,
        allKindsGrowth,
        fxMode: effectiveFxMode,
      }),
    [
      accounts,
      snapshots,
      transfers,
      settings,
      rateBook,
      baseCurrencyLast,
      foreignOnly,
      allKindsGrowth,
      effectiveFxMode,
    ],
  )

  function toggle(currency: string) {
    setExpanded((prev) => ({ ...prev, [currency]: !prev[currency] }))
  }

  const totalAccounts = report.rows.reduce((s, r) => s + r.accountCount, 0)
  const columnLabel =
    withoutFx && growthColumnLabel === 'Прирост' ? 'Прирост · без курса' : growthColumnLabel

  return (
    <Card className="!p-0" dataQa="table-currencies">
      <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Счета</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{accountCountLabel(accountCount)}</p>
      </div>
      {report.rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="Нет данных"
            description="Добавьте счета во вкладке «Счета», затем зафиксируйте остатки через чек-ин."
          />
        </div>
      ) : (
        <div className="overflow-x-hidden">
          <table className="w-full table-fixed text-xs sm:text-sm" data-qa="table-currencies-body">
            <colgroup>
              <col className="w-[36%] sm:w-[28%]" />
              <col className="hidden md:table-column md:w-[10%]" />
              <col className="w-[32%] sm:w-[22%]" />
              <col className="hidden lg:table-column lg:w-[18%]" />
              <col className="hidden md:table-column md:w-[10%]" />
              <col className="w-[32%] sm:w-[22%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400">
                <th className="px-2 py-2 font-medium sm:px-4 sm:py-3">Валюта</th>
                <th className="hidden whitespace-nowrap px-4 py-3 font-medium tabular-nums md:table-cell">
                  Счетов
                </th>
                <th className="whitespace-nowrap px-2 py-2 font-medium tabular-nums sm:px-4 sm:py-3">
                  Остаток
                </th>
                <th className="hidden whitespace-nowrap px-4 py-3 font-medium tabular-nums lg:table-cell">
                  В {report.baseCurrency}
                </th>
                <th className="hidden whitespace-nowrap px-4 py-3 font-medium tabular-nums md:table-cell">
                  Доля
                </th>
                <th className="whitespace-nowrap px-2 py-2 font-medium tabular-nums sm:px-4 sm:py-3">
                  {columnLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => {
                const open = expanded[row.currency]
                return (
                  <CurrencyGroup
                    key={row.currency}
                    open={!!open}
                    onToggle={() => toggle(row.currency)}
                    onOpenAccount={onOpenAccount}
                    currency={row.currency}
                    label={row.label}
                    accountCount={row.accountCount}
                    balance={row.balance}
                    balanceBase={row.balanceBase}
                    share={row.share}
                    growth={row.growth}
                    growthBase={row.growthBase}
                    baseCurrency={report.baseCurrency}
                    withoutFx={withoutFx}
                    accounts={row.accounts}
                  />
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 font-semibold text-slate-900 dark:text-slate-200">
                <td className="px-2 py-2 sm:px-4 sm:py-3">
                  <div>Итого</div>
                  <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400 md:hidden">
                    {accountCountLabel(totalAccounts)} · 100%
                  </div>
                </td>
                <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums md:table-cell">
                  {totalAccounts}
                </td>
                <td className="truncate px-2 py-2 tabular-nums sm:px-4 sm:py-3">
                  <div className="lg:hidden">
                    {formatCurrency(report.grandTotalBase, report.baseCurrency)}
                  </div>
                  <div className="hidden text-slate-400 dark:text-slate-500 lg:block">—</div>
                </td>
                <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums lg:table-cell">
                  {formatCurrency(report.grandTotalBase, report.baseCurrency)}
                </td>
                <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums md:table-cell">100%</td>
                <td className="truncate px-2 py-2 tabular-nums sm:px-4 sm:py-3">
                  {signedAmount(report.grandGrowthBase, report.baseCurrency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  )
}

function growthTone(value: number): string {
  if (value > 0) return 'text-emerald-700 dark:text-emerald-400'
  if (value < 0) return 'text-red-600'
  return 'text-slate-700 dark:text-slate-300'
}

function CurrencyGroup({
  open,
  onToggle,
  onOpenAccount,
  currency,
  label,
  accountCount,
  balance,
  balanceBase,
  share,
  growth,
  growthBase,
  baseCurrency,
  withoutFx,
  accounts,
}: {
  open: boolean
  onToggle: () => void
  onOpenAccount: (accountId: string) => void
  currency: string
  label: string
  accountCount: number
  balance: number
  balanceBase: number
  share: number
  growth: number
  growthBase: number
  baseCurrency: string
  withoutFx: boolean
  accounts: {
    accountId: string
    name: string
    balance: number
    balanceBase: number
    growth: number
    growthBase: number
  }[]
}) {
  const showRub = currency !== baseCurrency
  return (
    <>
      <tr className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60">
        <td className="px-2 py-2 sm:px-4 sm:py-3">
          <button
            type="button"
            onClick={onToggle}
            data-qa={`currency-row-${currency}`}
            className="flex min-w-0 items-start gap-2 text-left font-medium text-slate-900 dark:text-slate-200"
          >
            <span className="inline-block w-3 shrink-0 text-slate-400 dark:text-slate-500">
              {open ? '▾' : '▸'}
            </span>
            <span className="min-w-0">
              <span className="block truncate">
                {currency}
                <span className="ml-1.5 hidden font-normal text-slate-500 dark:text-slate-400 sm:inline">
                  {label}
                </span>
              </span>
              <span className="mt-0.5 block text-xs font-normal text-slate-500 dark:text-slate-400 md:hidden">
                {accountCountLabel(accountCount)} · {formatShare(share)}
              </span>
            </span>
          </button>
        </td>
        <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums text-slate-700 dark:text-slate-300 md:table-cell">
          {accountCount}
        </td>
        <td className="truncate px-2 py-2 tabular-nums text-slate-900 dark:text-slate-200 sm:px-4 sm:py-3">
          <div>{formatCurrency(balance, currency)}</div>
          {showRub && (
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 lg:hidden">
              ≈ {formatCurrency(balanceBase, baseCurrency)}
            </div>
          )}
        </td>
        <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums text-slate-900 dark:text-slate-200 lg:table-cell">
          {formatCurrency(balanceBase, baseCurrency)}
        </td>
        <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums text-slate-700 dark:text-slate-300 md:table-cell">
          {formatShare(share)}
        </td>
        <td className="truncate px-2 py-2 tabular-nums sm:px-4 sm:py-3">
          <div className={growthTone(growth)}>{signedAmount(growth, currency)}</div>
          {showRub && (
            <div className={`mt-0.5 text-xs ${growthTone(growthBase)}`}>
              ≈ {signedAmount(growthBase, baseCurrency)}
              {withoutFx ? (
                <span className="font-normal text-slate-400 dark:text-slate-500"> · Δ×курс</span>
              ) : null}
            </div>
          )}
        </td>
      </tr>
      {open &&
        accounts.map((acc) => (
          <tr
            key={acc.accountId}
            className="border-b border-slate-50 bg-slate-50 dark:bg-slate-800/80"
          >
            <td className="px-2 py-2 pl-7 sm:px-4 sm:py-2 sm:pl-10">
              <button
                type="button"
                onClick={() => onOpenAccount(acc.accountId)}
                data-qa={`currency-account-${acc.accountId}`}
                className="text-left text-slate-700 dark:text-slate-300 hover:text-blue-700 hover:underline"
              >
                {acc.name}
              </button>
            </td>
            <td className="hidden px-4 py-2 text-slate-400 dark:text-slate-500 md:table-cell">—</td>
            <td className="truncate px-2 py-2 tabular-nums text-slate-700 dark:text-slate-300 sm:px-4 sm:py-2">
              <div>{formatCurrency(acc.balance, currency)}</div>
              {showRub && (
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 lg:hidden">
                  ≈ {formatCurrency(acc.balanceBase, baseCurrency)}
                </div>
              )}
            </td>
            <td className="hidden whitespace-nowrap px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300 lg:table-cell">
              {formatCurrency(acc.balanceBase, baseCurrency)}
            </td>
            <td className="hidden px-4 py-2 text-slate-400 dark:text-slate-500 md:table-cell">—</td>
            <td className="truncate px-2 py-2 tabular-nums sm:px-4 sm:py-2">
              <div className={growthTone(acc.growth)}>{signedAmount(acc.growth, currency)}</div>
              {showRub && (
                <div className={`mt-0.5 text-xs ${growthTone(acc.growthBase)}`}>
                  ≈ {signedAmount(acc.growthBase, baseCurrency)}
                  {withoutFx ? (
                    <span className="font-normal text-slate-400 dark:text-slate-500"> · Δ×курс</span>
                  ) : null}
                </div>
              )}
            </td>
          </tr>
        ))}
    </>
  )
}
