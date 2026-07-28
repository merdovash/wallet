import { useMemo, useState } from 'react'
import { buildCurrencyReport } from '../../lib/currencyReport'
import { formatCurrency, signedAmount } from '../../lib/format'
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
}

export function CurrencyReportTable({
  accountCount,
  onOpenAccount,
  baseCurrencyLast = false,
  foreignOnly = false,
}: CurrencyReportTableProps) {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const report = useMemo(
    () =>
      buildCurrencyReport(accounts, snapshots, transfers, settings, rateBook, {
        baseCurrencyLast,
        foreignOnly,
      }),
    [accounts, snapshots, transfers, settings, rateBook, baseCurrencyLast, foreignOnly],
  )

  function toggle(currency: string) {
    setExpanded((prev) => ({ ...prev, [currency]: !prev[currency] }))
  }

  const totalAccounts = report.rows.reduce((s, r) => s + r.accountCount, 0)

  return (
    <Card className="!p-0">
      <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Счета</h2>
        <p className="text-sm text-slate-500">{accountCountLabel(accountCount)}</p>
      </div>
      {report.rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="Нет данных"
            description="Добавьте счета во вкладке «Счета», затем зафиксируйте остатки через чек-ин."
          />
        </div>
      ) : (
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="w-[42%] px-3 py-3 font-medium sm:w-auto sm:px-4">Валюта</th>
              <th className="hidden px-4 py-3 font-medium tabular-nums md:table-cell">Счетов</th>
              <th className="w-[32%] px-3 py-3 font-medium tabular-nums sm:px-4">Остаток</th>
              <th className="hidden px-4 py-3 font-medium tabular-nums lg:table-cell">
                В {report.baseCurrency}
              </th>
              <th className="hidden px-4 py-3 font-medium tabular-nums md:table-cell">Доля</th>
              <th className="w-[26%] px-3 py-3 text-right font-medium tabular-nums sm:px-4 sm:text-left">
                Прирост
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
                  accounts={row.accounts}
                />
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <td className="px-3 py-3 sm:px-4">
                <div>Итого</div>
                <div className="text-xs font-normal text-slate-500 md:hidden">
                  {accountCountLabel(totalAccounts)} · 100%
                </div>
              </td>
              <td className="hidden px-4 py-3 tabular-nums md:table-cell">{totalAccounts}</td>
              <td className="px-3 py-3 tabular-nums sm:px-4">
                <div className="lg:hidden">
                  {formatCurrency(report.grandTotalBase, report.baseCurrency)}
                </div>
                <div className="hidden text-slate-400 lg:block">—</div>
              </td>
              <td className="hidden px-4 py-3 tabular-nums lg:table-cell">
                {formatCurrency(report.grandTotalBase, report.baseCurrency)}
              </td>
              <td className="hidden px-4 py-3 tabular-nums md:table-cell">100%</td>
              <td className="px-3 py-3 text-right tabular-nums sm:px-4 sm:text-left">
                {signedAmount(report.grandGrowthBase, report.baseCurrency)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </Card>
  )
}

function growthTone(value: number): string {
  if (value > 0) return 'text-emerald-700'
  if (value < 0) return 'text-red-600'
  return 'text-slate-700'
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
  accounts: {
    accountId: string
    name: string
    balance: number
    balanceBase: number
    growth: number
    growthBase: number
  }[]
}) {
  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50">
        <td className="px-3 py-3 sm:px-4">
          <button
            type="button"
            onClick={onToggle}
            className="flex min-w-0 items-start gap-2 text-left font-medium text-slate-900"
          >
            <span className="inline-block w-3 shrink-0 text-slate-400">{open ? '▾' : '▸'}</span>
            <span className="min-w-0">
              <span className="block truncate">
                {currency}
                <span className="ml-1.5 hidden font-normal text-slate-500 sm:inline">{label}</span>
              </span>
              <span className="mt-0.5 block text-xs font-normal text-slate-500 md:hidden">
                {accountCountLabel(accountCount)} · {formatShare(share)}
              </span>
            </span>
          </button>
        </td>
        <td className="hidden px-4 py-3 tabular-nums text-slate-700 md:table-cell">
          {accountCount}
        </td>
        <td className="px-3 py-3 tabular-nums text-slate-900 sm:px-4">
          <div className="break-words">{formatCurrency(balance, currency)}</div>
          {currency !== baseCurrency && (
            <div className="mt-0.5 text-xs text-slate-500 lg:hidden">
              ≈ {formatCurrency(balanceBase, baseCurrency)}
            </div>
          )}
        </td>
        <td className="hidden px-4 py-3 tabular-nums text-slate-900 lg:table-cell">
          {formatCurrency(balanceBase, baseCurrency)}
        </td>
        <td className="hidden px-4 py-3 tabular-nums text-slate-700 md:table-cell">
          {formatShare(share)}
        </td>
        <td className="px-3 py-3 text-right tabular-nums sm:px-4 sm:text-left">
          <div className={`break-words ${growthTone(growth)}`}>{signedAmount(growth, currency)}</div>
          {currency !== baseCurrency && (
            <div className={`mt-0.5 text-xs ${growthTone(growthBase)}`}>
              ≈ {signedAmount(growthBase, baseCurrency)}
            </div>
          )}
        </td>
      </tr>
      {open &&
        accounts.map((acc) => (
          <tr key={acc.accountId} className="border-b border-slate-50 bg-slate-50/70">
            <td className="px-3 py-2 pl-9 sm:px-4 sm:pl-10">
              <button
                type="button"
                onClick={() => onOpenAccount(acc.accountId)}
                className="text-left text-slate-700 hover:text-blue-700 hover:underline"
              >
                {acc.name}
              </button>
            </td>
            <td className="hidden px-4 py-2 text-slate-400 md:table-cell">—</td>
            <td className="px-3 py-2 tabular-nums text-slate-700 sm:px-4">
              <div className="break-words">{formatCurrency(acc.balance, currency)}</div>
              {currency !== baseCurrency && (
                <div className="mt-0.5 text-xs text-slate-500 lg:hidden">
                  ≈ {formatCurrency(acc.balanceBase, baseCurrency)}
                </div>
              )}
            </td>
            <td className="hidden px-4 py-2 tabular-nums text-slate-700 lg:table-cell">
              {formatCurrency(acc.balanceBase, baseCurrency)}
            </td>
            <td className="hidden px-4 py-2 text-slate-400 md:table-cell">—</td>
            <td className="px-3 py-2 text-right tabular-nums sm:px-4 sm:text-left">
              <div className={`break-words ${growthTone(acc.growth)}`}>
                {signedAmount(acc.growth, currency)}
              </div>
              {currency !== baseCurrency && (
                <div className={`mt-0.5 text-xs ${growthTone(acc.growthBase)}`}>
                  ≈ {signedAmount(acc.growthBase, baseCurrency)}
                </div>
              )}
            </td>
          </tr>
        ))}
    </>
  )
}
