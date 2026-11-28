// Admin › Packages › Extras (187m, V17/V18): a price per plan and an offer price till a date for each extra and add-on.
// The database works the price out (app.thing_price): a running offer, then the plan's own price, then the every-plan
// price. Here only the boxes: typed text in, the maps app.ent_save_plan_settings takes out.

export type PlanPrices = Record<string, Record<string, number>>
export type Offers = Record<string, { price: number; till: string }>
/** One row's boxes as typed: per plan (blank = the every-plan price), and the offer. */
export type RowDraft = { perPlan: Record<string, string>; offerPrice: string; offerTill: string }
export type Draft = Record<string, RowDraft>

export function draftOf(things: string[], planPrices: PlanPrices, offers: Offers): Draft {
  return Object.fromEntries(things.map((thing) => [thing, {
    perPlan: Object.fromEntries(Object.entries(planPrices[thing] ?? {}).map(([plan, price]) => [plan, String(price)])),
    offerPrice: offers[thing] ? String(offers[thing]!.price) : '',
    offerTill: offers[thing]?.till ?? '',
  }]))
}

const whole = (text: string) => /^\d{1,7}$/.test(text.trim())

/** What is wrong with the boxes, in words (empty when they can be saved). */
export function problems(draft: Draft, names: Record<string, string>): string[] {
  const out: string[] = []
  for (const [thing, row] of Object.entries(draft)) {
    const name = names[thing] ?? thing
    if (Object.values(row.perPlan).some((text) => text.trim() !== '' && !whole(text))) out.push(`${name}: a price is a whole number of rupees.`)
    const price = row.offerPrice.trim(), till = row.offerTill.trim()
    if (price && !whole(price)) out.push(`${name}: the offer price is a whole number of rupees.`)
    if (Boolean(price) !== Boolean(till)) out.push(`${name}: an offer needs both a price and a last day.`)
  }
  return out
}

/**
 * The maps to save. Other things' saved prices (not shown on this grid) are kept as they were.
 */
export function payload(draft: Draft, planPrices: PlanPrices, offers: Offers): { planPrices: PlanPrices; offers: Offers } {
  const nextPrices: PlanPrices = { ...planPrices }
  const nextOffers: Offers = { ...offers }
  for (const [thing, row] of Object.entries(draft)) {
    const perPlan = Object.fromEntries(Object.entries(row.perPlan).filter(([, text]) => text.trim() !== '').map(([plan, text]) => [plan, Number(text)]))
    if (Object.keys(perPlan).length) nextPrices[thing] = perPlan
    else delete nextPrices[thing]
    if (row.offerPrice.trim() && row.offerTill.trim()) nextOffers[thing] = { price: Number(row.offerPrice), till: row.offerTill.trim() }
    else delete nextOffers[thing]
  }
  return { planPrices: nextPrices, offers: nextOffers }
}

/** The price a customer on `plan` pays today, as the database works it out (offer → plan price → every-plan price). */
export function priceToday(thing: string, plan: string, base: number | null | undefined, planPrices: PlanPrices, offers: Offers, today: string): number | null {
  const offer = offers[thing]
  if (offer && offer.till >= today) return offer.price
  return planPrices[thing]?.[plan] ?? base ?? null
}

/** Today in India (YYYY-MM-DD), the day the database counts an offer by. */
export const indiaToday = (now = new Date()) => new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10)
