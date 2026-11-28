import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Card, ErrorBox, Loading } from '../components/ui'
import { formatAgo, formatDateTime } from '../lib/format'
import { navigate } from '../lib/route'
import { admin } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'

// Support mode, owner and support admins, each with their own Google sign-in: a business can be opened only while its owner's request is live
// (the database refuses otherwise). The app opens in a new tab with a one-time code, signed in with
// the same Google account; start, extend and end go in the audit log with the reason.

type Request = { id: string; note?: string; createdAt: string; expiresAt: string; inUse: boolean; organizationId: string; organizationName: string; requestedBy: string; profileId: string }
type Mine = { sessionId: string; organizationId: string; organizationName: string; endsAt: string; entered: boolean }
type Session = { id: string; organizationName: string; by?: string; reason: string; startedAt: string; enteredAt?: string; endsAt: string; endedAt?: string; live: boolean
  changes: { entity: string; name?: string; action: string; at: string }[] }

const APP_URL = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '')
const appLink = (handoff: string) => `${APP_URL}/#/support?t=${encodeURIComponent(handoff)}`

/** Live requests (all, or one customer's) and this admin's own session, with Open, Extend and End. */
export function SupportRequests({ profileId }: { profileId?: string }) {
  const { data, error, reload } = useLoad(() => admin<{ requests: Request[]; mine: Mine | null }>('support_requests'), profileId ?? '')
  const [opening, setOpening] = useState<Request | null>(null)
  const [extending, setExtending] = useState(false)
  const [handoff, setHandoff] = useState<{ code: string; sessionId: string } | null>(null)
  const [ending, setEnding] = useState(false)
  if (error) return <Card title="Support requests"><ErrorBox message={error} onRetry={reload} /></Card>
  if (!data) return <Loading />
  const requests = profileId ? data.requests.filter((r) => r.profileId === profileId) : data.requests
  const mine = data.mine && (!profileId || requests.some((r) => r.organizationId === data.mine!.organizationId)) ? data.mine : null

  async function end(sessionId: string) {
    setEnding(true)
    try { await admin('support_end', { sessionId }); setHandoff(null); reload() } finally { setEnding(false) }
  }

  return (
    <>
      {mine && (
        <Card title="Your support session">
          <p><strong>{mine.organizationName}</strong>, until {formatDateTime(mine.endsAt)}. {mine.entered ? 'Open in the app.' : 'Not opened in the app yet.'}</p>
          {!APP_URL && <ErrorBox message="The app's address isn't set for this site (VITE_APP_URL)." />}
          {APP_URL && handoff?.sessionId === mine.sessionId && !mine.entered && (
            <p><a className="button" href={appLink(handoff.code)} target="_blank" rel="noreferrer noopener"><ExternalLink size={14} aria-hidden="true" /> Open the app as this business</a>
              <span className="muted small"> Use it within 10 minutes; sign in there with this same Google account.</span></p>
          )}
          <p className="contact">
            <button type="button" className="button small" onClick={() => setExtending(true)}>Another 60 minutes</button>
            <button type="button" className="button small danger" disabled={ending} onClick={() => end(mine.sessionId)}>End now</button>
          </p>
        </Card>
      )}
      <Card title="Owners asking for support">
        <p className="muted">An owner asks from Report a problem in the app. A request lasts 24 hours and the owner can stop it any time, which ends your session too. A session lasts 60 minutes and acts as the owner; their History shows BOAI support.</p>
        {requests.length === 0 ? <p className="muted">{profileId ? 'This customer hasn’t asked for support.' : 'No one is asking for support now.'}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Business</th><th>Asked</th><th>Note</th><th>Open till</th><th /></tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>{profileId ? <strong>{r.organizationName}</strong> : <a href="#" onClick={(e) => { e.preventDefault(); navigate({ page: 'customer', id: r.profileId }) }}><strong>{r.organizationName}</strong></a>}
                      {r.inUse && <> <Badge tone="accent">In use</Badge></>}<span className="sub">{r.requestedBy}</span></td>
                    <td>{formatAgo(r.createdAt)}</td>
                    <td>{r.note || <span className="muted">—</span>}</td>
                    <td>{formatDateTime(r.expiresAt)}</td>
                    <td><button type="button" className="button small" onClick={() => setOpening(r)}>Open as this business</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {opening && (
        <ConfirmDialog title={`Open ${opening.organizationName} as its owner?`} action="Start"
          onDone={async (reason) => {
            const started = await admin<{ sessionId: string; handoff: string }>('support_start', { organizationId: opening.organizationId, reason })
            setHandoff({ code: started.handoff, sessionId: started.sessionId })
            reload()
          }} onClose={() => setOpening(null)}>
          <p>For 60 minutes you act as the owner in this business only. Any other session of yours ends. It goes in the audit log.</p>
        </ConfirmDialog>
      )}
      {extending && mine && (
        <ConfirmDialog title="Another 60 minutes?" action="Extend"
          onDone={async (reason) => { await admin('support_extend', { sessionId: mine.sessionId, reason }); reload() }} onClose={() => setExtending(false)}>
          <p>Never past the end of the owner’s request ({formatDateTime(data.requests.find((r) => r.organizationId === mine.organizationId)?.expiresAt ?? mine.endsAt)}). It goes in the audit log.</p>
        </ConfirmDialog>
      )}
    </>
  )
}

/** Support sessions in one customer's businesses, with what each changed. */
export function SupportHistory({ profileId }: { profileId: string }) {
  const { data, error, reload } = useLoad(() => admin<{ sessions: Session[] }>('support_history', { profileId }), profileId)
  if (error) return <Card title="Support sessions"><ErrorBox message={error} onRetry={reload} /></Card>
  if (!data) return <Loading />
  return (
    <Card title="Support sessions">
      {data.sessions.length === 0 ? <p className="muted">No support session yet.</p> : data.sessions.map((s) => (
        <div key={s.id} className="support-session">
          <p><strong>{s.organizationName}</strong> · {formatDateTime(s.startedAt)} · {s.by ?? 'a removed admin'} {s.live && <Badge tone="accent">Live</Badge>}
            <span className="sub">Why: {s.reason}. {s.enteredAt ? `Opened ${formatDateTime(s.enteredAt)}` : 'Never opened in the app'}; {s.endedAt ? `ended ${formatDateTime(s.endedAt)}` : `till ${formatDateTime(s.endsAt)}`}.</span></p>
          {s.changes.length === 0 ? <p className="muted small">Changed nothing.</p> : (
            <ul className="small">{s.changes.map((c, i) => <li key={i}>{formatDateTime(c.at)}: {c.action} {c.entity.replace(/_/g, ' ')}{c.name ? ` “${c.name}”` : ''}</li>)}</ul>
          )}
        </div>
      ))}
    </Card>
  )
}

export function Support() {
  return (
    <div className="page">
      <header className="page-head"><div><h1>Support</h1><p className="muted">Open a business as its owner, only when the owner has asked.</p></div></header>
      <SupportRequests />
    </div>
  )
}
