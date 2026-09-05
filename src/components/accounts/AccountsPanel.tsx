import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type DragEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import { creditDebt } from '../../engine/creditFloatEngine'
import {
  balanceOnDate,
  buildAccountSeries,
  lastSnapshotDateForAccount,
  netWorthAmount,
  snapshotDates,
} from '../../engine/growthEngine'
import type { RateBook } from '../../engine/growthEngine'
import { ACCOUNT_COLORS, type Account, type AccountKind, type WalletSettings } from '../../types/wallet'
import type { AccountPeriodReturn } from '../../lib/accountPeriodReturn'
import type { AccountStaleStatus } from '../../lib/accountStaleStatus'
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABELS, isGrowthKind, normalizeAccountKind } from '../../lib/accountKinds'
import { buildAccountPeriodReturn } from '../../lib/accountPeriodReturn'
import { buildAccountsPageTotals } from '../../lib/accountsPageTotals'
import { buildAccountStaleStatuses, formatStaleDays } from '../../lib/accountStaleStatus'
import { CASHBACK_CURRENCY } from '../../lib/cashbackReport'
import { CURRENCY_OPTIONS, toBase } from '../../lib/currency'
import { resolvePivotForDate } from '../../lib/cbrRates'
import { planAccountTodayCheckIn } from '../../lib/accountTodayCheckIn'
import { formatIsoToRu, formatCurrency, formatPercent, todayIsoDate } from '../../lib/format'
import { formatMoneyInput, parseMoneyInput } from '../../lib/moneyInput'
import { useRegisterPrimaryAction } from '../../lib/useRegisterPrimaryAction'
import { useRestoreFocusOnResume } from '../../lib/useRestoreFocusOnResume'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { dataQa } from '../../lib/dataQa'
import { Button, Card, EmptyState, Field, Input, MoneyInput, Select } from '../ui/FormControls'
import { EntityEditPanel } from '../ui/EntityEditPanel'
import { PageHeader } from '../ui/PageHeader'
import { GrowthChart } from '../dashboard/GrowthChart'
import { FundsPanel } from './FundsPanel'
import { IndicesPanel } from '../indices/IndicesPanel'

interface AccountsPanelProps {
  focusAccountId?: string | null
  onFocusConsumed?: () => void
}

