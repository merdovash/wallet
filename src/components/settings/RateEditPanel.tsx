import { useEffect, useMemo, useState } from 'react'
import { currencyLabel } from '../../lib/currency'
import { findFxOverride, baseToRubPerUnit, rateInBase } from '../../lib/fxRates'
import { formatDateDisplay } from '../../lib/format'
import { formatMoneyInput, parseMoneyInput } from '../../lib/moneyInput'
import { useWalletStore } from '../../store/walletStore'
import { Button, Field, Input, MoneyInput } from '../ui/FormControls'
import { EntityEditPanel } from '../ui/EntityEditPanel'

interface RateEditPanelProps {
  open: boolean
  date: string | null
  currency: string | null
  baseCurrency: string
  cbrPivot: Record<string, number>
  onClose: () => void
}

function toInput(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return ''
  return formatMoneyInput(String(value).replace('.', ','))
}

export function RateEditPanel({
  open,
  date,
  currency,
  baseCurrency,
  cbrPivot,
  onClose,
}: RateEditPanelProps) {
  const overrides = useWalletStore((s) => s.fxOverrides)
  const upsertFxOverride = useWalletStore((s) => s.upsertFxOverride)
  const deleteFxOverride = useWalletStore((s) => s.deleteFxOverride)

  const existing = useMemo(
    () => (date && currency ? findFxOverride(overrides, date, currency) : undefined),
    [overrides, date, currency],
  )

  const cbrDisplay = currency ? rateInBase(cbrPivot, currency, baseCurrency) : null

  const [buyText, setBuyText] = useState('')
  const [sellText, setSellText] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const buy = existing
      ? rateInBase({ ...cbrPivot, [currency!]: existing.buyRate }, currency!, baseCurrency)
      : cbrDisplay
    const sell = existing
      ? rateInBase({ ...cbrPivot, [currency!]: existing.sellRate }, currency!, baseCurrency)
      : cbrDisplay
    setBuyText(toInput(buy))
    setSellText(toInput(sell))
    setComment(existing?.comment ?? '')
    setError(null)
  }, [open, existing, cbrDisplay, cbrPivot, currency, baseCurrency])

  const buyParsed = parseMoneyInput(buyText)
  const sellParsed = parseMoneyInput(sellText)
  const canSave =
    Boolean(date && currency) &&
    buyParsed != null &&
    buyParsed > 0 &&
    sellParsed != null &&
    sellParsed > 0 &&
    !busy

  async function handleSave() {
    if (!date || !currency || buyParsed == null || sellParsed == null) return
    const buyRub = baseToRubPerUnit(buyParsed, baseCurrency, cbrPivot)
    const sellRub = baseToRubPerUnit(sellParsed, baseCurrency, cbrPivot)
    if (buyRub == null || sellRub == null) {
      setError('Сначала загрузите курс ЦБ для этой даты — иначе нельзя пересчитать в рубли')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await upsertFxOverride({
        date,
        currency,
        buyRate: buyRub,
        sellRate: sellRub,
        comment: comment.trim() || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить курс')
    } finally {
      setBusy(false)
    }
  }

  async function handleReset() {
    if (!date || !currency || !existing) return
    setBusy(true)
    setError(null)
    try {
      await deleteFxOverride(date, currency)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сбросить курс')
    } finally {
      setBusy(false)
    }
  }

  const title =
    date && currency
      ? `${currency} → ${baseCurrency} · ${formatDateDisplay(date)}`
      : 'Курс'

  return (
    <EntityEditPanel
      open={open}
      title={title}
      onClose={onClose}
      onSave={handleSave}
      saveDisabled={!canSave}
      saveActionId="fx-rate-save"
      dataQa="rate-edit"
    >
      <div className="space-y-4">
        {currency ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{currencyLabel(currency)}</p>
        ) : null}
        {cbrDisplay != null ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Курс ЦБ: {toInput(cbrDisplay)} {baseCurrency} за 1 {currency}
          </p>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500">В кэше ЦБ этой котировки нет</p>
        )}
        <Field label={`Покупка, ${baseCurrency} за 1 ${currency ?? ''}`}>
          <MoneyInput
            value={buyText}
            onChange={setBuyText}
            allowNegative={false}
            dataQa="rate-edit-buy"
          />
        </Field>
        <Field label={`Продажа, ${baseCurrency} за 1 ${currency ?? ''}`}>
          <MoneyInput
            value={sellText}
            onChange={setSellText}
            allowNegative={false}
            dataQa="rate-edit-sell"
          />
        </Field>
        <Field label="Комментарий">
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="необязательно"
            dataQa="rate-edit-comment"
          />
        </Field>
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {existing ? (
          <Button
            type="button"
            variant="danger"
            className="w-full"
            disabled={busy}
            onClick={() => void handleReset()}
            dataQa="rate-edit-reset"
          >
            Сбросить курс
          </Button>
        ) : null}
      </div>
    </EntityEditPanel>
  )
}
