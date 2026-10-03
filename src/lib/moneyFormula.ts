/** Arithmetic for money fields: digits, spaces, + − * / and parentheses. No eval. */

const FORMULA_CHARS = /[+*/()]/
const BINARY_MINUS = /\d\s*-\s*[\d(]/

export function hasFormulaSyntax(raw: string): boolean {
  return FORMULA_CHARS.test(raw) || BINARY_MINUS.test(raw)
}

/** Keep digits, spaces, decimal separators and operators. Map × ÷ and unicode minus. */
export function sanitizeFormulaInput(raw: string): string {
  const normalized = raw.replace(/[×⋅·]/g, '*').replace(/÷/g, '/').replace(/[−–—]/g, '-')
  let out = ''
  for (const ch of normalized) {
    if ((ch >= '0' && ch <= '9') || '+-*/().,'.includes(ch)) {
      out += ch
      continue
    }
    if (ch === ' ' || ch === '\u00A0' || ch === '\u202F') out += ' '
  }
  return out
}

export function roundFormulaNumber(value: number): number {
  if (!Number.isFinite(value)) return value
  const rounded = Math.round(value * 1e10) / 1e10
  return Object.is(rounded, -0) ? 0 : rounded
}

type Op = '+' | '-' | '*' | '/'
type Tok =
  | { kind: 'num'; value: number }
  | { kind: 'op'; op: Op }
  | { kind: '(' | ')' }

function parseNumberToken(raw: string): number | null {
  if (!raw || raw === '.' || raw === ',') return null
  const comma = raw.includes(',')
  const dot = raw.includes('.')
  if (comma && dot) return null
  const sep = comma ? ',' : dot ? '.' : null
  if (!sep) {
    if (!/^\d+$/.test(raw)) return null
  } else {
    const parts = raw.split(sep)
    if (parts.length !== 2) return null
    const [whole, frac] = parts
    if (whole == null || frac == null) return null
    if (whole !== '' && !/^\d+$/.test(whole)) return null
    if (frac !== '' && !/^\d+$/.test(frac)) return null
    if (whole === '' && frac === '') return null
  }
  const value = Number(raw.replace(',', '.'))
  return Number.isFinite(value) ? value : null
}

function tokenize(raw: string): Tok[] | null {
  const s = raw.replace(/\s+/g, ' ').trim()
  if (!s) return []
  const tokens: Tok[] = []
  let i = 0
  while (i < s.length) {
    const ch = s[i]!
    if (ch === ' ') {
      i += 1
      continue
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ kind: ch })
      i += 1
      continue
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ kind: 'op', op: ch })
      i += 1
      continue
    }
    if ((ch >= '0' && ch <= '9') || ch === '.' || ch === ',') {
      let body = ''
      while (i < s.length) {
        const c = s[i]!
        if ((c >= '0' && c <= '9') || c === '.' || c === ',') {
          body += c
          i += 1
          continue
        }
        if (c === ' ') {
          let j = i + 1
          while (j < s.length && s[j] === ' ') j += 1
          const next = s[j]
          if (next != null && next >= '0' && next <= '9') {
            i = j
            continue
          }
        }
        break
      }
      const value = parseNumberToken(body)
      if (value == null) return null
      tokens.push({ kind: 'num', value })
      continue
    }
    return null
  }
  return tokens
}

interface Parsed {
  value: number
  next: number
}

function parseExpr(tokens: Tok[], index: number): Parsed | null {
  let left = parseTerm(tokens, index)
  if (!left) return null
  while (left.next < tokens.length) {
    const tok: Tok | undefined = tokens[left.next]
    if (!tok || tok.kind !== 'op' || (tok.op !== '+' && tok.op !== '-')) break
    const right = parseTerm(tokens, left.next + 1)
    if (!right) return null
    left = {
      value: tok.op === '+' ? left.value + right.value : left.value - right.value,
      next: right.next,
    }
  }
  return left
}

function parseTerm(tokens: Tok[], index: number): Parsed | null {
  let left = parseUnary(tokens, index)
  if (!left) return null
  while (left.next < tokens.length) {
    const tok: Tok | undefined = tokens[left.next]
    if (!tok || tok.kind !== 'op' || (tok.op !== '*' && tok.op !== '/')) break
    const right = parseUnary(tokens, left.next + 1)
    if (!right) return null
    if (tok.op === '/' && right.value === 0) return null
    left = {
      value: tok.op === '*' ? left.value * right.value : left.value / right.value,
      next: right.next,
    }
  }
  return left
}

function parseUnary(tokens: Tok[], index: number): Parsed | null {
  const tok = tokens[index]
  if (tok?.kind === 'op' && tok.op === '-') {
    const inner = parseUnary(tokens, index + 1)
    if (!inner) return null
    return { value: -inner.value, next: inner.next }
  }
  return parsePrimary(tokens, index)
}

function parsePrimary(tokens: Tok[], index: number): Parsed | null {
  const tok = tokens[index]
  if (!tok) return null
  if (tok.kind === 'num') return { value: tok.value, next: index + 1 }
  if (tok.kind === '(') {
    const inner = parseExpr(tokens, index + 1)
    if (!inner) return null
    if (tokens[inner.next]?.kind !== ')') return null
    return { value: inner.value, next: inner.next + 1 }
  }
  return null
}

/** Evaluate a money formula. Empty input and any syntax/math error → null. */
export function evaluateMoneyFormula(
  raw: string,
  options?: { allowNegative?: boolean },
): number | null {
  const tokens = tokenize(sanitizeFormulaInput(raw))
  if (!tokens || tokens.length === 0) return null
  const parsed = parseExpr(tokens, 0)
  if (!parsed || parsed.next !== tokens.length || !Number.isFinite(parsed.value)) return null
  const rounded = roundFormulaNumber(parsed.value)
  if (options?.allowNegative === false && rounded < 0) return null
  return rounded
}
