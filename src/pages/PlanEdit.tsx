import { indiaToday, priceToday } from '../lib/priceGrid'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Card, ErrorBox, Loading } from '../components/ui'
import { loophole, MAIN_LIMITS, MORE_LIMITS, newCustomDraft, planBelow, planCardPayload, planChanges, planDraft, rupees, type LimitField, type PlanChange, type PlanDraft } from '../lib/planForm'
import { families, featureName, groupFeatures } from '../lib/featureGroups'
import { navigate } from '../lib/route'
import { admin } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'
import type { Catalogue } from './Plans'

// One plan on its own page (owner 2026-11-16): the board's form, and on Save the question "How should this apply?"
// with counts only (never names): new buyers only, everyone now, or each customer at the next renewal.
// Customers keep what they bought unless the admin picks otherwise (app.ent_keep_terms in the database).

type Reach = { free: boolean; customers: number; older: number; renewSoon: number; byHand: number; addOnBuyers: Record<string, number>; byType?: Record<string, number> }
type ApplyTo = 'new' | 'everyone' | 'renewal'
type Review = { payload: ReturnType<typeof planCardPayload>; changes: PlanChange[] }

const back = () => navigate({ page: 'plans' })
const people = (value: number) => `${value.toLocaleString('en-IN')} ${value === 1 ? 'customer' : 'customers'}`

