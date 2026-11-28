// Admin › Selling (V101, read only; board H7tJ8eg1zwWM4UV8Pii6Ub): the small sums the grid page makes. admin.sell_grid holds
// the data; what each cell means is Entitlements' rule (DB_HANDOFF_selling.md §1).

export type SellState = 'in' | 'buy' | 'upgrade' | 'hidden'
export type SellCell = { own?: { state?: SellState; price?: number }; state: SellState; price?: number; included?: number | 'all' }
export type SellRow = {
  key: string; kind: 'addon' | 'extra' | 'feature' | 'more' | 'coins'; scope: 'business' | 'store' | 'account'; name: string; blurb?: string
  price?: number; packs?: unknown[]; offer?: number; offerTill?: string; onSale: boolean; ready: boolean; kinds: string[]; everyKind?: boolean; freeWith: string[]; places: string[]
  updatedAt?: string; updatedBy?: string
}
export type SellPlan = { code: string; name: string; monthly: number; buildsOn?: string; ladder?: boolean; custom?: boolean; active: boolean; offered?: boolean }

/** The ladder plans the grid can change: on offer (BROKEN-32; the rest show in the read-only fold, they still pass things up). */
export const shownLadder = (ladder: SellPlan[]) => ladder.filter((plan) => plan.offered !== false)
export type SellGrid = { plans: SellPlan[]; rows: SellRow[]; cells: Record<string, Record<string, SellCell>>; settings: { marketSellsAll: boolean; graceDays: number; includedAutoOn?: boolean } }

export const GROUPS = ['Business add-ons', 'Store apps', 'Extras inside a page', 'One more', 'AI coins', 'Plan features'] as const
export type Group = (typeof GROUPS)[number]

/** The grid's row groups (board order). */
export function groupOf(row: Pick<SellRow, 'kind' | 'scope'>): Group {
  if (row.kind === 'addon') return row.scope === 'business' ? 'Business add-ons' : 'Store apps'
  if (row.kind === 'extra') return 'Extras inside a page'
  if (row.kind === 'more') return 'One more'
  if (row.kind === 'coins') return 'AI coins'
  return 'Plan features'
}

/** Rows in groups, each group in the grid's order; empty groups left out. */
export function grouped(rows: SellRow[]): { group: Group; rows: SellRow[] }[] {
  return GROUPS.map((group) => ({ group, rows: rows.filter((row) => groupOf(row) === group) })).filter((part) => part.rows.length > 0)
}

