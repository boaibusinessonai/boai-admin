// Admin › Test data (owner 2026-11-24, sketch OK'd 2026-11-25 "every trade, all the fields, a big control page"): a new test
// login (test-NNNN@boai.test) with a set-up business on a stage, then what every store gets and its trade's own parts.
// Test data makes no bills (no sales, no advances, no fees, no wages paid). The PROD Admin (control tower) fills Build, DEV,
// SIT or UAT; the Build Admin fills Build only (so a change can be checked there first). The Edge Function admin-test-data
// does the work; this file is the page's logic and words.
import { tablesToFill, type StoreFacts, type TableKind } from './importTables'
import type { Stage } from './releases'

export type Part = 'items' | 'customers' | 'suppliers' | 'staff' | 'settings' | 'extras' | 'lots' | 'floor' | 'rooms' | 'appointments' | 'memberships'
  | 'consults' | 'jobs' | 'classes' | 'projects' | 'production' | 'later'
export type Counts = Record<Part, { on: boolean; n: number }>
export type Person = { name: string; role: string; pin: string }
export type FillAnswer = { part: Part; made: number; errors: string[]; more: number; leftOut?: string[]; people?: Person[]
  team?: number; treatments?: number; medicines?: number; visits?: number; soon?: number; licences?: string[]; dishes?: number; recipes?: number; tables?: number
  tickets?: number; rooms?: number; inHouse?: number; chairs?: number; services?: number; plans?: number; ending?: number; noShow?: number
  technicians?: number; fromVisits?: number; teachers?: number; batches?: number; days?: number; estimates?: number; workers?: number; material?: number
  beingMade?: number; making?: number; ready?: number }
export type Made = { email: string; password: string; pin: string; business: string; stores: number; plan?: string; storesLater?: number; appUrl?: string | null }
export type Login = { email: string; business: string | null; type: string | null; made: string; items: number; customers: number; suppliers: number; staff: number }
export type PartInfo = { part: Part; label: string; n: number; max: number; words: string }

/** Box 2 · Every store gets (sketch): in fill order (what later rows point at first). */
export const SHARED: readonly PartInfo[] = [
  { part: 'items', label: 'Items', n: 50, max: 200, words: "The trade's ready list: category, unit, price, cost, GST, opening stock" },
  { part: 'customers', label: 'Customers', n: 20, max: 200, words: 'Customer 1, Customer 2 …; 1 in 4 with an opening due' },
  { part: 'suppliers', label: 'Suppliers', n: 5, max: 50, words: 'Supplier 1 …; some with an amount owed' },
  { part: 'staff', label: 'Staff + sign-ins', n: 3, max: 20, words: 'Biller and Manager with PINs; staff pay rows when on' },
  { part: 'settings', label: 'Store settings', n: 1, max: 1, words: 'Address, GST (not registered), bill footer, day end, ID codes' },
]
/** The sketch's Bills card: shown, always off (owner: test data makes no bills; only demo stores get bills). */
export const BILLS_CARD = { label: 'Bills (past 30 days)', words: 'Off: Test data makes no bills.' }

