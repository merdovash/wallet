import { useEffect, useMemo, useState } from 'react'
import { resolvePivotForDate } from '../../lib/cbrRates'
import { CURRENCY_OPTIONS, currencyLabel } from '../../lib/currency'
import { formatCurrency, formatDateDisplay, formatDateTimeDisplay, todayIsoDate } from '../../lib/format'
import {
  formatInflationPercentInput,
  parseInflationPercentInput,
} from '../../lib/realReturn'
import { useTheme } from '../../lib/useTheme'
import type { ThemeMode } from '../../lib/theme'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Button, Card, Field, Input, Select } from '../ui/FormControls'
import { RatesRegistryPanel } from './RatesRegistryPanel'

export function SettingsPanel() {
  const settings = useWalletStore((s) => s.settings)
  const accounts = useWalletStore((s) => s.accounts)
  const setSettings = useWalletStore((s) => s.setSettings)
  const { mode: themeMode, setMode: setThemeMode } = useTheme()
  const byDate = useRatesStore((s) => s.byDate)
  const status = useRatesStore((s) => s.status)
  const error = useRatesStore((s) => s.error)
  const lastFetchedAt = useRatesStore((s) => s.lastFetchedAt)
  const latestRateDate = useRatesStore((s) => s.latestRateDate)
  const ensureRates = useRatesStore((s) => s.ensureRates)
  const refreshDate = useRatesStore((s) => s.refreshDate)
  const [registryOpen, setRegistryOpen] = useState(false)
  const [inflationText, setInflationText] = useState(() =>
    formatInflationPercentInput(settings.annualInflationPct),
  )
  const [keyRateText, setKeyRateText] = useState(() =>
    formatInflationPercentInput(settings.keyRatePct),
  )

  useEffect(() => {
    setInflationText(formatInflationPercentInput(settings.annualInflationPct))
  }, [settings.annualInflationPct])

  useEffect(() => {
    setKeyRateText(formatInflationPercentInput(settings.keyRatePct))
  }, [settings.keyRatePct])

  const today = todayIsoDate()
  const pivot = useMemo(() => resolvePivotForDate(today, byDate), [byDate, today])
  const rateDates = useMemo(() => Object.keys(byDate).sort().reverse(), [byDate])
  const effectiveRateDate = latestRateDate ?? rateDates[0] ?? null

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
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-200">Настройки</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Базовая валюта и курсы ЦБ РФ на дату чек-ина (cbr-xml-daily.ru)
        </p>
      </div>

      <Card className="space-y-4">
        <Field label="Тема оформления">
          <Select
            value={themeMode}
            onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
          >
            <option value="system">Как в системе</option>
            <option value="light">Светлая</option>
            <option value="dark">Тёмная</option>
          </Select>
        </Field>
      </Card>

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
        <Field label="Годовая инфляция, %">
          <Input
            type="text"
            inputMode="decimal"
            placeholder="например 8"
            value={inflationText}
            onChange={(e) => setInflationText(e.target.value)}
            onBlur={() => {
              const parsed = parseInflationPercentInput(inflationText)
              void setSettings({ annualInflationPct: parsed })
            }}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Для виджета «Реальных годовых» на дашборде: (1 + номинал) / (1 + инфляция) − 1
          </p>
        </Field>
        <Field label="Ключевая ставка, %">
          <Input
            type="text"
            inputMode="decimal"
            placeholder="например 16"
            value={keyRateText}
            onChange={(e) => setKeyRateText(e.target.value)}
            onBlur={() => {
              const parsed = parseInflationPercentInput(keyRateText)
              void setSettings({ keyRatePct: parsed })
            }}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Бенчмарк в расшифровке доходности — сравнение «в годовых» портфеля с ключевой ставкой
          </p>
        </Field>
      </Card>

      <Card className="space-y-4">
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
                {effectiveRateDate !== today
                  ? ` (для ${formatDateDisplay(today)})`
                  : ''}
                {rateDates.length > 1 ? ` · в кэше дней: ${rateDates.length}` : ''}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={rateDates.length === 0}
              onClick={() => setRegistryOpen(true)}
            >
              Реестр
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={status === 'loading'}
              onClick={() => void refreshDate(today)}
            >
              Обновить
            </Button>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Для каждого чек-ина берётся курс ЦБ на эту дату (в выходные — последний рабочий день).
          USDT считается как USD.
        </p>

        {pivot && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              1 единица → {settings.baseCurrency} (сегодня)
            </h3>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
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
                    <li key={code} className="flex justify-between px-3 py-2 text-sm text-slate-400 dark:text-slate-500">
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
      </Card>

      <RatesRegistryPanel
        open={registryOpen}
        onClose={() => setRegistryOpen(false)}
        byDate={byDate}
        baseCurrency={settings.baseCurrency}
        currenciesInUse={currenciesInUse}
      />
    </div>
  )
}
