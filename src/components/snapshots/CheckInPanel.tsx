import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { balanceOnDate } from '../../engine/growthEngine'
import { buildAccountStaleStatuses, formatStaleDays } from '../../lib/accountStaleStatus'
import { formatCurrency, todayIsoDate } from '../../lib/format'
import { parseMoneyInput } from '../../lib/moneyInput'
import { suggestCheckInCashflow } from '../../lib/suggestCheckInCashflow'
import { formatTransferLabel } from '../../lib/transferCheckIn'
import { useRestoreFocusOnResume } from '../../lib/useRestoreFocusOnResume'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import type { Account, SnapshotLine, Transfer } from '../../types/wallet'
import { Button, DateInput, Input, MoneyInput, Select } from '../ui/FormControls'
import { StackPanel } from '../ui/StackPanel'

interface CheckInPanelProps {
  open: boolean
  onClose: () => void
  /** If set, panel edits this snapshot instead of creating a new one. */
  snapshotId?: string | null
  /** quick — подставляет остатки и выделяет пропущенные счета. */
  mode?: 'quick' | 'full'
}

function formatHintAmount(amount: number): string {
  return amount.toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })
}

/** Компактная строка формы: подпись и контрол на одной линии. */
function InlineRow({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`flex min-w-0 max-w-full items-center gap-2 ${className}`}>
      <span className="w-24 shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  )
}

type PendingTransfer = {
  key: string
  fromAccountId: string
  toAccountId: string
  amount: string
  note: string
}

/** Возвращает данные перевода, если черновик корректно заполнен, иначе null. */
function parsePendingTransfer(t: PendingTransfer): {
  fromAccountId: string
  toAccountId: string
  amount: number
  note?: string
} | null {
  const value = parseMoneyInput(t.amount)
  if (
    !t.fromAccountId ||
    !t.toAccountId ||
    t.fromAccountId === t.toAccountId ||
    value == null ||
    value <= 0
  ) {
    return null
  }
  return {
    fromAccountId: t.fromAccountId,
    toAccountId: t.toAccountId,
    amount: value,
    note: t.note.trim() || undefined,
  }
}

