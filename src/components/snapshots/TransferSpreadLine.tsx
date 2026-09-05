import { signedAmount } from '../../lib/format'
import { isMeaningfulTransferSpread } from '../../lib/transferAmounts'

export function TransferSpreadLine({
  spread,
  currency,
  className = '',
  dataQa,
}: {
  spread: number
  currency: string
  className?: string
  dataQa?: string
}) {
  if (!isMeaningfulTransferSpread(spread)) return null
  const tone =
    spread > 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : 'text-red-600 dark:text-red-400'
  return (
    <p
      className={`tabular-nums ${tone} ${className}`}
      data-qa={dataQa}
    >
      Курсовая разница / комиссия {signedAmount(spread, currency)}
    </p>
  )
}
