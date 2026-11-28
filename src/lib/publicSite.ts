// Admin › Public website in tabs (DEMO-1, owner 2026-11-26, board AdminA "CHOSEN · Admin: Public website in tabs") and
// Admin › Data › Demo stores (board AdminDemo). The landing's words saved here (admin.save_site_landing) show on the website
// in about a minute; empty = the website's built-in words. Nothing here is a price.
import { partsFor } from './testData'

/** The tabs (owner 2026-11-27: the landing's own words and colours are no longer edited here; only the heading's 2 lines;
 * C15 2026-11-28: + the sentence under it and its marked words). */
export const SITE_TABS = [['heading', 'Heading'], ['partners', 'Partners'], ['cards', 'Business cards'], ['app', 'Our app'], ['links', 'Links'], ['notices', 'Notices'], ['questions', 'Questions'], ['legal', 'Legal']] as const
export type SiteTab = (typeof SITE_TABS)[number][0]

/** The heading = 2 lines, no big word (owner 2026-11-28, C15); these are the built-in ones (the website's en.ts). */
export const BUILT_IN_LINES: [string, string] = ['Create bills, track stock,', 'and bring customers back']
/** The sentence under the heading and the words that carry the soft mark, built-in (the website's en.ts). */
export const BUILT_IN_SUBLINE = 'Create bills by voice, add stock from supplier bill photos, and encourage repeat visits with a loyalty program.'
export const BUILT_IN_MARKS = 'bills, stock, customers back'
/** Marked words as typed ("a, b") → as saved ("a|b"); empty = built-in. */
export const marksSave = (text: string) => text.split(/[,|]/).map((word) => word.trim()).filter(Boolean).join('|')
/** Marked words as saved ("a|b") → as shown in the box ("a, b"). */
export const marksText = (saved?: string) => (saved ?? '').split('|').map((word) => word.trim()).filter(Boolean).join(', ')
/** The 2 lines as saved ("line 1 | line 2"; an older "BOAI | 1 | 2" too); anything else = empty boxes (built-in). */
export function headingLines(heading?: string): [string, string] {
  const parts = (heading ?? '').split('|').map((part) => part.trim()).filter(Boolean)
  const own = parts.length === 3 ? parts.slice(1) : parts
  return own.length === 2 ? [own[0]!, own[1]!] : ['', '']
}
/** What Save sends: both lines filled = "line 1 | line 2"; else empty (the website shows the built-in lines). */
export const headingSave = (lines: [string, string]) => (lines[0].trim() && lines[1].trim() ? `${lines[0].trim()} | ${lines[1].trim()}` : '')

/** The partners the owner gave (real businesses that said yes), shown in the customers cloud until the list is changed. */
export const BUILT_IN_PARTNERS: Partner[] = [{ name: 'Mukherjee Bakery', kind: 'Bakery', shown: true }, { name: 'Chatterjee Clinic', kind: 'Clinic', shown: true },
  { name: 'Chatterjee Constructions', kind: 'Contractor', shown: true }, { name: 'Banerjee Diagnostics', kind: 'Diagnostics', shown: true }]
/** The demo kinds the landing shows first (owner 2026-11-26: the 7 focus kinds). */
export const DEMO_KINDS = ['clinic', 'pharmacy', 'bakery', 'salon', 'garage', 'contractor', 'coaching']

export type Partner = { name: string; kind?: string; logo?: string; line?: string; shown: boolean }
/** What this page saves of the landing (admin.save_site_landing merges the parts sent). */
export type Landing = { heading?: string; subline?: string; marks?: string; partners?: Partner[]; cards?: string[]; app?: { mobile?: 'apk' | 'play'; play?: string; web?: boolean; topBar?: boolean } }

export const partnerRows = (l: Landing) => l.partners ?? BUILT_IN_PARTNERS
export const cardKinds = (l: Landing) => (l.cards?.length ? l.cards : DEMO_KINDS)

/** Moves one row up (-1) or down (+1). */
export function move<T>(rows: T[], index: number, by: number): T[] {
  const to = index + by
  if (to < 0 || to >= rows.length) return rows
  const next = [...rows]
  const [row] = next.splice(index, 1)
  next.splice(to, 0, row!)
  return next
}

/** A demo card's line on Business cards: ready = its demo store opens; else it goes to More businesses. */
export const cardState = (kind: string, demos: { kind: string; ready: boolean; on: boolean }[]) => {
  const d = demos.find((one) => one.kind === kind)
  if (d?.ready && d.on) return 'Demo ready'
  if (d && !d.on) return 'Off the landing · goes to More businesses'
  return 'No demo yet · goes to More businesses'
}

/** What a demo store of this kind gets after the shared parts: its Test data parts (box 3), as Make demo store sends them. */
export const demoParts = (kind: string) => partsFor(kind).own.map((p) => ({ part: p.part, count: Math.min(p.n, 10), ...(p.part === 'consults' ? { label: 'Patient' } : {}) }))

/** Night reset hour as the page shows it ("02:00 (India time)"). */
export const hourWords = (h: number) => `${String(h).padStart(2, '0')}:00 (India time)`
export const STATE_WORDS: Record<string, string> = { ready: 'Ready', making: 'Making…', failed: 'Failed' }
/** The fixed list of what a demo store never does (board AdminDemo). */
export const ALWAYS_BLOCKED = ['WhatsApp, SMS and emails', 'Payments and payment links', 'AI credits (AI buttons answer from ready examples)', 'Changing plan, staff sign-ins, deleting the store']

/** A partner's logo picture: SVG, PNG, JPEG or WebP up to 200 KB (as App name & logo's). */
export const logoOk = (type: string, size: number) => /^image\/(svg\+xml|png|jpeg|webp)$/.test(type) && size <= 200_000
