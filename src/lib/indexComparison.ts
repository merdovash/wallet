import {
  balanceOnDate,
  buildBalanceIndex,
  effectiveBalanceOnDate,
  lastSnapshotDateForAccount,
  netWorthAmount,
  snapshotDates,
  type BalanceIndex,
  type RateBook,
} from '../engine/growthEngine'
import { isGrowthPortfolioAccount } from './accountKinds'
import { resolvePivotForDate } from './cbrRates'
import { toBase } from './currency'
import { resolveIndexCurrency, resolveIndexValues } from './marketIndex'
import { transferCashLegNative, transferLegBase } from './transferAmounts'
import type {
  Account,
  BalanceSnapshot,
  IndexValue,
  MarketIndex,
  Transfer,
  WalletSettings,
} from '../types/wallet'

export interface IndexComparisonPoint {
  date: string
  actualTotal: number
  indexTotal: number
  actualGrowth: number
  indexGrowth: number
  difference: number
}

const DAY_MS = 86_400_000

function compareDate(a: string, b: string): number {
  return a.localeCompare(b)
}

function daysBetween(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`)
  const b = Date.parse(`${end}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.round((b - a) / DAY_MS))
}

function valueOnDate(values: IndexValue[], date: string): number | null {
  let current: number | null = null
  for (const item of values) {
    if (item.date > date) break
    current = item.value
  }
  return current
}

function selectedTotalOnDate(
  date: string,
  selectedAccounts: Account[],
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  balanceIndex: BalanceIndex,
  rateBook?: RateBook,
): number {
  const pivot = resolvePivotForDate(date, rateBook ?? {})
  let total = 0
  for (const account of selectedAccounts) {
    const balance = effectiveBalanceOnDate(account.id, date, snapshots, balanceIndex, account)
    if (balance == null) continue
    total += toBase(
      netWorthAmount(account, balance),
      account.currency,
      settings.baseCurrency,
      settings.exchangeRates,
      pivot,
    )
  }
  return total
}

function selectedNetCashTransfersIn(
  accountId: string,
  t0: string,
  t1: string,
  transfers: Transfer[],
  accounts: Account[],
  settings?: WalletSettings,
  rateBook?: RateBook,
): number {
  let net = 0
  for (const transfer of transfers) {
    if (compareDate(transfer.date, t0) <= 0) continue
    if (compareDate(transfer.date, t1) > 0) continue
    net += transferCashLegNative(accountId, transfer, accounts, settings, rateBook)
  }
  return net
}

