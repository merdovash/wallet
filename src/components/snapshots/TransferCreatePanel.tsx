import { useEffect, useMemo, useState } from 'react'
import { convertAmount } from '../../engine/growthEngine'
import { dataQa } from '../../lib/dataQa'
import { todayIsoDate, formatCurrency } from '../../lib/format'
import { previewInboundAllocation } from '../../lib/fundBalances'
import { parseMoneyInput } from '../../lib/moneyInput'
import { transferReceivedAmount, transferSpreadBase } from '../../lib/transferAmounts'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { DateInput, Field, Input, MoneyInput, Select } from '../ui/FormControls'
import { EntityEditPanel } from '../ui/EntityEditPanel'
import { TransferSpreadLine } from './TransferSpreadLine'

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
  const [toAmount, setToAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDate(todayIsoDate())
    setFromAccountId(activeAccounts[0]?.id ?? '')
    setToAccountId(activeAccounts[1]?.id ?? activeAccounts[0]?.id ?? '')
    setAmount('')
    setToAmount('')
    setNote('')
  }, [open, activeAccounts])

  const fromAccount = activeAccounts.find((a) => a.id === fromAccountId)
  const toAccount = activeAccounts.find((a) => a.id === toAccountId)
  const parsedAmount = parseMoneyInput(amount)
  const parsedToAmount = parseMoneyInput(toAmount)
  const crossCurrency = Boolean(
    fromAccount && toAccount && fromAccount.currency !== toAccount.currency,
  )

  const destAmount =
    fromAccount && toAccount && parsedAmount != null && parsedAmount > 0
      ? transferReceivedAmount(
          {
            date,
            fromAccountId,
            toAccountId,
            amount: parsedAmount,
            toAmount:
              parsedToAmount != null && parsedToAmount > 0 ? parsedToAmount : undefined,
          },
          fromAccount,
          toAccount,
          settings,
          rateBook,
        )
      : null

  const fundPreview = useMemo(() => {
    if (!toAccount || destAmount == null || destAmount <= 0) return []
    if (!funds.some((f) => f.accountId === toAccount.id)) return []
    if (!Number.isFinite(destAmount)) return []
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
    destAmount,
    funds,
    settings,
    date,
    rateBook,
    snapshots,
    transfers,
    accounts,
  ])

  const receiveOk = crossCurrency
    ? parsedToAmount != null && parsedToAmount > 0
    : parsedToAmount == null || parsedToAmount > 0

  async function handleSave() {
    const value = parseMoneyInput(amount)
    if (!date || !fromAccountId || !toAccountId || fromAccountId === toAccountId) return
    if (value == null || value <= 0) return
    if (!receiveOk) return
    setSaving(true)
    try {
      const { snapshotId } = await addTransferCheckIn(
        {
          date,
          fromAccountId,
          toAccountId,
          amount: value,
          toAmount:
            parsedToAmount != null && parsedToAmount > 0 ? parsedToAmount : undefined,
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
    parsedAmount != null &&
    parsedAmount > 0 &&
    receiveOk &&
    activeAccounts.length >= 2

  const spread =
    parsedAmount != null &&
    parsedAmount > 0 &&
    fromAccount &&
    toAccount &&
    (crossCurrency ? parsedToAmount != null && parsedToAmount > 0 : true)
      ? transferSpreadBase(
          {
            date,
            fromAccountId,
            toAccountId,
            amount: parsedAmount,
            toAmount:
              parsedToAmount != null && parsedToAmount > 0 ? parsedToAmount : undefined,
          },
          fromAccount,
          toAccount,
          settings,
          rateBook,
        )
      : 0

  const officialHint =
    crossCurrency && parsedAmount != null && parsedAmount > 0 && fromAccount && toAccount
      ? convertAmount(
          parsedAmount,
          fromAccount.currency,
          toAccount.currency,
          settings,
          date,
          rateBook,
        )
      : null

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
          {crossCurrency ? ' Для разных валют сумма получения обязательна.' : ''}
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
        <Field label={`Списание${fromAccount ? ` (${fromAccount.currency})` : ''}`}>
          <MoneyInput
            value={amount}
            onChange={setAmount}
            allowNegative={false}
            placeholder="0"
            dataQa="transfer-create-amount"
          />
        </Field>
        <Field
          label={`Зачисление${toAccount ? ` (${toAccount.currency})` : ''}${crossCurrency ? ' *' : ''}`}
        >
          <MoneyInput
            value={toAmount}
            onChange={setToAmount}
            allowNegative={false}
            placeholder={
              officialHint != null && Number.isFinite(officialHint)
                ? officialHint.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
                : '0'
            }
            dataQa="transfer-create-to-amount"
          />
        </Field>
        <TransferSpreadLine
          spread={spread}
          currency={settings.baseCurrency}
          className="text-sm font-medium"
          dataQa="transfer-create-spread"
        />
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
