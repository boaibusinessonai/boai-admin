// The plan form: text boxes to and from what admin.save_plan takes. The database checks every value again.

export type AdminPlan = {
  code: string; name: string; tagline: string; tier: number; position: number; monthly: number; yearly: number
  offered: boolean; popular: boolean; addOns: boolean; team: boolean; choosesApp: boolean; isCustom: boolean; seeded: boolean
  /** The apps a business type comes with are free on this plan (owner 2026-11-18; Free is off). */
  typeAppsFree: boolean
  /** Listed on the landing page's prices; onPlanPage: in the list on a customer's Plan page (absent until the database has it). */
  onPricing: boolean; onPlanPage?: boolean
  /** 187g Menu (board AdminPlanOffer): Edit menu on the plan; add-ons shown faded as offers in its stores' menus (absent until the database has them). */
  canEditMenu?: boolean
  includes: string[]; features: string[]; uses: { accounts: number; payments: number }
  billers: number | null; managers: number | null; staff: number | null; messages: number | null; aiCredits: number | null
  billsPerMonth: number | null; salesPerDay: number | null; spaceMb: number | null; items: number | null; stores: number | null; businesses: number | null
  /** V137: bills a day by business type on this plan ({type key: number}); a type not listed uses salesPerDay. */
  salesPerDayByType?: Record<string, number>
}

export const LIMIT_FIELDS = ['businesses', 'stores', 'billers', 'managers', 'staff', 'billsPerMonth', 'salesPerDay', 'spaceMb', 'items', 'aiCredits', 'messages'] as const
export type LimitField = (typeof LIMIT_FIELDS)[number]

export type PlanDraft = {
  /** yearly: the price a YEAR as typed (the database keeps a month's price when paid yearly, so it must split into 12). */
  code: string; name: string; tagline: string; tier: string; position: string; monthly: string; yearly: string
  offered: boolean; popular: boolean; addOns: boolean; team: boolean; choosesApp: boolean; isCustom: boolean; typeAppsFree: boolean
  onPricing: boolean; onPlanPage?: boolean
  canEditMenu: boolean
  /** A blank box is "no limit". */
  limits: Record<LimitField, string>
  /** V137: bills a day by business type as typed; blank = the plan's own number. */
  byType: Record<string, string>
  on: string[]
}

export const planDraft = (plan: AdminPlan): PlanDraft => ({
  code: plan.code, name: plan.name, tagline: plan.tagline, tier: String(plan.tier), position: String(plan.position), monthly: String(plan.monthly), yearly: String(plan.yearly * 12),
  offered: plan.offered, popular: plan.popular, addOns: plan.addOns, team: plan.team, choosesApp: plan.choosesApp, isCustom: plan.isCustom, typeAppsFree: plan.typeAppsFree ?? true,
  onPricing: plan.onPricing, ...(plan.onPlanPage === undefined ? {} : { onPlanPage: plan.onPlanPage }),
  canEditMenu: plan.canEditMenu ?? true,
  limits: Object.fromEntries(LIMIT_FIELDS.map((field) => [field, plan[field] === null ? '' : field === 'spaceMb' ? String(plan[field] / 1000) : String(plan[field])])) as Record<LimitField, string>,
  byType: Object.fromEntries(Object.entries(plan.salesPerDayByType ?? {}).map(([type, value]) => [type, String(value)])),
  on: [...plan.includes, ...plan.features],
})

export const newCustomDraft = (position: number): PlanDraft => ({
  code: 'custom_', name: '', tagline: '', tier: '1', position: String(position), monthly: '0', yearly: '0',
  offered: false, popular: false, addOns: true, team: true, choosesApp: false, isCustom: true, typeAppsFree: true, onPricing: false, canEditMenu: true,
  limits: { businesses: '1', stores: '1', billers: '0', managers: '0', staff: '0', billsPerMonth: '', salesPerDay: '', spaceMb: '', items: '', aiCredits: '0', messages: '0' },
  byType: {},
  on: [],
})

const whole = (text: string, label: string) => {
  if (!/^\d+$/.test(text.trim())) throw new Error(`${label} must be a whole number.`)
  return Number(text)
}

/** Space is typed in GB (0.5 = 500 MB) and kept in MB. */
const megabytes = (text: string) => {
  if (!/^\d+(\.\d{1,3})?$/.test(text.trim())) throw new Error('Space must be a number of GB, like 0.5 or 10.')
  return Math.round(Number(text) * 1000)
}