/** Box 3 · a trade's own parts, in fill order (production before orders for later: an order's Make needs a recipe). */
export const OWN: readonly PartInfo[] = [
  { part: 'lots', label: 'Medicines with batches', n: 20, max: 30, words: 'The store licence its items need, then items received from Supplier 1 with batch no., expiry (some within 60 days) and MRP' },
  { part: 'consults', label: 'Doctors, patients + visits', n: 6, max: 30, words: 'Clinic settings (Mon–Sat, 15 min slots, fees), Doctor 1 + 2 (+ physio, optometrist or dentist) with Doctor sign-ins, treatments, medicines with batches, patients: 2 waiting, 1 with a doctor, the rest booked' },
  { part: 'floor', label: 'Menu, tables + kitchen orders', n: 5, max: 20, words: 'Dishes with recipes, Table 1–6, open orders sent to the counters: one cooking, one ready, the rest new' },
  { part: 'rooms', label: 'Rooms + stays', n: 6, max: 30, words: 'Rooms 101–104 and 201–204, stays: in now, leaving tomorrow, arriving today, booked for later' },
  { part: 'appointments', label: 'Chairs, staff + appointments', n: 8, max: 30, words: 'Open 10 AM–8 PM, services, chairs with a staff member each (none where jobs take in an item); today: 2 waiting, 1 in service, coming up, a no-show' },
  { part: 'memberships', label: 'Membership plans + members', n: 10, max: 30, words: 'Monthly, Quarterly, 10 visits; members on a plan from a customer (no bills), some ending this week, some checked in today' },
  { part: 'jobs', label: 'Job cards + technicians', n: 8, max: 30, words: 'Technician 1 + 2 with sign-ins; job cards came in, being worked on (yes on WhatsApp, timer), waiting for parts, ready; a booked visit sent to a job card' },
  { part: 'classes', label: 'Batches, students + attendance', n: 15, max: 30, words: 'Teacher 1 + 2 with sign-ins, Room 1–3, Batch 1–3 with times and fees, students in batches, the last 5 class days marked; no fees raised' },
  { part: 'projects', label: 'Projects + site workers', n: 3, max: 10, words: 'This many running projects (stages done 100/60/30/0%, nothing billed yet) and as many estimates waiting; Worker 1–4 with daily wage and attendance, a contract work, material sent' },
  { part: 'production', label: 'Batches made today', n: 5, max: 20, words: 'A recipe for each product made ahead, batches made today, the last one Being made' },
  { part: 'later', label: 'Orders for later', n: 5, max: 30, words: 'Due today, tomorrow and this week, line notes; To make, Being made, Ready; no advance' },
]
/** Kept from before the sketch (tucked at the end of box 3, off at start): the type's own tables, rows only. */
export const EXTRAS_PART: PartInfo = { part: 'extras', label: 'Type extras', n: 8, max: 30, words: "The type's own tables, this many of each, rows only: dining tables, rooms, chairs, patient files, membership plans (those in its menu)" }
export const PARTS: readonly PartInfo[] = [...SHARED, ...OWN, EXTRAS_PART]

/** Parts not built yet (owner 2026-11-26: later): greyed Coming soon cards, nothing to tick. */
type SoonPart = { label: string; words: string }
export const SOON: Record<'distribution' | 'rentals' | 'deliveries', readonly SoonPart[]> = {
  distribution: [
    { label: 'Routes + shops', words: 'Routes with shops (shops are customers)' },
    { label: 'Salesmen', words: 'Sign-in with PIN, their routes' },
    { label: 'Orders to deliver', words: 'Taken by salesmen, for tomorrow' }],
  rentals: [
    { label: 'Rental stock', words: 'Tents, chairs, lights with rate per day' },
    { label: 'Rental bookings', words: 'Out now, going out tomorrow, one late back' }],
  deliveries: [{ label: 'Deliveries', words: "Delivery person, today's drops" }],
}
type Soon = keyof typeof SOON

/** Each trade's own parts (sketch's T table; the app's trade keys). A trade not listed has nothing of its own. */
const TRADE: Record<string, { own: Part[]; soon?: Soon[] }> = {
  clinic: { own: ['consults', 'lots'] }, pharmacy: { own: ['lots'] },
  restaurant: { own: ['floor'] }, cafe: { own: ['floor'] }, cloud_kitchen: { own: ['floor'] }, hotel: { own: ['rooms'] },
  salon: { own: ['appointments', 'memberships'] }, spa_gym: { own: ['appointments', 'memberships'] },
  coaching: { own: ['classes'] }, contractor: { own: ['projects'] },
  garage: { own: ['appointments', 'jobs'] }, tailor: { own: ['appointments', 'jobs'] }, laundry: { own: ['appointments', 'jobs'] },
  repair_service: { own: ['appointments', 'jobs'] }, mobile_repair: { own: ['appointments', 'jobs'] },
  bakery: { own: ['production', 'later'], soon: ['deliveries'] }, sweets: { own: ['production', 'later'], soon: ['deliveries'] },
  caterer: { own: ['production', 'later'], soon: ['deliveries'] },
  distributor: { own: [], soon: ['distribution'] }, tent_rentals: { own: [], soon: ['rentals'] },
}
/** Box 3 for a trade: its own parts in fill order, and the parts still to come. */
export function partsFor(trade: string): { own: PartInfo[]; soon: SoonPart[] } {
  const t = TRADE[trade] ?? { own: [] }
  return { own: OWN.filter((p) => t.own.includes(p.part)), soon: (t.soon ?? []).flatMap((s) => SOON[s]) }
}
/**
 * Box 3's cards, as the sketch draws them: one card per kind of data (Salon: Chairs / rooms, Staff who serve, Appointments, …).
 * A part that fills several kinds shows a card for each; they share the part's one on/off, and the count sits on the card it
 * counts (the others show the fixed number the part makes). `only`: the card shows only for these trades (chairs: salon, spa / gym).
 * A part with no cards here shows one card of its own.
 */
