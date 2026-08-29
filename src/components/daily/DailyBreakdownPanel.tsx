import { useState, type ReactNode } from 'react'
import type { DailyGrowthFxMode } from '../../engine/growthEngine'
import {
  formatCurrency,
  formatDateDisplay,
  formatDateWithWeekday,
  formatPercent,
  signedAmount,
} from '../../lib/format'
import type { GrowthFxAccountLine } from '../../lib/growthFxBreakdown'
import type { PeriodReturnAccountLine, PeriodReturnSummary } from '../../lib/monthlyReturns'
import { StackPanel } from '../ui/StackPanel'

interface DailyBreakdownPanelProps {
  open: boolean
  onClose: () => void
  periodReturn: PeriodReturnSummary | null
  endDate: string | null
  currency: string
  fxMode?: DailyGrowthFxMode
}

function tone(value: number): string {
  if (value > 0) return 'text-emerald-700 dark:text-emerald-400'
  if (value < 0) return 'text-red-600'
  return 'text-slate-800 dark:text-slate-200'
}

function FormulaCell({
  label,
  value,
  valueClassName,
  emphasize = false,
}: {
  label: string
  value: string
  valueClassName?: string
  emphasize?: boolean
}) {
  return (
    <div
      className={`flex min-w-[3.25rem] flex-col items-center gap-0.5 px-0.5 ${
        emphasize ? 'rounded-md bg-blue-50 dark:bg-blue-950/40' : ''
      }`}
    >
      <span className="text-[9px] font-medium uppercase leading-none tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <span
        className={`text-center text-xs font-semibold tabular-nums leading-tight ${valueClassName ?? 'text-slate-900 dark:text-slate-200'}`}
      >
        {value}
      </span>
    </div>
  )
}

function FormulaOp({ children }: { children: string }) {
  return (
    <span className="pb-0.5 text-sm font-medium leading-none text-slate-400 dark:text-slate-500">
      {children}
    </span>
  )
}

function CompactFormula({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-700 dark:bg-slate-800/60">
      <div className="flex min-w-min items-end justify-center gap-1">{children}</div>
    </div>
  )
}

function InlineFormulaRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
      {children}
    </div>
  )
}

/** Base-currency account (or no FX split): Δ = рост + переводы. */
function AccountLineBase({
  acc,
  currency,
}: {
  acc: PeriodReturnAccountLine
  currency: string
}) {
  return (
    <li className="border-b border-slate-100 px-2 py-1.5 last:border-0 dark:border-slate-800" data-qa={`daily-account-${acc.accountId}`}>
      <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-200">{acc.name}</p>
      <div className="mt-1 flex min-w-min items-end justify-start gap-1 overflow-x-auto">
        <FormulaCell
          label="Δ"
          value={signedAmount(acc.balanceChangeBase, currency)}
          valueClassName={tone(acc.balanceChangeBase)}
        />
        <FormulaOp>=</FormulaOp>
        <FormulaCell
          label="рост"
          value={signedAmount(acc.growthBase, currency)}
          valueClassName={tone(acc.growthBase)}
        />
        {Math.abs(acc.transfersBase) >= 0.01 ? (
          <>
            <FormulaOp>+</FormulaOp>
            <FormulaCell
              label="перев."
              value={signedAmount(acc.transfersBase, currency)}
              valueClassName={tone(acc.transfersBase)}
            />
          </>
        ) : null}
      </div>
    </li>
  )
}

/**
 * Foreign account with FX: Δ = рост по курсу (кол-во×курс_дня) + рост курса (переоценка остатка).
 */
