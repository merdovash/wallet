import { useEffect, useMemo, useState } from 'react'
import { dataQa } from '../../lib/dataQa'
import {
  createOnboardingLine,
  draftsFromOnboardingLines,
  formatYearMonthRu,
  meanEnteredAmounts,
  onboardingMonthKeys,
  visibleMonthKeys,
  type FundOnboardingLine,
} from '../../lib/fundOnboarding'
import { formatCurrency } from '../../lib/format'
import { useRegisterPrimaryAction } from '../../lib/useRegisterPrimaryAction'
import type { Account } from '../../types/wallet'
import { Button, Card, EmptyState, Field, Input, MoneyInput, Select } from '../ui/FormControls'

export function FundsOnboarding({
  active,
  accounts,
  currency,
  asOfDate,
  onCreate,
}: {
  active: boolean
  accounts: Account[]
  currency: string
  asOfDate: string
  onCreate: (drafts: { name: string; monthlyTarget: number; priority: number; accountId: string }[]) => Promise<void>
}) {
  const monthKeys = useMemo(() => onboardingMonthKeys(asOfDate), [asOfDate])
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [lines, setLines] = useState<FundOnboardingLine[]>(() => [createOnboardingLine()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const selected = accounts.find((a) => a.id === accountId) ?? accounts[0]
  const displayCurrency = selected?.currency ?? currency

  useEffect(() => {
    if (!accounts.some((a) => a.id === accountId) && accounts[0]) {
      setAccountId(accounts[0].id)
    }
  }, [accounts, accountId])

  const drafts = useMemo(() => draftsFromOnboardingLines(lines), [lines])
  const canSave = drafts.length > 0 && !!accountId && !saving

  function patchLine(id: string, patch: Partial<Pick<FundOnboardingLine, 'name' | 'amounts'>>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line
        return {
          ...line,
          ...patch,
          amounts: patch.amounts ?? line.amounts,
        }
      }),
    )
  }

  function setAmount(id: string, month: string, value: string) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line
        return { ...line, amounts: { ...line.amounts, [month]: value } }
      }),
    )
  }

  async function handleSave() {
    if (!canSave) {
      setError('Укажите название статьи и хотя бы одну сумму больше нуля в среднем')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onCreate(drafts.map((d) => ({ ...d, accountId })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать фонды')
    } finally {
      setSaving(false)
    }
  }

  useRegisterPrimaryAction(active, {
    id: 'funds-onboarding-save',
    label: 'Сохранить',
    title: canSave ? 'Создать фонды по среднему расходу' : 'Заполните статьи расходов',
    scope: 'section',
    disabled: !canSave,
    onClick: () => void handleSave(),
  })

  if (accounts.length === 0) {
    return (
      <EmptyState
        title="Сначала создайте счёт"
        description="Фонды живут внутри счёта. Добавьте счёт на вкладке «Реестр», затем вернитесь сюда."
        dataQa="funds-empty-no-account"
      />
    )
  }

  return (
    <div className="space-y-4" {...dataQa('funds-onboarding')}>
      <Card className="!p-4 sm:!p-5" dataQa="funds-onboarding-intro">
        <p className="font-medium text-slate-900 dark:text-slate-200">Фондов пока нет</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Заполните основные статьи расходов за последние месяцы. Для каждой статьи появится прошлый месяц — как
          только укажете сумму (можно 0), откроется ещё более ранний. После сохранения создадим фонды с целью,
          равной среднему арифметическому. Сами суммы месяцев не хранятся.
        </p>
      </Card>

      {accounts.length > 0 ? (
        <Field label="Счёт" dataQa="funds-onboarding-account-field">
          <Select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            dataQa="funds-onboarding-account"
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {lines.map((line, index) => {
        const visible = visibleMonthKeys(line.amounts, monthKeys)
        const mean = meanEnteredAmounts(line.amounts)
        return (
          <Card key={line.id} className="!p-4 space-y-3" dataQa={`funds-onboarding-line-${index}`}>
            <div className="flex items-start justify-between gap-2">
              <Field label="Статья расхода" className="min-w-0 flex-1">
                <Input
                  value={line.name}
                  onChange={(e) => patchLine(line.id, { name: e.target.value })}
                  placeholder="Например, аренда"
                  dataQa={`funds-onboarding-name-${index}`}
                />
              </Field>
              {lines.length > 1 ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-6 shrink-0"
                  onClick={() => setLines((prev) => prev.filter((item) => item.id !== line.id))}
                  dataQa={`funds-onboarding-remove-${index}`}
                >
                  Убрать
                </Button>
              ) : null}
            </div>
            <ul className="space-y-2">
              {visible.map((month) => (
                <li key={month} className="flex flex-wrap items-center gap-2">
                  <span className="w-32 shrink-0 text-sm text-slate-600 dark:text-slate-300">
                    {formatYearMonthRu(month)}
                  </span>
                  <MoneyInput
                    value={line.amounts[month] ?? ''}
                    onChange={(value) => setAmount(line.id, month, value)}
                    allowNegative={false}
                    className="max-w-xs"
                    dataQa={`funds-onboarding-amount-${index}-${month}`}
                  />
                </li>
              ))}
            </ul>
            {mean != null && mean > 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Цель фонда: {formatCurrency(mean, displayCurrency)} в месяц (среднее)
              </p>
            ) : null}
          </Card>
        )
      })}

      <Button
        type="button"
        variant="secondary"
        onClick={() => setLines((prev) => [...prev, createOnboardingLine()])}
        dataQa="funds-onboarding-add-line"
      >
        Ещё статья расхода
      </Button>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Button
        type="button"
        onClick={() => void handleSave()}
        disabled={!canSave}
        dataQa="funds-onboarding-save"
      >
        {saving ? 'Сохранение…' : 'Сохранить'}
      </Button>
    </div>
  )
}
