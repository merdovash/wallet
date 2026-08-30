import { useEffect, useMemo, useState } from 'react'
import { snapshotDates } from '../../engine/growthEngine'
import { isFundHostAccount } from '../../lib/accountKinds'
import {
  avgMonthlyExpense,
  FUNDS_EXPENSE_MONTHS_DEFAULT,
  FUNDS_EXPENSE_MONTHS_MAX,
  FUNDS_EXPENSE_MONTHS_MIN,
  readFundsExpenseMonths,
  writeFundsExpenseMonths,
} from '../../lib/avgMonthlyExpense'
import { dataQa } from '../../lib/dataQa'
import {
  addAmountToMonth,
  amountsFromExpenses,
  expensesFromAmounts,
  formatYearMonthRu,
  resolveMonthlyTarget,
  yearMonthFromIso,
} from '../../lib/fundOnboarding'
import { isFreeMoneyFund, nextLowerUserPriority } from '../../lib/fundAllocation'
import { buildAccountFundsState } from '../../lib/fundBalances'
import { formatCurrency, formatIsoToRu, todayIsoDate } from '../../lib/format'
import { parseMoneyInput } from '../../lib/moneyInput'
import { useRegisterPrimaryAction } from '../../lib/useRegisterPrimaryAction'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { FundsOnboarding } from './FundsOnboarding'
import { FundAutoTargetToggle, FundMonthlyExpenseList } from './FundExpenseMonthsEditor'
import { Button, Card, Field, Input, MoneyInput, Select } from '../ui/FormControls'
import { EntityEditPanel } from '../ui/EntityEditPanel'
import { StackPanel } from '../ui/StackPanel'

