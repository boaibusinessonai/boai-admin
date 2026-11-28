import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Card, ErrorBox, Loading, OpensInView } from '../components/ui'
import { formatAgo, formatDate } from '../lib/format'
import { admin, checkConnection, keysStatus, releaseCall, removeKey, replaceKey, stageName, supabaseUrl } from '../lib/supabase'
import { allNames, dueOf, nextParts, otherDbKey, ownParts, partReady, refOf, rowState, towerParts, type DueKey, type KeyRow, type PartRow } from '../lib/connectionsPlan'
import { isTower, MOVES, moveFrom, notConnected, PART_FN, partBody, PARTS, STAGE_NAME, moveSteps, stageOf, type Part, type Stage, type Target } from '../lib/releases'
import { useLoad } from '../lib/useLoad'
import { ownMoveShown, type OwnState } from '../lib/ownMove'

// CONN-1 (owner OK v11 2026-11-23): the page = This Admin (own parts, keys inline: set / missing / due), Send code → <next>
// (every key that move reads, Add / Replace, Check), and on PROD only Other databases with + Connect a database. The older
// hand-typed list and key dates stay, tucked under "More".
// Connections (older part): the Git repos, Firebase sites and databases each stage (Prod, UAT, SIT, Dev) uses, one Live of each per stage.
// Keys: when each CONN_ key is due to be changed, and Replace key (the value goes to the Edge Function, never the database).

type Kind = 'repo' | 'site' | 'database'
type Connection = { id?: string; kind: Kind; name: string; stage: string; address: string; branch: string | null; secretName: string | null; note: string | null
  isLive?: boolean; checkedAt?: string | null; checkOk?: boolean | null; checkDetail?: string | null }
type Key = { name: string; label: string; rotateDays: number; note: string | null
  changedAt?: string | null; changedBy?: string | null; dueOn?: string; status?: 'ok' | 'soon' | 'overdue'; usedBy?: { id: string; name: string; stage: string }[] }
type Pending = { title: string; danger?: boolean; text: string; prod?: boolean; run: (reason: string, confirm: string) => Promise<unknown> }

const KINDS: { kind: Kind; title: string; address: string; example: string }[] = [
  { kind: 'repo', title: 'Git repo', address: 'Repo (owner/name on GitHub)', example: 'owner/business-growth-portal' },
  { kind: 'site', title: 'Firebase site', address: 'Site address', example: 'https://your-site.web.app' },
  { kind: 'database', title: 'Database', address: 'Supabase project ref (20 letters)', example: 'abcdefghijklmnopqrst' },
]
const STAGES: [string, string][] = [['prod', 'Prod'], ['uat', 'UAT'], ['sit', 'SIT'], ['dev', 'Dev']]
const BLANK_KEY: Key = { name: 'CONN_', label: '', rotateDays: 30, note: null }
const DUE: Record<string, [string, 'good' | 'warning' | 'critical']> = { ok: ['OK', 'good'], soon: ['Due soon', 'warning'], overdue: ['Change now', 'critical'] }

function link(c: Connection) {
  if (c.kind === 'repo') return `https://github.com/${c.address}${c.branch ? `/tree/${encodeURIComponent(c.branch)}` : ''}`
  if (c.kind === 'database') return `https://supabase.com/dashboard/project/${c.address}`
  return c.address
}

function status(c: Connection) {
  if (c.checkOk == null) return <Badge>Not checked</Badge>
  return <span title={c.checkDetail ?? ''}><Badge tone={c.checkOk ? 'good' : 'critical'}>{c.checkOk ? 'Working' : 'Not working'}</Badge></span>
}

const HERE = stageOf(supabaseUrl, stageName)
const NEXT = moveFrom(HERE)
// TOWER-1 (owner 2026-11-24): PROD holds one key set per stage and runs every move from its Releases.
const TOWER = isTower(HERE)
const TOWER_STAGES: Stage[] = ['build', 'dev', 'sit', 'uat', 'prod']
type Status = { set: Record<string, boolean>; shown: Record<string, string>; keys: DueKey[] }

