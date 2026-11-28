import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PhoneUpdatesCard } from './PhoneUpdates'
import { SyncSettings } from './SyncSettings'
import { syncHistoryLabel } from '../lib/syncSettings'
import { Badge, Card, ErrorBox, Loading } from '../components/ui'
import { addRound, confirmOk, moveParts, MOVES, notConnected, PART_FN, partBody, PARTS, partSame, planBlock, putBack, shortOf, STAGE_NAME, stageOf, moveFrom, isTower, fromBody, runTo, moveLabel, CODES, codeParts, type Code, type ApplyAnswer, type BackupPlan, type BackupRound, type Move, type FunctionsPlan, type FunctionsRound, type Part, type PhonePlan, type PhoneRound, moveSteps, type PlanAnswer, type RepoPlan, type RepoRound, type SitePlan, type SiteRound } from '../lib/releases'
import { ACTION_PART, canRun, isCheck, openIndex, RUNS_FROM, runNote, setupFor, setupSteps, ticksOf, type SetupStage, type Step, type Tick } from '../lib/releaseSetup'
import { admin, AdminError, releaseCall, stageName, supabaseUrl } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'
import { lastChange, LOWER, ownMoveHistoryLabel, ownMoveShown, rowName, type OwnMove, type OwnState } from '../lib/ownMove'

// Admin › Releases (V90, PROD S3), owner only. Code moves one way: Build → DEV → SIT → UAT → PROD, one stage at a time.
// CHAIN-1 (owner OK v10 2026-11-23): each Admin knows its layer and shows only its one move, to the next layer. The data
// copy cards (DATA-2, ReleaseData.tsx) are not shown for now: owner 'no data moves now'; their code stays.
// Check = release-sql plan (read only); Approve and start = release-sql apply, called again while it says done:false;
// each round ticks its migrations. Two tabs (V121): First setup (step list per stage) and Regular updates (the moves). A failure stops the move and says why (what ran before it stays). The end is logged
// (admin.release_done) and listed under History. Steps 2-3 (code to the repo, website) since V91.
// V135 (PROD S10): a PROD move asks a code sent to the owner's phone, backs PROD's data up first, and puts the old
// website(s) back when a later step fails.

const HERE = stageOf(supabaseUrl, stageName)
// TOWER-1 (owner 2026-11-24): the PROD Admin runs every move (Build → DEV → SIT → UAT → PROD), each hop or one run.
const TOWER = isTower(HERE)
type History = { moves: { at: string; by: string; target: string; from?: string | null; only?: string | null; reason: string | null; ok: boolean; migrations: number; functions: string; repo: string | null; site: string | null; message: string | null; backup?: string | null; rolledBack?: boolean; data?: string | null; incoming?: boolean; settings?: boolean; ownMove?: boolean | null }[] }
type Run = { state: 'running' | 'done' | 'failed'; applied: string[]; functions: ApplyAnswer['functions']; rounds: number; message?: string }

// CONN-1 (owner OK v11): First setup shows only this Admin's next layer, and the tab goes once that setup is done.
const SETUP = setupFor(HERE)
// OWNMOVE (owner OK 2026-11-25): a lower Admin's own move (Send code → next, First setup) shows only while PROD turned it on.
const OWN_ASKS = !TOWER && Boolean(moveFrom(HERE))
type OwnLoad = { data?: OwnState | null; loading: boolean }

export function Releases() {
  const own = useLoad(() => (OWN_ASKS ? admin<OwnState>('release_own_move_state') : Promise.resolve(null)), 'release_own_move')
  const ownOn = ownMoveShown(HERE, own.data)
  const setup = useLoad(() => (SETUP ? admin<{ steps: Tick[] }>('release_setup') : Promise.resolve(null)), 'release_setup_tab')
  const finished = SETUP && setup.data ? openIndex(setupSteps(SETUP), ticksOf(setup.data.steps, SETUP)) === -1 : false
  const [tab, setTab] = useState<'setup' | 'updates'>(SETUP ? 'setup' : 'updates')
  const on = SETUP && ownOn && !finished ? tab : 'updates'
  return (
    <div className="page releases">
      {SETUP && ownOn && !finished && <div className="tabs" role="tablist">
        {([['setup', `First setup · ${STAGE_NAME[SETUP]}`], ['updates', 'Regular updates']] as const).map(([key, name]) => (
          <button type="button" role="tab" key={key} aria-selected={on === key} className={`tab ${on === key ? 'is-on' : ''}`} onClick={() => setTab(key)}>{name}</button>))}
      </div>}
      {on === 'setup' && SETUP ? <FirstSetup stage={SETUP} /> : <Updates own={own} />}
    </div>
  )
}

