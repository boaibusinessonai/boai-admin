import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Badge, Card, ErrorBox, Facts, Loading } from '../components/ui'
import { formatAgo, formatDateTime } from '../lib/format'
import { navigate } from '../lib/route'
import { admin, AdminError } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'

type Status = 'got_it' | 'fixing' | 'fixed'
type Issue = {
  id: string; kind: 'problem' | 'feedback'; message: string; urgency: 'stuck' | 'soon' | 'can_wait'; status: Status; by: string; role: string; business: string; store?: string
  organizationId: string; createdAt: string; hasPhoto: boolean
}
type AppError = { id: string; business: string; message: string; stack?: string; page?: string; version?: string; device?: string; times: number; lastAt: string }
type IssueFull = Issue & {
  ownerId: string; photo?: string; errors: AppError[]
  context: { page?: string; version?: string; device?: string; recentPages?: string[]; errors?: unknown[] }
  replies: { id: string; message: string; fromSupport: boolean; by: string; createdAt: string }[]
}

const STATUSES: Status[] = ['got_it', 'fixing', 'fixed']
const STATUS_LABELS: Record<Status, string> = { got_it: 'Got it', fixing: 'Fixing', fixed: 'Fixed' }
const URGENCY_LABELS: Record<Issue['urgency'], string> = { stuck: 'Can’t work', soon: 'Soon', can_wait: 'Can wait' }
const URGENCY_TONES = { stuck: 'critical', soon: 'warning', can_wait: 'neutral' } as const

/** Feedback has no urgency of its own, so it says what it is instead. */
function KindBadge({ issue }: { issue: Issue }) {
  if (issue.kind === 'feedback') return <Badge tone="accent">Feedback</Badge>
  return <Badge tone={URGENCY_TONES[issue.urgency]}>{URGENCY_LABELS[issue.urgency]}</Badge>
}

type View = 'all' | Status | 'errors'

export function Issues({ id }: { id?: string }) {
  const [view, setView] = useState<View>('all')
  const list = useLoad(() => admin<{ issues: Issue[]; counts: Record<Status, number> }>('issues', view === 'all' || view === 'errors' ? {} : { status: view }), view)
  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Problems</h1><p className="muted">What people reported from the app, and errors the app caught by itself.</p></div>
      </header>
      <div className="chips" role="group" aria-label="Filter">
        {(['all', ...STATUSES, 'errors'] as View[]).map((v) => (
          <button type="button" key={v} className={`chip ${view === v ? 'is-on' : ''}`} aria-pressed={view === v} onClick={() => { setView(v); if (id) navigate({ page: 'issues' }) }}>
            {v === 'all' ? 'All' : v === 'errors' ? 'Errors caught' : `${STATUS_LABELS[v]}${list.data ? ` ${list.data.counts[v]}` : ''}`}
          </button>
        ))}
      </div>
      {view === 'errors' ? <Errors /> : (
        <div className={`split ${id ? 'has-detail' : ''}`}>
          <div className="split-list">
            {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
            {!list.data && !list.error && <Loading />}
            {list.data && (
              <ul className="lead-list">
                {list.data.issues.map((issue) => (
                  <li key={issue.id}>
                    <button type="button" className={`lead-row ${issue.id === id ? 'is-on' : ''}`} onClick={() => navigate({ page: 'issues', id: issue.id })}>
                      <span className="lead-top"><strong>{issue.business}</strong><span className="muted small">{formatAgo(issue.createdAt)}</span></span>
                      <span className="lead-tags">
                        <KindBadge issue={issue} />
                        <Badge tone={issue.status === 'got_it' ? 'accent' : issue.status === 'fixed' ? 'good' : 'neutral'}>{STATUS_LABELS[issue.status]}</Badge>
                        {issue.hasPhoto && <Badge>Photo</Badge>}
                      </span>
                      <span className="sub clamp">{issue.message}</span>
                    </button>
                  </li>
                ))}
                {!list.data.issues.length && <li className="muted">Nothing here.</li>}
              </ul>
            )}
          </div>
          {id && <div className="split-detail"><Detail key={id} id={id} onChanged={list.reload} /></div>}
        </div>
      )}
    </div>
  )
}