export function CheckInPanel({
  open,
  onClose,
  snapshotId = null,
  mode = 'full',
}: CheckInPanelProps) {
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
  const quickMode = mode === 'quick' && !editing && !locked

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
  const [showHelp, setShowHelp] = useState(false)
  const [showAllAccounts, setShowAllAccounts] = useState(false)
  const { rootRef, focusKeyProps } = useRestoreFocusOnResume(open)

  /** Check-in already saved for this date (Dashboard opens without snapshotId but upserts by date). */
  const sameDaySnapshot = useMemo(() => {
    if (editing || !date) return null
    return snapshots.find((s) => s.date === date) ?? null
  }, [editing, date, snapshots])

  const staleStatuses = useMemo(
    () => buildAccountStaleStatuses(accounts, snapshots),
    [accounts, snapshots],
  )

  useEffect(() => {
    if (!open) return

    if (editing) {
      setDate(editing.date)
      setNote(editing.note ?? '')
      // Сохранённые доход/расход показываем серой подсказкой; пустое поле = без изменений.
      setIncome('')
      setExpense('')
      setIncomeManual(true)
      setAmounts({})
    } else {
      setDate(todayIsoDate())
      setNote('')
      setIncome('')
      setExpense('')
      setIncomeManual(false)
      if (mode === 'quick') {
        const asOf = todayIsoDate()
        const next: Record<string, string> = {}
        for (const account of accounts.filter((a) => !a.archived)) {
          const prev = balanceOnDate(account.id, asOf, snapshots)
          next[account.id] = String(prev ?? 0)
        }
        setAmounts(next)
      } else {
        setAmounts({})
      }
    }
    setPendingTransfers([])
    setDraftTransfer(null)
    setShowHelp(false)
    setShowAllAccounts(false)
  }, [open, editing, mode]) // eslint-disable-line react-hooks/exhaustive-deps -- reset only on open/mode

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

  // При редактировании или повторном чек-ине за день серым показываем сохранённые доход/расход.
  const savedIncome = editing?.income ?? sameDaySnapshot?.income ?? 0
  const savedExpense = editing?.expense ?? sameDaySnapshot?.expense ?? 0
  const incomeHint = savedIncome ? formatHintAmount(savedIncome) : '0'
  const expenseHint = savedExpense ? formatHintAmount(savedExpense) : '0'

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
    const drafts = draftTransfer ? [...pendingTransfers, draftTransfer] : pendingTransfers
    const pending = drafts
      .map((t) => parsePendingTransfer(t))
      .filter((t): t is NonNullable<typeof t> => t != null)
    return [
      ...dateTransfers.map((t) => ({
        fromAccountId: t.fromAccountId,
        toAccountId: t.toAccountId,
        amount: t.amount,
      })),
      ...pending,
    ]
  }, [dateTransfers, pendingTransfers, draftTransfer])

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

    const existingIncome = sameDaySnapshot?.income ?? 0
    const existingExpense = sameDaySnapshot?.expense ?? 0
    const autoIncome = suggestedCashflow.income
    const autoExpense = suggestedCashflow.expense

    // Ручной доход/расход за этот день (отличается от авто) не затираем при повторном чек-ине.
    const incomeLooksManual =
      existingIncome > 0 && Math.abs(existingIncome - autoIncome) > 0.009
    const expenseLooksManual =
      existingExpense > 0 && Math.abs(existingExpense - autoExpense) > 0.009
    if (incomeLooksManual || expenseLooksManual) {
      setIncome('')
      setExpense('')
      setIncomeManual(true)
      return
    }

    // Авто: пересчёт от предыдущего календарного дня; пустое поле при сохранении = оставить 0 / нет.
    setIncome(autoIncome > 0 ? String(autoIncome) : '')
    setExpense(autoExpense > 0 ? String(autoExpense) : '')
  }, [open, locked, incomeManual, suggestedCashflow, sameDaySnapshot])

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
    const parsed = parsePendingTransfer(draftTransfer)
    if (parsed == null) return

    if (editing) {
      await addTransfer({ date, ...parsed })
    } else {
      setPendingTransfers((prev) => [...prev, draftTransfer])
    }
    setDraftTransfer(null)
  }

  async function handleSave() {
    if (!date) {
      alert('Укажите дату чек-ина')
      return
    }
    if (formAccounts.length === 0) {
      alert('Сначала добавьте хотя бы один счёт')
      return
    }

    const rawAccountEntries = formAccounts.filter(
      (account) => (amounts[account.id]?.trim() ?? '') !== '',
    ).length

    try {
      // Пустое поле оставляет сохранённое значение за этот день (редактирование или повторный upsert).
      const incomeValue = parseMoneyInput(income) ?? savedIncome
      const expenseValue = parseMoneyInput(expense) ?? savedExpense
      if (incomeValue < 0 || expenseValue < 0) {
        alert('Доход и расход не могут быть отрицательными')
        return
      }

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
      if (rawAccountEntries > 0 && typed.length === 0) {
        alert('Не удалось разобрать сумму в одном из полей счетов')
        return
      }

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
        // Незакоммиченный черновик перевода сохраняем автоматически.
        const draft = draftTransfer ? parsePendingTransfer(draftTransfer) : null
        if (draft != null) {
          await addTransfer({ date, ...draft })
        }
        onClose()
        return
      }

      // Незакоммиченный черновик перевода сохраняем вместе с чек-ином.
      const allPending = draftTransfer ? [...pendingTransfers, draftTransfer] : pendingTransfers
      const transfersToSave = allPending
        .map((t) => parsePendingTransfer(t))
        .filter((t): t is NonNullable<ReturnType<typeof parsePendingTransfer>> => t != null)

      if (typed.length === 0 && transfersToSave.length === 0) {
        alert(
          'Введите новый остаток хотя бы для одного счёта. Серый текст в поле — только подсказка, его нужно ввести вручную.',
        )
        return
      }

      // For create: need at least some lines — use typed or carry forward for pending-transfer-only
      let lines = typed
      if (lines.length === 0 && transfersToSave.length > 0) {
        lines = formAccounts
          .map((account) => {
            const prev = balanceOnDate(account.id, date, snapshots)
            if (prev == null) return null
            return { accountId: account.id, amount: prev }
          })
          .filter((l): l is SnapshotLine => l != null)
        if (lines.length === 0) {
          alert('Не удалось подставить остатки для перевода')
          return
        }
      }

      await addSnapshot({
        date,
        note: note.trim() || undefined,
        income: incomeValue,
        expense: expenseValue,
        origin: 'manual',
        lines,
      })

      for (const transfer of transfersToSave) {
        await addTransfer({ date, ...transfer })
      }

      onClose()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Не удалось сохранить чек-ин')
    }
  }

  async function handleDelete() {
    if (!editing) return
    if (!confirm(locked ? 'Удалить этот перевод и чек-ин?' : 'Удалить этот чек-ин?')) return
    await deleteSnapshot(editing.id)
    onClose()
  }

  const canSaveHint =
    !locked && !editing && typedLines().length === 0 && pendingTransfers.length === 0
      ? 'Введите остаток хотя бы для одного счёта'
      : null

  const attentionIds = useMemo(() => {
    const ids = new Set<string>()
    for (const account of formAccounts) {
      const status = staleStatuses.get(account.id)
      if (!status) continue
      if (
        status.missingFromLatestCheckIn ||
        (status.daysSinceRecorded != null && status.daysSinceRecorded > 0)
      ) {
        ids.add(account.id)
      }
    }
    return ids
  }, [formAccounts, staleStatuses])

  const orderedAccounts = useMemo(() => {
    if (!quickMode || attentionIds.size === 0) return formAccounts
    const attention: Account[] = []
    const rest: Account[] = []
    for (const account of formAccounts) {
      if (attentionIds.has(account.id)) attention.push(account)
      else rest.push(account)
    }
    return [...attention, ...rest]
  }, [formAccounts, quickMode, attentionIds])

  const visibleAccounts = useMemo(() => {
    if (!quickMode || showAllAccounts || attentionIds.size === 0) return orderedAccounts
    return orderedAccounts.filter((a) => attentionIds.has(a.id))
  }, [quickMode, showAllAccounts, attentionIds, orderedAccounts])

  const hiddenCount = orderedAccounts.length - visibleAccounts.length

  return (
    <StackPanel
      open={open}
      title={
        locked
          ? 'Перевод'
          : editing
            ? 'Редактировать чек-ин'
            : quickMode
              ? 'Быстрый чек-ин'
              : 'Чек-ин остатков'
      }
      onClose={onClose}
      headerActions={
        <>
          <button
            type="button"
            title="Справка"
            aria-label="Справка"
            aria-pressed={showHelp}
            onClick={() => setShowHelp((v) => !v)}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition ${
              showHelp
                ? 'border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-400'
                : 'border-slate-300 text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            ?
          </button>
          <Button
            type="submit"
            form="check-in-panel-form"
            disabled={formAccounts.length === 0}
            title={canSaveHint ?? undefined}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <form
        id="check-in-panel-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSave()
        }}
      >
        <div ref={rootRef} className="space-y-4">
        {showHelp && (
          <div className="space-y-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <p>
              Доход и расход — внешние поступления и траты за день в базовой валюте. Они не
              считаются приростом и нужны для корректных процентов. При редактировании серым
              показаны сохранённые значения; пустое поле оставляет их без изменений.
            </p>
            <p>
              Доход подставляется автоматически по дельте неинвестиционных счетов (оперативные /
              наличка / кредитки, с учётом переводов), пока вы не введёте его вручную.
            </p>
            <p>
              {quickMode
                ? 'В быстром режиме остатки уже подставлены. Измените только то, что изменилось, и сохраните. Счета без фиксации в последнем чек-ине подсвечены.'
                : 'Серым в полях счетов — текущий остаток. Введите новое значение только для изменившихся счетов; пустое поле оставляет остаток без изменений. Для кредитки — доступный остаток лимита.'}
            </p>
            <p>Укажите переводы между счетами за день, чтобы они не считались приростом.</p>
          </div>
        )}

        {quickMode && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
            Остатки подставлены с прошлого чек-ина. Правьте изменившиеся счета и сохраняйте.
          </div>
        )}

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

        <div className="space-y-2">
          <InlineRow label="Дата">
            <DateInput
              value={date}
              onChange={setDate}
              disabled={locked}
              {...focusKeyProps('date')}
            />
          </InlineRow>
          <InlineRow label="Комментарий">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Необязательно"
              {...focusKeyProps('note')}
            />
          </InlineRow>
          <div className="flex items-center gap-3">
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">
                Доход
              </span>
              <MoneyInput
                value={income}
                onChange={(value) => {
                  setIncomeManual(true)
                  setIncome(value)
                }}
                allowNegative={false}
                placeholder={incomeHint}
                {...focusKeyProps('income')}
              />
            </label>
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">
                Расход
              </span>
              <MoneyInput
                value={expense}
                onChange={(value) => {
                  setIncomeManual(true)
                  setExpense(value)
                }}
                allowNegative={false}
                placeholder={expenseHint}
                {...focusKeyProps('expense')}
              />
            </label>
          </div>
          {!locked && incomeManual && suggestedCashflow.hasPrevious && (
            <p className="text-xs">
              <button
                type="button"
                className="text-blue-600 hover:underline"
                onClick={() => setIncomeManual(false)}
              >
                Вернуть автозаполнение дохода и расхода
              </button>
            </p>
          )}
        </div>

        {formAccounts.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Сначала добавьте хотя бы один счёт.</p>
        ) : (
          <div className="space-y-2">
            {quickMode && attentionIds.size > 0 && !showAllAccounts && (
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                Счета, которые стоит проверить
              </p>
            )}
            {visibleAccounts.map((account) => {
              const typed = amounts[account.id] ?? ''
              const status = staleStatuses.get(account.id)
              const needsAttention = attentionIds.has(account.id)
              const noteParts = [
                account.kind === 'credit' ? 'остаток лимита' : null,
                account.kind === 'credit' && account.creditLimit != null
                  ? `лимит ${formatHintAmount(account.creditLimit)}`
                  : null,
                account.archived ? 'архив' : null,
                needsAttention && status
                  ? status.missingFromLatestCheckIn
                    ? 'не был в последнем чек-ине'
                    : formatStaleDays(status.daysSinceRecorded)
                  : null,
              ].filter((p): p is string => p != null)
              return (
                <label
                  key={account.id}
                  className={`block min-w-0 max-w-full rounded-lg px-1 py-1 ${
                    needsAttention && quickMode
                      ? 'bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-950/20 dark:ring-amber-900/40'
                      : ''
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-10 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {account.currency}
                    </span>
                    {locked ? (
                      <Input
                        value={hints[account.id] ?? '0'}
                        disabled
                        readOnly
                        className="w-32 shrink-0 sm:w-40 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300"
                      />
                    ) : (
                      <MoneyInput
                        value={typed}
                        onChange={(value) =>
                          setAmounts((prev) => ({ ...prev, [account.id]: value }))
                        }
                        placeholder={hints[account.id] ?? '0'}
                        className="w-32 shrink-0 sm:w-40"
                        {...focusKeyProps(`amount-${account.id}`)}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                      {account.name}
                    </span>
                  </span>
                  {noteParts.length > 0 && (
                    <span className="mt-0.5 block pl-12 text-[11px] leading-snug text-slate-400 dark:text-slate-500">
                      {noteParts.join(' · ')}
                    </span>
                  )}
                </label>
              )
            })}
            {hiddenCount > 0 && (
              <button
                type="button"
                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                onClick={() => setShowAllAccounts(true)}
              >
                Показать остальные счета ({hiddenCount})
              </button>
            )}
            {quickMode && showAllAccounts && attentionIds.size > 0 && (
              <button
                type="button"
                className="text-xs text-slate-500 hover:underline dark:text-slate-400"
                onClick={() => setShowAllAccounts(false)}
              >
                Скрыть актуальные счета
              </button>
            )}
          </div>
        )}

        {!locked && (
          <TransfersSection
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
      </form>
    </StackPanel>
  )
}

function TransfersSection({
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
    <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Переводы за день</h3>
        {!draft && accounts.length >= 2 && (
          <Button type="button" variant="secondary" className="!px-2.5 !py-1.5 !text-xs" onClick={onStartDraft}>
            Добавить
          </Button>
        )}
      </div>
      {savedTransfers.length === 0 && pendingTransfers.length === 0 && !draft && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Переводов нет</p>
      )}

      <ul className="space-y-2">
        {savedTransfers.map((t) => (
          <li
            key={t.id}
            className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-200">{formatTransferLabel(t, accounts)}</p>
              {t.note ? <p className="text-xs text-slate-500 dark:text-slate-400">{t.note}</p> : null}
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
              className="flex items-start justify-between gap-2 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-200">
                  {from?.name ?? '—'} → {to?.name ?? '—'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
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
        <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
          <InlineRow label="Откуда">
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
          </InlineRow>
          <InlineRow label="Куда">
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
          </InlineRow>
          <InlineRow
            label={`Сумма, ${accountMap.get(draft.fromAccountId)?.currency ?? ''}`}
          >
            <MoneyInput
              value={draft.amount}
              onChange={(value) => onDraftChange({ ...draft, amount: value })}
              allowNegative={false}
              placeholder="0"
              {...focusKeyProps('transfer-amount')}
            />
          </InlineRow>
          <InlineRow label="Комментарий">
            <Input
              value={draft.note}
              onChange={(e) => onDraftChange({ ...draft, note: e.target.value })}
              placeholder="Необязательно"
              {...focusKeyProps('transfer-note')}
            />
          </InlineRow>
          <div className="flex gap-2 pt-1">
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
