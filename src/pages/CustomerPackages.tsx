import { Fragment, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Card, ErrorBox, Loading, Stat } from '../components/ui'
import { formatDate, formatNumber, formatRupees } from '../lib/format'
import { giftOf, GIVE_MORE, giveMoreLimit, howTheyHaveIt, ofLimit, spaceWords, storeCell, type Grant, type StoreFeature } from '../lib/customerPage'
import { sortByText } from '../lib/sort'
import { admin } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'
import type { Catalogue } from './Plans'
import type { Business, Customer360 as Data } from '../lib/types'

// Admin › One customer (187c, board AdminCustomer): plan, what they pay, stores · people · space, last used, and every
// package with how they have it (Plan / Bought / Gift till) and On / Off per store. + Give a package, Change plan,
// Give more and End gift go through the existing admin.* calls, each with a reason (audit log).

type Resolved = { on?: boolean; limit?: number; unlimited?: boolean; source?: string }
type Ents = { plan: string; keys: Record<string, Resolved>; grants: Grant[] }
type Layer = 'business' | 'store'
type Dialog = 'plan' | 'more' | 'give' | { endGift: Grant; name: string } | null

const SECTIONS: { key: Layer | 'inApp'; title: string }[] = [
  { key: 'business', title: '1 · Business add-ons' }, { key: 'store', title: '2 · Store apps' }, { key: 'inApp', title: '3 · In-app purchases' },
]

export function CustomerPackages({ data, onChanged }: { data: Data; onChanged: () => void }) {
  const live = data.businesses.filter((b) => !b.deletedAt)
  const [picked, setPicked] = useState(live[0]?.id ?? '')
  const business = live.find((b) => b.id === picked) ?? live[0]
  if (!business) return <p className="muted">No business yet.</p>
  return (
    <>
      {live.length > 1 && (
        <div className="chips" role="tablist" aria-label="Businesses">
          {sortByText(live, (b) => b.name).map((b) => <button type="button" role="tab" key={b.id} aria-selected={b.id === business.id} className={`chip ${b.id === business.id ? 'is-on' : ''}`} onClick={() => setPicked(b.id)}>{b.name}</button>)}
        </div>
      )}
      <OneBusiness key={business.id} data={data} business={business} onChanged={onChanged} />
    </>
  )
}

