import { useEffect, useMemo, useState } from 'react'
import { CURRENCY_OPTIONS } from '../../lib/currency'
import { suggestedAccountAmount } from '../../lib/expenseCheckIn'
import { todayIsoDate } from '../../lib/format'
import { parseMoneyInput } from '../../lib/moneyInput'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { DateInput, Field, Input, MoneyInput, Select } from '../ui/FormControls'
import { EntityEditPanel } from '../ui/EntityEditPanel'

interface ExpenseCreatePanelProps {
  open: boolean
  onClose: () => void
}

/** Расход как отдельное действие: чек-ин по счёту фиксируется сразу. */
export function ExpenseCreatePanel({ open, onClose }: ExpenseCreatePanelProps) {
  const accounts = useWalletStore((s) => s.accounts)
  const settings = useWalletStore((s) => s.settings)
  const manualRates = useWalletStore((s) => s.manualRates)
  const addExpenseCheckIn = useWalletStore((s) => s.addExpenseCheckIn)
  const rateBook = useRatesStore((s) => s.byDate)

  const activeAccounts = useMemo(
    () =>
      accounts
        .filter((a) => !a.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [accounts],
  )

  const [date, setDate] = useState(todayIsoDate)
  const [accountId, setAccountId] = useState('')
  const [currency, setCurrency] = useState('')
  const [amount, setAmount] = useState('')
  const [accountAmount, setAccountAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const first = activeAccounts[0]
    setDate(todayIsoDate())
    setAccountId(first?.id ?? '')
    setCurrency(first?.currency ?? settings.baseCurrency)
    setAmount('')
    setAccountAmount('')
    setNote('')
    setSaving(false)
    setError(null)
  }, [open, activeAccounts, settings.baseCurrency])

  const account = activeAccounts.find((a) => a.id === accountId)

  const currencyOptions = useMemo(() => {
    const codes = new Set(CURRENCY_OPTIONS.map((c) => c.code))
    for (const a of accounts) codes.add(a.currency)
    return [...codes]
  }, [accounts])

  const crossCurrency = Boolean(account && currency && account.currency !== currency)
  const parsedAmount = parseMoneyInput(amount)
  const parsedAccountAmount = parseMoneyInput(accountAmount)

  const chargeHint =
    crossCurrency && account && parsedAmount != null && parsedAmount > 0
      ? suggestedAccountAmount(
          parsedAmount,
          currency,
          account,
          manualRates,
          settings,
          date,
          rateBook,
        )
      : null

  const canSave =
    !saving &&
    !!date &&
    !!account &&
    parsedAmount != null &&
    parsedAmount > 0 &&
    (!crossCurrency || (parsedAccountAmount != null && parsedAccountAmount > 0))

  async function handleSave() {
    if (!canSave || !account || parsedAmount == null) return
    setSaving(true)
    setError(null)
    try {
      await addExpenseCheckIn(
        {
          date,
          accountId: account.id,
          currency,
          amount: parsedAmount,
          accountAmount:
            crossCurrency && parsedAccountAmount != null && parsedAccountAmount > 0
              ? parsedAccountAmount
              : undefined,
          note: note.trim() || undefined,
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

  function handleAccountChange(nextId: string) {
    setAccountId(nextId)
    const next = activeAccounts.find((a) => a.id === nextId)
    if (next) setCurrency(next.currency)
    setAccountAmount('')
  }

  return (
    <EntityEditPanel
      open={open}
      title="Расход"
      onClose={onClose}
      onSave={handleSave}
      saveDisabled={!canSave}
      saveActionId="expense-form-save"
      dataQa="expense-create"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Чек-ин фиксируется сразу: остаток счёта на эту дату уменьшится на сумму списания.
          {crossCurrency
            ? ' Валюта расхода отличается от валюты счёта — укажите, сколько списано со счёта.'
            : ''}
        </p>
        <Field label="Дата">
          <DateInput value={date} onChange={setDate} dataQa="expense-create-date" />
        </Field>
        <Field label="Счёт">
          <Select
            value={accountId}
            onChange={(e) => handleAccountChange(e.target.value)}
            dataQa="expense-create-account"
          >
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Валюта расхода">
          <Select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            dataQa="expense-create-currency"
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
            dataQa="expense-create-amount"
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
              dataQa="expense-create-account-amount"
            />
          </Field>
        ) : null}
        <Field label="Комментарий">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Необязательно"
            dataQa="expense-create-note"
          />
        </Field>
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </div>
    </EntityEditPanel>
  )
}
