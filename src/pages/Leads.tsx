import { ArrowLeft, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NoteForm, Notes } from '../components/Notes'
import { Badge, Card, ErrorBox, Facts, Loading } from '../components/ui'
import { formatAgo, formatDate, formatDateTime, LEAD_LABELS, LEAD_STATUSES, type LeadStatus } from '../lib/format'
import { navigate } from '../lib/route'
import { useLoad } from '../lib/useLoad'
import { admin, AdminError } from '../lib/supabase'
import type { AuditEntry, Lead, Note } from '../lib/types'
import { ContactLinks } from './Customer360'

const FILTERS = ['open', ...LEAD_STATUSES, 'all'] as const
type Filter = (typeof FILTERS)[number]
const filterLabel = (f: Filter) => (f === 'open' ? 'Open' : f === 'all' ? 'All' : LEAD_LABELS[f])
const SOURCES: Record<string, string> = { website: 'Website', plan: 'Plans page', app: 'In the app' }
const today = () => new Date().toLocaleDateString('en-CA')

export function Leads({ id }: { id?: string }) {
  const [filter, setFilter] = useState<Filter>('open')
  const [typed, setTyped] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(typed.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [typed])
  const list = useLoad(() => admin<{ leads: Lead[]; counts: Record<LeadStatus, number>; dueToday: number }>('leads', { status: filter, ...(q ? { q } : {}) }), `${filter}|${q}`)

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Leads &amp; support</h1><p className="muted">“Talk to us” requests and refund requests.{list.data?.dueToday ? ` ${list.data.dueToday} follow-up${list.data.dueToday === 1 ? '' : 's'} due.` : ''}</p></div>
      </header>
      <div className={`split ${id ? 'has-detail' : ''}`}>
        <div className="split-list">
          <div className="toolbar">
            <label className="search-field">
              <Search size={16} aria-hidden="true" />
              <input type="search" placeholder="Name, phone, business, message" value={typed} onChange={(event) => setTyped(event.target.value)} aria-label="Search leads" />
            </label>
            <div className="chips" role="group" aria-label="Filter by status">
              {FILTERS.map((f) => (
                <button type="button" key={f} className={`chip ${filter === f ? 'is-on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {filterLabel(f)}{list.data && f in list.data.counts ? ` ${list.data.counts[f as LeadStatus]}` : ''}
                </button>
              ))}
            </div>
          </div>
          {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
          {!list.data && !list.error && <Loading />}
          {list.data && (
            <ul className="lead-list">
              {list.data.leads.map((lead) => {
                const due = lead.followUpOn && lead.followUpOn <= today() && !['won', 'lost', 'closed'].includes(lead.status)
                return (
                  <li key={lead.id}>
                    <button type="button" className={`lead-row ${lead.id === id ? 'is-on' : ''}`} onClick={() => navigate({ page: 'leads', id: lead.id })}>
                      <span className="lead-top"><strong>{lead.name}</strong><span className="muted small">{formatAgo(lead.createdAt)}</span></span>
                      <span className="lead-tags">
                        {lead.kind === 'refund' && <Badge tone="warning">Refund</Badge>}
                        <Badge tone={lead.status === 'new' ? 'accent' : 'neutral'}>{LEAD_LABELS[lead.status]}</Badge>
                        {due && <Badge tone="critical">Follow up {formatDate(lead.followUpOn)}</Badge>}
                        {lead.match && <Badge>{lead.linked ? 'Account' : 'Matches an account'}</Badge>}
                      </span>
                      <span className="sub clamp">{lead.business ? `${lead.business} · ` : ''}{lead.message ?? lead.phone}</span>
                    </button>
                  </li>
                )
              })}
              {!list.data.leads.length && <li className="muted">Nothing here.</li>}
            </ul>
          )}
        </div>
        {id && <div className="split-detail"><LeadDetail key={id} id={id} onChanged={list.reload} /></div>}
      </div>
    </div>
  )
}

function LeadDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { data, error, reload } = useLoad(() => admin<{ lead: Lead; notes: Note[]; history: AuditEntry[] }>('lead', { leadId: id }), id)
  const [saving, setSaving] = useState('')
  const [saveError, setSaveError] = useState('')
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <Loading />
  const { lead } = data

  async function update(change: Record<string, unknown>, what: string) {
    setSaving(what)
    setSaveError('')
    try {
      await admin('update_lead', { leadId: id, ...change })
      reload()
      onChanged()
    } catch (e) {
      setSaveError(e instanceof AdminError ? e.message : 'Couldn’t save.')
    } finally {
      setSaving('')
    }
  }

  return (
    <Card title={<>{lead.name} {lead.kind === 'refund' && <Badge tone="warning">Refund request</Badge>}</>}
      action={<button type="button" className="text-button" onClick={() => navigate({ page: 'leads' })}><ArrowLeft size={14} aria-hidden="true" /> List</button>}>
      <ContactLinks phone={lead.phone} email={lead.email} />
      {lead.message && <blockquote className="message">{lead.message}</blockquote>}
      <Facts items={[
        ['Phone', lead.phone], ['Email', lead.email ?? '—'], ['Business', lead.business ?? '—'], ['Type', lead.businessType ?? '—'], ['City', lead.city ?? '—'],
        ['Branches', lead.branches ?? '—'], ['From', SOURCES[lead.source] ?? lead.source], ['Sent', formatDateTime(lead.createdAt)],
      ]} />
      <div className="lead-controls">
        <label className="field">
          <span>Status</span>
          <select value={lead.status} disabled={Boolean(saving)} onChange={(event) => update({ status: event.target.value }, 'status')}>
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Follow up on</span>
          <input type="date" value={lead.followUpOn ?? ''} disabled={Boolean(saving)} onChange={(event) => update({ followUpOn: event.target.value || null, ...(event.target.value && lead.status === 'new' ? { status: 'follow_up' } : {}) }, 'date')} />
        </label>
      </div>
      {saveError && <ErrorBox message={saveError} />}
      <div className="account-link">
        {lead.match
          ? <>
              <span>{lead.linked ? 'Account' : 'Same phone or email as'}: <a href={`#/customers/${lead.match.id}`}>{lead.match.name}</a>{lead.match.email ? ` (${lead.match.email})` : ''}</span>
              {lead.linked
                ? <button type="button" className="text-button" disabled={Boolean(saving)} onClick={() => update({ profileId: null }, 'link')}>Unlink</button>
                : <button type="button" className="button small" disabled={Boolean(saving)} onClick={() => update({ profileId: lead.match!.id }, 'link')}>Link to this account</button>}
            </>
          : <span className="muted">Not linked to an account.</span>}
      </div>
      <h3>Notes</h3>
      <NoteForm targetType="lead" targetId={lead.id} onSaved={() => { reload(); onChanged() }} />
      <Notes notes={data.notes} />
      {data.history.length > 0 && (
        <>
          <h3>History</h3>
          <ul className="list">
            {data.history.map((entry) => <li key={entry.id}>{describe(entry)}<span className="sub">{entry.adminEmail} · {formatDateTime(entry.at)}</span></li>)}
          </ul>
        </>
      )}
    </Card>
  )
}

function describe(entry: AuditEntry) {
  if (entry.action === 'add_note') return 'Note added'
  if (entry.action !== 'update_lead') return entry.action.replace(/_/g, ' ')
  const before = (entry.before ?? {}) as Record<string, unknown>
  const after = (entry.after ?? {}) as Record<string, unknown>
  const parts: string[] = []
  if (before.status !== after.status) parts.push(`status ${LEAD_LABELS[before.status as LeadStatus] ?? before.status} → ${LEAD_LABELS[after.status as LeadStatus] ?? after.status}`)
  if (before.followUpOn !== after.followUpOn) parts.push(after.followUpOn ? `follow up on ${formatDate(String(after.followUpOn))}` : 'follow-up cleared')
  if (before.profileId !== after.profileId) parts.push(after.profileId ? 'linked to account' : 'unlinked')
  return parts.join(', ') || 'updated'
}
