import { useEffect, useMemo, useState } from 'react'
import { needsRateFetch } from '../../lib/cbrRates'
import { CURRENCY_OPTIONS } from '../../lib/currency'
import { currenciesWithWalletsByBalance } from '../../lib/currenciesWithWallets'
import { dataQa } from '../../lib/dataQa'
import { formatDateDisplay, formatDateTimeDisplay, todayIsoDate } from '../../lib/format'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Button, Card, DateInput, Field, Select } from '../ui/FormControls'
import { PageHeader } from '../ui/PageHeader'
import { RatesRegistry } from './RatesRegistry'

export function SettingsCurrencyPanel() {
  const settings = useWalletStore((s) => s.settings)
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const setSettings = useWalletStore((s) => s.setSettings)
  const byDate = useRatesStore((s) => s.byDate)
  const status = useRatesStore((s) => s.status)
  const error = useRatesStore((s) => s.error)
  const lastFetchedAt = useRatesStore((s) => s.lastFetchedAt)
  const latestRateDate = useRatesStore((s) => s.latestRateDate)
  const ensureRates = useRatesStore((s) => s.ensureRates)
  const refreshDate = useRatesStore((s) => s.refreshDate)

  const [loadDate, setLoadDate] = useState(() => todayIsoDate())
  const [feedback, setFeedback] = useState<string | null>(null)
  const [loadingDate, setLoadingDate] = useState(false)

  const today = todayIsoDate()
  const rateDates = useMemo(() => Object.keys(byDate).sort().reverse(), [byDate])
  const effectiveRateDate = latestRateDate ?? rateDates[0] ?? null

  const currenciesInUse = useMemo(
    () => currenciesWithWalletsByBalance(accounts, snapshots, settings, byDate),
    [accounts, snapshots, settings, byDate],
  )

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

  const busy = loadingDate || status === 'loading'

  async function handleLoadDate() {
    if (!loadDate) {
      setFeedback('Укажите дату')
      return
    }
    setFeedback(null)

    if (byDate[loadDate] && !needsRateFetch(loadDate, byDate)) {
      setFeedback(`Курс за ${formatDateDisplay(loadDate)} уже есть в реестре`)
      return
    }

    setLoadingDate(true)
    try {
      if (!byDate[loadDate]) {
        await refreshDate(loadDate)
      } else {
        await ensureRates([loadDate])
      }
      const err = useRatesStore.getState().error
      const next = useRatesStore.getState().byDate
      if (err) {
        setFeedback(err)
      } else if (next[loadDate]) {
        setFeedback(`Загружено: ${formatDateDisplay(loadDate)}`)
      } else {
        const keys = Object.keys(next).sort().reverse()
        const nearest = keys.find((d) => d <= loadDate)
        setFeedback(
          nearest
            ? `Загружен ближайший рабочий день: ${formatDateDisplay(nearest)}`
            : 'Курс загружен',
        )
      }
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Не удалось загрузить курс')
    } finally {
      setLoadingDate(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4" {...dataQa('settings-currency-page')}>
      <PageHeader
        title="Валюта"
        description="Базовая валюта, загрузка курса ЦБ и единый реестр котировок"
        showPrimary={false}
      />

      <Card className="space-y-4">
        <Field label="Базовая валюта">
          <Select
            value={settings.baseCurrency}
            dataQa="settings-base-currency"
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

      <Card className="space-y-4" dataQa="settings-rates">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Курсы ЦБ</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{statusLabel}</p>
            {lastFetchedAt && (
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Обновлено: {formatDateTimeDisplay(lastFetchedAt)}
              </p>
            )}
            {effectiveRateDate && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                День котировки ЦБ: {formatDateDisplay(effectiveRateDate)}
                {effectiveRateDate !== today ? ` (для ${formatDateDisplay(today)})` : ''}
                {rateDates.length > 1 ? ` · в кэше дней: ${rateDates.length}` : ''}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={status === 'loading'}
            onClick={() => void refreshDate(today)}
            dataQa="settings-rates-refresh"
          >
            Обновить
          </Button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Для каждого чек-ина берётся курс на эту дату (в выходные — последний рабочий день).
          USDT считается как USD. Ручная покупка и продажа перекрывают ЦБ на выбранный день.
        </p>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/60">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Дозагрузить за дату
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Дата" className="min-w-[9rem] flex-1">
              <DateInput
                value={loadDate}
                onChange={setLoadDate}
                disabled={busy}
                dataQa="rates-registry-date"
              />
            </Field>
            <Button
              type="button"
              onClick={() => void handleLoadDate()}
              disabled={busy || !loadDate}
              className="shrink-0"
              dataQa="rates-registry-load"
            >
              {busy ? 'Загрузка…' : 'Загрузить'}
            </Button>
          </div>
          {feedback ? (
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{feedback}</p>
          ) : null}
          {error && !feedback ? (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>
          ) : null}
        </div>
      </Card>

      <Card className="space-y-3" dataQa="settings-rates-registry-card">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Реестр курсов</h2>
        <RatesRegistry
          byDate={byDate}
          baseCurrency={settings.baseCurrency}
          currenciesInUse={currenciesInUse}
        />
      </Card>
    </div>
  )
}