function selectedCapitalFlows(
  t0: string,
  t1: string,
  selectedAccounts: Account[],
  selectedIdSet: Set<string>,
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  allAccounts: Account[],
  settings: WalletSettings,
  rateBook?: RateBook,
): Array<{ date: string; amount: number }> {
  const byDate = new Map<string, number>()

  for (const transfer of transfers) {
    if (compareDate(transfer.date, t0) <= 0) continue
    if (compareDate(transfer.date, t1) > 0) continue
    const fromSelected = selectedIdSet.has(transfer.fromAccountId)
    const toSelected = selectedIdSet.has(transfer.toAccountId)
    if (fromSelected === toSelected) continue
    const boundaryAccountId = toSelected ? transfer.toAccountId : transfer.fromAccountId
    const signed = transferLegBase(boundaryAccountId, transfer, allAccounts, settings, rateBook)
    byDate.set(transfer.date, (byDate.get(transfer.date) ?? 0) + signed)
  }

  const orderedSnapshots = [...snapshots].sort(
    (a, b) => compareDate(a.date, b.date) || a.id.localeCompare(b.id),
  )
  const dates = snapshotDates(snapshots)

  for (const account of selectedAccounts) {
    if (effectiveBalanceOnDate(account.id, t0, snapshots, undefined, account) == null) {
      const first = orderedSnapshots.find(
        (snapshot) =>
          compareDate(snapshot.date, t0) > 0 &&
          compareDate(snapshot.date, t1) <= 0 &&
          snapshot.lines.some((line) => line.accountId === account.id),
      )
      const opening = first?.lines.find((line) => line.accountId === account.id)?.amount
      if (first && opening != null && opening !== 0) {
        const explainedByTransfer = transfers.some(
          (transfer) =>
            transfer.toAccountId === account.id &&
            compareDate(transfer.date, t0) > 0 &&
            compareDate(transfer.date, first.date) <= 0,
        )
        if (!explainedByTransfer) {
          const openingBase = toBase(
            netWorthAmount(account, opening),
            account.currency,
            settings.baseCurrency,
            settings.exchangeRates,
            resolvePivotForDate(first.date, rateBook ?? {}),
          )
          byDate.set(first.date, (byDate.get(first.date) ?? 0) + openingBase)
        }
      }
    }

    const lastDate = lastSnapshotDateForAccount(account.id, snapshots)
    if (!lastDate) continue
    const lastIdx = dates.indexOf(lastDate)
    if (lastIdx < 0) continue

    const balanceLast = balanceOnDate(account.id, lastDate, snapshots) ?? 0

    if (balanceLast === 0 && lastIdx > 0) {
      const prevDate = dates[lastIdx - 1]!
      const balancePrev =
        effectiveBalanceOnDate(account.id, prevDate, snapshots, undefined, account) ?? 0
      if (balancePrev > 0 && compareDate(lastDate, t0) > 0 && compareDate(lastDate, t1) <= 0) {
        const explained = selectedNetCashTransfersIn(
          account.id,
          prevDate,
          lastDate,
          transfers,
          allAccounts,
          settings,
          rateBook,
        )
        const drop = balancePrev - balanceLast
        const unexplained = Math.max(0, drop + Math.min(0, explained))
        if (unexplained > 0) {
          const amountBase = toBase(
            unexplained,
            account.currency,
            settings.baseCurrency,
            settings.exchangeRates,
            resolvePivotForDate(lastDate, rateBook ?? {}),
          )
          byDate.set(lastDate, (byDate.get(lastDate) ?? 0) - amountBase)
        }
      }
    }

    if (account.archived && balanceLast > 0 && lastIdx < dates.length - 1) {
      const firstAfter = dates[lastIdx + 1]!
      if (compareDate(firstAfter, t0) > 0 && compareDate(firstAfter, t1) <= 0) {
        const explained = selectedNetCashTransfersIn(
          account.id,
          lastDate,
          firstAfter,
          transfers,
          allAccounts,
          settings,
          rateBook,
        )
        const unexplained = Math.max(0, balanceLast + Math.min(0, explained))
        if (unexplained > 0) {
          const amountBase = toBase(
            unexplained,
            account.currency,
            settings.baseCurrency,
            settings.exchangeRates,
            resolvePivotForDate(firstAfter, rateBook ?? {}),
          )
          byDate.set(firstAfter, (byDate.get(firstAfter) ?? 0) - amountBase)
        }
      }
    }
  }

  return [...byDate.entries()]
    .filter(([, amount]) => amount !== 0)
    .sort(([a], [b]) => compareDate(a, b))
    .map(([date, amount]) => ({ date, amount }))
}

function buildSelectedTotalSeries(
  selectedAccounts: Account[],
  selectedIdSet: Set<string>,
  allAccounts: Account[],
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  rateBook?: RateBook,
  transfers: Transfer[] = [],
): Array<{ date: string; total: number; growth: number }> {
  const dates = snapshotDates(snapshots)
  if (dates.length === 0 || selectedAccounts.length === 0) return []

  const balanceIndex = buildBalanceIndex(snapshots)
  const cashflowByDate = new Map<string, number>()
  for (const flow of selectedCapitalFlows(
    dates[0]!,
    dates[dates.length - 1]!,
    selectedAccounts,
    selectedIdSet,
    snapshots,
    transfers,
    allAccounts,
    settings,
    rateBook,
  )) {
    cashflowByDate.set(flow.date, (cashflowByDate.get(flow.date) ?? 0) + flow.amount)
  }

  const points: Array<{ date: string; total: number; growth: number }> = []
  let baseline: number | null = null
  let cumulativeFlow = 0
  let previousDate: string | null = null
  for (const date of dates) {
    const total = selectedTotalOnDate(
      date,
      selectedAccounts,
      snapshots,
      settings,
      balanceIndex,
      rateBook,
    )
    if (baseline == null || previousDate == null) {
      baseline = total
      previousDate = date
      points.push({ date, total, growth: 0 })
      continue
    }
    for (const [flowDate, amount] of cashflowByDate) {
      if (compareDate(flowDate, previousDate) > 0 && compareDate(flowDate, date) <= 0) {
        cumulativeFlow += amount
      }
    }
    points.push({
      date,
      total,
      growth: total - baseline - cumulativeFlow,
    })
    previousDate = date
  }
  return points
}