function OneBusiness({ data, business, onChanged }: { data: Data; business: Business; onChanged: () => void }) {
  const stores = sortByText(business.stores.filter((s) => s.active), (s) => s.name)
  const storeKey = stores.map((s) => s.id).join(',')
  const ents = useLoad(() => admin<Ents>('entitlements', { organizationId: business.id }), business.id)
  const features = useLoad(() => Promise.all(stores.map((s) => admin<{ features: StoreFeature[] }>('store_features', { storeId: s.id }).then((r) => r.features))), storeKey || 'none')
  // Layers come from Packages (finance); another admin role still sees every package, in one list.
  const layers = useLoad(() => admin<{ layers: Record<string, Layer> }>('packages').then((r) => r.layers).catch(() => null), 'packages')
  const [dialog, setDialog] = useState<Dialog>(null)
  const reload = () => { ents.reload(); features.reload(); onChanged() }

  const { account, profile } = data
  const error = ents.error || features.error
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!ents.data || !features.data || layers.data === undefined) return <Loading />

  const keys = ents.data.keys
  const grants = ents.data.grants
  const perStore = features.data
  const names = new Map(perStore.flat().map((f) => [f.key, f]))
  const layerOf = layers.data
  const packageKeys = layerOf ? Object.keys(layerOf).filter((key) => names.has(key)) : [...names.keys()]
  const rows = (layer: Layer | 'inApp') => sortByText(packageKeys.filter((key) => (layerOf ? layerOf[key] === layer : layer === 'business')).map((key) => names.get(key)!), (f) => f.name)

  // Pays a year: (plan a month + every bought add-on a month) × 12; extra people = bought manager / biller seats.
  const bought = packageKeys.filter((key) => perStore.some((list) => list.find((f) => f.key === key && f.on && f.source === 'addon_bought')))
  const boughtMonthly = perStore.flat().filter((f) => f.on && f.source === 'addon_bought').reduce((n, f) => n + (f.monthlyPaise ?? 0) / 100, 0)
  const extraPeople = grants.filter((g) => g.source === 'addon_bought' && (g.key === 'managers' || g.key === 'billers')).length
  const people = business.people.filter((p) => p.active).length
  const peopleLimit = keys.managers?.unlimited || keys.billers?.unlimited ? null : (keys.managers?.limit ?? 0) + (keys.billers?.limit ?? 0)
  const storesUsed = data.businesses.filter((b) => !b.deletedAt).reduce((n, b) => n + b.stores.filter((s) => s.active).length, 0)

  return (
    <>
      <header className="page-head">
        <div>
          <h2 className="one-customer-name">{business.name}</h2>
          <p className="muted">{[profile.name, profile.phone, business.industry, `since ${formatDate(business.createdAt)}`].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="contact">
          <button type="button" className="button" onClick={() => setDialog('plan')}>Change plan</button>
          <button type="button" className="button" onClick={() => setDialog('more')}>Give more (stores, people, space, sales a day)</button>
          <button type="button" className="button primary" onClick={() => setDialog('give')}>+ Give a package</button>
        </div>
      </header>

      <div className="stats">
        <Stat label="Plan" value={account.planName ?? 'No plan'} hint={account.paidUntil ? `paid till ${formatDate(account.paidUntil)}` : 'no end date'} />
        <Stat label="Pays a year" value={formatRupees(((account.monthly ?? 0) + boughtMonthly) * 12)} hint={`plan + ${bought.length} add-on${bought.length === 1 ? '' : 's'} + ${extraPeople} extra ${extraPeople === 1 ? 'person' : 'people'}`} />
        <Stat label="Stores · people · space" value={`${ofLimit(storesUsed, keys.stores?.limit, keys.stores?.unlimited)} · ${ofLimit(people, peopleLimit)}`}
          hint={<>space {spaceWords(keys.spaceMb?.limit, keys.spaceMb?.unlimited)}, used <Badge>Coming soon</Badge></>} />
        <Stat label="Last used" value={formatDate(business.usage.lastBill)} hint={`${formatNumber(business.usage.bills30)} sales in 30 days`} />
      </div>

      <Card>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Package</th><th>How they have it</th>{stores.map((s) => <th key={s.id}>{s.name}</th>)}<th></th></tr></thead>
            <tbody>
              {SECTIONS.filter((section) => layerOf || section.key === 'business').map((section) => (<Fragment key={section.key}>
                <tr className="group-row"><th colSpan={stores.length + 3}>{layerOf ? section.title : 'Packages'}</th></tr>
                {section.key === 'inApp' && <tr><td colSpan={stores.length + 3} className="muted">Extras bought inside their own page. <Badge>Coming soon</Badge></td></tr>}
                {section.key !== 'inApp' && rows(section.key).map((f) => {
                  const cells = perStore.map((list) => list.find((x) => x.key === f.key))
                  const gift = giftOf(grants, f.key, stores.map((s) => s.id))
                  const how = howTheyHaveIt(cells, gift)
                  return (
                    <tr key={f.key}>
                      <td><strong>{f.name}</strong></td>
                      <td className={how.gift ? 'gift' : how.text === 'Not taken' ? 'muted' : undefined}>{how.text}</td>
                      {cells.map((cell, index) => { const c = storeCell(cell); return <td key={stores[index]!.id} className={c.tone === 'on' ? 'on-cell' : 'muted'}>{c.text}</td> })}
                      <td>{gift && <button type="button" className="button small" onClick={() => setDialog({ endGift: gift, name: f.name })}>End gift</button>}</td>
                    </tr>
                  )
                })}
              </Fragment>))}
            </tbody>
          </table>
        </div>
        <p className="muted small">Off (owner) = the shop owner switched it off in that store; we see it but don’t change it here. — = not taken for that store.</p>
      </Card>

      {dialog === 'plan' && <ChangePlan profileId={profile.id} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog === 'more' && <GiveMore profileId={profile.id} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog === 'give' && <GivePackage business={business} stores={stores} packages={packageKeys.map((key) => ({ ...names.get(key)!, layer: layerOf?.[key] ?? 'business' }))} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog && typeof dialog === 'object' && (
        <ConfirmDialog title={`End the ${dialog.name} gift?`} action="End gift" danger onClose={() => setDialog(null)}
          onDone={async (reason) => { await admin('end_entitlement', { grantId: dialog.endGift.id, reason }); reload() }}>
          <p>{dialog.name} goes back to what their plan and their own purchases give. Their data stays. It goes in the log.</p>
        </ConfirmDialog>
      )}
    </>
  )
}

