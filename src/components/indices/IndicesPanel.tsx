import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ACCOUNT_COLORS, type IndexKind, type MarketIndex } from '../../types/wallet'
import { dataQa } from '../../lib/dataQa'
import { CURRENCY_OPTIONS } from '../../lib/currency'
import { paddedDataDomain } from '../../lib/chartAxisDomain'
import { chartActiveDot, chartDot, chartTooltipStyles, getChartTheme } from '../../lib/chartTheme'
import {
  formatCompactAxisValue,
  formatIsoToRu,
  formatShortDate,
  todayIsoDate,
} from '../../lib/format'
import {
  formatIndexKindLabel,
  formatRateSpreadPoints,
  isManualIndex,
  isRateIndex,
  latestIndexValue,
  pointsToRatePct,
  ratePctToPoints,
  resolveIndexValues,
  resolveIndexCurrency,
} from '../../lib/marketIndex'
import { formatMoneyInput, parseMoneyInput } from '../../lib/moneyInput'
import { useRestoreFocusOnResume } from '../../lib/useRestoreFocusOnResume'
import { useRegisterPrimaryAction } from '../../lib/useRegisterPrimaryAction'
import { useWalletStore } from '../../store/walletStore'
import { useTheme } from '../../lib/useTheme'
import { Button, Card, DateInput, EmptyState, Field, Input, MoneyInput, Select } from '../ui/FormControls'
import { EntityEditPanel } from '../ui/EntityEditPanel'
import { StackPanel } from '../ui/StackPanel'

const KIND_LABELS: Record<IndexKind, string> = {
  amount: 'Суммовой (уровень / пункты)',
  annual_rate: 'Процентный (ставка годовых)',
  derived_rate: 'Расчетный процент (база +/- п.п.)',
}

function toInput(value: number, kind: IndexKind): string {
  const shown = kind === 'annual_rate' || kind === 'derived_rate' ? ratePctToPoints(value) : value
  return formatMoneyInput(String(shown).replace('.', ','))
}

function formatValue(value: number, kind: IndexKind): string {
  if (kind === 'annual_rate' || kind === 'derived_rate') {
    return `${ratePctToPoints(value).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} %`
  }
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 4 })
}

