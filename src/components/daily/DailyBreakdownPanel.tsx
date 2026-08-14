import { useState, type ReactNode } from 'react'
import type { DailyGrowthFxMode } from '../../engine/growthEngine'
import {
  formatCurrency,
  formatDateDisplay,
  formatPercent,
  signedAmount,
} from '../../lib/format'
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

function AccountLineWithFx({
  acc,
  currency,
}: {
  acc: PeriodReturnAccountLine
  currency: string
}) {
  return (
    <li className="border-b border-slate-100 px-2 py-1.5 last:border-0 dark:border-slate-800">
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

function AccountLineWithoutFx({
  name,
  currency,
  growthNative,
  quantityEffectBase,
  baseCurrency,
}: {
  name: string
  currency: string
  growthNative: number
  quantityEffectBase: number
  baseCurrency: string
}) {
  const unitRate =
    Math.abs(growthNative) >= 1e-9 ? quantityEffectBase / growthNative : null
  return (
    <li className="border-b border-slate-100 px-2 py-1.5 last:border-0 dark:border-slate-800">
      <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-200">
        {name}
        <span className="ml-1.5 text-[10px] font-normal text-slate-400 dark:text-slate-500">
          {currency}
        </span>
      </p>
      <div className="mt-1 flex min-w-min items-end justify-start gap-1 overflow-x-auto">
        <FormulaCell
          label="дельта"
          value={signedAmount(growthNative, currency)}
          valueClassName={tone(growthNative)}
        />
        <FormulaOp>×</FormulaOp>
        <FormulaCell
          label="курс"
          value={
            unitRate == null
              ? '—'
              : unitRate.toLocaleString('ru-RU', {
                  maximumFractionDigits: 4,
                })
          }
        />
        <FormulaOp>=</FormulaOp>
        <FormulaCell
          label="прирост"
          value={signedAmount(quantityEffectBase, baseCurrency)}
          valueClassName={tone(quantityEffectBase)}
          emphasize
        />
      </div>
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
  const title = endDate
    ? `День ${formatDateDisplay(endDate)}`
    : 'Расшифровка дня'

  const quantityGrowth = periodReturn?.quantityEffectBase ?? periodReturn?.growth ?? 0
  const quantityPctOfMass =
    periodReturn != null &&
    Number.isFinite(periodReturn.startTotalAllMass) &&
    periodReturn.startTotalAllMass !== 0
      ? quantityGrowth / periodReturn.startTotalAllMass
      : null

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

  return (
    <StackPanel open={open} title={title} onClose={onClose}>
      {!periodReturn ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Недостаточно данных для расшифровки этого интервала.
        </p>
      ) : (
        <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
            {formatDateDisplay(periodReturn.startDate)} → {formatDateDisplay(periodReturn.endDate)}
            {periodReturn.days > 1 ? ` · ${periodReturn.days} дн.` : ''}
            {withoutFx ? ' · без учёта курса' : ''}
          </p>

          {withoutFx ? (
            <InlineFormulaRow label="Прирост без курса">
              <CompactFormula>
                <FormulaCell label="дельта" value="в валюте" />
                <FormulaOp>×</FormulaOp>
                <FormulaCell label="курс" value="дня" />
                <FormulaOp>=</FormulaOp>
                <FormulaCell
                  label="прирост"
                  value={signedAmount(quantityGrowth, currency)}
                  valueClassName={tone(quantityGrowth)}
                  emphasize
                />
              </CompactFormula>
              <p className="text-center text-[10px] text-slate-400 dark:text-slate-500">
                Σ (изменение остатка − переводы) × курс на {formatDateDisplay(periodReturn.endDate)}.
                Переоценка остатка из‑за курса не входит.
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
              </InlineFormulaRow>

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
                  Δ = прирост + переводы ({signedAmount(totalTransfers, currency)})
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
                className="flex w-full items-center justify-between gap-2 px-2 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                <span>По счетам · {accountCount}</span>
                <span className="text-slate-400">{accountsOpen ? '▾' : '▸'}</span>
              </button>
              {accountsOpen ? (
                <ul className="border-t border-slate-100 dark:border-slate-800">
                  {withoutFx
                    ? accountsWithoutFx.map((acc) => (
                        <AccountLineWithoutFx
                          key={acc.accountId}
                          name={acc.name}
                          currency={acc.currency}
                          growthNative={acc.growthNative}
                          quantityEffectBase={acc.quantityEffectBase}
                          baseCurrency={currency}
                        />
                      ))
                    : accountsWithFx.map((acc) => (
                        <AccountLineWithFx key={acc.accountId} acc={acc} currency={currency} />
                      ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {periodReturn.transferMovements.length > 0 ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setTransfersOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-2 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                <span>Переводы · {periodReturn.transferMovements.length}</span>
                <span className="text-slate-400">{transfersOpen ? '▾' : '▸'}</span>
              </button>
              {transfersOpen ? (
                <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
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
              ) : null}
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
