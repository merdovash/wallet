import { useEffect, useMemo, useState } from 'react'
import { totalOnDate, snapshotDates } from '../../engine/growthEngine'
import { formatCurrency, formatDateDisplay, todayIsoDate } from '../../lib/format'
import { formatTransferLabel } from '../../lib/transferCheckIn'
import { useCheckInUiStore } from '../../store/checkInUiStore'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Button, Card, EmptyState } from '../ui/FormControls'
import { TransferCreatePanel } from './TransferCreatePanel'

export function SnapshotsPanel() {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)
  const ensureRates = useRatesStore((s) => s.ensureRates)
  const openEdit = useCheckInUiStore((s) => s.openEdit)
  const [transferOpen, setTransferOpen] = useState(false)

  const dates = useMemo(() => snapshotDates(snapshots), [snapshots])
  const activeCount = useMemo(() => accounts.filter((a) => !a.archived).length, [accounts])

  useEffect(() => {
    void ensureRates([...dates, todayIsoDate()])
  }, [dates, ensureRates])

  const sortedSnapshots = useMemo(
    () => [...snapshots].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [snapshots],
  )

  const transfersByDate = useMemo(() => {
    const map = new Map<string, typeof transfers>()
    for (const t of transfers) {
      const list = map.get(t.date) ?? []
      list.push(t)
      map.set(t.date, list)
    }
    return map
  }, [transfers])

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-200">Чек-ины</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Остатки по датам и переводы между счетами
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setTransferOpen(true)}
          disabled={activeCount < 2}
        >
          Перевод
        </Button>
      </div>

      {sortedSnapshots.length === 0 ? (
        <EmptyState
          title="Чек-инов пока нет"
          description="Нажмите плавающую кнопку «Чек-ин» для остатков или «Перевод» — тогда создастся чек-ин с обновлёнными суммами."
        />
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {sortedSnapshots.map((snap) => {
              const snapTotal = totalOnDate(snap.date, accounts, snapshots, settings, {
                rateBook,
              })
              const dayTransfers = transfersByDate.get(snap.date) ?? []
              const isTransfer = snap.origin === 'transfer'
              return (
                <li key={snap.id}>
                  <button
                    type="button"
                    onClick={() => openEdit(snap.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-slate-200">
                          {formatDateDisplay(snap.date)}
                        </span>
                        {isTransfer ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                            перевод
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                        {isTransfer && dayTransfers.length > 0
                          ? dayTransfers
                              .map((t) => formatTransferLabel(t, accounts))
                              .join(' · ')
                          : `${snap.lines.length} ${
                              snap.lines.length === 1
                                ? 'счёт'
                                : snap.lines.length < 5
                                  ? 'счёта'
                                  : 'счетов'
                            }`}
                        {!isTransfer && dayTransfers.length > 0
                          ? ` · ${dayTransfers.length} ${
                              dayTransfers.length === 1
                                ? 'перевод'
                                : dayTransfers.length < 5
                                  ? 'перевода'
                                  : 'переводов'
                            }`
                          : ''}
                        {(snap.income ?? 0) > 0
                          ? ` · доход ${formatCurrency(snap.income!, settings.baseCurrency)}`
                          : ''}
                        {(snap.expense ?? 0) > 0
                          ? ` · расход ${formatCurrency(snap.expense!, settings.baseCurrency)}`
                          : ''}
                        {snap.note ? ` · ${snap.note}` : ''}
                      </span>
                    </span>
                    <span className="font-medium text-slate-900 dark:text-slate-200">
                      {formatCurrency(snapTotal, settings.baseCurrency)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <TransferCreatePanel
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onCreated={(snapshotId) => {
          openEdit(snapshotId)
        }}
      />
    </div>
  )
}
