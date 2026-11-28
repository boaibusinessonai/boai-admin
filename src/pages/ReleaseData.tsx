import { useState } from 'react'
import { Badge, Card, ErrorBox } from '../components/ui'
import { STAGE_NAME, type BackupRound, type Move, type Target } from '../lib/releases'
import { admin, releaseCall } from '../lib/supabase'

// Admin › Releases › Regular updates: data copies (DATA-1/2, owner OK 2026-11-23, https://claude.ai/artifact/CC9GQaZjXBHoCrWXrZYKkk).
// "6 · Data (optional)" under a move copies this stage's data UP to the next stage (as it is, sign-ins, pictures).
// "Copy masked data down" (PROD Admin only) copies PROD's data DOWN to UAT or SIT, masked and cut down to whole businesses.
// Both call release-data: Check = plan; Copy = apply rounds (start, then go on while done:false). The copy waits on the other
// stage, so a closed page goes on with "Go on". The end goes in History (admin.release_done with data).

type Counts = { businesses: number; logins: number; rows: number; files: number }
type Waiting = { run: string; kind: 'up' | 'down'; started: string; by: string; loaded: number; total: number; filesLeft: number }
type Business = { id: string; name: string; kind: string | null }
type DataPlan = { kind: 'up' | 'down'; problems: string[]; here: Counts; there: Counts; waiting: Waiting | null; businesses: Business[]; words: string[] }
type DataRound = { done: boolean; phase: string; loaded: number; total: number; filesLeft: number; rows: number; summary?: string }
type Pick = { businesses?: string[]; sample?: number }

const n = (v: number) => v.toLocaleString('en-IN')
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Copy up, under the move to the next stage. `here` = this stage's name (written in the other Admin's History). */
export function DataUpCard({ move, here, onEnded }: { move: Move; here: string; onEnded: () => void }) {
  return <DataCopy kind="up" target={move.to} here={here} onEnded={onEnded} title="6 · Data (optional)" />
}

/** Copy down: only in the PROD Admin, into UAT or SIT. */
export function DataDownCard({ onEnded }: { onEnded: () => void }) {
  const [target, setTarget] = useState<Target>('uat')
  return <>
    <DataCopy key={target} kind="down" target={target} here="PROD" onEnded={onEnded} title="Copy masked data down"
      pickTarget={<div className="release-moves">{(['uat', 'sit'] as const).map((t) => (
        <button key={t} type="button" className={`button${target === t ? ' primary' : ''}`} onClick={() => setTarget(t)}>PROD → {STAGE_NAME[t]}</button>))}</div>} />
  </>
}