export function IndicesPanel({ active }: { active: boolean }) {
  const indices = useWalletStore((s) => s.indices)
  const indexValues = useWalletStore((s) => s.indexValues)
  const settings = useWalletStore((s) => s.settings)
  const addMarketIndex = useWalletStore((s) => s.addMarketIndex)
  const updateMarketIndex = useWalletStore((s) => s.updateMarketIndex)
  const deleteMarketIndex = useWalletStore((s) => s.deleteMarketIndex)
  const upsertIndexValues = useWalletStore((s) => s.upsertIndexValues)

  const [formOpen, setFormOpen] = useState(false)
  const [creatingKind, setCreatingKind] = useState<IndexKind>('amount')
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState(settings.baseCurrency)
  const [baseIndexId, setBaseIndexId] = useState('')
  const [rateSpreadPoints, setRateSpreadPoints] = useState('')
  const [color, setColor] = useState<string>(ACCOUNT_COLORS[0])
  const [updateOpen, setUpdateOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [date, setDate] = useState(todayIsoDate)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const ordered = useMemo(
    () => [...indices].sort((a, b) => a.name.localeCompare(b.name)),
    [indices],
  )
  const rateBaseOptions = useMemo(
    () => ordered.filter((index) => isRateIndex(index.kind)),
    [ordered],
  )
  const updatable = useMemo(
    () => ordered.filter((index) => isManualIndex(index.kind)),
    [ordered],
  )
  const latestById = useMemo(() => {
    const map = new Map<string, { date: string; value: number }>()
    for (const index of ordered) {
      const latest = latestIndexValue(index.id, ordered, indexValues)
      if (latest) map.set(index.id, { date: latest.date, value: latest.value })
    }
    return map
  }, [ordered, indexValues])

  function openCreate() {
    const defaultBase = rateBaseOptions[0]
    setName('')
    setCreatingKind('amount')
    setCurrency(settings.baseCurrency)
    setBaseIndexId(defaultBase?.id ?? '')
    setRateSpreadPoints('')
    setColor(ACCOUNT_COLORS[indices.length % ACCOUNT_COLORS.length]!)
    setFormOpen(true)
  }

  function openUpdate() {
    setDate(todayIsoDate())
    setAmounts({})
    setUpdateOpen(true)
  }

  useRegisterPrimaryAction(active && !formOpen && !updateOpen, {
    id: indices.length > 0 ? 'indices-update' : 'indices-add',
    label: indices.length > 0 ? 'Обновить индексы' : 'Добавить индекс',
    title: indices.length > 0 ? 'Зафиксировать значения индексов' : 'Новый индекс',
    scope: 'section',
    onClick: indices.length > 0 ? openUpdate : openCreate,
  })

  useEffect(() => {
    if (!updateOpen) return
    setAmounts({})
  }, [date, updateOpen])

  async function saveDefinition() {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    const spreadInput = parseMoneyInput(rateSpreadPoints)
    setSaving(true)
    try {
      const payload = {
        name: trimmed,
        kind: creatingKind,
        currency,
        baseIndexId: creatingKind === 'derived_rate' ? (baseIndexId || null) : null,
        rateSpreadPct: creatingKind === 'derived_rate' ? pointsToRatePct(spreadInput ?? 0) : null,
        color,
      }
      if (creatingKind === 'derived_rate' && !baseIndexId) {
        throw new Error('Выберите базовый индекс')
      }
      await addMarketIndex(payload)
      setFormOpen(false)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Не удалось сохранить индекс')
    } finally {
      setSaving(false)
    }
  }

  async function saveValues() {
    if (saving) return
    const values = updatable.flatMap((index) => {
      const raw = amounts[index.id]?.trim()
      if (!raw) return []
      const parsed = parseMoneyInput(raw)
      if (parsed == null) return []
      return [{ indexId: index.id, value: index.kind === 'annual_rate' ? pointsToRatePct(parsed) : parsed }]
    })
    if (!date || values.length === 0) {
      alert('Укажите дату и хотя бы одно значение')
      return
    }
    setSaving(true)
    try {
      await upsertIndexValues(date, values)
      setUpdateOpen(false)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Не удалось обновить индексы')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3" {...dataQa('indices-registry')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ручные уровни и ставки используются в сравнительном отчёте. Расчетные проценты считаются от базового индекса.
        </p>
        <Button type="button" variant="secondary" onClick={openCreate} dataQa="index-add">
          Добавить индекс
        </Button>
      </div>

      {ordered.length === 0 ? (
        <EmptyState
          title="Индексов пока нет"
          description="Добавьте S&P 500, индекс Мосбиржи или банковскую ставку."
          dataQa="indices-empty"
        />
      ) : (
        <Card className="!p-0" dataQa="indices-list">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {ordered.map((index) => {
              const latest = latestById.get(index.id)
              return (
                <li key={index.id} className="flex items-center gap-3 px-3 py-3 sm:px-4" {...dataQa(`index-row-${index.id}`)}>
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: index.color }} />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailId(index.id)} {...dataQa(`index-open-${index.id}`)}>
                    <span className="block truncate font-medium text-slate-900 dark:text-slate-200">{index.name}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {formatIndexKindLabel(index.kind)} · {resolveIndexCurrency(index, ordered)}
                      {index.kind === 'derived_rate' && index.baseIndexId ? (
                        <>
                          {' · '}
                          {ordered.find((item) => item.id === index.baseIndexId)?.name ?? 'базовый индекс'}
                          {' '}
                          {formatRateSpreadPoints(index.rateSpreadPct)}
                        </>
                      ) : null}
                    </span>
                  </button>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="block text-sm font-medium text-slate-900 dark:text-slate-200">
                      {latest ? formatValue(latest.value, index.kind) : 'нет данных'}
                    </span>
                    {latest ? (
                      <span className="block text-xs text-slate-400 dark:text-slate-500">{formatIsoToRu(latest.date)}</span>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <EntityEditPanel
        open={formOpen}
        title="Новый индекс"
        onClose={() => setFormOpen(false)}
        onSave={saveDefinition}
        saveActionId="index-form-save"
        saveDisabled={!name.trim() || saving}
        dataQa="index-form"
      >
        <div className="space-y-4">
          <Field label="Название">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="S&P 500" dataQa="index-name" />
          </Field>
          <Field label="Тип">
            <Select value={creatingKind} onChange={(event) => setCreatingKind(event.target.value as IndexKind)} dataQa="index-kind">
              <option value="amount">{KIND_LABELS.amount}</option>
              <option value="annual_rate">{KIND_LABELS.annual_rate}</option>
              <option value="derived_rate">{KIND_LABELS.derived_rate}</option>
            </Select>
          </Field>
          {creatingKind === 'derived_rate' ? (
            <>
              <Field label="Базовый индекс">
                <Select value={baseIndexId} onChange={(event) => setBaseIndexId(event.target.value)} dataQa="index-base">
                  <option value="">Выберите базовый индекс</option>
                  {rateBaseOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {resolveIndexCurrency(item, ordered)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Дельта, п.п.">
                <MoneyInput
                  value={rateSpreadPoints}
                  onChange={setRateSpreadPoints}
                  placeholder="1"
                  dataQa="index-rate-spread"
                />
              </Field>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Валюта расчетного процента наследуется от базового индекса.
              </p>
            </>
          ) : (
            <Field label="Валюта">
              <Select
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                dataQa="index-currency"
              >
                {CURRENCY_OPTIONS.filter((item) => item.code !== 'CBK').map((item) => (
                  <option key={item.code} value={item.code}>{item.code} — {item.name}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Цвет">
            <div className="flex flex-wrap gap-2">
              {ACCOUNT_COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setColor(item)}
                  className={`h-8 w-8 rounded-full border-2 ${color === item ? 'border-slate-900 dark:border-white' : 'border-transparent'}`}
                  style={{ backgroundColor: item }}
                  aria-label={item}
                />
              ))}
            </div>
          </Field>
        </div>
      </EntityEditPanel>

      {detailId ? (
        <IndexDetailPanel
          indexId={detailId}
          onClose={() => setDetailId(null)}
          allIndices={ordered}
          indexValues={indexValues}
          settingsBaseCurrency={settings.baseCurrency}
          updateMarketIndex={updateMarketIndex}
          deleteMarketIndex={deleteMarketIndex}
          upsertIndexValues={upsertIndexValues}
        />
      ) : null}

      <EntityEditPanel
        open={updateOpen}
        title="Обновить индексы"
        onClose={() => setUpdateOpen(false)}
        onSave={saveValues}
        saveActionId="indices-update-save"
        saveDisabled={saving}
        dataQa="indices-update-panel"
      >
        <div className="space-y-4">
          <Field label="Дата">
            <DateInput value={date} onChange={setDate} dataQa="indices-update-date" />
          </Field>
          {updatable.length === 0 ? (
            <EmptyState
              title="Нет ручных индексов для обновления"
              description="Расчетные проценты считаются от базовых индексов и не вводятся вручную."
              dataQa="indices-update-empty"
            />
          ) : null}
          {updatable.map((index) => {
            const saved = indexValues.find((item) => item.indexId === index.id && item.date === date)
            const previous = [...indexValues]
              .filter((item) => item.indexId === index.id && item.date <= date)
              .sort((a, b) => b.date.localeCompare(a.date))[0]
            return (
              <Field key={index.id} label={`${index.name}, ${index.kind === 'annual_rate' ? '% годовых' : index.currency}`}>
                <MoneyInput
                  value={amounts[index.id] ?? ''}
                  onChange={(value) => setAmounts((current) => ({ ...current, [index.id]: value }))}
                  allowNegative={index.kind === 'annual_rate'}
                  placeholder={saved ? toInput(saved.value, index.kind) : previous ? toInput(previous.value, index.kind) : '0'}
                  dataQa={`index-value-${index.id}`}
                />
              </Field>
            )
          })}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Пустые поля не изменяются. Значение на уже существующую дату будет перезаписано.
          </p>
        </div>
      </EntityEditPanel>
    </div>
  )
}

function IndexDetailPanel({
  indexId,
  onClose,
  allIndices,
  indexValues,
  settingsBaseCurrency,
  updateMarketIndex,
  deleteMarketIndex,
  upsertIndexValues,
}: {
  indexId: string
  onClose: () => void
  allIndices: MarketIndex[]
  indexValues: { indexId: string; date: string; value: number }[]
  settingsBaseCurrency: string
  updateMarketIndex: (id: string, patch: Partial<Omit<MarketIndex, 'id'>>) => Promise<void>
  deleteMarketIndex: (id: string) => Promise<void>
  upsertIndexValues: (date: string, values: Array<{ indexId: string; value: number }>) => Promise<void>
}) {
  const index = allIndices.find((item) => item.id === indexId) ?? null
  const [editingMode, setEditingMode] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<IndexKind>('amount')
  const [currency, setCurrency] = useState(settingsBaseCurrency)
  const [baseIndexId, setBaseIndexId] = useState('')
  const [rateSpreadPoints, setRateSpreadPoints] = useState('')
  const [todayValue, setTodayValue] = useState('')
  const [color, setColor] = useState<string>(ACCOUNT_COLORS[0])
  const [saving, setSaving] = useState(false)
  const { mode: themeMode } = useTheme()
  const chartTheme = useMemo(() => getChartTheme(themeMode === 'dark'), [themeMode])
  const { rootRef, focusKeyProps } = useRestoreFocusOnResume(editingMode)

  const series = useMemo(
    () => (index ? resolveIndexValues(index.id, allIndices, indexValues) : []),
    [index, allIndices, indexValues],
  )
  const latest = series[series.length - 1] ?? null
  const today = todayIsoDate()
  const manualIndex = index ? isManualIndex(index.kind) : false
  const editManualIndex = kind !== 'derived_rate'
  const directToday = useMemo(
    () => (index ? indexValues.find((item) => item.indexId === index.id && item.date === today) ?? null : null),
    [index, indexValues, today],
  )
  const directLatestForToday = useMemo(() => {
    if (!index || !manualIndex) return null
    return [...indexValues]
      .filter((item) => item.indexId === index.id && item.date <= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1) ?? null
  }, [index, indexValues, manualIndex, today])
  const rateBaseOptions = useMemo(
    () => allIndices.filter((item) => isRateIndex(item.kind) && item.id !== indexId),
    [allIndices, indexId],
  )
  const parsedTodayValue = editManualIndex ? parseMoneyInput(todayValue) : null
  const saveDisabled =
    !name.trim() ||
    saving ||
    (kind === 'derived_rate' && !baseIndexId) ||
    (editManualIndex && parsedTodayValue == null)

  useEffect(() => {
    if (!index) return
    setName(index.name)
    setKind(index.kind)
    setCurrency(index.currency)
    setBaseIndexId(index.baseIndexId ?? '')
    setRateSpreadPoints(
      index.rateSpreadPct != null
        ? formatMoneyInput(String(ratePctToPoints(index.rateSpreadPct)).replace('.', ','))
        : '',
    )
    setTodayValue(
      index.kind !== 'derived_rate' && directLatestForToday
        ? toInput(directLatestForToday.value, index.kind)
        : '',
    )
    setColor(index.color)
  }, [index, directLatestForToday])

  useRegisterPrimaryAction(Boolean(index), {
    id: editingMode ? 'index-detail-save' : 'index-detail-edit',
    label: editingMode ? 'Сохранить' : 'Изменить',
    scope: 'panel',
    disabled: editingMode ? saveDisabled : false,
    title: editingMode
      ? editManualIndex && parsedTodayValue == null
        ? 'Введите значение на сегодня'
        : 'Сохранить индекс'
      : 'Перейти к редактированию',
    onClick: () => {
      if (editingMode) {
        void handleSave()
      } else {
        setEditingMode(true)
      }
    },
  })

  async function handleSave() {
    if (!index) return
    const trimmed = name.trim()
    if (!trimmed) return
    const spreadInput = parseMoneyInput(rateSpreadPoints)
    const todayParsed = kind !== 'derived_rate' ? parseMoneyInput(todayValue) : null
    if (kind === 'derived_rate' && !baseIndexId) {
      alert('Выберите базовый индекс')
      return
    }
    if (kind !== 'derived_rate' && todayParsed == null) {
      alert('Введите значение на сегодня')
      return
    }

    setSaving(true)
    try {
      await updateMarketIndex(index.id, {
        name: trimmed,
        kind,
        currency,
        baseIndexId: kind === 'derived_rate' ? (baseIndexId || null) : null,
        rateSpreadPct: kind === 'derived_rate' ? pointsToRatePct(spreadInput ?? 0) : null,
        color,
      })
      if (kind !== 'derived_rate' && todayParsed != null) {
        await upsertIndexValues(today, [
          { indexId: index.id, value: kind === 'annual_rate' ? pointsToRatePct(todayParsed) : todayParsed },
        ])
      }
      setEditingMode(false)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Не удалось сохранить индекс')
    } finally {
      setSaving(false)
    }
  }

  if (!index) return null

  const resolvedCurrency = resolveIndexCurrency(index, allIndices)
  const baseIndexName =
    index.baseIndexId != null
      ? allIndices.find((item) => item.id === index.baseIndexId)?.name ?? 'Базовый индекс'
      : null

  return (
    <StackPanel
      open
      title={editingMode ? (name.trim() || index.name) : index.name}
      onClose={onClose}
      dataQa="index-detail"
      headerActions={
        editingMode ? (
          <Button
            type="button"
            className="!hidden !px-3 !py-1.5 md:!inline-flex"
            disabled={saveDisabled}
            title={editManualIndex && parsedTodayValue == null ? 'Введите значение на сегодня' : 'Сохранить индекс'}
            dataQa="index-detail-save"
            onClick={() => void handleSave()}
          >
            Сохранить
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="!hidden !px-3 !py-1.5 md:!inline-flex"
            dataQa="index-detail-edit"
            onClick={() => setEditingMode(true)}
          >
            Изменить
          </Button>
        )
      }
    >
      {editingMode ? (
        <div ref={rootRef}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave()
            }}
          >
            <Field label="Название">
              <Input value={name} onChange={(event) => setName(event.target.value)} dataQa="index-detail-name" />
            </Field>
            <Field label="Тип">
              <Select
                value={kind}
                onChange={(event) => setKind(event.target.value as IndexKind)}
                disabled={Boolean(indexValues.some((item) => item.indexId === index.id))}
                dataQa="index-detail-kind"
              >
                <option value="amount">{KIND_LABELS.amount}</option>
                <option value="annual_rate">{KIND_LABELS.annual_rate}</option>
                <option value="derived_rate">{KIND_LABELS.derived_rate}</option>
              </Select>
            </Field>
            {kind === 'derived_rate' ? (
              <>
                <Field label="Базовый индекс">
                  <Select value={baseIndexId} onChange={(event) => setBaseIndexId(event.target.value)} dataQa="index-detail-base">
                    <option value="">Выберите базовый индекс</option>
                    {rateBaseOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {resolveIndexCurrency(item, allIndices)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Дельта, п.п.">
                  <MoneyInput
                    value={rateSpreadPoints}
                    onChange={setRateSpreadPoints}
                    placeholder="1"
                    dataQa="index-detail-rate-spread"
                    {...focusKeyProps('rate-spread')}
                  />
                </Field>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Валюта расчетного процента наследуется от базового индекса.
                </p>
              </>
            ) : (
              <>
                <Field label="Валюта">
                  <Select
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
                    dataQa="index-detail-currency"
                  >
                    {CURRENCY_OPTIONS.filter((item) => item.code !== 'CBK').map((item) => (
                      <option key={item.code} value={item.code}>{item.code} — {item.name}</option>
                    ))}
                  </Select>
                </Field>
                <div className="space-y-1">
                  <Field label="Значение на сегодня">
                    <MoneyInput
                      value={todayValue}
                      onChange={setTodayValue}
                      allowNegative={kind === 'annual_rate'}
                      placeholder={directLatestForToday ? toInput(directLatestForToday.value, kind) : '0'}
                      dataQa="index-detail-today-value"
                      {...focusKeyProps('today-value')}
                    />
                  </Field>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {`Запись на сегодня (${formatIsoToRu(today)}).`}
                    {' '}
                    {directToday
                      ? 'Значение на эту дату уже есть и будет перезаписано.'
                      : directLatestForToday
                        ? `Последнее значение: ${formatIsoToRu(directLatestForToday.date)}.`
                        : 'По этому индексу ещё не было значений.'}
                  </p>
                </div>
              </>
            )}
            <Field label="Цвет">
              <div className="flex flex-wrap gap-2">
                {ACCOUNT_COLORS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setColor(item)}
                    className={`h-8 w-8 rounded-full border-2 ${color === item ? 'border-slate-900 dark:border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: item }}
                    aria-label={item}
                  />
                ))}
              </div>
            </Field>
            <Button
              type="button"
              variant="danger"
              dataQa="index-detail-delete"
              onClick={() => {
                if (!confirm(`Удалить «${index.name}» и всю историю значений?`)) return
                void deleteMarketIndex(index.id).then(() => onClose())
              }}
            >
              Удалить индекс
            </Button>
            <IndexValueChart index={index} values={series} chartTheme={chartTheme} dataQa="index-detail-chart" />
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          <ReadOnlyField label="Тип" value={formatIndexKindLabel(index.kind)} />
          <ReadOnlyField label="Валюта" value={resolvedCurrency} />
          {baseIndexName ? <ReadOnlyField label="Базовый индекс" value={baseIndexName} /> : null}
          {index.kind === 'derived_rate' ? (
            <ReadOnlyField label="Дельта" value={formatRateSpreadPoints(index.rateSpreadPct)} />
          ) : null}
          <ReadOnlyField label="Последнее значение" value={latest ? formatValue(latest.value, index.kind) : 'нет данных'} />
          <ReadOnlyField label="Дата" value={latest ? formatIsoToRu(latest.date) : '—'} />
          <IndexValueChart index={index} values={series} chartTheme={chartTheme} dataQa="index-detail-chart" />
        </div>
      )}
    </StackPanel>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
        {value}
      </div>
    </div>
  )
}

function IndexValueChart({
  index,
  values,
  chartTheme,
  dataQa: qaId,
}: {
  index: MarketIndex
  values: Array<{ indexId: string; date: string; value: number }>
  chartTheme: ReturnType<typeof getChartTheme>
  dataQa: string
}) {
  const rows = useMemo(
    () =>
      values.map((value) => ({
        ...value,
        label: formatShortDate(value.date),
      })),
    [values],
  )

  if (rows.length === 0) {
    return (
      <Card dataQa={qaId}>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Пока нет точек для графика.
        </p>
      </Card>
    )
  }

  return (
    <Card className="!p-3 sm:!p-4" dataQa={qaId}>
      <p className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">История значений</p>
      <div className="h-64 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTheme.tick }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 11, fill: chartTheme.tick }}
              tickFormatter={formatCompactAxisValue}
              width={56}
              domain={paddedDataDomain}
            />
            <Tooltip
              {...chartTooltipStyles(chartTheme)}
              formatter={(value: number) => [formatValue(value, index.kind), index.name]}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
            />
            <Line
              type="monotone"
              dataKey="value"
              name={index.name}
              stroke={index.color}
              strokeWidth={2}
              dot={chartDot(chartTheme, index.color)}
              activeDot={chartActiveDot(chartTheme, index.color)}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
