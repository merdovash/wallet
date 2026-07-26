import { useEffect, useMemo, useState } from 'react'
import { balanceOnDate } from '../../engine/growthEngine'
import { todayIsoDate } from '../../lib/format'
import { parseMoneyInput } from '../../lib/moneyInput'
import { useWalletStore } from '../../store/walletStore'
import type { SnapshotLine } from '../../types/wallet'
import { Button, DateInput, Field, Input, MoneyInput } from '../ui/FormControls'
import { StackPanel } from '../ui/StackPanel'

interface CheckInPanelProps {
  open: boolean
  onClose: () => void
  /** If set, panel edits this snapshot instead of creating a new one. */
  snapshotId?: string | null
}

function formatHintAmount(amount: number): string {
  return amount.toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })
}

export function CheckInPanel({ open, onClose, snapshotId = null }: CheckInPanelProps) {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const addSnapshot = useWalletStore((s) => s.addSnapshot)
  const updateSnapshot = useWalletStore((s) => s.updateSnapshot)
  const deleteSnapshot = useWalletStore((s) => s.deleteSnapshot)

  const editing = useMemo(
    () => (snapshotId ? snapshots.find((s) => s.id === snapshotId) ?? null : null),
    [snapshotId, snapshots],
  )

  const formAccounts = useMemo(() => {
    const active = accounts
      .filter((a) => !a.archived)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

    if (!editing) return active

    const activeIds = new Set(active.map((a) => a.id))
    const extras = accounts
      .filter((a) => !activeIds.has(a.id) && editing.lines.some((l) => l.accountId === a.id))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    return [...active, ...extras]
  }, [accounts, editing])

  const [date, setDate] = useState(todayIsoDate)
  const [note, setNote] = useState('')
  /** Only manually typed values — empty means «без изменений». */
  const [amounts, setAmounts] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return

    if (editing) {
      setDate(editing.date)
      setNote(editing.note ?? '')
    } else {
      setDate(todayIsoDate())
      setNote('')
    }
    setAmounts({})
  }, [open, editing])

  const hints = useMemo(() => {
    const asOf = date || todayIsoDate()
    const next: Record<string, string> = {}
    for (const account of formAccounts) {
      if (editing) {
        const line = editing.lines.find((l) => l.accountId === account.id)
        if (line != null) {
          next[account.id] = formatHintAmount(line.amount)
          continue
        }
      }
      const prev = balanceOnDate(account.id, asOf, snapshots)
      next[account.id] = prev != null ? formatHintAmount(prev) : '0'
    }
    return next
  }, [formAccounts, date, editing, snapshots])

  function typedLines(): SnapshotLine[] {
    return formAccounts
      .map((account) => {
        const raw = amounts[account.id]?.trim() ?? ''
        if (raw === '') return null
        const amount = parseMoneyInput(raw)
        if (amount == null) return null
        return { accountId: account.id, amount }
      })
      .filter((l): l is SnapshotLine => l != null)
  }

  async function handleSave() {
    if (!date || formAccounts.length === 0) return
    const typed = typedLines()

    if (editing) {
      const merged = mergeSnapshotLines(editing.lines, typed)
      await updateSnapshot(editing.id, {
        date,
        note: note.trim() || undefined,
        lines: merged,
      })
      onClose()
      return
    }

    if (typed.length === 0) return
    await addSnapshot({ date, note: note.trim() || undefined, lines: typed })
    onClose()
  }

  async function handleDelete() {
    if (!editing) return
    if (!confirm('Удалить этот чек-ин?')) return
    await deleteSnapshot(editing.id)
    onClose()
  }

  const canSave = editing
    ? true
    : typedLines().length > 0

  return (
    <StackPanel
      open={open}
      title={editing ? 'Редактировать чек-ин' : 'Чек-ин остатков'}
      onClose={onClose}
      headerActions={
        <Button type="button" onClick={() => void handleSave()} disabled={formAccounts.length === 0 || !canSave}>
          Сохранить
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Дата">
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label="Комментарий">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Необязательно"
          />
        </Field>
        <p className="text-xs text-slate-500">
          Серым — текущий остаток. Введите новое значение только для изменившихся счетов;
          пустое поле оставляет остаток без изменений.
        </p>
        {formAccounts.length === 0 ? (
          <p className="text-sm text-slate-500">Сначала добавьте хотя бы один счёт.</p>
        ) : (
          <div className="space-y-3">
            {formAccounts.map((account) => {
              const typed = amounts[account.id] ?? ''
              return (
                <Field
                  key={account.id}
                  label={`${account.name} (${account.currency})${account.archived ? ' · архив' : ''}`}
                >
                  <MoneyInput
                    value={typed}
                    onChange={(value) =>
                      setAmounts((prev) => ({ ...prev, [account.id]: value }))
                    }
                    placeholder={hints[account.id] ?? '0'}
                  />
                </Field>
              )
            })}
          </div>
        )}
        {editing && (
          <Button type="button" variant="danger" onClick={() => void handleDelete()}>
            Удалить чек-ин
          </Button>
        )}
      </div>
    </StackPanel>
  )
}

function mergeSnapshotLines(existing: SnapshotLine[], incoming: SnapshotLine[]): SnapshotLine[] {
  const map = new Map(existing.map((l) => [l.accountId, l.amount]))
  for (const line of incoming) {
    map.set(line.accountId, line.amount)
  }
  return [...map.entries()].map(([accountId, amount]) => ({ accountId, amount }))
}
