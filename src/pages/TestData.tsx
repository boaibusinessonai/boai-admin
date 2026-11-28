import { useState } from 'react'
import { Badge, Card, ErrorBox, Loading } from '../components/ui'
import { STAGE_NAME, stageOf, type Stage } from '../lib/releases'
import { stageName, supabaseUrl, testData } from '../lib/supabase'
import { BILLS_CARD, cardsFor, contents, copyText, extrasFor, firstStage, GLANCE, HOW_MUCH, howMuch, nextName, NO_OWN, OWN, partLine, partsFor, runParts, SHARED, EXTRAS_PART, stagesFrom,
  startCounts, stepsFor, topPlan, type Counts, type FillAnswer, type HowMuch, type Login, type Made, type OwnCard, type Part, type PartInfo, type Person } from '../lib/testData'
import type { StoreFacts } from '../lib/importTables'
import { useLoad } from '../lib/useLoad'
import { TestDataHead } from '../components/TestDataHead'

// Admin › Test data (owner 2026-11-24; sketch OK'd 2026-11-25, board Main): pick a trade, make a test login with a store on a
// stage and fill what every store gets plus the trade's own parts. Test data makes no bills: the owner makes those in the app.

type Step = { label: string; state: 'done' | 'now' | 'wait' | 'bad' }
type Result = { made?: Made; email: string; business: string; people: Person[]; lines: string[]; appUrl: string | null }
const HERE = stageOf(supabaseUrl, stageName)
const OWN_BY_PART = Object.fromEntries(OWN.map((p) => [p.part, p])) as Record<Part, PartInfo>
const fmtDay = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '')

export function TestData({ role }: { role: string }) {
  const stages = stagesFrom(HERE)
  const [stage, setStage] = useState<Stage | null>(firstStage(stages))
  if (!stage) return <div className="page"><ErrorBox message="Test data runs from the PROD Admin (Build, DEV, SIT or UAT) and from the Build Admin (Build only)." /></div>
  return <TestDataOn key={stage} stage={stage} stages={stages} setStage={setStage} canRemove={role === 'owner'} />
}

