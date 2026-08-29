import { useMemo, useState } from 'react'
import { CURRENCY_ALIASES, needsRateFetch } from '../../lib/cbrRates'
import { currencyLabel } from '../../lib/currency'
import { formatCurrency, formatDateDisplay, todayIsoDate } from '../../lib/format'
import { useRatesStore } from '../../store/ratesStore'
import { Button, DateInput, Field } from '../ui/FormControls'
import { StackPanel } from '../ui/StackPanel'
import { VirtualList } from '../ui/VirtualList'

const ROW_HEIGHT = 48
const LIST_MAX_HEIGHT = 420

interface RatesRegistryPanelProps {
  open: boolean
  onClose: () => void
  byDate: Record<string, Record<string, number>>
  baseCurrency: string
  /** Wallet currencies only, already sorted by current balance. */
  currenciesInUse: string[]
}

/** Columns: foreign wallet currencies in the order passed (by balance). */
function significantCodes(baseCurrency: string, currenciesInUse: string[]): string[] {
  return currenciesInUse.filter((code) => code !== 'RUB' && code !== baseCurrency)
}

function rateInBase(
  pivot: Record<string, number>,
  code: string,
  baseCurrency: string,
): number | null {
  const resolved = CURRENCY_ALIASES[code] ?? code
  const rub = pivot[code] ?? pivot[resolved]
  if (rub == null) return null
  if (baseCurrency === 'RUB') return rub
  const baseRub = pivot[baseCurrency]
  if (baseRub == null || baseRub === 0) return null
  return rub / baseRub
}

export function RatesRegistryPanel({
  open,
  onClose,
  byDate,
  baseCurrency,
  currenciesInUse,
}: RatesRegistryPanelProps) {
  const ensureRates = useRatesStore((s) => s.ensureRates)
  const refreshDate = useRatesStore((s) => s.refreshDate)
  const status = useRatesStore((s) => s.status)
  const storeError = useRatesStore((s) => s.error)

  const [loadDate, setLoadDate] = useState(() => todayIsoDate())
  const [feedback, setFeedback] = useState<string | null>(null)
  const [loadingDate, setLoadingDate] = useState(false)

  const dates = useMemo(() => Object.keys(byDate).sort().reverse(), [byDate])
  const columns = useMemo(
    () => significantCodes(baseCurrency, currenciesInUse),
    [baseCurrency, currenciesInUse],
  )

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

  const busy = loadingDate || status === 'loading'
  const listHeight = Math.min(LIST_MAX_HEIGHT, Math.max(ROW_HEIGHT * 3, dates.length * ROW_HEIGHT))

  return (
    <StackPanel open={open} title="Реестр курсов ЦБ" onClose={onClose} dataQa="rates-registry">
      <div className="space-y-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/60">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Дозагрузить за дату
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Дата" className="min-w-[9rem] flex-1">
              <DateInput value={loadDate} onChange={setLoadDate} disabled={busy} dataQa="rates-registry-date" />
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
          {storeError && !feedback ? (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{storeError}</p>
          ) : null}
        </div>

        {dates.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Пока нет загруженных дней курсов. Укажите дату выше и нажмите «Загрузить».
          </p>
        ) : (
          <>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              1 ед. → {baseCurrency} · {dates.length} дн. · {columns.join(', ') || '—'}
            </p>

            <VirtualList
              items={dates}
              itemHeight={ROW_HEIGHT}
              height={listHeight}
              getKey={(date) => date}
              className="rounded-lg border border-slate-200 dark:border-slate-700"
              dataQa="table-rates"
              renderItem={(date) => {
                const pivot = byDate[date] ?? {}
                return (
                  <div className="flex h-full flex-col justify-center gap-0.5 border-b border-slate-100 px-2.5 dark:border-slate-800 sm:px-3" data-qa={`rates-row-${date}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[11px] font-semibold tabular-nums text-slate-900 dark:text-slate-200 sm:text-xs">
                        {formatDateDisplay(date)}
                      </p>
                      <p className="hidden text-[10px] text-slate-400 dark:text-slate-500 sm:block">
                        {columns.length} валют
                      </p>
                    </div>
                    <div className="flex gap-x-2 overflow-x-auto whitespace-nowrap text-[10px] leading-tight tabular-nums text-slate-600 dark:text-slate-400 sm:text-[11px]">
                      {columns.length === 0 ? (
                        <span>—</span>
                      ) : (
                        columns.map((code) => {
                          const value = rateInBase(pivot, code, baseCurrency)
                          return (
                            <span key={code} title={currencyLabel(code)} className="shrink-0">
                              <span className="text-slate-400 dark:text-slate-500">{code}</span>{' '}
                              {value == null ? '—' : formatCurrency(value, baseCurrency)}
                            </span>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              }}
            />
          </>
        )}
      </div>
    </StackPanel>
  )
}
