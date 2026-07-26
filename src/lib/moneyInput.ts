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

/** Parse sanitized money text to number; empty → null. */
export function parseMoneyInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed === '-' || trimmed === '.' || trimmed === ',') return null
  const value = Number(trimmed.replace(',', '.'))
  return Number.isFinite(value) ? value : null
}
