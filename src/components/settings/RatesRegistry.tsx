import { useMemo, useState } from 'react'
import { currencyLabel } from '../../lib/currency'
import {
  buySellDiffer,
  findFxOverride,
  indexFxOverrides,
  rateInBase,
  registryQuoteCodes,
  rubPerUnitToBase,
} from '../../lib/fxRates'
import { formatCurrency, formatDateDisplay } from '../../lib/format'
import { useWalletStore } from '../../store/walletStore'
import { VirtualList } from '../ui/VirtualList'
import { RateEditPanel } from './RateEditPanel'

const DAY_HEADER = 36
const RATE_ROW = 52
const DAY_PAD = 12
const LIST_MAX_HEIGHT = 560

interface RatesRegistryProps {
  byDate: Record<string, Record<string, number>>
  baseCurrency: string
  currenciesInUse: string[]
}

function formatPair(
  buy: number,
  sell: number,
  baseCurrency: string,
): { primary: string; secondary?: string } {
  if (!buySellDiffer(buy, sell)) {
    return { primary: formatCurrency(buy, baseCurrency) }
  }
  return {
    primary: formatCurrency(buy, baseCurrency),
    secondary: formatCurrency(sell, baseCurrency),
  }
}

export function RatesRegistry({ byDate, baseCurrency, currenciesInUse }: RatesRegistryProps) {
  const overrides = useWalletStore((s) => s.fxOverrides)
  const overrideIndex = useMemo(() => indexFxOverrides(overrides), [overrides])
  const columns = useMemo(
    () => registryQuoteCodes(baseCurrency, currenciesInUse, overrides),
    [baseCurrency, currenciesInUse, overrides],
  )

  const dates = useMemo(() => {
    const set = new Set([...Object.keys(byDate), ...overrides.map((item) => item.date)])
    return [...set].sort().reverse()
  }, [byDate, overrides])

  const [edit, setEdit] = useState<{ date: string; currency: string } | null>(null)

  const itemHeight = DAY_HEADER + Math.max(1, columns.length) * RATE_ROW + DAY_PAD
  const listHeight = Math.min(
    LIST_MAX_HEIGHT,
    Math.max(itemHeight * 2, Math.min(dates.length, 6) * itemHeight),
  )

  const editPivot =
    edit && byDate[edit.date]
      ? byDate[edit.date]!
      : edit
        ? (Object.keys(byDate)
            .filter((d) => d <= edit.date)
            .sort()
            .at(-1) &&
            byDate[
              Object.keys(byDate)
                .filter((d) => d <= edit.date)
                .sort()
                .at(-1)!
            ]) ||
          { RUB: 1 }
        : { RUB: 1 }

  return (
    <div className="space-y-2" data-qa="rates-registry">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        1 ед. → {baseCurrency}. Нажмите на курс, чтобы задать покупку и продажу.
      </p>

      {dates.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Пока нет дней курсов. Загрузите дату ЦБ выше.
        </p>
      ) : columns.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Нет валютных счетов — нечего показывать в реестре.
        </p>
      ) : (
        <VirtualList
          items={dates}
          itemHeight={itemHeight}
          height={listHeight}
          getKey={(date) => date}
          className="rounded-xl border border-slate-200 dark:border-slate-700"
          dataQa="table-rates"
          renderItem={(date) => {
            const pivot = byDate[date] ?? {}
            return (
              <div
                className="flex h-full flex-col border-b border-slate-100 px-3 py-2 dark:border-slate-800"
                data-qa={`rates-row-${date}`}
              >
                <p className="mb-1 text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-200">
                  {formatDateDisplay(date)}
                </p>
                <ul className="flex min-h-0 flex-1 flex-col gap-1">
                  {columns.map((code) => {
                    const override = findFxOverride(overrideIndex, date, code)
                    const official = rateInBase(pivot, code, baseCurrency)
                    const buy = override
                      ? rubPerUnitToBase(override.buyRate, baseCurrency, {
                          ...pivot,
                          [code]: override.buyRate,
                        })
                      : official
                    const sell = override
                      ? rubPerUnitToBase(override.sellRate, baseCurrency, {
                          ...pivot,
                          [code]: override.sellRate,
                        })
                      : official
                    const pair =
                      buy != null && sell != null ? formatPair(buy, sell, baseCurrency) : null
                    const highlighted = Boolean(override)
                    return (
                      <li key={code}>
                        <button
                          type="button"
                          onClick={() => setEdit({ date, currency: code })}
                          className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition ${
                            highlighted
                              ? 'bg-amber-50 dark:bg-amber-950/40'
                              : 'bg-slate-50/80 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-800'
                          }`}
                          data-qa={`rates-cell-${date}-${code}`}
                          title={currencyLabel(code)}
                        >
                          <span className="min-w-0">
                            <span
                              className={`block text-sm font-medium ${
                                highlighted
                                  ? 'text-amber-950 dark:text-amber-100'
                                  : 'text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              {code}
                            </span>
                            {override?.comment ? (
                              <span className="block truncate text-[10px] text-slate-400 dark:text-slate-500">
                                {override.comment}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-right tabular-nums">
                            {pair == null ? (
                              <span className="text-sm text-slate-400 dark:text-slate-500">—</span>
                            ) : pair.secondary ? (
                              <>
                                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                                  пок. {pair.primary}
                                </span>
                                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                                  прод. {pair.secondary}
                                </span>
                              </>
                            ) : (
                              <span
                                className={`text-sm font-medium ${
                                  highlighted
                                    ? 'text-amber-950 dark:text-amber-100'
                                    : 'text-slate-800 dark:text-slate-100'
                                }`}
                              >
                                {pair.primary}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          }}
        />
      )}

      <RateEditPanel
        open={Boolean(edit)}
        date={edit?.date ?? null}
        currency={edit?.currency ?? null}
        baseCurrency={baseCurrency}
        cbrPivot={editPivot}
        onClose={() => setEdit(null)}
      />
    </div>
  )
}
