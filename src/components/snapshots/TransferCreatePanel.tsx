import { useEffect, useMemo, useState } from 'react'
import { convertAmount } from '../../engine/growthEngine'
import { dataQa } from '../../lib/dataQa'
import { todayIsoDate, formatCurrency } from '../../lib/format'
import { previewInboundAllocation } from '../../lib/fundBalances'
import { parseMoneyInput } from '../../lib/moneyInput'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { DateInput, Field, Input, MoneyInput, Select } from '../ui/FormControls'
import { EntityEditPanel } from '../ui/EntityEditPanel'

interface TransferCreatePanelProps {
  open: boolean
  onClose: () => void
  onCreated?: (snapshotId: string) => void
}

export function TransferCreatePanel({ open, onClose, onCreated }: TransferCreatePanelProps) {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const funds = useWalletStore((s) => s.funds)
  const settings = useWalletStore((s) => s.settings)
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
  const toAccount = activeAccounts.find((a) => a.id === toAccountId)
  const parsedAmount = parseMoneyInput(amount)

  const fundPreview = useMemo(() => {
    if (!toAccount || parsedAmount == null || parsedAmount <= 0) return []
    if (!funds.some((f) => f.accountId === toAccount.id)) return []
    const destAmount =
      fromAccount && fromAccount.currency !== toAccount.currency
        ? convertAmount(
            parsedAmount,
            fromAccount.currency,
            toAccount.currency,
            settings,
            date,
            rateBook,
          )
        : parsedAmount
    if (!Number.isFinite(destAmount) || destAmount <= 0) return []
    return previewInboundAllocation(
      toAccount.id,
      destAmount,
      date,
      funds,
      snapshots,
      transfers,
      accounts,
      settings,
      rateBook,
    )
  }, [
    toAccount,
    fromAccount,
    parsedAmount,
    funds,
    settings,
    date,
    rateBook,
    snapshots,
    transfers,
    accounts,
  ])

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

  return (
    <EntityEditPanel
      open={open}
      title="Новый перевод"
      onClose={onClose}
      onSave={handleSave}
      saveDisabled={!canSave || saving}
      saveActionId="transfer-form-save"
      dataQa="transfer-create"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Будет создан чек-ин с обновлёнными остатками. Суммы в нём нельзя менять вручную —
          только удалить перевод или весь чек-ин.
        </p>
        <Field label="Дата">
          <DateInput value={date} onChange={setDate} dataQa="transfer-create-date" />
        </Field>
        <Field label="Откуда">
          <Select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} dataQa="transfer-create-from">
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Куда">
          <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} dataQa="transfer-create-to">
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
            dataQa="transfer-create-amount"
          />
        </Field>
        <Field label="Комментарий">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Необязательно" dataQa="transfer-create-note" />
        </Field>
        {fundPreview.length > 0 && toAccount ? (
          <div
            className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50"
            {...dataQa('transfer-fund-preview')}
          >
            <p className="mb-1 font-medium text-slate-700 dark:text-slate-200">Куда ляжет на {toAccount.name}</p>
            <ul className="space-y-0.5 text-slate-600 dark:text-slate-300">
              {fundPreview.map((row) => (
                <li key={row.fund.id} className="flex justify-between gap-2 tabular-nums">
                  <span>{row.fund.name}</span>
                  <span>{formatCurrency(row.balance, toAccount.currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </EntityEditPanel>
  )
}
