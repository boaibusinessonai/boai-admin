// Admin › Costs (V116, selling C2; boards H7tJ8eg1zwWM4UV8Pii6Ub Costs + DM2YsiGbeeJtfvhuLKzsom Costs calculator): the sums the
// page makes from admin.costs (V115). The database keeps the lines, their history, the use per plan and the last 30 days; this
// file turns them into cost per customer on each plan, margin, fixed costs, break-even and the "what if" box. All money in paise.

export type CostKind = 'monthly' | 'yearly' | 'once' | 'unit' | 'percent'
export type CostUnit = 'account' | 'business' | 'store' | 'bills_1000' | 'gb_stored' | 'gb_sent' | 'edge_calls_1000' | 'e_invoice' | 'email' | 'support_hour' | 'ai_coin'
export type CostLine = {
  id: string; versionId: string; kind: CostKind; name: string; paise: number | null; percent: number | null; unit: CostUnit | null
  months: number | null; nextDue: string | null; fromDate: string; tillDate: string | null; note: string | null; updatedBy?: string | null
  monthPaise: number | null; renewSoon: boolean; history?: CostLine[]
}
export type PlanActual = { plan: string; planName: string | null; accounts: number; businesses: number; stores: number; bills: number; aiCoins: number; aiPaise: number; mrrPaise: number; paidPaise: number
  /** V139: database space of the plan's stores at the last nightly count. */
  dbBytes?: number }
/** V139: the last nightly count of database space per store (admin_store_space). */
export type SpaceType = { type: string; stores: number; bytes: number; files: number }
export type SpaceStore = { storeId: string; store: string; business: string; type: string; ownerId: string; bytes: number; files: number }
export type SpaceSummary = { measuredAt: string | null; bytes: number; files: number; stores: number; byType: SpaceType[]; top: SpaceStore[] }
export type Actuals = { days: number; dbBytes: number; dbBytesPerAccount: number | null; spaceCounted: boolean; aiCoinPaiseMax: number | null; plans: PlanActual[]; space?: SpaceSummary }
export type AiRisk = { kind: 'mode_below_cost'; mode: string; times: number; markup: number }
export type CostsData = { costs: CostLine[]; ended: CostLine[]; usage: Record<string, Partial<Record<CostUnit, number>>>; actuals: Actuals; aiRisks: AiRisk[]; renewalsDue: CostLine[] }
/** A plan as the calculator needs it: price a month (₹), AI coins a month (Free: once, so 0 a month). */
export type CalcPlan = { code: string; name: string; monthly: number; coins: number }

export const KIND_WORD: Record<CostKind, string> = { monthly: 'Monthly', yearly: 'Yearly', once: 'Once', unit: 'Per unit', percent: '% of price' }
export const UNIT_WORD: Record<CostUnit, string> = {
  account: 'each account', business: 'each business', store: 'each store', bills_1000: '1,000 bills', gb_stored: 'GB stored', gb_sent: 'GB sent',
  edge_calls_1000: '1,000 server calls', e_invoice: 'e-invoice', email: 'email', support_hour: 'support hour', ai_coin: 'AI coin',
}
export const UNITS = Object.keys(UNIT_WORD) as CostUnit[]
export const GST = 0.18
/** Bytes in a GB (1024³, as the page writes MB). */
export const GB = 1024 ** 3

