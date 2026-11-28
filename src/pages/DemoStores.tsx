import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Card, ErrorBox, Loading } from '../components/ui'
import { admin, testData } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'
import { ALWAYS_BLOCKED, demoParts, hourWords, STATE_WORDS } from '../lib/publicSite'

// Data › Demo stores (DEMO-1, owner 2026-11-26, board AdminDemo): the stores visitors open from the landing page, already
// signed in. One row per kind: state, days of past bills, last reset, On the landing, Open · Reset now · Remake…; the night
// reset (hour, days of bills); the fixed list of what a demo never does. Made only on the stage the public website uses:
// elsewhere (BOAI Build) the database refuses Make, Reset and Remake with the never-on-Build words.

type Row = { kind: string; name: string; state: 'making' | 'ready' | 'failed'; problem?: string; billDays?: number; onLanding: boolean; email?: string; madeAt?: string; lastResetAt?: string }
type Data = { stores: Row[]; settings: { resetHour: number; billDays: number; allowedHere: boolean }; kinds: { key: string; name: string }[] }
type Pending = { title: string; words: string; danger?: boolean; run: (reason: string) => Promise<unknown> }

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')

export function DemoStores({ role }: { role: string }) {
  const { data, error, reload } = useLoad(() => admin<Data>('demo_stores'), 'demo_stores')
  const [pending, setPending] = useState<Pending | null>(null)
  const [adding, setAdding] = useState('')
  const [night, setNight] = useState<{ resetHour: number; billDays: number } | null>(null)
  const [opening, setOpening] = useState('')
  if (error) return <div className="page"><ErrorBox message={error} onRetry={reload} /></div>
  if (!data) return <Loading />
  const owner = role === 'owner'
  const nameOf = (kind: string) => data.kinds.find((k) => k.key === kind)?.name ?? kind
  const shown = night ?? { resetHour: data.settings.resetHour, billDays: data.settings.billDays }
  const make = (kind: string, again: boolean) => setPending({
    title: again ? `Make the demo ${nameOf(kind)} again?` : `Make a demo ${nameOf(kind)}?`,
    words: again ? 'It is removed and made again: a new sign-in, fresh data and bills.' : 'A business with roles only for names, its kind’s pages and past bills, signed in from the landing card.',
    danger: again,
    run: (reason) => testData({ action: 'demo_make', kind, name: `Demo ${nameOf(kind)}`, parts: demoParts(kind), reason }),
  })
  // Open: the store in the website, signed in as its Owner (a new tab): the landing's own card opens it the same way.
  const open = async (kind: string) => {
    setOpening(kind)
    const site = window.location.hostname.includes('-admin') ? `${window.location.protocol}//${window.location.host.replace('-admin', '')}/` : '/'
    window.open(`${site}#/?pick=explore&open=${encodeURIComponent(kind)}`, '_blank', 'noopener')
    setOpening('')
  }
  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Demo stores</h1><p className="muted">The stores visitors open from the landing page, already signed in. Roles only for names. Nothing goes out. Never on BOAI Build.</p></div>
      </header>
      {!data.settings.allowedHere && <p className="callout">This stage is not set for demo stores (BOAI Build never is): Make, Reset and Remake are refused here. The landing shows the kinds greyed “Demo coming soon”.</p>}

      <Card title="Stores" action={owner && (
        <span className="site-add">
          <select value={adding} onChange={(event) => setAdding(event.target.value)} aria-label="Add a kind">
            <option value="">Add a kind…</option>
            {data.kinds.filter((k) => !data.stores.some((s) => s.kind === k.key)).map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
          </select>
          <button type="button" className="button small primary" disabled={!adding} onClick={() => make(adding, false)}>Make demo store…</button>
        </span>
      )}>
        {data.stores.length === 0 ? <p className="muted">No demo stores on this stage.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Kind</th><th>State</th><th>Past bills</th><th>Last reset</th><th>On the landing</th><th /></tr></thead>
              <tbody>
                {data.stores.map((row) => (
                  <tr key={row.kind}>
                    <td><strong>{row.name || nameOf(row.kind)}</strong></td>
                    <td><Badge tone={row.state === 'ready' ? 'good' : row.state === 'failed' ? 'critical' : 'warning'}>{STATE_WORDS[row.state] ?? row.state}</Badge>{row.problem && <span className="sub">{row.problem}</span>}</td>
                    <td>{row.billDays ? `${row.billDays} days` : '—'}</td>
                    <td className="muted">{when(row.lastResetAt)}</td>
                    <td>
                      <label className="field inline"><input type="checkbox" disabled={!owner} checked={row.onLanding}
                        onChange={(event) => { const on = event.target.checked; setPending({ title: on ? 'Show this card on the landing?' : 'Take this card off the landing?', words: 'Off = the card on the landing page goes to More businesses; the store is kept.', run: (reason) => admin('demo_action', { kind: row.kind, action: on ? 'on' : 'off', reason }) }) }} />
                        <span>{row.onLanding ? 'On' : 'Off'}</span></label>
                    </td>
                    <td className="row-actions">
                      <button type="button" className="button small" disabled={row.state !== 'ready' || opening === row.kind} onClick={() => void open(row.kind)}>Open</button>
                      {owner && <button type="button" className="button small" onClick={() => setPending({ title: 'Reset this demo store now?', words: 'Back to its made state, bills moved up to today; what visitors changed goes.', run: (reason) => admin('demo_action', { kind: row.kind, action: 'reset', reason }) })}>Reset now</button>}
                      {owner && <button type="button" className="button small" onClick={() => make(row.kind, true)}>Remake…</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted">Off = the card on the landing page goes to More businesses; the store is kept.</p>
      </Card>

      <div className="site-two">
        <Card title="Every night">
          <div className="plan-form">
            <label className="field"><span>Reset all demo stores at</span>
              <select disabled={!owner} value={shown.resetHour} onChange={(event) => setNight({ ...shown, resetHour: Number(event.target.value) })}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourWords(h)}</option>)}
              </select></label>
            <label className="field"><span>Days of past bills after a reset</span><input disabled={!owner} type="number" min={1} max={60} value={shown.billDays} onChange={(event) => setNight({ ...shown, billDays: Number(event.target.value) })} /></label>
          </div>
          <p className="muted">Bills move forward with the date, so “today” always has sales.</p>
          {owner && <div className="dialog-actions"><button type="button" className="button" disabled={!night} onClick={() => setPending({ title: 'Save the night reset?', words: `Every night at ${hourWords(shown.resetHour)}, ${shown.billDays} days of past bills.`, run: async (reason) => { await admin('save_demo_settings', { ...shown, reason }); setNight(null) } })}>Save…</button></div>}
        </Card>
        <Card title="Always blocked in a demo (fixed)">
          <ul className="list">{ALWAYS_BLOCKED.map((line) => <li key={line}>✕ {line}</li>)}</ul>
          <p className="muted">Top strip in the store: Demo · nothing is sent · resets every night · Make this my store.</p>
        </Card>
      </div>

      {pending && <ConfirmDialog title={pending.title} action="Confirm" danger={pending.danger} onDone={async (reason) => { await pending.run(reason); reload() }} onClose={() => setPending(null)}><p>{pending.words}</p></ConfirmDialog>}
    </div>
  )
}
