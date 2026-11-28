import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Card, ErrorBox, Loading } from '../components/ui'
import { canGoBack, downloadNote, kindLabel, megabytes, onPhones, sendNote, type PhoneUpdate, type PhoneUpdates } from '../lib/phoneUpdates'
import { admin } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'

// Releases › Phone app updates (MOB-3, owner OK preview 2026-11-25): updates are made on the build computer and wait
// here; phones get one only when the owner presses Send to phones (a reason, audit + alert). Quiet updates download in
// the background; a new app file (APK) shows the phone's Update strip. Back to this sends an older quiet update again.
// Download (APKDL, owner 2026-11-25): the stage's newest app file and each waiting one, to install on a phone and test.

const when = (at?: string) => (at ? new Date(at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '')

export function PhoneUpdatesCard() {
  const state = useLoad(() => admin<PhoneUpdates>('phone_updates'), 'phone_updates')
  const [asking, setAsking] = useState<{ update: PhoneUpdate; back: boolean } | null>(null)
  const send = async (reason: string) => { await admin('send_phone_update', { id: asking!.update.id, reason }); state.reload() }
  const now = state.data ? onPhones(state.data) : null
  return (
    <Card title={<>Phone app updates {state.data && <Badge tone={now ? 'good' : 'warning'}>{now ? `On phones: ${now}` : 'Nothing sent yet'}</Badge>}</>}>
      <p className="sub">An update is made on the build computer and waits here. Phones get it only when you press Send to phones:
        they download it quietly and switch to it the next time the app opens, then show "Updated to …" once.</p>
      {state.error ? <ErrorBox message={state.error} onRetry={state.reload} /> : !state.data ? <Loading /> : <>
        {state.data.download && <div className="phone-download">
          <a className="button" href={state.data.download.url} download>Download app file (APK)</a>
          <p className="sub">{downloadNote(state.data.download)}</p>
        </div>}
        {state.data.waiting.length ? state.data.waiting.map((u) => (
          <div key={u.id} className={`phone-update${u.kind === 'app' ? ' is-app' : ''}`}>
            <div>
              <strong>Waiting: {u.version}</strong> {u.kind === 'app' && <Badge tone="warning">Needs new app file</Badge>}
              <p className="sub">Made {when(u.madeAt)}{u.note ? ` · ${u.note}` : ''}{u.size ? ` · ${megabytes(u.size)}` : ''}</p>
            </div>
            <div className="phone-update-actions">
              {u.kind === 'app' && u.url && <a className="button" href={u.url} download>Download</a>}
              <button type="button" className="button primary" onClick={() => setAsking({ update: u, back: false })}>Send to phones</button>
            </div>
          </div>
        )) : <p className="sub">Nothing waiting.</p>}
        {state.data.sent.length > 0 && <div className="table-wrap"><table className="table">
          <thead><tr><th>Version</th><th>Sent</th><th>By</th><th>Kind</th><th>What changed</th><th></th></tr></thead>
          <tbody>{state.data.sent.map((u) => (
            <tr key={`${u.id}-${u.sentAt}`}>
              <td>{u.version}</td><td>{when(u.sentAt)}</td><td>{u.sentBy ?? ''}</td><td>{kindLabel(u)}</td><td>{u.note ?? ''}</td>
              <td>{canGoBack(u, state.data!) && <button type="button" className="button small" onClick={() => setAsking({ update: u, back: true })}>Back to this</button>}</td>
            </tr>))}
          </tbody>
        </table></div>}
      </>}
      {asking && <ConfirmDialog title={asking.back ? `Send ${asking.update.version} to phones again?` : `Send ${asking.update.version} to phones?`}
        action="Send to phones" onDone={send} onClose={() => setAsking(null)}>
        <p>{sendNote(asking.update)}</p>
      </ConfirmDialog>}
    </Card>
  )
}