/** The first ladder plan after `index` where the thing is In: "↑ <plan>" on an Upgrade cell (null: none, shown as –). */
export function upPlan(row: SellRow, ladder: SellPlan[], index: number, cells: SellGrid['cells']): string | null {
  for (let i = index + 1; i < ladder.length; i++) if (cells[ladder[i]!.code]?.[row.key]?.state === 'in') return ladder[i]!.name
  return null
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`
const incl = (included: SellCell['included']) => (included === undefined ? '' : included === 'all' ? 'No limit' : `${included} incl.`)

/** What a cell says: In (or "2 incl."), ₹price (Buy; packs = "Packs"; no price = "Not on sale"), ↑ plan (Upgrade), – (Hidden). */
export function cellWord(row: SellRow, cell: SellCell | undefined, up: string | null): string {
  if (!cell) return '–'
  const count = row.kind === 'more' ? incl(cell.included) : ''
  if (cell.state === 'in') return count || 'In'
  if (cell.state === 'buy') {
    const price = cell.price ?? row.price
    const what = row.packs && row.packs.length ? 'Packs' : price === undefined ? 'Not on sale' : rupees(price)
    return count && cell.included !== 0 ? `${count} · ${what}` : what
  }
  if (cell.state === 'upgrade') return up ? `↑ ${up}` : '–'
  return '–'
}

/** Faded = nothing set on this plan for it: it takes the plan it builds on. */
export const inherited = (cell: SellCell | undefined) => !cell?.own?.state

// ---- V105 (selling P3.2): editing the grid. Edits are kept on the page until Save; Entitlements' app.sell_save checks again. ----

/** One change waiting to be saved: a cell's own state (null = as the plan below) and/or its own price (null = as below). */
export type Edit = { plan: string; key: string; state?: SellState | null; price?: number | null }
export type Edits = Record<string, Edit>
export const editId = (plan: string, key: string) => `${plan}|${key}`
const isCount = (row: Pick<SellRow, 'kind'>) => row.kind === 'more' || row.kind === 'coins'
const RANK: Record<SellState, number> = { in: 3, buy: 2, upgrade: 1, hidden: 0 }

/** A cell's own state and price after the edits (undefined = nothing set on this plan: the plan below). */
export function ownOf(cells: SellGrid['cells'], edits: Edits, plan: string, key: string): { state?: SellState; price?: number } {
  const cell = cells[plan]?.[key]
  const edit = edits[editId(plan, key)]
  const state = edit && 'state' in edit ? edit.state ?? undefined : cell?.own?.state
  const price = edit && 'price' in edit ? edit.price ?? undefined : cell?.own?.price
  return { ...(state ? { state } : {}), ...(price !== undefined ? { price } : {}) }
}

/** What applies on every ladder plan for one row after the edits: own, else the plan below (Free: hidden, no price). */
export function effective(row: SellRow, ladder: SellPlan[], cells: SellGrid['cells'], edits: Edits): SellCell[] {
  const out: SellCell[] = []
  ladder.forEach((plan, i) => {
    const own = ownOf(cells, edits, plan.code, row.key)
    const below = out[i - 1]
    const state = own.state ?? below?.state ?? 'hidden'
    const price = own.price ?? below?.price
    const included = cells[plan.code]?.[row.key]?.included
    out.push({ ...(Object.keys(own).length ? { own } : {}), state, ...(price !== undefined ? { price } : {}), ...(included !== undefined ? { included } : {}) })
  })
  return out
}

/** Included on the plan below: stays included here (the cell can't be changed). */
export const lockedIn = (eff: SellCell[], index: number) => index > 0 && eff[index - 1]?.state === 'in'

/**
 * The next own state when a cell is tapped: as the plan below → In → Buy → Upgrade → Hidden → as the plan below. Free (no plan
 * below) never goes back to "as below"; a count (one more, AI coins) is never In; a plan feature (no price) is never Buy.
 */
export function nextState(row: Pick<SellRow, 'kind'>, own: SellState | undefined, first: boolean): SellState | null {
  const buy = row.kind === 'feature' ? [] : ['buy' as const]
  const order: (SellState | null)[] = [...(first ? [] : [null]), ...(isCount(row) ? [] : ['in' as const]), ...buy, 'upgrade', 'hidden']
  const at = order.indexOf(own ?? null)
  return order[(at + 1) % order.length] ?? null
}

/**
 * Tap on a cell: the edits after it. Setting In also clears what plans above set for it (In flows up); a cell under an In is
 * locked and nothing changes. An edit equal to what is saved is dropped.
 */
export function tapCell(row: SellRow, ladder: SellPlan[], cells: SellGrid['cells'], edits: Edits, index: number): Edits {
  const eff = effective(row, ladder, cells, edits)
  if (lockedIn(eff, index)) return edits
  const plan = ladder[index]!
  const state = nextState(row, ownOf(cells, edits, plan.code, row.key).state, index === 0)
  let next = setEdit(cells, edits, { plan: plan.code, key: row.key, state })
  if (state === 'in') for (const above of ladder.slice(index + 1)) if (ownOf(cells, next, above.code, row.key).state) next = setEdit(cells, next, { plan: above.code, key: row.key, state: null })
  return next
}

/** Adds one edit (merged with an earlier one on the same cell); parts equal to what is saved are left out. */
export function setEdit(cells: SellGrid['cells'], edits: Edits, edit: Edit): Edits {
  const id = editId(edit.plan, edit.key)
  const saved = cells[edit.plan]?.[edit.key]?.own ?? {}
  const merged: Edit = { ...edits[id], ...edit }
  const out: Edit = { plan: edit.plan, key: edit.key }
  if ('state' in merged && (merged.state ?? undefined) !== saved.state) out.state = merged.state ?? null
  if ('price' in merged && (merged.price ?? undefined) !== saved.price) out.price = merged.price ?? null
  const rest = { ...edits }
  delete rest[id]
  return 'state' in out || 'price' in out ? { ...rest, [id]: out } : rest
}

/** The ladder plans a save reaches: each edited plan, and the plans above it that take it from below (nothing set there). */
export function reachedPlans(ladder: SellPlan[], cells: SellGrid['cells'], edits: Edits): string[] {
  const hit = new Set<string>()
  for (const edit of Object.values(edits)) {
    const at = ladder.findIndex((plan) => plan.code === edit.plan)
    if (at < 0) continue
    hit.add(edit.plan)
    for (const above of ladder.slice(at + 1)) {
      const own = ownOf(cells, edits, above.code, edit.key)
      if (('state' in edit && own.state) || (!('state' in edit) && own.price !== undefined)) break
      hit.add(above.code)
    }
  }
  return ladder.filter((plan) => hit.has(plan.code)).map((plan) => plan.code)
}

/**
 * A change to the card's every-plan price, offer or On sale reaches only the plans where it is bought alone (Buy after the
 * edits), plus what the card's own per-plan prices reach (BROKEN-33: every plan was counted, Free too, so the Free note always showed).
 */
export function cardReach(row: SellRow, ladder: SellPlan[], cells: SellGrid['cells'], edits: Edits): string[] {
  const eff = effective(row, ladder, cells, edits)
  const hit = new Set([...reachedPlans(ladder, cells, edits), ...ladder.filter((_, i) => eff[i]?.state === 'buy').map((plan) => plan.code)])
  return ladder.filter((plan) => hit.has(plan.code)).map((plan) => plan.code)
}

/** Ladder plans whose cell changes only because a plan below changed (nothing set there): they follow it (BROKEN-35). */
export function followers(row: SellRow, ladder: SellPlan[], cells: SellGrid['cells'], edits: Edits): string[] {
  const was = effective(row, ladder, cells, {})
  const now = effective(row, ladder, cells, edits)
  return ladder.filter((plan, i) => !edits[editId(plan.code, row.key)] && (was[i]!.state !== now[i]!.state || was[i]!.price !== now[i]!.price)).map((plan) => plan.code)
}

/**
 * What a save takes away from customers already on a plan (In → locked, Buy → not sold, a higher price): plan code → the names.
 * Free is left out (nothing is paid on it). These can't reach everyone now: only new buyers or at renewal.
 */
export function givesLess(rows: SellRow[], ladder: SellPlan[], cells: SellGrid['cells'], edits: Edits, rowEdits: Record<string, Partial<SellRow>> = {}): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const row of rows) {
    const was = effective(row, ladder, cells, {})
    const now = effective({ ...row, ...rowEdits[row.key] }, ladder, cells, edits)
    ladder.forEach((plan, i) => {
      if (plan.code === 'free') return
      const a = was[i]!, b = now[i]!
      const before = a.price ?? row.price, after = b.price ?? rowEdits[row.key]?.price ?? row.price
      if (RANK[b.state] < RANK[a.state] || (a.state === 'buy' && b.state === 'buy' && before !== undefined && after !== undefined && after > before)) (out[plan.code] ??= []).push(row.name)
    })
  }
  return out
}

/**
 * The upgrade check (board "Upgrade check", was the loophole check on a plan): the plan below + buying one by one what this plan
 * adds (things In here, Buy below at their price; counts it has more of × the price of one more) against this plan's price a
 * month. passes: moving up costs no more. byParts null: something it adds can't be bought on the plan below.
 */
export function upgradeCheck(rows: SellRow[], ladder: SellPlan[], cells: SellGrid['cells'], edits: Edits): { plan: SellPlan; below: SellPlan; byParts: number | null; adds: string[]; passes: boolean }[] {
  const effs = rows.map((row) => ({ row, eff: effective(row, ladder, cells, edits) }))
  return ladder.slice(1).map((plan, j) => {
    const i = j + 1, below = ladder[j]!
    let byParts: number | null = below.monthly
    const adds: string[] = []
    for (const { row, eff } of effs) {
      const here = eff[i]!, under = eff[i - 1]!
      if (row.kind === 'more') {
        const more = typeof here.included === 'number' && typeof under.included === 'number' ? here.included - under.included : 0
        const price = under.price ?? row.price
        if (more > 0 && price !== undefined && byParts !== null) { byParts += more * price; adds.push(`${more} × ${row.name}`) }
        continue
      }
      if (row.kind === 'coins' || here.state !== 'in' || under.state === 'in') continue
      adds.push(row.name)
      const price = under.price ?? row.price
      if (row.kind === 'feature' || under.state !== 'buy' || price === undefined) { byParts = null; continue }
      if (byParts !== null) byParts += price
    }
    return { plan, below, byParts, adds, passes: byParts === null || plan.monthly <= byParts }
  })
}
