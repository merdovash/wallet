import { useState } from 'react'
import {
  formatCurrency,
  formatDateDisplay,
  formatPercent,
  signedAmount,
} from '../../lib/format'
import type { GrowthFxMode } from '../../engine/growthEngine'
import type {
  PeriodReturnAccountLine,
  PeriodReturnSummary,
  PeriodReturnTransferLine,
} from '../../lib/monthlyReturns'
import { pctOfAllMass } from '../../lib/monthlyReturns'
import { StackPanel } from '../ui/StackPanel'
import { fxModeLabel } from '../ui/FxModeToggle'

export type ReturnBreakdownFocus =
  | 'growth'
  | 'growthPct'
  | 'annualizedPct'
  | 'topUp'
  | null

interface ReturnBreakdownPanelProps {
  open: boolean
  onClose: () => void
  focus: ReturnBreakdownFocus
  periodReturn: PeriodReturnSummary | null
  currency: string
  /** Override panel title (e.g. daily breakdown). */
  title?: string
  fxMode?: GrowthFxMode
}

function tone(value: number): string {
  if (value > 0) return 'text-emerald-700 dark:text-emerald-400'
  if (value < 0) return 'text-red-600'
  return 'text-slate-800 dark:text-slate-200'
}

export function ReturnBreakdownPanel({
  open,
  onClose,
  focus,
  periodReturn,
  currency,
  title: titleOverride,
  fxMode = 'withFx',
}: ReturnBreakdownPanelProps) {
  const withoutFx = fxMode === 'withoutFx'
  const title =
    titleOverride ??
    (focus === 'annualizedPct'
      ? 'Расчёт: в годовых'
      : focus === 'growth'
        ? withoutFx
          ? 'Расшифровка: прирост без курса'
          : 'Расшифровка: прирост'
        : focus === 'topUp'
          ? 'Расшифровка: чистый поток'
          : 'Расчёт: прирост %')

  const includedSorted = periodReturn
    ? [...periodReturn.includedAccounts].sort((a, b) => {
        if (focus === 'topUp') {
          return Math.abs(b.transfersBase) - Math.abs(a.transfersBase) || a.name.localeCompare(b.name)
        }
        if (withoutFx && periodReturn.growthFx) {
          const qa = periodReturn.growthFx.accounts.find((x) => x.accountId === a.accountId)
          const qb = periodReturn.growthFx.accounts.find((x) => x.accountId === b.accountId)
          const ga = qa?.quantityEffectBase ?? a.growthBase
          const gb = qb?.quantityEffectBase ?? b.growthBase
          return gb - ga || a.name.localeCompare(b.name)
        }
        return b.growthBase - a.growthBase || a.name.localeCompare(b.name)
      })
    : []

  return (
    <StackPanel open={open} title={title} onClose={onClose}>
      {!periodReturn ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Недостаточно данных: нужны минимум два чек-ина и счета типа накопления (фонд), вклад
          или инвестиции.
        </p>
      ) : focus === 'growth' ? (
        <GrowthMovementsView
          periodReturn={periodReturn}
          accounts={includedSorted}
          currency={currency}
          fxMode={fxMode}
        />
      ) : (
        <PercentBreakdownView
          focus={focus}
          periodReturn={periodReturn}
          includedSorted={includedSorted}
          currency={currency}
          fxMode={fxMode}
        />
      )}
    </StackPanel>
  )
}

