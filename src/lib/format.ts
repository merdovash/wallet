export function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${currency}`
  }
}

/**
 * Компактная подпись оси: 8_000_000 → «8М», 12_500 → «12,5тыс», 800 → «800».
 */
export function formatCompactAxisValue(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value < 0 ? '−' : ''
  const abs = Math.abs(value)

  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000
    return `${sign}${formatCompactCoefficient(millions)}М`
  }
  if (abs >= 1_000) {
    const thousands = abs / 1_000
    return `${sign}${formatCompactCoefficient(thousands)}тыс`
  }
  return `${sign}${Math.round(abs).toLocaleString('ru-RU')}`
}

function formatCompactCoefficient(value: number): string {
  if (Number.isInteger(value) || Math.abs(value - Math.round(value)) < 1e-9) {
    return String(Math.round(value))
  }
  return value
    .toFixed(1)
    .replace(/\.0$/, '')
    .replace('.', ',')
}

export const DATE_RU_PLACEHOLDER = 'ДД.ММ.ГГГГ'

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const RU_DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/

function isValidDateParts(day: number, month: number, year: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1000 || year > 9999) {
    return false
  }
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  )
}

export function isValidIsoDate(iso: string): boolean {
  const match = iso.match(ISO_DATE_RE)
  if (!match) return false
  return isValidDateParts(Number(match[3]), Number(match[2]), Number(match[1]))
}

export function formatIsoToRu(iso: string): string {
  if (!iso) return ''
  const match = iso.match(ISO_DATE_RE)
  if (!match) return iso
  return `${match[3]}.${match[2]}.${match[1]}`
}

export function parseRuToIso(ru: string): string | null {
  const trimmed = ru.trim()
  if (!trimmed) return ''
  const match = trimmed.match(RU_DATE_RE)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  if (!isValidDateParts(day, month, year)) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function maskRuDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`
}

/** Cursor index in a masked RU date after `digitCount` digits (for caret restore). */
export function caretPosAfterRuDateDigits(masked: string, digitCount: number): number {
  if (digitCount <= 0) return 0
  let seen = 0
  for (let i = 0; i < masked.length; i++) {
    if (/\d/.test(masked[i]!)) {
      seen += 1
      if (seen === digitCount) return i + 1
    }
  }
  return masked.length
}

export function formatDateDisplay(value: string): string {
  if (!value) return '—'
  if (ISO_DATE_RE.test(value)) return formatIsoToRu(value)
  return value
}

/** ISO datetime (или дата) → «15.01.2026, 14:30». */
export function formatDateTimeDisplay(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    if (ISO_DATE_RE.test(value)) return formatIsoToRu(value)
    return value
  }
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatShortDate(iso: string): string {
  if (!ISO_DATE_RE.test(iso)) return iso
  const [, month, day] = iso.match(ISO_DATE_RE) ?? []
  return `${day}.${month}`
}

export function todayIsoDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function signedAmount(amount: number, currency: string): string {
  const formatted = formatCurrency(Math.abs(amount), currency)
  if (amount > 0) return `+${formatted}`
  if (amount < 0) return `−${formatCurrency(Math.abs(amount), currency)}`
  return formatted
}

/** Signed percent with one decimal, e.g. +1,2% / −0,5%. */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const pct = value * 100
  const abs = Math.abs(pct).toFixed(digits).replace('.', ',')
  if (pct > 0) return `+${abs}%`
  if (pct < 0) return `−${abs}%`
  return `${abs}%`
}
