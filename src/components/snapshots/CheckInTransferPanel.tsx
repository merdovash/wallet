import { useEffect, useMemo, useState } from 'react'
import { parseMoneyInput } from '../../lib/moneyInput'
import { useRegisterPrimaryAction } from '../../lib/useRegisterPrimaryAction'
import type { Account } from '../../types/wallet'
import { Button, Field, Input, MoneyInput, Select } from '../ui/FormControls'
import { StackPanel } from '../ui/StackPanel'

export type CheckInTransferDraft = {
  fromAccountId: string
  toAccountId: string
  amount: string
  note: string
}

interface CheckInTransferPanelProps {
  open: boolean
  title: string
  accounts: Account[]
  initial: CheckInTransferDraft | null
  onClose: () => void
  onSave: (draft: CheckInTransferDraft) => void | Promise<void>
}

export function emptyTransferDraft(accounts: Account[]): CheckInTransferDraft {
  return {
    fromAccountId: accounts[0]?.id ?? '',
    toAccountId: accounts[1]?.id ?? accounts[0]?.id ?? '',
    amount: '',
    note: '',
  }
}

export function CheckInTransferPanel({
  open,
  title,
  accounts,
  initial,
  onClose,
  onSave,
}: CheckInTransferPanelProps) {
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !initial) return
    setFromAccountId(initial.fromAccountId)
    setToAccountId(initial.toAccountId)
    setAmount(initial.amount)
    setNote(initial.note)
    setSaving(false)
  }, [open, initial])

  const fromAccount = useMemo(
    () => accounts.find((a) => a.id === fromAccountId),
    [accounts, fromAccountId],
  )

  const parsedAmount = parseMoneyInput(amount)
  const canSave =
    !!fromAccountId &&
    !!toAccountId &&
    fromAccountId !== toAccountId &&
    parsedAmount != null &&
    parsedAmount > 0 &&
    accounts.length >= 2

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      await onSave({
        fromAccountId,
        toAccountId,
        amount,
        note,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  useRegisterPrimaryAction(open, {
    id: 'check-in-transfer-save',
    label: 'Сохранить',
    scope: 'panel',
    disabled: !canSave || saving,
    onClick: () => {
      void handleSave()
    },
  })

  return (
    <StackPanel
      open={open}
      title={title}
      onClose={onClose}
      headerActions={
        <Button
          type="button"
          className="!px-3 !py-1.5"
          disabled={!canSave || saving}
          onClick={() => void handleSave()}
        >
          Сохранить
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Перевод относится к дате чек-ина. Сумма — в валюте счёта «откуда».
        </p>
        <Field label="Откуда">
          <Select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Куда">
          <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            {accounts.map((a) => (
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