type CardInfo = { label: string; words: string; fixed?: number; only?: readonly string[] }
const CHAIRS = ['salon', 'spa_gym'] as const
export const CARDS: Partial<Record<Part, readonly CardInfo[]>> = {
  consults: [
    { label: 'Clinic settings', fixed: 1, words: 'Open Mon–Sat, 15 min slots, fees; sells medicines (up to 5 received with batch no., expiry, MRP)' },
    { label: 'Doctors', fixed: 3, words: 'Doctor 1, Doctor 2 (+ physio / optometrist / dentist) with fees, hours, Doctor sign-in PIN' },
    { label: 'Treatments', fixed: 4, words: 'Services linked to the doctors' },
    { label: 'Patients + visits', words: 'Patient 1 …; today: 2 waiting, 1 with a doctor, the rest booked; no bills' }],
  floor: [
    { label: 'Dining tables', fixed: 6, words: 'Table 1–6 when the store has none' },
    { label: 'Menu with recipes', fixed: 12, words: 'Dishes made to order from the ready list, each with a recipe from the stocked items' },
    { label: 'Kitchen orders now', words: 'Open orders sent to the counters: one cooking, one ready, the rest new; no bills' }],
  rooms: [
    { label: 'Rooms', fixed: 8, words: 'Rooms 101–104 Standard and 201–204 Deluxe when the store has none' },
    { label: 'Room bookings', words: 'Stays: in now, leaving tomorrow, arriving today, booked for later; no advance' }],
  appointments: [
    { label: 'Chairs / rooms', fixed: 3, only: CHAIRS, words: 'Chair 1–3 when the store has none' },
    { label: 'Staff who serve', fixed: 3, only: CHAIRS, words: "The store's staff, one on each chair" },
    { label: 'Appointments', words: 'Open 10 AM–8 PM, services; today: 2 waiting, 1 in service, coming up, a no-show when the hour allows' }],
  memberships: [
    { label: 'Membership plans', fixed: 3, words: 'Monthly, Quarterly, 10 visits when the store has none' },
    { label: 'Members', words: 'On a plan from a customer (no bills); some ending this week, some checked in today' }],
  jobs: [
    { label: 'Job cards', words: 'Customer, what came in, promised date; came in / being worked on (yes on WhatsApp, timer) / waiting for parts / ready; a booked visit sent to a job card' },
    { label: 'Technicians', fixed: 2, words: 'Technician 1 + 2, sign-in with PIN, hourly charge' }],
  classes: [
    { label: 'Batches', fixed: 3, words: 'Batch 1–3, every day, times, monthly fee, Room 1–3, Teacher 1 + 2 (sign-in with PIN)' },
    { label: 'Students', words: 'Student 1 … in a batch, paid for by a customer; no fees raised' },
    { label: 'Attendance', fixed: 5, words: 'Last 5 class days marked; today on Batch 1' }],
  projects: [
    { label: 'Projects', words: 'Client, site address, estimate: running projects (stages done 100/60/30/0%, nothing billed yet, material sent) and as many estimates waiting' },
    { label: 'Site workers', fixed: 4, words: 'Worker 1–4 with daily wage, attendance the last 5 days + today, a contract work' }],
}
export type OwnCard = { part: Part; label: string; words: string; fixed?: number }
/** Box 3's cards for a trade: each own part's cards (in fill order), or the part itself as one card. */
export function cardsFor(trade: string): OwnCard[] {
  return partsFor(trade).own.flatMap((p) => (CARDS[p.part] ?? [{ label: p.label, words: p.words }])
    .filter((c) => !c.only || c.only.includes(trade))
    .map((c) => ({ part: p.part, label: c.label, words: c.words, ...(c.fixed !== undefined ? { fixed: c.fixed } : {}) })))
}
/** Box 3's line when the trade has nothing of its own. */
export const NO_OWN = 'Nothing of its own: this trade uses the parts above (with stock, batches and dues where it keeps them).'