export function buildIndexComparison(input: {
  index: MarketIndex
  indices: MarketIndex[]
  indexValues: IndexValue[]
  accounts: Account[]
  snapshots: BalanceSnapshot[]
  transfers: Transfer[]
  settings: WalletSettings
  rateBook?: RateBook
  range?: { startDate: string; endDate: string } | null
  selectedAccountIds?: string[]
}): IndexComparisonPoint[] {
  const observations = resolveIndexValues(input.index.id, input.indices, input.indexValues)
  if (observations.length === 0) return []

  const indexCurrency = resolveIndexCurrency(input.index, input.indices)
  const selectedAccountIds =
    input.selectedAccountIds && input.selectedAccountIds.length > 0
      ? input.selectedAccountIds
      : input.accounts.filter(isGrowthPortfolioAccount).map((account) => account.id)
  const selectedIdSet = new Set(selectedAccountIds)
  const selectedAccounts = input.accounts.filter((account) => selectedIdSet.has(account.id))
  if (selectedAccounts.length === 0) return []

  const actualAll = buildSelectedTotalSeries(
    selectedAccounts,
    selectedIdSet,
    input.accounts,
    input.snapshots,
    input.settings,
    input.rateBook,
    input.transfers,
  )
  const lower = input.range?.startDate
  const upper = input.range?.endDate
  const basePerIndexUnit = (date: string): number =>
    toBase(
      1,
      indexCurrency,
      input.settings.baseCurrency,
      input.settings.exchangeRates,
      resolvePivotForDate(date, input.rateBook ?? {}),
    )
  const actual = actualAll.filter(
    (point) =>
      (!lower || point.date >= lower) &&
      (!upper || point.date <= upper) &&
      valueOnDate(observations, point.date) != null &&
      Number.isFinite(basePerIndexUnit(point.date)) &&
      basePerIndexUnit(point.date) > 0,
  )
  if (actual.length === 0) return []

  const start = actual[0]!
  const end = actual[actual.length - 1]!
  const flows = selectedCapitalFlows(
    start.date,
    end.date,
    selectedAccounts,
    selectedIdSet,
    input.snapshots,
    input.transfers,
    input.accounts,
    input.settings,
    input.rateBook,
  )
  const flowByDate = new Map<string, number>()
  for (const flow of flows) {
    flowByDate.set(flow.date, (flowByDate.get(flow.date) ?? 0) + flow.amount)
  }

  const indexTotalByDate =
    input.index.kind === 'annual_rate' || input.index.kind === 'derived_rate'
      ? buildRateTotals(
          start.date,
          start.total,
          actual.map((point) => point.date),
          observations,
          flowByDate,
          basePerIndexUnit,
        )
      : buildAmountTotals(
          start.date,
          start.total,
          actual.map((point) => point.date),
          observations,
          flows,
          basePerIndexUnit,
        )

  let cumulativeFlow = 0
  let previousDate = start.date
  return actual.map((point, position) => {
    if (position > 0) {
      for (const flow of flows) {
        if (flow.date > previousDate && flow.date <= point.date) cumulativeFlow += flow.amount
      }
    }
    const indexTotal = indexTotalByDate.get(point.date) ?? start.total
    const actualGrowth = point.total - start.total - cumulativeFlow
    const indexGrowth = indexTotal - start.total - cumulativeFlow
    previousDate = point.date
    return {
      date: point.date,
      actualTotal: point.total,
      indexTotal,
      actualGrowth,
      indexGrowth,
      difference: actualGrowth - indexGrowth,
    }
  })
}

function buildAmountTotals(
  startDate: string,
  startTotal: number,
  dates: string[],
  observations: IndexValue[],
  flows: Array<{ date: string; amount: number }>,
  basePerIndexUnit: (date: string) => number,
): Map<string, number> {
  const startLevel = valueOnDate(observations, startDate)
  const startFx = basePerIndexUnit(startDate)
  if (startLevel == null || !(startLevel > 0) || !(startFx > 0)) return new Map()
  let units = startTotal / (startLevel * startFx)
  let previousDate = startDate
  const result = new Map<string, number>([[startDate, startTotal]])
  for (const date of dates.slice(1)) {
    for (const flow of flows) {
      if (flow.date <= previousDate || flow.date > date) continue
      const level = valueOnDate(observations, flow.date)
      const fx = basePerIndexUnit(flow.date)
      if (level != null && level > 0 && fx > 0) units += flow.amount / (level * fx)
    }
    const level = valueOnDate(observations, date)
    const fx = basePerIndexUnit(date)
    if (level != null && fx > 0) result.set(date, units * level * fx)
    previousDate = date
  }
  return result
}