/** "512 KB", "3.4 MB", "1.25 GB". */
export function bytesWord(bytes: number) {
  const b = Number(bytes) || 0
  if (b >= GB) return `${(b / GB).toLocaleString('en-IN', { maximumFractionDigits: 2 })} GB`
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toLocaleString('en-IN', { maximumFractionDigits: 1 })} MB`
  return `${Math.round(b / 1024).toLocaleString('en-IN')} KB`
}

/** What a GB stored costs us a month: the per-unit "GB stored" lines added up (paise); null = no such line typed. */
export function gbStoredPaise(costs: CostLine[]): number | null {
  const lines = costs.filter((c) => c.kind === 'unit' && c.unit === 'gb_stored')
  return lines.length ? lines.reduce((sum, c) => sum + (c.paise ?? 0), 0) : null
}

/** Our cost a month for this many bytes stored, from the GB stored lines; null = no such line. */
export const spacePaise = (costs: CostLine[], bytes: number) => {
  const gb = gbStoredPaise(costs)
  return gb === null ? null : gb * (Number(bytes) || 0) / GB
}

const PART_WORD: Record<string, string> = {
  sales: 'Bills', sale_items: 'Bill lines', sale_returns: 'Returns', sale_return_lines: 'Return lines', change_log: 'Change history',
  stock_movements: 'Stock moves', journal_entries: 'Account entries', journal_lines: 'Account lines', journal_sources: 'Account sources',
  products: 'Items', customers: 'Customers', purchase_receipts: 'Purchases', purchase_receipt_lines: 'Purchase lines',
  restaurant_orders: 'Table orders', restaurant_order_lines: 'Table order lines', kitchen_tickets: 'KOTs', job_cards: 'Job cards', job_card_lines: 'Job card lines', appointments: 'Appointments',
  stays: 'Room stays', clinic_visits: 'Visits', event_outbox: 'Messages waiting', other: 'Everything else',
}
/** A table as a plain word for Admin ("sale_items" → "Bill lines"); unknown tables read as their name with spaces. */
export const partWord = (table: string) => PART_WORD[table] ?? table.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase())

/** "₹1,234.50": paise as rupees, 2 places (small per-customer figures need them). */
export const rs = (paise: number) => `${paise < 0 ? '−' : ''}₹${(Math.abs(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
/** "₹0.0195": a coin's cost, 4 places. */
export const rsCoin = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`

/** Fixed costs a month: monthly + yearly ÷ 12 + once spread over its months (the database works out each line's month). */
export const fixedPaise = (costs: CostLine[]) => costs.reduce((sum, c) => sum + (c.monthPaise ?? 0), 0)
/** Payment fee and other % of the price, added up. */
export const percentTotal = (costs: CostLine[]) => costs.reduce((sum, c) => sum + (c.kind === 'percent' ? c.percent ?? 0 : 0), 0)

/**
 * How much of a unit one account on the plan uses a month: what the owner typed for the plan, else the real last 30 days
 * where the database counts it (an account is 1; businesses, stores and bills per account; GB stored = the nightly database count, V139), else 0. AI coins are not a unit
 * here: the AI line works them out from the plan's coins (aiPaise), so a typed ai_coin unit cost adds on top.
 */
export function unitUse(unit: CostUnit, typed: Partial<Record<CostUnit, number>> | undefined, actual: PlanActual | undefined): { amount: number; real: boolean } {
  const own = typed?.[unit]
  if (own !== undefined) return { amount: own, real: false }
  if (unit === 'account') return { amount: 1, real: true }
  const n = actual?.accounts ?? 0
  if (n > 0 && unit === 'business') return { amount: actual!.businesses / n, real: true }
  if (n > 0 && unit === 'store') return { amount: actual!.stores / n, real: true }
  if (n > 0 && unit === 'bills_1000') return { amount: actual!.bills / n / 1000, real: true }
  if (n > 0 && unit === 'gb_stored' && Number(actual!.dbBytes) > 0) return { amount: Number(actual!.dbBytes) / GB / n, real: true }
  return { amount: 0, real: false }
}

/** Per-unit costs for one account on the plan, a month. */
export function unitPaise(costs: CostLine[], typed: Partial<Record<CostUnit, number>> | undefined, actual: PlanActual | undefined) {
  return costs.reduce((sum, c) => (c.kind === 'unit' && c.unit ? sum + (c.paise ?? 0) * unitUse(c.unit, typed, actual).amount : sum), 0)
}

/** What one coin costs us: the real figure from the last 30 days (Σ AI ₹ ÷ Σ coins used), and the most it can be (₹ per coin ÷ markup). */
export function coinCost(actuals: Actuals): { real: number | null; max: number | null; coins: number } {
  const coins = actuals.plans.reduce((sum, p) => sum + Number(p.aiCoins), 0)
  const paise = actuals.plans.reduce((sum, p) => sum + Number(p.aiPaise), 0)
  return { real: coins > 0 ? paise / coins : null, max: actuals.aiCoinPaiseMax, coins }
}

export type PlanRow = {
  plan: CalcPlan; customers: number; pricePaise: number; netPaise: number; aiPaise: number; otherPaise: number; fixedShare: number; feePaise: number
  costPaise: number; leftPaise: number; margin: number | null
}
export type CalcInput = { costs: CostLine[]; usage: CostsData['usage']; actuals: Actuals; coinPaise: number; usedShare: number; gstInPrice: boolean; payingCustomers: number }

/**
 * One customer on one plan, a month: price (less GST when the price includes it), AI = coins × share really used × cost per coin,
 * other = per-unit costs, fixed share = fixed ÷ paying customers (paid plans only), fee = % × price; left = price − all; margin = left ÷ price.
 */
export function planRow(plan: CalcPlan, input: CalcInput): PlanRow {
  const actual = input.actuals.plans.find((p) => p.plan === plan.code)
  const pricePaise = plan.monthly * 100
  const netPaise = input.gstInPrice ? pricePaise / (1 + GST) : pricePaise
  const aiPaise = plan.coins * input.usedShare * input.coinPaise
  const otherPaise = unitPaise(input.costs, input.usage[plan.code], actual)
  const fixedShare = pricePaise > 0 && input.payingCustomers > 0 ? fixedPaise(input.costs) / input.payingCustomers : 0
  const feePaise = netPaise * percentTotal(input.costs) / 100
  const costPaise = aiPaise + otherPaise + fixedShare + feePaise
  const leftPaise = netPaise - costPaise
  return { plan, customers: actual?.accounts ?? 0, pricePaise, netPaise, aiPaise, otherPaise, fixedShare, feePaise, costPaise, leftPaise, margin: netPaise > 0 ? leftPaise / netPaise : null }
}

/** Paying accounts in the last 30 days (plans with a price). */
export const payingCount = (plans: CalcPlan[], actuals: Actuals) =>
  plans.filter((p) => p.monthly > 0).reduce((sum, p) => sum + (actuals.plans.find((a) => a.plan === p.code)?.accounts ?? 0), 0)

/**
 * The "what if" box: N customers on each plan. Money in = Σ n × price (net); variable cost = Σ n × (AI + per-unit + fee);
 * profit = in − variable − fixed; cost each (fully loaded) = (variable + fixed) ÷ customers; break-even = the customers needed with
 * the same mix (fixed ÷ what one customer of that mix leaves before fixed). Free customers cost but bring nothing.
 */
export function scenario(plans: CalcPlan[], counts: Record<string, number>, input: Omit<CalcInput, 'payingCustomers'>) {
  const rows = plans.map((plan) => ({ n: Math.max(0, counts[plan.code] ?? 0), row: planRow(plan, { ...input, payingCustomers: 0 }) }))
  const fixed = fixedPaise(input.costs)
  const customers = rows.reduce((sum, r) => sum + r.n, 0)
  const paying = rows.reduce((sum, r) => sum + (r.row.pricePaise > 0 ? r.n : 0), 0)
  const inPaise = rows.reduce((sum, r) => sum + r.n * r.row.netPaise, 0)
  const variable = rows.reduce((sum, r) => sum + r.n * r.row.costPaise, 0)
  const profit = inPaise - variable - fixed
  const perCustomer = customers > 0 ? (inPaise - variable) / customers : 0
  const breakEven = fixed <= 0 ? 0 : perCustomer > 0 ? Math.ceil(fixed / perCustomer) : null
  return { customers, paying, inPaise, variable, fixed, profit, costEach: customers > 0 ? (variable + fixed) / customers : null, breakEven }
}

/** Customers needed to cover fixed costs if they spread evenly over the paid plans (null: never at these prices). */
export function breakEvenEven(rows: PlanRow[], fixed: number): number | null {
  const paid = rows.filter((r) => r.pricePaise > 0)
  if (fixed <= 0) return 0
  if (!paid.length) return null
  const avg = paid.reduce((sum, r) => sum + r.leftPaise + r.fixedShare, 0) / paid.length
  return avg > 0 ? Math.ceil(fixed / avg) : null
}

/** Ladder plans for the sums: on offer, not custom, cheapest first. Free's coins come once, so 0 a month. */
export function calcPlans(plans: readonly CalcSource[]): CalcPlan[] {
  return plans.filter((p) => p.offered && !p.isCustom).sort((a, b) => a.monthly - b.monthly || a.position - b.position)
    .map((p) => ({ code: p.code, name: p.name, monthly: p.monthly, coins: p.monthly > 0 ? p.aiCredits ?? 0 : 0 }))
}
export type CalcSource = { code: string; name: string; monthly: number; offered: boolean; isCustom?: boolean; position: number; aiCredits?: number | null }

/** The month with today's customers: our costs (fixed + what each customer uses) and what is left of the money in. */
export function monthSums(rows: readonly PlanRow[], fixed: number): { costPaise: number; leftPaise: number } {
  const variable = rows.reduce((sum, r) => sum + r.customers * (r.costPaise - r.fixedShare), 0)
  const inPaise = rows.reduce((sum, r) => sum + r.customers * r.netPaise, 0)
  return { costPaise: variable + fixed, leftPaise: inPaise - variable - fixed }
}

/**
 * V119 Dashboard boxes "Our costs a month" / "Left a month": the Costs page's sums at its starting choices (real cost per AI coin,
 * all of a plan's coins used, prices without GST), so both pages show the same numbers when nothing is changed on Costs.
 */
export function monthNow(data: Pick<CostsData, 'costs' | 'usage' | 'actuals'>, plans: readonly CalcSource[]) {
  const ladder = calcPlans(plans)
  const coin = coinCost(data.actuals)
  const input: CalcInput = { costs: data.costs, usage: data.usage, actuals: data.actuals, coinPaise: coin.real ?? coin.max ?? 0, usedShare: 1, gstInPrice: false, payingCustomers: payingCount(ladder, data.actuals) }
  return monthSums(ladder.map((plan) => planRow(plan, input)), fixedPaise(data.costs))
}

/** What a line's "₹ a month" column says. */
export function monthWord(c: CostLine): string {
  if (c.kind === 'percent') return c.percent === null ? '–' : 'by price'
  if (c.kind === 'unit') return 'by use'
  if (c.monthPaise === null || c.monthPaise === 0) return c.kind === 'once' ? 'spread done' : '–'
  return c.kind === 'yearly' ? `${rs(c.monthPaise)} (÷ 12)` : c.kind === 'once' ? `${rs(c.monthPaise)} (÷ ${c.months})` : rs(c.monthPaise)
}

/** What a line's amount column says. */
export const amountWord = (c: CostLine) => (c.kind === 'percent' ? `${c.percent ?? 0}%` : rs(c.paise ?? 0))

/** What a line's "every / per" column says. */
export function everyWord(c: CostLine): string {
  if (c.kind === 'monthly') return 'month'
  if (c.kind === 'yearly') return '12 months'
  if (c.kind === 'once') return `spread ${c.months ?? 0} months`
  if (c.kind === 'percent') return 'each payment'
  return c.unit ? UNIT_WORD[c.unit] : '–'
}

/** Days from `today` (YYYY-MM-DD) to `date`. */
export function daysTo(date: string, today: string) {
  return Math.round((new Date(`${date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000)
}

/** The date 12 months after `date` (a Renewed's next renewal). */
export function plusYear(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(Date.UTC(y! + 1, m! - 1, d!))
  if (next.getUTCMonth() !== m! - 1) next.setUTCDate(0) // 29 Feb → 28 Feb
  return next.toISOString().slice(0, 10)
}

/** Today in India, YYYY-MM-DD. */
export const todayIn = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