/** How much (sketch): Normal = the counts, Small = a third (at least 1), Busy store = 3× (never above the part's most). */
export type HowMuch = 'normal' | 'small' | 'busy'
export const HOW_MUCH: readonly { key: HowMuch; label: string }[] = [
  { key: 'normal', label: 'Normal (the counts on the right)' }, { key: 'small', label: 'Small (a quick look)' }, { key: 'busy', label: 'Busy store (3× the counts)' }]
export function howMuch(n: number, level: HowMuch, max: number) {
  if (n <= 0) return 0
  if (max <= 1) return Math.min(n, max)
  return level === 'small' ? Math.max(1, Math.ceil(n / 3)) : level === 'busy' ? Math.min(max, n * 3) : n
}

export const startCounts = (): Counts =>
  Object.fromEntries(PARTS.map((p) => [p.part, { on: p.part !== 'extras', n: p.n }])) as Counts

/** The type's own tables the extras part fills, and the name each row gets ("Table 1"). */
export const EXTRAS: readonly { kind: TableKind; label: string }[] = [
  { kind: 'diningtables', label: 'Table' }, { kind: 'rooms', label: 'Room' }, { kind: 'chairs', label: 'Chair' },
  { kind: 'consultfiles', label: 'Patient' }, { kind: 'membershipplans', label: 'Plan' },
]
/** The extras a test login's store shows in its menu (the same list Import data shows for it). */
export function extrasFor(facts: StoreFacts) {
  const shown = new Set(tablesToFill(facts).map((table) => table.kind))
  return EXTRAS.filter((extra) => shown.has(extra.kind)).map(({ kind, label }) => ({ kind, label }))
}

/** The stages this Admin fills: the PROD tower any lower one, Build itself; none elsewhere (and never PROD). */
export const stagesFrom = (here: Stage | null): Stage[] => (here === 'prod' ? ['build', 'dev', 'sit', 'uat'] : here === 'build' ? ['build'] : [])
/** The stage picked first: DEV on the tower (where testers work), else the only one. */
export const firstStage = (stages: Stage[]): Stage | null => (stages.includes('dev') ? 'dev' : stages[0] ?? null)

