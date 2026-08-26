import { ANALYTICS_NAV_ITEMS } from '../../lib/navSections'
import { sectionToPath } from '../../lib/appRoutes'
import type { AnalyticsSection } from '../../types/wallet'
import { PageHeader } from '../ui/PageHeader'
import { PeriodFilter } from '../ui/PeriodFilter'

interface AnalyticsPanelProps {
  onOpenSection: (section: AnalyticsSection) => void
}

export function AnalyticsPanel({ onOpenSection }: AnalyticsPanelProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Аналитика"
        description="Подробные отчёты по дням, типам счетов, валютам и кредитному float"
        actions={<PeriodFilter showRange />}
      />

      <ul className="space-y-2">
        {ANALYTICS_NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <a
              href={sectionToPath(item.id)}
              onClick={(e) => {
                e.preventDefault()
                onOpenSection(item.id)
              }}
              className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-blue-300 hover:bg-blue-50/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-700 dark:hover:bg-blue-950/30"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                  {item.description}
                </span>
              </span>
              <span className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden>
                →
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
