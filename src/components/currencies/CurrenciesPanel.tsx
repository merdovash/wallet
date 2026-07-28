import { useEffect, useMemo } from 'react'
import { snapshotDates } from '../../engine/growthEngine'
import { todayIsoDate } from '../../lib/format'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { CurrencyReportTable } from '../dashboard/CurrencyReportTable'
import { CurrencyValueChart } from './CurrencyValueChart'

interface CurrenciesPanelProps {
  onOpenAccount: (accountId: string) => void
}

export function CurrenciesPanel({ onOpenAccount }: CurrenciesPanelProps) {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const settings = useWalletStore((s) => s.settings)
  const ensureRates = useRatesStore((s) => s.ensureRates)
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts])
  const dates = useMemo(() => snapshotDates(snapshots), [snapshots])
  const foreignCount = useMemo(
    () => activeAccounts.filter((a) => a.currency !== settings.baseCurrency).length,
    [activeAccounts, settings.baseCurrency],
  )

  useEffect(() => {
    void ensureRates([...dates, todayIsoDate()])
  }, [dates, ensureRates])

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Валюты</h1>
        <p className="text-sm text-slate-500">
          Динамика стоимости валютных кошельков и сводка по валютам
          {foreignCount > 0 ? ` · ${foreignCount} вал. счёт.` : ''}
        </p>
      </div>

      <CurrencyValueChart foreignOnly />

      <CurrencyReportTable
        accountCount={activeAccounts.length}
        onOpenAccount={onOpenAccount}
      />
    </div>
  )
}