function AccountLineWithFxSplit({
  acc,
  fx,
  baseCurrency,
}: {
  acc: PeriodReturnAccountLine
  fx: GrowthFxAccountLine
  baseCurrency: string
}) {
  const qty = fx.quantityEffectBase
  const rateFx = fx.fxEffectBase
  const timing = fx.transferTimingBase
  const composed = qty + rateFx + timing

  return (
    <li className="border-b border-slate-100 px-2 py-1.5 last:border-0 dark:border-slate-800" data-qa={`daily-account-${acc.accountId}`}>
      <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-200">
        {acc.name}
        <span className="ml-1.5 text-[10px] font-normal text-slate-400 dark:text-slate-500">
          {acc.currency}
        </span>
      </p>
      <div className="mt-1 flex min-w-min items-end justify-start gap-1 overflow-x-auto">
        <FormulaCell
          label="Δ"
          value={signedAmount(acc.growthBase, baseCurrency)}
          valueClassName={tone(acc.growthBase)}
          emphasize
        />
        <FormulaOp>=</FormulaOp>
        <FormulaCell
          label="по курсу"
          value={signedAmount(qty, baseCurrency)}
          valueClassName={tone(qty)}
        />
        <FormulaOp>+</FormulaOp>
        <FormulaCell
          label="рост курса"
          value={signedAmount(rateFx, baseCurrency)}
          valueClassName={tone(rateFx)}
        />
        {Math.abs(timing) >= 0.01 ? (
          <>
            <FormulaOp>+</FormulaOp>
            <FormulaCell
              label="даты"
              value={signedAmount(timing, baseCurrency)}
              valueClassName={tone(timing)}
            />
          </>
        ) : null}
      </div>
      {Math.abs(composed - acc.growthBase) >= 0.05 ? (
        <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
          проверка: {signedAmount(composed, baseCurrency)}
        </p>
      ) : null}
      {Math.abs(acc.transfersBase) >= 0.01 ? (
        <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
          переводы {signedAmount(acc.transfersBase, baseCurrency)} · Δ остатка{' '}
          {signedAmount(acc.balanceChangeBase, baseCurrency)}
        </p>
      ) : null}
    </li>
  )
}

/** Without FX: прирост = только дельта по курсу (кол-во × курс дня). */
function AccountLineQuantityOnly({
  fx,
  baseCurrency,
}: {
  fx: GrowthFxAccountLine
  baseCurrency: string
}) {
  return (
    <li className="border-b border-slate-100 px-2 py-1.5 last:border-0 dark:border-slate-800" data-qa={`daily-account-${fx.accountId}`}>
      <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-200">
        {fx.name}
        <span className="ml-1.5 text-[10px] font-normal text-slate-400 dark:text-slate-500">
          {fx.currency}
        </span>
      </p>
      <div className="mt-1 flex min-w-min items-end justify-start gap-1 overflow-x-auto">
        <FormulaCell
          label="дельта по курсу"
          value={signedAmount(fx.quantityEffectBase, baseCurrency)}
          valueClassName={tone(fx.quantityEffectBase)}
          emphasize
        />
      </div>
      <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
        {signedAmount(fx.growthNative, fx.currency)} × курс дня
        {Math.abs(fx.fxEffectBase) >= 0.01
          ? ` · курс на остаток ${signedAmount(fx.fxEffectBase, baseCurrency)} не входит`
          : ''}
      </p>
    </li>
  )
}