function buildRateTotals(
  startDate: string,
  startTotal: number,
  outputDates: string[],
  observations: IndexValue[],
  flowByDate: Map<string, number>,
  basePerIndexUnit: (date: string) => number,
): Map<string, number> {
  let rate = valueOnDate(observations, startDate)
  const startFx = basePerIndexUnit(startDate)
  if (rate == null || !(startFx > 0)) return new Map()
  let totalNative = startTotal / startFx
  let previousDate = startDate
  const result = new Map<string, number>([[startDate, startTotal]])
  const outputSet = new Set(outputDates)
  const eventDates = new Set(outputDates.slice(1))
  for (const observation of observations) {
    if (observation.date > startDate && observation.date <= outputDates[outputDates.length - 1]!) {
      eventDates.add(observation.date)
    }
  }
  for (const date of flowByDate.keys()) {
    if (date > startDate && date <= outputDates[outputDates.length - 1]!) eventDates.add(date)
  }

  for (const date of [...eventDates].sort()) {
    totalNative *= Math.pow(1 + rate, daysBetween(previousDate, date) / 365)
    const observation = observations.find((item) => item.date === date)
    if (observation) rate = observation.value
    const fx = basePerIndexUnit(date)
    const flow = flowByDate.get(date) ?? 0
    if (flow !== 0 && fx > 0) totalNative += flow / fx
    if (outputSet.has(date) && fx > 0) result.set(date, totalNative * fx)
    previousDate = date
  }
  return result
}

export interface ComparisonDataIssue {
  id: string
  name: string
  reason: string
}

export interface IndexComparisonDiagnosis {
  indexIssues: ComparisonDataIssue[]
  walletIssues: ComparisonDataIssue[]
}

type IndexComparisonBaseInput = {
  indices: MarketIndex[]
  indexValues: IndexValue[]
  accounts: Account[]
  snapshots: BalanceSnapshot[]
  transfers: Transfer[]
  settings: WalletSettings
  rateBook?: RateBook
  range?: { startDate: string; endDate: string } | null
  selectedAccountIds?: string[]
}

function inComparisonRange(
  date: string,
  range?: { startDate: string; endDate: string } | null,
): boolean {
  if (range?.startDate && date < range.startDate) return false
  if (range?.endDate && date > range.endDate) return false
  return true
}

function walletHasCheckInInRange(
  accountId: string,
  snapshots: BalanceSnapshot[],
  range?: { startDate: string; endDate: string } | null,
): boolean {
  for (const date of snapshotDates(snapshots)) {
    if (!inComparisonRange(date, range)) continue
    if (balanceOnDate(accountId, date, snapshots) != null) return true
  }
  return false
}

function diagnoseSingleIndexIssue(
  index: MarketIndex,
  input: IndexComparisonBaseInput,
  selectedAccounts: Account[],
): string | null {
  const observations = resolveIndexValues(index.id, input.indices, input.indexValues)
  if (observations.length === 0) return 'нет зафиксированных значений'

  const indexCurrency = resolveIndexCurrency(index, input.indices)
  const selectedIdSet = new Set(selectedAccounts.map((account) => account.id))
  const actualAll = buildSelectedTotalSeries(
    selectedAccounts,
    selectedIdSet,
    input.accounts,
    input.snapshots,
    input.settings,
    input.rateBook,
    input.transfers,
  )
  if (actualAll.length === 0) return null

  const basePerIndexUnit = (date: string): number =>
    toBase(
      1,
      indexCurrency,
      input.settings.baseCurrency,
      input.settings.exchangeRates,
      resolvePivotForDate(date, input.rateBook ?? {}),
    )

  const inPeriod = actualAll.filter((point) => inComparisonRange(point.date, input.range))
  if (inPeriod.length === 0) return null

  const withIndex = inPeriod.filter((point) => valueOnDate(observations, point.date) != null)
  if (withIndex.length === 0) {
    const hasIndexInPeriod = observations.some((item) => inComparisonRange(item.date, input.range))
    if (!hasIndexInPeriod) return 'нет данных в выбранном периоде'
    return 'нет пересечения с датами чек-инов'
  }

  const withFx = withIndex.filter((point) => {
    const fx = basePerIndexUnit(point.date)
    return Number.isFinite(fx) && fx > 0
  })
  if (withFx.length === 0) return `нет курса ${indexCurrency}`
  if (withFx.length < 2) return 'недостаточно общих дат (нужно минимум два чек-ина)'
  return null
}