const monthOfYear = (year: number) => {
  if (year % 12 !== 0) throw new Error(`Price a year must split into 12 whole months (₹${Math.floor(year / 12) * 12} or ₹${Math.ceil(year / 12) * 12}).`)
  return year / 12
}

/** What admin.save_plan takes, or an Error saying which box is wrong. */
export function planPayload(draft: PlanDraft) {
  return {
    code: draft.code.trim(), name: draft.name.trim(), tagline: draft.tagline.trim() || null, tier: whole(draft.tier, 'Group'), position: whole(draft.position, 'Order'),
    monthly: whole(draft.monthly, 'Monthly price'), yearly: monthOfYear(whole(draft.yearly, 'Price a year')),
    offered: draft.offered, popular: draft.popular, addOns: draft.addOns, team: draft.team, choosesApp: draft.choosesApp, isCustom: draft.isCustom, typeAppsFree: draft.typeAppsFree,
    onPricing: draft.onPricing, ...(draft.onPlanPage === undefined ? {} : { onPlanPage: draft.onPlanPage }),
    // Menu settings, not terms: they reach everyone on the plan at once (no 'how should this apply' choice).
    canEditMenu: draft.canEditMenu,
    limits: Object.fromEntries(LIMIT_FIELDS.map((field) => [field, draft.limits[field].trim() === '' ? null : field === 'spaceMb' ? megabytes(draft.limits[field]) : whole(draft.limits[field], field)])),
    // V137: every type typed in (blank = back to the plan's number); types never touched are not sent.
    ...(Object.keys(draft.byType).length ? { salesPerDayByType: Object.fromEntries(Object.entries(draft.byType).map(([type, text]) => [type, text.trim() === '' ? null : whole(text, 'Bills a day for a business type')])) } : {}),
    features: draft.on,
  }
}

/**
 * V105: what the plan card saves for a plan on the selling grid: prices, counts, words and showing only. What is inside it
 * (ticks), the menu lock, "add-ons can be bought" and "people besides the owner" are the grid's (Admin › Selling); a custom
 * plan still sends its ticks.
 */
export function planCardPayload(draft: PlanDraft) {
  const all = planPayload(draft)
  if (draft.isCustom) return all
  const { features: _f, canEditMenu: _c, addOns: _a, team: _t, ...card } = all
  return card
}

/** Card colour on Plans: free, features grow (group 1), size grows (group 2 and up), sold by a person (custom). */
export const planGroup = (plan: Pick<AdminPlan, 'isCustom' | 'monthly' | 'yearly' | 'tier'>) =>
  plan.isCustom ? 'person' : plan.monthly === 0 && plan.yearly === 0 ? 'free' : plan.tier <= 1 ? 'features' : 'size'

/** The ladder: plans on offer, not custom, in their order. */
export const ladder = (plans: AdminPlan[]) => plans.filter((plan) => !plan.isCustom && plan.offered).sort((a, b) => a.position - b.position)

/** The plan just below this one on the ladder (its ticks are held by this one). */
export const planBelow = (plans: AdminPlan[], code: string, position: number) =>
  ladder(plans).filter((plan) => plan.code !== code && plan.position < position).at(-1) ?? null

export type Prices = { addOns: { key: string; price: number }[]; store: number; business: number; biller: number; manager: number }

/** Loophole check: the plan below (a month, paid yearly) + buying what this plan adds one by one, against this plan's price. */
export function loophole(below: AdminPlan, draft: PlanDraft, prices: Prices) {
  const has = new Set([...below.includes, ...below.features])
  const addOns = prices.addOns.filter((row) => draft.on.includes(row.key) && !has.has(row.key)).reduce((sum, row) => sum + row.price, 0)
  const more = (field: 'billers' | 'managers' | 'stores' | 'businesses', price: number) => {
    const mine = draft.limits[field].trim()
    if (mine === '' || below[field] === null || !/^\d+$/.test(mine)) return 0
    return Math.max(0, Number(mine) - (below[field] ?? 0)) * price
  }
  const byParts = below.yearly + addOns + more('billers', prices.biller) + more('managers', prices.manager) + more('stores', prices.store) + more('businesses', prices.business)
  const year = Number(draft.yearly)
  const price = Number.isFinite(year) ? Math.round(year / 12) : NaN
  return { byParts, price, passes: !(price > byParts) }
}

/** Who works on a plan besides the owner, for its tile: "Owner only", or "1 manager · 2 billers" (No limit when blank). */
export function planPeople(plan: Pick<AdminPlan, 'team' | 'managers' | 'billers'>) {
  if (!plan.team) return 'Owner only'
  const n = (value: number | null, one: string, many: string) => (value === null ? `No limit ${many}` : `${value.toLocaleString('en-IN')} ${value === 1 ? one : many}`)
  return `${n(plan.managers, 'manager', 'managers')} · ${n(plan.billers, 'biller', 'billers')}`
}

