import type {
  InputHTMLAttributes,
  ButtonHTMLAttributes,
  SelectHTMLAttributes,
  ReactNode,
  ChangeEvent,
  MouseEvent,
} from 'react'
import { forwardRef, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  DATE_RU_PLACEHOLDER,
  caretPosAfterRuDateDigits,
  formatIsoToRu,
  isValidIsoDate,
  maskRuDateInput,
  parseRuToIso,
} from '../../lib/format'
import {
  caretPosAfterMoneyUnits,
  formatFormulaResult,
  moneySignificantCount,
  normalizeMoneyInput,
} from '../../lib/moneyInput'
import { evaluateMoneyFormula, sanitizeFormulaInput } from '../../lib/moneyFormula'
import {
  notifyFormulaMode,
  registerMoneyField,
  revealInvalidMoneyField,
} from '../../lib/moneyFieldRegistry'
import { dataQaFromProps, type DataQaProps } from '../../lib/dataQa'

interface FieldProps {
  label: string
  children: ReactNode
  error?: string
  className?: string
  dataQa?: string
}

export function Field({ label, children, error, className = '', dataQa }: FieldProps) {
  return (
    <label className={`block min-w-0 max-w-full space-y-1 ${className}`} {...dataQaFromProps(dataQa)}>
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  )
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & DataQaProps
>(function Input(props, ref) {
  const { className = '', dataQa, ...rest } = props
  const widthClass =
    className.includes('w-') || className.includes('flex-1') || className.includes('flex-')
      ? ''
      : 'w-full'
  return (
    <input
      ref={ref}
      {...rest}
      {...dataQaFromProps(dataQa)}
      className={`min-w-0 max-w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-900 dark:text-slate-200 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-white dark:bg-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${widthClass} ${className}`}
    />
  )
})

interface MoneyInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'inputMode'
> {
  value: string
  onChange: (value: string) => void
  /** Allow leading minus (default true). */
  allowNegative?: boolean
  dataQa?: string
}

/** Text input with thousand separators (triads) and an optional in-field formula. */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  {
    value,
    onChange,
    allowNegative = true,
    className = '',
    onFocus,
    onBlur,
    onKeyDown,
    disabled,
    readOnly,
    dataQa,
    ...rest
  },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null)
  const localRef = useRef<HTMLInputElement>(null)
  const caretRef = useRef<number | null>(null)
  const ignoreBlurRef = useRef(false)
  const [formulaMode, setFormulaMode] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const formulaModeRef = useRef(false)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const allowNegativeRef = useRef(allowNegative)
  formulaModeRef.current = formulaMode
  valueRef.current = value
  onChangeRef.current = onChange
  allowNegativeRef.current = allowNegative

  const locked = Boolean(disabled || readOnly)
  const displayValue = formulaMode ? value : normalizeMoneyInput(value, { allowNegative })

  useLayoutEffect(() => {
    if (formulaMode) return
    const el = localRef.current
    const caret = caretRef.current
    if (!el || caret === null) return
    el.setSelectionRange(caret, caret)
    caretRef.current = null
  }, [displayValue, formulaMode])

  useEffect(() => {
    notifyFormulaMode()
  }, [formulaMode])

  useEffect(() => {
    return registerMoneyField({
      isFormulaMode: () => formulaModeRef.current,
      commit: () => applyCommit(),
      element: () => rootRef.current,
    })
  }, [])

  function setRefs(node: HTMLInputElement | null) {
    localRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  function commitAmount(raw: string, selectionStart: number) {
    const units = moneySignificantCount(raw.slice(0, selectionStart))
    const next = normalizeMoneyInput(raw, { allowNegative })
    caretRef.current = caretPosAfterMoneyUnits(next, units)
    onChange(next)
  }

  function applyCommit(): boolean {
    if (!formulaModeRef.current) return true
    const raw = valueRef.current
    if (!raw.trim()) {
      formulaModeRef.current = false
      setFormulaMode(false)
      setInvalid(false)
      if (raw !== '') onChangeRef.current('')
      return true
    }
    const result = evaluateMoneyFormula(raw, { allowNegative: allowNegativeRef.current })
    if (result == null) {
      setInvalid(true)
      return false
    }
    formulaModeRef.current = false
    setFormulaMode(false)
    setInvalid(false)
    onChangeRef.current(formatFormulaResult(result))
    return true
  }

  function commitThisField() {
    let ok = true
    flushSync(() => {
      ok = applyCommit()
    })
    if (!ok) revealInvalidMoneyField(rootRef.current, false)
    return ok
  }

  function enableFormula() {
    const el = localRef.current
    const wasFocused = el != null && document.activeElement === el
    ignoreBlurRef.current = true
    flushSync(() => {
      formulaModeRef.current = true
      setFormulaMode(true)
      setInvalid(false)
    })
    if (wasFocused) el?.blur()
    el?.focus()
    const len = el?.value.length ?? 0
    try {
      el?.setSelectionRange(len, len)
    } catch {
      /* decimal input may reject selection before mode switches */
    }
    ignoreBlurRef.current = false
  }

  const widthClass =
    className.includes('w-') || className.includes('flex-1') || className.includes('flex-')
      ? className
      : `w-full ${className}`.trim()

  return (
    <div
      ref={rootRef}
      className={`relative min-w-0 scroll-mt-16 ${widthClass}`}
      data-formula-mode={formulaMode ? 'true' : 'false'}
      data-money-invalid={invalid ? 'true' : 'false'}
    >
      <Input
        {...rest}
        {...dataQaFromProps(dataQa)}
        ref={setRefs}
        type="text"
        inputMode={formulaMode ? 'text' : 'decimal'}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        readOnly={readOnly}
        value={displayValue}
        aria-invalid={invalid || undefined}
        className={`w-full ${locked ? '' : '!pr-9'} ${
          invalid
            ? '!border-red-500 focus:!border-red-500 focus:!ring-red-100 dark:!border-red-400 dark:focus:!ring-red-900/50'
            : ''
        }`}
        onFocus={onFocus}
        onBlur={(e) => {
          if (ignoreBlurRef.current) return
          if (formulaModeRef.current) commitThisField()
          onBlur?.(e)
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e)
          if (e.defaultPrevented || e.key !== 'Enter' || !formulaModeRef.current) return
          e.preventDefault()
          if (!commitThisField()) return
          const el = e.currentTarget
          ignoreBlurRef.current = true
          el.blur()
          el.focus()
          ignoreBlurRef.current = false
        }}
        onChange={(e) => {
          if (formulaModeRef.current) {
            setInvalid(false)
            onChange(sanitizeFormulaInput(e.target.value))
            return
          }
          commitAmount(e.target.value, e.target.selectionStart ?? e.target.value.length)
        }}
        onPaste={(e) => {
          e.preventDefault()
          const text = e.clipboardData.getData('text')
          if (formulaModeRef.current) {
            const el = e.currentTarget
            const start = el.selectionStart ?? valueRef.current.length
            const end = el.selectionEnd ?? start
            setInvalid(false)
            onChange(sanitizeFormulaInput(valueRef.current.slice(0, start) + text + valueRef.current.slice(end)))
            return
          }
          commitAmount(text, text.length)
        }}
      />
      {!locked && (
        <button
          type="button"
          tabIndex={-1}
          title={formulaMode ? 'Вычислить' : 'Формула'}
          aria-label={formulaMode ? 'Вычислить' : 'Формула'}
          aria-pressed={formulaMode}
          className={`absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg ${
            formulaMode
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200'
          }`}
          {...dataQaFromProps(dataQa ? `${dataQa}-calc` : undefined)}
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={() => {
            if (!formulaModeRef.current) {
              enableFormula()
              return
            }
            if (!commitThisField()) return
            const el = localRef.current
            ignoreBlurRef.current = true
            el?.blur()
            el?.focus()
            ignoreBlurRef.current = false
          }}
        >
          {formulaMode ? <EnterIcon className="h-4 w-4" /> : <CalculatorIcon className="h-4 w-4" />}
        </button>
      )}
    </div>
  )
})

function CalculatorIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path strokeLinecap="round" d="M8 7.5h8" />
      <path
        strokeLinecap="round"
        d="M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"
      />
    </svg>
  )
}

function EnterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7v4a2 2 0 0 1-2 2H7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m10 10-3 3 3 3" />
    </svg>
  )
}

interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string
  onChange: (iso: string) => void
  dataQa?: string
}

export function DateInput({
  value,
  onChange,
  className = '',
  id,
  disabled,
  min,
  max,
  dataQa,
  ...rest
}: DateInputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const [text, setText] = useState(() => formatIsoToRu(value))
  const pickerRef = useRef<HTMLInputElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const caretRef = useRef<number | null>(null)
  const focusedRef = useRef(false)

  useEffect(() => {
    if (focusedRef.current) return
    setText(value ? formatIsoToRu(value) : '')
  }, [value])

  useLayoutEffect(() => {
    const el = textInputRef.current
    const caret = caretRef.current
    if (!el || caret === null) return
    el.setSelectionRange(caret, caret)
    caretRef.current = null
  }, [text])

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    const selectionStart = e.target.selectionStart ?? raw.length
    const digitsBeforeCaret = raw.slice(0, selectionStart).replace(/\D/g, '').length
    const masked = maskRuDateInput(raw)
    caretRef.current = caretPosAfterRuDateDigits(masked, digitsBeforeCaret)
    setText(masked)
    const iso = parseRuToIso(masked)
    if (iso !== null) onChange(iso)
  }

  function handleBlur() {
    focusedRef.current = false
    if (!text.trim()) {
      onChange('')
      return
    }
    const iso = parseRuToIso(text)
    if (iso) {
      setText(formatIsoToRu(iso))
      onChange(iso)
      return
    }
    setText(value ? formatIsoToRu(value) : '')
  }

  function handlePickerChange(e: ChangeEvent<HTMLInputElement>) {
    const iso = e.target.value
    onChange(iso)
    setText(iso ? formatIsoToRu(iso) : '')
  }

  function openPicker(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const el = pickerRef.current
    if (!el || disabled) return
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker()
        return
      }
    } catch {
      /* fall through to click() */
    }
    el.click()
  }

  const widthClass =
    className.includes('w-') || className.includes('flex-1') || className.includes('flex-')
      ? ''
      : 'w-full'

  const pickerValue = value && isValidIsoDate(value) ? value : ''

  return (
    <div className={`relative flex min-w-0 items-stretch ${widthClass}`} {...dataQaFromProps(dataQa)}>
      <input
        {...rest}
        ref={textInputRef}
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={DATE_RU_PLACEHOLDER}
        maxLength={10}
        value={text}
        disabled={disabled}
        onFocus={() => {
          focusedRef.current = true
        }}
        onChange={handleChange}
        onBlur={handleBlur}
        className="min-w-0 flex-1 rounded-l-lg border border-r-0 border-slate-300 dark:border-slate-600 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 dark:disabled:bg-slate-800 dark:bg-slate-800/60"
        {...dataQaFromProps(dataQa ? `${dataQa}-text` : undefined)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={openPicker}
        title="Выбрать дату"
        aria-label="Выбрать дату"
        className="inline-flex shrink-0 items-center justify-center rounded-r-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800/60 hover:text-slate-700 dark:hover:text-slate-300 dark:text-slate-300 disabled:opacity-50"
        {...dataQaFromProps(dataQa ? `${dataQa}-picker` : undefined)}
      >
        <CalendarIcon className="h-4 w-4" />
      </button>
      <input
        ref={pickerRef}
        type="date"
        value={pickerValue}
        min={typeof min === 'string' ? min : undefined}
        max={typeof max === 'string' ? max : undefined}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden
        onChange={handlePickerChange}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      />
    </div>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 2v3M16 2v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
      />
    </svg>
  )
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement> & DataQaProps) {
  const { className = '', dataQa, ...rest } = props
  const widthClass =
    className.includes('w-') || className.includes('flex-1') || className.includes('flex-')
      ? ''
      : 'w-full'
  return (
    <select
      {...rest}
      {...dataQaFromProps(dataQa)}
      className={`min-w-0 max-w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${widthClass} ${className}`}
    />
  )
}

export function Button({
  variant = 'primary',
  dataQa,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' } & DataQaProps) {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary:
      'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700',
    danger: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900 hover:bg-red-100 dark:hover:bg-red-950/60',
  }
  return (
    <button
      {...props}
      {...dataQaFromProps(dataQa)}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${variants[variant]} ${props.className ?? ''}`}
    />
  )
}

export function Card({
  children,
  className = '',
  dataQa,
}: {
  children: ReactNode
  className?: string
  dataQa?: string
}) {
  return (
    <div
      className={`min-w-0 max-w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-5 ${className}`}
      {...dataQaFromProps(dataQa)}
    >
      {children}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  dataQa,
}: {
  title: string
  description: string
  dataQa?: string
}) {
  return (
    <div
      className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 px-6 py-10 text-center"
      {...dataQaFromProps(dataQa)}
    >
      <p className="font-medium text-slate-700 dark:text-slate-300">{title}</p>
      <p className="mt-1 whitespace-pre-line text-sm text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  )
}
