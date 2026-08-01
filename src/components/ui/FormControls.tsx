import type {
  InputHTMLAttributes,
  ButtonHTMLAttributes,
  SelectHTMLAttributes,
  ReactNode,
  ChangeEvent,
  MouseEvent,
} from 'react'
import { forwardRef, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
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
  moneySignificantCount,
  normalizeMoneyInput,
} from '../../lib/moneyInput'

interface FieldProps {
  label: string
  children: ReactNode
  error?: string
  className?: string
}

export function Field({ label, children, error, className = '' }: FieldProps) {
  return (
    <label className={`block min-w-0 max-w-full space-y-1 ${className}`}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) {
    const { className = '', ...rest } = props
    const widthClass =
      className.includes('w-') || className.includes('flex-1') || className.includes('flex-')
        ? ''
        : 'w-full'
    return (
      <input
        ref={ref}
        {...rest}
        className={`min-w-0 max-w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${widthClass} ${className}`}
      />
    )
  },
)

interface MoneyInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'inputMode'
> {
  value: string
  onChange: (value: string) => void
  /** Allow leading minus (default true). */
  allowNegative?: boolean
}

/** Text input with thousand separators (triads) for easier entry. */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, allowNegative = true, className = '', onFocus, onBlur, ...rest },
  ref,
) {
  const localRef = useRef<HTMLInputElement>(null)
  const caretRef = useRef<number | null>(null)
  const displayValue = normalizeMoneyInput(value, { allowNegative })

  useLayoutEffect(() => {
    const el = localRef.current
    const caret = caretRef.current
    if (!el || caret === null) return
    el.setSelectionRange(caret, caret)
    caretRef.current = null
  }, [displayValue])

  function setRefs(node: HTMLInputElement | null) {
    localRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  function commit(raw: string, selectionStart: number) {
    const units = moneySignificantCount(raw.slice(0, selectionStart))
    const next = normalizeMoneyInput(raw, { allowNegative })
    caretRef.current = caretPosAfterMoneyUnits(next, units)
    onChange(next)
  }

  return (
    <Input
      {...rest}
      ref={setRefs}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={displayValue}
      className={className}
      onFocus={onFocus}
      onBlur={onBlur}
      onChange={(e) => commit(e.target.value, e.target.selectionStart ?? e.target.value.length)}
      onPaste={(e) => {
        e.preventDefault()
        const text = e.clipboardData.getData('text')
        commit(text, text.length)
      }}
    />
  )
})

interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string
  onChange: (iso: string) => void
}

export function DateInput({ value, onChange, className = '', id, disabled, ...rest }: DateInputProps) {
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
    <div className={`relative flex min-w-0 items-stretch ${widthClass}`}>
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
        className="min-w-0 flex-1 rounded-l-lg border border-r-0 border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={openPicker}
        title="Выбрать дату"
        aria-label="Выбрать дату"
        className="inline-flex shrink-0 items-center justify-center rounded-r-lg border border-slate-300 bg-white px-2.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
      >
        <CalendarIcon className="h-4 w-4" />
      </button>
      <input
        ref={pickerRef}
        type="date"
        value={pickerValue}
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

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', ...rest } = props
  const widthClass =
    className.includes('w-') || className.includes('flex-1') || className.includes('flex-')
      ? ''
      : 'w-full'
  return (
    <select
      {...rest}
      className={`min-w-0 max-w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${widthClass} ${className}`}
    />
  )
}

export function Button({
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
    danger: 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100',
  }
  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${variants[variant]} ${props.className ?? ''}`}
    />
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 max-w-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {children}
    </div>
  )
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  )
}