export function DailyBreakdownPanel({
  open,
  onClose,
  periodReturn,
  endDate,
  currency,
  fxMode = 'withFx',
}: DailyBreakdownPanelProps) {
  const [accountsOpen, setAccountsOpen] = useState(false)
  const [transfersOpen, setTransfersOpen] = useState(false)

  const withoutFx = fxMode === 'withoutFx'
  const title = endDate ? formatDateWithWeekday(endDate) : 'Расшифровка дня'

  const quantityGrowth = periodReturn?.quantityEffectBase ?? periodReturn?.growth ?? 0
  const fxEffect = periodReturn?.growthFx?.fxEffectBase ?? 0
  const quantityPctOfMass =
    periodReturn != null &&
    Number.isFinite(periodReturn.startTotalAllMass) &&
    periodReturn.startTotalAllMass !== 0
      ? quantityGrowth / periodReturn.startTotalAllMass
      : null

  const fxByAccount = new Map(
    (periodReturn?.growthFx?.accounts ?? []).map((a) => [a.accountId, a]),
  )

  const accountsWithFx = periodReturn
    ? [...periodReturn.includedAccounts].sort(
        (a, b) => Math.abs(b.growthBase) - Math.abs(a.growthBase) || a.name.localeCompare(b.name),
      )
    : []

  const accountsWithoutFx = periodReturn?.growthFx
    ? [...periodReturn.growthFx.accounts].sort(
        (a, b) =>
          Math.abs(b.quantityEffectBase) - Math.abs(a.quantityEffectBase) ||
          a.name.localeCompare(b.name),
      )
    : []

  const totalTransfers = accountsWithFx.reduce((s, a) => s + a.transfersBase, 0)
  const balanceChange = periodReturn ? periodReturn.endTotal - periodReturn.startTotal : 0
  const accountCount = withoutFx ? accountsWithoutFx.length : accountsWithFx.length
  const hasTransfers = (periodReturn?.transferMovements.length ?? 0) > 0

  function transferAmountControl(amount: number, className = '') {
    if (!hasTransfers) {
      return <span className={className}>{signedAmount(amount, currency)}</span>
    }
    return (
      <button
        type="button"
        onClick={() => setTransfersOpen((v) => !v)}
        data-qa="daily-transfers-toggle"
        className={`inline-flex items-center gap-0.5 underline decoration-dotted underline-offset-2 hover:text-blue-700 dark:hover:text-blue-400 ${className}`}
      >
        {signedAmount(amount, currency)}
        <span className="text-[9px] text-slate-400" aria-hidden>
          {transfersOpen ? '▾' : '▸'}
        </span>
      </button>
    )
  }

  return (
    <StackPanel open={open} title={title} onClose={onClose} dataQa="daily-breakdown">
      {!periodReturn ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Недостаточно данных для расшифровки этого интервала.
        </p>
      ) : (
        <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
            {formatDateDisplay(periodReturn.startDate)} → {formatDateDisplay(periodReturn.endDate)}
            {periodReturn.days > 1 ? ` · ${periodReturn.days} дн.` : ''}
            {withoutFx ? ' · без учёта курса' : ' · с учётом курса'}
          </p>

          {withoutFx ? (
            <InlineFormulaRow label="Прирост = дельта по курсу">
              <CompactFormula>
                <FormulaCell
                  label="дельта по курсу"
                  value={signedAmount(quantityGrowth, currency)}
                  valueClassName={tone(quantityGrowth)}
                  emphasize
                />
              </CompactFormula>
              <p className="text-center text-[10px] text-slate-400 dark:text-slate-500">
                Только Σ (изменение остатка − переводы) × курс на{' '}
                {formatDateDisplay(periodReturn.endDate)}. Рост курса остатка не входит
                {Math.abs(fxEffect) >= 0.01
                  ? ` (${signedAmount(fxEffect, currency)})`
                  : ''}
                .
              </p>
            </InlineFormulaRow>
          ) : (
            <>
              <InlineFormulaRow label="Портфель роста">
                <CompactFormula>
                  <FormulaCell label="конец" value={formatCurrency(periodReturn.endTotal, currency)} />
                  <FormulaOp>−</FormulaOp>
                  <FormulaCell
                    label="начало"
                    value={formatCurrency(periodReturn.startTotal, currency)}
                  />
                  <FormulaOp>−</FormulaOp>
                  <FormulaCell
                    label="поток"
                    value={signedAmount(periodReturn.netFlow, currency)}
                    valueClassName={tone(periodReturn.netFlow)}
                  />
                  <FormulaOp>=</FormulaOp>
                  <FormulaCell
                    label="прирост"
                    value={signedAmount(periodReturn.growth, currency)}
                    valueClassName={tone(periodReturn.growth)}
                    emphasize
                  />
                </CompactFormula>
                {hasTransfers ? (
                  <p className="text-center text-[10px] text-slate-400 dark:text-slate-500">
                    поток{' '}
                    {transferAmountControl(
                      periodReturn.netFlow,
                      tone(periodReturn.netFlow),
                    )}{' '}
                    · нажмите сумму для списка переводов
                  </p>
                ) : null}
              </InlineFormulaRow>

              {periodReturn.growthFx ? (
                <InlineFormulaRow label="Состав прироста">
                  <CompactFormula>
                    <FormulaCell
                      label="по курсу"
                      value={signedAmount(periodReturn.growthFx.quantityEffectBase, currency)}
                      valueClassName={tone(periodReturn.growthFx.quantityEffectBase)}
                    />
                    <FormulaOp>+</FormulaOp>
                    <FormulaCell
                      label="рост курса"
                      value={signedAmount(periodReturn.growthFx.fxEffectBase, currency)}
                      valueClassName={tone(periodReturn.growthFx.fxEffectBase)}
                    />
                    {Math.abs(periodReturn.growthFx.transferTimingBase) >= 0.01 ? (
                      <>
                        <FormulaOp>+</FormulaOp>
                        <FormulaCell
                          label="даты"
                          value={signedAmount(periodReturn.growthFx.transferTimingBase, currency)}
                          valueClassName={tone(periodReturn.growthFx.transferTimingBase)}
                        />
                      </>
                    ) : null}
                    <FormulaOp>=</FormulaOp>
                    <FormulaCell
                      label="прирост"
                      value={signedAmount(periodReturn.growth, currency)}
                      valueClassName={tone(periodReturn.growth)}
                      emphasize
                    />
                  </CompactFormula>
                  <p className="text-center text-[10px] text-slate-400 dark:text-slate-500">
                    по курсу = дельта в валюте × курс дня · рост курса = переоценка начального остатка
                  </p>
                </InlineFormulaRow>
              ) : null}

              <InlineFormulaRow label="Проверка Δ остатка">
                <CompactFormula>
                  <FormulaCell
                    label="конец"
                    value={formatCurrency(periodReturn.endTotal, currency)}
                  />
                  <FormulaOp>−</FormulaOp>
                  <FormulaCell
                    label="начало"
                    value={formatCurrency(periodReturn.startTotal, currency)}
                  />
                  <FormulaOp>=</FormulaOp>
                  <FormulaCell
                    label="Δ"
                    value={signedAmount(balanceChange, currency)}
                    valueClassName={tone(balanceChange)}
                  />
                </CompactFormula>
                <p className="text-center text-[10px] text-slate-400 dark:text-slate-500">
                  Δ = прирост + переводы (
                  {transferAmountControl(totalTransfers, tone(totalTransfers))}
                  )
                </p>
              </InlineFormulaRow>
            </>
          )}

          {(withoutFx ? quantityPctOfMass : periodReturn.growthPctOfAllMass) != null ? (
            <InlineFormulaRow label="От массы">
              <CompactFormula>
                <FormulaCell
                  label="%"
                  value={formatPercent(
                    withoutFx ? quantityPctOfMass : periodReturn.growthPctOfAllMass,
                    3,
                  )}
                  valueClassName={tone(
                    (withoutFx ? quantityPctOfMass : periodReturn.growthPctOfAllMass) ?? 0,
                  )}
                  emphasize
                />
                <FormulaOp>=</FormulaOp>
                <FormulaCell
                  label="прирост"
                  value={signedAmount(
                    withoutFx ? quantityGrowth : periodReturn.growth,
                    currency,
                  )}
                  valueClassName={tone(withoutFx ? quantityGrowth : periodReturn.growth)}
                />
                <FormulaOp>÷</FormulaOp>
                <FormulaCell
                  label="масса"
                  value={formatCurrency(periodReturn.startTotalAllMass, currency)}
                />
              </CompactFormula>
            </InlineFormulaRow>
          ) : null}

          {accountCount > 0 ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setAccountsOpen((v) => !v)}
                data-qa="daily-accounts-toggle"
                className="flex w-full items-center justify-between gap-2 px-2 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                <span>По счетам · {accountCount}</span>
                <span className="text-slate-400">{accountsOpen ? '▾' : '▸'}</span>
              </button>
              {accountsOpen ? (
                <ul className="border-t border-slate-100 dark:border-slate-800">
                  {withoutFx
                    ? accountsWithoutFx.map((acc) => (
                        <AccountLineQuantityOnly
                          key={acc.accountId}
                          fx={acc}
                          baseCurrency={currency}
                        />
                      ))
                    : accountsWithFx.map((acc) => {
                        const fx = fxByAccount.get(acc.accountId)
                        const isForeign = acc.currency !== currency
                        if (isForeign && fx) {
                          return (
                            <AccountLineWithFxSplit
                              key={acc.accountId}
                              acc={acc}
                              fx={fx}
                              baseCurrency={currency}
                            />
                          )
                        }
                        return (
                          <AccountLineBase key={acc.accountId} acc={acc} currency={currency} />
                        )
                      })}
                </ul>
              ) : null}
            </div>
          ) : null}

          {transfersOpen && hasTransfers ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-2 py-2 dark:border-slate-800">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Переводы · {periodReturn.transferMovements.length}
                </span>
                <button
                  type="button"
                  onClick={() => setTransfersOpen(false)}
                  data-qa="daily-transfers-hide"
                  className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  Скрыть
                </button>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {periodReturn.transferMovements.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-start justify-between gap-2 px-2 py-1.5 text-[11px]"
                  >
                    <span className="min-w-0 truncate text-slate-700 dark:text-slate-300">
                      {t.fromName} → {t.toName}
                    </span>
                    <span className="shrink-0 tabular-nums font-medium">
                      {formatCurrency(t.amountBase, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-[10px] leading-snug text-slate-400 dark:text-slate-500">
            Только фонды, вклады и инвестиции. Доход и расход с оперативных не входят в прирост.
          </p>
        </div>
      )}
    </StackPanel>
  )
}