export function diagnoseIndexComparison(input: {
  indices: MarketIndex[]
  indexValues: IndexValue[]
  accounts: Account[]
  snapshots: BalanceSnapshot[]
  transfers: Transfer[]
  settings: WalletSettings
  rateBook?: RateBook
  range?: { startDate: string; endDate: string } | null
  selectedIndexIds: string[]
  selectedAccountIds: string[]
}): IndexComparisonDiagnosis {
  const indexIssues: ComparisonDataIssue[] = []
  const walletIssues: ComparisonDataIssue[] = []
  const selectedAccounts = input.accounts.filter((account) =>
    input.selectedAccountIds.includes(account.id),
  )
  const selectedIndices = input.indices.filter((index) =>
    input.selectedIndexIds.includes(index.id),
  )
  const comparisonInput: IndexComparisonBaseInput = {
    indices: input.indices,
    indexValues: input.indexValues,
    accounts: input.accounts,
    snapshots: input.snapshots,
    transfers: input.transfers,
    settings: input.settings,
    rateBook: input.rateBook,
    range: input.range,
    selectedAccountIds: input.selectedAccountIds,
  }

  if (snapshotDates(input.snapshots).length === 0) {
    for (const account of selectedAccounts) {
      walletIssues.push({ id: account.id, name: account.name, reason: 'нет чек-инов' })
    }
  } else {
    for (const account of selectedAccounts) {
      if (!walletHasCheckInInRange(account.id, input.snapshots, input.range)) {
        walletIssues.push({
          id: account.id,
          name: account.name,
          reason: input.range
            ? 'нет баланса в выбранном периоде'
            : 'нет чек-инов с балансом',
        })
      }
    }
  }

  const perIndex = selectedIndices.map((index) => ({
    index,
    points: buildIndexComparison({
      ...comparisonInput,
      index,
    }),
    reason: diagnoseSingleIndexIssue(index, comparisonInput, selectedAccounts),
  }))

  for (const { index, points, reason } of perIndex) {
    if (reason) {
      indexIssues.push({ id: index.id, name: index.name, reason })
      continue
    }
    if (points.length < 2) {
      indexIssues.push({
        id: index.id,
        name: index.name,
        reason: 'недостаточно общих дат (нужно минимум два чек-ина)',
      })
    }
  }

  if (selectedIndices.length > 1) {
    const withData = perIndex.filter((item) => item.points.length > 0)
    if (withData.length === perIndex.length) {
      const sharedStart = [...withData.map((item) => item.points[0]!.date)].sort().at(-1)!
      const sharedEnd = [...withData.map((item) => item.points.at(-1)!.date)].sort()[0]!
      if (sharedStart > sharedEnd) {
        for (const { index, points } of withData) {
          if (indexIssues.some((issue) => issue.id === index.id)) continue
          indexIssues.push({
            id: index.id,
            name: index.name,
            reason: `данные ${points[0]!.date}–${points.at(-1)!.date}, нет общего периода с другими индексами`,
          })
        }
      }
    }
  }

  return { indexIssues, walletIssues }
}

export function formatComparisonDiagnosis(diagnosis: IndexComparisonDiagnosis): string {
  const lines: string[] = []
  if (diagnosis.indexIssues.length > 0) {
    lines.push(
      `Индексы: ${diagnosis.indexIssues.map((item) => `${item.name} — ${item.reason}`).join('; ')}`,
    )
  }
  if (diagnosis.walletIssues.length > 0) {
    lines.push(
      `Кошельки: ${diagnosis.walletIssues.map((item) => `${item.name} — ${item.reason}`).join('; ')}`,
    )
  }
  return lines.join('\n')
}

export function appendComparisonDiagnosis(base: string, diagnosis: IndexComparisonDiagnosis): string {
  const details = formatComparisonDiagnosis(diagnosis)
  return details ? `${base}\n\n${details}` : base
}
