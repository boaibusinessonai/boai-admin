import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Card, ErrorBox, Loading } from '../components/ui'
import { ladder, planCardPayload, planDraft, planGroup, planPeople, count, plural, rupees, type AdminPlan, type PlanDraft } from '../lib/planForm'
import { navigate } from '../lib/route'
import { sortByText } from '../lib/sort'
import { admin } from '../lib/supabase'
import { AiModes, AiPrices } from './AiCredits'
import { useLoad } from '../lib/useLoad'

// Plans & prices: the database's list, the one every screen reads and every charge uses. A change applies to
// new purchases and renewals; what a customer already paid never changes. Every change needs a reason and your code.

export type AddOn = { key: string; name: string; price: number; blurb: string; soon?: boolean; planOnly?: boolean; buyFrom?: string; offered: boolean; soldAlone: boolean }
export type Settings = {
  extraStorePrice: number; extraBusinessPrice: number; seatPrices: { biller: number; manager: number; staff: number; screen?: number }
  /** 187m: {thing: {plan: ₹}} and {thing: {price, till}} (Packages › Extras). */
  planPrices?: Record<string, Record<string, number>>; offers?: Record<string, { price: number; till: string }>
  /** ctl-1 / ctl-2 (V19): grace days after Paid till; reminder days a new paid account starts with. */
  graceDays?: number; remindDays?: number[]
  /** V24 (195-d): the Add-on Market sells every add-on to every business (true, no row) or only each business's Can buy list. */
  marketSellsAll?: boolean
  /** V75: the space pack (Get more space): GB it adds and the every-plan price a month (none = not on sale). */
  spacePack?: { gb?: number; price?: number }
  messagePacks: { messages: number; price: number }[]; aiTopups: { credits: number; price: number }[]; tiers: { tier: number; name: string; summary: string }[]
  customPackage: { base: number; yearlyPercent: number; basePlan: string; alsoOn: string[]; notYet: { key: string; name: string; price: number }[] }
}
export type Catalogue = { plans: AdminPlan[]; addOns: AddOn[]; features: { key: string; name: string; kind: string }[]; limits: { key: string; name: string }[]; settings: Settings
  /** V137: business types, for bills a day by type on a plan. */
  types?: { key: string; name: string }[] }

type Pending =
  | { kind: 'addOn'; addOn: AddOn; name: string }
  | { kind: 'settings'; settings: Settings }
  | { kind: 'delete'; plan: AdminPlan }
  | { kind: 'offer'; where: Where; name: string; on: boolean; save: (reason: string) => Promise<unknown> }

/** Where a switch in the lists shows a plan or add-on: on offer at all, the landing page's prices, a customer's Plan page. */
type Where = 'offer' | 'landing' | 'planPage' | 'free' | 'typeApps'
const SWITCH: Record<Where, { label: string; on: string; off: string; turnOn: string; turnOff: string; saysOn: (name: string) => string; saysOff: (name: string) => string }> = {
  offer: { label: 'on offer', on: 'On offer', off: 'Not offered', turnOn: 'Put this on offer?', turnOff: 'Take this off offer?',
    saysOn: (name) => `${name} will be on offer for new purchases.`, saysOff: (name) => `${name} will no longer be on offer. Accounts that have it keep it.` },
  landing: { label: 'on the landing page', on: 'Shown', off: 'Hidden', turnOn: 'Show this on the landing page?', turnOff: 'Hide this from the landing page?',
    saysOn: (name) => `${name} will be listed in the landing page's prices while it is on offer.`, saysOff: (name) => `${name} leaves the landing page's prices. It can still be suggested and bought.` },
  planPage: { label: 'on customers’ Plan page', on: 'Shown', off: 'Hidden', turnOn: 'Show this on customers’ Plan page?', turnOff: 'Hide this from customers’ Plan page?',
    saysOn: (name) => `${name} will be in the plan list on every customer’s Plan page.`, saysOff: (name) => `${name} leaves the plan list on customers’ Plan page. Customers already on it still see it.` },
  free: { label: 'selling to Free', on: 'On', off: 'Off', turnOn: 'Sell add-ons to Free?', turnOff: 'Stop selling add-ons to Free?',
    saysOn: (name) => `Accounts on ${name} can buy add-ons. The sale limit is never lifted by add-ons.`, saysOff: (name) => `Accounts on ${name} see add-ons locked, with no pay button. What they bought stays.` },
  typeApps: { label: 'gets the apps a business comes with', on: 'On', off: 'Off', turnOn: 'Give the apps a business comes with?', turnOff: 'Stop giving the apps a business comes with?',
    saysOn: (name) => `On ${name}, each business gets free what its type comes with (Business types › Free).`, saysOff: (name) => `On ${name}, what a business type comes with is no longer free: only what the plan has inside.` },
}

