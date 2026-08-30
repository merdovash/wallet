import { parseMoneyInput } from './moneyInput'

export const FUND_ONBOARDING_MAX_MONTHS = 12

const RU_MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const

export interface FundOnboardingLine {
  id: string
  name: string
  amounts: Record<string, string>
}

export interface FundOnboardingDraft {
  name: string
  monthlyTarget: number
  priority: number
  autoTarget: boolean
  monthlyExpenses: FundMonthlyExpense[]
}

export interface FundMonthlyExpense {
  yearMonth: string
  amount: number
}

export const YEAR_MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

export function shiftYearMonth(yearMonth: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth)
  if (!match) return yearMonth
  const year = Number(match[1])
  const month = Number(match[2])
  const date = new Date(Date.UTC(year, month - 1 + delta, 1))
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** Previous calendar months, newest first, starting from the month before `asOfIso`. */
export function onboardingMonthKeys(
  asOfIso: string,
  max: number = FUND_ONBOARDING_MAX_MONTHS,
): string[] {
  const current = asOfIso.slice(0, 7)
  const newest = shiftYearMonth(current, -1)
  const keys: string[] = []
  for (let i = 0; i < max; i += 1) keys.push(shiftYearMonth(newest, -i))
  return keys
}

export function formatYearMonthRu(yearMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth)
  if (!match) return yearMonth
  const monthIndex = Number(match[2]) - 1
  const label = RU_MONTHS[monthIndex]
  if (!label) return yearMonth
  return `${label} ${match[1]}`
}

function isAmountEntered(raw: string | undefined): boolean {
  return parseMoneyInput(raw ?? '') != null
}

/** Always show the latest month; older months appear after a newer amount (including 0) or if already filled. */
export function visibleMonthKeys(
  amounts: Record<string, string>,
  monthKeysNewestFirst: string[],
): string[] {
  const progressive: string[] = []
  for (let i = 0; i < monthKeysNewestFirst.length; i += 1) {
    const key = monthKeysNewestFirst[i]
    if (!key) break
    if (i === 0) {
      progressive.push(key)
      continue
    }
    const newer = monthKeysNewestFirst[i - 1]
    if (!newer || !isAmountEntered(amounts[newer])) break
    progressive.push(key)
  }
  const shown = new Set(progressive)
  for (const key of monthKeysNewestFirst) {
    if (isAmountEntered(amounts[key])) shown.add(key)
  }
  return monthKeysNewestFirst.filter((key) => shown.has(key))
}

/** Calendar months for the editor, plus any stored months outside the default window. */
export function editorMonthKeys(
  asOfIso: string,
  amounts: Record<string, string>,
  max: number = FUND_ONBOARDING_MAX_MONTHS,
): string[] {
  const base = onboardingMonthKeys(asOfIso, max)
  const extra = Object.keys(amounts).filter((key) => YEAR_MONTH_RE.test(key) && !base.includes(key))
  extra.sort((a, b) => b.localeCompare(a))
  return [...base, ...extra]
}

export function meanEnteredAmounts(amounts: Record<string, string>): number | null {
  const values: number[] = []
  for (const raw of Object.values(amounts)) {
    const value = parseMoneyInput(raw)
    if (value == null || value < 0) continue
    values.push(value)
  }
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function yearMonthFromIso(iso: string): string {
  return iso.slice(0, 7)
}

/** Add `delta` to a calendar month total (creates the month if missing). */
export function addAmountToMonth(
  expenses: FundMonthlyExpense[] | undefined,
  yearMonth: string,
  delta: number,
): FundMonthlyExpense[] {
  if (!YEAR_MONTH_RE.test(yearMonth) || !Number.isFinite(delta) || delta === 0) {
    return [...(expenses ?? [])].sort((a, b) => b.yearMonth.localeCompare(a.yearMonth))
  }
  const byMonth = new Map<string, number>()
  for (const row of expenses ?? []) {
    if (!YEAR_MONTH_RE.test(row.yearMonth) || !Number.isFinite(row.amount) || row.amount < 0) continue
    byMonth.set(row.yearMonth, row.amount)
  }
  const next = roundMoney((byMonth.get(yearMonth) ?? 0) + delta)
  if (next < 0) byMonth.delete(yearMonth)
  else byMonth.set(yearMonth, next)
  return [...byMonth.entries()]
    .map(([month, amount]) => ({ yearMonth: month, amount }))
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth))
}

export function expensesFromAmounts(amounts: Record<string, string>): FundMonthlyExpense[] {
  const rows: FundMonthlyExpense[] = []
  for (const [yearMonth, raw] of Object.entries(amounts)) {
    if (!YEAR_MONTH_RE.test(yearMonth)) continue
    const amount = parseMoneyInput(raw)
    if (amount == null || amount < 0) continue
    rows.push({ yearMonth, amount: roundMoney(amount) })
  }
  rows.sort((a, b) => b.yearMonth.localeCompare(a.yearMonth))
  return rows
}

export function amountsFromExpenses(expenses: FundMonthlyExpense[] | undefined): Record<string, string> {
  const amounts: Record<string, string> = {}
  for (const row of expenses ?? []) {
    if (!YEAR_MONTH_RE.test(row.yearMonth) || !Number.isFinite(row.amount) || row.amount < 0) continue
    amounts[row.yearMonth] = String(row.amount)
  }
  return amounts
}

export function resolveMonthlyTarget(
  autoTarget: boolean,
  amounts: Record<string, string>,
  manual: number | null,
): number | null {
  if (autoTarget) {
    const mean = meanEnteredAmounts(amounts)
    if (mean == null || !(mean > 0)) return null
    return roundMoney(mean)
  }
  if (manual == null || !(manual > 0) || !Number.isFinite(manual)) return null
  return roundMoney(manual)
}

export function draftsFromOnboardingLines(lines: FundOnboardingLine[]): FundOnboardingDraft[] {
  const ready: Omit<FundOnboardingDraft, 'priority'>[] = []
  for (const line of lines) {
    const name = line.name.trim()
    const monthlyExpenses = expensesFromAmounts(line.amounts)
    const monthlyTarget = resolveMonthlyTarget(true, line.amounts, null)
    if (!name || monthlyTarget == null) continue
    ready.push({
      name,
      monthlyTarget,
      autoTarget: true,
      monthlyExpenses,
    })
  }
  const n = ready.length
  return ready.map((item, index) => ({
    ...item,
    priority: n - index,
  }))
}

export function createOnboardingLine(): FundOnboardingLine {
  return {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `line-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: '',
    amounts: {},
  }
}