// First setup (V121): a numbered step list per stage, in order; ticks saved with who and when (admin.release_step).
function FirstSetup({ stage }: { stage: SetupStage }) {
  const setup = useLoad(() => admin<{ steps: Tick[] }>('release_setup'), 'release_setup')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opened, setOpened] = useState<string | null>(null)
  const [found, setFound] = useState<string | null>(null)
  if (setup.error) return <ErrorBox message={setup.error} onRetry={setup.reload} />
  if (!setup.data) return <Loading />
  const ticks = setup.data.steps

  const tick = async (step: Step, done: boolean) => {
    setBusy(step.key); setError(null)
    try { await admin('release_step', { stage, step: step.key, done }); setOpened(null); setup.reload() } catch (e) { setError(e instanceof Error ? e.message : 'Not saved.') }
    setBusy(null)
  }
  // Check now (database password, repo + token, website + key): that part's plan reaches the stage, or says why not.
  const reach = async (step: Step) => {
    setBusy(step.key); setError(null)
    try { await releaseCall(PART_FN[ACTION_PART[step.action!]], { target: stage, mode: 'plan', ...partBody(ACTION_PART[step.action!]) }); await tick(step, true) } catch (e) { setError(`Not green yet: ${e instanceof Error ? e.message : 'it did not answer.'}`) }
    setBusy(null)
  }

  // Clean start (V132): the plan lists an old app's leftovers; none = green at once, else show the exact SQL to copy or run.
  const look = async (step: Step) => {
    setBusy(step.key); setError(null); setFound(null)
    try {
      const answer = await releaseCall<{ clean?: { count: number; sql: string } }>('release-sql', { target: stage, mode: 'plan' })
      if (!answer.clean) setError('Not green yet: release-sql on this project is older than this page. Deploy it again, then Check now.')
      else if (answer.clean.count === 0) await tick(step, true)
      else setFound(answer.clean.sql)
    } catch (e) { setError(`Not green yet: ${e instanceof Error ? e.message : 'it did not answer.'}`) }
    setBusy(null)
  }
  // Runs from the reason dialog; a failure stays in the dialog (nothing removed: one transaction).
  const clean = async (step: Step, reason: string) => {
    await releaseCall('release-sql', { target: stage, mode: 'clean', reason, sql: found ?? '' })
    setFound(null); await tick(step, true)
  }

  const steps = setupSteps(stage)
  const done = ticksOf(ticks, stage)
  const open = openIndex(steps, done)
  const from = RUNS_FROM[stage]
  const move = MOVES.find((one) => one.to === stage)
  return (
    <Card title="First setup">
      <p className="sub">{STAGE_NAME[stage]} setup, run from this Admin ({STAGE_NAME[from]}). A step opens when the one before is done. Keys are never shown or saved here.{stage === 'prod' ? " PROD's keys are secrets of the UAT project, never on a computer." : ''}</p>
      <div className="setup-bar" aria-hidden="true"><i style={{ width: `${(done.size / steps.length) * 100}%` }} /></div>
      {error && <ErrorBox message={error} />}
      <ol className="setup-steps">
        {steps.map((step, i) => {
          const tickOf = done.get(step.key)
          const locked = !tickOf && i !== open
          const note = !tickOf && !locked ? runNote(step, stage, HERE) : null
          const runs = !tickOf && !locked && canRun(step, stage, HERE)
          return <li key={step.key} className={`setup-step${tickOf ? ' is-done' : ''}${locked ? ' is-locked' : ''}`}>
            {(i === 0 || steps[i - 1]!.group !== step.group) && <h3 className="setup-group">{step.group}</h3>}
            <div className="setup-row">
              <span className="setup-num">{tickOf ? '✓' : i + 1}</span>
              <div className="setup-what">
                <div><Badge tone={step.kind === 'you' ? 'warning' : step.kind === 'run' ? 'accent' : 'good'}>{step.kind === 'you' ? 'You' : step.kind === 'run' ? 'Button' : 'Check'}</Badge> <b>{step.title}</b></div>
                <span className="sub">{step.words}</span>
                {tickOf && <span className="sub setup-ok">✓ Done · {tickOf.by} · {new Date(tickOf.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
                {locked && <span className="sub">Opens after the step above.</span>}
                {note && <span className="sub">{note}</span>}
              </div>
              <div className="setup-acts">
                {tickOf && <button type="button" className="button" disabled={busy !== null} onClick={() => tick(step, false)}>Undo</button>}
                {runs && isCheck(step.action) && <button type="button" className="button primary" disabled={busy !== null} onClick={() => reach(step)}>{busy === step.key ? 'Checking…' : 'Check now'}</button>}
                {runs && step.action === 'clean' && <button type="button" className="button primary" disabled={busy !== null} onClick={() => look(step)}>{busy === step.key ? 'Checking…' : 'Check now'}</button>}
                {runs && step.action && step.action !== 'clean' && !isCheck(step.action) && <button type="button" className="button primary" onClick={() => setOpened(opened === step.key ? null : step.key)}>{opened === step.key ? 'Close' : 'Run'}</button>}
                {!tickOf && !locked && step.kind !== 'you' && !runs && <button type="button" className="button" disabled>Coming soon</button>}
                {!tickOf && !locked && (step.kind === 'you' || !runs) && <button type="button" className={`button${step.kind === 'you' ? ' primary' : ''}`} disabled={busy !== null} onClick={() => tick(step, true)}>{step.kind === 'you' ? 'Done' : 'Mark done'}</button>}
              </div>
            </div>
            {step.action === 'clean' && found && !tickOf && <CleanStart sql={found} onRun={(reason) => clean(step, reason)} />}
            {opened === step.key && step.action && step.action !== 'clean' && !isCheck(step.action) && move && <MoveCard move={move} parts={[ACTION_PART[step.action]]} onEnded={() => {}} onFinished={(ok) => { if (ok) void tick(step, true) }} />}
          </li>
        })}
      </ol>
      {open === -1 && <p>{STAGE_NAME[stage]} setup is done.{stage === 'sit' ? ' Next: UAT setup, from the SIT Admin.' : stage === 'uat' ? ' Next: PROD setup, from the UAT Admin.' : ''}</p>}
    </Card>
  )
}

// Clean start (V132): the exact script, a Copy button, and Remove them after a reason (all or nothing, one transaction).
function CleanStart({ sql, onRun }: { sql: string; onRun: (reason: string) => Promise<void> }) {
  const [asking, setAsking] = useState(false)
  const [copied, setCopied] = useState(false)
  const count = sql.split('\n').length - 2
  const copy = async () => { try { await navigator.clipboard.writeText(sql); setCopied(true) } catch { setCopied(false) } }
  return (
    <div className="setup-clean">
      <p><b>{count} old {count === 1 ? 'thing' : 'things'} found</b> in this project from an old app. This SQL removes them, all or nothing. Nothing of BOAI is in it.</p>
      <pre className="setup-sql">{sql}</pre>
      <div className="setup-acts">
        <button type="button" className="button" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy SQL'}</button>
        <button type="button" className="button danger" onClick={() => setAsking(true)}>Remove them</button>
      </div>
      <p className="sub">Or run the copied SQL in the SIT project's SQL Editor, then press Check now again.</p>
      {asking && <ConfirmDialog title="Remove the old app's leftovers from SIT?" action="Remove them" danger onDone={onRun} onClose={() => setAsking(false)}>
        <p>{count} old {count === 1 ? 'thing goes' : 'things go'}, exactly as the SQL shows. If anything fails, nothing is removed.</p></ConfirmDialog>}
    </div>
  )
}

function Updates({ own }: { own: OwnLoad }) {
  const history = useLoad(() => admin<History>('release_history'), 'release_history')
  // TOWER-5: the PROD move phone code switch (only the tower asks; until it answers, the code is asked).
  const phone = useLoad(() => (TOWER ? admin<PhoneState>('release_phone_code_state') : Promise.resolve(null)), 'release_phone_code')
  const next = moveFrom(HERE)
  const [move, setMove] = useState<Move | null>(null)
  // SYNCSET (owner OK 2026-11-25): the PROD Admin has three tabs: Control tower, Sync settings, History.
  const [view, setView] = useState<'tower' | 'sync' | 'history'>('tower')
  const shown = TOWER ? view : null
  return (
    <>
      {TOWER && <div className="tabs" role="tablist">
        {([['tower', 'Control tower'], ['sync', 'Sync settings'], ['history', 'History']] as const).map(([key, name]) => (
          <button type="button" role="tab" key={key} aria-selected={view === key} className={`tab ${view === key ? 'is-on' : ''}`} onClick={() => setView(key)}>{name}</button>))}
      </div>}
      {shown === 'sync' && <SyncSettings onEnded={history.reload} phoneCode={phone.data?.on ?? true} />}
      {TOWER ? shown === 'tower' && <><PhoneCodeCard state={phone} /><OwnMoveCard onEnded={history.reload} phoneCode={phone.data?.on ?? true} /><TowerCard onEnded={history.reload} phoneCode={phone.data?.on ?? true} /></>
      : !ownMoveShown(HERE, own.data) ? (own.loading && own.data === undefined ? <Loading /> : <Card title="Move code">
        <p className="sub">This Admin runs on {HERE ? STAGE_NAME[HERE] : 'a stage it does not know'}. Code is moved from PROD Admin › Releases (control tower). This Admin receives code; it sends none.</p>
      </Card>) : <>
      <Card title={next ? `Send code → ${STAGE_NAME[next.to]}` : 'Move code'}>
        <p className="sub">This Admin runs on {HERE ? STAGE_NAME[HERE] : 'a stage it does not know'}. {next
          ? `It sends code to the next layer only: ${STAGE_NAME[next.to]}. Check first, then approve.`
          : 'No move can run from here.'}</p>
        {next && <div className="release-moves">
          <button type="button" className={`button${move ? ' primary' : ''}`} onClick={() => setMove(next)}>Send code → {STAGE_NAME[next.to]}</button>
        </div>}
        {own.data && <p className="sub">Turned on from PROD Admin. {lastChange(own.data)}{own.data.reason ? `: ${own.data.reason}` : ''}.</p>}
      </Card>
      {move && <MoveCard key={move.label} move={move} onEnded={history.reload} />}
      </>}
      {(!TOWER || shown === 'tower') && <PhoneUpdatesCard />}
      {(!TOWER || shown === 'history') && <Card title="History">
        {history.error ? <ErrorBox message={history.error} onRetry={history.reload} /> : !history.data ? <Loading /> : !history.data.moves.length ? <p className="sub">No moves yet.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>When</th><th>Move</th><th>Result</th><th>What moved</th><th>By</th><th>Why</th></tr></thead>
            <tbody>{history.data.moves.map((m) => (
              <tr key={m.at}>
                <td>{new Date(m.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td>{m.ownMove != null ? ownMoveHistoryLabel(m) : m.settings ? syncHistoryLabel(m) : m.incoming ? `Data in from ${m.target}` : moveLabel(m.target, m.from)}{m.from && !m.settings && m.ownMove == null && <span className="sub"> · from PROD Admin{m.only ? ` · sent ${m.only.split(',').join(' + ')}` : ''}</span>}</td>
                <td><Badge tone={m.ok ? 'good' : 'critical'}>{m.ok ? 'Done' : 'Stopped'}</Badge>{m.message && <span className="sub">{m.message}</span>}</td>
                <td>{m.ownMove != null ? <>{m.ownMove ? 'Send code → next shown' : 'Send code → next hidden'}</> : m.data ? <>{m.data}</> : <>{m.migrations} migrations · functions {m.functions === 'applied' ? 'updated' : m.functions === 'none' ? 'same' : 'not reached'}{m.repo && <span className="sub"> · code {m.repo}</span>}{m.site && <span className="sub"> · website {m.site}</span>}{m.backup && <span className="sub"> · backup {m.backup.replace('release_backup_', '')}</span>}{m.rolledBack && <span className="sub"> · old website put back</span>}</>}</td>
                <td>{m.by}</td>
                <td>{m.reason ?? ''}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </Card>}
    </>
  )
}

type PhoneState = { on: boolean; at: string | null; by: string | null }

// TOWER-5 (owner 2026-11-24): the phone code for PROD moves (Admin alerts → Telegram) stays off until go-live; one button
// turns it on (or off again), with a reason; each change is an audit line.
function PhoneCodeCard({ state }: { state: { data?: PhoneState | null; error?: string; reload: () => unknown } }) {
  const [asking, setAsking] = useState(false)
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  if (!state.data) return null
  const on = state.data.on
  const set = async (reason: string) => { await admin('release_phone_code_set', { on: !on, reason }); state.reload() }
  return (
    <Card title={<>Phone code for PROD moves <Badge tone={on ? 'good' : 'warning'}>{on ? 'On' : 'Off'}</Badge></>}
      action={<button type="button" className={`button small${on ? '' : ' primary'}`} onClick={() => setAsking(true)}>{on ? 'Turn off' : 'Turn on'}</button>}>
      <p className="sub">{on ? 'A move into PROD asks a 6-digit code sent to your phone (Admin alerts → Telegram).'
        : 'Off until go-live: a move into PROD needs PROD typed and a reason, no phone code. Turn it on before real customers (Telegram keys first: Connections).'}
        {state.data.at && <> Last changed {new Date(state.data.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} by {state.data.by}.</>}</p>
      {asking && <ConfirmDialog title={on ? 'Turn the phone code off?' : 'Turn the phone code on?'} action={on ? 'Turn off' : 'Turn on'} danger={on} onDone={set} onClose={() => setAsking(false)}>
        <p>{on ? 'PROD moves will no longer ask a code from your phone.' : 'Every PROD move will ask a code sent to your phone. Telegram must be set up, or no code arrives.'}</p></ConfirmDialog>}
    </Card>
  )
}

// OWNMOVE (owner OK 2026-11-25, https://claude.ai/artifact/BtjhMi26yACF3b2RoJxP3V): PROD turns a lower Admin's own move on or
// off (release-own-move writes the switch into that stage's database). Off (default) = that Admin shows no move button, no
// upward keys and no First setup, and its database refuses its own move. Each change asks why (+ the phone code while on).
function OwnMoveCard({ onEnded, phoneCode }: { onEnded: () => void; phoneCode: boolean }) {
  const list = useLoad(() => releaseCall<{ stages: OwnMove[] }>('release-own-move', { target: 'all', mode: 'plan' }), 'own_move_all')
  const [asking, setAsking] = useState<OwnMove | null>(null)
  const [code, setCode] = useState('')
  const [codeNote, setCodeNote] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const sendCode = async () => {
    setSending(true); setCodeNote(null)
    try { await admin('release_code', { target: 'prod' }); setCodeNote('Code sent to your phone. It is good for 10 minutes.') } catch (e) { setCodeNote(e instanceof Error ? e.message : 'The code was not sent.') }
    setSending(false)
  }
  const flip = async (row: OwnMove, reason: string) => {
    if (phoneCode) {
      const answer = await admin<{ ok: boolean; left?: number }>('release_code_check', { target: 'prod', code: code.replace(/\s/g, '') })
      if (!answer.ok) throw new Error(`Wrong code. ${answer.left ?? 0} ${answer.left === 1 ? 'try' : 'tries'} left.`)
    }
    await releaseCall('release-own-move', { target: row.stage, mode: 'apply', on: !row.on, reason })
    setCode(''); setCodeNote(null); list.reload(); onEnded()
  }
  const rows = list.data?.stages ?? LOWER.map((stage): OwnMove => ({ stage, on: false, at: null, by: null, reason: null, note: null }))
  return (
    <Card title="Own move on lower Admins">
      <p className="sub">Off = that Admin shows no move button and holds no keys to the stage above; moves go from here. On = that Admin gets its own "Send code →" back; then add its keys there (its Connections).</p>
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : <div className="table-wrap"><table className="table">
        <tbody>{rows.map((row) => (
          <tr key={row.stage}>
            <td><b>{rowName(row.stage)}</b><br /><span className="sub">{row.note ? row.message : lastChange(row)}</span></td>
            <td>{!list.data ? <Loading /> : row.note ? <Badge tone="warning">{row.note === 'waiting' ? 'Not there yet' : 'No answer'}</Badge> : <Badge tone={row.on ? 'good' : 'neutral'}>{row.on ? 'On' : 'Off'}</Badge>}</td>
            <td>{list.data && !row.note && <button type="button" className={`button small${row.on ? '' : ' primary'}`} onClick={() => setAsking(row)}>{row.on ? 'Turn off' : 'Turn on'}</button>}</td>
          </tr>))}</tbody>
      </table></div>}
      {asking && <ConfirmDialog title={`${asking.on ? 'Turn off' : 'Turn on'} the ${STAGE_NAME[asking.stage]} Admin's own move?`} action={asking.on ? 'Turn off' : 'Turn on'} danger={!asking.on}
        onDone={(reason) => flip(asking, reason)} onClose={() => { setAsking(null); setCodeNote(null) }}>
        <p>{asking.on ? `The ${STAGE_NAME[asking.stage]} Admin will no longer show "Send code → ${STAGE_NAME[moveFrom(asking.stage)!.to]}", and its database refuses its own move. Moves go from here.`
          : `The ${STAGE_NAME[asking.stage]} Admin will show "Send code → ${STAGE_NAME[moveFrom(asking.stage)!.to]}" again. It still needs ${STAGE_NAME[moveFrom(asking.stage)!.to]}'s keys added in its own Connections before it can move anything. Moves from there skip this tower.`}</p>
        {phoneCode && <div className="release-code">
          <label className="field"><span>Code sent to your phone (Admin alerts)</span><input value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={7} onChange={(e) => setCode(e.target.value)} /></label>
          <button type="button" className="button" disabled={sending} onClick={() => void sendCode()}>{sending ? 'Sending…' : 'Send code to my phone'}</button>
          {codeNote && <span className="sub">{codeNote}</span>}
        </div>}
      </ConfirmDialog>}
    </Card>
  )
}

// Control tower (TOWER-1): the chain, one button per hop, and one run that goes hop by hop up to a chosen stage.
// Every call carries {from}; PROD's secrets hold each stage's keys (Connections). A PROD hop asks PROD typed + the phone code
// once, before the run starts (it opens PROD's 2-hour window, so the run does not wait on a code half way).
function TowerCard({ onEnded, phoneCode }: { onEnded: () => void; phoneCode: boolean }) {
  // TOWER-9 (owner 2026-11-24: "confusing", "no stop button"): 1 what to send, 2 where to (picked fresh every time, nothing
  // pre-selected, the hops spelled out), 3 one hop = Check + Approve card; several hops = reason + Start, with a Stop button.
  const choices: { key: string; moves: Move[] }[] = [...MOVES.map((one) => ({ key: one.to, moves: [one] })),
    { key: 'run-uat', moves: runTo('uat') }, { key: 'run-prod', moves: runTo('prod') }]
  const [pick, setPick] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')
  const [code, setCode] = useState('')
  const [codeNote, setCodeNote] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [run, setRun] = useState<{ moves: Move[]; at: number; reason: string; stopped: boolean; byYou: boolean; only: Code[] } | null>(null)
  const [only, setOnly] = useState<Code[]>([])
  const halt = useRef(false)
  const [stopping, setStopping] = useState(false)
  const chosen = choices.find((c) => c.key === pick) ?? null
  const several = (chosen?.moves.length ?? 0) > 1
  const last = chosen ? chosen.moves[chosen.moves.length - 1]!.to : null
  const prod = last === 'prod'
  const needCode = prod && phoneCode
  const busy = Boolean(run && !run.stopped && run.at < run.moves.length)
  const path = (moves: Move[]) => [STAGE_NAME[moves[0]!.from], ...moves.map((m) => STAGE_NAME[m.to])].join(' → ')
  const flip = (key: Code) => { setRun(null); setOnly((now) => (now.includes(key) ? now.filter((k) => k !== key) : [...now, key])) }
  const choose = (key: string) => { setRun(null); setPick(key); setTyped(''); setCode(''); setCodeNote(null) }
  const sendCode = async () => {
    setSending(true); setCodeNote(null)
    try { await admin('release_code', { target: 'prod' }); setCodeNote('Code sent to your phone. It is good for 10 minutes.') } catch (e) { setCodeNote(e instanceof Error ? e.message : 'The code was not sent.') }
    setSending(false)
  }
  const begin = async () => {
    if (!chosen) return
    if (needCode) {
      try {
        const answer = await admin<{ ok: boolean; left?: number }>('release_code_check', { target: 'prod', code: code.replace(/\s/g, '') })
        if (!answer.ok) { setCodeNote(`Wrong code. ${answer.left ?? 0} ${answer.left === 1 ? 'try' : 'tries'} left.`); return }
      } catch (e) { setCodeNote(e instanceof Error ? e.message : 'The code was not checked.'); return }
    }
    halt.current = false
    setStopping(false)
    setRun({ moves: chosen.moves, at: 0, reason: reason.trim(), stopped: false, byYou: false, only })
  }
  const finish = (i: number, ok: boolean) => setRun((now) => {
    if (!now || i !== now.at) return now
    const next = ok && !halt.current ? { ...now, at: now.at + 1 } : { ...now, stopped: true, byYou: halt.current }
    if (next.stopped || next.at >= next.moves.length) setPick(null) // the next run is picked fresh
    return next
  })
  return (
    <>
      <Card title="Control tower">
        <p className="sub">This Admin runs on PROD and moves code up the chain, one stage at a time. Every stage's keys are kept here (Connections).</p>
        <div className="release-chain" aria-label="Build → DEV → SIT → UAT → PROD">
          {(['build', 'dev', 'sit', 'uat', 'prod'] as const).map((stage, i) => <span key={stage}>{i > 0 && <span className="sub"> → </span>}<Badge tone={stage === 'prod' ? 'accent' : 'neutral'}>{STAGE_NAME[stage]}</Badge></span>)}
        </div>
        <h3>1 · What to send</h3>
        <div className="release-moves" role="group" aria-label="What to send">
          {CODES.map((c) => <button key={c.key} type="button" disabled={busy} aria-pressed={only.includes(c.key)} className={`button${only.includes(c.key) ? ' primary' : ''}`} onClick={() => flip(c.key)}>{only.includes(c.key) ? '✓ ' : ''}{c.label}</button>)}
        </div>
        <ul className="release-words">{CODES.map((c) => <li key={c.key}><b>{c.label}</b>: {c.words}{only.includes(c.key) ? '' : ' (off: stays as it is)'}</li>)}</ul>
        <h3>2 · Where to</h3>
        <div className="release-picks" role="radiogroup" aria-label="Where to">
          {choices.map((c) => <label key={c.key} className={`release-pick${pick === c.key ? ' is-on' : ''}`}>
            <input type="radio" name="tower-where" checked={pick === c.key} disabled={busy || !only.length} onChange={() => choose(c.key)} />
            <span><b>{path(c.moves)}</b> <span className="sub">{c.moves.length === 1 ? 'one hop: check, then approve' : `${c.moves.length} hops in a row, each checked first`}</span></span>
          </label>)}
        </div>
        {!only.length && <p className="sub">Switch on at least one under 1 first.</p>}
        {chosen && several && !busy && <div className="release-approve">
          <h3>3 · Start</h3>
          <p>This runs, in order: {chosen.moves.map((m) => m.label).join(', ')}. Sends: {only.map((k) => CODES.find((c) => c.key === k)!.label).join(' + ')}.</p>
          <label className="field"><span>Why (goes in the audit log for every hop)</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} /></label>
          {prod && <label className="field"><span>Type PROD to approve</span><input value={typed} onChange={(e) => setTyped(e.target.value)} /></label>}
          {needCode && <div className="release-code">
            <label className="field"><span>Code sent to your phone (Admin alerts)</span><input value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={7} onChange={(e) => setCode(e.target.value)} /></label>
            <button type="button" className="button" disabled={sending} onClick={() => void sendCode()}>{sending ? 'Sending…' : 'Send code to my phone'}</button>
            {codeNote && <span className="sub">{codeNote}</span>}
          </div>}
          <button type="button" className="button primary" disabled={!only.length || !reason.trim() || !confirmOk(last!, typed, code, phoneCode)} onClick={() => void begin()}>Start: {path(chosen.moves)}</button>
        </div>}
        {busy && <div className="release-approve">
          <p>Running {run!.moves[run!.at]!.label} ({run!.at + 1} of {run!.moves.length}).</p>
          <button type="button" className="button danger" disabled={stopping} onClick={() => { halt.current = true; setStopping(true) }}>{stopping ? 'Stopping after this step…' : 'Stop'}</button>
          <span className="sub">Stop ends the run after the step that is running; no next hop starts. What ran stays.</span>
        </div>}
      </Card>
      {chosen && !several && !run && only.length > 0 && <MoveCard key={`${chosen.key}|${only.join(',')}`} move={chosen.moves[0]!} tower only={only} phoneCode={phoneCode} onEnded={onEnded} />}
      {run && run.moves.slice(0, run.at + 1).map((one, i) => <MoveCard key={`run-${one.label}`} move={one} tower only={run.only} onEnded={onEnded}
        auto={{ reason: run.reason, codeOpen: true }} halt={() => halt.current} onFinished={(ok) => finish(i, ok)} />)}
      {run && !run.stopped && run.at >= run.moves.length && <Card><p>Run done: {path(run.moves)}.</p></Card>}
      {run?.stopped && <Card><p className="sub">{run.byYou ? 'You stopped the run' : 'The run stopped'} at {run.moves[Math.min(run.at, run.moves.length - 1)]!.label}. Pick where to again to go on: what is done shows "already has it".</p></Card>}
    </>
  )
}

type PartPlan = { plan?: PlanAnswer | RepoPlan | SitePlan | FunctionsPlan | BackupPlan | PhonePlan; skip?: string }
type PartRun = { state: 'waiting' | 'running' | 'done' | 'failed' | 'skipped' | 'back'; note?: string }
const PART_TITLE = (part: Part, to: string) => (part === 'backup' ? `0 · Backup of ${to} data` : part === 'sql' ? '1 · Database: migrations, then functions' : part === 'repo' ? `2 · Code to the ${to} repo` : part === 'site' ? `3 · ${to} website` : part === 'functions' ? `4 · App functions on ${to}` : part === 'phone' ? `6 · Phone app update on ${to}` : `5 · ${to} Admin website`)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// One move (V90; code + website V91; app functions V133): Check plans every part; Approve runs them in order (database, code, website, functions, Admin website), each
// looped while it says done:false. A part whose keys are not in Connections › Keys yet is skipped and said; a failure stops the rest.
function MoveCard({ move, onEnded, onFinished, parts: asked = PARTS, tower = false, auto, only, phoneCode = true, halt }: { move: Move; onEnded: () => void; onFinished?: (ok: boolean) => void; parts?: Part[]
  /** TOWER-1: a PROD Admin move (every call carries {from}); auto = one hop of a tower run: check, then start at once. */
  tower?: boolean; auto?: { reason: string; codeOpen: boolean }
  /** TOWER-3: the switches (App / Admin / Mobile); every call carries them and only their steps run. */
  only?: Code[]
  /** TOWER-5: false = the phone code switch is off (no code asked for a PROD move). */
  phoneCode?: boolean
  /** TOWER-9: true = the owner pressed Stop: no next step starts. */
  halt?: () => boolean }) {
  const from = { ...fromBody(move, tower), ...(only ? { only } : {}) }
  const parts = moveParts(move.to, moveSteps(only ? codeParts(only).filter((part) => asked.includes(part)) : asked, tower))
  const prod = move.to === 'prod'
  const [code, setCode] = useState('')
  const [codeNote, setCodeNote] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [plans, setPlans] = useState<Partial<Record<Part, PartPlan>> | null>(null)
  const planned = plans
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')
  const [run, setRun] = useState<Run | null>(null)
  const [steps, setSteps] = useState<Partial<Record<Part, PartRun>>>({})
  const to = STAGE_NAME[move.to]

  const check = async (): Promise<Partial<Record<Part, PartPlan>> | null> => {
    setChecking(true); setError(null); setPlans(null); setSteps({})
    const answers = await Promise.all(parts.map(async (part): Promise<[Part, PartPlan]> => {
      try { return [part, { plan: await releaseCall<PlanAnswer | RepoPlan | SitePlan | FunctionsPlan | BackupPlan | PhonePlan>(PART_FN[part], { target: move.to, mode: 'plan', ...partBody(part), ...from }) }] } catch (e) {
        if (e instanceof AdminError && notConnected(e.code)) return [part, { skip: e.message }]
        throw e
      }
    })).catch((e: unknown) => { setError(e instanceof Error ? e.message : 'The check did not run.'); return null })
    const found = answers ? Object.fromEntries(answers) as Partial<Record<Part, PartPlan>> : null
    if (found) setPlans(found)
    setChecking(false)
    return found
  }

  // V135: the phone code (Admin alerts) for a PROD move.
  const sendCode = async () => {
    setSending(true); setCodeNote(null)
    try { await admin('release_code', { target: 'prod' }); setCodeNote('Code sent to your phone. It is good for 10 minutes.') } catch (e) { setCodeNote(e instanceof Error ? e.message : 'The code was not sent.') }
    setSending(false)
  }

  const start = async (given?: Partial<Record<Part, PartPlan>>) => {
    const plans = given ?? planned
    if (!plans) return
    const why = auto?.reason ?? reason.trim()
    if (prod && phoneCode && !auto?.codeOpen) {
      try {
        const answer = await admin<{ ok: boolean; left?: number }>('release_code_check', { target: 'prod', code: code.replace(/\s/g, '') })
        if (!answer.ok) { setCodeNote(`Wrong code. ${answer.left ?? 0} ${answer.left === 1 ? 'try' : 'tries'} left.`); return }
      } catch (e) { setCodeNote(e instanceof Error ? e.message : 'The code was not checked.'); return }
    }
    let backup: string | undefined
    let rolledBack = false
    const published: Part[] = []
    let applied: string[] = []
    let functions: ApplyAnswer['functions'] = 'none'
    let rounds = 0
    let repo: string | undefined
    let site: string | undefined
    const mark = (part: Part, value: PartRun) => setSteps((now) => ({ ...now, [part]: value }))
    setRun({ state: 'running', applied, functions, rounds })
    let failed: string | null = null
    for (const part of parts) {
      const p = plans[part]
      if (!failed && halt?.()) failed = 'Stopped by you.'
      if (failed) { mark(part, { state: 'skipped', note: failed === 'Stopped by you.' ? 'Not started: you pressed Stop.' : 'Not started: a step above stopped.' }); continue }
      // A PROD move never touches the database without its backup.
      if (part === 'backup' && !p?.plan) { failed = `No backup could be made: ${p?.skip ?? 'not connected yet.'}`; mark(part, { state: 'failed', note: failed }); continue }
      if (!p?.plan) { mark(part, { state: 'skipped', note: p?.skip ?? 'Not connected yet.' }); continue }
      if (partSame(part, p.plan)) { mark(part, { state: 'done', note: `${to} already has it.` }); continue }
      mark(part, { state: 'running' })
      try {
        if (part === 'backup') {
          let state: unknown = null
          for (;;) {
            const round = await releaseCall<BackupRound>('release-sql', { target: move.to, mode: 'apply', part: 'backup', reason: why, state, ...from })
            state = round.state; backup = round.schema
            if (round.done) { mark(part, { state: 'done', note: `Backup ${round.schema.replace('release_backup_', '')}: ${round.total} tables kept inside ${to}${round.removed.length ? `; ${round.removed.length} older removed` : ''}.` }); break }
            mark(part, { state: 'running', note: `${round.copied} of ${round.total} tables copied.` })
          }
        } else if (part === 'sql') {
          for (;;) {
            const round = await releaseCall<ApplyAnswer>('release-sql', { target: move.to, mode: 'apply', reason: why, ...from })
            applied = addRound(applied, round); functions = round.functions; rounds += 1
            setRun({ state: 'running', applied, functions, rounds })
            if (round.done) break
          }
          mark(part, { state: 'done' })
        } else if (part === 'repo') {
          let state: unknown = null
          for (;;) {
            const round = await releaseCall<RepoRound>('release-repo', { target: move.to, mode: 'apply', reason: why, state, ...from })
            state = round.state
            if (round.done) { repo = round.short; mark(part, { state: 'done', note: `Code ${round.short ?? ''} is in the ${to} repo.` }); break }
            mark(part, { state: 'running', note: round.wait ? `GitHub asked to wait ${round.wait} s; ${round.left} files left.` : `${round.left} files left.` })
            if (round.wait) await sleep(round.wait * 1000)
          }
        } else if (part === 'functions') {
          let state: unknown = null
          let count = 0
          for (;;) {
            const round = await releaseCall<FunctionsRound>('release-functions', { target: move.to, mode: 'apply', reason: why, state, ...from })
            state = round.state; count += round.deployed.length
            if (round.done) { mark(part, { state: 'done', note: `${count} functions deployed on ${to}.` }); break }
            mark(part, { state: 'running', note: `${count} deployed, ${round.left} left.` })
          }
        } else if (part === 'phone') {
          // BROKEN-44: the From stage's live quiet update, copied to the next stage; it waits there for Send to phones.
          let state: unknown = null
          let sent = 0
          for (;;) {
            const round = await releaseCall<PhoneRound>('release-phone', { target: move.to, mode: 'apply', reason: why, state, ...from })
            state = round.state; sent += round.sent
            if (round.done) { mark(part, { state: 'done', note: `Phone update ${round.version} waits in ${to}'s Admin › Releases › Phone app updates (${sent} files sent): phones get it after Send to phones there.` }); break }
            mark(part, { state: 'running', note: `${sent} of ${round.files} files sent.` })
          }
        } else {
          let state: unknown = null
          for (;;) {
            const round = await releaseCall<SiteRound>('release-site', { target: move.to, mode: 'apply', reason: why, state, ...partBody(part), ...from })
            state = round.state
            if (round.done) {
              const runs = shortOf(round.commit)
              if (part === 'site') site = runs
              published.push(part)
              mark(part, { state: 'done', note: `${to} ${part === 'admin' ? 'Admin website' : 'website'} runs ${runs ?? 'the new build'} (${round.uploaded} of ${round.files} files sent).` }); break
            }
            mark(part, { state: 'running', note: 'Still sending files…' })
          }
        }
      } catch (e) {
        failed = e instanceof Error ? e.message : 'A step failed.'
        mark(part, { state: 'failed', note: failed })
      }
    }
    // V135: a failed PROD move puts back the website(s) it already published, on the version each served before.
    if (failed) for (const part of putBack(move.to, published)) {
      const before = (plans[part]?.plan as SitePlan | undefined)?.release
      if (!before) { mark(part, { state: 'done', note: `${to} had no website before this move, so there is nothing to put back.` }); continue }
      try {
        await releaseCall('release-site', { target: move.to, mode: 'rollback', reason: why, version: before, ...partBody(part), ...from })
        rolledBack = true
        mark(part, { state: 'back', note: `Put back: ${to} ${part === 'admin' ? 'Admin website' : 'website'} runs the version from before this move.` })
      } catch (e) { mark(part, { state: 'failed', note: `Could not put the old ${part === 'admin' ? 'Admin website' : 'website'} back (${e instanceof Error ? e.message : 'no answer'}): do it in the Firebase console › Hosting › Release history.` }) }
    }
    setRun({ state: failed ? 'failed' : 'done', applied, functions, rounds, message: failed ?? undefined })
    await admin('release_done', { target: move.to, ...from, ok: !failed, migrations: applied.length, functions, ...(repo ? { repo } : {}), ...(site ? { site } : {}), ...(backup ? { backup } : {}), ...(rolledBack ? { rolledBack } : {}),
      ...(failed ? { message: failed.slice(0, 500) } : {}), reason: why }).catch(() => {})
    onFinished?.(!failed)
    onEnded()
  }

  // TOWER-1 run: check, then start at once with the run's reason (nothing to move = this hop is done; a block stops the run).
  const autoRan = useRef(false)
  useEffect(() => {
    if (!auto || autoRan.current) return
    autoRan.current = true
    void (async () => {
      const found = await check()
      if (!found) { onFinished?.(false); return }
      const first = found.sql?.plan as PlanAnswer | undefined
      const stopped = first && !first.upToDate ? planBlock(first) : null
      if (stopped) { setError(stopped); onFinished?.(false); return }
      if (!parts.some((part) => { const p = found[part]; return part !== 'backup' && p?.plan && !partSame(part, p.plan) })) { onFinished?.(true); return }
      await start(found)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- runs once per hop card

  const sql = plans?.sql?.plan as PlanAnswer | undefined
  const block = sql && !sql.upToDate ? planBlock(sql) : null
  const work = plans ? parts.some((part) => { const p = plans[part]; return part !== 'backup' && p?.plan && !partSame(part, p.plan) }) : false
  const canStart = Boolean(plans) && work && !block && reason.trim().length > 0 && confirmOk(move.to, typed, code, phoneCode) && !run
  const tone = (one?: PartRun) => (one?.state === 'done' ? 'good' : one?.state === 'failed' ? 'critical' : one?.state === 'running' ? 'accent' : one?.state === 'back' ? 'warning' : 'neutral')
  const label = (one?: PartRun) => (one?.state === 'done' ? '✓ Done' : one?.state === 'failed' ? '✗ Stopped' : one?.state === 'running' ? 'Running…' : one?.state === 'skipped' ? 'Skipped' : one?.state === 'back' ? '↩ Put back' : 'Waiting')
  return (
    <Card title={move.label} action={<button type="button" className="button" disabled={checking || run?.state === 'running'} onClick={check}>{checking ? 'Checking…' : 'Check what changes'}</button>}>
      {error && <ErrorBox message={error} />}
      {plans && parts.map((part) => {
        const p = plans[part]
        return <div key={part} className="release-part">
          <b>{PART_TITLE(part, to)}</b>
          {p?.skip ? <p className="sub">{part === 'phone' ? `Skipped: ${p.skip}` : `Not connected yet: ${p.skip}`}</p> : <ul className="release-words">{(p?.plan?.words ?? []).map((word) => <li key={word}>{word}</li>)}</ul>}
          {part === 'sql' && sql && sql.migrations.length > 0 && <details><summary>Migrations to run ({sql.migrations.length})</summary><ul className="release-list">{sql.migrations.map((name) => <li key={name}>{name}</li>)}</ul></details>}
        </div>
      })}
      {block && <p className="sub">{block}</p>}
      {plans && !work && !block && <p className="sub">Nothing to move: {to} already has all of it, or nothing is connected yet.</p>}
      <h3>Steps</h3>
      <ol className="release-steps">
        {parts.map((part) => {
          const one = steps[part]
          return <li key={part} className={plans?.[part]?.skip && !one ? 'is-soon' : undefined}>
            <Badge tone={tone(one)}>{label(one)}</Badge> {PART_TITLE(part, to)}
            {part === 'sql' && run && <span className="sub"> {run.applied.length} migrations done{sql ? ` of ${sql.migrations.length}` : ''} · functions {run.functions === 'applied' ? 'updated' : run.functions === 'none' ? (one?.state === 'done' ? 'same' : 'next') : 'next'} · round {run.rounds}</span>}
            {one?.note && <span className="sub"> {one.note}</span>}
          </li>
        })}
      </ol>
      {run?.applied.length ? <details><summary>Migrations done ({run.applied.length})</summary><ul className="release-list">{run.applied.map((name) => <li key={name}>✓ {name}</li>)}</ul></details> : null}
      {run?.state === 'failed' && <ErrorBox message={`Stopped: ${run.message}. What ran before this step stays; check again, then start again to go on.`} />}
      {run?.state === 'done' && <p>{to} is up to date with this stage for every connected step.</p>}
      {plans && work && !block && !run && <div className="release-approve">
        <label className="field"><span>Why this move (goes in the audit log)</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} /></label>
        {prod && <label className="field"><span>Type PROD to approve</span><input value={typed} onChange={(e) => setTyped(e.target.value)} /></label>}
        {prod && phoneCode && <div className="release-code">
          <label className="field"><span>Code sent to your phone (Admin alerts)</span><input value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={7} onChange={(e) => setCode(e.target.value)} /></label>
          <button type="button" className="button" disabled={sending} onClick={() => void sendCode()}>{sending ? 'Sending…' : 'Send code to my phone'}</button>
          {codeNote && <span className="sub">{codeNote}</span>}
        </div>}
        <button type="button" className="button primary" disabled={!canStart} onClick={() => void start()}>Approve and start</button>
      </div>}
    </Card>
  )
}