/** A name for the next test business of a type: "Test <type> <n>", n after the ones already named so. */
export function nextName(typeName: string, logins: Login[]) {
  const base = `Test ${typeName}`
  const used = logins.map((l) => l.business?.match(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`))?.[1]).filter(Boolean).map(Number)
  return `${base} ${Math.max(0, ...used) + 1}`
}

/** The parts a run fills, in order: every store's, then the trade's own (and the tucked extras), each on with a count. */
export const runParts = (counts: Counts, trade: string | null) =>
  [...SHARED, ...(trade === null ? OWN : partsFor(trade).own), EXTRAS_PART].filter((p) => counts[p.part].on && counts[p.part].n > 0)
/** The progress chips: the login and business (Make only), then each part that runs. */
export const stepsFor = (counts: Counts, making: boolean, trade: string | null = null) =>
  [...(making ? ['Login', 'Business + store'] : []), ...runParts(counts, trade).map((p) => p.label)]

/** One line for a part's result: "Customers: 20 made", with rows left out and why. */
export function partLine(label: string, a: FillAnswer): string[] {
  const lines = [`${label}: ${a.made} made`]
  const notMade = a.errors.length + a.more
  if (notMade) lines.push(`${label}: ${notMade} not made. ${a.errors[0] ?? ''}`.trim())
  if (a.made) {
    const first: Partial<Record<Part, string>> = {
      consults: `${a.made} patients, ${a.visits ?? 0} visits, ${a.team ?? 0} on the team, ${a.treatments ?? 0} treatments, ${a.medicines ?? 0} medicines with batches`,
      lots: `${a.made} items received with batches, ${a.soon ?? 0} expiring within 60 days`,
      floor: `${a.made} open orders, ${a.tickets ?? 0} tickets, ${a.dishes ?? 0} dishes added, ${a.recipes ?? 0} recipes, ${a.tables ?? 0} tables added`,
      rooms: `${a.made} stays, ${a.inHouse ?? 0} guests in now, ${a.rooms ?? 0} rooms added`,
      appointments: `${a.made} visits, ${a.chairs ?? 0} chairs added, ${a.services ?? 0} services added${a.noShow ? ', 1 no-show' : ''}`,
      memberships: `${a.made} members (no bills), ${a.ending ?? 0} ending this week, ${a.visits ?? 0} checked in today, ${a.plans ?? 0} plans added`,
      settings: `${a.made} saved (address, bill footer)`,
      jobs: `${a.made} job cards, ${a.technicians ?? 0} technicians added, ${a.fromVisits ?? 0} visit sent to a job card`,
      classes: `${a.made} students, ${a.batches ?? 0} batches and ${a.teachers ?? 0} teachers added, ${a.days ?? 0} class days marked`,
      projects: `${a.made} running projects, ${a.estimates ?? 0} estimates waiting, ${a.workers ?? 0} workers added, ${a.days ?? 0} days of attendance, ${a.material ?? 0} items sent to site`,
      production: `${a.made} batches today (${a.beingMade ?? 0} being made), ${a.recipes ?? 0} recipes added`,
      later: `${a.made} orders for later, ${a.making ?? 0} being made, ${a.ready ?? 0} ready`,
    }
    if (first[a.part]) lines[0] = `${label}: ${first[a.part]}`
  }
  if (a.licences?.length) lines.push(`${label}: store licence added (${a.licences.join(', ')}), valid 2 years`)
  for (const why of a.leftOut ?? []) lines.push(`${label}: ${why}`)
  return lines
}

/** Everything to save at once (Copy all): login, password, owner PIN, each sign-in's PIN. */
export function copyText(made: Pick<Made, 'email' | 'password' | 'pin' | 'business'>, people: Person[], stageName: string) {
  return [`${made.business} (${stageName})`, `Login: ${made.email}`, `Password: ${made.password}`, `Owner PIN: ${made.pin}`,
    ...people.map((p) => `${p.name} · ${p.role} PIN: ${p.pin}`)].join('\n')
}

/** What a login has now, in a few words. */
export const contents = (l: Login) => `${l.items} items · ${l.customers} customers · ${l.suppliers} suppliers · ${l.staff} staff`

/** The plan picked first (owner 2026-11-25: a plan picker): the last one Admin lists (its top plan), so every part fills; none = sign-up plan. */
export const topPlan = (plans: { code: string }[]) => plans[plans.length - 1]?.code ?? ''

/** "Every trade at a glance" (sketch): trades, their own data, and what the page makes now. */
export const GLANCE: readonly { trades: string; parts: string; now: string }[] = [
  { trades: 'Clinic', parts: 'Settings, doctors + sign-ins, treatments, medicines with batches, patients + visits', now: 'Done' },
  { trades: 'Pharmacy', parts: 'Medicines with batch, expiry (some near), MRP', now: 'Done' },
  { trades: 'Restaurant, Cafe, Cloud kitchen', parts: 'Tables, menu with recipes, kitchen orders', now: 'Done' },
  { trades: 'Hotel', parts: 'Rooms, room bookings', now: 'Done' },
  { trades: 'Salon, Spa / Gym', parts: 'Chairs, staff who serve, appointments, membership plans, members', now: 'Done' },
  { trades: 'Coaching', parts: 'Batches, students, attendance', now: 'Done' },
  { trades: 'Distributor', parts: 'Routes + shops, salesmen, orders to deliver', now: 'Coming soon' },
  { trades: 'Contractor', parts: 'Projects, site workers', now: 'Done' },
  { trades: 'Tent rentals', parts: 'Rental stock, bookings', now: 'Coming soon' },
  { trades: 'Garage, Repairs, Tailor, Laundry', parts: 'Job cards, technicians', now: 'Done' },
  { trades: 'Bakery, Sweets, Caterer', parts: 'Batches made today, orders for later; deliveries', now: 'Done; deliveries Coming soon' },
  { trades: 'Kirana, Supermarket and other shops', parts: 'Shared parts only', now: 'Done' },
]
