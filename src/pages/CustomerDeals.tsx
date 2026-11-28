import { useState, type FormEvent } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Card, ErrorBox, Loading } from '../components/ui'
import { todayIn } from '../lib/costs'
import { allRows, KIND_CHOICE, KIND_WORD, PLACE_WORD, placeNeeded, plansFor, resultOf, running, statusOf, thingsFor, whatOf, whereOf, type Deal, type DealKind, type DealsData } from '../lib/deals'
import { formatDate, formatNumber } from '../lib/format'
import { sortByText } from '../lib/sort'
import { admin, AdminError } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'
import type { Business } from '../lib/types'

// Admin › Customer 360 › Deals (V111, Admin board H7tJ8eg1zwWM4UV8Pii6Ub): luring this one customer. A trial, a special
// price, a lock just for them, or a gift; each has a last day, a reason and an audit line. Their locks of the last 30 days
// below. Any admin reads; finance or owner starts and ends deals (SQL refuses the rest).

const KINDS: DealKind[] = ['trial', 'price', 'lock', 'gift']

export function CustomerDeals({ profileId, name, businesses }: { profileId: string; name: string; businesses: Business[] }) {
  const { data, error, reload } = useLoad(() => admin<DealsData>('customer_deals', { profileId }), profileId)
  const [adding, setAdding] = useState(false)
  const [ending, setEnding] = useState<Deal | null>(null)
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <Loading />
  const today = todayIn()
  const rows = allRows(data)
  return (
    <>
      <Card title="Deals" action={data.canEdit ? <button type="button" className="button primary" onClick={() => setAdding(true)}>+ New deal</button> : undefined}>
        <p className="muted small">Deals = luring this one customer. Every deal has an end date, a reason and is in the audit log.</p>
        {rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Deal</th><th>What</th><th>Where</th><th>Till</th><th>Status</th><th>Result</th>{data.canEdit && <th />}</tr></thead>
              <tbody>
                {rows.map((d) => {
                  const status = statusOf(d, today)
                  return (
                    <tr key={`${d.kind}-${d.id}`}>
                      <td>{KIND_WORD[d.kind]}</td>
                      <td>{whatOf(d)}{d.reason && <span className="sub">{d.reason}</span>}</td>
                      <td>{whereOf(d, businesses)}</td>
                      <td>{d.ends ? formatDate(d.ends) : '—'}{d.kind === 'gift' && <span className="sub">hidden from them</span>}</td>
                      <td><Badge tone={status.tone}>{status.word}</Badge></td>
                      <td>{resultOf(d, today)}</td>
                      {data.canEdit && <td>{running(d, today) && <button type="button" className="button small" onClick={() => setEnding(d)}>End</button>}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">No deals for this customer yet.</p>}
      </Card>

      <Card title="Their locks, last 30 days">
        {data.locks.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Lock</th><th>Where</th><th>Seen</th><th>Tapped</th><th>Not now</th><th>Bought</th></tr></thead>
              <tbody>
                {data.locks.map((l) => (
                  <tr key={`${l.key}-${l.place}`}>
                    <td>{l.name}</td><td>{PLACE_WORD[l.place] ?? l.place}</td>
                    <td>{formatNumber(l.seen)}</td><td>{formatNumber(l.tapped)}</td><td>{formatNumber(l.notNow)}</td><td>{l.bought ? formatNumber(l.bought) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">They saw no lock in the last 30 days.</p>}
      </Card>

      {adding && <NewDeal profileId={profileId} name={name} businesses={businesses} data={data} today={today} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload() }} />}
      {ending && (
        <ConfirmDialog title={`End this ${KIND_WORD[ending.kind].toLowerCase()}?`} action="End today" onClose={() => setEnding(null)}
          onDone={async (reason) => { await admin('end_deal', ending.kind === 'gift' ? { grantId: ending.id, reason } : { dealId: ending.id, reason }); reload() }}>
          <p>{whatOf(ending)} ends today. {ending.kind === 'trial' || ending.kind === 'gift' ? 'It switches off for them unless they bought it.' : ending.kind === 'price' ? 'They pay the usual price from now.' : 'The lock goes back to how the Selling grid shows it.'}</p>
        </ConfirmDialog>
      )}
    </>
  )
}

/** + New deal: kind, what, where, from, till, special price / places / reminder, reason. */
function NewDeal({ profileId, name, businesses, data, today, onClose, onDone }: {
  profileId: string; name: string; businesses: Business[]; data: DealsData; today: string; onClose: () => void; onDone: () => void
}) {
  const [kind, setKind] = useState<DealKind>('trial')
  const [what, setWhat] = useState('')
  const [where, setWhere] = useState('')
  const [starts, setStarts] = useState(today)
  const [ends, setEnds] = useState('')
  const [price, setPrice] = useState('')
  const [places, setPlaces] = useState<string[]>(['menu'])
  const [remind, setRemind] = useState(String(data.remindDays))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const things = thingsFor(kind, data.things)
  const plans = plansFor(kind, data.plans)
  const thing = things.find((t) => `key:${t.key}` === what)
  const isPlan = what.startsWith('plan:')
  const need = isPlan ? 'any' : placeNeeded(kind, thing)
  const live = businesses.filter((b) => !b.deletedAt)
  const stores = live.flatMap((b) => sortByText(b.stores.filter((s) => s.active), (s) => s.name).map((s) => ({ ...s, business: b })))
  const showWhere = !isPlan && kind !== 'price'
  const showFrom = kind !== 'gift' && !(kind === 'trial' && isPlan)

  function pickKind(next: DealKind) { setKind(next); setWhat(''); setWhere('') }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!what) { setError('Choose what the deal is for.'); return }
    if (!ends) { setError('Choose the last day.'); return }
    if (reason.trim().length < 3) { setError('Write why (at least a few words).'); return }
    const p: Record<string, unknown> = { profileId, kind, ends, reason: reason.trim() }
    if (isPlan) p.plan = what.slice(5)
    else p.key = what.slice(4)
    if (showWhere && where.startsWith('store:')) p.storeId = where.slice(6)
    if (showWhere && where.startsWith('business:')) p.organizationId = where.slice(9)
    if (showFrom) p.starts = starts
    if (kind === 'price') p.priceRupees = Number(price)
    if (kind === 'lock') p.places = places
    if (kind === 'trial') p.remindDays = Number(remind)
    setBusy(true); setError('')
    try { await admin('save_deal', p); onDone() } catch (e) { setError(e instanceof AdminError || e instanceof Error ? e.message : 'Something went wrong.') } finally { setBusy(false) }
  }

  return (
    <div className="drawer-back" onClick={busy ? undefined : onClose}>
      <form className="drawer" role="dialog" aria-label="New deal" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="drawer-head"><h2>New deal · {name}</h2><button type="button" className="button" onClick={onClose} disabled={busy}>Close</button></div>
        <label className="field"><span>Kind</span>
          <select value={kind} onChange={(event) => pickKind(event.target.value as DealKind)}>{KINDS.map((k) => <option key={k} value={k}>{KIND_CHOICE[k]}</option>)}</select></label>
        <label className="field"><span>What</span>
          <select value={what} onChange={(event) => { setWhat(event.target.value); setWhere('') }}>
            <option value="">Choose…</option>
            {things.map((t) => <option key={t.key} value={`key:${t.key}`}>{t.name}</option>)}
            {plans.map((pl) => <option key={pl.code} value={`plan:${pl.code}`}>Whole plan: {pl.name}</option>)}
          </select></label>
        {showWhere && (
          <label className="field"><span>Where</span>
            <select value={where} onChange={(event) => setWhere(event.target.value)}>
              {need === 'any' && <option value="">Whole account</option>}
              {need === 'store' && <option value="">Choose a store…</option>}
              {need === 'business' && <option value="">Choose a business…</option>}
              {need !== 'store' && live.map((b) => <option key={b.id} value={`business:${b.id}`}>{live.length > 1 ? `Whole business: ${b.name}` : 'Whole business'}</option>)}
              {need !== 'business' && stores.map((s) => <option key={s.id} value={`store:${s.id}`}>{live.length > 1 ? `${s.business.name} · ${s.name}` : s.name}</option>)}
            </select></label>
        )}
        <div className="grid-2">
          {showFrom && <label className="field"><span>From</span><input type="date" min={today} value={starts} onChange={(event) => setStarts(event.target.value)} /></label>}
          <label className="field"><span>Till (needed)</span><input type="date" min={showFrom ? starts : today} value={ends} onChange={(event) => setEnds(event.target.value)} /></label>
        </div>
        {kind === 'price' && <label className="field"><span>Special price ₹ a month</span><input inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value)} /></label>}
        {kind === 'lock' && (
          <fieldset className="field"><span>Lock shows in</span>
            <div className="chips">
              {['menu', 'page', 'home'].map((pl) => (
                <label key={pl} className="field inline"><input type="checkbox" checked={places.includes(pl)}
                  onChange={(event) => setPlaces(event.target.checked ? [...places, pl] : places.filter((x) => x !== pl))} /> {PLACE_WORD[pl]}</label>
              ))}
            </div>
          </fieldset>
        )}
        {kind === 'trial' && (
          <label className="field"><span>Remind them before the end</span>
            <select value={remind} onChange={(event) => setRemind(event.target.value)}>
              {[...new Set([data.remindDays, 3, 7])].filter((n) => n > 0).map((n) => <option key={n} value={n}>{n} day{n === 1 ? '' : 's'} before</option>)}
              <option value="0">No reminder</option>
            </select></label>
        )}
        <label className="field"><span>Why? (kept in the audit log)</span><textarea rows={2} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. many regulars stopped coming" /></label>
        <p className="sub">They see "Trial till [date]" on a trial; a gift's end date stays hidden. If a public offer is lower than a special price, they pay the lower.</p>
        {error && <ErrorBox message={error} />}
        <div className="dialog-actions">
          <button type="button" className="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy}>{busy ? 'Starting…' : 'Start deal'}</button>
        </div>
      </form>
    </div>
  )
}
