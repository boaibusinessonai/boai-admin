// Customer 360 › Deals (V111, Admin board H7tJ8eg1zwWM4UV8Pii6Ub): the words and status of each deal row, and which things
// fit which kind of deal. Data from admin.customer_deals; writes through admin.save_deal / admin.end_deal.

import { formatDate, formatNumber, formatRupees } from './format'
import type { Business } from './types'

export type DealKind = 'trial' | 'price' | 'lock' | 'gift'
export type Deal = {
  id: string; kind: DealKind; key?: string; plan?: string; name?: string; organizationId?: string; storeId?: string
  priceRupees?: number; places?: string[]; starts: string; ends?: string; remindDays?: number; live: boolean
  convertedAt?: string; endedAt?: string; reason?: string; createdAt: string; seen?: number; tapped?: number; boughtAfter?: boolean
}
export type Thing = { key: string; name: string; kind: 'addon' | 'extra' | 'feature' | 'more'; scope: 'business' | 'store' | 'account' }
export type DealPlan = { code: string; name: string; trial: boolean }
export type LockRow = { key: string; name: string; place: string; seen: number; tapped: number; notNow: number; toldOwner: number; bought: number }
export type DealsData = { canEdit: boolean; deals: Deal[]; gifts: Deal[]; locks: LockRow[]; things: Thing[]; plans: DealPlan[]; remindDays: number }

export const KIND_WORD: Record<DealKind, string> = { trial: 'Trial', price: 'Special price', lock: 'Lock just for them', gift: 'Gift' }
export const KIND_CHOICE: Record<DealKind, string> = {
  trial: 'Trial (free, then they choose)', price: 'Special price till a date', lock: 'Lock / Home card just for them', gift: 'Gift',
}
export const PLACE_WORD: Record<string, string> = { menu: 'menu', page: 'inside its page', home: 'Home card', limit: 'limit' }

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)

/** Every deal and gift, newest first. */
export function allRows(data: Pick<DealsData, 'deals' | 'gifts'>): Deal[] {
  return [...data.deals, ...data.gifts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** A row is still running (can be ended): not ended and its last day not past. */
export const running = (d: Deal, today: string) => !d.endedAt && (!d.ends || d.ends >= today)

/** Status pill: ended / kept / starts <date> / ends in N days (a week or less) / running. */
export function statusOf(d: Deal, today: string): { word: string; tone: 'good' | 'warning' | 'neutral' } {
  if (d.endedAt || (d.ends && d.ends < today)) return { word: 'ended', tone: 'neutral' }
  if (d.starts > today) return { word: `starts ${formatDate(d.starts)}`, tone: 'neutral' }
  if (d.ends) {
    const left = days(today, d.ends)
    if (left === 0) return { word: 'last day today', tone: 'warning' }
    if (left <= 7) return { word: `ends in ${left} day${left === 1 ? '' : 's'}`, tone: 'warning' }
  }
  return { word: 'running', tone: 'good' }
}

/** What: the thing or plan; a special price says the price. */
export function whatOf(d: Deal): string {
  const name = d.name ?? d.key ?? d.plan ?? '—'
  return d.kind === 'price' && d.priceRupees != null ? `${name} at ${formatRupees(d.priceRupees)} a month` : name
}

/** Where: a store, a business, or the whole account; a lock adds its places. */
export function whereOf(d: Deal, businesses: Pick<Business, 'id' | 'name' | 'stores'>[]): string {
  const store = d.storeId ? businesses.flatMap((b) => b.stores).find((s) => s.id === d.storeId) : undefined
  const business = d.organizationId ? businesses.find((b) => b.id === d.organizationId) : undefined
  const at = store ? store.name : business ? (businesses.length > 1 ? business.name : 'Whole business') : 'Account'
  return d.kind === 'lock' && d.places?.length ? `${at} · ${d.places.map((p) => PLACE_WORD[p] ?? p).join(' + ')}` : at
}

/** Result: bought after it, the To-do reminder, or a lock's seen / tapped. */
export function resultOf(d: Deal, today: string): string {
  if (d.convertedAt || d.boughtAfter) return 'bought after ✓'
  if (d.kind === 'lock') return `seen ${formatNumber(d.seen ?? 0)} · tapped ${formatNumber(d.tapped ?? 0)}`
  if (d.kind === 'trial' && running(d, today) && d.ends && (d.remindDays ?? 0) > 0 && d.starts <= today && days(today, d.ends) <= (d.remindDays ?? 0)) return 'reminder on their To-do'
  return '–'
}

/** Things a kind of deal can be for (plans separately: trial and special price). */
export function thingsFor(kind: DealKind, things: Thing[]): Thing[] {
  if (kind === 'trial' || kind === 'lock') return things.filter((t) => t.kind === 'addon' || t.kind === 'extra')
  if (kind === 'gift') return things.filter((t) => t.kind !== 'more')
  return things.filter((t) => t.kind !== 'feature')
}
export function plansFor(kind: DealKind, plans: DealPlan[]): DealPlan[] {
  if (kind === 'trial') return plans.filter((p) => p.trial)
  return kind === 'price' ? plans : []
}

/** Where a thing goes: a store thing (or an in-page extra) needs a store, a business add-on a business; plans the account. */
export function placeNeeded(kind: DealKind, thing: Thing | undefined): 'store' | 'business' | 'any' {
  if (!thing || kind === 'price') return 'any'
  if (thing.scope === 'store' || thing.kind === 'extra') return 'store'
  if (thing.scope === 'business' && kind !== 'lock') return 'business'
  return 'any'
}
