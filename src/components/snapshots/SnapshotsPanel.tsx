import { useEffect, useMemo, useState } from 'react'
import { totalOnDate, snapshotDates } from '../../engine/growthEngine'
import { formatCurrency, formatDateDisplay, todayIsoDate } from '../../lib/format'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Button, Card, EmptyState } from '../ui/FormControls'
import { CheckInPanel } from './CheckInPanel'

export function SnapshotsPanel() {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)
  const ensureRates = useRatesStore((s) => s.ensureRates)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [editingSnapshotId, setEditingSnapshotId] = useState<string | null>(null)

  const dates = useMemo(() => snapshotDates(snapshots), [snapshots])

  useEffect(() => {
    void ensureRates([...dates, todayIsoDate()])
  }, [dates, ensureRates])

  const sortedSnapshots = useMemo(
    () => [...snapshots].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [snapshots],
  )

  function openCreate() {
    setEditingSnapshotId(null)
    setCheckInOpen(true)
  }

  function openEdit(id: string) {
    setEditingSnapshotId(id)
    setCheckInOpen(true)
  }

  function closePanel() {
    setCheckInOpen(false)
    setEditingSnapshotId(null)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Чек-ины</h1>
          <p className="text-sm text-slate-500">Реестр зафиксированных остатков по датам</p>
        </div>
        <Button type="button" onClick={openCreate}>
          Чек-ин
        </Button>
      </div>

      {sortedSnapshots.length === 0 ? (
        <EmptyState
          title="Чек-инов пока нет"
          description="Нажмите «Чек-ин», чтобы зафиксировать остатки на дату."
        />
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-slate-100">
            {sortedSnapshots.map((snap) => {
              const snapTotal = totalOnDate(snap.date, accounts, snapshots, settings, {
                rateBook,
              })
              return (
                <li key={snap.id}>
                  <button
                    type="button"
                    onClick={() => openEdit(snap.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-900">
                        {formatDateDisplay(snap.date)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {snap.lines.length}{' '}
                        {snap.lines.length === 1
                          ? 'счёт'
                          : snap.lines.length < 5
                            ? 'счёта'
                            : 'счетов'}
                        {snap.note ? ` · ${snap.note}` : ''}
                      </span>
                    </span>
                    <span className="font-medium text-slate-900">
                      {formatCurrency(snapTotal, settings.baseCurrency)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <CheckInPanel open={checkInOpen} onClose={closePanel} snapshotId={editingSnapshotId} />
    </div>
  )
}
