// Admin › Numbers (V113, selling P6; Admin board "Which lock works"): what admin.sell_numbers sends and how a row reads.
// Every number counts businesses, never their customers.

export type NumberRow = { key: string; name: string; place: Place; seen: number; tapped: number; notNow: number; asked: number; bought: number }
export type Place = 'menu' | 'page' | 'home' | 'limit'
export type What = 'seen' | 'tapped' | 'not_now' | 'asked' | 'bought' | 'no_lock'
export type NumbersData = {
  days: number; rows: NumberRow[]; totals: { seen: number; tapped: number; bought: number }; trials: { started: number; kept: number }
  noLock: { key: string; name: string; n: number }[]; plans: { code: string; name: string }[]; industries: string[]
}
export type Shop = { orgId: string; name: string; industry?: string; ownerId: string; ownerName?: string }

export const DAYS = [7, 30, 90] as const
export const PLACE_WORD: Record<Place, string> = { menu: 'Menu', page: 'Inside its page', home: 'Home card', limit: 'At a limit' }
export const WHAT_WORD: Record<What, string> = { seen: 'Saw it', tapped: 'Tapped', not_now: 'Not now', asked: 'Asked the owner', bought: 'Bought', no_lock: 'Bought without a lock' }

/** The tap bar: this row's taps against the most tapped row (0–100). */
export const tapShare = (row: NumberRow, rows: readonly NumberRow[]) => {
  const top = Math.max(0, ...rows.map((r) => r.tapped))
  return top ? Math.round((row.tapped / top) * 100) : 0
}

/** One plain hint per row: many seen and few taps → the words or the number; many taps and few bought → the price. */
export const rowHint = (row: NumberRow): string | null => {
  if (row.seen >= 5 && row.tapped * 10 < row.seen) return 'Few taps: try other words or another number on the lock.'
  if (row.tapped >= 5 && row.bought * 5 < row.tapped) return 'Few buy after tapping: look at the price.'
  return null
}
