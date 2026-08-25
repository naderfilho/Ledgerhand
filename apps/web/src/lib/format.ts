/**
 * ---------------------------------------------------------------------------
 * Display formatting
 * ---------------------------------------------------------------------------
 * These take the canonical decimal strings the domain produces -- "1234.56",
 * not 1234.56 -- and group them for reading. No value is ever converted to a
 * JavaScript number on the way to the screen, so the display cannot disagree
 * with the ledger by a cent even at amounts where a float would.
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function split(decimal: string): { sign: string; whole: string; fraction: string } {
  const sign = decimal.startsWith('-') ? '-' : ''
  const [whole = '0', fraction = ''] = decimal.replace('-', '').split('.')
  return { sign, whole, fraction }
}

/** `"1234.56"` becomes `"R$ 1,234.56"`. */
export function formatCurrency(decimal: string, symbol = 'R$'): string {
  const { sign, whole, fraction } = split(decimal)
  const cents = fraction.padEnd(2, '0').slice(0, 2)
  return `${sign}${symbol} ${groupDigits(whole)}.${cents}`
}

/** The same without the symbol, for columns whose header already says it. */
export function formatAmount(decimal: string): string {
  const { sign, whole, fraction } = split(decimal)
  return `${sign}${groupDigits(whole)}.${fraction.padEnd(2, '0').slice(0, 2)}`
}

/** Quantities keep only the decimals they actually use: 12, 12.5, 0.001. */
export function formatQuantity(decimal: string, unit?: string): string {
  const { sign, whole, fraction } = split(decimal)
  const trimmed = fraction.replace(/0+$/, '')
  const body = trimmed === '' ? groupDigits(whole) : `${groupDigits(whole)}.${trimmed}`
  return unit === undefined ? `${sign}${body}` : `${sign}${body} ${unit}`
}

/** `"2026-03-16"` becomes `"16 Mar 2026"`. */
export function formatDate(businessDate: string): string {
  const [year, month, day] = businessDate.split('-')
  if (year === undefined || month === undefined || day === undefined) return businessDate
  return `${day} ${MONTHS[Number(month) - 1] ?? month} ${year}`
}

/** Drops the year when the date is in the current one: `"16 Mar"`. */
export function formatDateShort(businessDate: string, today: string): string {
  const full = formatDate(businessDate)
  return businessDate.slice(0, 4) === today.slice(0, 4) ? full.slice(0, full.length - 5) : full
}

export function formatDateTime(iso: string, timeZone = 'America/Sao_Paulo'): string {
  const instant = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(instant)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant)
  return `${date}, ${time}`
}

/** "in 4 days", "today", "12 days ago" -- for due dates, where lateness is the point. */
export function formatDueness(dueDate: string, today: string): string {
  const days = daysBetween(today, dueDate)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${String(days)} days` : `${String(-days)} days ago`
}

export function daysBetween(from: string, to: string): number {
  const parse = (value: string): number => {
    const [year = '0', month = '1', day = '1'] = value.split('-')
    return Date.UTC(Number(year), Number(month) - 1, Number(day))
  }
  return Math.round((parse(to) - parse(from)) / 86_400_000)
}

/** Percentage from two decimal strings, for margins and variances. */
export function formatPercent(value: number, fractionDigits = 1): string {
  return `${(value * 100).toFixed(fractionDigits)}%`
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?'
}
