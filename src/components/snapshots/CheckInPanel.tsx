import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { balanceOnDate } from '../../engine/growthEngine'
import { todayIsoDate } from '../../lib/format'
import { formatMoneyInput, parseMoneyInput } from '../../lib/moneyInput'
import { suggestCheckInCashflow } from '../../lib/suggestCheckInCashflow'
import { formatTransferLabel, suggestedReceiveAmount } from '../../lib/transferCheckIn'
import { transferSpreadBase } from '../../lib/transferAmounts'
import { useRestoreFocusOnResume } from '../../lib/useRestoreFocusOnResume'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import type { RateBook } from '../../engine/growthEngine'
import type { Account, SnapshotLine, Transfer, WalletSettings } from '../../types/wallet'
import { dataQa } from '../../lib/dataQa'
import { Button, DateInput, Input, MoneyInput } from '../ui/FormControls'
import { EntityEditPanel } from '../ui/EntityEditPanel'
import {
  CheckInTransferPanel,
  emptyTransferDraft,
  type CheckInTransferDraft,
} from './CheckInTransferPanel'
import { TransferSpreadLine } from './TransferSpreadLine'

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
  toAmount: string
  note: string
}

type TransferEditor =
  | { mode: 'create'; initial: CheckInTransferDraft }
  | { mode: 'pending'; key: string; initial: CheckInTransferDraft }
  | { mode: 'saved'; id: string; initial: CheckInTransferDraft }

function amountToInput(amount: number): string {
  return formatMoneyInput(String(amount).replace('.', ','))
}

/** Возвращает данные перевода, если черновик корректно заполнен, иначе null. */
function parsePendingTransfer(
  t: Pick<PendingTransfer, 'fromAccountId' | 'toAccountId' | 'amount' | 'toAmount' | 'note'>,
  accounts?: Account[],
): {
  fromAccountId: string
  toAccountId: string
  amount: number
  toAmount?: number
  note?: string
} | null {
  const value = parseMoneyInput(t.amount)
  const received = parseMoneyInput(t.toAmount)
  if (
    !t.fromAccountId ||
    !t.toAccountId ||
    t.fromAccountId === t.toAccountId ||
    value == null ||
    value <= 0
  ) {
    return null
  }
  const from = accounts?.find((a) => a.id === t.fromAccountId)
  const to = accounts?.find((a) => a.id === t.toAccountId)
  const crossCurrency = Boolean(from && to && from.currency !== to.currency)
  if (crossCurrency && (received == null || received <= 0)) return null
  if (received != null && received <= 0) return null
  return {
    fromAccountId: t.fromAccountId,
    toAccountId: t.toAccountId,
    amount: value,
    toAmount: received != null && received > 0 ? received : undefined,
    note: t.note.trim() || undefined,
  }
}

