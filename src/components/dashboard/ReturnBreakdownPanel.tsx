import {
  formatCurrency,
  formatDateDisplay,
  formatPercent,
  signedAmount,
} from '../../lib/format'
import type {
  PeriodReturnAccountLine,
  PeriodReturnSummary,
  PeriodReturnTransferLine,
} from '../../lib/monthlyReturns'
import { StackPanel } from '../ui/StackPanel'

export type ReturnBreakdownFocus =
  | 'growth'
  | 'growthPct'
  | 'annualizedPct'
  | 'annualizedPctOfAllMass'
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
}

function tone(value: number): string {
  if (value > 0) return 'text-emerald-700'
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
}: ReturnBreakdownPanelProps) {
  const title =
    titleOverride ??
    (focus === 'annualizedPctOfAllMass'
      ? 'Расчёт: годовых от всей массы'
      : focus === 'annualizedPct'
        ? 'Расчёт: в годовых'
        : focus === 'growth'
          ? 'Расшифровка: прирост'
          : focus === 'topUp'
            ? 'Расшифровка: чистый поток'
            : 'Расчёт: прирост %')

  const includedSorted = periodReturn
    ? [...periodReturn.includedAccounts].sort(
        (a, b) =>
          (focus === 'topUp'
            ? Math.abs(b.transfersBase) - Math.abs(a.transfersBase)
            : b.growthBase - a.growthBase) || a.name.localeCompare(b.name),
      )
    : []

  return (
    <StackPanel open={open} title={title} onClose={onClose}>
      {!periodReturn ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Недостаточно данных: нужны минимум два чек-ина и счета типа накопления (фонд), вклад
          или инвестиции.
        </p>
      ) : focus === 'growth' ? (
        <GrowthMovementsView periodReturn={periodReturn} accounts={includedSorted} currency={currency} />
      ) : (
        <PercentBreakdownView
          focus={focus}
          periodReturn={periodReturn}
          includedSorted={includedSorted}
          currency={currency}
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
}: {
  periodReturn: PeriodReturnSummary
  accounts: PeriodReturnAccountLine[]
  currency: string
}) {
  const totalGrowth = accounts.reduce((s, a) => s + a.growthBase, 0)
  const totalTransfers = accounts.reduce((s, a) => s + a.transfersBase, 0)

  return (
    <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
        <p className="font-semibold">Движения по учитываемым счетам</p>
        <p className="mt-1">
          Фонд, вклад и инвестиции за период{' '}
          {formatDateDisplay(periodReturn.startDate)} → {formatDateDisplay(periodReturn.endDate)}.
          Изменение остатка = прирост + переводы.
        </p>
      </div>

      <dl className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <Row
          label="Прирост"
          value={signedAmount(periodReturn.growth, currency)}
          valueClassName={tone(periodReturn.growth)}
          hint="сумма роста по учитываемым счетам"
          emphasize
        />
        <Row
          label="Относительный к общей массе"
          value={formatPercent(periodReturn.growthPctOfAllMass, 3)}
          valueClassName={tone(periodReturn.growthPctOfAllMass ?? 0)}
          hint={`прирост ÷ вся масса на начало (${formatCurrency(periodReturn.startTotalAllMass, currency)})`}
          emphasize
        />
        <Row
          label="Переводы (чистые)"
          value={signedAmount(totalTransfers, currency)}
          valueClassName={tone(totalTransfers)}
          hint="пополнения (+) и снятия (−) по этим счетам"
        />
        <Row
          label="Изменение остатков"
          value={signedAmount(periodReturn.endTotal - periodReturn.startTotal, currency)}
          hint="прирост + переводы"
        />
      </dl>

      {periodReturn.growthFx ? (
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
            {accounts.map((acc) => (
              <li key={acc.accountId} className="space-y-1.5 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900 dark:text-slate-100">{acc.name}</span>
                    <span className="text-[11px] text-emerald-700">
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
                    label="Прирост"
                    value={signedAmount(acc.growthBase, currency)}
                    className={tone(acc.growthBase)}
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
            ))}
          </ul>
        )}
        {accounts.length > 0 ? (
          <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            Итого прирост по счетам: {signedAmount(totalGrowth, currency)}
          </p>
        ) : null}
      </div>

      <TransferMovementsSection
        transfers={periodReturn.transferMovements}
        currency={currency}
      />
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
                <div className="flex justify-between gap-3 font-medium text-slate-900 dark:text-slate-100">
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
                <span className="block font-medium text-slate-900 dark:text-slate-100">
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
}: {
  focus: Exclude<ReturnBreakdownFocus, 'growth'>
  periodReturn: PeriodReturnSummary
  includedSorted: PeriodReturnAccountLine[]
  currency: string
}) {
  const showAllMass = focus === 'annualizedPctOfAllMass'
  return (
    <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
        <p className="font-semibold">
          {showAllMass ? 'Годовых от всей массы' : 'Обычный процент прироста'}
        </p>
        <p className="mt-1">
          {showAllMass
            ? `Числитель — прирост портфеля роста (фонды, вклады, инвестиции; ${periodReturn.accountCount} сч.). Знаменатель — вся масса денег на начало периода.`
            : `Считается только от фондов, вкладов и инвестиций — ${periodReturn.accountCount} счёт(а). Наличка, оперативные и кредитки в капитал и процент не входят.`}
        </p>
      </div>

      <dl className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <Row
          label="Период"
          value={`${formatDateDisplay(periodReturn.startDate)} → ${formatDateDisplay(periodReturn.endDate)}`}
        />
        <Row label="Дней" value={String(periodReturn.days)} />
        <Row
          label="Капитал портфеля на начало"
          value={formatCurrency(periodReturn.startTotal, currency)}
          hint="только фонды, вклады и инвестиции"
        />
        <Row
          label="Капитал портфеля на конец"
          value={formatCurrency(periodReturn.endTotal, currency)}
        />
        <Row
          label="Чистый поток"
          value={signedAmount(periodReturn.netFlow, currency)}
          hint="переводы в/из портфеля роста (доход/расход не входят)"
          emphasize={focus === 'topUp'}
        />
        <Row
          label="Взвешенный капитал"
          value={formatCurrency(periodReturn.weightedCapital, currency)}
          hint="начало + потоки × доля оставшихся дней"
        />
        <Row
          label="Прирост"
          value={signedAmount(periodReturn.growth, currency)}
          hint="конец − начало − поток"
        />
        <Row
          label="Прирост %"
          value={formatPercent(periodReturn.growthPct)}
          hint="прирост ÷ взвешенный капитал портфеля (Modified Dietz)"
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
              ? `(1 + прирост%) ^ (365 ÷ ${periodReturn.days}) − 1`
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
        {showAllMass ? (
          <>
            <Row
              label="Вся масса на начало"
              value={formatCurrency(periodReturn.startTotalAllMass, currency)}
              hint="все счета, включая оперативные / наличку / кредит"
            />
            <Row
              label="Прирост % от массы"
              value={formatPercent(periodReturn.growthPctOfAllMass)}
              hint="прирост портфеля ÷ вся масса на начало"
            />
            <Row
              label="Годовых от массы"
              value={formatPercent(periodReturn.annualizedPctOfAllMass)}
              hint={
                periodReturn.days > 0
                  ? `(1 + прирост%_от_массы) ^ (365 ÷ ${periodReturn.days}) − 1`
                  : undefined
              }
              emphasize
            />
          </>
        ) : null}
      </dl>

      {(focus === 'annualizedPct' || focus === 'annualizedPctOfAllMass') &&
      periodReturn.benchmarks ? (
        <BenchmarksSection
          portfolioAnnualizedPct={
            focus === 'annualizedPctOfAllMass'
              ? periodReturn.annualizedPctOfAllMass
              : periodReturn.annualizedPct
          }
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
                  <span className="block font-medium text-slate-900 dark:text-slate-100">
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

      {focus === 'topUp' ? (
        <TransferMovementsSection
          transfers={periodReturn.transferMovements.filter((t) => t.crossesGrowthBoundary)}
          currency={currency}
        />
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
      {focus === 'annualizedPctOfAllMass' && (
        <FormulaBlock
          title="Формула годовых от массы"
          lines={[
            'прирост — абсолютный прирост портфеля роста (фонды / вклады / инвестиции),',
            'прирост%_от_массы = прирост ÷ вся_масса_на_начало,',
            `годовых_от_массы = (1 + прирост%_от_массы)^(365/${periodReturn.days || 'N'}) − 1.`,
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
                <span className="block truncate font-medium text-slate-900 dark:text-slate-100">{acc.name}</span>
                <span
                  className={`text-[11px] ${
                    sectionTone === 'include' ? 'text-emerald-700' : 'text-slate-400 dark:text-slate-500'
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
}: {
  label: string
  value: string
  hint?: string
  emphasize?: boolean
  valueClassName?: string
}) {
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
      <dd
        className={`shrink-0 text-right font-medium tabular-nums ${valueClassName ?? 'text-slate-900 dark:text-slate-100'}`}
      >
        {value}
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
                <span className="block font-medium text-slate-900 dark:text-slate-100">
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
