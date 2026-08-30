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
import { isFreeMoneyFund } from '../../lib/fundAllocation'
import { buildAccountFundsState } from '../../lib/fundBalances'
import { formatCurrency, formatIsoToRu, todayIsoDate } from '../../lib/format'
import { parseMoneyInput } from '../../lib/moneyInput'
import { useRegisterPrimaryAction } from '../../lib/useRegisterPrimaryAction'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Button, Card, EmptyState, Field, Input, MoneyInput, Select } from '../ui/FormControls'
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewFreeId, setViewFreeId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [accountId, setAccountId] = useState('')
  const [monthlyTarget, setMonthlyTarget] = useState('')
  const [priority, setPriority] = useState('1')
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
        .filter((state) => state.rows.length > 0),
    [hostAccounts, funds, snapshots, transfers, accounts, settings, rateBook, asOfDate],
  )

  function openCreate() {
    setEditingId(null)
    setError(null)
    setName('')
    setAccountId(hostAccounts[0]?.id ?? '')
    setMonthlyTarget('')
    const maxPriority = funds
      .filter((f) => !isFreeMoneyFund(f) && f.accountId === (hostAccounts[0]?.id ?? ''))
      .reduce((m, f) => Math.max(m, f.priority), 0)
    setPriority(String(maxPriority + 1))
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
    setFormOpen(true)
  }

  async function handleSave() {
    const trimmed = name.trim()
    const target = parseMoneyInput(monthlyTarget)
    const prio = Number(priority)
    if (!trimmed || !accountId || target == null || !(target > 0) || !Number.isFinite(prio)) {
      setError('Укажите название, счёт, цель > 0 и приоритет')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        await updateAccountFund(editingId, {
          name: trimmed,
          accountId,
          monthlyTarget: target,
          priority: Math.trunc(prio),
        })
      } else {
        await addAccountFund({
          name: trimmed,
          accountId,
          monthlyTarget: target,
          priority: Math.trunc(prio),
        })
      }
      setFormOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить фонд')
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

  const canCreate = hostAccounts.length > 0
  const canSave =
    name.trim().length > 0 &&
    !!accountId &&
    (parseMoneyInput(monthlyTarget) ?? 0) > 0 &&
    Number.isFinite(Number(priority))

  useRegisterPrimaryAction(active && !formOpen && !viewFreeId, {
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

      {states.length === 0 ? (
        <EmptyState
          title="Фондов пока нет"
          description="Создайте фонд на счёте: при входящем переводе он заполнится по приоритету, остаток уйдёт в «Свободные деньги»."
          dataQa="funds-empty"
        />
      ) : (
        states.map((state) => {
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
        })
      )}

      <EntityEditPanel
        open={formOpen}
        title={editingId ? 'Фонд' : 'Новый фонд'}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        saveDisabled={!canSave || saving}
        saveActionId="fund-form-save"
        dataQa="fund-form"
      >
        <div className="space-y-4">
          <Field label="Название">
            <Input value={name} onChange={(e) => setName(e.target.value)} dataQa="fund-form-name" />
          </Field>
          <Field label="Счёт">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} dataQa="fund-form-account">
              {hostAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Целевое ежемесячное пополнение">
            <MoneyInput
              value={monthlyTarget}
              onChange={setMonthlyTarget}
              allowNegative={false}
              dataQa="fund-form-target"
            />
          </Field>
          <Field label="Приоритет (больше — раньше)">
            <Input
              type="number"
              inputMode="numeric"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              dataQa="fund-form-priority"
            />
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {editingId ? (
            <Button type="button" variant="danger" onClick={() => void handleDelete()} dataQa="fund-form-delete">
              Удалить фонд
            </Button>
          ) : null}
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
