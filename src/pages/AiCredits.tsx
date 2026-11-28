import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Card, ErrorBox, Facts, Loading } from '../components/ui'
import { checkedAfter, priceNote } from '../lib/aiPriceNotes'
import { formatDateTime, formatNumber } from '../lib/format'
import { admin } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'
import { MODES, modesForm, readModesForm, type ModeKey, type Modes, type ModesForm, type Step } from '../lib/aiModes'

// AI credits: what a customer's account has left and every entry (given, bought, used), and what AI use costs.
// Finance gives credits (they never end) and changes the prices; both need a reason and go in the audit log.

type Balance = { month: number; kept: number; left: number; givenThisMonth: number; usedThisMonth: number }
type Entry = { id: string; kind: 'month' | 'free' | 'bought' | 'grant' | 'use'; pool: string; credits: number; usd: number | null; service: string | null
  reason: string | null; byAdmin: string | null; business: string | null; store: string | null; person: string | null; createdAt: string }
type Model = { in: number; cached?: number; out?: number; perMChars?: number }
type Prices = { inrPerCredit: number; markup: number; usdInr: number; filterCredits: number; dailyPerPerson: number; models: Record<string, Model>; checked?: string[] }

const KIND: Record<Entry['kind'], string> = { month: 'Plan, this month', free: 'Free plan, once', bought: 'Bought', grant: 'Given by us', use: 'Used' }

