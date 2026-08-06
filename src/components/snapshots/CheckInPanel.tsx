import { useEffect, useMemo, useState } from 'react'
import { balanceOnDate } from '../../engine/growthEngine'
import { formatCurrency, todayIsoDate } from '../../lib/format'
import { parseMoneyInput } from '../../lib/moneyInput'
import { suggestCheckInCashflow } from '../../lib/suggestCheckInCashflow'
import { formatTransferLabel } from '../../lib/transferCheckIn'
import { useRestoreFocusOnResume } from '../../lib/useRestoreFocusOnResume'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import type { Account, SnapshotLine, Transfer } from '../../types/wallet'
import { Button, DateInput, Field, Input, MoneyInput, Select } from '../ui/FormControls'
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

type PendingTransfer = {
  key: string
  fromAccountId: string
  toAccountId: string
  amount: string
  note: string
}

export function CheckInPanel({ open, onClose, snapshotId = null }: CheckInPanelProps) {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const addSnapshot = useWalletStore((s) => s.addSnapshot)
  const updateSnapshot = useWalletStore((s) => s.updateSnapshot)
  const deleteSnapshot = useWalletStore((s) => s.deleteSnapshot)
  const addTransfer = useWalletStore((s) => s.addTransfer)
  const deleteTransfer = useWalletStore((s) => s.deleteTransfer)
  const rateBook = useRatesStore((s) => s.byDate)
  const settings = useWalletStore((s) => s.settings)

  const editing = useMemo(
    () => (snapshotId ? snapshots.find((s) => s.id === snapshotId) ?? null : null),
    [snapshotId, snapshots],
  )

  const locked = editing?.origin === 'transfer'

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

  const activeAccounts = useMemo(
    () =>
      accounts
        .filter((a) => !a.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [accounts],
  )

  const [date, setDate] = useState(todayIsoDate)
  const [note, setNote] = useState('')
  const [income, setIncome] = useState('')
  const [expense, setExpense] = useState('')
  /** Only manually typed values — empty means «без изменений». */
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([])
  const [draftTransfer, setDraftTransfer] = useState<PendingTransfer | null>(null)
  const [incomeManual, setIncomeManual] = useState(false)
  const { rootRef, focusKeyProps } = useRestoreFocusOnResume(open)

  useEffect(() => {
    if (!open) return

    if (editing) {
      setDate(editing.date)
      setNote(editing.note ?? '')
      setIncome(editing.income ? String(editing.income) : '')
      setExpense(editing.expense ? String(editing.expense) : '')
      setIncomeManual(true)
    } else {
      setDate(todayIsoDate())
      setNote('')
      setIncome('')
      setExpense('')
      setIncomeManual(false)
    }
    setAmounts({})
    setPendingTransfers([])
    setDraftTransfer(null)
  }, [open, editing])

  const dateTransfers = useMemo(
    () =>
      transfers
        .filter((t) => t.date === date)
        .sort((a, b) => a.id.localeCompare(b.id)),
    [transfers, date],
  )

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

  const effectiveLines = useMemo((): SnapshotLine[] => {
    return formAccounts.map((account) => {
      const raw = amounts[account.id]?.trim() ?? ''
      if (raw !== '') {
        const parsed = parseMoneyInput(raw)
        if (parsed != null) return { accountId: account.id, amount: parsed }
      }
      if (editing) {
        const line = editing.lines.find((l) => l.accountId === account.id)
        if (line != null) return { accountId: account.id, amount: line.amount }
      }
      const prev = balanceOnDate(account.id, date || todayIsoDate(), snapshots)
      return { accountId: account.id, amount: prev ?? 0 }
    })
  }, [formAccounts, amounts, editing, date, snapshots])

  const transferInputsForSuggest = useMemo(() => {
    const pending = pendingTransfers
      .map((t) => {
        const value = parseMoneyInput(t.amount)
        if (value == null || value <= 0) return null
        return {
          fromAccountId: t.fromAccountId,
          toAccountId: t.toAccountId,
          amount: value,
        }
      })
      .filter((t): t is NonNullable<typeof t> => t != null)
    return [
      ...dateTransfers.map((t) => ({
        fromAccountId: t.fromAccountId,
        toAccountId: t.toAccountId,
        amount: t.amount,
      })),
      ...pending,
    ]
  }, [dateTransfers, pendingTransfers])

  const suggestedCashflow = useMemo(
    () =>
      suggestCheckInCashflow({
        date: date || todayIsoDate(),
        accounts,
        snapshots,
        settings,
        lines: effectiveLines,
        transfers: transferInputsForSuggest,
        rateBook,
        excludeSnapshotId: editing?.id,
      }),
    [
      date,
      accounts,
      snapshots,
      settings,
      effectiveLines,
      transferInputsForSuggest,
      rateBook,
      editing?.id,
    ],
  )

  useEffect(() => {
    if (!open || locked || incomeManual) return
    if (!suggestedCashflow.hasPrevious) return
    setIncome(suggestedCashflow.income > 0 ? String(suggestedCashflow.income) : '')
  }, [open, locked, incomeManual, suggestedCashflow])

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

  function startDraftTransfer() {
    setDraftTransfer({
      key: `p-${Date.now()}`,
      fromAccountId: activeAccounts[0]?.id ?? '',
      toAccountId: activeAccounts[1]?.id ?? activeAccounts[0]?.id ?? '',
      amount: '',
      note: '',
    })
  }

  async function commitDraftTransfer() {
    if (!draftTransfer || !date) return
    const value = parseMoneyInput(draftTransfer.amount)
    if (
      !draftTransfer.fromAccountId ||
      !draftTransfer.toAccountId ||
      draftTransfer.fromAccountId === draftTransfer.toAccountId ||
      value == null ||
      value <= 0
    ) {
      return
    }

    if (editing) {
      await addTransfer({
        date,
        fromAccountId: draftTransfer.fromAccountId,
        toAccountId: draftTransfer.toAccountId,
        amount: value,
        note: draftTransfer.note.trim() || undefined,
      })
    } else {
      setPendingTransfers((prev) => [...prev, draftTransfer])
    }
    setDraftTransfer(null)
  }

  async function handleSave() {
    if (!date || formAccounts.length === 0) return

    const incomeValue = parseMoneyInput(income) ?? 0
    const expenseValue = parseMoneyInput(expense) ?? 0
    if (incomeValue < 0 || expenseValue < 0) return

    if (locked) {
      await updateSnapshot(editing!.id, {
        note: note.trim() || undefined,
        income: incomeValue,
        expense: expenseValue,
      })
      onClose()
      return
    }

    const typed = typedLines()

    if (editing) {
      const merged = mergeSnapshotLines(editing.lines, typed)
      await updateSnapshot(editing.id, {
        date,
        note: note.trim() || undefined,
        income: incomeValue,
        expense: expenseValue,
        lines: merged,
        origin: 'manual',
      })
      onClose()
      return
    }

    if (typed.length === 0 && pendingTransfers.length === 0) return

    // For create: need at least some lines — use typed or carry forward for pending-transfer-only
    let lines = typed
    if (lines.length === 0 && pendingTransfers.length > 0) {
      lines = formAccounts
        .map((account) => {
          const prev = balanceOnDate(account.id, date, snapshots)
          if (prev == null) return null
          return { accountId: account.id, amount: prev }
        })
        .filter((l): l is SnapshotLine => l != null)
      if (lines.length === 0) return
    }

    await addSnapshot({
      date,
      note: note.trim() || undefined,
      income: incomeValue,
      expense: expenseValue,
      origin: 'manual',
      lines,
    })

    for (const pt of pendingTransfers) {
      const value = parseMoneyInput(pt.amount)
      if (
        value == null ||
        value <= 0 ||
        !pt.fromAccountId ||
        !pt.toAccountId ||
        pt.fromAccountId === pt.toAccountId
      ) {
        continue
      }
      await addTransfer({
        date,
        fromAccountId: pt.fromAccountId,
        toAccountId: pt.toAccountId,
        amount: value,
        note: pt.note.trim() || undefined,
      })
    }

    onClose()
  }

  async function handleDelete() {
    if (!editing) return
    if (!confirm(locked ? 'Удалить этот перевод и чек-ин?' : 'Удалить этот чек-ин?')) return
    await deleteSnapshot(editing.id)
    onClose()
  }

  const canSave = locked
    ? true
    : editing
      ? true
      : typedLines().length > 0 || pendingTransfers.length > 0

  return (
    <StackPanel
      open={open}
      title={
        locked
          ? 'Перевод'
          : editing
            ? 'Редактировать чек-ин'
            : 'Чек-ин остатков'
      }
      onClose={onClose}
      headerActions={
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={formAccounts.length === 0 || !canSave}
        >
          Сохранить
        </Button>
      }
    >
      <div ref={rootRef} className="space-y-4">
        {locked && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p className="font-medium">Чек-ин создан переводом</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-900/90">
              {dateTransfers.map((t) => (
                <li key={t.id}>{formatTransferLabel(t, accounts)}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-800/80">
              Остатки заблокированы. Чтобы исправить — удалите чек-ин и создайте перевод заново.
            </p>
          </div>
        )}

        <Field label="Дата">
          <DateInput
            value={date}
            onChange={setDate}
            disabled={locked}
            {...focusKeyProps('date')}
          />
        </Field>
        <Field label="Комментарий">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Необязательно"
            {...focusKeyProps('note')}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Доход за день (базовая валюта)">
            <MoneyInput
              value={income}
              onChange={(value) => {
                setIncomeManual(true)
                setIncome(value)
              }}
              allowNegative={false}
              placeholder="0"
              {...focusKeyProps('income')}
            />
          </Field>
          <Field label="Расход за день (базовая валюта)">
            <MoneyInput
              value={expense}
              onChange={(value) => {
                setIncomeManual(true)
                setExpense(value)
              }}
              allowNegative={false}
              placeholder="0"
              {...focusKeyProps('expense')}
            />
          </Field>
        </div>
        <p className="text-xs text-slate-500">
          Внешние доходы и расходы не считаются приростом — нужны для корректных процентов.
          {!locked && suggestedCashflow.hasPrevious && !incomeManual
            ? ' Доход подставляется автоматически по дельте неинвестиционных счетов (оперативные / наличка / кредитки, с учётом переводов).'
            : null}
          {!locked && incomeManual && suggestedCashflow.hasPrevious ? (
            <>
              {' '}
              <button
                type="button"
                className="text-blue-600 hover:underline"
                onClick={() => setIncomeManual(false)}
              >
                Вернуть автозаполнение дохода
              </button>
            </>
          ) : null}
        </p>

        {!locked && (
          <p className="text-xs text-slate-500">
            Серым — текущий остаток. Введите новое значение только для изменившихся счетов;
            пустое поле оставляет остаток без изменений. Для кредитки — доступный остаток
            лимита.
          </p>
        )}

        {formAccounts.length === 0 ? (
          <p className="text-sm text-slate-500">Сначала добавьте хотя бы один счёт.</p>
        ) : (
          <div className="space-y-3">
            {formAccounts.map((account) => {
              const typed = amounts[account.id] ?? ''
              const creditHint =
                account.kind === 'credit' && account.creditLimit != null
                  ? ` · лимит ${formatHintAmount(account.creditLimit)}`
                  : ''
              return (
                <Field
                  key={account.id}
                  label={`${account.name} (${account.currency})${
                    account.kind === 'credit' ? ' · остаток лимита' : ''
                  }${creditHint}${account.archived ? ' · архив' : ''}`}
                >
                  {locked ? (
                    <Input
                      value={hints[account.id] ?? '0'}
                      disabled
                      readOnly
                      className="bg-slate-50 text-slate-700"
                    />
                  ) : (
                    <MoneyInput
                      value={typed}
                      onChange={(value) =>
                        setAmounts((prev) => ({ ...prev, [account.id]: value }))
                      }
                      placeholder={hints[account.id] ?? '0'}
                      {...focusKeyProps(`amount-${account.id}`)}
                    />
                  )}
                </Field>
              )
            })}
          </div>
        )}

        {!locked && (
          <TransfersSection
            date={date}
            accounts={activeAccounts}
            savedTransfers={dateTransfers}
            pendingTransfers={pendingTransfers}
            draft={draftTransfer}
            focusKeyProps={focusKeyProps}
            onStartDraft={startDraftTransfer}
            onDraftChange={setDraftTransfer}
            onCommitDraft={() => void commitDraftTransfer()}
            onCancelDraft={() => setDraftTransfer(null)}
            onRemovePending={(key) =>
              setPendingTransfers((prev) => prev.filter((t) => t.key !== key))
            }
            onDeleteSaved={(id) => void deleteTransfer(id)}
          />
        )}

        {editing && (
          <Button type="button" variant="danger" onClick={() => void handleDelete()}>
            {locked ? 'Удалить перевод' : 'Удалить чек-ин'}
          </Button>
        )}
      </div>
    </StackPanel>
  )
}

function TransfersSection({
  date,
  accounts,
  savedTransfers,
  pendingTransfers,
  draft,
  focusKeyProps,
  onStartDraft,
  onDraftChange,
  onCommitDraft,
  onCancelDraft,
  onRemovePending,
  onDeleteSaved,
}: {
  date: string
  accounts: Account[]
  savedTransfers: Transfer[]
  pendingTransfers: PendingTransfer[]
  draft: PendingTransfer | null
  focusKeyProps: (key: string) => { 'data-focus-key': string }
  onStartDraft: () => void
  onDraftChange: (draft: PendingTransfer | null) => void
  onCommitDraft: () => void
  onCancelDraft: () => void
  onRemovePending: (key: string) => void
  onDeleteSaved: (id: string) => void
}) {
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  return (
    <div className="space-y-3 border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Переводы за день</h3>
        {!draft && accounts.length >= 2 && (
          <Button type="button" variant="secondary" className="!px-2 !py-1" onClick={onStartDraft}>
            Добавить
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Укажите переводы между счетами на {date || '…'}, чтобы они не считались приростом.
      </p>

      {savedTransfers.length === 0 && pendingTransfers.length === 0 && !draft && (
        <p className="text-sm text-slate-500">Переводов нет</p>
      )}

      <ul className="space-y-2">
        {savedTransfers.map((t) => (
          <li
            key={t.id}
            className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium text-slate-900">{formatTransferLabel(t, accounts)}</p>
              {t.note ? <p className="text-xs text-slate-500">{t.note}</p> : null}
            </div>
            <button
              type="button"
              className="shrink-0 text-xs text-red-600 hover:underline"
              onClick={() => onDeleteSaved(t.id)}
            >
              Удалить
            </button>
          </li>
        ))}
        {pendingTransfers.map((t) => {
          const from = accountMap.get(t.fromAccountId)
          const to = accountMap.get(t.toAccountId)
          return (
            <li
              key={t.key}
              className="flex items-start justify-between gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-slate-900">
                  {from?.name ?? '—'} → {to?.name ?? '—'}
                </p>
                <p className="text-xs text-slate-500">
                  {formatCurrency(parseMoneyInput(t.amount) ?? 0, from?.currency ?? 'RUB')}
                  {t.note ? ` · ${t.note}` : ''}
                  {' · '}будет сохранён с чек-ином
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 text-xs text-red-600 hover:underline"
                onClick={() => onRemovePending(t.key)}
              >
                Убрать
              </button>
            </li>
          )
        })}
      </ul>

      {draft && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <Field label="Откуда">
            <Select
              value={draft.fromAccountId}
              onChange={(e) => onDraftChange({ ...draft, fromAccountId: e.target.value })}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Куда">
            <Select
              value={draft.toAccountId}
              onChange={(e) => onDraftChange({ ...draft, toAccountId: e.target.value })}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={`Сумма (${accountMap.get(draft.fromAccountId)?.currency ?? ''})`}
          >
            <MoneyInput
              value={draft.amount}
              onChange={(value) => onDraftChange({ ...draft, amount: value })}
              allowNegative={false}
              placeholder="0"
              {...focusKeyProps('transfer-amount')}
            />
          </Field>
          <Field label="Комментарий">
            <Input
              value={draft.note}
              onChange={(e) => onDraftChange({ ...draft, note: e.target.value })}
              placeholder="Необязательно"
              {...focusKeyProps('transfer-note')}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="button" onClick={onCommitDraft}>
              Добавить перевод
            </Button>
            <Button type="button" variant="secondary" onClick={onCancelDraft}>
              Отмена
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function mergeSnapshotLines(existing: SnapshotLine[], incoming: SnapshotLine[]): SnapshotLine[] {
  const map = new Map(existing.map((l) => [l.accountId, l.amount]))
  for (const line of incoming) {
    map.set(line.accountId, line.amount)
  }
  return [...map.entries()].map(([accountId, amount]) => ({ accountId, amount }))
}
