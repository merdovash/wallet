import { useMemo } from 'react'
import { CURRENCY_ALIASES } from '../../lib/cbrRates'
import { currencyLabel } from '../../lib/currency'
import { formatCurrency, formatDateDisplay } from '../../lib/format'
import { StackPanel } from '../ui/StackPanel'

const PRIORITY_CODES = ['USD', 'EUR', 'USDT', 'CNY', 'GBP', 'BYN', 'AMD', 'GEL', 'THB']

interface RatesRegistryPanelProps {
  open: boolean
  onClose: () => void
  byDate: Record<string, Record<string, number>>
  baseCurrency: string
  currenciesInUse: string[]
}

function significantCodes(
  byDate: Record<string, Record<string, number>>,
  baseCurrency: string,
  currenciesInUse: string[],
): string[] {
  const present = new Set<string>()
  for (const pivot of Object.values(byDate)) {
    for (const code of Object.keys(pivot)) present.add(code)
  }

  const preferred = [
    ...currenciesInUse,
    ...PRIORITY_CODES,
  ].filter((code, index, arr) => arr.indexOf(code) === index)

  const ordered = preferred.filter(
    (code) => code !== 'RUB' && code !== baseCurrency && present.has(code),
  )

  // Include aliases that resolve to a present quote
  for (const [alias, target] of Object.entries(CURRENCY_ALIASES)) {
    if (
      alias !== baseCurrency &&
      !ordered.includes(alias) &&
      (present.has(alias) || present.has(target))
    ) {
      ordered.push(alias)
    }
  }

  return ordered
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
  const dates = useMemo(() => Object.keys(byDate).sort().reverse(), [byDate])
  const columns = useMemo(
    () => significantCodes(byDate, baseCurrency, currenciesInUse),
    [byDate, baseCurrency, currenciesInUse],
  )

  return (
    <StackPanel open={open} title="Реестр курсов ЦБ" onClose={onClose}>
      {dates.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Пока нет загруженных дней курсов.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            1 единица валюты → {baseCurrency}. Показаны валюты счетов и основные котировки ЦБ.
          </p>
          <ul className="space-y-2 md:hidden">
            {dates.map((date) => {
              const pivot = byDate[date] ?? {}
              return (
                <li
                  key={date}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                >
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {formatDateDisplay(date)}
                  </p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                    {columns.map((code) => {
                      const value = rateInBase(pivot, code, baseCurrency)
                      return (
                        <div key={code} className="min-w-0">
                          <dt className="text-slate-400 dark:text-slate-500" title={currencyLabel(code)}>
                            {code}
                          </dt>
                          <dd className="truncate tabular-nums text-slate-800 dark:text-slate-200">
                            {value == null ? (
                              <span className="text-slate-300">—</span>
                            ) : (
                              formatCurrency(value, baseCurrency)
                            )}
                          </dd>
                        </div>
                      )
                    })}
                  </dl>
                </li>
              )
            })}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 md:block">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                  <th className="sticky left-0 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 font-medium">Дата</th>
                  {columns.map((code) => (
                    <th key={code} className="px-3 py-2 font-medium tabular-nums" title={currencyLabel(code)}>
                      {code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dates.map((date) => {
                  const pivot = byDate[date] ?? {}
                  return (
                    <tr key={date} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                      <td className="sticky left-0 bg-white dark:bg-slate-900 px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                        {formatDateDisplay(date)}
                      </td>
                      {columns.map((code) => {
                        const value = rateInBase(pivot, code, baseCurrency)
                        return (
                          <td key={code} className="px-3 py-2 tabular-nums text-slate-800 dark:text-slate-200">
                            {value == null ? (
                              <span className="text-slate-300">—</span>
                            ) : (
                              formatCurrency(value, baseCurrency)
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </StackPanel>
  )
}
