import { ArrowLeft, Mail, MessageCircle, Phone, Trash2 } from 'lucide-react'
import { sortByText } from '../lib/sort'
import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { NoteForm, Notes } from '../components/Notes'
import { Badge, Card, ErrorBox, Facts, Loading } from '../components/ui'
import { formatAgo, formatDate, formatDateTime, formatNumber, formatRupees, LEAD_LABELS, phoneDigits, STATE_LABELS } from '../lib/format'
import { navigate } from '../lib/route'
import { stateTone, useLoad } from '../lib/useLoad'
import { admin, eraseLogin, pokeAlerts } from '../lib/supabase'
import { Features } from './Features'
import { ImportData } from './ImportData'
import { CustomerAiCredits } from './AiCredits'
import { CustomerPackages } from './CustomerPackages'
import { CustomerDeals } from './CustomerDeals'
import { CustomerPlans, CustomerTerms } from './Plans'
import { SupportHistory, SupportRequests } from './Support'
import type { Business, Customer360 as Data, Store } from '../lib/types'
import { bytesWord, partWord } from '../lib/costs'

const TABS = ['Overview', 'Businesses & stores', 'Features', 'Import data', 'Plans', 'Deals', 'AI credits', 'Payments', 'Support', 'Notes & history'] as const
type Tab = (typeof TABS)[number]