export function PlanEdit({ code }: { code: string }) {
  const { data, error, reload } = useLoad(() => admin<Catalogue>('plans'), 'plans')
  const isNew = code === 'new'
  const plan = data?.plans.find((row) => row.code === code)
  const reach = useLoad(() => (isNew || !plan || plan.isCustom ? Promise.resolve(null) : admin<Reach>('plan_reach', { code })), `${code}|${plan ? 'y' : 'n'}`)
  const [edited, setDraft] = useState<PlanDraft | null>(null)
  const [formError, setFormError] = useState('')
  const [review, setReview] = useState<Review | null>(null)
  const [applyTo, setApplyTo] = useState<ApplyTo | null>(null)

  if (error) return <div className="page"><ErrorBox message={error} onRetry={reload} /></div>
  if (!data) return <Loading />
  if (!isNew && !plan) return <div className="page"><ErrorBox message="There is no such plan." /><button type="button" className="button" onClick={back}>Back to Plans</button></div>
  const draft = edited ?? (plan ? planDraft(plan) : newCustomDraft(Math.max(0, ...data.plans.map((row) => row.position)) + 1))
  const below = !draft.isCustom ? planBelow(data.plans, draft.code, Number(draft.position)) : null
  const inherited = below ? [...below.includes, ...below.features] : []
  const set = (change: Partial<PlanDraft>) => setDraft({ ...draft, ...change })
  const limitName = (key: LimitField) => data.limits.find((limit) => limit.key === key)?.name ?? key
  const nameOf = (key: string) => key.startsWith('type:') ? data.types?.find((type) => `type:${type.key}` === key)?.name ?? key.slice(5)
    : data.limits.find((limit) => limit.key === key)?.name ?? featureName(data.features, key)
  const planDay = draft.limits.salesPerDay.trim() === '' ? 'no limit' : draft.limits.salesPerDay.trim()

  function reviewPlan() {
    try {
      setFormError('')
      const payload = planCardPayload({ ...draft, on: [...new Set([...draft.on, ...inherited])] })
      setApplyTo(null)
      setReview({ payload, changes: plan ? planChanges(plan, payload, nameOf) : [] })
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Check the form.') }
  }
  /** The choice is asked when customers could feel the change: a standard plan, not new, with terms changed. */
  const asks = Boolean(review && plan && !plan.isCustom && review.changes.length > 0)
  const free = reach.data?.free ?? code === 'free'
  async function save(reason: string) {
    if (!review) return
    if (asks && !free && !applyTo) throw new Error('Choose how this change applies to customers already on it.')
    await admin('save_plan', { ...review.payload, ...(asks ? { applyTo: free ? 'everyone' : applyTo } : {}), reason })
    back()
  }
  const name = draft.name || draft.code

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <button type="button" className="text-button" onClick={back}><ArrowLeft size={16} /> Plans</button>
          <h1>{isNew ? 'New custom package' : `Edit ${plan?.name ?? code}`}</h1>
          <p className="muted">Customers already on this plan keep what they have unless you choose otherwise when you save.</p>
        </div>
      </header>

      <Card title={isNew ? 'New custom package' : `Edit ${draft.name || draft.code}`}>
        <div className="plan-form">
          <label className="field"><span>Name customers see</span><input value={draft.name} maxLength={60} onChange={(event) => set({ name: event.target.value })} /></label>
          <label className="field"><span>Price a year (+ GST)</span><input inputMode="numeric" value={draft.yearly} onChange={(event) => set({ yearly: event.target.value })} /></label>
          <label className="field"><span>Price a month, paid monthly</span><input inputMode="numeric" value={draft.monthly} onChange={(event) => set({ monthly: event.target.value })} /></label>
          <label className="field"><span>How it is sold</span><select value={draft.isCustom ? 'talk' : 'buy'} disabled title="Only Custom is Talk to us"><option value="buy">Buy online</option><option value="talk">Talk to us</option></select></label>
          <label className="field"><span>One line about it</span><input value={draft.tagline} maxLength={160} onChange={(event) => set({ tagline: event.target.value })} /></label>
          {MAIN_LIMITS.map(({ field, label }) => (
            <label key={field} className="field"><span>{label} (blank: no limit)</span><input inputMode="numeric" value={draft.limits[field]} onChange={(event) => set({ limits: { ...draft.limits, [field]: event.target.value } })} />
              {(field === 'managers' || field === 'billers') && <span className="check sub feature-waits"><input type="checkbox" disabled /> per store (coming soon)</span>}</label>
          ))}
        </div>
        <details className="plan-more">
          <summary>More about this plan</summary>
          <div className="plan-form">
            <label className="field"><span>Code (can’t change later)</span><input value={draft.code} disabled={!isNew} onChange={(event) => set({ code: event.target.value })} /></label>
            <label className="field"><span>Order</span><input inputMode="numeric" value={draft.position} onChange={(event) => set({ position: event.target.value })} /></label>
            {MORE_LIMITS.map((field) => (
              <label key={field} className="field"><span>{limitName(field)} (blank: no limit)</span><input inputMode="numeric" value={draft.limits[field]} onChange={(event) => set({ limits: { ...draft.limits, [field]: event.target.value } })} /></label>
            ))}
          </div>
          {(data.types?.length ?? 0) > 0 && (
            <details className="plan-more" open={Object.keys(draft.byType).some((type) => draft.byType[type]!.trim() !== '')}>
              <summary>{limitName('salesPerDay')} by business type</summary>
              <p className="sub">Blank = this plan’s own number ({planDay}). A business set up with two types gets the bigger number. Past it the bill is refused and the next plan up is named.</p>
              <div className="plan-form">
                {data.types!.map((type) => {
                  const count = reach.data?.byType?.[type.key] ?? 0
                  return (
                    <label key={type.key} className="field"><span>{type.name}{count > 0 && <span className="sub"> · {count.toLocaleString('en-IN')} {count === 1 ? 'business' : 'businesses'} on it</span>}</span>
                      <input inputMode="numeric" placeholder={planDay} value={draft.byType[type.key] ?? ''} onChange={(event) => set({ byType: { ...draft.byType, [type.key]: event.target.value } })} /></label>
                  )
                })}
              </div>
            </details>
          )}
          {!draft.isCustom && <label className="check"><input type="checkbox" checked={draft.offered} onChange={(event) => set({ offered: event.target.checked })} /> On offer to everyone</label>}
          {!draft.isCustom && <label className="check"><input type="checkbox" checked={draft.onPricing} onChange={(event) => set({ onPricing: event.target.checked })} /> Shown on the landing page</label>}
          {!draft.isCustom && draft.onPlanPage !== undefined && <label className="check"><input type="checkbox" checked={draft.onPlanPage} onChange={(event) => set({ onPlanPage: event.target.checked })} /> Shown on customers’ Plan page</label>}
          <label className="check"><input type="checkbox" checked={draft.popular} onChange={(event) => set({ popular: event.target.checked })} /> “Most popular” ribbon</label>
          {draft.isCustom && <label className="check"><input type="checkbox" checked={draft.addOns} onChange={(event) => set({ addOns: event.target.checked })} /> Add-ons can be bought on it</label>}
          <label className="check"><input type="checkbox" checked={draft.typeAppsFree} onChange={(event) => set({ typeAppsFree: event.target.checked })} /> Gets the apps a business comes with (Business types › Free)</label>
          {draft.isCustom && <label className="check"><input type="checkbox" checked={draft.team} onChange={(event) => set({ team: event.target.checked })} /> People besides the owner</label>}
        </details>
        {!draft.isCustom ? (
          <div className="plan-grid-note">
            <p><strong>Builds on:</strong> {below ? `${below.name} (everything set there comes with this plan unless this column says otherwise)` : 'nothing (the first plan)'}</p>
            <p className="sub">What is inside this plan, what is locked on it, Edit menu and the menu locks are set in Selling (this plan’s column).</p>
            <button type="button" className="button small" onClick={() => navigate({ page: 'selling' })}>Open Selling</button>
          </div>
        ) : (<>
        <h3>Inside this plan {below && <span className="sub">(grey = comes from {below.name}, can’t be unticked)</span>}</h3>
          {below && inherited.length > 0 && <p className="sub">From {below.name}: {inherited.map((key) => featureName(data.features, key)).join(', ')}</p>}
          {groupFeatures(data.features).map((group, index, groups) => (
            <div key={`${group.section}${group.title}`}>
              {groups[index - 1]?.section !== group.section && <h4 className="feature-section">{group.section}</h4>}
              {group.title && <h4 className="feature-group">{group.title}</h4>}
              <div className="plan-form">
                {families(group.rows).map(({ head, kids }) => {
                  const box = (feature: typeof head) => {
                    const fromBelow = inherited.includes(feature.key)
                    return (
                    <label key={feature.key} className={`check feature-check${fromBelow ? ' feature-from' : ''}${feature.needs && !draft.on.includes(feature.needs) ? ' feature-waits' : ''}`}><input type="checkbox" checked={fromBelow || draft.on.includes(feature.key)} disabled={fromBelow}
                      onChange={(event) => set({ on: event.target.checked ? [...draft.on, feature.key] : draft.on.filter((key) => key !== feature.key) })} />
                      <span>{feature.name}{feature.meaning && <span className="sub">{feature.meaning}</span>}
                        {feature.needs && <span className="sub needs">Needs {featureName(data.features, feature.needs)} on</span>}</span></label>)
                  }
                  return kids.length ? <div key={head.key} className="feature-family">{box(head)}<div className="feature-kids">{kids.map(box)}</div></div> : box(head)
                })}
              </div>
            </div>
          ))}
          <h3>Menu</h3>
          <label className="check"><input type="checkbox" checked={draft.canEditMenu} onChange={(event) => set({ canEditMenu: event.target.checked })} /> <span>Can edit menu<span className="sub">On: owners and managers on this plan get Edit menu. Off: they see it locked, with a “See plans” page.</span></span></label>
        </>)}
        <h3>Extras on this plan <span className="sub">(₹ a month each, today)</span></h3>
        <div className="plan-form">
          {([['store', 'Another store', data.settings.extraStorePrice], ['business', 'Another business', data.settings.extraBusinessPrice], ['manager', 'Manager', data.settings.seatPrices.manager],
            ['biller', 'Biller', data.settings.seatPrices.biller], ['screen', 'Screen staff', data.settings.seatPrices.screen ?? null]] as const).map(([thing, name, base]) => {
            const price = priceToday(thing, draft.code, base, data.settings.planPrices ?? {}, data.settings.offers ?? {}, indiaToday())
            return <label key={thing} className="field"><span>{name}</span><input disabled value={price === null ? 'Not on sale' : price} /></label>
          })}
          <label className="field"><span>10 GB space</span><input disabled placeholder="Coming soon" /></label>
        </div>
        <p className="sub">A price for this plan, the every-plan price and offers are set in Selling (tap the thing’s name).</p>
        {below && (() => {
          const check = loophole(below, { ...draft, on: [...new Set([...draft.on, ...inherited])] }, {
            addOns: data.addOns, store: data.settings.extraStorePrice, business: data.settings.extraBusinessPrice, biller: data.settings.seatPrices.biller, manager: data.settings.seatPrices.manager })
          const name = draft.name || draft.code
          return Number.isFinite(check.price) && (
            <div className={`plan-check ${check.passes ? 'ok' : 'bad'}`}>
              <strong>Loophole check: {check.passes ? 'passes' : `fails, fix ${name}`}</strong>
              <span>{below.name} ({rupees(below.yearly)}) + buying what {name} adds one by one = <strong>{rupees(check.byParts)}</strong> a month. {name} is <strong>{rupees(check.price)}</strong>. {check.passes ? 'Moving up is cheaper.' : 'Buying the parts is cheaper than moving up.'}</span>
              <span className="sub">Worked out from the add-on and people prices (a month, paid yearly), against the plan below. Saving is still allowed.</span>
            </div>
          )
        })()}
        {formError && <ErrorBox message={formError} />}
        <div className="dialog-actions plan-edit-actions">
          <button type="button" className="button" disabled title="Coming soon">See on website</button>
          <button type="button" className="button" onClick={back}>Cancel</button>
          <button type="button" className="button primary" onClick={reviewPlan}>Save…</button>
        </div>
      </Card>

      {review && (
        <ConfirmDialog title={asks ? 'How should this apply?' : 'Save this change?'} action="Save" onDone={save} onClose={() => setReview(null)}>
          {!asks ? <p>{isNew ? `${name} will be added.` : plan?.isCustom ? `${name} belongs to one account; it gets the change.` : 'Only the name, words or showing change. Nothing changes for customers.'}</p> : (
            <div className="apply-box">
              <p><strong>You are changing {name}:</strong></p>
              <ul className="apply-changes">{review.changes.map((change) => <li key={change.text}>{change.text}</li>)}</ul>
              {!reach.data ? (reach.error ? <ErrorBox message={reach.error} onRetry={reach.reload} /> : <p className="sub">Counting customers…</p>) : free ? (
                <p className="apply-note">Free has no renewals: this reaches all <strong>{people(reach.data.customers)}</strong> on Free.</p>
              ) : (
                <>
                  <p>{name} customers now: <strong>{reach.data.customers.toLocaleString('en-IN')}</strong>{reach.data.older > 0 && <span className="sub"> (+ {people(reach.data.older)} on older {name} terms)</span>}</p>
                  <div className="apply-choices" role="radiogroup" aria-label="How should this apply?">
                    {([
                      ['new', 'New buyers only', `${people(reach.data.customers)} keep what they have`],
                      ['everyone', 'Everyone now', `${people(reach.data.customers + reach.data.older)} get it today`],
                      ['renewal', 'Each at next renewal', `${people(reach.data.customers)} change when they renew · ${reach.data.renewSoon.toLocaleString('en-IN')} in the next 30 days`],
                    ] as const).map(([value, label, says], index) => (
                      <label key={value} className={`apply-choice${applyTo === value ? ' on' : ''}`}>
                        <input type="radio" name="applyTo" value={value} checked={applyTo === value} onChange={() => setApplyTo(value)} />
                        <span><strong>({index + 1}) {label}</strong><span className="sub">{says}</span></span>
                      </label>
                    ))}
                  </div>
                  {reach.data.byHand > 0 && <p className="sub">{people(reach.data.byHand)} have something set by hand (Admin on, gift, custom). That always wins.</p>}
                  {review.changes.filter((change) => change.kind === 'on' && change.key && reach.data!.addOnBuyers[change.key]).map((change) => (
                    <p key={change.key} className="sub">{people(reach.data!.addOnBuyers[change.key!]!)} already pay for {nameOf(change.key!)} month by month. Once it is in their plan they needn’t buy it again.</p>
                  ))}
                  <p className="sub">A lower count never removes people or data: they just can’t add more until under it. A module taken off leaves the menu; its data stays.</p>
                </>
              )}
              <label className="check feature-waits"><input type="checkbox" disabled /> Inform them on their Plan page (coming soon)</label>
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  )
}
