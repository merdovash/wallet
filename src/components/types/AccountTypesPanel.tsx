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
  if (value == null) return 'text-slate-500'
  if (value > 0) return 'text-emerald-700'
  if (value < 0) return 'text-red-600'
  return 'text-slate-700'
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
        <h1 className="text-xl font-semibold text-slate-900">По типам</h1>
        <p className="text-sm text-slate-500">
          Сводка остатков и прироста по видам счетов
          {report.asOfDate ? ` на ${report.asOfDate}` : ''}
        </p>
      </div>

      {report.rows.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <Card className="!p-2.5 sm:!p-3">
            <p className="text-xs text-slate-500 sm:text-sm">Итого</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900 sm:text-lg">
              {formatCurrency(report.grandTotalBase, report.baseCurrency)}
            </p>
          </Card>
          <Card className="!p-2.5 sm:!p-3">
            <p className="text-xs text-slate-500 sm:text-sm">Прирост</p>
            <p
              className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${pctTone(report.grandGrowthBase)}`}
            >
              {signedAmount(report.grandGrowthBase, report.baseCurrency)}
            </p>
            <p className="mt-1 text-[10px] text-slate-500">фонд · вклад · инвестиции</p>
          </Card>
          <Card className="!p-2.5 sm:!p-3">
            <p className="text-xs text-slate-500 sm:text-sm">Прирост %</p>
            <p
              className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${pctTone(report.growthPct)}`}
            >
              {formatPercent(report.growthPct)}
            </p>
            <p className="mt-1 text-[10px] text-slate-500">относительный за период</p>
          </Card>
          <Card className="!p-2.5 sm:!p-3">
            <p className="text-xs text-slate-500 sm:text-sm">В годовых</p>
            <p
              className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${pctTone(report.annualizedPct)}`}
            >
              {formatPercent(report.annualizedPct)}
            </p>
            <p className="mt-1 text-[10px] text-slate-500">
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
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="w-[34%] px-3 py-3 font-medium sm:px-4">Тип</th>
                <th className="hidden px-4 py-3 font-medium tabular-nums md:table-cell">Счетов</th>
                <th className="w-[28%] px-3 py-3 font-medium tabular-nums sm:px-4">
                  В {report.baseCurrency}
                </th>
                <th className="hidden px-4 py-3 font-medium tabular-nums lg:table-cell">Доля</th>
                <th className="w-[20%] px-3 py-3 text-right font-medium tabular-nums sm:px-4 sm:text-left">
                  Прирост
                </th>
                <th className="w-[18%] px-2 py-3 text-right font-medium tabular-nums sm:px-4 sm:text-left">
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
                      : 'text-slate-700'
                const balanceColor =
                  row.balanceBase < 0 ? 'text-red-600' : 'text-slate-900'
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
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                <td className="px-3 py-3 sm:px-4">
                  <div>Итого</div>
                  <div className="text-xs font-normal text-slate-500 md:hidden">
                    {accountCountLabel(totalAccounts)}
                  </div>
                </td>
                <td className="hidden px-4 py-3 tabular-nums md:table-cell">{totalAccounts}</td>
                <td className="px-3 py-3 tabular-nums sm:px-4">
                  {formatCurrency(report.grandTotalBase, report.baseCurrency)}
                </td>
                <td className="hidden px-4 py-3 tabular-nums lg:table-cell">—</td>
                <td className="px-3 py-3 text-right tabular-nums sm:px-4 sm:text-left">
                  {signedAmount(report.grandGrowthBase, report.baseCurrency)}
                </td>
                <td className="px-2 py-3 text-right tabular-nums sm:px-4 sm:text-left">
                  <div className={pctTone(report.growthPct)}>{formatPercent(report.growthPct)}</div>
                  <div className={`text-xs font-normal ${pctTone(report.annualizedPct)}`}>
                    {formatPercent(report.annualizedPct)} год.
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
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
      <tr className="border-b border-slate-100 hover:bg-slate-50">
        <td className="px-3 py-3 sm:px-4">
          <button
            type="button"
            onClick={onToggle}
            className="flex min-w-0 items-start gap-2 text-left font-medium text-slate-900"
          >
            <span className="inline-block w-3 shrink-0 text-slate-400">{open ? '▾' : '▸'}</span>
            <span className="min-w-0">
              <span className="block truncate">{label}</span>
              <span className="mt-0.5 block text-xs font-normal text-slate-500 md:hidden">
                {accountCountLabel(accountCount)} · {formatShare(Math.abs(share))}
              </span>
            </span>
          </button>
        </td>
        <td className="hidden px-4 py-3 tabular-nums text-slate-700 md:table-cell">
          {accountCount}
        </td>
        <td className={`px-3 py-3 tabular-nums sm:px-4 ${balanceColor}`}>
          {formatCurrency(balanceBase, baseCurrency)}
        </td>
        <td className="hidden px-4 py-3 tabular-nums text-slate-700 lg:table-cell">
          {formatShare(Math.abs(share))}
        </td>
        <td className={`px-3 py-3 text-right tabular-nums sm:px-4 sm:text-left ${growthColor}`}>
          {signedAmount(growthBase, baseCurrency)}
        </td>
        <td className="px-2 py-3 text-right tabular-nums sm:px-4 sm:text-left">
          <div className={pctTone(growthPct)}>{formatPercent(growthPct)}</div>
          {growthPct != null ? (
            <div className={`text-xs ${pctTone(annualizedPct)}`}>
              {formatPercent(annualizedPct)} год.
            </div>
          ) : (
            <div className="text-xs text-slate-400">—</div>
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
                : 'text-slate-600'
          const baseTone =
            acc.growthBase > 0
              ? 'text-emerald-700'
              : acc.growthBase < 0
                ? 'text-red-600'
                : 'text-slate-600'
          return (
            <tr key={acc.accountId} className="border-b border-slate-50 bg-slate-50/70">
              <td className="px-3 py-2 pl-9 sm:px-4 sm:pl-10">
                <button
                  type="button"
                  onClick={() => onOpenAccount(acc.accountId)}
                  className="text-left text-slate-700 hover:text-blue-700 hover:underline"
                >
                  {acc.name}
                  <span className="ml-1.5 text-xs text-slate-400">{acc.currency}</span>
                </button>
              </td>
              <td className="hidden px-4 py-2 text-slate-400 md:table-cell">—</td>
              <td className="px-3 py-2 tabular-nums text-slate-700 sm:px-4">
                <div>{formatCurrency(acc.balance, acc.currency)}</div>
                {acc.currency !== baseCurrency && (
                  <div className="mt-0.5 text-xs text-slate-500">
                    ≈ {formatCurrency(acc.balanceBase, baseCurrency)}
                  </div>
                )}
              </td>
              <td className="hidden px-4 py-2 text-slate-400 lg:table-cell">—</td>
              <td className="px-3 py-2 text-right tabular-nums sm:px-4 sm:text-left">
                <div className={nativeTone}>{signedAmount(acc.growth, acc.currency)}</div>
                {acc.currency !== baseCurrency && (
                  <div className={`mt-0.5 text-xs ${baseTone}`}>
                    ≈ {signedAmount(acc.growthBase, baseCurrency)}
                  </div>
                )}
              </td>
              <td className="px-2 py-2 text-slate-400 sm:px-4">—</td>
            </tr>
          )
        })}
    </>
  )
}
