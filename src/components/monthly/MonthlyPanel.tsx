import { dataQa } from '../../lib/dataQa'
import { MonthlyReturnsTable } from '../dashboard/MonthlyReturnsTable'
import { FxModeToggle } from '../ui/FxModeToggle'
import { PageHeader } from '../ui/PageHeader'
import { PeriodFilter } from '../ui/PeriodFilter'

export function MonthlyPanel() {
  return (
    <div className="mx-auto max-w-5xl space-y-4" {...dataQa('monthly-page')}>
      <PageHeader
        title="Помесячно"
        description="Прирост по месяцам в процентах и пересчёт в годовые"
        actions={
          <>
            <PeriodFilter showRange />
            <FxModeToggle showLabel={false} compact className="shrink-0" />
          </>
        }
      />
      <MonthlyReturnsTable />
    </div>
  )
}
