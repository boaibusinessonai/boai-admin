import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Card, ErrorBox } from '../components/ui'
import { STAGE_NAME, type Stage } from '../lib/releases'
import { admin, releaseCall } from '../lib/supabase'
import { confirmed, pickStages, SYNC_PARTS as PARTS, SYNC_STAGES as STAGES, tickPart, type SyncPart as PartKey } from '../lib/syncSettings'
import { useLoad } from '../lib/useLoad'

// Releases › Sync settings (SYNCSET, owner OK 2026-11-25, https://claude.ai/artifact/9uf7smp5EnjVXMpRnqjaTW), PROD Admin
// only: the To stage becomes the same as the From stage for the parts ticked (release-settings). Show what will change
// first, then type the To stage. Into PROD also a reason; PROD's settings are saved first and one Undo puts them back.

type PartPlan = { key: PartKey; name: string; added: number; changed: number; removed: number; kept: number; skipped: number; examples: string[]; problem: string | null }
type LastCopy = { at: string; from: string; by: string; reason: string; parts: PartKey[] }
type Plan = { parts: PartPlan[] }
type Result = { parts: PartPlan[]; summary: string }

const when = (at: string) => new Date(at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

export function SyncSettings({ onEnded, phoneCode }: { onEnded: () => void; phoneCode: boolean }) {
  const [from, setFrom] = useState<Stage>('build')
  const [to, setTo] = useState<Stage>('sit')
  const [parts, setParts] = useState<PartKey[]>(PARTS.map(([key]) => key))
  const [plan, setPlan] = useState<{ key: string; at: string; answer: Plan } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [typed, setTyped] = useState('')
  const [reason, setReason] = useState('')
  const [code, setCode] = useState('')
  const [codeNote, setCodeNote] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [undoing, setUndoing] = useState(false)
  const last = useLoad(() => admin<{ last: LastCopy | null }>('release_settings_last'), 'release_settings_last')

  const pick = `${from}|${to}|${parts.join(',')}`
  const fresh = plan?.key === pick ? plan : null
  const intoProd = to === 'prod'
  const toName = STAGE_NAME[to]
  const route = `${STAGE_NAME[from]} → ${toName}`
  const refused = fresh?.answer.parts.filter((p) => p.problem) ?? []
  const changes = fresh?.answer.parts.reduce((n, p) => n + p.added + p.changed + p.removed, 0) ?? 0
  const canCopy = !!fresh && !busy && !refused.length && changes > 0 && confirmed(typed, to)
    && (!intoProd || reason.trim().length >= 3) && (!intoProd || !phoneCode || code.replace(/\s/g, '').length >= 6)

  const choose = (next: { from?: Stage; to?: Stage }) => {
    const picked = pickStages(next.from ?? from, next.to ?? to)
    setFrom(picked.from); setTo(picked.to); setTyped(''); setDone(null); setError('')
  }
  const tick = (key: PartKey, on: boolean) => { setParts((list) => tickPart(list, key, on)); setDone(null) }

  const check = async () => {
    setBusy(true); setError(''); setDone(null)
    try {
      const answer = await releaseCall<Plan>('release-settings', { from, target: to, mode: 'plan', parts })
      setPlan({ key: pick, at: new Date().toISOString(), answer })
    } catch (e) { setError(message(e, 'Not read.')) }
    setBusy(false)
  }

  const sendCode = async () => {
    setSending(true); setCodeNote(null)
    try { await admin('release_code', { target: 'prod' }); setCodeNote('Code sent to your phone. It is good for 10 minutes.') } catch (e) { setCodeNote(message(e, 'The code was not sent.')) }
    setSending(false)
  }
  /** The PROD code window (only while the phone code switch is on). */
  const codeOk = async (): Promise<boolean> => {
    if (!phoneCode) return true
    try {
      const answer = await admin<{ ok: boolean; left?: number }>('release_code_check', { target: 'prod', code: code.replace(/\s/g, '') })
      if (!answer.ok) { setCodeNote(`Wrong code. ${answer.left ?? 0} ${answer.left === 1 ? 'try' : 'tries'} left.`); return false }
      return true
    } catch (e) { setCodeNote(message(e, 'The code was not checked.')); return false }
  }

  const copy = async () => {
    if (intoProd && !(await codeOk())) return
    const why = intoProd ? reason.trim() : `Sync settings ${route}`
    setBusy(true); setError('')
    try {
      const result = await releaseCall<Result>('release-settings', { from, target: to, mode: 'apply', parts, reason: why })
      setDone(result.summary)
      await admin('release_done', { target: to, from, settings: true, ok: true, migrations: 0, functions: 'none', data: result.summary.slice(0, 300), reason: why }).catch(() => {})
      setPlan(null); setTyped(''); setReason(''); setCode('')
    } catch (e) {
      setError(`Not copied: ${message(e, 'it did not answer.')} Nothing changed on ${toName}.`)
      await admin('release_done', { target: to, from, settings: true, ok: false, migrations: 0, functions: 'none', message: message(e, 'failed').slice(0, 500), reason: why }).catch(() => {})
    }
    setBusy(false)
    onEnded(); last.reload()
  }

  const undo = async (why: string) => {
    if (!(await codeOk())) throw new Error(codeNote ?? 'Type the code sent to your phone first.')
    const result = await releaseCall<Result>('release-settings', { target: 'prod', mode: 'undo', reason: why })
    setDone(result.summary)
    await admin('release_done', { target: 'prod', from: 'prod', settings: true, ok: true, migrations: 0, functions: 'none', data: result.summary.slice(0, 300), reason: why }).catch(() => {})
    setPlan(null)
    onEnded(); last.reload()
  }

  const codeBox = <div className="release-code">
    <label className="field"><span>Code sent to your phone (Admin alerts)</span><input value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={7} onChange={(e) => setCode(e.target.value)} /></label>
    <button type="button" className="button" disabled={sending} onClick={() => void sendCode()}>{sending ? 'Sending…' : 'Send code to my phone'}</button>
    {codeNote && <span className="sub">{codeNote}</span>}
  </div>

  return (
    <>
      <Card title="Copy settings from one stage to another">
        <p className="sub">The To stage becomes the same as the From stage for the parts you tick. Customers' own data is never copied.</p>
        <div className="sync-stages">
          <label className="field"><span>From</span>
            <select value={from} onChange={(e) => choose({ from: e.target.value as Stage })}>{STAGES.map((s) => <option key={s} value={s}>{STAGE_NAME[s]}</option>)}</select>
          </label>
          <span className="sync-arrow" aria-hidden="true">→</span>
          <label className="field"><span>To</span>
            <select value={to} onChange={(e) => choose({ to: e.target.value as Stage })}>{STAGES.filter((s) => s !== from).map((s) => <option key={s} value={s}>{STAGE_NAME[s]}</option>)}</select>
          </label>
          <span className="sub">Any stage to any stage · never the same one</span>
        </div>
        <fieldset className="sync-parts">
          <legend className="sub">What to copy</legend>
          {PARTS.map(([key, name]) => <label key={key} className={`release-pick${parts.includes(key) ? ' is-on' : ''}`}>
            <input type="checkbox" checked={parts.includes(key)} onChange={(e) => tick(key, e.target.checked)} /> {name}
          </label>)}
        </fieldset>
        <div className="release-moves">
          <button type="button" className="button primary" disabled={busy || !parts.length} onClick={() => void check()}>{busy && !fresh ? 'Reading…' : 'Show what will change'}</button>
        </div>
        {error && <ErrorBox message={error} />}
        {done && <p><Badge tone="good">Done</Badge> {done} Saved in History.</p>}
      </Card>

      {fresh && <Card title={`What will change on ${toName}`} action={<span className="sub">Read from {STAGE_NAME[from]} and {toName} at {when(fresh.at)} · nothing changed yet</span>}>
        <div className="table-wrap"><table className="table sync-table">
          <thead><tr><th>Part</th><th>Added</th><th>Changed</th><th>Removed</th><th>Kept, hidden</th></tr></thead>
          <tbody>{fresh.answer.parts.map((p) => p.problem
            ? <tr key={p.key}><td><b>{p.name}</b></td><td colSpan={4}><Badge tone="critical">Refused</Badge> <span className="sub">{p.problem}</span></td></tr>
            : <tr key={p.key}><td>
                {p.examples.length ? <details><summary><b>{p.name}</b></summary><ul className="release-list">{p.examples.map((line, i) => <li key={i} className={line.startsWith('Kept') ? 'sync-kept' : ''}>{line}</li>)}</ul></details> : <b>{p.name}</b>}
                {p.skipped > 0 && <span className="sub"> {p.skipped} skipped: their business type is not on {toName}</span>}
              </td>
              <td>{p.added}</td><td>{p.added + p.changed + p.removed ? p.changed : <span className="sub">same</span>}</td><td>{p.removed}</td>
              <td>{p.kept ? <span className="sync-kept">{p.kept}</span> : '–'}</td></tr>)}</tbody>
        </table></div>
        <p className="sub">Never copied: customers, their plans, gifts, deals, packages and store switches.</p>
        {refused.length > 0 && <p className="sub">Untick the refused {refused.length === 1 ? 'part' : 'parts'} (or move the code to {toName} first), then show what will change again.</p>}
        {!refused.length && !changes && <p>{toName} already has the same settings for these parts.</p>}
        {!refused.length && changes > 0 && <div className="release-approve">
          {intoProd && <div className="notice warning">PROD is the live app for real customers. PROD's settings now are saved first; one Undo puts them back.</div>}
          {intoProd && <label className="field"><span>Why (written in History)</span><input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></label>}
          <label className="field sync-type"><span>Type {toName} to confirm</span><input value={typed} onChange={(e) => setTyped(e.target.value)} /></label>
          {intoProd && phoneCode && codeBox}
          <button type="button" className={`button ${intoProd ? 'danger' : 'primary'}`} disabled={!canCopy} onClick={() => void copy()}>{busy ? 'Copying…' : `Copy ${route}`}</button>
          <span className="sub">Saved in the History of both stages: who, when, what.</span>
        </div>}
      </Card>}

      {last.data?.last && <Card title="Last copy into PROD" action={<button type="button" className="button" onClick={() => setUndoing(true)}>Undo</button>}>
        <p className="sub">{when(last.data.last.at)} · {last.data.last.from} → PROD · by {last.data.last.by} · “{last.data.last.reason}” · backup kept</p>
      </Card>}
      {last.error && <ErrorBox message={last.error} onRetry={last.reload} />}
      {undoing && last.data?.last && <ConfirmDialog title="Put PROD's settings back?" action="Undo" danger onDone={undo} onClose={() => setUndoing(false)}>
        <p>PROD's {last.data.last.parts.map((k) => PARTS.find(([p]) => p === k)?.[1] ?? k).join(', ')} go back to how they were before {when(last.data.last.at)}. The backup is used up.</p>
        {phoneCode && codeBox}
      </ConfirmDialog>}
    </>
  )
}
