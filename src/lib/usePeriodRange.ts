import { useMemo } from 'react'
import { snapshotDates } from '../engine/growthEngine'
import {
  resolveDashboardPeriod,
  type DashboardPeriodKey,
  type PeriodRange,
} from './dashboardPeriod'
import { usePeriodStore } from '../store/periodStore'
import { useWalletStore } from '../store/walletStore'

export function usePeriodRange(): {
  periodKey: DashboardPeriodKey
  range: PeriodRange | null
  dates: string[]
} {
  const periodKey = usePeriodStore((s) => s.periodKey)
  const snapshots = useWalletStore((s) => s.snapshots)
  const dates = useMemo(() => snapshotDates(snapshots), [snapshots])
  const range = useMemo(() => resolveDashboardPeriod(periodKey, dates), [periodKey, dates])
  return { periodKey, range, dates }
}
