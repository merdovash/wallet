import { useMemo, useState } from 'react'
import { buildAccountTypeReport } from '../../lib/accountTypeReport'
import { formatCurrency, signedAmount } from '../../lib/format'
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
                <th className="w-[40%] px-3 py-3 font-medium sm:px-4">Тип</th>
                <th className="hidden px-4 py-3 font-medium tabular-nums md:table-cell">Счетов</th>
                <th className="w-[34%] px-3 py-3 font-medium tabular-nums sm:px-4">
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
                <td className="hidden px-4 py-3 tabular-nums md:table-cell">—</td>
                <td className="px-3 py-3 text-right tabular-nums sm:px-4 sm:text-left">
                  {signedAmount(report.grandGrowthBase, report.baseCurrency)}
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
        <td className="hidden px-4 py-3 tabular-nums text-slate-700 md:table-cell">
          {formatShare(Math.abs(share))}
        </td>
        <td className={`px-3 py-3 text-right tabular-nums sm:px-4 sm:text-left ${growthColor}`}>
          {signedAmount(growthBase, baseCurrency)}
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
              <td className="hidden px-4 py-2 text-slate-400 md:table-cell">—</td>
              <td className="px-3 py-2 text-right tabular-nums sm:px-4 sm:text-left">
                <div className={nativeTone}>{signedAmount(acc.growth, acc.currency)}</div>
                {acc.currency !== baseCurrency && (
                  <div className={`mt-0.5 text-xs ${baseTone}`}>
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