/** Call and WhatsApp buttons for a phone number. */
export function ContactLinks({ phone, email }: { phone?: string | null; email?: string | null }) {
  const digits = phoneDigits(phone)
  return (
    <span className="contact">
      {digits && <a className="button small" href={`tel:+${digits}`}><Phone size={14} aria-hidden="true" /> Call</a>}
      {digits && <a className="button small" href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer noopener"><MessageCircle size={14} aria-hidden="true" /> WhatsApp</a>}
      {email && <a className="button small" href={`mailto:${email}`}><Mail size={14} aria-hidden="true" /> Email</a>}
    </span>
  )
}

export function Customer360({ id, canSupport = false, canDelete = false, canGiveCredits = false }: { id: string; canSupport?: boolean; canDelete?: boolean; canGiveCredits?: boolean }) {
  const [tab, setTab] = useState<Tab>('Overview')
  const { data, error, reload } = useLoad(() => admin<Data>('customer', { profileId: id }), id)
  if (error) return <div className="page"><BackLink /><ErrorBox message={error} onRetry={reload} /></div>
  if (!data) return <Loading />
  const { profile, account } = data
  const live = data.businesses.filter((b) => !b.deletedAt)
  const stores = live.flatMap((b) => b.stores.filter((s) => s.active))
  return (
    <div className="page">
      <BackLink />
      <header className="page-head">
        <div>
          <h1>{profile.name} {profile.deleted && <Badge tone="critical">Deleted account</Badge>}</h1>
          <p className="muted">{profile.email ?? 'No email'}{profile.phone ? ` · ${profile.phone}` : ''}</p>
          <ContactLinks phone={profile.phone} email={profile.email} />
        </div>
        <div className="head-side">
          <span className="plan-name">{account.planName ?? 'No plan'}</span>
          <Badge tone={stateTone(account.state)}>{STATE_LABELS[account.state] ?? account.state}</Badge>
          {account.monthly ? <span className="muted small">{formatRupees(account.monthly)}/month, {account.billing}</span> : null}
        </div>
      </header>
      <p className="notice small">Changes to plan terms and features need a reason and go in the audit log. Credit and refunds come in the next phase.</p>

      <CustomerPackages data={data} onChanged={reload} />

      <div className="tabs" role="tablist">
        {TABS.filter((name) => (name !== 'Support' && name !== 'Import data') || canSupport).map((name) => <button type="button" role="tab" key={name} aria-selected={tab === name} className={`tab ${tab === name ? 'is-on' : ''}`} onClick={() => setTab(name)}>{name}</button>)}
      </div>

      {tab === 'Overview' && (
        <div className="grid-2">
          <Card title="Account">
            <Facts items={[
              ['Plan today', account.planName ?? '—'],
              ['Chosen plan', account.chosenPlan && account.chosenPlan !== account.plan ? `${account.chosenPlan} (not in force)` : account.planName ?? '—'],
              ['Paid till', formatDate(account.paidUntil)],
              ['Credit', formatRupees(profile.credit)],
              ['Paid in all', formatRupees(data.paidTotal)],
              ['Businesses', `${live.length}${data.businesses.length > live.length ? ` (+${data.businesses.length - live.length} deleted)` : ''}`],
              ['Open stores', formatNumber(stores.length)],
              ['Database space', spaceTotal(stores)],
            ]} />
          </Card>
          <Card title="Activity">
            <Facts items={[
              ['Joined', formatDateTime(profile.createdAt)],
              ['Set up', formatDateTime(profile.onboardedAt)],
              ['Last sign-in', formatAgo(profile.lastSignIn)],
              ['Last PIN session', formatAgo(profile.lastPinSession)],
              ['Last bill', formatAgo(profile.lastBill)],
              ['Bills, 30 days', formatNumber(live.reduce((n, b) => n + b.usage.bills30, 0))],
              ['Sales, 30 days', formatRupees(live.reduce((n, b) => n + b.usage.sales30, 0))],
            ]} />
          </Card>
          <Card title="Security">
            <Facts items={[
              ['Password', profile.hasPassword ? 'Set' : 'Google only'],
              ['Owner PIN', profile.hasPin ? 'Set' : 'Not set'],
              ['Wrong PINs in a row', formatNumber(profile.pinFailures)],
              ['PIN locked', profile.pinLocked ? 'Yes' : 'No'],
            ]} />
          </Card>
          <Card title="Requests to us">
            {data.leads.length ? (
              <ul className="list">
                {data.leads.map((lead) => (
                  <li key={lead.id}><a href={`#/leads/${lead.id}`}>{lead.kind === 'refund' ? 'Refund request' : 'Talk to us'}</a> · {LEAD_LABELS[lead.status]} · {formatDate(lead.createdAt)}<span className="sub">{lead.message}</span></li>
                ))}
              </ul>
            ) : <p className="muted">None.</p>}
          </Card>
        </div>
      )}

      {tab === 'Businesses & stores' && (data.businesses.length ? sortByText(data.businesses, (b) => b.name).map((business) => <BusinessCard key={business.id} business={business} />) : <p className="muted">No business yet.</p>)}

      {tab === 'Features' && <Features businesses={live} />}
      {tab === 'Import data' && canSupport && <ImportData businesses={live} />}
      {tab === 'Plans' && <><CustomerTerms profileId={profile.id} businessId={live[0]?.id} onChanged={reload} /><CustomerPlans profileId={profile.id} /></>}
      {tab === 'Deals' && <CustomerDeals profileId={profile.id} name={profile.name} businesses={live} />}
      {tab === 'AI credits' && <CustomerAiCredits profileId={profile.id} canGive={canGiveCredits} />}
      {tab === 'Support' && canSupport && <><SupportRequests profileId={profile.id} /><SupportHistory profileId={profile.id} /></>}

      {tab === 'Payments' && (
        <Card title={`Payments (${data.payments.length})`}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>What</th><th>Amount</th><th>GST</th><th>Credit used</th><th>Status</th><th>Razorpay</th></tr></thead>
              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatDateTime(payment.paidAt ?? payment.createdAt)}</td>
                    <td>{payment.title}</td>
                    <td>{formatRupees(payment.amount)}</td>
                    <td>{formatRupees(payment.gst)}</td>
                    <td>{payment.creditUsed ? formatRupees(payment.creditUsed) : '—'}</td>
                    <td><Badge tone={payment.status === 'paid' ? 'good' : 'neutral'}>{payment.status === 'paid' ? 'Paid' : 'Started, not paid'}</Badge></td>
                    <td className="mono small">{payment.paymentId ?? payment.orderId ?? '—'}</td>
                  </tr>
                ))}
                {!data.payments.length && <tr><td colSpan={7} className="muted">No payments.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'Notes & history' && (
        <div className="grid-2">
          <Card title="Notes">
            <NoteForm targetType="profile" targetId={profile.id} onSaved={reload} />
            <Notes notes={data.notes} />
          </Card>
          <Card title="Plan history">
            {data.planHistory.length ? (
              <ul className="list">
                {data.planHistory.map((h) => <li key={h.at}>{h.planName}{h.paid ? ` · ${formatRupees(h.monthly)}/month` : ''}<span className="sub">{formatDateTime(h.at)}</span></li>)}
              </ul>
            ) : <p className="muted">Recorded from today.</p>}
          </Card>
          <Card title="Admin activity on this account" className="span-2">
            <ul className="list">
              {data.adminHistory.map((entry) => <li key={entry.id}>{entry.action.replace(/_/g, ' ')} by {entry.adminEmail}<span className="sub">{formatDateTime(entry.at)}{entry.ip ? ` · ${entry.ip}` : ''}</span></li>)}
            </ul>
          </Card>
          {canDelete && <DeleteCustomer profileId={profile.id} email={profile.email} businesses={live.length} />}
        </div>
      )}
    </div>
  )
}