function TestDataOn({ stage, stages, setStage, canRemove }: { stage: Stage; stages: Stage[]; setStage: (s: Stage) => void; canRemove: boolean }) {
  const name = STAGE_NAME[stage]
  const types = useLoad(() => testData<{ types: { key: string; name: string }[]; plans: { code: string; name: string }[] }>({ stage, action: 'types' }), stage)
  const [tick, setTick] = useState(0)
  const list = useLoad(() => testData<{ logins: Login[]; appUrl: string | null }>({ stage, action: 'list' }), `${stage}|${tick}`)
  const logins = list.data?.logins ?? []

  const [type, setType] = useState('')
  const typeKey = type || types.data?.types[0]?.key || ''
  const typeName = types.data?.types.find((t) => t.key === typeKey)?.name ?? ''
  const [ownName, setOwnName] = useState<string | null>(null)
  const business = ownName ?? (typeName ? nextName(typeName, logins) : '')
  const [stores, setStores] = useState(1)
  const [plan, setPlan] = useState<string | null>(null)
  const planCode = plan ?? topPlan(types.data?.plans ?? [])
  const [level, setLevel] = useState<HowMuch>('normal')
  const [counts, setCounts] = useState<Counts>(startCounts)
  const [more, setMore] = useState<Login | null>(null)
  // Add more: the login's own trade (its type name back to the key), so box 3 shows its parts.
  const trade = more ? types.data?.types.find((t) => t.name === more.type)?.key ?? null : typeKey
  const own = trade === null ? { own: [] as PartInfo[], soon: [] as { label: string; words: string }[] } : partsFor(trade)
  const cards: OwnCard[] = trade === null ? [] : cardsFor(trade)

  const [steps, setSteps] = useState<Step[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [copied, setCopied] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [typed, setTyped] = useState('')

  const mark = (labels: string[], index: number, state: Step['state'] = 'now') =>
    setSteps(labels.map((label, i) => ({ label, state: i < index ? 'done' : i === index ? state : 'wait' })))

  async function run(target: Login | null) {
    const parts = runParts(counts, trade)
    const labels = stepsFor(counts, !target, trade)
    setBusy(true); setError(''); setResult(null); setCopied(false)
    let at = 0
    const lines: string[] = []
    const people: Person[] = []
    let made: Made | undefined
    let email = target?.email ?? ''
    let appUrl: string | null = list.data?.appUrl ?? null
    try {
      if (!target) {
        mark(labels, 0)
        made = await testData<Made>({ stage, action: 'make', type: typeKey, name: business.trim(), stores, ...(planCode ? { plan: planCode } : {}) })
        email = made.email; appUrl = made.appUrl ?? appUrl
        if (made.storesLater) lines.push(`Stores: ${made.storesLater} not opened (its plan allows ${made.stores}).`)
        at = 2
      }
      for (const p of parts) {
        mark(labels, at)
        const count = howMuch(counts[p.part].n, level, p.max)
        let answer: FillAnswer
        if (p.part === 'extras') {
          const kinds = extrasFor(await testData<StoreFacts>({ stage, action: 'facts', email }))
          answer = kinds.length ? await testData<FillAnswer>({ stage, action: 'fill', email, part: 'extras', count, kinds })
            : { part: 'extras', made: 0, errors: [], more: 0, leftOut: ['This type has no tables of its own in its menu.'] }
        } else {
          answer = await testData<FillAnswer>({ stage, action: 'fill', email, part: p.part, count, ...(p.part === 'consults' ? { label: 'Patient' } : {}) })
        }
        lines.push(...partLine(p.label, answer))
        people.push(...(answer.people ?? []))
        at += 1
      }
      setSteps(labels.map((label) => ({ label, state: 'done' })))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'A step failed.')
      mark(labels, at, 'bad')
    } finally {
      if (email) setResult({ made, email, business: made?.business ?? target?.business ?? '', people, lines, appUrl })
      setBusy(false); setMore(null); setOwnName(null); setTick((n) => n + 1)
    }
  }

  async function remove(email: string) {
    setBusy(true); setError('')
    try {
      await testData({ stage, action: 'remove', email })
      setRemoving(null); setTyped('')
      if (result?.email === email) setResult(null)
      setTick((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The login was not removed.')
    } finally { setBusy(false) }
  }

  const setCount = (part: Part, change: Partial<Counts[Part]>) => setCounts((c) => ({ ...c, [part]: { ...c[part], ...change } }))
  const nothingOn = runParts(counts, trade).length === 0
  // Box 3 (sketch): one card per kind of data; a part's cards share its on/off, the count sits on the card it counts.
  const ownCard = (c: OwnCard) => {
    const p = OWN_BY_PART[c.part]
    return (
      <div className="test-part is-own" key={`${c.part}:${c.label}`}>
        <div className="test-part-head">
          <label><input type="checkbox" checked={counts[c.part].on} disabled={busy} onChange={(e) => setCount(c.part, { on: e.target.checked })} /> <b>{c.label}</b></label>
          {c.fixed !== undefined
            ? <input type="number" value={c.fixed} disabled readOnly aria-label={`How many: ${c.label}`} />
            : <input type="number" min={0} max={p.max} value={counts[c.part].n} aria-label={`How many: ${c.label}`} disabled={busy || !counts[c.part].on || p.max <= 1}
              onChange={(e) => setCount(c.part, { n: Math.min(p.max, Math.max(0, Number(e.target.value) || 0)) })} />}
        </div>
        <small>{c.words}</small>
        {c.fixed === undefined && level !== 'normal' && counts[c.part].on && p.max > 1 && <small className="tone-accent">{HOW_MUCH.find((h) => h.key === level)!.label.split(' (')[0]}: {howMuch(counts[c.part].n, level, p.max)}</small>}
      </div>
    )
  }
  const partCard = (p: PartInfo, ownCard = false) => (
    <div className={`test-part${ownCard ? ' is-own' : ''}`} key={p.part}>
      <div className="test-part-head">
        <label><input type="checkbox" checked={counts[p.part].on} disabled={busy} onChange={(e) => setCount(p.part, { on: e.target.checked })} /> <b>{p.label}</b></label>
        <input type="number" min={0} max={p.max} value={counts[p.part].n} aria-label={`How many: ${p.label}`} disabled={busy || !counts[p.part].on || p.max <= 1}
          onChange={(e) => setCount(p.part, { n: Math.min(p.max, Math.max(0, Number(e.target.value) || 0)) })} />
      </div>
      <small>{p.words}</small>
      {level !== 'normal' && counts[p.part].on && p.max > 1 && <small className="tone-accent">{HOW_MUCH.find((h) => h.key === level)!.label.split(' (')[0]}: {howMuch(counts[p.part].n, level, p.max)}</small>}
    </div>
  )

  return (
    <div className="page">
      <TestDataHead many={stages.length > 1} />
      <div className="chips test-stages" role="group" aria-label="Fill into">
        <span className="sub">Fill into</span>
        {stages.map((s) => <button type="button" key={s} className={`chip${s === stage ? ' is-on' : ''}`} aria-pressed={s === stage} disabled={busy} onClick={() => setStage(s)}>{STAGE_NAME[s]}</button>)}
      </div>

      {types.loading && <Loading />}
      {types.error && <ErrorBox message={types.error} onRetry={types.reload} />}
      {types.data && (
        <div className="test-layout">
          <div className="test-left">
            <Card title={more ? `1 · Add more to ${more.business ?? more.email}` : '1 · The store'}>
              {!more ? (
                <div className="stack-v">
                  <div className="field"><span>Trade</span><small className="muted">Pick one below; the right side changes.</small></div>
                  <div className="chips" role="group" aria-label="Trade">
                    {types.data.types.map((t) => (
                      <button type="button" key={t.key} className={`chip${t.key === typeKey ? ' is-on' : ''}`} aria-pressed={t.key === typeKey} disabled={busy}
                        onClick={() => { setType(t.key); setOwnName(null) }}>{t.name}</button>
                    ))}
                  </div>
                  <label className="field"><span>Business name</span><input value={business} maxLength={120} onChange={(e) => setOwnName(e.target.value)} disabled={busy} /></label>
                  <div className="grid-2">
                    <label className="field"><span>Plan (a year)</span>
                      <select value={planCode} onChange={(e) => setPlan(e.target.value)} disabled={busy}>
                        {types.data.plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                        <option value="">Sign-up plan</option>
                      </select>
                    </label>
                    <label className="field"><span>Stores</span>
                      <select value={stores} onChange={(e) => setStores(Number(e.target.value))} disabled={busy}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                    </label>
                  </div>
                  <label className="field"><span>How much</span>
                    <select value={level} onChange={(e) => setLevel(e.target.value as HowMuch)} disabled={busy}>{HOW_MUCH.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}</select>
                  </label>
                </div>
              ) : (
                <div className="stack-v">
                  <p className="sub">{more.email} · {more.type ?? ''}</p>
                  <label className="field"><span>How much</span>
                    <select value={level} onChange={(e) => setLevel(e.target.value as HowMuch)} disabled={busy}>{HOW_MUCH.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}</select>
                  </label>
                  <button type="button" className="button" disabled={busy} onClick={() => setMore(null)}>Cancel</button>
                </div>
              )}
            </Card>
            <Card title="What you get back (once)">
              <p className="sub">Login email + password · Owner PIN<br />Every sign-in made: Biller, Manager, Doctor, Teacher, Technician … with its PIN<br />Copy all · Open the app</p>
            </Card>
          </div>

          <div className="test-right">
            <Card title="2 · Every store gets" action={<span className="sub">Switch a part off or change its count</span>}>
              <div className="test-parts">
                {SHARED.map((p) => partCard(p))}
                <div className="test-part is-off" aria-disabled="true">
                  <div className="test-part-head"><label><input type="checkbox" checked={false} disabled readOnly /> <b>{BILLS_CARD.label}</b></label><input type="number" value={0} disabled readOnly aria-label={`How many: ${BILLS_CARD.label}`} /></div>
                  <small>{BILLS_CARD.words}</small>
                </div>
              </div>
            </Card>

            <Card title={`3 · ${more ? more.type ?? 'The trade' : typeName}'s own`} className="test-own" action={<span className="sub">Only what this trade's menu shows · built from its own pages</span>}>
              {own.own.length === 0 && <p>{NO_OWN}</p>}
              <div className="test-parts">
                {cards.map(ownCard)}
                {own.soon.map((s) => (
                  <div className="test-part is-soon" key={s.label} aria-disabled="true">
                    <div className="test-part-head"><b>{s.label}</b><Badge>Coming soon</Badge></div>
                    <small>{s.words}</small>
                  </div>
                ))}
                {partCard(EXTRAS_PART, true)}
              </div>
            </Card>

            <div className="stack">
              <button type="button" className="button primary" disabled={busy || nothingOn && !!more || (!more && (!typeKey || !business.trim()))} onClick={() => void run(more)}>
                {more ? 'Add more' : 'Make test store'}
              </button>
              <span className="sub">About 1–3 minutes. Each part shows ✓ as it is done; a part the plan or trade refuses says why and the rest go on.</span>
            </div>
            {steps.length > 0 && (
              <div className="chips" aria-label="Progress">
                {steps.map((s) => <Badge key={s.label} tone={s.state === 'done' ? 'good' : s.state === 'now' ? 'accent' : s.state === 'bad' ? 'critical' : 'neutral'}>{s.label}{s.state === 'done' ? ' ✓' : ''}</Badge>)}
              </div>
            )}
            {error && <ErrorBox message={error} />}

            {result && (
              <Card title={result.made ? `Made: ${result.business}` : `Added to ${result.business || result.email}`} className="test-done">
                {result.made && <p className="notice">Save these now in your password manager. They are shown only once.</p>}
                <dl className="facts">
                  <div><dt>Login email</dt><dd className="secret">{result.email}</dd></div>
                  {result.made && <div><dt>Password</dt><dd className="secret">{result.made.password}</dd></div>}
                  {result.made && <div><dt>Owner PIN</dt><dd className="secret">{result.made.pin}</dd></div>}
                  {result.people.map((p) => <div key={p.name}><dt>{p.name} · {p.role} PIN</dt><dd className="secret">{p.pin}</dd></div>)}
                </dl>
                {result.lines.length > 0 && <ul className="test-lines">{result.lines.map((line) => <li key={line}>{line}</li>)}</ul>}
                <div className="stack">
                  {result.made && <button type="button" className="button" onClick={() => { void navigator.clipboard.writeText(copyText(result.made!, result.people, name)).then(() => setCopied(true)) }}>{copied ? 'Copied' : 'Copy all'}</button>}
                  {result.appUrl && <a className="button" href={result.appUrl} target="_blank" rel="noreferrer">Open the app</a>}
                </div>
              </Card>
            )}

            <Card title="Every trade at a glance">
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Trades</th><th>Their own data</th><th>Now</th></tr></thead>
                <tbody>{GLANCE.map((g) => <tr key={g.trades}><td><b>{g.trades}</b></td><td>{g.parts}</td><td className="nowrap">{g.now}</td></tr>)}</tbody>
              </table></div>
            </Card>
          </div>
        </div>
      )}

      <Card title={`Test stores made on ${name}`}>
        {list.loading && !list.data && <Loading />}
        {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
        {list.data && (logins.length === 0 ? <p className="muted">None yet.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Login</th><th>Business</th><th>Type</th><th>Made</th><th>What's in it</th><th /></tr></thead>
            <tbody>{logins.map((l) => (
              <tr key={l.email}>
                <td>{l.email}</td><td>{l.business ?? '—'}</td><td>{l.type ?? '—'}</td><td>{fmtDay(l.made)}</td><td>{contents(l)}</td>
                <td>{removing === l.email ? (
                  <div className="stack">
                    <input aria-label={`Type ${l.email} to remove it`} placeholder={l.email} value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy} />
                    <button type="button" className="button danger small" disabled={busy || typed.trim().toLowerCase() !== l.email.toLowerCase()} onClick={() => void remove(l.email)}>Remove for good</button>
                    <button type="button" className="button small" disabled={busy} onClick={() => { setRemoving(null); setTyped('') }}>Cancel</button>
                  </div>
                ) : (
                  <div className="stack">
                    <button type="button" className="button small" disabled={busy} onClick={() => { setMore(l); setResult(null); setSteps([]); window.scrollTo(0, 0) }}>Add more</button>
                    {canRemove && <button type="button" className="button small" disabled={busy} onClick={() => { setRemoving(l.email); setTyped('') }}>Remove</button>}
                  </div>
                )}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ))}
        <p className="sub">Remove erases the login and everything in it, including bills you made. You type the login email to confirm.</p>
      </Card>
    </div>
  )
}
