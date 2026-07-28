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
import { balanceOnDate, buildAccountSeries } from '../../engine/growthEngine'
import { ACCOUNT_COLORS, type Account, type AccountKind } from '../../types/wallet'
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABELS } from '../../lib/accountKinds'
import { CURRENCY_OPTIONS } from '../../lib/currency'
import { parseMoneyInput } from '../../lib/moneyInput'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Button, Card, EmptyState, Field, Input, MoneyInput, Select } from '../ui/FormControls'
import { StackPanel } from '../ui/StackPanel'
import { GrowthChart } from '../dashboard/GrowthChart'
import { formatCurrency, todayIsoDate } from '../../lib/format'

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

  const detailAccount = accounts.find((a) => a.id === detailId) ?? null
  const detailSeries = useMemo(
    () =>
      detailId
        ? buildAccountSeries(detailId, snapshots, transfers, accounts, settings, rateBook)
        : [],
    [detailId, snapshots, transfers, accounts, settings, rateBook],
  )

  function openCreate() {
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
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Счета</h1>
          <p className="text-sm text-slate-500">
            Перетащите за ⋮⋮, чтобы изменить порядок. На телефоне смахните счёт влево для действий.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Скрыть архив' : 'Показать архив'}
          </Button>
          <Button type="button" onClick={openCreate}>
            Добавить
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Счетов пока нет" description="Создайте первый счёт, чтобы фиксировать остатки." />
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-slate-100">
            {visible.map((account) => (
              <AccountListItem
                key={account.id}
                account={account}
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
      )}

      <StackPanel
        open={formOpen}
        title={editingId ? 'Счёт' : 'Новый счёт'}
        onClose={() => setFormOpen(false)}
        headerActions={
          <Button type="button" onClick={() => void handleSave()}>
            Сохранить
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Название">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Накопительный" />
          </Field>
          <Field label="Тип">
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value as AccountKind)}
            >
              {ACCOUNT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ACCOUNT_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Валюта">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
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
                />
              </Field>
              <Field label="Беспроцентный период">
                <Select value={graceMonths} onChange={(e) => setGraceMonths(e.target.value)}>
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
                >
                  <option value="">Не выбран</option>
                  {linkCandidates.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="text-xs text-slate-500">
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
                />
              ))}
            </div>
          </Field>
          {editingId && (
            <Button
              type="button"
              variant="danger"
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
      </StackPanel>

      <StackPanel
        open={!!detailAccount}
        title={detailAccount?.name ?? 'Счёт'}
        onClose={() => setDetailId(null)}
      >
        {detailAccount && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Валюта: {detailAccount.currency}.
              {detailAccount.kind === 'credit'
                ? ' На графике — доступный остаток лимита; прирост без переводов.'
                : ' Зелёная линия — прирост без переводов.'}
            </p>
            {detailAccount.kind === 'credit' && detailAccount.creditLimit != null && (
              <CreditDetailStats
                limit={detailAccount.creditLimit}
                graceMonths={detailAccount.graceMonths ?? 3}
                available={
                  detailSeries.length > 0
                    ? detailSeries[detailSeries.length - 1]!.balance
                    : (balanceOnDate(detailAccount.id, todayIsoDate(), snapshots) ?? 0)
                }
                currency={detailAccount.currency}
                linkedName={
                  detailAccount.linkedAccountId
                    ? accounts.find((a) => a.id === detailAccount.linkedAccountId)?.name
                    : undefined
                }
              />
            )}
            {detailSeries.length > 0 && detailAccount.kind !== 'credit' && (
              <p className="text-sm text-slate-700">
                Последний остаток:{' '}
                <span className="font-medium">
                  {formatCurrency(detailSeries[detailSeries.length - 1]!.balance, detailAccount.currency)}
                </span>
              </p>
            )}
            <GrowthChart
              data={detailSeries}
              currency={detailAccount.currency}
              mode="account"
              accounts={accounts}
              snapshots={snapshots}
              settings={settings}
              rateBook={rateBook}
              accountId={detailAccount.id}
            />
          </div>
        )}
      </StackPanel>
    </div>
  )
}

function CreditDetailStats({
  limit,
  graceMonths,
  available,
  currency,
  linkedName,
}: {
  limit: number
  graceMonths: number
  available: number
  currency: string
  linkedName?: string
}) {
  const debt = creditDebt(limit, available)
  const graceLabel =
    graceMonths === 1 ? '1 месяц' : graceMonths < 5 ? `${graceMonths} месяца` : `${graceMonths} месяцев`
  return (
    <div className="space-y-1 text-sm text-slate-700">
      <p>
        Лимит: <span className="font-medium">{formatCurrency(limit, currency)}</span>
      </p>
      <p>
        Грейс: <span className="font-medium">{graceLabel}</span>
        <span className="text-slate-500"> (траты N → конец N+{graceMonths})</span>
      </p>
      <p>
        Доступно:{' '}
        <span className="font-medium">{formatCurrency(available, currency)}</span>
      </p>
      <p>
        Долг: <span className="font-medium">{formatCurrency(debt, currency)}</span>
      </p>
      {linkedName ? (
        <p className="text-slate-500">Float-кошелёк: {linkedName}</p>
      ) : (
        <p className="text-slate-500">Float-кошелёк не выбран</p>
      )}
    </div>
  )
}

const SWIPE_ACTIONS_WIDTH = 96

interface AccountListItemProps {
  account: Account
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
      className={`relative overflow-hidden sm:flex sm:items-center sm:gap-2 sm:overflow-visible sm:px-4 sm:py-3 ${
        isDragging ? 'opacity-40' : ''
      } ${isOver ? 'bg-blue-50' : ''}`}
    >
      <div className="absolute inset-y-0 right-0 flex items-center gap-1 px-2 sm:static sm:order-last sm:inset-auto sm:shrink-0 sm:px-0">
        <AccountIconButton
          title="Изменить"
          aria-label={`Изменить ${account.name}`}
          onClick={onEdit}
        >
          <PencilIcon className="h-4 w-4" />
        </AccountIconButton>
        <AccountIconButton
          title={account.archived ? 'Вернуть из архива' : 'В архив'}
          aria-label={account.archived ? `Вернуть ${account.name} из архива` : `Архивировать ${account.name}`}
          onClick={onArchive}
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
        className={`relative flex w-full touch-pan-y items-center gap-1 bg-white px-2 py-2 transition-transform duration-200 ease-out sm:w-auto sm:flex-1 sm:translate-x-0 sm:bg-transparent sm:px-0 sm:py-0 ${
          dragOffset === null ? '' : '!duration-0'
        }`}
      >
        <div
          role="button"
          tabIndex={0}
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="flex h-9 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
          title="Перетащить"
          aria-label={`Перетащить ${account.name}`}
        >
          <DragHandleIcon className="h-4 w-4" />
        </div>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => {
            if (suppressClick.current) return
            onOpenDetail()
          }}
        >
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: account.color }}
          />
          <span className="min-w-0">
            <span className="block truncate font-medium text-slate-900">
              {account.name}
              <span className="ml-2 text-xs font-normal text-slate-400">
                {ACCOUNT_KIND_LABELS[account.kind].toLowerCase()}
              </span>
              {account.archived ? (
                <span className="ml-2 text-xs font-normal text-slate-400">архив</span>
              ) : null}
            </span>
            <span className="text-xs text-slate-500">{account.currency}</span>
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
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-800"
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