/** Owner only: erases the customer and every business they own, for good. */
function DeleteCustomer({ profileId, email, businesses }: { profileId: string; email: string | null; businesses: number }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  return (
    <Card title="Delete this customer" className="span-2">
      <p className="muted">Erases the account, its {businesses === 1 ? 'business' : `${businesses} businesses`} and everything in them: bills, stock, accounts, staff access and the sign-in. It can't be undone. Only the audit log keeps a line.</p>
      <button type="button" className="button danger" onClick={() => { setTyped(''); setOpen(true) }}><Trash2 size={16} aria-hidden="true" /> Delete customer</button>
      {open && (
        <ConfirmDialog title="Delete this customer for good?" action="Delete for good" danger onClose={() => setOpen(false)}
          onDone={async (reason) => {
            const done = await admin<{ authUid: string }>('delete_customer', { profileId, confirmEmail: typed.trim(), reason })
            pokeAlerts()
            await eraseLogin(done.authUid)
            navigate({ page: 'customers' })
          }}>
          <p>Everything this customer has in BOAI is erased and can't be brought back.</p>
          <label className="field">
            <span>Type their email to confirm: <b>{email}</b></span>
            <input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
          </label>
        </ConfirmDialog>
      )}
    </Card>
  )
}

function BackLink() {
  return <button type="button" className="text-button back" onClick={() => (window.history.length > 1 ? window.history.back() : navigate({ page: 'customers' }))}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
}

function BusinessCard({ business }: { business: Business }) {
  const { usage } = business
  return (
    <Card title={<>{business.name} {business.deletedAt && <Badge tone="critical">Deleted {formatDate(business.deletedAt)}</Badge>}</>}>
      <Facts items={[
        ['Type', business.industry ?? '—'],
        ['Extra apps', business.extraApps?.length ? business.extraApps.join(', ') : '—'],
        ['Phone', business.phone ?? '—'],
        ['GSTIN', business.gstin ?? '—'],
        ['State', business.state ?? '—'],
        ['Started', formatDate(business.createdAt)],
        ['Bills', `${formatNumber(usage.bills)} (${formatNumber(usage.bills30)} in 30 days)`],
        ['Sales, 30 days', formatRupees(usage.sales30)],
        ['Items / customers', `${formatNumber(usage.items)} / ${formatNumber(usage.customers)}`],
        ['Last bill', formatAgo(usage.lastBill)],
        ['Staff on pay register', formatNumber(business.staff)],
      ]} />
      <h3>Stores</h3>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Store</th><th>Bills, 30 days</th><th>Database space</th></tr></thead>
          <tbody>
            {sortByText(business.stores, (s) => s.name).map((store) => (
              <tr key={store.id}>
                <td><strong>{store.name}</strong> <span className="muted">({store.code})</span>{!store.active && <> <Badge>Closed</Badge></>}<span className="sub">{store.address ?? ''}</span></td>
                <td>{formatNumber(store.bills30)}</td>
                <td><StoreSpaceCell store={store} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>People who sign in</h3>
      {business.people.length ? (
        <ul className="list">
          {sortByText(business.people, (p) => p.name).map((person) => (
            <li key={`${person.name}-${person.createdAt}`}>{person.name} · {person.role}{!person.active && ' · removed'}{person.locked && <> <Badge tone="warning">PIN locked</Badge></>}
              <span className="sub">{person.stores} store{person.stores === 1 ? '' : 's'} · added {formatDate(person.createdAt)}</span></li>
          ))}
        </ul>
      ) : <p className="muted">Only the owner.</p>}
    </Card>
  )
}

/** V139: all open stores' database space at the last nightly count ("Not counted yet" before the first night). */
function spaceTotal(stores: Store[]) {
  const counted = stores.filter((s) => s.space)
  if (!counted.length) return 'Not counted yet'
  const photos = counted.reduce((n, s) => n + Number(s.space!.files), 0)
  return `${bytesWord(counted.reduce((n, s) => n + Number(s.space!.bytes), 0))}${photos > 0 ? ` + ${bytesWord(photos)} photos` : ''}`
}

/** One store's database space and its 3 biggest parts, counted each night (estimate: rows × average row size). */
function StoreSpaceCell({ store }: { store: Store }) {
  const space = store.space
  if (!space) return <span className="muted">Not counted yet</span>
  return (
    <>{bytesWord(space.bytes)}{Number(space.files) > 0 && <> + {bytesWord(space.files)} photos</>}
      <span className="sub">{space.parts.slice(0, 3).map((p) => `${partWord(p.table)} ${bytesWord(p.bytes)}`).join(' · ')} · counted {formatDateTime(space.measuredAt)}</span></>
  )
}