/** Customer 360 > AI credits. */
export function CustomerAiCredits({ profileId, canGive }: { profileId: string; canGive: boolean }) {
  const { data, error, reload } = useLoad(() => admin<{ balance: Balance; usdThisMonth: number; entries: Entry[] }>('ai_credits', { profileId }), profileId)
  const [credits, setCredits] = useState('')
  const [giving, setGiving] = useState(false)
  const [formError, setFormError] = useState('')
  if (error) return <Card title="AI credits"><ErrorBox message={error} onRetry={reload} /></Card>
  if (!data) return <Loading />
  const b = data.balance
  const n = Number(credits)
  return (
    <>
      <Card title="AI credits">
        <Facts items={[
          ['Left', <strong key="left">{formatNumber(b.left)}</strong>],
          ['From this month’s plan', `${formatNumber(b.month)} of ${formatNumber(b.givenThisMonth)} (end with the month)`],
          ['Kept (bought, given, Free’s)', `${formatNumber(b.kept)} (never end)`],
          ['Used this month', formatNumber(b.usedThisMonth)],
          ['Our real cost this month', `$${Number(data.usdThisMonth).toFixed(4)}`],
        ]} />
        {canGive && (
          <div className="dialog-actions">
            <label className="field"><span>Give credits</span><input inputMode="numeric" value={credits} onChange={(event) => setCredits(event.target.value.replace(/\D/g, ''))} /></label>
            <button type="button" className="button primary" onClick={() => {
              if (!Number.isInteger(n) || n < 1 || n > 100000) { setFormError('Write a number from 1 to 1,00,000.'); return }
              setFormError(''); setGiving(true)
            }}>Give…</button>
          </div>
        )}
        {formError && <ErrorBox message={formError} />}
      </Card>
      <Card title={`Entries (${data.entries.length}${data.entries.length === 200 ? ', newest 200' : ''})`}>
        {data.entries.length === 0 ? <p className="muted">No AI credits yet.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>What</th><th>Credits</th><th>Where, who</th><th>Note</th></tr></thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDateTime(e.createdAt)}</td>
                    <td>{e.kind === 'use' ? <Badge>{KIND.use}</Badge> : <Badge tone="good">{KIND[e.kind]}</Badge>}{e.service && <span className="sub">{e.service}</span>}</td>
                    <td>{e.credits > 0 ? `+${formatNumber(e.credits)}` : formatNumber(e.credits)}{e.pool === 'month' && <span className="sub">month</span>}</td>
                    <td>{[e.business, e.store, e.person].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{e.reason ?? ''}{e.byAdmin && <span className="sub">{e.byAdmin}</span>}{e.usd != null && <span className="sub">${Number(e.usd).toFixed(5)}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {giving && (
        <ConfirmDialog title="Give AI credits?" action="Give" onClose={() => setGiving(false)}
          onDone={async (reason) => { await admin('give_ai_credits', { profileId, credits: n, reason }); setCredits(''); reload() }}>
          <p>{formatNumber(n)} credits go to this account and never end. It goes in the audit log.</p>
        </ConfirmDialog>
      )}
    </>
  )
}

type Row = { name: string; in: string; cached: string; out: string; perMChars: string }
const toRows = (models: Record<string, Model>): Row[] => Object.entries(models).map(([name, m]) =>
  ({ name, in: String(m.in ?? ''), cached: m.cached == null ? '' : String(m.cached), out: m.out == null ? '' : String(m.out), perMChars: m.perMChars == null ? '' : String(m.perMChars) }))

/** Plans & prices > What AI use costs. */
export function AiPrices() {
  const { data, error, reload } = useLoad(() => admin<{ prices: Prices }>('ai_prices'), 'ai_prices')
  const [form, setForm] = useState<{ inrPerCredit: string; markup: string; usdInr: string; filterCredits: string; dailyPerPerson: string; rows: Row[] } | null>(null)
  const [pending, setPending] = useState<(Prices & { done?: string }) | null>(null)
  const [formError, setFormError] = useState('')
  if (error) return <Card title="What AI use costs"><ErrorBox message={error} onRetry={reload} /></Card>
  if (!data) return <Loading />
  const p = data.prices
  const setRow = (i: number, change: Partial<Row>) => setForm((f) => f && { ...f, rows: f.rows.map((r, j) => (j === i ? { ...r, ...change } : r)) })

  function review() {
    if (!form) return
    const num = (s: string) => (s.trim() === '' ? undefined : Number(s))
    const models: Record<string, Model> = {}
    for (const r of form.rows) {
      const name = r.name.trim()
      if (!name) continue
      const m: Model = { in: Number(r.in) }
      for (const k of ['cached', 'out', 'perMChars'] as const) { const v = num(r[k]); if (v !== undefined) m[k] = v }
      if ([m.in, m.cached, m.out, m.perMChars].some((v) => v !== undefined && !Number.isFinite(v))) { setFormError(`Check the numbers for ${name}.`); return }
      models[name] = m
    }
    if (!models.default) { setFormError('Keep a model named default: it prices any model not listed.'); return }
    const top = { inrPerCredit: Number(form.inrPerCredit), markup: Number(form.markup), usdInr: Number(form.usdInr), filterCredits: Number(form.filterCredits), dailyPerPerson: Number(form.dailyPerPerson) }
    if (Object.values(top).some((v) => !Number.isFinite(v))) { setFormError('Check the numbers.'); return }
    setFormError('')
    setPending({ ...top, models, checked: checkedAfter(p.models ?? {}, p.checked, models) })
  }

  return (
    <Card title="What AI use costs" action={form === null ? <button type="button" className="button small" onClick={() => {
      setFormError('')
      setForm({ inrPerCredit: String(p.inrPerCredit ?? ''), markup: String(p.markup ?? ''), usdInr: String(p.usdInr ?? ''), filterCredits: String(p.filterCredits ?? ''),
        dailyPerPerson: String(p.dailyPerPerson ?? ''), rows: toRows(p.models ?? {}) })
    }}>Edit</button> : undefined}>
      <p className="muted">Each AI answer costs credits = our real cost in USD × USD to ₹ × markup ÷ ₹ per credit, rounded up. A task the app’s own filter finishes costs the filter credits. Model prices are USD per million tokens (voice: per million letters).</p>
      {form === null ? (
        <>
          <ul className="list">
            <li>One credit: ₹{p.inrPerCredit} · Markup: {p.markup}× · USD to ₹: {p.usdInr}</li>
            <li>Filter only: {p.filterCredits} credits · Most AI answers a person a day: {p.dailyPerPerson}</li>
          </ul>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Model</th><th>In</th><th>Cached in</th><th>Out</th><th>Per million letters</th></tr></thead>
              <tbody>
                {Object.entries(p.models ?? {}).map(([name, m]) => (
                  <tr key={name}><td><strong>{name}</strong>{priceNote(name, p.checked) && (
                    <span className="stack"><Badge tone="warning">Price to check</Badge><span className="sub">{priceNote(name, p.checked)}</span>
                      <button type="button" className="button small" onClick={() => setPending({ inrPerCredit: p.inrPerCredit, markup: p.markup, usdInr: p.usdInr, filterCredits: p.filterCredits, dailyPerPerson: p.dailyPerPerson,
                        models: p.models, checked: [...(p.checked ?? []), name], done: name })}>Done</button></span>)}</td><td>{m.in}</td><td>{m.cached ?? '—'}</td><td>{m.out ?? '—'}</td><td>{m.perMChars ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="plan-form">
            <label className="field"><span>₹ per credit</span><input inputMode="decimal" value={form.inrPerCredit} onChange={(event) => setForm({ ...form, inrPerCredit: event.target.value })} /></label>
            <label className="field"><span>Markup (×, at least 1)</span><input inputMode="decimal" value={form.markup} onChange={(event) => setForm({ ...form, markup: event.target.value })} /></label>
            <label className="field"><span>USD to ₹</span><input inputMode="decimal" value={form.usdInr} onChange={(event) => setForm({ ...form, usdInr: event.target.value })} /></label>
            <label className="field"><span>Filter only (credits)</span><input inputMode="numeric" value={form.filterCredits} onChange={(event) => setForm({ ...form, filterCredits: event.target.value })} /></label>
            <label className="field"><span>Most AI answers a person a day</span><input inputMode="numeric" value={form.dailyPerPerson} onChange={(event) => setForm({ ...form, dailyPerPerson: event.target.value })} /></label>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Model</th><th>In</th><th>Cached in</th><th>Out</th><th>Per million letters</th><th /></tr></thead>
              <tbody>
                {form.rows.map((r, i) => (
                  <tr key={i}>
                    <td><input aria-label="Model name" value={r.name} onChange={(event) => setRow(i, { name: event.target.value })} /></td>
                    {(['in', 'cached', 'out', 'perMChars'] as const).map((k) => (
                      <td key={k}><input aria-label={`${r.name} ${k}`} inputMode="decimal" value={r[k]} onChange={(event) => setRow(i, { [k]: event.target.value })} /></td>
                    ))}
                    <td>{r.name !== 'default' && <button type="button" className="button small" onClick={() => setForm({ ...form, rows: form.rows.filter((_, j) => j !== i) })}>Remove</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="button small" onClick={() => setForm({ ...form, rows: [...form.rows, { name: '', in: '', cached: '', out: '', perMChars: '' }] })}>Add a model</button>
          {formError && <ErrorBox message={formError} />}
          <div className="dialog-actions">
            <button type="button" className="button" onClick={() => setForm(null)}>Cancel</button>
            <button type="button" className="button primary" onClick={review}>Save…</button>
          </div>
        </>
      )}
      {pending && (
        <ConfirmDialog title={pending.done ? 'Price checked?' : 'Save what AI use costs?'} action={pending.done ? 'Done' : 'Save'} onClose={() => setPending(null)}
          onDone={async (reason) => { const { done: _done, checked, ...prices } = pending; await admin('save_ai_prices', { ...prices, ...(checked?.length ? { checked } : {}), reason }); setForm(null); reload() }}>
          <p>{pending.done ? `The note on ${pending.done} goes away. Its price stays as it is.` : 'Every AI answer from now on is charged at these prices. Credits already used stay as they are.'}</p>
        </ConfirmDialog>
      )}
    </Card>
  )
}

/**
 * Plans & prices > AI modes and heavy use (V22, owner 2026-11-15). Each business's owner picks Best / Moderate / Low in
 * Business settings › AI; here: what each costs (credits ×) and which priced model it uses (empty: the AI's own),
 * the heavy-use steps (a business's n-th answer of the day on costs more; the customer is not told) and the plans
 * with the day's share on (monthly credits ÷ days left; past it only bought credits go on, else back at midnight).
 */
export function AiModes({ plans }: { plans: { code: string; name: string }[] }) {
  const { data, error, reload } = useLoad(() => admin<{ prices: Prices & { modes?: Modes; heavyUse?: Step[]; dailySharePlans?: string[] } }>('ai_prices'), 'ai_prices')
  const [form, setForm] = useState<ModesForm | null>(null)
  const [pending, setPending] = useState<ReturnType<typeof readModesForm> | null>(null)
  if (error) return <Card title="AI modes and heavy use"><ErrorBox message={error} onRetry={reload} /></Card>
  if (!data) return <Loading />
  const p = data.prices
  const models = Object.keys(p.models ?? {})
  const read = form ? readModesForm(form, models) : null
  const planName = (code: string) => plans.find((plan) => plan.code === code)?.name ?? code
  const setMode = (key: ModeKey, change: Partial<{ times: string; model: string }>) => form && setForm({ ...form, modes: { ...form.modes, [key]: { ...form.modes[key], ...change } } })
  const setStep = (i: number, change: Partial<{ from: string; times: string }>) => form && setForm({ ...form, steps: form.steps.map((s, j) => (j === i ? { ...s, ...change } : s)) })

  return (
    <Card title="AI modes and heavy use" action={form === null ? <button type="button" className="button small" onClick={() => setForm(modesForm(p.modes, p.heavyUse, p.dailySharePlans))}>Edit</button> : undefined}>
      <p className="muted">Each business’s owner picks Best, Moderate or Low in Business settings › AI (Moderate until they pick). A mode’s credits × multiplies what each AI answer costs; its model is the one the AI uses (empty: the AI’s own). Credits at 0: the AI stops in every mode.</p>
      {form === null ? (
        <ul className="list">
          {MODES.map(([key, name]) => <li key={key}><strong>{name}</strong>: credits ×{p.modes?.[key]?.times ?? 1} · {p.modes?.[key]?.model ?? 'the AI’s own model'}</li>)}
          <li><strong>Heavy use</strong> (a business’s answers today): {p.heavyUse?.length ? p.heavyUse.map((s) => `from answer ${s.from} ×${s.times}`).join(' · ') : 'none'}</li>
          <li><strong>Day’s share</strong> on for: {p.dailySharePlans?.length ? p.dailySharePlans.map(planName).join(', ') : 'no plan'}</li>
        </ul>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Mode</th><th>Credits ×</th><th>Model</th></tr></thead>
              <tbody>
                {MODES.map(([key, name]) => (
                  <tr key={key}>
                    <td><strong>{name}</strong></td>
                    <td><input aria-label={`${name} credits times`} inputMode="decimal" value={form.modes[key].times} onChange={(event) => setMode(key, { times: event.target.value })} /></td>
                    <td><select aria-label={`${name} model`} value={form.modes[key].model} onChange={(event) => setMode(key, { model: event.target.value })}>
                      <option value="">The AI’s own model</option>
                      {models.filter((m) => m !== 'default').map((m) => <option key={m} value={m}>{m}</option>)}
                    </select></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4>Heavy use</h4>
          <p className="muted">Counted per business per day, back to normal at midnight. The customer is not told; credits just go down faster.</p>
          <ul className="list">
            {form.steps.map((s, i) => (
              <li key={i}>
                From answer <input aria-label={`Step ${i + 1} from answer`} inputMode="numeric" value={s.from} onChange={(event) => setStep(i, { from: event.target.value })} />
                {' '}credits × <input aria-label={`Step ${i + 1} credits times`} inputMode="decimal" value={s.times} onChange={(event) => setStep(i, { times: event.target.value })} />
                {' '}<button type="button" className="button small" onClick={() => setForm({ ...form, steps: form.steps.filter((_, j) => j !== i) })}>Remove</button>
              </li>
            ))}
          </ul>
          {form.steps.length < 10 && <button type="button" className="button small" onClick={() => setForm({ ...form, steps: [...form.steps, { from: '', times: '' }] })}>Add a step</button>}
          <h4>Day’s share</h4>
          <p className="muted">On: each morning the day gets the plan credits left ÷ days left in the month. Past it, bought credits go on; with none, the AI rests till midnight (the owner sees Top up).</p>
          {plans.map((plan) => (
            <label key={plan.code} className="check"><input type="checkbox" checked={form.sharePlans.includes(plan.code)}
              onChange={(event) => setForm({ ...form, sharePlans: event.target.checked ? [...form.sharePlans, plan.code] : form.sharePlans.filter((c) => c !== plan.code) })} /> {plan.name}</label>
          ))}
          {read && 'problem' in read && <ErrorBox message={read.problem} />}
          <div className="dialog-actions">
            <button type="button" className="button" onClick={() => setForm(null)}>Cancel</button>
            <button type="button" className="button primary" disabled={!read || 'problem' in read} onClick={() => setPending(read)}>Save…</button>
          </div>
        </>
      )}
      {pending && 'ok' in pending && (
        <ConfirmDialog title="Save AI modes and heavy use?" action="Save" onClose={() => setPending(null)}
          onDone={async (reason) => {
            await admin('save_ai_prices', { inrPerCredit: p.inrPerCredit, markup: p.markup, usdInr: p.usdInr, filterCredits: p.filterCredits, dailyPerPerson: p.dailyPerPerson,
              models: p.models, ...(p.checked?.length ? { checked: p.checked } : {}), ...pending.ok, reason })
            setForm(null); reload()
          }}>
          <p>Every AI answer from now on is charged this way, in every business. Credits already used stay as they are.</p>
        </ConfirmDialog>
      )}
    </Card>
  )
}
