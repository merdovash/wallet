import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { buildAccountSeries } from '../../engine/growthEngine'
import { ACCOUNT_COLORS } from '../../types/wallet'
import { CURRENCY_OPTIONS } from '../../lib/currency'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Button, Card, EmptyState, Field, Input, Select } from '../ui/FormControls'
import { StackPanel } from '../ui/StackPanel'
import { GrowthChart } from '../dashboard/GrowthChart'
import { formatCurrency } from '../../lib/format'

interface AccountsPanelProps {
  focusAccountId?: string | null
  onFocusConsumed?: () => void
}

export function AccountsPanel({ focusAccountId, onFocusConsumed }: AccountsPanelProps) {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)
  const addAccount = useWalletStore((s) => s.addAccount)
  const updateAccount = useWalletStore((s) => s.updateAccount)
  const reorderAccounts = useWalletStore((s) => s.reorderAccounts)
  const archiveAccount = useWalletStore((s) => s.archiveAccount)
  const deleteAccount = useWalletStore((s) => s.deleteAccount)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('RUB')
  const [color, setColor] = useState<string>(ACCOUNT_COLORS[0])
  const [showArchived, setShowArchived] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  useEffect(() => {
    if (!focusAccountId) return
    setDetailId(focusAccountId)
    onFocusConsumed?.()
  }, [focusAccountId, onFocusConsumed])

  const visible = useMemo(() => {
    return accounts
      .filter((a) => (showArchived ? true : !a.archived))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  }, [accounts, showArchived])

  const detailAccount = accounts.find((a) => a.id === detailId) ?? null
  const detailSeries = useMemo(
    () =>
      detailId
        ? buildAccountSeries(detailId, snapshots, transfers, accounts, settings, rateBook)
        : [],
    [detailId, snapshots, transfers, accounts, settings, rateBook],
  )

  function openCreate() {
    setEditingId(null)
    setName('')
    setCurrency('RUB')
    setColor(ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length]!)
    setFormOpen(true)
  }

  function openEdit(id: string) {
    const account = accounts.find((a) => a.id === id)
    if (!account) return
    setEditingId(id)
    setName(account.name)
    setCurrency(account.currency)
    setColor(account.color)
    setFormOpen(true)
  }

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    if (editingId) {
      await updateAccount(editingId, { name: trimmed, currency, color })
    } else {
      await addAccount({ name: trimmed, currency, color })
    }
    setFormOpen(false)
  }

  function moveAccount(fromId: string, toId: string) {
    if (fromId === toId) return
    const ids = visible.map((a) => a.id)
    const fromIndex = ids.indexOf(fromId)
    const toIndex = ids.indexOf(toId)
    if (fromIndex < 0 || toIndex < 0) return
    const next = [...ids]
    next.splice(fromIndex, 1)
    next.splice(toIndex, 0, fromId)
    void reorderAccounts(next)
  }

  function handleDragStart(e: DragEvent, id: string) {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  function handleDragOver(e: DragEvent, id: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (overId !== id) setOverId(id)
  }

  function handleDrop(e: DragEvent, id: string) {
    e.preventDefault()
    const fromId = dragId ?? e.dataTransfer.getData('text/plain')
    if (fromId) moveAccount(fromId, id)
    setDragId(null)
    setOverId(null)
  }

  function handleDragEnd() {
    setDragId(null)
    setOverId(null)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Счета</h1>
          <p className="text-sm text-slate-500">
            Перетащите за ⋮⋮, чтобы изменить порядок
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Скрыть архив' : 'Показать архив'}
          </Button>
          <Button type="button" onClick={openCreate}>
            Добавить
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Счетов пока нет" description="Создайте первый счёт, чтобы фиксировать остатки." />
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-slate-100">
            {visible.map((account) => {
              const isDragging = dragId === account.id
              const isOver = overId === account.id && dragId !== account.id
              return (
                <li
                  key={account.id}
                  onDragOver={(e) => handleDragOver(e, account.id)}
                  onDrop={(e) => handleDrop(e, account.id)}
                  className={`flex items-center gap-1 px-2 py-2 sm:gap-2 sm:px-4 sm:py-3 ${
                    isDragging ? 'opacity-40' : ''
                  } ${isOver ? 'bg-blue-50' : ''}`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(e) => handleDragStart(e, account.id)}
                    onDragEnd={handleDragEnd}
                    className="flex h-9 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
                    title="Перетащить"
                    aria-label={`Перетащить ${account.name}`}
                  >
                    <DragHandleIcon className="h-4 w-4" />
                  </div>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => setDetailId(account.id)}
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: account.color }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">
                        {account.name}
                        {account.archived ? (
                          <span className="ml-2 text-xs font-normal text-slate-400">архив</span>
                        ) : null}
                      </span>
                      <span className="text-xs text-slate-500">{account.currency}</span>
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!px-2 !py-1"
                    onClick={() => openEdit(account.id)}
                  >
                    Изменить
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!px-2 !py-1"
                    onClick={() => void archiveAccount(account.id, !account.archived)}
                  >
                    {account.archived ? 'Вернуть' : 'Архив'}
                  </Button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <StackPanel
        open={formOpen}
        title={editingId ? 'Счёт' : 'Новый счёт'}
        onClose={() => setFormOpen(false)}
        headerActions={
          <Button type="button" onClick={() => void handleSave()}>
            Сохранить
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Название">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Накопительный" />
          </Field>
          <Field label="Валюта">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Цвет">
            <div className="flex flex-wrap gap-2">
              {ACCOUNT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full border-2 ${color === c ? 'border-slate-900' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </Field>
          {editingId && (
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                if (confirm('Удалить счёт и связанные данные?')) {
                  void deleteAccount(editingId).then(() => {
                    setFormOpen(false)
                    if (detailId === editingId) setDetailId(null)
                  })
                }
              }}
            >
              Удалить счёт
            </Button>
          )}
        </div>
      </StackPanel>

      <StackPanel
        open={!!detailAccount}
        title={detailAccount?.name ?? 'Счёт'}
        onClose={() => setDetailId(null)}
      >
        {detailAccount && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Валюта: {detailAccount.currency}. Зелёная линия — прирост без переводов.
            </p>
            {detailSeries.length > 0 && (
              <p className="text-sm text-slate-700">
                Последний остаток:{' '}
                <span className="font-medium">
                  {formatCurrency(detailSeries[detailSeries.length - 1]!.balance, detailAccount.currency)}
                </span>
              </p>
            )}
            <GrowthChart data={detailSeries} currency={detailAccount.currency} mode="account" />
          </div>
        )}
      </StackPanel>
    </div>
  )
}

function DragHandleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <circle cx="5" cy="3.5" r="1.25" />
      <circle cx="11" cy="3.5" r="1.25" />
      <circle cx="5" cy="8" r="1.25" />
      <circle cx="11" cy="8" r="1.25" />
      <circle cx="5" cy="12.5" r="1.25" />
      <circle cx="11" cy="12.5" r="1.25" />
    </svg>
  )
}
