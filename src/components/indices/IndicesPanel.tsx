import { useEffect, useMemo, useState } from 'react'
import { ACCOUNT_COLORS, type IndexKind, type MarketIndex } from '../../types/wallet'
import { dataQa } from '../../lib/dataQa'
import { CURRENCY_OPTIONS } from '../../lib/currency'
import { formatIsoToRu, todayIsoDate } from '../../lib/format'
import { formatMoneyInput, parseMoneyInput } from '../../lib/moneyInput'
import { useRegisterPrimaryAction } from '../../lib/useRegisterPrimaryAction'
import { useWalletStore } from '../../store/walletStore'
import { Button, Card, DateInput, EmptyState, Field, Input, MoneyInput, Select } from '../ui/FormControls'
import { EntityEditPanel } from '../ui/EntityEditPanel'

const KIND_LABELS: Record<IndexKind, string> = {
  amount: 'Суммовой (уровень / пункты)',
  annual_rate: 'Процентный (ставка годовых)',
}

function toInput(value: number, kind: IndexKind): string {
  const shown = kind === 'annual_rate' ? value * 100 : value
  return formatMoneyInput(String(shown).replace('.', ','))
}

function formatValue(value: number, kind: IndexKind): string {
  if (kind === 'annual_rate') {
    return `${(value * 100).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} %`
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
  const [editing, setEditing] = useState<MarketIndex | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<IndexKind>('amount')
  const [currency, setCurrency] = useState(settings.baseCurrency)
  const [color, setColor] = useState<string>(ACCOUNT_COLORS[0])
  const [updateOpen, setUpdateOpen] = useState(false)
  const [date, setDate] = useState(todayIsoDate)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const ordered = useMemo(
    () => [...indices].sort((a, b) => a.name.localeCompare(b.name)),
    [indices],
  )
  const latestById = useMemo(() => {
    const map = new Map<string, { date: string; value: number }>()
    for (const value of indexValues) {
      const current = map.get(value.indexId)
      if (!current || value.date >= current.date) map.set(value.indexId, value)
    }
    return map
  }, [indexValues])

  function openCreate() {
    setEditing(null)
    setName('')
    setKind('amount')
    setCurrency(settings.baseCurrency)
    setColor(ACCOUNT_COLORS[indices.length % ACCOUNT_COLORS.length]!)
    setFormOpen(true)
  }

  function openEdit(index: MarketIndex) {
    setEditing(index)
    setName(index.name)
    setKind(index.kind)
    setCurrency(index.currency)
    setColor(index.color)
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
    setSaving(true)
    try {
      if (editing) await updateMarketIndex(editing.id, { name: trimmed, kind, currency, color })
      else await addMarketIndex({ name: trimmed, kind, currency, color })
      setFormOpen(false)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Не удалось сохранить индекс')
    } finally {
      setSaving(false)
    }
  }

  async function saveValues() {
    if (saving) return
    const values = ordered.flatMap((index) => {
      const raw = amounts[index.id]?.trim()
      if (!raw) return []
      const parsed = parseMoneyInput(raw)
      if (parsed == null) return []
      return [{ indexId: index.id, value: index.kind === 'annual_rate' ? parsed / 100 : parsed }]
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
          Уровни и годовые ставки вводятся вручную. История используется в сравнительном отчёте.
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
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEdit(index)} {...dataQa(`index-edit-${index.id}`)}>
                    <span className="block truncate font-medium text-slate-900 dark:text-slate-200">{index.name}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {index.kind === 'amount' ? 'суммовой' : 'процентный'} · {index.currency}
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
        title={editing ? 'Индекс' : 'Новый индекс'}
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
            <Select value={kind} onChange={(event) => setKind(event.target.value as IndexKind)} disabled={Boolean(editing && indexValues.some((item) => item.indexId === editing.id))} dataQa="index-kind">
              <option value="amount">{KIND_LABELS.amount}</option>
              <option value="annual_rate">{KIND_LABELS.annual_rate}</option>
            </Select>
          </Field>
          <Field label="Валюта">
            <Select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              disabled={Boolean(editing && indexValues.some((item) => item.indexId === editing.id))}
              dataQa="index-currency"
            >
              {CURRENCY_OPTIONS.filter((item) => item.code !== 'CBK').map((item) => (
                <option key={item.code} value={item.code}>{item.code} — {item.name}</option>
              ))}
            </Select>
          </Field>
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
          {editing ? (
            <Button
              type="button"
              variant="danger"
              dataQa="index-delete"
              onClick={() => {
                if (!confirm(`Удалить «${editing.name}» и всю историю значений?`)) return
                void deleteMarketIndex(editing.id).then(() => setFormOpen(false))
              }}
            >
              Удалить индекс
            </Button>
          ) : null}
        </div>
      </EntityEditPanel>

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
          {ordered.map((index) => {
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