/** Change plan (builder box 4): the plan on the account and paid till, with a reason (admin.set_plan, finance). */
function ChangePlan({ profileId, onClose, onDone }: { profileId: string; onClose: () => void; onDone: () => void }) {
  const catalogue = useLoad(() => admin<Catalogue>('plans'), 'plans')
  const [plan, setPlan] = useState('')
  const [paidUntil, setPaidUntil] = useState('')
  return (
    <ConfirmDialog title="Change plan" action="Change plan" onClose={onClose}
      onDone={async (reason) => {
        if (!plan) throw new Error('Pick a plan.')
        await admin('set_plan', { profileId, plan, ...(paidUntil ? { paidUntil } : {}), reason }); onDone()
      }}>
      {catalogue.error && <ErrorBox message={catalogue.error} />}
      {!catalogue.data && !catalogue.error && <Loading />}
      {catalogue.data && (
        <div className="plan-form">
          <label className="field"><span>Plan</span>
            <select value={plan} onChange={(event) => setPlan(event.target.value)}>
              <option value="">Choose…</option>
              {catalogue.data.plans.map((row) => <option key={row.code} value={row.code}>{row.name}{row.isCustom ? ' (custom)' : ''}, ₹{row.monthly.toLocaleString('en-IN')} a month</option>)}
            </select>
          </label>
          <label className="field"><span>Paid till (blank: no end)</span><input type="date" value={paidUntil} onChange={(event) => setPaidUntil(event.target.value)} /></label>
        </div>
      )}
    </ConfirmDialog>
  )
}

/** Give more (builder box 5) = today's "Just for this customer": a bigger number, till a date or for good (admin.set_entitlement). */
function GiveMore({ profileId, onClose, onDone }: { profileId: string; onClose: () => void; onDone: () => void }) {
  const [key, setKey] = useState<string>(GIVE_MORE[0].key)
  const [number, setNumber] = useState('')
  const [until, setUntil] = useState('')
  const line = GIVE_MORE.find((row) => row.key === key)!
  return (
    <ConfirmDialog title="Give more" action="Give" onClose={onClose}
      onDone={async (reason) => {
        const typed = Number(number)
        if (!number || !Number.isFinite(typed) || typed <= 0) throw new Error('Type a number above 0.')
        await admin('set_entitlement', { scope: 'account', id: profileId, key, source: 'custom_plan', limit: giveMoreLimit(key, typed), ...(until ? { until } : {}), reason }); onDone()
      }}>
      <div className="plan-form">
        <label className="field"><span>What</span>
          <select value={key} onChange={(event) => setKey(event.target.value)}>{GIVE_MORE.map((row) => <option key={row.key} value={row.key}>{row.name}</option>)}</select>
        </label>
        <label className="field"><span>Number</span><input inputMode="decimal" value={number} onChange={(event) => setNumber(event.target.value)} /><span className="sub">{line.hint}</span></label>
        <label className="field"><span>Till (blank: for good)</span><input type="date" value={until} onChange={(event) => setUntil(event.target.value)} /></label>
      </div>
    </ConfirmDialog>
  )
}

/** + Give a package (builder box 3): which package, which stores (store apps), free till a date or for good, a reason (gift grants). */
function GivePackage({ business, stores, packages, onClose, onDone }: {
  business: Business; stores: Business['stores']; packages: (StoreFeature & { layer: Layer })[]; onClose: () => void; onDone: () => void
}) {
  const sorted = sortByText(packages, (p) => p.name)
  const [key, setKey] = useState('')
  const [picked, setPicked] = useState<string[]>(stores.map((s) => s.id))
  const [until, setUntil] = useState('')
  const pkg = sorted.find((p) => p.key === key)
  const perStore = pkg?.layer === 'store'
  return (
    <ConfirmDialog title="Give a package" action="Give" onClose={onClose}
      onDone={async (reason) => {
        if (!pkg) throw new Error('Pick a package.')
        const extra = { key: pkg.key, source: 'gift', ...(until ? { until } : {}), reason }
        if (perStore) {
          if (!picked.length) throw new Error('Tick at least one store.')
          for (const id of picked) await admin('set_entitlement', { scope: 'store', id, ...extra })
        } else await admin('set_entitlement', { scope: 'business', id: business.id, ...extra })
        onDone()
      }}>
      <div className="plan-form">
        <label className="field"><span>Package</span>
          <select value={key} onChange={(event) => setKey(event.target.value)}>
            <option value="">Choose…</option>
            {sorted.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Free till (blank: for good)</span><input type="date" value={until} onChange={(event) => setUntil(event.target.value)} /></label>
      </div>
      {perStore && (
        <fieldset className="field"><legend>Which stores</legend>
          {stores.map((s) => (
            <label key={s.id} className="check"><input type="checkbox" checked={picked.includes(s.id)}
              onChange={(event) => setPicked(event.target.checked ? [...picked, s.id] : picked.filter((id) => id !== s.id))} /> {s.name}</label>
          ))}
        </fieldset>
      )}
      {pkg && !perStore && <p className="muted small">For the whole business: {business.name}.</p>}
      <p className="muted small">Kept in the log with your reason.</p>
    </ConfirmDialog>
  )
}
