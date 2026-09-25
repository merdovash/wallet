import { useEffect, useMemo, useState } from 'react'
import { CURRENCY_OPTIONS } from '../../lib/currency'
import { suggestedAccountAmount } from '../../lib/expenseCheckIn'
import { formatIsoToRu } from '../../lib/format'
import { formatMoneyInput, parseMoneyInput } from '../../lib/moneyInput'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import type { Expense } from '../../types/wallet'
import { Field, Input, MoneyInput, Select } from '../ui/FormControls'
import { EntityEditPanel } from '../ui/EntityEditPanel'

interface ExpenseEditPanelProps {
  open: boolean
  expense: Expense | null
  onClose: () => void
}

function amountToInput(amount: number): string {
  return formatMoneyInput(String(amount).replace('.', ','))
}

/** Редактирование расхода: дата и счёт фиксированы, чек-ин пересчитывается. */
export function ExpenseEditPanel({ open, expense, onClose }: ExpenseEditPanelProps) {
  const accounts = useWalletStore((s) => s.accounts)
  const settings = useWalletStore((s) => s.settings)
  const manualRates = useWalletStore((s) => s.manualRates)
  const updateExpenseCheckIn = useWalletStore((s) => s.updateExpenseCheckIn)
  const rateBook = useRatesStore((s) => s.byDate)

  const account = useMemo(
    () => (expense ? accounts.find((a) => a.id === expense.accountId) ?? null : null),
    [accounts, expense],
  )

  const [currency, setCurrency] = useState('')
  const [amount, setAmount] = useState('')
  const [accountAmount, setAccountAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !expense) return
    setCurrency(expense.currency)
    setAmount(amountToInput(expense.amount))
    setAccountAmount(
      expense.currency !== (account?.currency ?? expense.currency)
        ? amountToInput(expense.accountAmount)
        : '',
    )
    setNote(expense.note ?? '')
    setSaving(false)
    setError(null)
  }, [open, expense, account])

  const currencyOptions = useMemo(() => {
    const codes = new Set(CURRENCY_OPTIONS.map((c) => c.code))
    for (const a of accounts) codes.add(a.currency)
    if (expense) codes.add(expense.currency)
    return [...codes]
  }, [accounts, expense])

  const crossCurrency = Boolean(account && currency && account.currency !== currency)
  const parsedAmount = parseMoneyInput(amount)
  const parsedAccountAmount = parseMoneyInput(accountAmount)

  const chargeHint =
    crossCurrency && account && expense && parsedAmount != null && parsedAmount > 0
      ? suggestedAccountAmount(
          parsedAmount,
          currency,
          account,
          manualRates,
          settings,
          expense.date,
          rateBook,
        )
      : null

  const canSave =
    !saving &&
    !!expense &&
    !!account &&
    parsedAmount != null &&
    parsedAmount > 0 &&
    (!crossCurrency || (parsedAccountAmount != null && parsedAccountAmount > 0))

  async function handleSave() {
    if (!canSave || !expense || parsedAmount == null) return
    setSaving(true)
    setError(null)
    try {
      await updateExpenseCheckIn(
        expense.id,
        {
          currency,
          amount: parsedAmount,
          accountAmount:
            crossCurrency && parsedAccountAmount != null && parsedAccountAmount > 0
              ? parsedAccountAmount
              : undefined,
          note,
        },
        rateBook,
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить расход')
    } finally {
      setSaving(false)
    }
  }

  return (
    <EntityEditPanel
      open={open}
      title="Редактировать расход"
      onClose={onClose}
      onSave={handleSave}
      saveDisabled={!canSave}
      saveActionId="expense-edit-save"
      dataQa="expense-edit"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Остаток счёта в чек-ине за этот день будет пересчитан под новую сумму списания.
        </p>
        <Field label="Дата">
          <Input value={expense ? formatIsoToRu(expense.date) : ''} readOnly disabled />
        </Field>
        <Field label="Счёт">
          <Input
            value={account ? `${account.name} (${account.currency})` : '—'}
            readOnly
            disabled
          />
        </Field>
        <Field label="Валюта расхода">
          <Select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            dataQa="expense-edit-currency"
          >
            {currencyOptions.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`Сумма расхода${currency ? ` (${currency})` : ''}`}>
          <MoneyInput
            value={amount}
            onChange={setAmount}
            allowNegative={false}
            placeholder="0"
            dataQa="expense-edit-amount"
          />
        </Field>
        {crossCurrency && account ? (
          <Field label={`Списано со счёта (${account.currency}) *`}>
            <MoneyInput
              value={accountAmount}
              onChange={setAccountAmount}
              allowNegative={false}
              placeholder={
                chargeHint != null && Number.isFinite(chargeHint)
                  ? chargeHint.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
                  : '0'
              }
              dataQa="expense-edit-account-amount"
            />
          </Field>
        ) : null}
        <Field label="Комментарий">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Необязательно"
            dataQa="expense-edit-note"
          />
        </Field>
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </div>
    </EntityEditPanel>
  )
}