export function CheckInPanel({
  open,
  onClose,
  snapshotId = null,
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
  const [transferEditor, setTransferEditor] = useState<TransferEditor | null>(null)
  const [scrollToTransferId, setScrollToTransferId] = useState<string | null>(null)
  const [incomeManual, setIncomeManual] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const { rootRef, focusKeyProps } = useRestoreFocusOnResume(open)

  /** Check-in already saved for this date (Dashboard opens without snapshotId but upserts by date). */
  const sameDaySnapshot = useMemo(() => {
    if (editing || !date) return null
    return snapshots.find((s) => s.date === date) ?? null
  }, [editing, date, snapshots])

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
      setAmounts({})
    }
    setPendingTransfers([])
    setTransferEditor(null)
    setScrollToTransferId(null)
    setShowHelp(false)
  }, [open, editing]) // eslint-disable-line react-hooks/exhaustive-deps -- reset only on open

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
    const pending = pendingTransfers
      .map((t) => parsePendingTransfer(t, accounts))
      .filter((t): t is NonNullable<typeof t> => t != null)
    return [
      ...dateTransfers.map((t) => ({
        fromAccountId: t.fromAccountId,
        toAccountId: t.toAccountId,
        amount: t.amount,
        toAmount: t.toAmount,
      })),
      ...pending,
    ]
  }, [dateTransfers, pendingTransfers, accounts])

  useEffect(() => {
    if (!scrollToTransferId) return
    const id = scrollToTransferId
    const timer = window.setTimeout(() => {
      const el = document.querySelector(`[data-transfer-anchor="${CSS.escape(id)}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setScrollToTransferId(null)
    }, 80)
    return () => window.clearTimeout(timer)
  }, [scrollToTransferId, pendingTransfers, dateTransfers])

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

  function openCreateTransfer() {
    if (activeAccounts.length < 2) return
    setTransferEditor({ mode: 'create', initial: emptyTransferDraft(activeAccounts) })
  }

  function openEditPending(t: PendingTransfer) {
    setTransferEditor({
      mode: 'pending',
      key: t.key,
      initial: {
        fromAccountId: t.fromAccountId,
        toAccountId: t.toAccountId,
        amount: t.amount,
        toAmount: t.toAmount,
        note: t.note,
      },
    })
  }

  function openEditSaved(t: Transfer) {
    const from = accounts.find((a) => a.id === t.fromAccountId)
    const to = accounts.find((a) => a.id === t.toAccountId)
    let toAmountInput = t.toAmount != null ? amountToInput(t.toAmount) : ''
    if (!toAmountInput && from && to && from.currency !== to.currency) {
      const suggested = suggestedReceiveAmount(t.amount, from, to, settings, t.date, rateBook)
      if (suggested != null) toAmountInput = amountToInput(suggested)
    }
    setTransferEditor({
      mode: 'saved',
      id: t.id,
      initial: {
        fromAccountId: t.fromAccountId,
        toAccountId: t.toAccountId,
        amount: amountToInput(t.amount),
        toAmount: toAmountInput,
        note: t.note ?? '',
      },
    })
  }

  async function handleTransferEditorSave(draft: CheckInTransferDraft) {
    if (!transferEditor || !date) return
    const parsed = parsePendingTransfer(draft, accounts)
    if (parsed == null) return

    if (transferEditor.mode === 'create') {
      if (editing) {
        const id = await addTransfer({ date, ...parsed })
        setScrollToTransferId(id)
      } else {
        const key = `p-${Date.now()}`
        setPendingTransfers((prev) => [...prev, { key, ...draft }])
        setScrollToTransferId(key)
      }
      return
    }

    if (transferEditor.mode === 'pending') {
      const key = transferEditor.key
      setPendingTransfers((prev) =>
        prev.map((t) => (t.key === key ? { key, ...draft } : t)),
      )
      setScrollToTransferId(key)
      return
    }

    await deleteTransfer(transferEditor.id)
    const id = await addTransfer({ date, ...parsed })
    setScrollToTransferId(id)
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
        onClose()
        return
      }

      // Pending transfers are saved together with the check-in.
      const transfersToSave = pendingTransfers
        .map((t) => parsePendingTransfer(t, accounts))
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

  function submitSave() {
    const form = document.getElementById('check-in-panel-form')
    if (form instanceof HTMLFormElement) form.requestSubmit()
    else void handleSave()
  }

  return (
    <>
    <EntityEditPanel
      open={open}
      dataQa="check-in"
      saveActive={!transferEditor}
      title={
        locked
          ? 'Перевод'
          : editing
            ? 'Редактировать чек-ин'
            : 'Чек-ин остатков'
      }
      onClose={() => {
        if (transferEditor) {
          setTransferEditor(null)
          return
        }
        onClose()
      }}
      onSave={submitSave}
      saveDisabled={formAccounts.length === 0}
      saveTitle={canSaveHint ?? undefined}
      saveActionId="check-in-save"
      headerExtras={
        <button
          type="button"
          title="Справка"
          aria-label="Справка"
          aria-pressed={showHelp}
          {...dataQa('check-in-help')}
          onClick={() => setShowHelp((v) => !v)}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition ${
            showHelp
              ? 'border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-400'
              : 'border-slate-300 text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800'
          }`}
        >
          ?
        </button>
      }
    >
      <form
        id="check-in-panel-form"
        className="space-y-4"
        {...dataQa('check-in-form')}
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
              Серым в полях счетов — текущий остаток. Введите новое значение только для
              изменившихся счетов; пустое поле оставляет остаток без изменений. Для кредитки —
              доступный остаток лимита.
            </p>
            <p>Укажите переводы между счетами за день, чтобы они не считались приростом.</p>
          </div>
        )}

        {!locked && activeAccounts.length >= 2 && (
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            dataQa="check-in-add-transfer"
            onClick={openCreateTransfer}
          >
            Добавить перевод
          </Button>
        )}

        {locked && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p className="font-medium">Чек-ин создан переводом</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-900/90">
              {dateTransfers.map((t) => (
                <li key={t.id}>
                  {formatTransferLabel(t, accounts, { settings, date, rateBook })}
                </li>
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
              dataQa="check-in-date"
              {...focusKeyProps('date')}
            />
          </InlineRow>
          <InlineRow label="Комментарий">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Необязательно"
              dataQa="check-in-note"
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
                dataQa="check-in-income"
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
                dataQa="check-in-expense"
                {...focusKeyProps('expense')}
              />
            </label>
          </div>
          {!locked && incomeManual && suggestedCashflow.hasPrevious && (
            <p className="text-xs">
              <button
                type="button"
                className="text-blue-600 hover:underline"
                {...dataQa('check-in-restore-auto')}
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
            {formAccounts.map((account) => {
              const typed = amounts[account.id] ?? ''
              const noteParts = [
                account.kind === 'credit' ? 'остаток лимита' : null,
                account.kind === 'credit' && account.creditLimit != null
                  ? `лимит ${formatHintAmount(account.creditLimit)}`
                  : null,
                account.archived ? 'архив' : null,
              ].filter((p): p is string => p != null)
              return (
                <label
                  key={account.id}
                  className="block min-w-0 max-w-full rounded-lg px-1 py-1"
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
                        dataQa={`check-in-amount-${account.id}`}
                      />
                    ) : (
                      <MoneyInput
                        value={typed}
                        onChange={(value) =>
                          setAmounts((prev) => ({ ...prev, [account.id]: value }))
                        }
                        placeholder={hints[account.id] ?? '0'}
                        className="w-32 shrink-0 sm:w-40"
                        dataQa={`check-in-amount-${account.id}`}
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
          </div>
        )}

        {!locked && (
          <TransfersSection
            accounts={activeAccounts}
            settings={settings}
            date={date}
            rateBook={rateBook}
            savedTransfers={dateTransfers}
            pendingTransfers={pendingTransfers}
            onEditPending={openEditPending}
            onEditSaved={openEditSaved}
            onRemovePending={(key) =>
              setPendingTransfers((prev) => prev.filter((t) => t.key !== key))
            }
            onDeleteSaved={(id) => void deleteTransfer(id)}
          />
        )}

        {editing && (
          <Button type="button" variant="danger" dataQa="check-in-delete" onClick={() => void handleDelete()}>
            {locked ? 'Удалить перевод' : 'Удалить чек-ин'}
          </Button>
        )}
        </div>
      </form>
    </EntityEditPanel>

    <CheckInTransferPanel
      open={transferEditor != null}
      title={
        transferEditor?.mode === 'create'
          ? 'Новый перевод'
          : 'Редактировать перевод'
      }
      date={date}
      accounts={activeAccounts}
      settings={settings}
      rateBook={rateBook}
      initial={transferEditor?.initial ?? null}
      onClose={() => setTransferEditor(null)}
      onSave={handleTransferEditorSave}
    />
    </>
  )
}

function TransfersSection({
  accounts,
  settings,
  date,
  rateBook,
  savedTransfers,
  pendingTransfers,
  onEditPending,
  onEditSaved,
  onRemovePending,
  onDeleteSaved,
}: {
  accounts: Account[]
  settings: WalletSettings
  date: string
  rateBook?: RateBook
  savedTransfers: Transfer[]
  pendingTransfers: PendingTransfer[]
  onEditPending: (t: PendingTransfer) => void
  onEditSaved: (t: Transfer) => void
  onRemovePending: (key: string) => void
  onDeleteSaved: (id: string) => void
}) {
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  if (savedTransfers.length === 0 && pendingTransfers.length === 0) {
    return (
      <div className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Переводы за день</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">Переводов нет</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Переводы за день</h3>
      <ul className="space-y-2">
        {savedTransfers.map((t) => (
          <li
            key={t.id}
            data-transfer-anchor={t.id}
            className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60"
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              {...dataQa(`check-in-transfer-${t.id}`)}
              onClick={() => onEditSaved(t)}
            >
              <p className="font-medium text-slate-900 dark:text-slate-200">
                {formatTransferLabel(t, accounts, { settings, date, rateBook })}
              </p>
              <TransferSpreadLine
                spread={transferSpreadBase(
                  t,
                  accountMap.get(t.fromAccountId),
                  accountMap.get(t.toAccountId),
                  settings,
                  rateBook,
                )}
                currency={settings.baseCurrency}
                className="mt-0.5 text-xs font-medium"
                dataQa={`check-in-transfer-spread-${t.id}`}
              />
              {t.note ? <p className="text-xs text-slate-500 dark:text-slate-400">{t.note}</p> : null}
              <p className="mt-0.5 text-[11px] text-blue-600 dark:text-blue-400">Изменить</p>
            </button>
            <button
              type="button"
              className="shrink-0 text-xs text-red-600 hover:underline"
              {...dataQa(`check-in-transfer-delete-${t.id}`)}
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
              data-transfer-anchor={t.key}
              className="flex items-start justify-between gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                {...dataQa(`check-in-pending-${t.key}`)}
                onClick={() => onEditPending(t)}
              >
                <p className="font-medium text-slate-900 dark:text-slate-200">
                  {formatTransferLabel(
                    {
                      fromAccountId: t.fromAccountId,
                      toAccountId: t.toAccountId,
                      amount: parseMoneyInput(t.amount) ?? 0,
                      toAmount: parseMoneyInput(t.toAmount) ?? undefined,
                    },
                    accounts,
                    { settings, date, rateBook },
                  )}
                </p>
                <TransferSpreadLine
                  spread={
                    parseMoneyInput(t.amount) != null
                      ? transferSpreadBase(
                          {
                            date,
                            fromAccountId: t.fromAccountId,
                            toAccountId: t.toAccountId,
                            amount: parseMoneyInput(t.amount) ?? 0,
                            toAmount: parseMoneyInput(t.toAmount) ?? undefined,
                          },
                          from,
                          to,
                          settings,
                          rateBook,
                        )
                      : 0
                  }
                  currency={settings.baseCurrency}
                  className="mt-0.5 text-xs font-medium"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t.note ? `${t.note} · ` : ''}
                  будет сохранён с чек-ином
                </p>
                <p className="mt-0.5 text-[11px] text-blue-600 dark:text-blue-400">Изменить</p>
              </button>
              <button
                type="button"
                className="shrink-0 text-xs text-red-600 hover:underline"
                {...dataQa(`check-in-pending-remove-${t.key}`)}
                onClick={() => onRemovePending(t.key)}
              >
                Убрать
              </button>
            </li>
          )
        })}
      </ul>
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
