import { useState } from 'react'
import { CURRENCY_OPTIONS } from '../../lib/currency'
import { dataQa } from '../../lib/dataQa'
import { formatDateTimeDisplay } from '../../lib/format'
import { parseMoneyInput } from '../../lib/moneyInput'
import { useWalletStore } from '../../store/walletStore'
import { Button, Field, Card, MoneyInput, Select } from '../ui/FormControls'

/** Ручные курсы обмена произвольных валютных пар (1 из = N в). */
export function ManualRatesCard() {
  const manualRates = useWalletStore((s) => s.manualRates)
  const setManualRate = useWalletStore((s) => s.setManualRate)
  const removeManualRate = useWalletStore((s) => s.removeManualRate)

  const [fromCurrency, setFromCurrency] = useState('USD')
  const [toCurrency, setToCurrency] = useState('RUB')
  /** За единицу какой валюты пары указывается курс: исходной или целевой. */
  const [rateBase, setRateBase] = useState<'from' | 'to'>('from')
  const [rateText, setRateText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedRate = parseMoneyInput(rateText)
  const canSave =
    !busy && fromCurrency !== toCurrency && parsedRate != null && parsedRate > 0

  const rateUnitCurrency = rateBase === 'from' ? fromCurrency : toCurrency
  const rateQuoteCurrency = rateBase === 'from' ? toCurrency : fromCurrency

  async function handleSave() {
    if (!canSave || parsedRate == null) return
    setBusy(true)
    setError(null)
    try {
      // Храним курс в той ориентации, как её указал пользователь:
      // «1 USD = 85 RUB» сохраняется как пара USD→RUB с курсом 85.
      await setManualRate({
        fromCurrency: rateUnitCurrency,
        toCurrency: rateQuoteCurrency,
        rate: parsedRate,
      })
      setRateText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить курс')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(from: string, to: string) {
    setBusy(true)
    setError(null)
    try {
      await removeManualRate(from, to)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить курс')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-4" dataQa="settings-manual-rates">
      <div>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Курсы обмена (ручные)
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Актуальный курс обмена произвольной пары валют. Используется при обмене валют —
          подставляется в сумму зачисления перевода и в сумму списания расхода вместо курса ЦБ.
          Курс можно указать за единицу любой из валют пары: например, покупая доллары за рубли,
          укажите «1 USD = 85 RUB». Для пары хранится один актуальный курс.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Отдаю" className="min-w-[7rem] flex-1">
          <Select
            value={fromCurrency}
            onChange={(e) => setFromCurrency(e.target.value)}
            dataQa="manual-rate-from"
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Получаю" className="min-w-[7rem] flex-1">
          <Select
            value={toCurrency}
            onChange={(e) => setToCurrency(e.target.value)}
            dataQa="manual-rate-to"
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Курс за" className="min-w-[7rem] flex-1">
          <Select
            value={rateBase}
            onChange={(e) => setRateBase(e.target.value === 'to' ? 'to' : 'from')}
            dataQa="manual-rate-base"
          >
            <option value="from">1 {fromCurrency}</option>
            <option value="to">1 {toCurrency}</option>
          </Select>
        </Field>
        <Field
          label={`1 ${rateUnitCurrency} = … ${rateQuoteCurrency}`}
          className="min-w-[8rem] flex-1"
        >
          <MoneyInput
            value={rateText}
            onChange={setRateText}
            allowNegative={false}
            placeholder="0"
            dataQa="manual-rate-value"
          />
        </Field>
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave}
          dataQa="manual-rate-save"
        >
          Сохранить
        </Button>
      </div>
      {fromCurrency === toCurrency ? (
        <p className="text-xs text-red-600 dark:text-red-400">Валюты пары должны отличаться.</p>
      ) : null}
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}

      {manualRates.length > 0 ? (
        <ul
          className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
          {...dataQa('manual-rates-list')}
        >
          {manualRates.map((rate) => (
            <li
              key={`${rate.fromCurrency}-${rate.toCurrency}`}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              {...dataQa(`manual-rate-${rate.fromCurrency}-${rate.toCurrency}`)}
            >
              <span className="min-w-0">
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  1 {rate.fromCurrency} ={' '}
                  {rate.rate.toLocaleString('ru-RU', { maximumFractionDigits: 6 })}{' '}
                  {rate.toCurrency}
                </span>
                {rate.updatedAt ? (
                  <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                    {formatDateTimeDisplay(rate.updatedAt)}
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  onClick={() => {
                    setFromCurrency(rate.fromCurrency)
                    setToCurrency(rate.toCurrency)
                    setRateBase('from')
                    setRateText(
                      String(rate.rate).replace('.', ','),
                    )
                  }}
                  {...dataQa(`manual-rate-edit-${rate.fromCurrency}-${rate.toCurrency}`)}
                >
                  Изменить
                </button>
                <button
                  type="button"
                  className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  disabled={busy}
                  onClick={() => void handleDelete(rate.fromCurrency, rate.toCurrency)}
                  {...dataQa(`manual-rate-delete-${rate.fromCurrency}-${rate.toCurrency}`)}
                >
                  Удалить
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Ручных курсов пока нет — при обмене используется курс ЦБ.
        </p>
      )}
    </Card>
  )
}
