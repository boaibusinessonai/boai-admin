import { useState } from 'react'
import { Badge, ErrorBox } from '../components/ui'
import type { AdminPlan } from '../lib/planForm'
import { draftOf, indiaToday, payload, problems, type Draft, type Offers, type PlanPrices } from '../lib/priceGrid'

// Admin › Packages › Extras (187m, V17/V18): one row per sold thing; a box per paid plan (blank = the every-plan price),
// an offer price with its last day. The customer pays: a running offer, else the plan's own price, else every plan.

export type PriceRow = { thing: string; name: string; gives?: string; base: number | null; baseEditable?: boolean; baseRequired?: boolean }

export function PriceGrid({ rows, plans, planPrices, offers, onSave }: {
  rows: PriceRow[]; plans: AdminPlan[]; planPrices: PlanPrices; offers: Offers
  onSave: (next: { planPrices: PlanPrices; offers: Offers; bases: Record<string, number | null> }) => void
}) {
  const things = rows.map((row) => row.thing)
  const [draft, setDraft] = useState<Draft>(() => draftOf(things, planPrices, offers))
  const [bases, setBases] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((row) => [row.thing, row.base === null ? '' : String(row.base)])))
  const names = Object.fromEntries(rows.map((row) => [row.thing, row.name]))
  const today = indiaToday()
  const wrong = [...problems(draft, names),
    ...rows.filter((row) => row.baseEditable && bases[row.thing]!.trim() !== '' && !/^\d{1,7}$/.test(bases[row.thing]!.trim())).map((row) => `${row.name}: the every-plan price is a whole number of rupees.`),
    ...rows.filter((row) => row.baseRequired && bases[row.thing]!.trim() === '').map((row) => `${row.name}: needs an every-plan price.`)]
  const setRow = (thing: string, change: Partial<Draft[string]>) => setDraft({ ...draft, [thing]: { ...draft[thing]!, ...change } })
  const changed = JSON.stringify(draft) !== JSON.stringify(draftOf(things, planPrices, offers))
    || rows.some((row) => row.baseEditable && bases[row.thing] !== (row.base === null ? '' : String(row.base)))

  return (
    <>
      <div className="table-wrap">
        <table className="table price-grid">
          <thead><tr><th>Thing</th><th>Every plan</th>{plans.map((plan) => <th key={plan.code}>{plan.name}</th>)}<th>Offer ₹</th><th>Offer last day</th></tr></thead>
          <tbody>
            {rows.map((row) => {
              const base = row.baseEditable ? (bases[row.thing]!.trim() === '' ? null : Number(bases[row.thing])) : row.base
              const offerOn = Boolean(offers[row.thing] && offers[row.thing]!.till >= today)
              return (
                <tr key={row.thing}>
                  <td><strong>{row.name}</strong>{row.gives && <span className="sub">{row.gives}</span>}{offerOn && <> <Badge tone="accent">Offer till {offers[row.thing]!.till}</Badge></>}</td>
                  <td>{row.baseEditable
                    ? <input aria-label={`${row.name} every plan`} inputMode="numeric" value={bases[row.thing]} placeholder="Not on sale" onChange={(event) => setBases({ ...bases, [row.thing]: event.target.value })} />
                    : base === null ? <span className="muted">Not on sale</span> : base.toLocaleString('en-IN')}</td>
                  {plans.map((plan) => (
                    <td key={plan.code}><input aria-label={`${row.name} on ${plan.name}`} inputMode="numeric" value={draft[row.thing]!.perPlan[plan.code] ?? ''}
                      placeholder={base === null ? '—' : String(base)}
                      onChange={(event) => setRow(row.thing, { perPlan: { ...draft[row.thing]!.perPlan, [plan.code]: event.target.value } })} /></td>
                  ))}
                  <td><input aria-label={`${row.name} offer price`} inputMode="numeric" value={draft[row.thing]!.offerPrice} onChange={(event) => setRow(row.thing, { offerPrice: event.target.value })} /></td>
                  <td><input aria-label={`${row.name} offer last day`} type="date" value={draft[row.thing]!.offerTill} onChange={(event) => setRow(row.thing, { offerTill: event.target.value })} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">A blank plan box = the every-plan price. The customer pays a running offer first, else their plan’s price, else every plan. Nothing in any box = not on sale.</p>
      {wrong.length > 0 && <ErrorBox message={wrong.join(' ')} />}
      <div className="dialog-actions">
        <button type="button" className="button" disabled={!changed} onClick={() => { setDraft(draftOf(things, planPrices, offers)); setBases(Object.fromEntries(rows.map((row) => [row.thing, row.base === null ? '' : String(row.base)]))) }}>Undo</button>
        <button type="button" className="button primary" disabled={!changed || wrong.length > 0}
          onClick={() => onSave({ ...payload(draft, planPrices, offers), bases: Object.fromEntries(rows.filter((row) => row.baseEditable).map((row) => [row.thing, bases[row.thing]!.trim() === '' ? null : Number(bases[row.thing])])) })}>Save prices…</button>
      </div>
    </>
  )
}
