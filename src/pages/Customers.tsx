import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge, ErrorBox, Loading } from '../components/ui'
import { formatAgo, formatDate, formatNumber, formatRupees, STATE_LABELS } from '../lib/format'
import { navigate } from '../lib/route'
import { stateTone, useLoad } from '../lib/useLoad'
import { admin } from '../lib/supabase'
import type { CustomerRow } from '../lib/types'

const FILTERS: [string | undefined, string][] = [[undefined, 'All'], ['paid', 'Paid'], ['due7', 'Renewing in 7 days'], ['grace', 'In grace'], ['lapsed', 'Lapsed'], ['free', 'Free'], ['not_set_up', 'Not set up']]
const PAGE = 50

export function Customers({ state, addOn, addOnName }: { state?: string; addOn?: string; addOnName?: string }) {
  const [typed, setTyped] = useState('')
  const [q, setQ] = useState('')
  const [shown, setShown] = useState(PAGE)
  useEffect(() => {
    const timer = window.setTimeout(() => { setQ(typed.trim()); setShown(PAGE) }, 350)
    return () => window.clearTimeout(timer)
  }, [typed])
  const { data, error, loading, reload } = useLoad(
    () => admin<{ total: number; customers: CustomerRow[] }>('customers', { ...(q ? { q } : {}), ...(state ? { state } : {}), ...(addOn ? { addOn } : {}), limit: shown }),
    `${q}|${state ?? ''}|${addOn ?? ''}|${shown}`)

  return (
    <div className="page">
      <header className="page-head"><div><h1>Customers</h1><p className="muted">Every owner account. Opening one is logged.</p></div></header>
      <div className="toolbar">
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <input type="search" placeholder="Name, email, phone, business or GSTIN" value={typed} onChange={(event) => setTyped(event.target.value)} aria-label="Search customers" />
        </label>
        <div className="chips" role="group" aria-label="Filter by plan state">
          {FILTERS.map(([value, label]) => (
            <button type="button" key={label} className={`chip ${state === value ? 'is-on' : ''}`} aria-pressed={state === value} onClick={() => navigate({ page: 'customers', state: value })}>{label}</button>
          ))}
          {addOn && <button type="button" className="chip is-on" aria-label={`Showing those who have ${addOnName ?? addOn}: show all`} onClick={() => navigate({ page: 'customers' })}>Have {addOnName ?? addOn} ✕</button>}
        </div>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <>
          <p className="muted small">{formatNumber(data.total)} account{data.total === 1 ? '' : 's'}</p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Owner</th><th>Businesses</th><th>Plan</th><th>Paid till</th><th>Last bill</th><th>Joined</th></tr></thead>
              <tbody>
                {data.customers.map((row) => (
                  <tr key={row.id} className="clickable" onClick={() => navigate({ page: 'customer', id: row.id })}>
                    <td><a href={`#/customers/${row.id}`} onClick={(event) => event.stopPropagation()}><strong>{row.name}</strong></a><span className="sub">{row.email ?? '—'}{row.phone ? ` · ${row.phone}` : ''}</span></td>
                    <td>{row.businesses.join(', ') || '—'}</td>
                    <td>
                      <span className="stack">{row.account.planName ?? '—'}<Badge tone={stateTone(row.account.state)}>{STATE_LABELS[row.account.state] ?? row.account.state}</Badge></span>
                      {row.account.monthly ? <span className="sub">{formatRupees(row.account.monthly)}/month</span> : null}
                    </td>
                    <td>{row.account.state === 'free' || row.account.state === 'not_set_up' ? '—' : formatDate(row.account.paidUntil)}</td>
                    <td>{formatAgo(row.lastBill)}</td>
                    <td>{formatDate(row.createdAt)}</td>
                  </tr>
                ))}
                {!data.customers.length && <tr><td colSpan={6} className="muted">No accounts match.</td></tr>}
              </tbody>
            </table>
          </div>
          {data.customers.length < data.total && (
            <button type="button" className="button" onClick={() => setShown((n) => n + PAGE)} disabled={loading}>{loading ? 'Loading…' : 'Show more'}</button>
          )}
        </>
      )}
    </div>
  )
}
