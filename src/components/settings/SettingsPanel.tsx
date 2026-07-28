import { useEffect, useMemo } from 'react'
import { resolvePivotForDate } from '../../lib/cbrRates'
import { CURRENCY_OPTIONS, currencyLabel } from '../../lib/currency'
import { formatCurrency, formatDateDisplay, formatDateTimeDisplay, todayIsoDate } from '../../lib/format'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Button, Card, Field, Select } from '../ui/FormControls'

export function SettingsPanel() {
  const settings = useWalletStore((s) => s.settings)
  const accounts = useWalletStore((s) => s.accounts)
  const setSettings = useWalletStore((s) => s.setSettings)
  const byDate = useRatesStore((s) => s.byDate)
  const status = useRatesStore((s) => s.status)
  const error = useRatesStore((s) => s.error)
  const lastFetchedAt = useRatesStore((s) => s.lastFetchedAt)
  const ensureRates = useRatesStore((s) => s.ensureRates)
  const refreshDate = useRatesStore((s) => s.refreshDate)

  const today = todayIsoDate()
  const pivot = useMemo(() => resolvePivotForDate(today, byDate), [byDate, today])
  const rateDates = useMemo(() => Object.keys(byDate).sort().reverse(), [byDate])

  const currenciesInUse = useMemo(() => {
    const set = new Set<string>([settings.baseCurrency])
    for (const account of accounts) set.add(account.currency)
    return [...set].sort()
  }, [accounts, settings.baseCurrency])

  useEffect(() => {
    void ensureRates([today])
  }, [ensureRates, today])

  const statusLabel =
    status === 'loading'
      ? 'Загрузка…'
      : status === 'error'
        ? `Ошибка: ${error ?? 'не удалось загрузить'}`
        : status === 'ready'
          ? 'Курсы ЦБ загружены'
          : 'Курсы ещё не загружены'

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Настройки</h1>
        <p className="text-sm text-slate-500">
          Базовая валюта и курсы ЦБ РФ на дату чек-ина (cbr-xml-daily.ru)
        </p>
      </div>

      <Card className="space-y-4">
        <Field label="Базовая валюта">
          <Select
            value={settings.baseCurrency}
            onChange={(e) => {
              void setSettings({ baseCurrency: e.target.value })
            }}
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Курсы ЦБ</h2>
            <p className="mt-1 text-xs text-slate-500">{statusLabel}</p>
            {lastFetchedAt && (
              <p className="mt-1 text-xs text-slate-400">
                Обновлено: {formatDateTimeDisplay(lastFetchedAt)}
              </p>
            )}
            {rateDates[0] && (
              <p className="mt-1 text-xs text-slate-500">
                Актуальный день ЦБ: {formatDateDisplay(rateDates[0])}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={status === 'loading'}
            onClick={() => void refreshDate(today)}
          >
            Обновить
          </Button>
        </div>

        <p className="text-xs text-slate-500">
          Для каждого чек-ина берётся курс ЦБ на эту дату (в выходные — последний рабочий день).
          USDT считается как USD.
        </p>

        {pivot && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              1 единица → {settings.baseCurrency} (сегодня)
            </h3>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {currenciesInUse.map((code) => {
                if (code === settings.baseCurrency) {
                  return (
                    <li key={code} className="flex justify-between px-3 py-2 text-sm">
                      <span>
                        {code} — {currencyLabel(code)}
                      </span>
                      <span className="font-medium">1</span>
                    </li>
                  )
                }
                const rub = pivot[code]
                if (rub == null) {
                  return (
                    <li key={code} className="flex justify-between px-3 py-2 text-sm text-slate-400">
                      <span>
                        {code} — {currencyLabel(code)}
                      </span>
                      <span>нет в ЦБ</span>
                    </li>
                  )
                }
                const inBase =
                  settings.baseCurrency === 'RUB'
                    ? rub
                    : rub / (pivot[settings.baseCurrency] ?? 1)
                return (
                  <li key={code} className="flex justify-between px-3 py-2 text-sm">
                    <span>
                      {code} — {currencyLabel(code)}
                    </span>
                    <span className="font-medium">
                      {formatCurrency(inBase, settings.baseCurrency)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {rateDates.length > 1 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Закэшированные дни ЦБ
            </h3>
            <p className="text-sm text-slate-600">
              {rateDates.slice(0, 12).map(formatDateDisplay).join(', ')}
              {rateDates.length > 12 ? '…' : ''}
            </p>
          </div>
        )}
      </Card>
    </div>
  )
}