/** The kinds of change customers feel (prices, people, add-ons switch, counts, features); name and words are not among them. */
export type PlanChange = { kind: 'price' | 'switch' | 'count' | 'on' | 'off'; text: string; key?: string }

/**
 * What a save changes in a plan's terms, in plain words, for the "How should this apply?" box. Empty: only the name,
 * words, order or showing changed, which never needs the choice. `name(key)` gives a feature's or count's name.
 */
export function planChanges(plan: AdminPlan, payload: ReturnType<typeof planCardPayload>, name: (key: string) => string): PlanChange[] {
  const out: PlanChange[] = []
  const rupee = (value: number) => `₹${value.toLocaleString('en-IN')}`
  const amount = (value: number | null) => (value === null ? 'no limit' : value.toLocaleString('en-IN'))
  if (payload.yearly !== plan.yearly) out.push({ kind: 'price', text: `Price a year ${rupee(plan.yearly * 12)} → ${rupee(payload.yearly * 12)}` })
  if (payload.monthly !== plan.monthly) out.push({ kind: 'price', text: `Price a month ${rupee(plan.monthly)} → ${rupee(payload.monthly)}` })
  if ('team' in payload && payload.team !== plan.team) out.push({ kind: 'switch', text: payload.team ? 'People besides the owner: allowed' : 'People besides the owner: not allowed' })
  if ('addOns' in payload && payload.addOns !== plan.addOns) out.push({ kind: 'switch', text: payload.addOns ? 'Add-ons can be bought' : 'Add-ons can’t be bought' })
  if (payload.typeAppsFree !== (plan.typeAppsFree ?? true)) out.push({ kind: 'switch', text: payload.typeAppsFree ? 'Gets the apps a business comes with' : 'Doesn’t get the apps a business comes with' })
  if (payload.choosesApp !== plan.choosesApp) out.push({ kind: 'switch', text: payload.choosesApp ? 'Chooses an app' : 'No app to choose' })
  for (const field of LIMIT_FIELDS) {
    const now = payload.limits[field] ?? null
    const show = (value: number | null) => (field === 'spaceMb' && value !== null ? `${(value / 1000).toLocaleString('en-IN')} GB` : amount(value))
    if (now !== plan[field]) out.push({ kind: 'count', key: field, text: `${name(field)} ${show(plan[field])} → ${show(now)}` })
  }
  // V137: bills a day by business type (name('type:<key>') gives the type's name).
  const byType = (payload as { salesPerDayByType?: Record<string, number | null> }).salesPerDayByType ?? {}
  for (const [type, now] of Object.entries(byType)) {
    const was = plan.salesPerDayByType?.[type] ?? null
    const show = (value: number | null) => (value === null ? 'the plan’s number' : value.toLocaleString('en-IN'))
    if (now !== was) out.push({ kind: 'count', key: 'salesPerDay', text: `${name('salesPerDay')} for ${name(`type:${type}`)} ${show(was)} → ${show(now)}` })
  }
  // V105: a plan on the selling grid sends no ticks (its column in Selling holds them).
  if (!('features' in payload)) return out
  const was = new Set([...plan.includes, ...plan.features])
  const on = new Set<string>(payload.features as string[])
  for (const key of on) if (!was.has(key)) out.push({ kind: 'on', key, text: `+ ${name(key)}` })
  for (const key of was) if (!on.has(key)) out.push({ kind: 'off', key, text: `− ${name(key)}` })
  return out
}

/** The form's first boxes, in the board's order; the other counts sit under More. */
export const MAIN_LIMITS: { field: LimitField; label: string }[] = [
  { field: 'businesses', label: 'Businesses' }, { field: 'stores', label: 'Stores' }, { field: 'managers', label: 'Managers free' }, { field: 'billers', label: 'Billers free' }, { field: 'aiCredits', label: 'AI a month' }, { field: 'spaceMb', label: 'Space (GB)' },
]
export const MORE_LIMITS: LimitField[] = ['staff', 'billsPerMonth', 'salesPerDay', 'items', 'messages']
export const plural = (value: number | null, one: string, many: string) => `${count(value)} ${value === 1 ? one : many}`

export const rupees = (value: number) => `₹${value.toLocaleString('en-IN')}`
export const count = (value: number | null) => (value === null ? 'No limit' : value.toLocaleString('en-IN'))