function DataCopy({ kind, target, here, onEnded, title, pickTarget }: { kind: 'up' | 'down'; target: Target; here: string; onEnded: () => void; title: string; pickTarget?: React.ReactNode }) {
  const to = STAGE_NAME[target]
  const needsCode = kind === 'down' || target === 'prod'
  const [plan, setPlan] = useState<DataPlan | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [help, setHelp] = useState(false)
  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')
  const [code, setCode] = useState('')
  const [codeNote, setCodeNote] = useState<string | null>(null)
  const [how, setHow] = useState<'all' | 'sample' | 'picked'>('all')
  const [sample, setSample] = useState(20)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<DataRound | null>(null)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const check = async () => {
    setChecking(true); setError(null); setDone(null)
    try { setPlan(await releaseCall<DataPlan>('release-data', { target, mode: 'plan', kind })) } catch (e) { setPlan(null); setError(e instanceof Error ? e.message : 'The check did not run.') }
    setChecking(false)
  }

  const sendCode = async () => {
    setCodeNote(null)
    try { await admin('release_code', { target: 'prod' }); setCodeNote('Code sent to your phone. It is good for 10 minutes.') } catch (e) { setCodeNote(e instanceof Error ? e.message : 'The code was not sent.') }
  }

  /** start = a fresh copy; else go on with the one waiting on the other stage. */
  const copy = async (start: boolean) => {
    const why = reason.trim()
    setRunning(true); setError(null); setDone(null)
    try {
      if (needsCode) {
        const answer = await admin<{ ok: boolean; left?: number }>('release_code_check', { target: 'prod', code: code.replace(/\s/g, '') })
        if (!answer.ok) { setCodeNote(`Wrong code. ${answer.left ?? 0} ${answer.left === 1 ? 'try' : 'tries'} left.`); setRunning(false); return }
      }
      // A copy up into PROD backs PROD's data up first (as every PROD move does).
      if (start && kind === 'up' && target === 'prod') {
        let state: unknown = null
        for (;;) {
          const round = await releaseCall<BackupRound>('release-sql', { target, mode: 'apply', part: 'backup', reason: why, state })
          state = round.state
          if (round.done) break
          await sleep(300)
        }
      }
      const pick: Pick | undefined = kind === 'down' ? (how === 'sample' ? { sample } : how === 'picked' ? { businesses: [...picked] } : {}) : undefined
      let first = start
      for (;;) {
        const round = await releaseCall<DataRound>('release-data', { target, mode: 'apply', kind, reason: why, ...(first ? { start: true, from: here, ...(pick ? { pick } : {}) } : {}) })
        first = false
        setProgress(round)
        if (round.done) { setDone(round.summary ?? 'Copied.'); await admin('release_done', { target, ok: true, migrations: 0, functions: 'none', reason: why, data: round.summary ?? 'Data copied' }); break }
        await sleep(300)
      }
      setPlan(null)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'The copy stopped.'
      setError(`Stopped: ${message} ${to}'s data is as it was; press Check, then Go on or Start again.`)
      await admin('release_done', { target, ok: false, migrations: 0, functions: 'none', reason: why || 'data copy', message: message.slice(0, 480), data: 'Data copy stopped' }).catch(() => {})
    }
    setRunning(false); onEnded()
  }

  const cancel = async () => {
    setRunning(true); setError(null)
    try { await releaseCall('release-data', { target, mode: 'apply', kind, reason: reason.trim() || 'start the data copy again', cancel: true }); await check() } catch (e) { setError(e instanceof Error ? e.message : 'Not thrown away.') }
    setRunning(false)
  }

  const kinds = plan ? [...new Set(plan.businesses.map((b) => b.kind ?? 'Other'))] : []
  const ready = Boolean(plan) && !plan!.problems.length && reason.trim().length >= 3 && typed.trim().toUpperCase() === to.toUpperCase() &&
    (!needsCode || code.replace(/\s/g, '').length >= 6) && (how !== 'picked' || picked.size > 0) && !running
  const bar = progress ? Math.round((progress.loaded / Math.max(1, progress.total)) * 100) : 0

  return (
    <Card title={title} action={<span className="release-moves">
      <button type="button" className="button" onClick={() => setHelp(!help)} aria-expanded={help}>? How to copy data</button>
      <button type="button" className="button" disabled={checking || running} onClick={check}>{checking ? 'Checking…' : 'Check'}</button></span>}>
      {pickTarget}
      <p className="sub">{kind === 'up'
        ? `Copies this stage's shops, sign-ins and pictures to ${to}. ${to}'s shop data is replaced. ${to}'s Admin logins, keys and history stay. Nothing is copied unless you start it here.`
        : `Copies PROD's businesses to ${to} with names, phones, emails, IDs and addresses masked. No sign-ins, no pictures. ${to}'s Admin, plans and test logins (…@boai.test) stay.`}</p>
      {help && <HowTo kind={kind} to={to} />}
      {error && <ErrorBox message={error} />}
      {done && <p><Badge tone="good">✓ Done</Badge> {done}</p>}
      {plan && <>
        {plan.problems.map((p) => <ErrorBox key={p} message={p} />)}
        <div className="table-wrap"><table className="table">
          <thead><tr><th></th><th>Here</th><th>{to} now</th></tr></thead>
          <tbody>
            <tr><td>Businesses</td><td>{n(plan.here.businesses)}</td><td>{n(plan.there.businesses)}</td></tr>
            <tr><td>Sign-ins</td><td>{kind === 'up' ? n(plan.here.logins) : 'not copied'}</td><td>{n(plan.there.logins)}</td></tr>
            <tr><td>Rows (all tables)</td><td>{n(plan.here.rows)}</td><td>{n(plan.there.rows)}</td></tr>
            <tr><td>Pictures</td><td>{kind === 'up' ? `${n(plan.here.files)} files` : 'not copied'}</td><td>{n(plan.there.files)} files</td></tr>
          </tbody>
        </table></div>
        <ul className="release-words">{plan.words.map((w) => <li key={w}>{w}</li>)}</ul>
        {plan.waiting && <div className="release-part">
          <b>A copy is waiting on {to}</b>
          <p className="sub">Started {new Date(plan.waiting.started).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} by {plan.waiting.by}: {plan.waiting.loaded} of {plan.waiting.total} tables loaded{plan.waiting.filesLeft ? `, ${plan.waiting.filesLeft} pictures left` : ''}. {to} still runs on its old data.</p>
          {plan.waiting.kind === kind && <button type="button" className="button primary" disabled={running || reason.trim().length < 3 || (needsCode && code.replace(/\s/g, '').length < 6)} onClick={() => void copy(false)}>Go on</button>}{' '}
          <button type="button" className="button" disabled={running} onClick={() => void cancel()}>Start again</button>
        </div>}
        {kind === 'down' && !plan.problems.length && <fieldset className="release-part">
          <legend><b>Which businesses</b></legend>
          <label><input type="radio" name="how" checked={how === 'all'} onChange={() => setHow('all')} /> All {n(plan.businesses.length)}</label><br />
          <label><input type="radio" name="how" checked={how === 'sample'} onChange={() => setHow('sample')} /> A sample: the newest </label>
          <input type="number" min={1} max={1000} value={sample} aria-label="How many per business kind" style={{ width: '5em' }} onChange={(e) => setSample(Math.max(1, Number(e.target.value) || 1))} /> per business kind ({kinds.length} kinds)<br />
          <label><input type="radio" name="how" checked={how === 'picked'} onChange={() => setHow('picked')} /> Picked by hand ({picked.size})</label>
          {how === 'picked' && <div className="table-wrap" style={{ maxHeight: '16rem', overflow: 'auto' }}><table className="table"><tbody>
            {plan.businesses.map((b) => <tr key={b.id}><td><label><input type="checkbox" checked={picked.has(b.id)} onChange={(e) => {
              const next = new Set(picked); if (e.target.checked) next.add(b.id); else next.delete(b.id); setPicked(next)
            }} /> {b.name}</label></td><td className="sub">{b.kind ?? ''}</td></tr>)}
          </tbody></table></div>}
        </fieldset>}
        {!plan.problems.length && <div className="release-approve">
          <label className="field"><span>Why this copy (goes in History)</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} /></label>
          <label className="field"><span>Type {to} to copy</span><input value={typed} onChange={(e) => setTyped(e.target.value)} /></label>
          {needsCode && <div className="release-code">
            <label className="field"><span>Code sent to your phone (Admin alerts)</span><input value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={7} onChange={(e) => setCode(e.target.value)} /></label>
            <button type="button" className="button" onClick={() => void sendCode()}>Send code to my phone</button>
            {codeNote && <span className="sub">{codeNote}</span>}
          </div>}
          <button type="button" className="button primary" disabled={!ready} onClick={() => void copy(true)}>{kind === 'up' ? `Copy data to ${to}` : `Copy masked data to ${to}`}</button>
        </div>}
      </>}
      {running && progress && <>
        <div className="setup-bar" aria-hidden="true"><i style={{ width: `${bar}%` }} /></div>
        <p className="sub">{progress.phase === 'files' ? `Copying pictures… ${progress.filesLeft} left.` : progress.phase === 'switch' ? 'Switching the data in…' : `Copying… ${progress.loaded} of ${progress.total} tables, ${n(progress.rows)} rows.`} You can close this page; press Check, then Go on.</p>
      </>}
      {running && !progress && <p className="sub">Starting…</p>}
    </Card>
  )
}