export function AccountsPanel({ focusAccountId, onFocusConsumed }: AccountsPanelProps) {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)
  const addAccount = useWalletStore((s) => s.addAccount)
  const updateAccount = useWalletStore((s) => s.updateAccount)
  const reorderAccounts = useWalletStore((s) => s.reorderAccounts)
  const archiveAccount = useWalletStore((s) => s.archiveAccount)
  const deleteAccount = useWalletStore((s) => s.deleteAccount)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('RUB')
  const [color, setColor] = useState<string>(ACCOUNT_COLORS[0])
  const [kind, setKind] = useState<AccountKind>('operational')
  const [creditLimit, setCreditLimit] = useState('')
  const [linkedAccountId, setLinkedAccountId] = useState('')
  const [graceMonths, setGraceMonths] = useState('3')
  const [showArchived, setShowArchived] = useState(false)
  const [pageTab, setPageTab] = useState<'registry' | 'funds' | 'indices'>('registry')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null)

  const linkCandidates = useMemo(
    () =>
      accounts
        .filter(
          (a) =>
            a.kind !== 'credit' &&
            !a.archived &&
            a.id !== editingId,
        )
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [accounts, editingId],
  )

  useEffect(() => {
    if (!focusAccountId) return
    setDetailId(focusAccountId)
    onFocusConsumed?.()
  }, [focusAccountId, onFocusConsumed])

  const visible = useMemo(() => {
    return accounts
      .filter((a) => (showArchived ? true : !a.archived))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  }, [accounts, showArchived])

  const balancesById = useMemo(() => {
    const dates = snapshotDates(snapshots)
    const asOf = dates[dates.length - 1] ?? todayIsoDate()
    const map = new Map<string, number | null>()
    for (const account of visible) {
      map.set(account.id, balanceOnDate(account.id, asOf, snapshots))
    }
    return map
  }, [visible, snapshots])

  const balanceAsOf = useMemo(() => {
    const dates = snapshotDates(snapshots)
    return dates[dates.length - 1] ?? todayIsoDate()
  }, [snapshots])

  const ratePivot = useMemo(
    () =>
      resolvePivotForDate(balanceAsOf, rateBook) ??
      (settings.baseCurrency === 'RUB' ? settings.exchangeRates : null),
    [balanceAsOf, rateBook, settings.baseCurrency, settings.exchangeRates],
  )

  const balanceBaseById = useMemo(() => {
    const map = new Map<string, number | null>()
    for (const account of visible) {
      if (account.currency === settings.baseCurrency) {
        map.set(account.id, null)
        continue
      }
      const bal = balancesById.get(account.id)
      if (bal == null) {
        map.set(account.id, null)
        continue
      }
      const base = toBase(
        netWorthAmount(account, bal),
        account.currency,
        settings.baseCurrency,
        settings.exchangeRates,
        ratePivot,
      )
      map.set(account.id, Number.isFinite(base) ? base : null)
    }
    return map
  }, [visible, balancesById, settings, ratePivot])

  const staleById = useMemo(
    () => buildAccountStaleStatuses(accounts, snapshots),
    [accounts, snapshots],
  )

  const returnById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildAccountPeriodReturn>>()
    for (const account of visible) {
      map.set(
        account.id,
        buildAccountPeriodReturn(account.id, accounts, snapshots, transfers, settings, rateBook),
      )
    }
    return map
  }, [visible, accounts, snapshots, transfers, settings, rateBook])

  const pageTotals = useMemo(
    () => buildAccountsPageTotals(accounts, snapshots, settings, rateBook),
    [accounts, snapshots, settings, rateBook],
  )

  function openCreate() {
    setDetailId(null)
    setEditingId(null)
    setName('')
    setCurrency('RUB')
    setColor(ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length]!)
    setKind('operational')
    setCreditLimit('')
    setLinkedAccountId('')
    setGraceMonths('3')
    setFormOpen(true)
  }

  function openEdit(id: string) {
    const account = accounts.find((a) => a.id === id)
    if (!account) return
    setDetailId(null)
    setEditingId(id)
    setName(account.name)
    setCurrency(account.currency)
    setColor(account.color)
    setKind(account.kind ?? 'operational')
    setCreditLimit(
      account.creditLimit != null ? String(account.creditLimit) : '',
    )
    setLinkedAccountId(account.linkedAccountId ?? '')
    setGraceMonths(String(account.graceMonths ?? 3))
    setFormOpen(true)
  }

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    if (kind === 'credit') {
      const limit = parseMoneyInput(creditLimit)
      const grace = Number(graceMonths)
      if (limit == null || !(limit > 0)) return
      if (!Number.isFinite(grace) || grace < 1 || grace > 12) return
      if (editingId) {
        await updateAccount(editingId, {
          name: trimmed,
          currency,
          color,
          kind: 'credit',
          creditLimit: limit,
          linkedAccountId: linkedAccountId || null,
          graceMonths: grace,
        })
      } else {
        await addAccount({
          name: trimmed,
          currency,
          color,
          kind: 'credit',
          creditLimit: limit,
          linkedAccountId: linkedAccountId || undefined,
          graceMonths: grace,
        })
      }
    } else if (kind === 'cashback') {
      if (editingId) {
        await updateAccount(editingId, {
          name: trimmed,
          currency: CASHBACK_CURRENCY,
          color,
          kind: 'cashback',
          creditLimit: null,
          linkedAccountId: null,
          graceMonths: null,
        })
      } else {
        await addAccount({
          name: trimmed,
          currency: CASHBACK_CURRENCY,
          color,
          kind: 'cashback',
        })
      }
    } else if (editingId) {
      await updateAccount(editingId, {
        name: trimmed,
        currency,
        color,
        kind,
        creditLimit: null,
        linkedAccountId: null,
        graceMonths: null,
      })
    } else {
      await addAccount({ name: trimmed, currency, color, kind })
    }
    setFormOpen(false)
  }

  useRegisterPrimaryAction(!formOpen && pageTab === 'registry', {
    id: 'accounts-add',
    label: 'Добавить счёт',
    title: 'Новый счёт',
    scope: 'section',
    onClick: openCreate,
  })

  function moveAccount(fromId: string, toId: string) {
    if (fromId === toId) return
    const ids = visible.map((a) => a.id)
    const fromIndex = ids.indexOf(fromId)
    const toIndex = ids.indexOf(toId)
    if (fromIndex < 0 || toIndex < 0) return
    const next = [...ids]
    next.splice(fromIndex, 1)
    next.splice(toIndex, 0, fromId)
    void reorderAccounts(next)
  }

  function handleDragStart(e: DragEvent, id: string) {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  function handleDragOver(e: DragEvent, id: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (overId !== id) setOverId(id)
  }

  function handleDrop(e: DragEvent, id: string) {
    e.preventDefault()
    const fromId = dragId ?? e.dataTransfer.getData('text/plain')
    if (fromId) moveAccount(fromId, id)
    setDragId(null)
    setOverId(null)
  }

  function handleDragEnd() {
    setDragId(null)
    setOverId(null)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4" {...dataQa('accounts-page')}>
      <PageHeader
        title="Счета"
        description={
          pageTab === 'funds'
            ? 'Конверты внутри счёта: пополнение переводами по приоритету, рост — по доле.'
            : pageTab === 'indices'
              ? 'Ручные показатели рынков и ставок для сравнения с доходностью портфеля.'
            : 'Перетащите за ⋮⋮, чтобы изменить порядок. На телефоне смахните счёт влево для действий.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700"
              {...dataQa('accounts-tabs')}
            >
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm ${
                  pageTab === 'registry'
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
                onClick={() => setPageTab('registry')}
                {...dataQa('accounts-tab-registry')}
              >
                Реестр
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm ${
                  pageTab === 'funds'
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
                onClick={() => setPageTab('funds')}
                {...dataQa('accounts-tab-funds')}
              >
                Фонды
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm ${
                  pageTab === 'indices'
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
                onClick={() => setPageTab('indices')}
                {...dataQa('accounts-tab-indices')}
              >
                Индексы
              </button>
            </div>
            {pageTab === 'registry' ? (
              <Button type="button" variant="secondary" onClick={() => setShowArchived((v) => !v)} dataQa="accounts-show-archived">
                {showArchived ? 'Скрыть архив' : 'Показать архив'}
              </Button>
            ) : null}
          </div>
        }
      />

      {pageTab === 'funds' ? (
        <FundsPanel active={!formOpen} />
      ) : pageTab === 'indices' ? (
        <IndicesPanel active={!formOpen} />
      ) : visible.length === 0 ? (
        <EmptyState title="Счетов пока нет" description="Создайте первый счёт, чтобы фиксировать остатки." dataQa="accounts-empty" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Card className="!p-2.5 sm:!p-3" dataQa="widget-accounts-total">
              <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Всего денег</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900 dark:text-slate-200 sm:text-lg">
                {formatCurrency(pageTotals.totalMoneyBase, settings.baseCurrency)}
              </p>
            </Card>
            <Card className="!p-2.5 sm:!p-3" dataQa="widget-accounts-credit">
              <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Кредит</p>
              <p
                className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${
                  pageTotals.creditDebtBase > 0
                    ? 'text-red-600'
                    : 'text-slate-900 dark:text-slate-200'
                }`}
              >
                {formatCurrency(pageTotals.creditDebtBase, settings.baseCurrency)}
              </p>
            </Card>
          </div>
          <Card className="!p-0" dataQa="accounts-list">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((account) => (
              <AccountListItem
                key={account.id}
                account={account}
                balance={balancesById.get(account.id) ?? null}
                balanceBase={balanceBaseById.get(account.id) ?? null}
                baseCurrency={settings.baseCurrency}
                stale={staleById.get(account.id)}
                periodReturn={returnById.get(account.id) ?? null}
                isDragging={dragId === account.id}
                isOver={overId === account.id && dragId !== account.id}
                swipeOpen={swipeOpenId === account.id}
                onSwipeOpenChange={(open) => setSwipeOpenId(open ? account.id : null)}
                onDragOver={(e) => handleDragOver(e, account.id)}
                onDrop={(e) => handleDrop(e, account.id)}
                onDragStart={(e) => handleDragStart(e, account.id)}
                onDragEnd={handleDragEnd}
                onOpenDetail={() => {
                  setSwipeOpenId(null)
                  setDetailId(account.id)
                }}
                onEdit={() => {
                  setSwipeOpenId(null)
                  openEdit(account.id)
                }}
                onArchive={() => {
                  setSwipeOpenId(null)
                  void archiveAccount(account.id, !account.archived)
                }}
              />
            ))}
          </ul>
        </Card>
        </>
      )}

      <EntityEditPanel
        open={formOpen}
        title={editingId ? 'Счёт' : 'Новый счёт'}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        saveActionId="account-form-save"
        dataQa="account-form"
      >
        <div className="space-y-4">
          <Field label="Название">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Накопительный" dataQa="account-name" />
          </Field>
          <Field label="Тип">
            <Select
              value={kind}
              onChange={(e) => {
                const next = e.target.value as AccountKind
                setKind(next)
                if (next === 'cashback') setCurrency(CASHBACK_CURRENCY)
              }}
              dataQa="account-kind"
            >
              {ACCOUNT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ACCOUNT_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Валюта">
            <Select
              value={kind === 'cashback' ? CASHBACK_CURRENCY : currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={kind === 'cashback'}
              dataQa="account-currency"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </Field>
          {kind === 'credit' && (
            <>
              <Field label="Лимит">
                <MoneyInput
                  value={creditLimit}
                  onChange={setCreditLimit}
                  allowNegative={false}
                  placeholder="300000"
                  dataQa="account-credit-limit"
                />
              </Field>
              <Field label="Беспроцентный период">
                <Select value={graceMonths} onChange={(e) => setGraceMonths(e.target.value)} dataQa="account-grace">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={String(n)}>
                      {n}{' '}
                      {n === 1 ? 'месяц' : n < 5 ? 'месяца' : 'месяцев'} после месяца трат
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Связанный кошелёк (float)">
                <Select
                  value={linkedAccountId}
                  onChange={(e) => setLinkedAccountId(e.target.value)}
                  dataQa="account-linked"
                >
                  <option value="">Не выбран</option>
                  {linkCandidates.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                В чек-ине — доступный остаток лимита. Траты месяца N закрыть до конца месяца
                N+срок. Выгода float — по приросту связанного кошелька (без переводов).
              </p>
            </>
          )}
          <Field label="Цвет">
            <div className="flex flex-wrap gap-2">
              {ACCOUNT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full border-2 ${color === c ? 'border-slate-900' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                  {...dataQa(`account-color-${c}`)}
                />
              ))}
            </div>
          </Field>
          {editingId && (
            <Button
              type="button"
              variant="danger"
              dataQa="account-delete"
              onClick={() => {
                if (confirm('Удалить счёт и связанные данные?')) {
                  void deleteAccount(editingId).then(() => {
                    setFormOpen(false)
                    if (detailId === editingId) setDetailId(null)
                  })
                }
              }}
            >
              Удалить счёт
            </Button>
          )}
        </div>
      </EntityEditPanel>

      {detailId ? <AccountDetailPanel accountId={detailId} onClose={() => setDetailId(null)} /> : null}
    </div>
  )
}

function amountToInput(amount: number): string {
  return formatMoneyInput(String(amount).replace('.', ','))
}

function AccountDetailPanel({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)
  const addSnapshot = useWalletStore((s) => s.addSnapshot)
  const updateSnapshot = useWalletStore((s) => s.updateSnapshot)
  const account = accounts.find((a) => a.id === accountId) ?? null

  const today = todayIsoDate()
  const currentBalance = account ? balanceOnDate(account.id, today, snapshots) : null
  const [todayAmount, setTodayAmount] = useState(() =>
    currentBalance != null ? amountToInput(currentBalance) : '',
  )
  const [saving, setSaving] = useState(false)
  const { rootRef, focusKeyProps } = useRestoreFocusOnResume(!!account)

  useEffect(() => {
    const next = balanceOnDate(accountId, todayIsoDate(), useWalletStore.getState().snapshots)
    setTodayAmount(next != null ? amountToInput(next) : '')
  }, [accountId])

  const detailReturn = useMemo(
    () => buildAccountPeriodReturn(accountId, accounts, snapshots, transfers, settings, rateBook),
    [accountId, accounts, snapshots, transfers, settings, rateBook],
  )
  const detailSeries = useMemo(
    () => buildAccountSeries(accountId, snapshots, transfers, accounts, settings, rateBook),
    [accountId, snapshots, transfers, accounts, settings, rateBook],
  )

  const lastRecordedDate = lastSnapshotDateForAccount(accountId, snapshots)
  const parsedAmount = parseMoneyInput(todayAmount)
  const archived = account?.archived === true
  const saveDisabled = archived || saving || parsedAmount == null

  async function handleSave() {
    if (!account || archived) return
    const amount = parseMoneyInput(todayAmount)
    if (amount == null) {
      alert('Введите остаток')
      return
    }
    const plan = planAccountTodayCheckIn(account.id, amount, todayIsoDate(), snapshots)
    setSaving(true)
    try {
      if (plan.action === 'create') {
        await addSnapshot({ date: plan.date, origin: 'manual', lines: plan.lines })
      } else {
        await updateSnapshot(plan.snapshotId, { lines: plan.lines })
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Не удалось сохранить чек-ин')
    } finally {
      setSaving(false)
    }
  }

  if (!account) return null

  const balanceLabel = account.kind === 'credit' ? 'Доступно на сегодня' : 'Остаток на сегодня'
  const todayLine = snapshots.find((s) => s.date === today)?.lines.find((l) => l.accountId === account.id)

  return (
    <EntityEditPanel
      open
      title={account.name}
      onClose={onClose}
      onSave={handleSave}
      saveActionId="account-today-check-in"
      dataQa="account-detail"
      saveDisabled={saveDisabled}
      saveTitle={
        archived
          ? 'Архивный счёт нельзя чекинить'
          : parsedAmount == null
            ? 'Введите остаток'
            : 'Сохранить чек-ин на сегодня'
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSave()
        }}
      >
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Валюта: {account.currency}.
          {account.kind === 'credit'
            ? ' На графике — доступный остаток лимита.'
            : isGrowthKind(normalizeAccountKind(account.kind))
              ? ' Зелёная линия — прирост без переводов.'
              : ''}
        </p>

        {archived ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Архивный счёт: остаток фиксируется только до последней записи.
          </p>
        ) : (
          <div ref={rootRef} className="space-y-1">
            <Field label={balanceLabel}>
              <MoneyInput
                value={todayAmount}
                onChange={setTodayAmount}
                placeholder={currentBalance != null ? amountToInput(currentBalance) : '0'}
                dataQa="account-today-amount"
                {...focusKeyProps('today-amount')}
              />
            </Field>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {`Чек-ин на сегодня (${formatIsoToRu(today)}): обновится только этот счёт.`}
              {account.kind === 'credit' && account.creditLimit != null
                ? ` Лимит ${formatCurrency(account.creditLimit, account.currency)}.`
                : null}{' '}
              {todayLine
                ? 'Уже есть запись за сегодня — сохранится новое значение.'
                : lastRecordedDate
                  ? `Последняя запись: ${formatIsoToRu(lastRecordedDate)}.`
                  : 'По этому счёту ещё не было чек-инов.'}
            </p>
          </div>
        )}

        {detailReturn?.growthPct != null && (
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Доходность (Modified Dietz):{' '}
            <span className="font-medium">{formatPercent(detailReturn.growthPct)}</span>
            {detailReturn.annualizedPct != null ? (
              <>
                {' '}
                · в годовых{' '}
                <span className="font-medium">{formatPercent(detailReturn.annualizedPct)}</span>
              </>
            ) : detailReturn.days < 30 ? (
              <span className="text-slate-500 dark:text-slate-400">
                {' '}
                · годовые не считаются (&lt; 30 дней)
              </span>
            ) : null}
          </p>
        )}
        {account.kind === 'credit' && account.creditLimit != null && (
          <CreditDetailStats
            limit={account.creditLimit}
            graceMonths={account.graceMonths ?? 3}
            available={
              detailSeries.length > 0
                ? detailSeries[detailSeries.length - 1]!.balance
                : (balanceOnDate(account.id, today, snapshots) ?? 0)
            }
            currency={account.currency}
            baseCurrency={settings.baseCurrency}
            rateBook={rateBook}
            settings={settings}
            asOf={detailSeries.length > 0 ? detailSeries[detailSeries.length - 1]!.date : today}
            linkedName={
              account.linkedAccountId
                ? accounts.find((a) => a.id === account.linkedAccountId)?.name
                : undefined
            }
          />
        )}
        {detailSeries.length > 0 && account.kind !== 'credit' && (
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Последний остаток:{' '}
            <span className="font-medium">
              {formatCurrency(detailSeries[detailSeries.length - 1]!.balance, account.currency)}
            </span>
            {account.currency !== settings.baseCurrency && (
              <BaseApprox
                amount={detailSeries[detailSeries.length - 1]!.balance}
                currency={account.currency}
                date={detailSeries[detailSeries.length - 1]!.date}
                settings={settings}
                rateBook={rateBook}
              />
            )}
          </p>
        )}
        <GrowthChart
          data={detailSeries}
          currency={account.currency}
          mode="account"
          showGrowthLine={isGrowthKind(normalizeAccountKind(account.kind))}
          accounts={accounts}
          snapshots={snapshots}
          settings={settings}
          rateBook={rateBook}
          accountId={account.id}
        />
      </form>
    </EntityEditPanel>
  )
}

function CreditDetailStats({
  limit,
  graceMonths,
  available,
  currency,
  baseCurrency,
  rateBook,
  settings,
  asOf,
  linkedName,
}: {
  limit: number
  graceMonths: number
  available: number
  currency: string
  baseCurrency: string
  rateBook: RateBook
  settings: WalletSettings
  asOf: string
  linkedName?: string
}) {
  const debt = creditDebt(limit, available)
  const graceLabel =
    graceMonths === 1 ? '1 месяц' : graceMonths < 5 ? `${graceMonths} месяца` : `${graceMonths} месяцев`
  const showBase = currency !== baseCurrency
  return (
    <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
      <p>
        Лимит: <span className="font-medium">{formatCurrency(limit, currency)}</span>
        {showBase && (
          <BaseApprox amount={limit} currency={currency} date={asOf} settings={settings} rateBook={rateBook} />
        )}
      </p>
      <p>
        Грейс: <span className="font-medium">{graceLabel}</span>
        <span className="text-slate-500 dark:text-slate-400"> (траты N → конец N+{graceMonths})</span>
      </p>
      <p>
        Доступно:{' '}
        <span className="font-medium">{formatCurrency(available, currency)}</span>
        {showBase && (
          <BaseApprox
            amount={available}
            currency={currency}
            date={asOf}
            settings={settings}
            rateBook={rateBook}
          />
        )}
      </p>
      <p>
        Долг: <span className="font-medium">{formatCurrency(debt, currency)}</span>
        {showBase && (
          <BaseApprox amount={debt} currency={currency} date={asOf} settings={settings} rateBook={rateBook} />
        )}
      </p>
      {linkedName ? (
        <p className="text-slate-500 dark:text-slate-400">Float-кошелёк: {linkedName}</p>
      ) : (
        <p className="text-slate-500 dark:text-slate-400">Float-кошелёк не выбран</p>
      )}
    </div>
  )
}

function BaseApprox({
  amount,
  currency,
  date,
  settings,
  rateBook,
}: {
  amount: number
  currency: string
  date: string
  settings: WalletSettings
  rateBook: RateBook
}) {
  const pivot =
    resolvePivotForDate(date, rateBook) ??
    (settings.baseCurrency === 'RUB' ? settings.exchangeRates : null)
  const base = toBase(amount, currency, settings.baseCurrency, settings.exchangeRates, pivot)
  if (!Number.isFinite(base)) return null
  return (
    <span className="text-slate-500 dark:text-slate-400">
      {' '}
      ≈ {formatCurrency(base, settings.baseCurrency)}
    </span>
  )
}

const SWIPE_ACTIONS_WIDTH = 96

interface AccountListItemProps {
  account: Account
  balance: number | null
  balanceBase?: number | null
  baseCurrency: string
  stale?: AccountStaleStatus
  periodReturn?: AccountPeriodReturn | null
  isDragging: boolean
  isOver: boolean
  swipeOpen: boolean
  onSwipeOpenChange: (open: boolean) => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onOpenDetail: () => void
  onEdit: () => void
  onArchive: () => void
}

function AccountListItem({
  account,
  balance,
  balanceBase = null,
  baseCurrency,
  stale,
  periodReturn,
  isDragging,
  isOver,
  swipeOpen,
  onSwipeOpenChange,
  onDragOver,
  onDrop,
  onDragStart,
  onDragEnd,
  onOpenDetail,
  onEdit,
  onArchive,
}: AccountListItemProps) {
  const foregroundRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const startOffset = useRef(0)
  const swiping = useRef(false)
  const suppressClick = useRef(false)
  const [dragOffset, setDragOffset] = useState<number | null>(null)

  useEffect(() => {
    const el = foregroundRef.current
    if (!el) return

    function onTouchMove(e: TouchEvent) {
      if (window.matchMedia('(min-width: 640px)').matches) return
      const touch = e.touches[0]
      if (!touch) return

      const dx = touchStartX.current - touch.clientX
      const dy = Math.abs(touch.clientY - touchStartY.current)

      if (!swiping.current) {
        if (Math.abs(dx) < 8 && dy < 8) return
        if (dy > Math.abs(dx)) return
        swiping.current = true
        suppressClick.current = true
      }

      const next = Math.min(SWIPE_ACTIONS_WIDTH, Math.max(0, startOffset.current + dx))
      setDragOffset(next)
      e.preventDefault()
    }

    function onTouchEnd() {
      if (!swiping.current) return
      swiping.current = false
      setDragOffset((current) => {
        const offset = current ?? (swipeOpen ? SWIPE_ACTIONS_WIDTH : 0)
        onSwipeOpenChange(offset > SWIPE_ACTIONS_WIDTH / 2)
        return null
      })
      window.setTimeout(() => {
        suppressClick.current = false
      }, 0)
    }

    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return () => {
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [onSwipeOpenChange, swipeOpen])

  function handleTouchStart(e: ReactTouchEvent) {
    if (window.matchMedia('(min-width: 640px)').matches) return
    const touch = e.touches[0]
    if (!touch) return
    touchStartX.current = touch.clientX
    touchStartY.current = touch.clientY
    startOffset.current = swipeOpen ? SWIPE_ACTIONS_WIDTH : 0
    swiping.current = false
  }

  const mobileOffset = dragOffset ?? (swipeOpen ? SWIPE_ACTIONS_WIDTH : 0)
  const mobileTransform = mobileOffset > 0 ? `translateX(-${mobileOffset}px)` : undefined

  return (
    <li
      onDragOver={onDragOver}
      onDrop={onDrop}
      {...dataQa(`account-row-${account.id}`)}
      className={`relative overflow-hidden sm:flex sm:items-center sm:gap-2 sm:overflow-visible sm:px-4 sm:py-3 ${
        isDragging ? 'opacity-40' : ''
      } ${isOver ? 'bg-blue-50 dark:bg-blue-950/50' : ''}`}
    >
      <div className="absolute inset-y-0 right-0 flex items-center gap-1 px-2 sm:static sm:order-last sm:inset-auto sm:shrink-0 sm:px-0">
        <AccountIconButton
          title="Изменить"
          aria-label={`Изменить ${account.name}`}
          onClick={onEdit}
          {...dataQa(`account-edit-${account.id}`)}
        >
          <PencilIcon className="h-4 w-4" />
        </AccountIconButton>
        <AccountIconButton
          title={account.archived ? 'Вернуть из архива' : 'В архив'}
          aria-label={account.archived ? `Вернуть ${account.name} из архива` : `Архивировать ${account.name}`}
          onClick={onArchive}
          {...dataQa(`account-archive-${account.id}`)}
        >
          {account.archived ? (
            <UnarchiveIcon className="h-4 w-4" />
          ) : (
            <ArchiveIcon className="h-4 w-4" />
          )}
        </AccountIconButton>
      </div>

      <div
        ref={foregroundRef}
        onTouchStart={handleTouchStart}
        style={{ transform: mobileTransform }}
        className={`relative flex w-full touch-pan-y items-center gap-1 bg-white dark:bg-slate-900 px-2 py-2 transition-transform duration-200 ease-out sm:w-auto sm:flex-1 sm:translate-x-0 sm:bg-transparent sm:px-0 sm:py-0 ${
          dragOffset === null ? '' : '!duration-0'
        }`}
      >
        <div
          role="button"
          tabIndex={0}
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="flex h-9 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:bg-slate-800 hover:text-slate-600 dark:text-slate-400 active:cursor-grabbing"
          title="Перетащить"
          aria-label={`Перетащить ${account.name}`}
          {...dataQa(`account-drag-${account.id}`)}
        >
          <DragHandleIcon className="h-4 w-4" />
        </div>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          {...dataQa(`account-open-${account.id}`)}
          onClick={() => {
            if (suppressClick.current) return
            onOpenDetail()
          }}
        >
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: account.color }}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-slate-900 dark:text-slate-200">
              {account.name}
              <span className="ml-2 text-xs font-normal text-slate-400 dark:text-slate-500">
                {ACCOUNT_KIND_LABELS[account.kind].toLowerCase()}
              </span>
              {account.archived ? (
                <span className="ml-2 text-xs font-normal text-slate-400 dark:text-slate-500">архив</span>
              ) : null}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{account.currency}</span>
            {!account.archived && stale ? (
              stale.missingFromLatestCheckIn ? (
                <span
                  className="mt-1 inline-flex max-w-full items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium leading-tight text-amber-800 dark:bg-amber-400/15 dark:text-amber-300"
                  {...dataQa(`account-stale-${account.id}`)}
                >
                  <span className="truncate">
                    {stale.daysSinceRecorded == null || stale.daysSinceRecorded === 0
                      ? 'нет в последнем чек-ине'
                      : `нет в последнем чек-ине · ${formatStaleDays(stale.daysSinceRecorded)}`}
                  </span>
                </span>
              ) : (
                <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-slate-500">
                  {formatStaleDays(stale.daysSinceRecorded)}
                </span>
              )
            ) : null}
          </span>
          <span className="shrink-0 text-right tabular-nums">
            {balance == null ? (
              <span className="text-sm text-slate-400 dark:text-slate-500">нет данных</span>
            ) : (
              <>
                <span className="block text-sm font-medium text-slate-900 dark:text-slate-200">
                  {formatCurrency(balance, account.currency)}
                </span>
                {balanceBase != null ? (
                  <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                    ≈ {formatCurrency(balanceBase, baseCurrency)}
                  </span>
                ) : null}
                {account.kind === 'credit' && account.creditLimit != null ? (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    долг {formatCurrency(creditDebt(account.creditLimit, balance), account.currency)}
                  </span>
                ) : periodReturn?.growthPct != null || periodReturn?.nativeGrowthPct != null ? (
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    {periodReturn.growthPct != null ? (
                      <span className="block" {...dataQa(`account-return-${account.id}`)}>
                        {formatPercent(periodReturn.growthPct)}
                        {periodReturn.nativeGrowthPct != null ? ` ${baseCurrency}` : ''}
                        {periodReturn.annualizedPct != null
                          ? ` · ${formatPercent(periodReturn.annualizedPct)} год.`
                          : ''}
                      </span>
                    ) : null}
                    {periodReturn.nativeGrowthPct != null ? (
                      <span className="block" {...dataQa(`account-return-native-${account.id}`)}>
                        {formatPercent(periodReturn.nativeGrowthPct)} {account.currency}
                        {periodReturn.nativeAnnualizedPct != null
                          ? ` · ${formatPercent(periodReturn.nativeAnnualizedPct)} год.`
                          : ''}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </>
            )}
          </span>
        </button>
      </div>
    </li>
  )
}

function AccountIconButton({
  title,
  children,
  onClick,
  ...rest
}: {
  title: string
  children: ReactNode
  onClick: () => void
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'title' | 'children'>) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-600 transition hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-800 dark:hover:text-slate-200 dark:text-slate-200"
      {...rest}
    >
      {children}
    </button>
  )
}

function DragHandleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <circle cx="5" cy="3.5" r="1.25" />
      <circle cx="11" cy="3.5" r="1.25" />
      <circle cx="5" cy="8" r="1.25" />
      <circle cx="11" cy="8" r="1.25" />
      <circle cx="5" cy="12.5" r="1.25" />
      <circle cx="11" cy="12.5" r="1.25" />
    </svg>
  )
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8.5 17.5 4 19l1.5-4.5L16.5 3.5Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 5.5l4 4" />
    </svg>
  )
}

function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M6 7V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 7l1 14h12l1-14" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 11h4" />
    </svg>
  )
}

function UnarchiveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 6 12 3l3.5 3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M6 7V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 7l1 14h12l1-14" />
    </svg>
  )
}