export function Plans() {
  const { data, error, reload } = useLoad(() => admin<Catalogue>('plans'), 'plans')
  const [addOn, setAddOn] = useState<AddOn | null>(null)
  const [settingsText, setSettingsText] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)

  if (error) return <div className="page"><ErrorBox message={error} onRetry={reload} /></div>
  if (!data) return <Loading />
  function reviewSettings() {
    try {
      setFormError('')
      const next = JSON.parse(settingsText ?? '') as Settings
      // V105: prices and packs belong to Selling (the grid); changing them here would write the grid over.
      const grid = ['extraStorePrice', 'extraBusinessPrice', 'seatPrices', 'messagePacks', 'aiTopups', 'planPrices', 'offers', 'spacePack'] as const
      if (grid.some((key) => JSON.stringify(next[key]) !== JSON.stringify(data!.settings[key]))) { setFormError('Prices and packs are changed in Selling now (tap the thing’s name for its card).'); return }
      setPending({ kind: 'settings', settings: next })
    } catch { setFormError('That isn’t valid. Keep the same layout and change only the numbers and names.') }
  }
  async function apply(reason: string) {
    if (!pending) return
    if (pending.kind === 'offer') { await pending.save(reason); reload(); return }
    if (pending.kind === 'addOn') {
      const { key, name, blurb, price, soldAlone, buyFrom, soon, offered } = pending.addOn
      await admin('save_add_on', { key, name, blurb, price, soldAlone, buyFrom: buyFrom || null, soon: Boolean(soon), offered, reason })
    }
    if (pending.kind === 'settings') await admin('save_plan_settings', { ...pending.settings, reason })
    if (pending.kind === 'delete') await admin('delete_plan', { code: pending.plan.code, reason })
    setAddOn(null); setSettingsText(null)
    reload()
  }
  /** The switch in a list. Off while a form is open, so saving that form can't undo it. */
  function offerSwitch(name: string, on: boolean, save: (offered: boolean, reason: string) => Promise<unknown>, where: Where = 'offer') {
    const says = SWITCH[where]
    return <label className="switch"><input type="checkbox" role="switch" aria-label={`${name} ${says.label}`} checked={on} disabled={Boolean(addOn || settingsText !== null)}
      onChange={() => setPending({ kind: 'offer', where, name, on: !on, save: (reason) => save(!on, reason) })} /><span>{on ? says.on : says.off}</span></label>
  }
  const savePlan = (plan: AdminPlan, change: Partial<PlanDraft>) => (reason: string) => admin('save_plan', { ...planCardPayload({ ...planDraft(plan), ...change }), reason })

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Plans</h1><p className="muted">Green: features grow (one business, one store). Yellow: size grows. Blue: sold by a person. Every name, number and price is typed here. A change applies to new purchases and renewals; what a customer already paid never changes.</p></div>
        <button type="button" className="button primary" onClick={() => navigate({ page: 'plans', id: 'new' })}>+ New plan</button>
      </header>

      <div className="plan-cards">
        {ladder(data.plans).map((plan) => {
          const group = planGroup(plan)
          const topFeatures = ladder(data.plans).filter((row) => planGroup(row) === 'features').at(-1)
          return (
            <div key={plan.code} className={`plan-card plan-${group}`}>
              <button type="button" className="plan-card-open" onClick={() => navigate({ page: 'plans', id: plan.code })}>
                <strong>{plan.name}</strong>
                <span className="plan-price">{plan.yearly ? `${rupees(plan.yearly * 12)} / yr` : rupees(0)}</span>
                <span>{plural(plan.businesses, 'business', 'businesses')} · {plural(plan.stores, 'store', 'stores')}</span>
                <span>{planPeople(plan)}</span>
                <span>AI {count(plan.aiCredits)}</span>
                {group !== 'free' && <span className="sub">{group === 'size' && topFeatures ? `All of ${topFeatures.name}` : 'Buy online'}</span>}
              </button>
              <div className="plan-card-switch"><span>Gets the apps a business comes with:</span>{offerSwitch(plan.name, plan.typeAppsFree ?? true, (typeAppsFree, reason) => savePlan(plan, { typeAppsFree })(reason), 'typeApps')}</div>
            </div>
          )
        })}
        <div className="plan-card plan-person">
          <strong>Custom</strong>
          <span className="plan-price">Talk to us</span>
          <span>Named by you, one account</span>
          <span className="sub">{plural(data.plans.filter((plan) => plan.isCustom).length, 'custom package', 'custom packages')} (list below)</span>
        </div>
      </div>

      <Card title="Plans">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Plan</th><th>A month</th><th>A month, yearly</th><th>Businesses</th><th>Stores</th><th>Accounts</th><th>On offer</th><th>Landing page</th><th>Customers’ Plan page</th><th /></tr></thead>
            <tbody>
              {data.plans.map((plan) => (
                <tr key={plan.code}>
                  <td><strong>{plan.name}</strong> {plan.isCustom && <Badge tone="accent">Custom</Badge>}<span className="sub">{plan.code}{plan.tagline ? ` · ${plan.tagline}` : ''}</span></td>
                  <td>{rupees(plan.monthly)}</td>
                  <td>{rupees(plan.yearly)}</td>
                  <td>{count(plan.businesses)}</td>
                  <td>{count(plan.stores)}</td>
                  <td>{plan.uses.accounts}</td>
                  <td>{plan.isCustom ? <Badge>Not offered</Badge> : offerSwitch(plan.name, plan.offered, (offered, reason) => savePlan(plan, { offered })(reason))}</td>
                  <td>{plan.isCustom ? <Badge>Hidden</Badge> : offerSwitch(plan.name, plan.onPricing, (onPricing, reason) => savePlan(plan, { onPricing })(reason), 'landing')}</td>
                  <td>{plan.isCustom ? <Badge>Hidden</Badge> : plan.onPlanPage === undefined ? <span className="muted">After the app update</span>
                    : offerSwitch(plan.name, plan.onPlanPage, (onPlanPage, reason) => savePlan(plan, { onPlanPage })(reason), 'planPage')}</td>
                  <td>
                    <button type="button" className="button small" onClick={() => navigate({ page: 'plans', id: plan.code })}>Edit</button>
                    {!plan.seeded && plan.uses.accounts + plan.uses.payments === 0 && <button type="button" className="button small" onClick={() => setPending({ kind: 'delete', plan })}>Remove</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>


      <Card title="Add-ons" action={<button type="button" className="button small" onClick={() => navigate({ page: 'selling' })}>Open Selling</button>}>
        <p className="muted">Add-ons, extras, their prices per plan and what each plan includes are set in Selling (V105).</p>
      </Card>

      <RenewalCard settings={data.settings} locked={settingsText !== null} onSave={(settings) => setPending({ kind: 'settings', settings })} />

      <Card title="Other prices" action={settingsText === null ? <button type="button" className="button small" onClick={() => { setFormError(''); setSettingsText(JSON.stringify(data.settings, null, 2)) }}>Edit</button> : undefined}>
        {settingsText === null ? (
          <ul className="list">
            <li>One more store: {rupees(data.settings.extraStorePrice)} a month</li>
            <li>One more business: {rupees(data.settings.extraBusinessPrice)} a month</li>
            <li>People a month: biller {rupees(data.settings.seatPrices.biller)}, manager {rupees(data.settings.seatPrices.manager)}, staff {rupees(data.settings.seatPrices.staff)}</li>
            <li>Message packs: {data.settings.messagePacks.map((pack) => `${pack.messages} for ${rupees(pack.price)}`).join(', ')}</li>
            <li>AI top-ups: {data.settings.aiTopups.map((pack) => `${pack.credits} for ${rupees(pack.price)}`).join(', ')}</li>
            <li>Custom package: base {rupees(data.settings.customPackage.base)} a month, yearly at {data.settings.customPackage.yearlyPercent}%, starts from {data.settings.customPackage.basePlan}; no feature yet: {data.settings.customPackage.notYet.map((row) => `${row.name} ${rupees(row.price)}`).join(', ')}</li>
          </ul>
        ) : (
          <>
            <label className="field"><span>Change the numbers and names, keep the layout</span><textarea rows={22} spellCheck={false} value={settingsText} onChange={(event) => setSettingsText(event.target.value)} /></label>
            {formError && <ErrorBox message={formError} />}
            <div className="dialog-actions">
              <button type="button" className="button" onClick={() => setSettingsText(null)}>Cancel</button>
              <button type="button" className="button primary" onClick={reviewSettings}>Save…</button>
            </div>
          </>
        )}
      </Card>

      <AiPrices />
      <AiModes plans={data.plans.filter((plan) => !plan.isCustom).map((plan) => ({ code: plan.code, name: plan.name }))} />

      {pending && (
        <ConfirmDialog title={pending.kind === 'delete' ? 'Remove this package?' : pending.kind === 'offer' ? (pending.on ? SWITCH[pending.where].turnOn : SWITCH[pending.where].turnOff) : 'Save this change?'} action={pending.kind === 'delete' ? 'Remove' : pending.kind === 'offer' ? (pending.on ? 'Turn on' : 'Turn off') : 'Save'} danger={pending.kind === 'delete'}
          onDone={apply} onClose={() => setPending(null)}>
          {pending.kind === 'delete' ? <p>{pending.plan.name} will be removed. Nobody has used it.</p>
            : pending.kind === 'offer' ? <p>{pending.on ? SWITCH[pending.where].saysOn(pending.name) : SWITCH[pending.where].saysOff(pending.name)}</p>
            : <p>{pending.kind === 'settings' ? 'The other prices' : pending.name} will change for new purchases and renewals. What customers already paid stays as it is.</p>}
        </ConfirmDialog>
      )}
    </div>
  )
}

/** One customer's terms: the package on the account, and counts or features just for them (existing grants). */
export function CustomerTerms({ profileId, businessId, onChanged }: { profileId: string; businessId?: string; onChanged: () => void }) {
  type Grant = { id: string; key: string; source: string; scope: string; limit?: number; until?: string; reason?: string }
  const catalogue = useLoad(() => admin<Catalogue>('plans'), 'plans')
  const grants = useLoad(() => (businessId ? admin<{ grants: Grant[] }>('entitlements', { organizationId: businessId }) : Promise.resolve({ grants: [] as Grant[] })), businessId ?? 'none')
  const [plan, setPlan] = useState('')
  const [paidUntil, setPaidUntil] = useState('')
  const [key, setKey] = useState('')
  const [limit, setLimit] = useState('')
  const [until, setUntil] = useState('')
  const [pending, setPending] = useState<{ title: string; run: (reason: string) => Promise<unknown> } | null>(null)
  if (catalogue.error) return <Card title="This customer’s terms"><ErrorBox message={catalogue.error} onRetry={catalogue.reload} /></Card>
  if (!catalogue.data) return <Loading />
  const keys = sortByText([...catalogue.data.limits, ...catalogue.data.features], (row) => row.name)
  const done = () => { grants.reload(); onChanged() }
  return (
    <Card title="This customer’s terms">
      <div className="plan-form">
        <label className="field"><span>Package on this account</span>
          <select value={plan} onChange={(event) => setPlan(event.target.value)}>
            <option value="">Choose…</option>
            {catalogue.data.plans.map((row) => <option key={row.code} value={row.code}>{row.name}{row.isCustom ? ' (custom)' : ''}, {rupees(row.monthly)}</option>)}
          </select>
        </label>
        <label className="field"><span>Paid until (blank: no end)</span><input type="date" value={paidUntil} onChange={(event) => setPaidUntil(event.target.value)} /></label>
      </div>
      <div className="dialog-actions"><button type="button" className="button" disabled={!plan}
        onClick={() => setPending({ title: 'Set this package?', run: async (reason) => { await admin('set_plan', { profileId, plan, ...(paidUntil ? { paidUntil } : {}), reason }); done() } })}>Set package…</button></div>
      <h3>Just for this customer</h3>
      <div className="plan-form">
        <label className="field"><span>Count or feature</span>
          <select value={key} onChange={(event) => setKey(event.target.value)}>
            <option value="">Choose…</option>
            {keys.map((row) => <option key={row.key} value={row.key}>{row.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Number (for a count)</span><input inputMode="numeric" value={limit} onChange={(event) => setLimit(event.target.value)} /></label>
        <label className="field"><span>Until (blank: no end)</span><input type="date" value={until} onChange={(event) => setUntil(event.target.value)} /></label>
      </div>
      <div className="dialog-actions"><button type="button" className="button" disabled={!key || (limit !== '' && !/^\d+$/.test(limit))}
        onClick={() => setPending({ title: 'Add this term?', run: async (reason) => { await admin('set_entitlement', { scope: 'account', id: profileId, key, source: 'custom_plan', ...(limit !== '' ? { limit: Number(limit) } : {}), ...(until ? { until } : {}), reason }); done() } })}>Add term…</button></div>
      {grants.data && grants.data.grants.length > 0 && (
        <ul className="list">
          {grants.data.grants.map((grant) => (
            <li key={grant.id}>{grant.key} · {grant.source}{grant.limit !== undefined ? ` · ${grant.limit}` : ''}{grant.until ? ` · until ${grant.until}` : ''}
              <span className="sub">{grant.scope}{grant.reason ? ` · ${grant.reason}` : ''}</span>{' '}
              <button type="button" className="button small" onClick={() => setPending({ title: 'End this term?', run: async (reason) => { await admin('end_entitlement', { grantId: grant.id, reason }); done() } })}>End</button></li>
          ))}
        </ul>
      )}
      {pending && <ConfirmDialog title={pending.title} action="Confirm" onDone={async (reason) => { await pending.run(reason) }} onClose={() => setPending(null)}><p>This changes what this customer has. It goes in the audit log.</p></ConfirmDialog>}
    </Card>
  )
}

/** One customer's custom packages: Show puts one on their Plan page, where they can buy it; hidden ones can't be bought. */
export function CustomerPlans({ profileId }: { profileId: string }) {
  type Row = { code: string; name: string; monthly: number; yearly: number; shown: boolean; own: boolean }
  const { data, error, reload } = useLoad(() => admin<{ plans: Row[] }>('customer_plans', { profileId }), profileId)
  const [pending, setPending] = useState<Row | null>(null)
  if (error) return <Card title="Custom packages for this customer"><ErrorBox message={error} onRetry={reload} /></Card>
  if (!data) return <Loading />
  return (
    <Card title="Custom packages for this customer">
      <p className="muted">Built-in plans follow their switches on Plans &amp; prices. A custom package shows only to the customers you turn it on for; they can then buy it on their Plan page.</p>
      {data.plans.length === 0 ? <p className="muted">No custom package yet. Make one on Plans &amp; prices.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Package</th><th>A month</th><th>A month, yearly</th><th>On their Plan page</th></tr></thead>
            <tbody>
              {data.plans.map((row) => (
                <tr key={row.code}>
                  <td><strong>{row.name}</strong> {row.own && <Badge tone="accent">Their package</Badge>}<span className="sub">{row.code}</span></td>
                  <td>{rupees(row.monthly)}</td>
                  <td>{rupees(row.yearly)}</td>
                  <td><label className="switch"><input type="checkbox" role="switch" aria-label={`${row.name} on this customer’s Plan page`} checked={row.shown}
                    onChange={() => setPending(row)} /><span>{row.shown ? 'Shown' : 'Hidden'}</span></label></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pending && (
        <ConfirmDialog title={pending.shown ? 'Hide this package from the customer?' : 'Show this package to the customer?'} action={pending.shown ? 'Hide' : 'Show'}
          onDone={async (reason) => { await admin('set_customer_plan', { profileId, code: pending.code, show: !pending.shown, reason }); reload() }} onClose={() => setPending(null)}>
          <p>{pending.shown ? `${pending.name} leaves this customer’s Plan page and can’t be bought by them.` : `${pending.name} appears on this customer’s Plan page, and they can buy it there.`} It goes in the audit log.</p>
        </ConfirmDialog>
      )}
    </Card>
  )
}

/** ctl-1 / ctl-2 (V19): the grace days after Paid till (then Free) and the reminder days a new paid account starts with. */
function RenewalCard({ settings, locked, onSave }: { settings: Settings; locked: boolean; onSave: (settings: Settings) => void }) {
  const [grace, setGrace] = useState(String(settings.graceDays ?? ''))
  const [remind, setRemind] = useState((settings.remindDays ?? []).join(', '))
  const days = remind.split(',').map((part) => part.trim()).filter(Boolean)
  const graceOk = /^\d{1,2}$/.test(grace.trim()) && Number(grace) <= 60
  const remindOk = days.length <= 5 && days.every((d) => /^\d{1,2}$/.test(d) && Number(d) >= 1 && Number(d) <= 60) && new Set(days).size === days.length
  const changed = grace !== String(settings.graceDays ?? '') || remind !== (settings.remindDays ?? []).join(', ')
  return (
    <Card title="Renewal">
      <div className="plan-form">
        <label className="field"><span>Grace days after Paid till</span><input inputMode="numeric" value={grace} onChange={(event) => setGrace(event.target.value)} />
          <span className="sub">An unpaid plan keeps working this many days, then the account is on Free. Nothing is deleted. 0 to 60.</span></label>
        <label className="field"><span>Reminder days before renewal (new accounts start with)</span><input value={remind} placeholder="e.g. 7, 3, 1" onChange={(event) => setRemind(event.target.value)} />
          <span className="sub">Up to 5 different days, 1 to 60. Each owner can change their own on their Plan page; accounts that already have days keep them.</span></label>
      </div>
      {(!graceOk || !remindOk) && <p className="muted small">{!graceOk ? 'Grace days: a whole number from 0 to 60. ' : ''}{!remindOk ? 'Reminder days: up to 5 different numbers from 1 to 60, with commas.' : ''}</p>}
      <div className="dialog-actions"><button type="button" className="button primary" disabled={locked || !changed || !graceOk || !remindOk}
        onClick={() => onSave({ ...settings, graceDays: Number(grace), remindDays: days.map(Number) })}>Save…</button></div>
    </Card>
  )
}
