import { useEffect, useMemo, useState } from 'react'
import { buildCurrencyReport } from '../../lib/currencyReport'
import {
  formatCurrency,
  formatDateDisplay,
  signedAmount,
  todayIsoDate,
} from '../../lib/format'
import { snapshotDates } from '../../engine/growthEngine'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Card, EmptyState } from '../ui/FormControls'

function formatShare(share: number): string {
  return `${(share * 100).toFixed(1).replace('.', ',')}%`
}

export function CurrencyReportPanel() {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)
  const ensureRates = useRatesStore((s) => s.ensureRates)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const dates = useMemo(() => snapshotDates(snapshots), [snapshots])

  useEffect(() => {
    void ensureRates([...dates, todayIsoDate()])
  }, [dates, ensureRates])

  const report = useMemo(
    () => buildCurrencyReport(accounts, snapshots, transfers, settings, rateBook),
    [accounts, snapshots, transfers, settings, rateBook],
  )

  function toggle(currency: string) {
    setExpanded((prev) => ({ ...prev, [currency]: !prev[currency] }))
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Сводный отчёт</h1>
        <p className="text-sm text-slate-500">
          Остатки и прирост по валютам
          {report.asOfDate ? ` на ${formatDateDisplay(report.asOfDate)}` : ''}
        </p>
      </div>

      {report.rows.length === 0 ? (
        <EmptyState
          title="Нет данных"
          description="Добавьте счета и сделайте чек-ин, чтобы увидеть сводку по валютам."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <p className="text-sm text-slate-500">Всего ({report.baseCurrency})</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {formatCurrency(report.grandTotalBase, report.baseCurrency)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Прирост ({report.baseCurrency})</p>
              <p
                className={`mt-1 text-xl font-semibold ${
                  report.grandGrowthBase > 0
                    ? 'text-emerald-700'
                    : report.grandGrowthBase < 0
                      ? 'text-red-600'
                      : 'text-slate-900'
                }`}
              >
                {signedAmount(report.grandGrowthBase, report.baseCurrency)}
              </p>
            </Card>
          </div>

          <Card className="!p-0 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">Валюта</th>
                  <th className="px-4 py-3 font-medium tabular-nums">Счетов</th>
                  <th className="px-4 py-3 font-medium tabular-nums">Остаток</th>
                  <th className="px-4 py-3 font-medium tabular-nums">
                    В {report.baseCurrency}
                  </th>
                  <th className="px-4 py-3 font-medium tabular-nums">Доля</th>
                  <th className="px-4 py-3 font-medium tabular-nums">Прирост</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => {
                  const open = expanded[row.currency]
                  const growthColor =
                    row.growthBase > 0
                      ? 'text-emerald-700'
                      : row.growthBase < 0
                        ? 'text-red-600'
                        : 'text-slate-700'
                  return (
                    <CurrencyGroup
                      key={row.currency}
                      open={!!open}
                      onToggle={() => toggle(row.currency)}
                      currency={row.currency}
                      label={row.label}
                      accountCount={row.accountCount}
                      balance={row.balance}
                      balanceBase={row.balanceBase}
                      share={row.share}
                      growth={row.growth}
                      growthBase={row.growthBase}
                      growthColor={growthColor}
                      baseCurrency={report.baseCurrency}
                      accounts={row.accounts}
                    />
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                  <td className="px-4 py-3">Итого</td>
                  <td className="px-4 py-3 tabular-nums">
                    {report.rows.reduce((s, r) => s + r.accountCount, 0)}
                  </td>
                  <td className="px-4 py-3 text-slate-400">—</td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatCurrency(report.grandTotalBase, report.baseCurrency)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">100%</td>
                  <td className="px-4 py-3 tabular-nums">
                    {signedAmount(report.grandGrowthBase, report.baseCurrency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </>
      )}
    </div>
  )
}

function CurrencyGroup({
  open,
  onToggle,
  currency,
  label,
  accountCount,
  balance,
  balanceBase,
  share,
  growth,
  growthBase,
  growthColor,
  baseCurrency,
  accounts,
}: {
  open: boolean
  onToggle: () => void
  currency: string
  label: string
  accountCount: number
  balance: number
  balanceBase: number
  share: number
  growth: number
  growthBase: number
  growthColor: string
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
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-2 text-left font-medium text-slate-900"
          >
            <span className="inline-block w-3 text-slate-400">{open ? '▾' : '▸'}</span>
            <span>
              {currency}
              <span className="ml-2 font-normal text-slate-500">{label}</span>
            </span>
          </button>
        </td>
        <td className="px-4 py-3 tabular-nums text-slate-700">{accountCount}</td>
        <td className="px-4 py-3 tabular-nums text-slate-900">
          {formatCurrency(balance, currency)}
        </td>
        <td className="px-4 py-3 tabular-nums text-slate-900">
          {formatCurrency(balanceBase, baseCurrency)}
        </td>
        <td className="px-4 py-3 tabular-nums text-slate-700">{formatShare(share)}</td>
        <td className={`px-4 py-3 tabular-nums ${growthColor}`}>
          <div>{signedAmount(growth, currency)}</div>
          {currency !== baseCurrency && (
            <div className="text-xs opacity-80">
              ≈ {signedAmount(growthBase, baseCurrency)}
            </div>
          )}
        </td>
      </tr>
      {open &&
        accounts.map((acc) => {
          const accGrowthColor =
            acc.growthBase > 0
              ? 'text-emerald-700'
              : acc.growthBase < 0
                ? 'text-red-600'
                : 'text-slate-600'
          return (
            <tr key={acc.accountId} className="border-b border-slate-50 bg-slate-50/70">
              <td className="px-4 py-2 pl-10 text-slate-700">{acc.name}</td>
              <td className="px-4 py-2 text-slate-400">—</td>
              <td className="px-4 py-2 tabular-nums text-slate-700">
                {formatCurrency(acc.balance, currency)}
              </td>
              <td className="px-4 py-2 tabular-nums text-slate-700">
                {formatCurrency(acc.balanceBase, baseCurrency)}
              </td>
              <td className="px-4 py-2 text-slate-400">—</td>
              <td className={`px-4 py-2 tabular-nums ${accGrowthColor}`}>
                <div>{signedAmount(acc.growth, currency)}</div>
                {currency !== baseCurrency && (
                  <div className="text-xs opacity-80">
                    ≈ {signedAmount(acc.growthBase, baseCurrency)}
                  </div>
                )}
              </td>
            </tr>
          )
        })}
    </>
  )
}
