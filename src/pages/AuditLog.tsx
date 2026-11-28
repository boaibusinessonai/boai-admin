import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Badge, Card, ErrorBox, Loading } from '../components/ui'
import { formatDateTime, formatNumber } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { admin, AdminError } from '../lib/supabase'
import type { AuditEntry } from '../lib/types'

// Every admin action and every look at customer data. Append-only: each
// entry's hash covers the one before, so "Check the chain" finds any change.

export function AuditLog() {
  const [action, setAction] = useState('')
  const [older, setOlder] = useState<AuditEntry[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const { data, error, reload } = useLoad(async () => {
    setOlder([])
    return admin<{ entries: AuditEntry[]; actions: string[] }>('audit_log', action ? { action } : {})
  }, action)
  const [check, setCheck] = useState<{ ok: boolean; entries: number; brokenAt?: number; latestHash?: string } | null>(null)
  const [checkError, setCheckError] = useState('')
  const [open, setOpen] = useState<number | null>(null)

  async function verify() {
    setCheck(null)
    setCheckError('')
    try { setCheck(await admin('verify_audit')) } catch (e) { setCheckError(e instanceof AdminError ? e.message : 'Couldn’t check.') }
  }
  const entries = [...(data?.entries ?? []), ...older]
  async function more() {
    const last = entries[entries.length - 1]
    if (!last) return
    setLoadingMore(true)
    try {
      const next = await admin<{ entries: AuditEntry[] }>('audit_log', { ...(action ? { action } : {}), beforeId: last.id })
      setOlder((list) => [...list, ...next.entries])
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Audit log</h1><p className="muted">Who did what, when, from where. Nobody can change or remove an entry.</p></div>
        <button type="button" className="button" onClick={verify}><ShieldCheck size={16} aria-hidden="true" /> Check the chain</button>
      </header>
      {check && (check.ok
        ? <p className="notice good" role="status"><ShieldCheck size={16} aria-hidden="true" /> All {formatNumber(check.entries)} entries check out. Latest hash <code className="mono">{check.latestHash?.slice(0, 16)}…</code> (it should match the one in today's alert).</p>
        : <p className="notice bad" role="alert"><ShieldAlert size={16} aria-hidden="true" /> The chain breaks at entry #{check.brokenAt}: it was changed after it was written.</p>)}
      {checkError && <ErrorBox message={checkError} />}
      <div className="toolbar">
        <label className="field inline">
          <span>Show</span>
          <select value={action} onChange={(event) => setAction(event.target.value)}>
            <option value="">Everything</option>
            <option value="views">Views of customer data (DPDP access log)</option>
            {(data?.actions ?? []).map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <Card>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>When</th><th>Who</th><th>Action</th><th>On</th><th>From</th></tr></thead>
              <tbody>
                {entries.map((entry) => (
                  <Fragment key={entry.id}>
                    <tr className="clickable" onClick={() => setOpen(open === entry.id ? null : entry.id)}>
                      <td className="mono small">{entry.id}</td>
                      <td>{formatDateTime(entry.at)}</td>
                      <td>{entry.adminEmail}{entry.adminRole && <span className="sub">{entry.adminRole}</span>}</td>
                      <td><Badge tone={entry.action === 'sign_in_denied' ? 'critical' : entry.action.startsWith('view') || entry.action === 'search' ? 'neutral' : 'accent'}>{entry.action.replace(/_/g, ' ')}</Badge></td>
                      <td>{entry.targetType ? <TargetLink entry={entry} /> : '—'}</td>
                      <td className="small">{entry.ip ?? '—'}</td>
                    </tr>
                    {open === entry.id && (
                      <tr className="detail-row">
                        <td colSpan={6}>
                          {entry.reason && <p><strong>Reason:</strong> {entry.reason}</p>}
                          {entry.before != null && <p><strong>Before:</strong> <code className="mono">{JSON.stringify(entry.before)}</code></p>}
                          {entry.after != null && <p><strong>After:</strong> <code className="mono">{JSON.stringify(entry.after)}</code></p>}
                          <p className="small muted">Device: {entry.userAgent ?? '—'}</p>
                          <p className="small muted mono">Hash {entry.hash}</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {!entries.length && <tr><td colSpan={6} className="muted">Nothing yet.</td></tr>}
              </tbody>
            </table>
          </div>
          {data.entries.length === 100 && <button type="button" className="button" onClick={more} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Older entries'}</button>}
        </Card>
      )}
    </div>
  )
}

function TargetLink({ entry }: { entry: AuditEntry }) {
  if (entry.targetType === 'profile') return <a href={`#/customers/${entry.targetId}`} onClick={(event) => event.stopPropagation()}>Account</a>
  if (entry.targetType === 'lead') return <a href={`#/leads/${entry.targetId}`} onClick={(event) => event.stopPropagation()}>Lead</a>
  return <span className="small">{entry.targetType}</span>
}
