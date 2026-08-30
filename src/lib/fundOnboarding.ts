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
}

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

/** Always show the latest month; each older month appears after the newer one has any amount, including 0. */
export function visibleMonthKeys(
  amounts: Record<string, string>,
  monthKeysNewestFirst: string[],
): string[] {
  const visible: string[] = []
  for (let i = 0; i < monthKeysNewestFirst.length; i += 1) {
    const key = monthKeysNewestFirst[i]
    if (!key) break
    if (i === 0) {
      visible.push(key)
      continue
    }
    const newer = monthKeysNewestFirst[i - 1]
    if (!newer || !isAmountEntered(amounts[newer])) break
    visible.push(key)
  }
  return visible
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

export function draftsFromOnboardingLines(lines: FundOnboardingLine[]): FundOnboardingDraft[] {
  const ready: { name: string; monthlyTarget: number }[] = []
  for (const line of lines) {
    const name = line.name.trim()
    const mean = meanEnteredAmounts(line.amounts)
    if (!name || mean == null || !(mean > 0)) continue
    ready.push({ name, monthlyTarget: roundMoney(mean) })
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