/** Absolute growth: movements on included accounts — growth vs transfers. */
function GrowthMovementsView({
  periodReturn,
  accounts,
  currency,
  fxMode,
}: {
  periodReturn: PeriodReturnSummary
  accounts: PeriodReturnAccountLine[]
  currency: string
  fxMode: GrowthFxMode
}) {
  const withoutFx = fxMode === 'withoutFx'
  const qtyByAccount = new Map(
    (periodReturn.growthFx?.accounts ?? []).map((a) => [a.accountId, a]),
  )
  const displayGrowth = withoutFx
    ? (periodReturn.quantityEffectBase ?? periodReturn.growth)
    : periodReturn.growth
  const investPct = pctOfAllMass(displayGrowth, periodReturn.startTotal)
  const allMassPct = pctOfAllMass(displayGrowth, periodReturn.startTotalAllMass)
  const dietzPct = withoutFx
    ? (periodReturn.quantityEffectPct ?? periodReturn.growthPct)
    : periodReturn.growthPct
  const totalGrowth = accounts.reduce((s, a) => {
    if (withoutFx) {
      return s + (qtyByAccount.get(a.accountId)?.quantityEffectBase ?? a.growthBase)
    }
    return s + a.growthBase
  }, 0)
  const totalTransfers = accounts.reduce((s, a) => s + a.transfersBase, 0)
  const fxEffect = periodReturn.growthFx?.fxEffectBase ?? 0
  const [transfersOpen, setTransfersOpen] = useState(false)
  const hasTransfers = periodReturn.transferMovements.length > 0

  return (
    <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
      <div
        className={`rounded-lg border px-3 py-2 text-xs ${
          withoutFx
            ? 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
            : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
        }`}
      >
        <p className="font-semibold">
          Режим: {fxModeLabel(fxMode)}
        </p>
        <p className="mt-1">
          {withoutFx
            ? 'Курсовой эффект на начальный остаток не входит в прирост: считается только дельта в валюте счёта × курс на конец периода.'
            : 'Курсовой эффект входит в прирост: переоценка начального остатка из‑за изменения курса учитывается.'}
        </p>
        <p className="mt-1">
          Фонд, вклад и инвестиции за период{' '}
          {formatDateDisplay(periodReturn.startDate)} → {formatDateDisplay(periodReturn.endDate)}.
        </p>
      </div>

      <dl className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <Row
          label="Прирост"
          value={signedAmount(displayGrowth, currency)}
          valueClassName={tone(displayGrowth)}
          hint={
            withoutFx
              ? 'Σ (дельта в валюте × курс дня)'
              : 'сумма роста по учитываемым счетам'
          }
          emphasize
        />
        <Row
          label="Прирост % от инвест"
          value={formatPercent(investPct)}
          valueClassName={tone(investPct ?? 0)}
          hint={`прирост ÷ инвест-счета на начало (${formatCurrency(periodReturn.startTotal, currency)})`}
          emphasize
        />
        <Row
          label="Прирост % от всего"
          value={formatPercent(allMassPct)}
          valueClassName={tone(allMassPct ?? 0)}
          hint={`прирост ÷ весь остаток на начало (${formatCurrency(periodReturn.startTotalAllMass, currency)})`}
          emphasize
        />
        <Row
          label="Modified Dietz %"
          value={formatPercent(dietzPct)}
          valueClassName={tone(dietzPct ?? 0)}
          hint="с учётом взвешенных пополнений"
        />
        {!withoutFx ? (
          <Row
            label="Курсовой эффект"
            value={signedAmount(fxEffect, currency)}
            valueClassName={tone(fxEffect)}
            hint="входит в прирост выше"
          />
        ) : (
          <Row
            label="Курсовой эффект"
            value={signedAmount(fxEffect, currency)}
            valueClassName="text-slate-500 dark:text-slate-400"
            hint="не входит в прирост в этом режиме"
          />
        )}
        <Row
          label="Переводы (чистые)"
          value={signedAmount(totalTransfers, currency)}
          valueClassName={tone(totalTransfers)}
          hint={
            hasTransfers
              ? 'нажмите сумму, чтобы открыть список'
              : 'пополнения (+) и снятия (−) по этим счетам'
          }
          onValueClick={hasTransfers ? () => setTransfersOpen((v) => !v) : undefined}
          valueOpen={transfersOpen}
        />
        <Row
          label="Изменение остатков"
          value={signedAmount(periodReturn.endTotal - periodReturn.startTotal, currency)}
          hint="прирост + переводы (+ курс при полном режиме)"
        />
      </dl>

      {transfersOpen && hasTransfers ? (
        <TransferMovementsSection
          transfers={periodReturn.transferMovements}
          currency={currency}
        />
      ) : null}

      {periodReturn.growthFx && !withoutFx ? (
        <GrowthFxSection breakdown={periodReturn.growthFx} currency={currency} />
      ) : null}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          По счетам
        </h3>
        {accounts.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">Нет учитываемых счетов</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            {accounts.map((acc) => {
              const qty = qtyByAccount.get(acc.accountId)
              const growthShown = withoutFx
                ? (qty?.quantityEffectBase ?? acc.growthBase)
                : acc.growthBase
              return (
                <li key={acc.accountId} className="space-y-1.5 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900 dark:text-slate-200">
                        {acc.name}
                      </span>
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                        {acc.kindLabel}
                        {acc.kind === 'fund' ? ' · накопления' : ''} · {acc.currency}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {formatCurrency(acc.startBalance, acc.currency)} →{' '}
                      {formatCurrency(acc.endBalance, acc.currency)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                    <MovementChip
                      label={withoutFx ? 'Δ×курс' : 'Прирост'}
                      value={signedAmount(growthShown, currency)}
                      className={tone(growthShown)}
                    />
                    <MovementChip
                      label="Переводы"
                      value={signedAmount(acc.transfersBase, currency)}
                      className={tone(acc.transfersBase)}
                    />
                    <MovementChip
                      label="Δ остатка"
                      value={signedAmount(acc.balanceChangeBase, currency)}
                      className="text-slate-700 dark:text-slate-300"
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {accounts.length > 0 ? (
          <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            Итого прирост по счетам: {signedAmount(totalGrowth, currency)}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function GrowthFxSection({
  breakdown,
  currency,
}: {
  breakdown: NonNullable<PeriodReturnSummary['growthFx']>
  currency: string
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Заработано vs курс
      </h3>
      <dl className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <Row
          label="Заработано в валютах счетов"
          value={signedAmount(breakdown.quantityEffectBase, currency)}
          valueClassName={tone(breakdown.quantityEffectBase)}
          hint="прирост в валюте счёта × курс на конец периода"
          emphasize
        />
        <Row
          label="Курсовой эффект"
          value={signedAmount(breakdown.fxEffectBase, currency)}
          valueClassName={tone(breakdown.fxEffectBase)}
          hint="начальный остаток × (курс_конец − курс_начало)"
          emphasize
        />
        {Math.abs(breakdown.transferTimingBase) >= 0.01 ? (
          <Row
            label="Даты переводов"
            value={signedAmount(breakdown.transferTimingBase, currency)}
            valueClassName={tone(breakdown.transferTimingBase)}
            hint="разница курсов переводов и конца периода"
          />
        ) : null}
      </dl>
      {breakdown.accounts.some((a) => a.currency !== currency && Math.abs(a.fxEffectBase) > 0.01) ? (
        <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          {breakdown.accounts
            .filter((a) => Math.abs(a.growthBase) > 0.001 || Math.abs(a.fxEffectBase) > 0.001)
            .map((acc) => (
              <li key={acc.accountId} className="px-3 py-2 text-xs">
                <div className="flex justify-between gap-3 font-medium text-slate-900 dark:text-slate-200">
                  <span className="truncate">{acc.name}</span>
                  <span className="shrink-0 tabular-nums">{signedAmount(acc.growthBase, currency)}</span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>в валюте: {signedAmount(acc.quantityEffectBase, currency)}</span>
                  <span>курс: {signedAmount(acc.fxEffectBase, currency)}</span>
                </div>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  )
}

function TransferMovementsSection({
  transfers,
  currency,
}: {
  transfers: PeriodReturnTransferLine[]
  currency: string
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Переводы
      </h3>
      {transfers.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">За период переводов по учитываемым счетам не было</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          {transfers.map((t) => (
            <li
              key={t.id}
              className="flex items-start justify-between gap-3 px-3 py-2 text-xs"
            >
              <span className="min-w-0">
                <span className="block font-medium text-slate-900 dark:text-slate-200">
                  {t.fromName} → {t.toName}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {formatDateDisplay(t.date)}
                  {t.crossesGrowthBoundary ? ' · через границу портфеля' : ' · внутри портфеля'}
                </span>
              </span>
              <span className="shrink-0 tabular-nums font-medium text-slate-800 dark:text-slate-200">
                {formatCurrency(t.amountBase, currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MovementChip({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="rounded-md bg-slate-50 dark:bg-slate-800/60 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`mt-0.5 font-medium tabular-nums ${className ?? ''}`}>{value}</p>
    </div>
  )
}

function PercentBreakdownView({
  focus,
  periodReturn,
  includedSorted,
  currency,
  fxMode,
}: {
  focus: Exclude<ReturnBreakdownFocus, 'growth'>
  periodReturn: PeriodReturnSummary
  includedSorted: PeriodReturnAccountLine[]
  currency: string
  fxMode: GrowthFxMode
}) {
  const withoutFx = fxMode === 'withoutFx'
  const displayGrowth = withoutFx
    ? (periodReturn.quantityEffectBase ?? periodReturn.growth)
    : periodReturn.growth
  const displayPct = withoutFx
    ? (periodReturn.quantityEffectPct ?? periodReturn.growthPct)
    : periodReturn.growthPct
  const investPct = pctOfAllMass(displayGrowth, periodReturn.startTotal)
  const allMassPct = pctOfAllMass(displayGrowth, periodReturn.startTotalAllMass)
  const boundaryTransfers = periodReturn.transferMovements.filter((t) => t.crossesGrowthBoundary)
  const [transfersOpen, setTransfersOpen] = useState(false)
  const canOpenTransfers = focus === 'topUp' && boundaryTransfers.length > 0

  return (
    <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
      <div
        className={`rounded-lg border px-3 py-2 text-xs ${
          withoutFx
            ? 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
            : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
        }`}
      >
        <p className="font-semibold">
          Процент прироста · {fxModeLabel(fxMode)}
        </p>
        <p className="mt-1">
          Числитель — прирост фонда / вклада / инвестиций ({periodReturn.accountCount} сч.), без
          пополнений. Два знаменателя: сумма инвест-счетов и весь остаток на начало.
        </p>
        <p className="mt-1">
          {withoutFx
            ? 'Курсовой эффект на начальный остаток не влияет на прирост и % в этом режиме.'
            : 'Курсовой эффект влияет на прирост и % (переоценка остатка из‑за курса входит в расчёт).'}
        </p>
      </div>

      <dl className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <Row
          label="Период"
          value={`${formatDateDisplay(periodReturn.startDate)} → ${formatDateDisplay(periodReturn.endDate)}`}
        />
        <Row label="Дней" value={String(periodReturn.days)} />
        <Row
          label="Инвест-счета на начало"
          value={formatCurrency(periodReturn.startTotal, currency)}
          hint="фонды, вклады и инвестиции"
        />
        <Row
          label="Весь остаток на начало"
          value={formatCurrency(periodReturn.startTotalAllMass, currency)}
          hint="все счета, включая оперативные / наличку / кредит"
        />
        <Row
          label="Капитал портфеля на конец"
          value={formatCurrency(periodReturn.endTotal, currency)}
        />
        <Row
          label="Чистый поток"
          value={signedAmount(periodReturn.netFlow, currency)}
          hint={
            canOpenTransfers
              ? 'нажмите сумму, чтобы открыть список переводов'
              : 'переводы в/из портфеля роста (доход/расход не входят)'
          }
          emphasize={focus === 'topUp'}
          onValueClick={canOpenTransfers ? () => setTransfersOpen((v) => !v) : undefined}
          valueOpen={transfersOpen}
        />
        <Row
          label="Взвешенный капитал"
          value={formatCurrency(periodReturn.weightedCapital, currency)}
          hint="начало + потоки × доля оставшихся дней"
        />
        <Row
          label="Прирост"
          value={signedAmount(displayGrowth, currency)}
          hint={withoutFx ? 'Σ (дельта × курс дня)' : 'конец − начало − поток'}
        />
        <Row
          label="Прирост % от инвест"
          value={formatPercent(investPct)}
          hint="прирост ÷ инвест-счета на начало"
          emphasize={focus === 'growthPct'}
        />
        <Row
          label="Прирост % от всего"
          value={formatPercent(allMassPct)}
          hint="прирост ÷ весь остаток на начало"
          emphasize={focus === 'growthPct'}
        />
        <Row
          label="Modified Dietz %"
          value={formatPercent(displayPct)}
          hint="прирост ÷ взвешенный капитал портфеля"
          emphasize={focus === 'growthPct'}
        />
        <Row
          label="TWR"
          value={formatPercent(periodReturn.twrPct)}
          hint="∏(1+rᵢ)−1 по под-периодам между чек-инами"
          emphasize={focus === 'growthPct'}
        />
        <Row
          label="В годовых"
          value={formatPercent(periodReturn.annualizedPct)}
          hint={
            periodReturn.days > 0
              ? `(1 + Dietz%) ^ (365 ÷ ${periodReturn.days}) − 1`
              : undefined
          }
          emphasize={focus === 'annualizedPct'}
        />
        <Row
          label="TWR, в годовых"
          value={formatPercent(periodReturn.twrAnnualizedPct)}
          hint={
            periodReturn.days > 0
              ? `(1 + TWR) ^ (365 ÷ ${periodReturn.days}) − 1`
              : undefined
          }
          emphasize={focus === 'annualizedPct'}
        />
      </dl>

      {focus === 'annualizedPct' && periodReturn.benchmarks ? (
        <BenchmarksSection
          portfolioAnnualizedPct={periodReturn.annualizedPct}
          benchmarks={periodReturn.benchmarks}
          days={periodReturn.days}
        />
      ) : null}

      {focus === 'growthPct' && periodReturn.twrSubPeriods.length > 0 ? (
        <TwrSubPeriodsSection subPeriods={periodReturn.twrSubPeriods} currency={currency} />
      ) : null}

      {periodReturn.flows.length > 0 ? (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Потоки капитала
          </h3>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            {periodReturn.flows.map((flow, index) => (
              <li
                key={`${flow.date}-${flow.amount}-${index}`}
                className="flex items-start justify-between gap-3 px-3 py-2 text-xs"
              >
                <span>
                  <span className="block font-medium text-slate-900 dark:text-slate-200">
                    {formatDateDisplay(flow.date)}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    вес {(flow.weight * 100).toFixed(0).replace('.', ',')}% периода
                  </span>
                </span>
                <span className="shrink-0 text-right tabular-nums text-slate-700 dark:text-slate-300">
                  <span className="block">{signedAmount(flow.amount, currency)}</span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    → {signedAmount(flow.weightedAmount, currency)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {focus === 'topUp' && transfersOpen && boundaryTransfers.length > 0 ? (
        <TransferMovementsSection transfers={boundaryTransfers} currency={currency} />
      ) : null}

      <AccountSection
        title={focus === 'topUp' ? 'Счета по величине чистого потока' : 'Включены в расчёт'}
        tone="include"
        accounts={includedSorted}
        currency={currency}
        showDelta={focus === 'topUp'}
      />
      <AccountSection
        title="Не учитываются"
        tone="exclude"
        accounts={periodReturn.excludedAccounts}
        currency={currency}
      />

      {focus === 'topUp' && (
        <FormulaBlock
          title="Формула чистого потока"
          lines={[
            'пополнение = перевод из обычного счёта в портфель роста',
            'вывод = перевод из портфеля роста в обычный счёт',
            'чистый поток = пополнения − выводы',
          ]}
        />
      )}
      {focus === 'growthPct' && (
        <FormulaBlock
          title="Формула прироста %"
          lines={[
            'капитал = сумма фондов/накоплений + вкладов + инвестиций',
            'поток = переводы в/из портфеля роста (доход и расход с оперативных не входят)',
            'прирост = капитал_конец − капитал_начало − поток',
            'вес потока = (дни_после_даты) ÷ дней_периода',
            'взвеш.капитал = начало + Σ(поток × вес)',
            'прирост% = прирост ÷ взвеш.капитал',
          ]}
        />
      )}
      {focus === 'annualizedPct' && (
        <FormulaBlock
          title="Формула годовых"
          lines={[
            'Сначала считается прирост% за период только по фондам/вкладам/инвестициям (Modified Dietz).',
            `годовых = (1 + прирост%)^(365/${periodReturn.days || 'N'}) − 1`,
          ]}
        />
      )}
    </div>
  )
}

function AccountSection({
  title,
  tone: sectionTone,
  accounts,
  currency,
  showDelta = false,
}: {
  title: string
  tone: 'include' | 'exclude'
  accounts: PeriodReturnAccountLine[]
  currency: string
  showDelta?: boolean
}) {
  if (accounts.length === 0) {
    return (
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Нет счетов</p>
      </div>
    )
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        {accounts.map((acc) => {
          const delta = showDelta ? acc.transfersBase : acc.endBase - acc.startBase
          return (
            <li key={acc.accountId} className="flex items-start justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-900 dark:text-slate-200">{acc.name}</span>
                <span
                  className={`text-[11px] ${
                    sectionTone === 'include' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {acc.kindLabel}
                  {acc.kind === 'fund' ? ' · накопления' : ''} · {acc.currency}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs tabular-nums text-slate-600 dark:text-slate-400">
                {showDelta ? (
                  <>
                    <span className={`block ${tone(delta)}`}>{signedAmount(delta, currency)}</span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {formatCurrency(acc.startBase, currency)} →{' '}
                      {formatCurrency(acc.endBase, currency)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block">{formatCurrency(acc.endBase, currency)}</span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      было {formatCurrency(acc.startBase, currency)}
                    </span>
                  </>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Row({
  label,
  value,
  hint,
  emphasize = false,
  valueClassName,
  onValueClick,
  valueOpen = false,
}: {
  label: string
  value: string
  hint?: string
  emphasize?: boolean
  valueClassName?: string
  onValueClick?: () => void
  valueOpen?: boolean
}) {
  const valueClasses = `shrink-0 text-right font-medium tabular-nums ${valueClassName ?? 'text-slate-900 dark:text-slate-200'}`
  return (
    <div
      className={`flex items-start justify-between gap-3 px-3 py-2.5 ${
        emphasize ? 'bg-blue-50 dark:bg-blue-950/50' : ''
      }`}
    >
      <dt className="min-w-0 text-slate-500 dark:text-slate-400">
        <span className="block">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-slate-500">{hint}</span> : null}
      </dt>
      <dd className={valueClasses}>
        {onValueClick ? (
          <button
            type="button"
            onClick={onValueClick}
            className="inline-flex items-center gap-1 rounded-md underline decoration-dotted underline-offset-2 hover:text-blue-700 dark:hover:text-blue-400"
          >
            {value}
            <span className="text-[10px] text-slate-400 dark:text-slate-500" aria-hidden>
              {valueOpen ? '▾' : '▸'}
            </span>
          </button>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}

function FormulaBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
      <ul className="mt-2 space-y-1 font-mono text-xs text-slate-700 dark:text-slate-300">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  )
}

function TwrSubPeriodsSection({
  subPeriods,
  currency,
}: {
  subPeriods: PeriodReturnSummary['twrSubPeriods']
  currency: string
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        TWR по чек-инам
      </h3>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        {subPeriods.map((sp) => (
          <li key={`${sp.startDate}-${sp.endDate}`} className="px-3 py-2 text-xs">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block font-medium text-slate-900 dark:text-slate-200">
                  {formatDateDisplay(sp.startDate)} → {formatDateDisplay(sp.endDate)}
                </span>
                {Math.abs(sp.netFlow) >= 0.01 ? (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    поток {signedAmount(sp.netFlow, currency)}
                  </span>
                ) : null}
              </span>
              <span className={`shrink-0 font-medium tabular-nums ${tone(sp.subReturnPct ?? 0)}`}>
                {formatPercent(sp.subReturnPct)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function BenchmarksSection({
  portfolioAnnualizedPct,
  benchmarks,
  days,
}: {
  portfolioAnnualizedPct: number | null
  benchmarks: NonNullable<PeriodReturnSummary['benchmarks']>
  days: number
}) {
  const hasKeyRate = benchmarks.keyRateAnnualizedPct != null
  const hasUsd =
    benchmarks.usdPeriodPct != null ||
    benchmarks.usdAnnualizedPct != null ||
    benchmarks.usdStartRate != null
  if (!hasKeyRate && !hasUsd) return null

  const portfolioLabel = formatPercent(portfolioAnnualizedPct)
  const vsKeyRate =
    portfolioAnnualizedPct != null && benchmarks.vsKeyRatePct != null
      ? benchmarks.vsKeyRatePct
      : null
  const vsUsd =
    portfolioAnnualizedPct != null && benchmarks.vsUsdPct != null ? benchmarks.vsUsdPct : null

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Бенчмарки
      </h3>
      <dl className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <Row label="Портфель, в годовых" value={portfolioLabel} emphasize />
        {hasKeyRate ? (
          <>
            <Row
              label="Ключевая ставка"
              value={formatPercent(benchmarks.keyRateAnnualizedPct)}
              hint="из настроек"
            />
            <Row
              label="Портфель − ключевая"
              value={formatPercent(vsKeyRate)}
              valueClassName={tone(vsKeyRate ?? 0)}
              hint="положительное — выше ставки"
              emphasize
            />
          </>
        ) : null}
        {hasUsd ? (
          <>
            <Row
              label="USD за период"
              value={formatPercent(benchmarks.usdPeriodPct)}
              hint={
                benchmarks.usdStartRate != null && benchmarks.usdEndRate != null
                  ? `${benchmarks.usdStartRate.toFixed(2)} → ${benchmarks.usdEndRate.toFixed(2)} ₽`
                  : undefined
              }
            />
            <Row
              label="USD, в годовых"
              value={formatPercent(benchmarks.usdAnnualizedPct)}
              hint={
                days >= 30
                  ? `(1 + USD%) ^ (365 ÷ ${days}) − 1`
                  : 'период короче 30 дней — не аннуализируем'
              }
            />
            <Row
              label="Портфель − USD"
              value={formatPercent(vsUsd)}
              valueClassName={tone(vsUsd ?? 0)}
              hint="положительное — обогнали рост доллара"
              emphasize
            />
          </>
        ) : null}
      </dl>
    </div>
  )
}
