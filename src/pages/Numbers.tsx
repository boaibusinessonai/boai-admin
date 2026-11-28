import { useState } from 'react'
import { Card, ErrorBox, Loading, Stat } from '../components/ui'
import { formatNumber } from '../lib/format'
import { DAYS, PLACE_WORD, rowHint, tapShare, WHAT_WORD, type NumbersData, type Shop, type What } from '../lib/numbers'
import { admin } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'

// Admin › Numbers (V113, selling P6; Admin board H7tJ8eg1zwWM4UV8Pii6Ub "Which lock works"): for each lock and the place it
// shows, the businesses that saw it, tapped, said Not now, asked the owner, and bought (or moved up) within 30 days; trials
// kept; bought without a lock. Last 7 / 30 / 90 days, one plan, one kind of business. A number opens the businesses behind it
// (names only, never their customers). Owner and finance (the database refuses support).

type Filters = { days: number; plan: string; industry: string }
type Open = { key: string; name: string; place?: string; what: What; n: number }

export function Numbers() {
  const [f, setF] = useState<Filters>({ days: 30, plan: '', industry: '' })
  const body = { days: f.days, ...(f.plan ? { plan: f.plan } : {}), ...(f.industry ? { industry: f.industry } : {}) }
  const data = useLoad(() => admin<NumbersData>('sell_numbers', body), `numbers:${JSON.stringify(body)}`)
  const [open, setOpen] = useState<Open | null>(null)
  if (data.error) return <div className="page"><ErrorBox message={data.error} onRetry={data.reload} /></div>
  if (!data.data) return <Loading />
  const d = data.data
  const n = (key: string, name: string, place: string | undefined, what: What, value: number) => value > 0
    ? <button type="button" className="text-button" onClick={() => setOpen({ key, name, place, what, n: value })}>{formatNumber(value)}</button>
    : <span className="sub">0</span>

  return (
    <div className="page numbers">
      <Card title="Which lock works" action={<div className="numbers-filters">
        <select aria-label="Days" value={f.days} onChange={(event) => setF({ ...f, days: Number(event.target.value) })}>{DAYS.map((days) => <option key={days} value={days}>Last {days} days</option>)}</select>
        <select aria-label="Plan" value={f.plan} onChange={(event) => setF({ ...f, plan: event.target.value })}><option value="">All plans</option>{d.plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select>
        <select aria-label="Kind of business" value={f.industry} onChange={(event) => setF({ ...f, industry: event.target.value })}><option value="">All businesses</option>{d.industries.map((k) => <option key={k} value={k}>{k}</option>)}</select>
      </div>}>
        <div className="stats compact">
          <Stat label="Shops that saw a lock" value={formatNumber(d.totals.seen)} />
          <Stat label="Tapped" value={formatNumber(d.totals.tapped)} />
          <Stat label="Bought / moved up" value={formatNumber(d.totals.bought)} />
          <Stat label="Trials kept" value={`${formatNumber(d.trials.kept)} of ${formatNumber(d.trials.started)}`} />
        </div>
        {d.rows.length === 0
          ? <p className="sub">No lock was seen in these days.</p>
          : <div className="table-wrap"><table className="table">
            <thead><tr><th>Lock</th><th>Where</th><th className="num">Seen</th><th className="num">Tapped</th><th className="num">Not now</th><th className="num">Asked owner</th><th className="num">Bought</th><th>Taps</th></tr></thead>
            <tbody>{d.rows.map((r) => {
              const hint = rowHint(r)
              return <tr key={`${r.key}:${r.place}`}>
                <td><b>{r.name}</b>{hint && <><br /><span className="sub">{hint}</span></>}</td>
                <td>{PLACE_WORD[r.place] ?? r.place}</td>
                <td className="num">{n(r.key, r.name, r.place, 'seen', r.seen)}</td>
                <td className="num">{n(r.key, r.name, r.place, 'tapped', r.tapped)}</td>
                <td className="num">{n(r.key, r.name, r.place, 'not_now', r.notNow)}</td>
                <td className="num">{n(r.key, r.name, r.place, 'asked', r.asked)}</td>
                <td className="num">{n(r.key, r.name, r.place, 'bought', r.bought)}</td>
                <td className="numbers-bar"><span className="bar-track"><span className="bar-fill" style={{ width: `${tapShare(r, d.rows)}%` }} /></span></td>
              </tr>
            })}</tbody></table></div>}
        <p className="sub">Many seen, few taps: change the words or the number shown. Many taps, few bought: look at the price. Bought = paid for it, or moved up a plan when the lock said it comes with one, within 30 days of seeing it. Tap a number for the list of shops (counts only, never their customers).</p>
      </Card>

      {d.noLock.length > 0 && <Card title="Bought without a lock">
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Thing</th><th className="num">Shops</th></tr></thead>
          <tbody>{d.noLock.map((r) => <tr key={r.key}><td>{r.name}</td><td className="num">{n(r.key, r.name, undefined, 'no_lock', r.n)}</td></tr>)}</tbody>
        </table></div>
      </Card>}

      {open && <ShopList open={open} filters={body} onClose={() => setOpen(null)} />}
    </div>
  )
}

function ShopList({ open, filters, onClose }: { open: Open; filters: Record<string, unknown>; onClose: () => void }) {
  const ask = { key: open.key, what: open.what, ...(open.place ? { place: open.place } : {}), ...filters }
  const shops = useLoad(() => admin<{ shops: Shop[] }>('sell_number_shops', ask), `shops:${JSON.stringify(ask)}`)
  const title = `${open.name}${open.place ? ` · ${PLACE_WORD[open.place as keyof typeof PLACE_WORD] ?? open.place}` : ''} · ${WHAT_WORD[open.what]}`
  return (
    <div className="drawer-back" onClick={onClose}>
      <div className="drawer" role="dialog" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head"><h2>{title}</h2><button type="button" className="button" onClick={onClose}>Close</button></div>
        {shops.error && <ErrorBox message={shops.error} onRetry={shops.reload} />}
        {!shops.data && !shops.error && <Loading />}
        {shops.data && <ul className="list">{shops.data.shops.map((s) => (
          <li key={s.orgId}><a href={`#/customers/${s.ownerId}`}>{s.name}</a>{s.industry && <span className="sub"> · {s.industry}</span>}{s.ownerName && <span className="sub"> · {s.ownerName}</span>}</li>
        ))}</ul>}
        {shops.data && shops.data.shops.length < open.n && <p className="sub">Showing {shops.data.shops.length} of {open.n}.</p>}
      </div>
    </div>
  )
}
