import { useEffect, useMemo, useState } from 'react'
import { type RateBook } from '../../engine/growthEngine'
import { parseMoneyInput } from '../../lib/moneyInput'
import { suggestedReceiveAmount } from '../../lib/transferCheckIn'
import { transferSpreadBase } from '../../lib/transferAmounts'
import { useWalletStore } from '../../store/walletStore'
import type { Account, WalletSettings } from '../../types/wallet'
import { Field, Input, MoneyInput, Select } from '../ui/FormControls'
import { EntityEditPanel } from '../ui/EntityEditPanel'
import { TransferSpreadLine } from './TransferSpreadLine'

export type CheckInTransferDraft = {
  fromAccountId: string
  toAccountId: string
  amount: string
  toAmount: string
  /** '' = не указано, к какому кошельку относится комиссия. */
  commissionAccountId: string
  note: string
}

interface CheckInTransferPanelProps {
  open: boolean
  title: string
  date: string
  accounts: Account[]
  settings: WalletSettings
  rateBook?: RateBook
  initial: CheckInTransferDraft | null
  onClose: () => void
  onSave: (draft: CheckInTransferDraft) => void | Promise<void>
}

export function emptyTransferDraft(accounts: Account[]): CheckInTransferDraft {
  return {
    fromAccountId: accounts[0]?.id ?? '',
    toAccountId: accounts[1]?.id ?? accounts[0]?.id ?? '',
    amount: '',
    toAmount: '',
    commissionAccountId: '',
    note: '',
  }
}

export function CheckInTransferPanel({
  open,
  title,
  date,
  accounts,
  settings,
  rateBook,
  initial,
  onClose,
  onSave,
}: CheckInTransferPanelProps) {
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [commissionAccountId, setCommissionAccountId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const manualRates = useWalletStore((s) => s.manualRates)

  useEffect(() => {
    if (!open || !initial) return
    setFromAccountId(initial.fromAccountId)
    setToAccountId(initial.toAccountId)
    setAmount(initial.amount)
    setToAmount(initial.toAmount)
    setCommissionAccountId(initial.commissionAccountId)
    setNote(initial.note)
    setSaving(false)
  }, [open, initial])

  const fromAccount = useMemo(
    () => accounts.find((a) => a.id === fromAccountId),
    [accounts, fromAccountId],
  )
  const toAccount = useMemo(
    () => accounts.find((a) => a.id === toAccountId),
    [accounts, toAccountId],
  )
  const crossCurrency = Boolean(
    fromAccount && toAccount && fromAccount.currency !== toAccount.currency,
  )

  const parsedAmount = parseMoneyInput(amount)
  const parsedToAmount = parseMoneyInput(toAmount)
  const receiveOk = crossCurrency
    ? parsedToAmount != null && parsedToAmount > 0
    : parsedToAmount == null || parsedToAmount > 0
  const canSave =
    !!fromAccountId &&
    !!toAccountId &&
    fromAccountId !== toAccountId &&
    parsedAmount != null &&
    parsedAmount > 0 &&
    receiveOk &&
    accounts.length >= 2

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

  const receiveHint =
    crossCurrency && parsedAmount != null && parsedAmount > 0
      ? suggestedReceiveAmount(
          parsedAmount,
          fromAccount,
          toAccount,
          settings,
          date,
          rateBook,
          manualRates,
        )
      : null

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      await onSave({
        fromAccountId,
        toAccountId,
        amount,
        toAmount,
        commissionAccountId:
          commissionAccountId === fromAccountId || commissionAccountId === toAccountId
            ? commissionAccountId
            : '',
        note,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <EntityEditPanel
      open={open}
      title={title}
      onClose={onClose}
      onSave={handleSave}
      saveDisabled={!canSave || saving}
      saveActionId="check-in-transfer-save"
      dataQa="check-in-transfer"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Перевод относится к дате чек-ина. Списание — в валюте счёта «откуда», зачисление —
          в валюте счёта «куда».
          {crossCurrency ? ' Для разных валют сумма получения обязательна.' : ''}
        </p>
        <Field label="Откуда">
          <Select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} dataQa="check-in-transfer-from">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Куда">
          <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} dataQa="check-in-transfer-to">
            {accounts.map((a) => (
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
            dataQa="check-in-transfer-amount"
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
              receiveHint != null && Number.isFinite(receiveHint)
                ? receiveHint.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
                : '0'
            }
            dataQa="check-in-transfer-to-amount"
          />
        </Field>
        <TransferSpreadLine
          spread={spread}
          currency={settings.baseCurrency}
          className="text-sm font-medium"
          dataQa="check-in-transfer-spread"
        />
        <Field label="Комиссия относится к кошельку">
          <Select
            value={
              commissionAccountId === fromAccountId || commissionAccountId === toAccountId
                ? commissionAccountId
                : ''
            }
            onChange={(e) => setCommissionAccountId(e.target.value)}
            dataQa="check-in-transfer-commission-account"
          >
            <option value="">Не указано (оба счёта)</option>
            {fromAccount ? (
              <option value={fromAccount.id}>{fromAccount.name} ({fromAccount.currency})</option>
            ) : null}
            {toAccount && toAccount.id !== fromAccount?.id ? (
              <option value={toAccount.id}>{toAccount.name} ({toAccount.currency})</option>
            ) : null}
          </Select>
        </Field>
        <Field label="Комментарий">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Необязательно" dataQa="check-in-transfer-note" />
        </Field>
      </div>
    </EntityEditPanel>
  )
}