export function Connections() {
  const [bump, setBump] = useState(0)
  const own = ownParts(Boolean(NEXT))
  const next = NEXT ? nextParts(NEXT.to) : []
  const stageKeys = TOWER ? TOWER_STAGES.flatMap((stage) => towerParts(stage)) : []
  const status = useLoad(async (): Promise<Status> => {
    const [found, listed] = await Promise.all([keysStatus(allNames([...own, ...next, ...stageKeys])), admin<{ keys: DueKey[] }>('keys')])
    return { ...found, keys: listed.keys }
  }, `keys-status|${bump}`)
  const reload = () => setBump((n) => n + 1)
  // OWNMOVE (owner OK 2026-11-25): a lower Admin's upward key card shows only while PROD turned its own move on.
  const ownMove = useLoad(() => (NEXT && !TOWER ? admin<OwnState>('release_own_move_state') : Promise.resolve(null)), 'release_own_move')
  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Connections</h1><p className="muted">This Admin runs on {HERE ? STAGE_NAME[HERE] : 'a stage it does not know'}. Keys are never shown; Add / Replace writes them straight into this project's Supabase secrets.</p></div>
      </header>
      {status.error ? <ErrorBox message={status.error} onRetry={status.reload} /> : !status.data ? <Loading /> : <>
        <Card title={<>This Admin: {HERE ? STAGE_NAME[HERE] : '?'} <Badge tone="good">Working</Badge></>}>
          <KeyTable parts={[{ part: 'Database', keys: [] }, ...own]} status={status.data} onSaved={reload} />
          <p className="sub">AI, payments and alerts keys are read by their own names: change them in Supabase › Edge Functions › Secrets.</p>
        </Card>
        {NEXT ? (ownMoveShown(HERE, ownMove.data) ? <NextCard to={NEXT.to} parts={next} status={status.data} onSaved={reload} />
            : ownMove.data !== undefined || ownMove.error ? <NoMoveCard to={NEXT.to} parts={next} status={status.data} onSaved={reload} /> : <Loading />)
          : TOWER ? <>
            <Card><p className="sub">Control tower: this Admin moves code up the whole chain (Releases). Each stage's keys below; a stage that only sends (Build) needs read tokens, the others write tokens. The AI code is the ai-service folder next to the code folder.</p></Card>
            {TOWER_STAGES.map((stage) => {
              const hop = MOVES.find((one) => one.to === stage)
              return <NextCard key={stage} title={`${STAGE_NAME[stage]} keys`} to={hop?.to} from={hop?.from} parts={towerParts(stage)} status={status.data!} onSaved={reload} />
            })}
          </> : null}
        {HERE === 'prod' && <OtherDatabases />}
      </>}
      <HandList />
    </div>
  )
}

/** One table of parts and their keys: where (plain address), set / missing / due, Add or Replace (release keys only). */
function KeyTable({ parts, status, onSaved }: { parts: PartRow[]; status: Status; onSaved: () => void }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="table-wrap"><table className="table">
      <thead><tr><th>Part</th><th>Key</th><th>Where</th><th>State</th><th /></tr></thead>
      <tbody>{parts.map((part) => part.keys.length === 0
        ? <tr key={part.part}><td><b>{part.part}</b></td><td colSpan={2} className="sub">this project's own</td><td><Badge tone="good">own</Badge></td><td /></tr>
        : part.keys.map((k, i) => {
          const state = rowState(status.set[k.name], dueOf(status.keys, k.name))
          return (
            <tr key={k.name}>
              <td>{i === 0 && <b>{part.part}</b>}</td>
              <td>{k.label}</td>
              <td className="sub">{status.shown[k.name] ?? (status.set[k.name] && k.secret ? 'hidden' : '—')}</td>
              <td><Badge tone={state.tone}>{state.text}</Badge></td>
              <td>{k.canAdd && <button type="button" className="button small" onClick={() => setOpen(open === k.name ? null : k.name)}>{status.set[k.name] ? 'Replace' : 'Add'}</button>}
                {open === k.name && <KeyBox row={k} listed={status.keys.some((d) => d.name === `CONN_${k.name}`)} onDone={() => { setOpen(null); onSaved() }} onCancel={() => setOpen(null)} />}</td>
            </tr>)
        }))}</tbody>
    </table></div>
  )
}

