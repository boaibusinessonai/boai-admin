import { formatDate } from './format'

// Admin › One customer (187c, board AdminCustomer): the words of the packages grid, worked out from what the
// database already sends (admin.store_features per store, admin.entitlements grants). Read only.

export type StoreFeature = { key: string; name: string; monthlyPaise?: number; on: boolean; source?: string }
export type Grant = { id: string; key: string; source: string; scope: 'account' | 'business' | 'store'; storeId?: string; limit?: number; until?: string; reason?: string }

/** One store's cell: On, Off (owner) = the shop owner switched it off there, Off (by us) = an admin's off switch, — = not taken. */
export function storeCell(feature: StoreFeature | undefined): { text: string; tone: 'on' | 'off' } {
  if (feature?.on) return { text: 'On', tone: 'on' }
  if (feature?.source === 'store_off') return { text: 'Off (owner)', tone: 'off' }
  if (feature?.source === 'admin_off') return { text: 'Off (by us)', tone: 'off' }
  return { text: '—', tone: 'off' }
}

/** The live gift for this package in the business, the store's own first (null: none). */
export function giftOf(grants: Grant[], key: string, storeIds: string[]): Grant | null {
  const gifts = grants.filter((g) => g.key === key && g.source === 'gift' && (g.scope !== 'store' || storeIds.includes(g.storeId ?? '')))
  return gifts.find((g) => g.scope === 'store') ?? gifts[0] ?? null
}

/**
 * "How they have it" (builder box 1): Plan, Bought ₹x / month, Gift till <date> (or for good), Given by us, Custom package.
 * Read from the first store that has it on; a store where it is on decides over one where it is off.
 */
export function howTheyHaveIt(perStore: (StoreFeature | undefined)[], gift: Grant | null): { text: string; gift: boolean } {
  if (gift) return { text: gift.until ? `Gift till ${formatDate(gift.until)}` : 'Gift, for good', gift: true }
  const on = perStore.find((f) => f?.on)
  if (!on) return { text: 'Not taken', gift: false }
  switch (on.source) {
    case 'addon_bought': return { text: on.monthlyPaise ? `Bought ₹${(on.monthlyPaise / 100).toLocaleString('en-IN')} / month` : 'Bought', gift: false }
    case 'admin_on': return { text: 'Given by us', gift: false }
    case 'custom_plan': return { text: 'Custom package', gift: false }
    case 'type': return { text: 'Comes with the business type', gift: false }
    case 'free_till_go_live': return { text: 'Free till go-live', gift: false }
    default: return { text: 'Plan', gift: false }
  }
}

/** Builder box 5, "Give more": the counts Admin may raise just for this customer. */
export const GIVE_MORE = [
  { key: 'stores', name: 'Stores', hint: 'Added on top of the plan’s stores' },
  { key: 'managers', name: 'Managers', hint: 'The number they may have' },
  { key: 'billers', name: 'Billers', hint: 'The number they may have' },
  { key: 'spaceMb', name: 'Space (GB)', hint: 'Typed in GB' },
  { key: 'salesPerDay', name: 'Sales a day (Free)', hint: 'Only matters on Free' },
] as const

/** The number sent for a Give more line: space is typed in GB and kept in MB (1 GB = 1000 MB, as on Plans). */
export const giveMoreLimit = (key: string, typed: number) => (key === 'spaceMb' ? Math.round(typed * 1000) : typed)

/** "n of m" for a count; m missing = no limit. */
export const ofLimit = (used: number, limit?: number | null, unlimited?: boolean) => (unlimited || limit === undefined || limit === null ? `${used}` : `${used} of ${limit}`)

/** Space limit in GB words (spaceMb), e.g. "10 GB"; null when the plan has no limit. */
export const spaceWords = (mb?: number | null, unlimited?: boolean) => (unlimited || mb === undefined || mb === null ? 'no limit' : `${Number((mb / 1000).toFixed(1))} GB`)