/** "? How to copy data" (DATA-3): before, what comes and stays, after, undo. */
function HowTo({ kind, to }: { kind: 'up' | 'down'; to: string }) {
  return <div className="release-part">
    <b>Before you start</b>
    <ul className="release-words">
      <li>Move the code first: both stages must be on the same version (the Check says so).</li>
      <li>Copy at a quiet time: bills made while it copies may come only half.</li>
      {kind === 'up' ? <li>Copying up into PROD works only before the first paying customer; PROD's data is backed up first.</li>
        : <li>The copy starts in PROD, so it asks the code sent to your phone.</li>}
    </ul>
    <b>What comes, what stays</b>
    <ul className="release-words">
      {kind === 'up' ? <li>Comes: every shop, item, bill, payment, stock line, staff, plan and price; sign-ins (same passwords); pictures.</li>
        : <li>Comes: the businesses you pick, whole, with names, phones, emails, GST, PAN, UPI, IDs and addresses replaced. Amounts, dates, items and stock stay real.</li>}
      <li>Stays on {to}: its Admin logins, keys, History, timed jobs{kind === 'down' ? ', plans, ready lists and test logins (…@boai.test) with their shops' : ''}.</li>
      <li>Emptied on {to}: the send queue, sign-in sessions (everyone signs in again), WhatsApp, Razorpay, e-invoice, Google and Facebook links.</li>
    </ul>
    <b>After the copy</b>
    <ul className="release-words">
      <li>Open {to}'s website: sign in{kind === 'up' ? ' with a test login' : ' to its Admin'}, open one shop, one bill{kind === 'up' ? ', one picture' : ''}.</li>
      <li>{to}'s Admin › Releases › History shows a line "copied in".</li>
    </ul>
    <b>Undo</b>
    <ul className="release-words">
      <li>Copy again from the stage before{kind === 'up' ? '; on PROD the backup made first is kept (newest 3)' : ''}.</li>
      <li>Old database with no button (the first move from the old app): the tech team uses the Mac tool agent/tools/data-move.</li>
    </ul>
  </div>
}