/** Add / Replace one key: listed first (its change dates), then tried and written into the secrets (admin-replace-key). */
function KeyBox({ row, listed, onDone, onCancel }: { row: KeyRow; listed: boolean; onDone: () => void; onCancel: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = `CONN_${row.name}`
  const save = async () => {
    setBusy(true); setError(null)
    try {
      if (!listed) await admin('save_key', { name, label: row.label, rotateDays: row.rotateDays, note: null, reason: 'Added on Connections' })
      await replaceKey(name, value)
      onDone()
    } catch (e) { setError(e instanceof Error ? e.message : 'The key was not saved.') }
    setValue(''); setBusy(false)
  }
  return (
    <OpensInView><form className="plan-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <label className="field"><span>{row.label} (sent once, never shown again)</span><input type={row.secret ? 'password' : 'text'} autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} /></label>
      {error && <ErrorBox message={error} />}
      <div className="dialog-actions">
        <button type="button" className="button" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="submit" className="button primary" disabled={busy || value.trim().length < 3}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </form></OpensInView>
  )
}

/** OWNMOVE: this lower Admin's own move is off (PROD Admin decides): no upward keys here. Keys still saved from before are
 *  listed with Remove only (a …_DEV key on Build may sit under its old …_SIT name: both go). */
function NoMoveCard({ to, parts, status, onSaved }: { to: Target; parts: PartRow[]; status: Status; onSaved: () => void }) {
  const left = parts.flatMap((p) => p.keys.map((k) => ({ part: p.part, key: k }))).filter((r) => status.set[r.key.name])
  const [asking, setAsking] = useState<KeyRow | null>(null)
  const remove = async (k: KeyRow, reason: string) => {
    const names = [`CONN_${k.name}`, ...(HERE === 'build' && k.name.endsWith('_DEV') ? [`CONN_${k.name.slice(0, -4)}_SIT`] : [])]
    for (const name of names) {
      await removeKey(name).catch((e) => { if (name === names[0]) throw e })
      if (status.keys.some((d) => d.name === name)) await admin('delete_key', { name, reason })
    }
    onSaved()
  }
  return (
    <Card title="Moves to other stages">
      <p className="sub">Keys to other stages live only in PROD Admin › Connections. This Admin holds none. The PROD Admin can turn this Admin's own "Send code → {STAGE_NAME[to]}" back on (Releases › Own move on lower Admins).</p>
      {left.length > 0 && <>
        <p className="sub">Still saved here from before ({left.length}): not used while this Admin's own move is off.</p>
        <div className="table-wrap"><table className="table"><tbody>{left.map((r) => (
          <tr key={r.key.name}><td><b>{r.part}</b></td><td>{r.key.label}</td>
            <td><button type="button" className="button small" onClick={() => setAsking(r.key)}>Remove</button></td></tr>))}</tbody></table></div>
      </>}
      {asking && <ConfirmDialog title={`Remove ${asking.label}?`} action="Remove" danger onDone={(reason) => remove(asking, reason)} onClose={() => setAsking(null)}>
        <p>The key is deleted from this project's secrets. To move from here again later, the PROD Admin turns this Admin's own move on and you add the key again.</p>
      </ConfirmDialog>}
    </Card>
  )
}

/** Send code → next: every key that move reads, and Check = each part's plan (read only), as Releases does. */
function NextCard({ parts, status, onSaved, to, from, title }: { parts: PartRow[]; status: Status; onSaved: () => void
  /** TOWER-1: the hop Check runs (to + from); none = keys only (Build sends, never receives). */
  to?: Target; from?: Stage; title?: string }) {
  const missing = parts.filter((p) => !partReady(p, status.set)).length
  const [checks, setChecks] = useState<{ part: Part; ok: boolean; text: string }[] | null>(null)
  const [checking, setChecking] = useState(false)
  const check = async () => {
    if (!to) return
    setChecking(true); setChecks(null)
    setChecks(await Promise.all(moveSteps(PARTS, Boolean(from)).map(async (part) => {
      try {
        const plan = await releaseCall<{ words?: string[] }>(PART_FN[part], { target: to, mode: 'plan', ...partBody(part), ...(from ? { from } : {}) })
        return { part, ok: true, text: plan.words?.[0] ?? 'Reached.' }
      } catch (e) {
        const code = (e as { code?: string }).code
        return { part, ok: false, text: `${notConnected(code) ? 'Not connected yet: ' : ''}${e instanceof Error ? e.message : 'No answer.'}` }
      }
    })))
    setChecking(false)
  }
  const PART_WORD: Record<Part, string> = { backup: 'Backup', sql: 'Database', repo: 'Code repo', site: 'Website', functions: 'App functions', admin: 'Admin website', phone: 'Phone app update' }
  return (
    <Card title={<>{title ?? `Send code → ${to ? STAGE_NAME[to] : ''}`} {missing ? <Badge tone="warning">{missing} {missing === 1 ? 'part' : 'parts'} missing a key</Badge> : <Badge tone="good">All set</Badge>}</>}
      action={to ? <button type="button" className="button small" disabled={checking} onClick={() => void check()}>{checking ? 'Checking…' : from ? `Check ${STAGE_NAME[from]} → ${STAGE_NAME[to]}` : 'Check'}</button> : undefined}>
      <KeyTable parts={parts} status={status} onSaved={onSaved} />
      {checks && <ul className="list">{checks.map((c) => <li key={c.part}><Badge tone={c.ok ? 'good' : 'critical'}>{c.ok ? 'OK' : 'No'}</Badge> <b>{PART_WORD[c.part]}</b> <span className="sub">{c.text}</span></li>)}</ul>}
    </Card>
  )
}

type Db = { id: string; name: string; address: string; secretName: string | null; checkOk?: boolean | null; checkDetail?: string | null; checkedAt?: string | null; kind: string; stage: string; isLive?: boolean }

/** PROD only: other databases PROD connects itself (listed + checked; nothing is moved into them for now). */
function OtherDatabases() {
  const list = useLoad(() => admin<{ connections: Db[] }>('connections'), 'other-dbs')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [link, setLink] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (list.error) return <ErrorBox message={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />
  const rows = list.data.connections.filter((c) => c.kind === 'database' && c.stage === 'prod' && !c.isLive)
  const ref = refOf(link)
  const connect = async () => {
    setBusy('new'); setError(null)
    const secretName = otherDbKey(name)
    try {
      await admin('save_key', { name: secretName, label: `${name.trim()} database key`, rotateDays: 90, note: null, reason: 'Connect a database' })
      const saved = await admin<{ connection?: { id: string } }>('save_connection', { kind: 'database', name: name.trim(), stage: 'prod', address: ref, branch: null, secretName, note: 'Connected on PROD', reason: 'Connect a database' })
      await replaceKey(secretName, value)
      if (saved.connection?.id) await checkConnection(saved.connection.id)
      setAdding(false); setName(''); setLink('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Not connected.') }
    setValue(''); setBusy(null); list.reload()
  }
  const check = async (c: Db) => {
    setBusy(c.id); setError(null)
    try { await checkConnection(c.id) } catch (e) { setError(e instanceof Error ? e.message : 'The check did not run.') }
    setBusy(null); list.reload()
  }
  const remove = async (c: Db) => {
    setBusy(c.id); setError(null)
    try {
      await admin('delete_connection', { id: c.id, reason: 'Removed on Connections' })
      if (c.secretName) { await removeKey(c.secretName); await admin('delete_key', { name: c.secretName, reason: 'Removed on Connections' }) }
    } catch (e) { setError(e instanceof Error ? e.message : 'Not removed.') }
    setBusy(null); list.reload()
  }
  return (
    <Card title="Other databases (connected here)" action={<button type="button" className="button small primary" onClick={() => setAdding(!adding)}>+ Connect a database</button>}>
      {error && <ErrorBox message={error} />}
      {rows.length === 0 && !adding && <p className="sub">None yet. Only PROD can connect one; for now it is listed and checked, nothing is moved into it.</p>}
      {rows.length > 0 && <div className="table-wrap"><table className="table"><tbody>{rows.map((c) => (
        <tr key={c.id}><td><b>{c.name}</b></td><td className="sub">{c.address}</td>
          <td>{c.checkOk == null ? <Badge>Not checked</Badge> : <Badge tone={c.checkOk ? 'good' : 'critical'}>{c.checkOk ? 'Working' : 'Not working'}</Badge>} <span className="sub">{c.checkDetail ?? ''}{c.checkedAt ? `, ${formatAgo(c.checkedAt)}` : ''}</span></td>
          <td><button type="button" className="button small" disabled={busy !== null} onClick={() => void check(c)}>{busy === c.id ? '…' : 'Check'}</button>{' '}
            <button type="button" className="button small danger" disabled={busy !== null} onClick={() => void remove(c)}>Remove</button></td></tr>))}</tbody></table></div>}
      {adding && <OpensInView><form className="plan-form" onSubmit={(event) => { event.preventDefault(); void connect() }}>
        <label className="field"><span>1 · Name (what it is for)</span><input maxLength={60} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="field"><span>2 · Its Supabase project link</span><input placeholder="https://….supabase.co" value={link} onChange={(event) => setLink(event.target.value)} />{link && !ref && <span className="sub">Paste the project link (https://…supabase.co).</span>}</label>
        <label className="field"><span>3 · Its database key (Connect › Session pooler, with the password; sent once, never shown again)</span><input type="password" autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} /></label>
        <p className="sub">4 · Connect = saved into PROD's secrets, then checked: PROD reaches it and reads its SQL version. Remove later takes it off and deletes its key.</p>
        <div className="dialog-actions">
          <button type="button" className="button" disabled={busy !== null} onClick={() => setAdding(false)}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy !== null || !name.trim() || !ref || !/^postgres(ql)?:\/\//.test(value.trim())}>{busy === 'new' ? 'Connecting…' : 'Connect'}</button>
        </div>
      </form></OpensInView>}
    </Card>
  )
}

function HandList() {
  const [tab, setTab] = useState<'Connections' | 'Keys'>('Connections')
  const [pending, setPending] = useState<Pending | null>(null)
  const [confirm, setConfirm] = useState('')
  const [bump, setBump] = useState(0)
  return (
    <details className="conn-more">
      <summary>More: the hand-typed list of each stage's parts, and every key's change dates</summary>
      <div className="tabs" role="tablist">
        {(['Connections', 'Keys'] as const).map((name) => <button type="button" role="tab" key={name} aria-selected={tab === name} className={`tab ${tab === name ? 'is-on' : ''}`} onClick={() => setTab(name)}>{name}</button>)}
      </div>
      {tab === 'Connections' ? <Stages ask={(next) => { setConfirm(''); setPending(next) }} bump={bump} />
        : <Keys ask={(next) => { setConfirm(''); setPending(next) }} bump={bump} />}
      {pending && (
        <ConfirmDialog title={pending.title} action="Confirm" danger={pending.danger} onClose={() => setPending(null)}
          onDone={async (reason) => { await pending.run(reason, confirm); setBump((n) => n + 1) }}>
          <p>{pending.text} It goes in the audit log and sends an alert.</p>
          {pending.prod && <label className="field"><span>Type PROD to confirm</span><input value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" /></label>}
        </ConfirmDialog>
      )}
    </details>
  )
}

function Stages({ ask, bump }: { ask: (pending: Pending) => void; bump: number }) {
  const { data, error, reload } = useLoad(() => admin<{ connections: Connection[] }>('connections'), `connections|${bump}`)
  const [draft, setDraft] = useState<Connection | null>(null)
  const [checking, setChecking] = useState<string | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <Loading />
  const set = (change: Partial<Connection>) => setDraft((current) => (current ? { ...current, ...change } : current))
  async function check(id: string) {
    setChecking(id); setCheckError(null)
    try { await checkConnection(id); reload() } catch (failure) { setCheckError(failure instanceof Error ? failure.message : 'The check did not run.') } finally { setChecking(null) }
  }
  function save(c: Connection) {
    const { id, kind, name, stage, address, branch, secretName, note } = c
    ask({ title: id ? 'Save this connection?' : 'Add this connection?', text: 'This changes the connection list; nothing is deployed.', run: async (reason) => {
      await admin('save_connection', { ...(id ? { id } : {}), kind, name, stage, address, branch: kind === 'repo' ? branch || null : null, secretName: secretName || null, note: note || null, reason })
      setDraft(null)
    } })
  }
  const makeLive = (c: Connection) => ask({ title: `Make ${c.name} the Live ${KINDS.find((k) => k.kind === c.kind)!.title.toLowerCase()} for ${c.stage.toUpperCase()}?`, prod: c.stage === 'prod', danger: c.stage === 'prod',
    text: 'This only marks which one is Live; it moves nothing.',
    run: (reason, confirm) => admin('set_live', { id: c.id, reason, ...(c.stage === 'prod' ? { confirm } : {}) }) })
  return (
    <>
      {checkError && <ErrorBox message={checkError} />}
      {STAGES.map(([stage, stageName]) => {
        const rows = data.connections.filter((c) => c.stage === stage)
        return (
          <Card key={stage} className={stage === 'prod' ? 'card-prod' : ''} title={<>{stageName}{stage === 'prod' && <> <Badge tone="warning">Live customers</Badge></>}</>}
            action={<button type="button" className="button small" onClick={() => setDraft({ kind: 'repo', name: '', stage, address: '', branch: null, secretName: null, note: null })}>Add</button>}>
            {rows.length === 0 && <p className="muted">Nothing added for {stageName} yet.</p>}
            {KINDS.filter(({ kind }) => rows.some((c) => c.kind === kind)).map(({ kind, title }) => (
              <div key={kind} className="conn-group">
                <h3 className="conn-kind">{title}s</h3>
                <ul className="list">
                  {rows.filter((c) => c.kind === kind).map((c) => (
                    <li key={c.id} className={c.isLive ? 'conn-live' : ''}>{c.isLive ? <Badge tone="good">Live</Badge> : <Badge>Standby</Badge>} <strong>{c.name}</strong> {status(c)}{' '}
                      <a href={link(c)} target="_blank" rel="noreferrer" className="conn-link">Open <ExternalLink size={14} aria-hidden="true" /></a>
                      <span className="sub">{c.address}{c.branch ? ` · branch ${c.branch}` : ''}{c.secretName ? ` · key ${c.secretName}` : ' · no key'}{c.checkedAt ? ` · ${c.checkDetail ?? ''}, ${formatAgo(c.checkedAt)}` : ''}{c.note ? ` · ${c.note}` : ''}</span>{' '}
                      {!c.isLive && <><button type="button" className={`button small ${stage === 'prod' ? 'danger' : ''}`} onClick={() => makeLive(c)}>{stage === 'prod' ? 'Make Live on Prod…' : 'Make Live…'}</button>{' '}</>}
                      <button type="button" className="button small" disabled={checking === c.id} onClick={() => check(c.id!)}>{checking === c.id ? 'Checking…' : 'Check'}</button>{' '}
                      <button type="button" className="button small" onClick={() => setDraft({ ...c })}>Edit</button>{' '}
                      {!c.isLive && <button type="button" className="button small" onClick={() => ask({ title: `Remove ${c.name}?`, danger: true, text: 'This takes it off the list.', run: (reason) => admin('delete_connection', { id: c.id, reason }) })}>Remove</button>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {draft?.stage === stage && (
              <OpensInView><div className="plan-form">
                <label className="field"><span>Kind</span><select value={draft.kind} disabled={Boolean(draft.id)} onChange={(event) => set({ kind: event.target.value as Kind })}>{KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.title}</option>)}</select></label>
                <label className="field"><span>Name</span><input maxLength={60} value={draft.name} onChange={(event) => set({ name: event.target.value })} /></label>
                <label className="field"><span>Stage</span><select value={draft.stage} onChange={(event) => set({ stage: event.target.value })}>{STAGES.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
                <label className="field"><span>{KINDS.find((k) => k.kind === draft.kind)!.address}</span><input maxLength={300} placeholder={KINDS.find((k) => k.kind === draft.kind)!.example} value={draft.address} onChange={(event) => set({ address: event.target.value.trim() })} /></label>
                {draft.kind === 'repo' && <label className="field"><span>Branch (blank: the repo's main branch)</span><input maxLength={100} value={draft.branch ?? ''} onChange={(event) => set({ branch: event.target.value.trim() || null })} /></label>}
                <label className="field"><span>Key name (optional, starts CONN_)</span><input maxLength={70} placeholder="CONN_UAT_DB" value={draft.secretName ?? ''} onChange={(event) => set({ secretName: event.target.value.trim().toUpperCase() || null })} /></label>
                <label className="field"><span>Note (optional)</span><input maxLength={300} value={draft.note ?? ''} onChange={(event) => set({ note: event.target.value || null })} /></label>
                <div className="dialog-actions">
                  <button type="button" className="button" onClick={() => setDraft(null)}>Cancel</button>
                  <button type="button" className="button primary" disabled={!draft.name.trim() || !draft.address} onClick={() => save(draft)}>Save…</button>
                </div>
              </div></OpensInView>
            )}
          </Card>
        )
      })}
    </>
  )
}

function Keys({ ask, bump }: { ask: (pending: Pending) => void; bump: number }) {
  const { data, error, reload } = useLoad(() => admin<{ keys: Key[]; unlisted: string[] }>('keys'), `keys|${bump}`)
  const [draft, setDraft] = useState<Key | null>(null)
  const [replacing, setReplacing] = useState<Key | null>(null)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <Loading />
  const set = (change: Partial<Key>) => setDraft((current) => (current ? { ...current, ...change } : current))
  function save(k: Key) {
    const { name, label, rotateDays, note } = k
    ask({ title: 'Save this key’s details?', text: 'Only the name and how often it changes; never the key itself.', run: async (reason) => {
      await admin('save_key', { name, label, rotateDays, note: note || null, reason })
      setDraft(null)
    } })
  }
  async function replace(k: Key) {
    setBusy(true); setMessage(null)
    try {
      await replaceKey(k.name, value)
      setMessage({ ok: true, text: `${k.label} changed and working. Next change due in ${k.rotateDays} days.` })
      setReplacing(null); reload()
    } catch (failure) {
      setMessage({ ok: false, text: failure instanceof Error ? failure.message : 'The key was not changed.' })
    } finally { setValue(''); setBusy(false) }
  }
  return (
    <>
      {message && (message.ok ? <Card><Badge tone="good">Done</Badge> {message.text}</Card> : <ErrorBox message={message.text} />)}
      <Card title="Keys" action={<button type="button" className="button small" onClick={() => setDraft({ ...BLANK_KEY })}>Add key</button>}>
        <p className="muted">Make the new key on its own site first (Supabase, GitHub or Firebase), then Replace key here. It is tried on everything that uses it before it is saved; if it doesn't work, nothing changes.</p>
        {data.unlisted.length > 0 && <p>Used by connections but not listed yet: {data.unlisted.map((name) => <button type="button" key={name} className="button small" onClick={() => setDraft({ ...BLANK_KEY, name, label: name })}>{name}</button>)}</p>}
        {data.keys.length === 0 && <p className="muted">No keys listed yet.</p>}
        <ul className="list">
          {data.keys.map((k) => (
            <li key={k.name}><Badge tone={DUE[k.status!][1]}>{DUE[k.status!][0]}</Badge> <strong>{k.label}</strong> <code>{k.name}</code>
              <span className="sub">Due {formatDate(k.dueOn)} (every {k.rotateDays} days) · {k.changedAt ? `changed ${formatAgo(k.changedAt)} by ${k.changedBy}` : 'not changed here yet'} · kept in Supabase Edge secrets{k.usedBy?.length ? ` · used by ${k.usedBy.map((c) => `${c.name} (${c.stage.toUpperCase()})`).join(', ')}` : ''}{k.note ? ` · ${k.note}` : ''}</span>{' '}
              <button type="button" className="button small primary" onClick={() => { setValue(''); setMessage(null); setReplacing(k) }}>Replace key…</button>{' '}
              <button type="button" className="button small" onClick={() => setDraft({ ...k })}>Edit</button>{' '}
              {!k.usedBy?.length && <button type="button" className="button small" onClick={() => ask({ title: `Take ${k.name} off the list?`, danger: true, text: 'The secret itself stays where it is.', run: (reason) => admin('delete_key', { name: k.name, reason }) })}>Remove</button>}
              {replacing?.name === k.name && (
                <OpensInView><form className="plan-form" onSubmit={(event) => { event.preventDefault(); void replace(k) }}>
                  <label className="field"><span>New value for {k.name} (sent once, never shown again)</span><input type="password" autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} /></label>
                  <div className="dialog-actions">
                    <button type="button" className="button" disabled={busy} onClick={() => { setValue(''); setReplacing(null) }}>Cancel</button>
                    <button type="submit" className="button primary" disabled={busy || value.trim().length < 10}>{busy ? 'Trying it…' : 'Try and save'}</button>
                  </div>
                </form></OpensInView>
              )}
            </li>
          ))}
        </ul>
        {draft && (
          <OpensInView><div className="plan-form">
            <label className="field"><span>Key name (starts CONN_)</span><input maxLength={70} value={draft.name} disabled={Boolean(draft.changedAt !== undefined)} onChange={(event) => set({ name: event.target.value.trim().toUpperCase() })} /></label>
            <label className="field"><span>What it is</span><input maxLength={80} placeholder="UAT database key" value={draft.label} onChange={(event) => set({ label: event.target.value })} /></label>
            <label className="field"><span>Change every (days)</span><input inputMode="numeric" value={draft.rotateDays} onChange={(event) => set({ rotateDays: /^\d+$/.test(event.target.value) ? Number(event.target.value) : 0 })} /></label>
            <label className="field"><span>Note (optional)</span><input maxLength={300} value={draft.note ?? ''} onChange={(event) => set({ note: event.target.value || null })} /></label>
            <div className="dialog-actions">
              <button type="button" className="button" onClick={() => setDraft(null)}>Cancel</button>
              <button type="button" className="button primary" disabled={!/^CONN_[A-Z0-9_]+$/.test(draft.name) || !draft.label.trim() || draft.rotateDays < 1} onClick={() => save(draft)}>Save…</button>
            </div>
          </div></OpensInView>
        )}
      </Card>
    </>
  )
}
