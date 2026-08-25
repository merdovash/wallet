import { useEffect, useMemo, useState } from 'react'
import { todayIsoDate } from '../../lib/format'
import { parseMoneyInput } from '../../lib/moneyInput'
import { useRegisterPrimaryAction } from '../../lib/useRegisterPrimaryAction'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { DateInput, Field, Input, MoneyInput, Select } from '../ui/FormControls'
import { StackPanel } from '../ui/StackPanel'

interface TransferCreatePanelProps {
  open: boolean
  onClose: () => void
  onCreated?: (snapshotId: string) => void
}

export function TransferCreatePanel({ open, onClose, onCreated }: TransferCreatePanelProps) {
  const accounts = useWalletStore((s) => s.accounts)
  const addTransferCheckIn = useWalletStore((s) => s.addTransferCheckIn)
  const rateBook = useRatesStore((s) => s.byDate)

  const activeAccounts = useMemo(
    () =>
      accounts
        .filter((a) => !a.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [accounts],
  )

  const [date, setDate] = useState(todayIsoDate)
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDate(todayIsoDate())
    setFromAccountId(activeAccounts[0]?.id ?? '')
    setToAccountId(activeAccounts[1]?.id ?? activeAccounts[0]?.id ?? '')
    setAmount('')
    setNote('')
  }, [open, activeAccounts])

  const fromAccount = activeAccounts.find((a) => a.id === fromAccountId)

  async function handleSave() {
    const value = parseMoneyInput(amount)
    if (!date || !fromAccountId || !toAccountId || fromAccountId === toAccountId) return
    if (value == null || value <= 0) return
    setSaving(true)
    try {
      const { snapshotId } = await addTransferCheckIn(
        {
          date,
          fromAccountId,
          toAccountId,
          amount: value,
          note: note.trim() || undefined,
        },
        rateBook,
      )
      onClose()
      onCreated?.(snapshotId)
    } finally {
      setSaving(false)
    }
  }

  const canSave =
    !!date &&
    !!fromAccountId &&
    !!toAccountId &&
    fromAccountId !== toAccountId &&
    parseMoneyInput(amount) != null &&
    (parseMoneyInput(amount) ?? 0) > 0 &&
    activeAccounts.length >= 2

  useRegisterPrimaryAction(open, {
    id: 'transfer-form-save',
    label: 'Сохранить',
    disabled: !canSave || saving,
    onClick: () => {
      void handleSave()
    },
  })

  return (
    <StackPanel open={open} title="Новый перевод" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Будет создан чек-ин с обновлёнными остатками. Суммы в нём нельзя менять вручную —
          только удалить перевод или весь чек-ин.
        </p>
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
  )
}
