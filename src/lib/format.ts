// Formatting for the admin portal: rupees, numbers and dates in Indian style.

const number = new Intl.NumberFormat('en-IN')
const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export const formatNumber = (value: number | null | undefined) => number.format(value ?? 0)
export const formatRupees = (value: number | null | undefined) => rupees.format(value ?? 0)

/** "1 Nov 2026" for a date or date-time; "—" when missing. */
export function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "1 Nov 2026, 3:05 pm". */
export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** "5 min ago", "3 days ago", or the date when older than a month. */
export function formatAgo(value: string | null | undefined, now = Date.now()) {
  if (!value) return 'never'
  const minutes = Math.round((now - new Date(value).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days <= 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatDate(value)
}

export const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : '—')

/** Digits for wa.me and tel: links (Indian numbers are stored as +91…). */
export const phoneDigits = (phone: string | null | undefined) => (phone ?? '').replace(/\D/g, '')

export const STATE_LABELS: Record<string, string> = { free: 'Free', paid: 'Paid', grace: 'In grace', lapsed: 'Lapsed to Free', not_set_up: 'Not set up' }
export const LEAD_STATUSES = ['new', 'contacted', 'follow_up', 'won', 'lost', 'closed'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]
export const LEAD_LABELS: Record<LeadStatus, string> = { new: 'New', contacted: 'Contacted', follow_up: 'Follow up', won: 'Won', lost: 'Lost', closed: 'Closed' }