function Detail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { data, error, reload } = useLoad(() => admin<IssueFull>('issue', { issueId: id }), id)
  const [reply, setReply] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <Loading />

  async function answer(change: { status?: Status; reply?: string }) {
    setSaving(true)
    setSaveError('')
    try {
      await admin('answer_issue', { issueId: id, ...change })
      if (change.reply) setReply('')
      reload()
      onChanged()
    } catch (e) {
      setSaveError(e instanceof AdminError ? e.message : 'Couldn’t save.')
    } finally {
      setSaving(false)
    }
  }

  const { context } = data
  return (
    <Card title={<>{data.business} <KindBadge issue={data} /></>}
      action={<button type="button" className="text-button" onClick={() => navigate({ page: 'issues' })}><ArrowLeft size={14} aria-hidden="true" /> List</button>}>
      <blockquote className="message">{data.message}</blockquote>
      {data.photo && <img className="issue-photo" src={data.photo} alt="What the person sent with the report" />}
      <Facts items={[
        ['From', `${data.by} (${data.role})`], ['Store', data.store ?? '—'], ['Sent', formatDateTime(data.createdAt)],
        ['Page', context.page ?? '—'], ['Pages before', context.recentPages?.join(' → ') || '—'], ['Version', context.version ?? '—'], ['Device', context.device ?? '—'],
      ]} />
      <p><a href={`#/customers/${data.ownerId}`}>Open this customer</a></p>
      <div className="lead-controls">
        <label className="field">
          <span>Status (Fixing and Fixed reach their bell)</span>
          <select value={data.status} disabled={saving} onChange={(event) => void answer({ status: event.target.value as Status })}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </label>
      </div>
      <h3>Replies</h3>
      <ul className="list">
        {data.replies.map((r) => <li key={r.id}>{r.message}<span className="sub">{r.fromSupport ? 'BOAI support' : r.by} · {formatDateTime(r.createdAt)}</span></li>)}
        {!data.replies.length && <li className="muted">No replies yet.</li>}
      </ul>
      <div className="issue-reply">
        <label className="field">
          <span>Reply (reaches their bell)</span>
          <textarea rows={3} maxLength={2000} value={reply} onChange={(event) => setReply(event.target.value)} />
        </label>
        <div><button type="button" className="button small" disabled={saving || !reply.trim()} onClick={() => void answer({ reply: reply.trim() })}>Send reply</button></div>
      </div>
      {saveError && <ErrorBox message={saveError} />}
      {data.errors.length > 0 && (
        <>
          <h3>This business’s errors, last 7 days</h3>
          <ErrorList errors={data.errors} />
        </>
      )}
    </Card>
  )
}

function Errors() {
  const { data, error, reload } = useLoad(() => admin<{ errors: AppError[] }>('app_errors', {}), 'errors')
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <Loading />
  return <Card title="Last 30 days">{data.errors.length ? <ErrorList errors={data.errors} showBusiness /> : <p className="muted">No errors caught.</p>}</Card>
}

function ErrorList({ errors, showBusiness }: { errors: AppError[]; showBusiness?: boolean }) {
  return (
    <ul className="list">
      {errors.map((e) => (
        <li key={e.id}>
          {showBusiness && <strong>{e.business}: </strong>}{e.message}
          <span className="sub">{e.times} time{e.times === 1 ? '' : 's'} · {e.page ?? 'no page'} · {e.version ?? 'no version'} · {formatDateTime(e.lastAt)}</span>
          {e.stack && <details><summary className="small muted">Details</summary><pre className="issue-stack">{e.stack}</pre></details>}
        </li>
      ))}
    </ul>
  )
}
