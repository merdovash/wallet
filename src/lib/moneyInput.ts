/** Keep only characters valid in a money amount: digits, one `.`/`,`, optional leading `-`. */
export function sanitizeMoneyInput(
  raw: string,
  options?: { allowNegative?: boolean },
): string {
  const allowNegative = options?.allowNegative ?? true
  const cleaned = raw.replace(/\s/g, '')
  let result = ''
  let seenSep = false

  for (const ch of cleaned) {
    if (ch === '-' && allowNegative && result.length === 0) {
      result += ch
      continue
    }
    if (ch >= '0' && ch <= '9') {
      result += ch
      continue
    }
    if ((ch === '.' || ch === ',') && !seenSep) {
      seenSep = true
      result += ch
    }
  }

  return result
}

/** Group integer digits into thousands (triads), keep decimal part as-is. */
export function formatMoneyInput(sanitized: string): string {
  if (!sanitized) return ''

  let sign = ''
  let body = sanitized
  if (body.startsWith('-')) {
    sign = '-'
    body = body.slice(1)
  }

  const sepMatch = /[.,]/.exec(body)
  const sepIndex = sepMatch?.index ?? -1
  const intRaw = sepIndex >= 0 ? body.slice(0, sepIndex) : body
  const frac = sepIndex >= 0 ? body.slice(sepIndex) : ''

  const grouped = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return sign + grouped + frac
}

/** Sanitize then apply thousand separators for display / controlled value. */
export function normalizeMoneyInput(
  raw: string,
  options?: { allowNegative?: boolean },
): string {
  return formatMoneyInput(sanitizeMoneyInput(raw, options))
}

/** Count digits / sign / decimal sep before caret (spaces ignored). */
export function moneySignificantCount(text: string): number {
  let n = 0
  for (const ch of text) {
    if ((ch >= '0' && ch <= '9') || ch === '-' || ch === '.' || ch === ',') n += 1
  }
  return n
}

/** Caret index in formatted money after `units` significant characters. */
export function caretPosAfterMoneyUnits(formatted: string, units: number): number {
  if (units <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    const ch = formatted[i]!
    if ((ch >= '0' && ch <= '9') || ch === '-' || ch === '.' || ch === ',') {
      seen += 1
      if (seen >= units) return i + 1
    }
  }
  return formatted.length
}

/** Parse sanitized / grouped money text to number; empty → null. */
export function parseMoneyInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, '')
  if (!trimmed || trimmed === '-' || trimmed === '.' || trimmed === ',') return null
  const value = Number(trimmed.replace(',', '.'))
  return Number.isFinite(value) ? value : null
}
