import { useMemo, useState } from 'react'
import { buildAccountTypeReport } from '../../lib/accountTypeReport'
import { formatCurrency, formatPercent, signedAmount } from '../../lib/format'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import type { AccountKind } from '../../types/wallet'
import { Card, EmptyState } from '../ui/FormControls'

function formatShare(share: number): string {
  return `${(share * 100).toFixed(1).replace('.', ',')}%`
}

function accountCountLabel(count: number): string {
  if (count === 1) return '1 счёт'
  if (count > 1 && count < 5) return `${count} счёта`
  return `${count} счетов`
}

function pctTone(value: number | null): string {
  if (value == null) return 'text-slate-500 dark:text-slate-400'
  if (value > 0) return 'text-emerald-700'
  if (value < 0) return 'text-red-600'
  return 'text-slate-700 dark:text-slate-300'
}

interface AccountTypesPanelProps {
  onOpenAccount: (accountId: string) => void
}

export function AccountTypesPanel({ onOpenAccount }: AccountTypesPanelProps) {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)
  const [expanded, setExpanded] = useState<Partial<Record<AccountKind, boolean>>>({})

  const report = useMemo(
    () => buildAccountTypeReport(accounts, snapshots, transfers, settings, rateBook),
    [accounts, snapshots, transfers, settings, rateBook],
  )

  const totalAccounts = report.rows.reduce((s, r) => s + r.accountCount, 0)

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">По типам</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Сводка остатков и прироста по видам счетов
          {report.asOfDate ? ` на ${report.asOfDate}` : ''}
        </p>
      </div>

      {report.rows.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <Card className="!p-2.5 sm:!p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Итого</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100 sm:text-lg">
              {formatCurrency(report.grandTotalBase, report.baseCurrency)}
            </p>
          </Card>
          <Card className="!p-2.5 sm:!p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Прирост</p>
            <p
              className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${pctTone(report.grandGrowthBase)}`}
            >
              {signedAmount(report.grandGrowthBase, report.baseCurrency)}
            </p>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">фонд · вклад · инвестиции</p>
          </Card>
          <Card className="!p-2.5 sm:!p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Прирост %</p>
            <p
              className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${pctTone(report.growthPct)}`}
            >
              {formatPercent(report.growthPct)}
            </p>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">относительный за период</p>
          </Card>
          <Card className="!p-2.5 sm:!p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">В годовых</p>
            <p
              className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${pctTone(report.annualizedPct)}`}
            >
              {formatPercent(report.annualizedPct)}
            </p>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
              {report.days > 0 ? `${report.days} дн.` : '—'}
            </p>
          </Card>
        </div>
      ) : null}

      <Card className="!p-0">
        {report.rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Нет данных"
              description="Добавьте счета и сделайте чек-ин, чтобы увидеть сводку по типам."
            />
          </div>
        ) : (
          <div className="overflow-x-hidden">
            <table className="w-full table-fixed text-xs sm:text-sm">
              <colgroup>
                <col className="w-[34%] sm:w-[26%]" />
                <col className="hidden md:table-column md:w-[10%]" />
                <col className="w-[33%] sm:w-[22%]" />
                <col className="hidden lg:table-column lg:w-[12%]" />
                <col className="w-[33%] sm:w-[20%]" />
                <col className="hidden md:table-column md:w-[14%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400">
                  <th className="px-2 py-2 font-medium sm:px-4 sm:py-3">Тип</th>
                  <th className="hidden whitespace-nowrap px-4 py-3 font-medium tabular-nums md:table-cell">
                    Счетов
                  </th>
                  <th className="whitespace-nowrap px-2 py-2 font-medium tabular-nums sm:px-4 sm:py-3">
                    В {report.baseCurrency}
                  </th>
                  <th className="hidden whitespace-nowrap px-4 py-3 font-medium tabular-nums lg:table-cell">
                    Доля
                  </th>
                  <th className="whitespace-nowrap px-2 py-2 font-medium tabular-nums sm:px-4 sm:py-3">
                    Прирост
                  </th>
                  <th className="hidden whitespace-nowrap px-4 py-3 font-medium tabular-nums md:table-cell">
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
              {report.rows.map((row) => {
                const open = !!expanded[row.kind]
                const growthColor =
                  row.growthBase > 0
                    ? 'text-emerald-700'
                    : row.growthBase < 0
                      ? 'text-red-600'
                      : 'text-slate-700 dark:text-slate-300'
                const balanceColor =
                  row.balanceBase < 0 ? 'text-red-600' : 'text-slate-900 dark:text-slate-100'
                return (
                  <TypeGroup
                    key={row.kind}
                    open={open}
                    onToggle={() =>
                      setExpanded((prev) => ({ ...prev, [row.kind]: !prev[row.kind] }))
                    }
                    onOpenAccount={onOpenAccount}
                    label={row.label}
                    accountCount={row.accountCount}
                    balanceBase={row.balanceBase}
                    share={row.share}
                    growthBase={row.growthBase}
                    growthPct={row.growthPct}
                    annualizedPct={row.annualizedPct}
                    growthColor={growthColor}
                    balanceColor={balanceColor}
                    baseCurrency={report.baseCurrency}
                    accounts={row.accounts}
                  />
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 font-semibold text-slate-900 dark:text-slate-100">
                <td className="px-2 py-2 sm:px-4 sm:py-3">
                  <div>Итого</div>
                  <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400 md:hidden">
                    {accountCountLabel(totalAccounts)}
                  </div>
                </td>
                <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums md:table-cell">{totalAccounts}</td>
                <td className="truncate px-2 py-2 tabular-nums sm:px-4 sm:py-3">
                  {formatCurrency(report.grandTotalBase, report.baseCurrency)}
                </td>
                <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums lg:table-cell">—</td>
                <td className="truncate px-2 py-2 tabular-nums sm:px-4 sm:py-3">
                  <div>{signedAmount(report.grandGrowthBase, report.baseCurrency)}</div>
                  <div className={`text-[11px] font-normal md:hidden ${pctTone(report.growthPct)}`}>
                    {formatPercent(report.growthPct)}
                  </div>
                </td>
                <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums md:table-cell">
                  <div className={pctTone(report.growthPct)}>{formatPercent(report.growthPct)}</div>
                  <div className={`text-xs font-normal ${pctTone(report.annualizedPct)}`}>
                    {formatPercent(report.annualizedPct)} год.
                  </div>
                </td>
              </tr>
            </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function TypeGroup({
  open,
  onToggle,
  onOpenAccount,
  label,
  accountCount,
  balanceBase,
  share,
  growthBase,
  growthPct,
  annualizedPct,
  growthColor,
  balanceColor,
  baseCurrency,
  accounts,
}: {
  open: boolean
  onToggle: () => void
  onOpenAccount: (accountId: string) => void
  label: string
  accountCount: number
  balanceBase: number
  share: number
  growthBase: number
  growthPct: number | null
  annualizedPct: number | null
  growthColor: string
  balanceColor: string
  baseCurrency: string
  accounts: {
    accountId: string
    name: string
    currency: string
    balance: number
    balanceBase: number
    growth: number
    growthBase: number
  }[]
}) {
  return (
    <>
      <tr className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60">
        <td className="px-2 py-2 sm:px-4 sm:py-3">
          <button
            type="button"
            onClick={onToggle}
            className="flex min-w-0 items-start gap-2 text-left font-medium text-slate-900 dark:text-slate-100"
          >
            <span className="inline-block w-3 shrink-0 text-slate-400 dark:text-slate-500">{open ? '▾' : '▸'}</span>
            <span className="min-w-0">
              <span className="block truncate">{label}</span>
              <span className="mt-0.5 block text-[11px] font-normal text-slate-500 dark:text-slate-400 md:hidden">
                {accountCountLabel(accountCount)} · {formatShare(Math.abs(share))}
              </span>
            </span>
          </button>
        </td>
        <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums text-slate-700 dark:text-slate-300 md:table-cell">
          {accountCount}
        </td>
        <td className={`truncate px-2 py-2 tabular-nums sm:px-4 sm:py-3 ${balanceColor}`}>
          {formatCurrency(balanceBase, baseCurrency)}
        </td>
        <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums text-slate-700 dark:text-slate-300 lg:table-cell">
          {formatShare(Math.abs(share))}
        </td>
        <td className={`truncate px-2 py-2 tabular-nums sm:px-4 sm:py-3 ${growthColor}`}>
          <div>{signedAmount(growthBase, baseCurrency)}</div>
          <div className={`text-[11px] md:hidden ${pctTone(growthPct)}`}>
            {formatPercent(growthPct)}
            {growthPct != null ? (
              <span className="text-slate-400 dark:text-slate-500">
                {' '}
                · {formatPercent(annualizedPct)} год.
              </span>
            ) : null}
          </div>
        </td>
        <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums md:table-cell">
          <div className={pctTone(growthPct)}>{formatPercent(growthPct)}</div>
          {growthPct != null ? (
            <div className={`text-xs ${pctTone(annualizedPct)}`}>
              {formatPercent(annualizedPct)} год.
            </div>
          ) : (
            <div className="text-xs text-slate-400 dark:text-slate-500">—</div>
          )}
        </td>
      </tr>
      {open &&
        accounts.map((acc) => {
          const nativeTone =
            acc.growth > 0
              ? 'text-emerald-700'
              : acc.growth < 0
                ? 'text-red-600'
                : 'text-slate-600 dark:text-slate-400'
          const baseTone =
            acc.growthBase > 0
              ? 'text-emerald-700'
              : acc.growthBase < 0
                ? 'text-red-600'
                : 'text-slate-600 dark:text-slate-400'
          return (
            <tr key={acc.accountId} className="border-b border-slate-50 bg-slate-50 dark:bg-slate-800/60/70">
              <td className="px-2 py-2 pl-7 sm:px-4 sm:py-2 sm:pl-10">
                <button
                  type="button"
                  onClick={() => onOpenAccount(acc.accountId)}
                  className="text-left text-slate-700 dark:text-slate-300 hover:text-blue-700 hover:underline"
                >
                  {acc.name}
                  <span className="ml-1.5 text-[11px] text-slate-400 dark:text-slate-500">{acc.currency}</span>
                </button>
              </td>
              <td className="hidden px-4 py-2 text-slate-400 dark:text-slate-500 md:table-cell">—</td>
              <td className="truncate px-2 py-2 tabular-nums text-slate-700 dark:text-slate-300 sm:px-4 sm:py-2">
                <div>{formatCurrency(acc.balance, acc.currency)}</div>
                {acc.currency !== baseCurrency && (
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    ≈ {formatCurrency(acc.balanceBase, baseCurrency)}
                  </div>
                )}
              </td>
              <td className="hidden px-4 py-2 text-slate-400 dark:text-slate-500 lg:table-cell">—</td>
              <td className="truncate px-2 py-2 tabular-nums sm:px-4 sm:py-2">
                <div className={nativeTone}>{signedAmount(acc.growth, acc.currency)}</div>
                {acc.currency !== baseCurrency && (
                  <div className={`mt-0.5 text-[11px] ${baseTone}`}>
                    ≈ {signedAmount(acc.growthBase, baseCurrency)}
                  </div>
                )}
              </td>
              <td className="hidden whitespace-nowrap px-4 py-2 text-slate-400 dark:text-slate-500 md:table-cell">—</td>
            </tr>
          )
        })}
    </>
  )
}