export function FundsPanel({ active }: { active: boolean }) {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const funds = useWalletStore((s) => s.funds)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)
  const addAccountFund = useWalletStore((s) => s.addAccountFund)
  const updateAccountFund = useWalletStore((s) => s.updateAccountFund)
  const deleteAccountFund = useWalletStore((s) => s.deleteAccountFund)

  const [expenseMonths, setExpenseMonths] = useState(FUNDS_EXPENSE_MONTHS_DEFAULT)
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'read' | 'edit'>('read')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewFreeId, setViewFreeId] = useState<string | null>(null)
  const [addExpenseOpen, setAddExpenseOpen] = useState(false)
  const [addExpenseAmount, setAddExpenseAmount] = useState('')
  const [name, setName] = useState('')
  const [accountId, setAccountId] = useState('')
  const [monthlyTarget, setMonthlyTarget] = useState('')
  const [priority, setPriority] = useState('1')
  const [autoTarget, setAutoTarget] = useState(false)
  const [expenseAmounts, setExpenseAmounts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setExpenseMonths(readFundsExpenseMonths())
  }, [])

  function changeExpenseMonths(next: number) {
    setExpenseMonths(next)
    writeFundsExpenseMonths(next)
  }

  const hostAccounts = useMemo(
    () =>
      accounts
        .filter(isFundHostAccount)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [accounts],
  )

  const asOfDate = useMemo(() => {
    const dates = snapshotDates(snapshots)
    return dates[dates.length - 1] ?? todayIsoDate()
  }, [snapshots])

  const expenseHint = useMemo(
    () => avgMonthlyExpense(snapshots, expenseMonths, asOfDate),
    [snapshots, expenseMonths, asOfDate],
  )

  const states = useMemo(
    () =>
      hostAccounts
        .map((account) =>
          buildAccountFundsState(
            account.id,
            funds,
            snapshots,
            transfers,
            accounts,
            settings,
            rateBook,
            asOfDate,
          ),
        )
        .filter((state) => state.rows.some((row) => !isFreeMoneyFund(row.fund))),
    [hostAccounts, funds, snapshots, transfers, accounts, settings, rateBook, asOfDate],
  )

  function openCreate() {
    setEditingId(null)
    setError(null)
    setName('')
    setAccountId(hostAccounts[0]?.id ?? '')
    setMonthlyTarget('')
    setPriority(String(nextLowerUserPriority(funds, hostAccounts[0]?.id ?? '')))
    setAutoTarget(false)
    setExpenseAmounts({})
    setFormMode('edit')
    setAddExpenseOpen(false)
    setFormOpen(true)
  }

  function openEdit(id: string) {
    const fund = funds.find((f) => f.id === id)
    if (!fund || isFreeMoneyFund(fund)) return
    setEditingId(id)
    setError(null)
    setName(fund.name)
    setAccountId(fund.accountId)
    setMonthlyTarget(String(fund.monthlyTarget))
    setPriority(String(fund.priority))
    setAutoTarget(Boolean(fund.autoTarget))
    setExpenseAmounts(amountsFromExpenses(fund.monthlyExpenses))
    setFormMode('read')
    setAddExpenseOpen(false)
    setAddExpenseAmount('')
    setFormOpen(true)
  }

  async function handleSave() {
    const trimmed = name.trim()
    const prio = Number(priority)
    const amountsForTarget = viewingFund
      ? amountsFromExpenses(viewingFund.monthlyExpenses)
      : expenseAmounts
    const target = resolveMonthlyTarget(autoTarget, amountsForTarget, parseMoneyInput(monthlyTarget))
    if (!trimmed || !accountId || target == null || !Number.isFinite(prio)) {
      setError(
        autoTarget
          ? 'Укажите название, счёт, расходы со средним > 0 и приоритет'
          : 'Укажите название, счёт, цель > 0 и приоритет',
      )
      return
    }
    const monthlyExpenses = viewingFund
      ? (viewingFund.monthlyExpenses ?? [])
      : expensesFromAmounts(expenseAmounts)
    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        await updateAccountFund(editingId, {
          name: trimmed,
          accountId,
          monthlyTarget: target,
          priority: Math.trunc(prio),
          autoTarget,
          monthlyExpenses,
        })
        setFormMode('read')
      } else {
        await addAccountFund({
          name: trimmed,
          accountId,
          monthlyTarget: target,
          priority: Math.trunc(prio),
          autoTarget,
          monthlyExpenses,
        })
        setFormOpen(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить фонд')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddExpense() {
    if (!editingId) return
    const fund = funds.find((f) => f.id === editingId)
    if (!fund || isFreeMoneyFund(fund)) return
    const delta = parseMoneyInput(addExpenseAmount)
    if (delta == null || !(delta > 0)) {
      setError('Укажите сумму расхода больше 0')
      return
    }
    const month = yearMonthFromIso(todayIsoDate())
    const monthlyExpenses = addAmountToMonth(fund.monthlyExpenses, month, delta)
    const target = resolveMonthlyTarget(
      Boolean(fund.autoTarget),
      amountsFromExpenses(monthlyExpenses),
      fund.monthlyTarget,
    )
    if (fund.autoTarget && target == null) {
      setError('После расхода среднее должно быть больше 0')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateAccountFund(editingId, {
        monthlyExpenses,
        autoTarget: Boolean(fund.autoTarget),
        monthlyTarget: target ?? fund.monthlyTarget,
      })
      setExpenseAmounts(amountsFromExpenses(monthlyExpenses))
      setAddExpenseOpen(false)
      setAddExpenseAmount('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить расход')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editingId) return
    setSaving(true)
    setError(null)
    try {
      await deleteAccountFund(editingId)
      setFormOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить фонд')
    } finally {
      setSaving(false)
    }
  }

  const viewingFund = editingId ? funds.find((f) => f.id === editingId) : undefined
  const viewingAccount = viewingFund
    ? accounts.find((a) => a.id === viewingFund.accountId)
    : undefined
  const hasUserFunds = funds.some((f) => !isFreeMoneyFund(f))
  const canCreate = hostAccounts.length > 0
  const isCreate = formOpen && !editingId
  const isRead = formOpen && !!editingId && formMode === 'read'
  const isEdit = formOpen && (isCreate || formMode === 'edit')
  const amountsForTarget = viewingFund
    ? amountsFromExpenses(viewingFund.monthlyExpenses)
    : expenseAmounts
  const resolvedTarget = resolveMonthlyTarget(autoTarget, amountsForTarget, parseMoneyInput(monthlyTarget))
  const canSave =
    name.trim().length > 0 && !!accountId && resolvedTarget != null && Number.isFinite(Number(priority))
  const addDelta = parseMoneyInput(addExpenseAmount)
  const canAddExpense = addDelta != null && addDelta > 0 && !saving
  const currentExpenseMonth = yearMonthFromIso(todayIsoDate())

  useRegisterPrimaryAction(active && hasUserFunds && !formOpen && !viewFreeId, {
    id: 'funds-add',
    label: 'Добавить фонд',
    title: canCreate ? 'Новый фонд' : 'Сначала создайте счёт',
    scope: 'section',
    disabled: !canCreate,
    onClick: openCreate,
  })

  const viewFree = viewFreeId ? funds.find((f) => f.id === viewFreeId) : null
  const viewFreeState = viewFree
    ? states.find((s) => s.accountId === viewFree.accountId)
    : null
  const viewFreeRow = viewFreeState?.rows.find((r) => r.fund.id === viewFree?.id)

  if (!hasUserFunds) {
    const onboardingCurrency =
      hostAccounts.find((a) => a.id === hostAccounts[0]?.id)?.currency ?? settings.baseCurrency
    return (
      <div className="space-y-4" {...dataQa('funds-page')}>
        <FundsOnboarding
          active={active}
          accounts={hostAccounts}
          currency={onboardingCurrency}
          asOfDate={todayIsoDate()}
          onCreate={async (drafts) => {
            for (const draft of drafts) {
              await addAccountFund({
                name: draft.name,
                accountId: draft.accountId,
                monthlyTarget: draft.monthlyTarget,
                priority: draft.priority,
                autoTarget: draft.autoTarget,
                monthlyExpenses: draft.monthlyExpenses,
              })
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4" {...dataQa('funds-page')}>
      <Card className="!p-3 sm:!p-4" dataQa="funds-expense-hint">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Месяцев расхода" className="w-36" dataQa="funds-expense-months-field">
            <Select
              value={String(expenseMonths)}
              onChange={(e) => changeExpenseMonths(Number(e.target.value))}
              dataQa="funds-expense-months"
            >
              {Array.from({ length: FUNDS_EXPENSE_MONTHS_MAX - FUNDS_EXPENSE_MONTHS_MIN + 1 }, (_, i) => {
                const n = FUNDS_EXPENSE_MONTHS_MIN + i
                return (
                  <option key={n} value={n}>
                    {n}
                  </option>
                )
              })}
            </Select>
          </Field>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Средний расход за период</p>
            <p className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-200">
              {formatCurrency(expenseHint.avgMonthly, settings.baseCurrency)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatIsoToRu(expenseHint.startDate)} — {formatIsoToRu(expenseHint.endDate)} · ориентир для
              целей пополнения, статистика не хранится
            </p>
          </div>
        </div>
      </Card>

      {states.map((state) => {
        const account = accounts.find((a) => a.id === state.accountId)
        if (!account) return null
        return (
            <Card key={state.accountId} className="!p-0" dataQa={`funds-account-${state.accountId}`}>
              <div className="border-b border-slate-100 px-3 py-2.5 dark:border-slate-800 sm:px-4">
                <p className="font-medium text-slate-900 dark:text-slate-200">{account.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatCurrency(state.accountBalance, account.currency)} на счёте
                </p>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {state.rows.map((row) => {
                  const system = isFreeMoneyFund(row.fund)
                  const progress =
                    row.fund.monthlyTarget > 0
                      ? Math.min(1, row.filledThisMonth / row.fund.monthlyTarget)
                      : 0
                  return (
                    <li key={row.fund.id}>
                      <button
                        type="button"
                        className="flex w-full min-w-0 flex-col gap-1 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 sm:px-4"
                        onClick={() => (system ? setViewFreeId(row.fund.id) : openEdit(row.fund.id))}
                        {...dataQa(system ? 'funds-row-free-money' : `funds-row-${row.fund.id}`)}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate font-medium text-slate-900 dark:text-slate-200">
                            {row.fund.name}
                            {system ? (
                              <span className="ml-2 text-xs font-normal text-slate-400">системный</span>
                            ) : (
                              <span className="ml-2 text-xs font-normal text-slate-400">
                                приоритет {row.fund.priority}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 tabular-nums text-slate-900 dark:text-slate-200">
                            {formatCurrency(row.balance, account.currency)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                          <span>
                            доля{' '}
                            {Number.isFinite(row.share)
                              ? `${(row.share * 100).toFixed(1).replace('.', ',')}%`
                              : '—'}
                          </span>
                          {system ? (
                            <span>остаток перевода</span>
                          ) : (
                            <span>
                              в этом месяце {formatCurrency(row.filledThisMonth, account.currency)} из{' '}
                              {formatCurrency(row.fund.monthlyTarget, account.currency)}
                            </span>
                          )}
                        </div>
                        {!system ? (
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className="h-full rounded-full bg-blue-600"
                              style={{ width: `${Math.round(progress * 100)}%` }}
                            />
                          </div>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )
        })}

      <EntityEditPanel
        open={formOpen}
        title={editingId ? viewingFund?.name ?? 'Фонд' : 'Новый фонд'}
        onClose={() => {
          if (addExpenseOpen) {
            setAddExpenseOpen(false)
            return
          }
          setFormOpen(false)
          setFormMode('read')
        }}
        onSave={() => {
          if (isRead) {
            if (viewingFund && !isFreeMoneyFund(viewingFund)) {
              setName(viewingFund.name)
              setAccountId(viewingFund.accountId)
              setMonthlyTarget(String(viewingFund.monthlyTarget))
              setPriority(String(viewingFund.priority))
              setAutoTarget(Boolean(viewingFund.autoTarget))
              setExpenseAmounts(amountsFromExpenses(viewingFund.monthlyExpenses))
            }
            setFormMode('edit')
            return
          }
          void handleSave()
        }}
        saveDisabled={isRead ? false : !canSave || saving}
        saveLabel={isRead ? 'Изменить' : 'Сохранить'}
        saveTitle={isRead ? 'Редактировать фонд' : undefined}
        saveActionId={isRead ? 'fund-form-edit' : 'fund-form-save'}
        saveActive={!addExpenseOpen}
        dataQa="fund-form"
      >
        <div className="space-y-4">
          {isRead && viewingFund ? (
            <>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Счёт</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-slate-200">
                  {viewingAccount?.name ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Цель пополнения</p>
                <p className="mt-1 text-sm tabular-nums text-slate-900 dark:text-slate-200">
                  {formatCurrency(
                    viewingFund.monthlyTarget,
                    viewingAccount?.currency ?? settings.baseCurrency,
                  )}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {viewingFund.autoTarget ? 'по расходам' : 'вручную'}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Приоритет</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-slate-200">{viewingFund.priority}</p>
              </div>
            </>
          ) : (
            <>
              <Field label="Название">
                <Input value={name} onChange={(e) => setName(e.target.value)} dataQa="fund-form-name" />
              </Field>
              <Field label="Счёт">
                <Select
                  value={accountId}
                  onChange={(e) => {
                    const nextId = e.target.value
                    setAccountId(nextId)
                    if (!editingId) setPriority(String(nextLowerUserPriority(funds, nextId)))
                  }}
                  dataQa="fund-form-account"
                >
                  {hostAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </Select>
              </Field>
              <FundAutoTargetToggle
                autoTarget={autoTarget}
                onChange={(next) => {
                  setAutoTarget(next)
                  if (next) {
                    const mean = resolveMonthlyTarget(
                      true,
                      viewingFund
                        ? amountsFromExpenses(viewingFund.monthlyExpenses)
                        : expenseAmounts,
                      null,
                    )
                    if (mean != null) setMonthlyTarget(String(mean))
                  }
                }}
              />
              <Field label="Целевое ежемесячное пополнение">
                <MoneyInput
                  value={
                    autoTarget && resolvedTarget != null ? String(resolvedTarget) : monthlyTarget
                  }
                  onChange={setMonthlyTarget}
                  allowNegative={false}
                  disabled={autoTarget}
                  dataQa="fund-form-target"
                />
              </Field>
              <Field label="Приоритет (больше — раньше; новый фонд по умолчанию в конце очереди)">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  dataQa="fund-form-priority"
                />
              </Field>
            </>
          )}

          {editingId ? (
            <div className="space-y-2" {...dataQa('fund-form-expenses')}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Расходы по месяцам</p>
                <Button
                  type="button"
                  variant="secondary"
                  className="!px-3 !py-1.5"
                  onClick={() => {
                    setError(null)
                    setAddExpenseAmount('')
                    setAddExpenseOpen(true)
                  }}
                  dataQa="fund-add-expense"
                >
                  Добавить расход
                </Button>
              </div>
              <FundMonthlyExpenseList
                expenses={viewingFund?.monthlyExpenses}
                currency={viewingAccount?.currency ?? settings.baseCurrency}
              />
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {isEdit && editingId ? (
            <Button type="button" variant="danger" onClick={() => void handleDelete()} dataQa="fund-form-delete">
              Удалить фонд
            </Button>
          ) : null}
        </div>
      </EntityEditPanel>

      <EntityEditPanel
        open={addExpenseOpen}
        title="Добавить расход"
        onClose={() => setAddExpenseOpen(false)}
        onSave={() => void handleAddExpense()}
        saveDisabled={!canAddExpense}
        saveActionId="fund-expense-add-save"
        dataQa="fund-expense-add"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Сумма добавится к итогу за {formatYearMonthRu(currentExpenseMonth)}.
          </p>
          <Field label="Сумма">
            <MoneyInput
              value={addExpenseAmount}
              onChange={setAddExpenseAmount}
              allowNegative={false}
              dataQa="fund-expense-add-amount"
            />
          </Field>
        </div>
      </EntityEditPanel>

      <StackPanel
        open={!!viewFree}
        title="Свободные деньги"
        onClose={() => setViewFreeId(null)}
        dataQa="fund-free-money"
      >
        <div className="space-y-3 p-4 text-sm text-slate-600 dark:text-slate-300">
          <p>Системный фонд. Сюда попадает остаток перевода после заполнения целей по приоритету.</p>
          {viewFreeRow && viewFree ? (
            <p className="tabular-nums text-slate-900 dark:text-slate-200">
              Остаток:{' '}
              {formatCurrency(
                viewFreeRow.balance,
                accounts.find((a) => a.id === viewFree.accountId)?.currency ?? settings.baseCurrency,
              )}
            </p>
          ) : null}
          <p className="text-xs text-slate-500">Этот фонд нельзя удалить или переименовать.</p>
        </div>
      </StackPanel>
    </div>
  )
}
