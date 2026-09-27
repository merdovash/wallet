import { useEffect, useState } from 'react'
import {
  CHECK_IN_INTERVAL_OPTIONS,
  normalizeCheckInIntervalDays,
  readCheckInIntervalDays,
  writeCheckInIntervalDays,
} from '../../lib/checkInReminder'
import { dataQa } from '../../lib/dataQa'
import {
  formatInflationPercentInput,
  parseInflationPercentInput,
} from '../../lib/realReturn'
import { useTheme } from '../../lib/useTheme'
import type { ThemeMode } from '../../lib/theme'
import { useWalletStore } from '../../store/walletStore'
import { Card, Field, Input, Select } from '../ui/FormControls'
import { PageHeader } from '../ui/PageHeader'

export function SettingsGeneralPanel() {
  const settings = useWalletStore((s) => s.settings)
  const setSettings = useWalletStore((s) => s.setSettings)
  const { mode: themeMode, setMode: setThemeMode } = useTheme()
  const [checkInIntervalDays, setCheckInIntervalDays] = useState(readCheckInIntervalDays)
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

  return (
    <div className="mx-auto max-w-3xl space-y-4" {...dataQa('settings-general-page')}>
      <PageHeader
        title="Общие"
        description="Тема оформления, напоминания о чек-ине и бенчмарки доходности"
        showPrimary={false}
      />

      <Card className="space-y-4">
        <Field label="Тема оформления">
          <Select
            value={themeMode}
            onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
            dataQa="settings-theme"
          >
            <option value="system">Как в системе</option>
            <option value="light">Светлая</option>
            <option value="dark">Тёмная</option>
          </Select>
        </Field>
      </Card>

      <Card className="space-y-4">
        <Field label="Интервал чек-инов">
          <Select
            value={String(checkInIntervalDays)}
            dataQa="settings-interval"
            onChange={(e) => {
              const next = Number(e.target.value)
              writeCheckInIntervalDays(next)
              setCheckInIntervalDays(normalizeCheckInIntervalDays(next))
            }}
          >
            {CHECK_IN_INTERVAL_OPTIONS.map((days) => (
              <option key={days} value={days}>
                раз в {days === 1 ? 'день' : `${days} ${days < 5 ? 'дня' : 'дней'}`}
              </option>
            ))}
          </Select>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            На дашборде появится напоминание, если с последнего чек-ина прошло больше интервала
          </p>
        </Field>
      </Card>

      <Card className="space-y-4">
        <Field label="Годовая инфляция, %">
          <Input
            type="text"
            inputMode="decimal"
            placeholder="например 8"
            dataQa="settings-inflation"
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
            dataQa="settings-key-rate"
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
    </div>
  )
}
