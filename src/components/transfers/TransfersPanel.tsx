import { useMemo, useState } from 'react'
import { formatCurrency, formatDateDisplay, todayIsoDate } from '../../lib/format'
import { parseMoneyInput } from '../../lib/moneyInput'
import { useWalletStore } from '../../store/walletStore'
import { Button, Card, DateInput, EmptyState, Field, Input, MoneyInput, Select } from '../ui/FormControls'
import { StackPanel } from '../ui/StackPanel'

export function TransfersPanel() {
  const accounts = useWalletStore((s) => s.accounts)
  const transfers = useWalletStore((s) => s.transfers)
  const addTransfer = useWalletStore((s) => s.addTransfer)
  const deleteTransfer = useWalletStore((s) => s.deleteTransfer)

  const activeAccounts = useMemo(
    () =>
      accounts
        .filter((a) => !a.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [accounts],
  )
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(todayIsoDate)
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const sortedTransfers = useMemo(
    () => [...transfers].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [transfers],
  )

  function openCreate() {
    setDate(todayIsoDate())
    setFromAccountId(activeAccounts[0]?.id ?? '')
    setToAccountId(activeAccounts[1]?.id ?? activeAccounts[0]?.id ?? '')
    setAmount('')
    setNote('')
    setOpen(true)
  }

  function handleSave() {
    const value = parseMoneyInput(amount)
    if (!date || !fromAccountId || !toAccountId || fromAccountId === toAccountId) return
    if (value == null || value <= 0) return
    void addTransfer({
      date,
      fromAccountId,
      toAccountId,
      amount: value,
      note: note.trim() || undefined,
    }).then(() => setOpen(false))
  }

  const fromAccount = accountMap.get(fromAccountId)

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Переводы</h1>
          <p className="text-sm text-slate-500">
            Переводы между счетами не считаются приростом
          </p>
        </div>
        <Button type="button" onClick={openCreate} disabled={activeAccounts.length < 2}>
          Добавить
        </Button>
      </div>

      {sortedTransfers.length === 0 ? (
        <EmptyState
          title="Переводов пока нет"
          description="Если вы переводите деньги между своими счетами, зафиксируйте перевод — иначе это исказит прирост счёта."
        />
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-slate-100">
            {sortedTransfers.map((t) => {
              const from = accountMap.get(t.fromAccountId)
              const to = accountMap.get(t.toAccountId)
              return (
                <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">
                      {from?.name ?? '—'} → {to?.name ?? '—'}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatDateDisplay(t.date)}
                      {t.note ? ` · ${t.note}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900">
                      {formatCurrency(t.amount, from?.currency ?? 'RUB')}
                    </p>
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => void deleteTransfer(t.id)}
                    >
                      Удалить
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <StackPanel
        open={open}
        title="Новый перевод"
        onClose={() => setOpen(false)}
        headerActions={
          <Button type="button" onClick={handleSave}>
            Сохранить
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Дата">
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label="Откуда">
            <Select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Куда">
            <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Сумма${fromAccount ? ` (${fromAccount.currency})` : ''}`}>
            <MoneyInput
              value={amount}
              onChange={setAmount}
              allowNegative={false}
              placeholder="0"
            />
          </Field>
          <Field label="Комментарий">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Необязательно" />
          </Field>
        </div>
      </StackPanel>
    </div>
  )
}
