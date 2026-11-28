import { useState, type FormEvent } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Card, ErrorBox, Loading, Stat } from '../components/ui'
import {
  amountWord, breakEvenEven, bytesWord, gbStoredPaise, spacePaise, type SpaceSummary, calcPlans, coinCost, daysTo, everyWord, fixedPaise, KIND_WORD, monthSums, monthWord, payingCount, planRow, plusYear, rs, rsCoin, scenario,
  todayIn, UNIT_WORD, UNITS, unitUse, type CalcPlan, type CostKind, type CostLine, type CostsData, type CostUnit,
} from '../lib/costs'
import type { AdminPlan } from '../lib/planForm'
import { formatDate, formatDateTime, formatNumber } from '../lib/format'
import { admin, AdminError } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'

// Admin › Costs (V116, selling C2; Admin board H7tJ8eg1zwWM4UV8Pii6Ub Costs + Blueprint DM2YsiGbeeJtfvhuLKzsom Costs calculator):
// what running BOAI costs us, typed once per bill (starts empty, S10), and what one customer costs on each plan.
// Lines, history, use per plan and the last 30 days come from admin.costs (V115); the sums are lib/costs.ts.
// Owner and finance (the database refuses support).

type Form = { mode: 'add' } | { mode: 'change'; line: CostLine } | { mode: 'renew'; line: CostLine }
type Pending = { title: string; action: string; danger?: boolean; body: string; run: (reason: string) => Promise<unknown> }

const KINDS = Object.keys(KIND_WORD) as CostKind[]
const OTHER_RISKS = [
  'Voice is priced like text today, though it costs us more.',
  'The model picked for each AI mode is not used by the AI service yet.',
  'The last answer of a month can take a customer\'s coins below zero.',
]

export function Costs() {
  const data = useLoad(() => admin<CostsData>('costs'), 'costs')
  const catalogue = useLoad(() => admin<{ plans: AdminPlan[] }>('plans'), 'plans')
  const [form, setForm] = useState<Form | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [coinMode, setCoinMode] = useState<'real' | 'max'>('real')
  const [usedPct, setUsedPct] = useState('100')
  const [gstIn, setGstIn] = useState(false)
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [usageDraft, setUsageDraft] = useState<Record<string, Partial<Record<CostUnit, string>>>>({})

  if (data.error) return <div className="page"><ErrorBox message={data.error} onRetry={data.reload} /></div>
  if (catalogue.error) return <div className="page"><ErrorBox message={catalogue.error} onRetry={catalogue.reload} /></div>
  if (!data.data || !catalogue.data) return <Loading />
  const { costs, ended, usage, actuals, aiRisks, renewalsDue } = data.data
  const today = todayIn()
  const plans = calcPlans(catalogue.data.plans)
  const coin = coinCost(actuals)
  const coinPaise = (coinMode === 'max' ? coin.max : coin.real) ?? coin.max ?? coin.real ?? 0
  const usedShare = Math.min(100, Math.max(0, Number(usedPct) || 0)) / 100
  const paying = payingCount(plans, actuals)
  const input = { costs, usage, actuals, coinPaise, usedShare, gstInPrice: gstIn, payingCustomers: paying }
  const rows = plans.map((plan) => planRow(plan, input))
  const fixed = fixedPaise(costs)
  const leftMonth = monthSums(rows, fixed).leftPaise
  const be = breakEvenEven(rows, fixed)
  const what = scenario(plans, Object.fromEntries(Object.entries(counts).map(([code, n]) => [code, Math.floor(Number(n) || 0)])), input)
  const unitsInUse = UNITS.filter((unit) => costs.some((c) => c.kind === 'unit' && c.unit === unit))
  const done = () => { setForm(null); data.reload() }

  const end = (line: CostLine) => setPending({ title: `End ${line.name}?`, action: 'End it', danger: true, body: 'It stops from today and stays in the months it ran.',
    run: (reason) => admin('end_cost', { id: line.id, reason }) })
  const saveUsage = (plan: CalcPlan) => {
    const draft = usageDraft[plan.code] ?? {}
    const next = Object.fromEntries(Object.entries(draft).map(([unit, value]) => [unit, value === '' ? 0 : Number(value)]))
    setPending({ title: `Save the use on ${plan.name}?`, action: 'Save', body: 'One account on this plan, a month. Empty = the real last 30 days where we count it.',
      run: async (reason) => { await admin('save_cost_usage', { planCode: plan.code, usage: next, reason }); setUsageDraft((all) => ({ ...all, [plan.code]: {} })) } })
  }

  return (
    <div className="page costs">
      {renewalsDue.length > 0 && <div className="note" role="status">
        {renewalsDue.map((c) => <p key={c.id}><b>{c.name} renews on {formatDate(c.nextDue)}: {rs(c.paise ?? 0)}.</b> Once paid, tap Renewed.{' '}
          <button type="button" className="button small" onClick={() => setForm({ mode: 'renew', line: c })}>Renewed</button></p>)}
      </div>}

      <Card title="What we pay" action={<button type="button" className="button primary" onClick={() => setForm({ mode: 'add' })}>+ Add a cost</button>}>
        {costs.length === 0
          ? <p className="sub">Nothing typed yet. Add each bill once: Supabase, Firebase, the domain, the payment fee, a security check… AI comes by itself (below).</p>
          : <div className="table-wrap"><table className="table costs-table">
            <thead><tr><th>Cost</th><th>Kind</th><th className="num">Amount</th><th>Every / per</th><th>Next renewal</th><th className="num">₹ a month</th><th /></tr></thead>
            <tbody>{costs.map((c) => {
              const days = c.nextDue ? daysTo(c.nextDue, today) : null
              return <tr key={c.id}>
                <td><b>{c.name}</b>{c.note && <span className="sub"> · {c.note}</span>}
                  {c.history && c.history.length > 0 && <details className="cost-history"><summary className="sub">Before ({c.history.length})</summary>
                    <ul>{c.history.map((h) => <li key={h.versionId} className="sub">{amountWord(h)} from {formatDate(h.fromDate)} till {formatDate(h.tillDate)}</li>)}</ul></details>}
                  {c.fromDate > today && <span className="sub"> · from {formatDate(c.fromDate)}</span>}</td>
                <td>{KIND_WORD[c.kind]}</td>
                <td className="num">{amountWord(c)}</td>
                <td>{everyWord(c)}</td>
                <td>{c.kind === 'yearly' ? <>{formatDate(c.nextDue)}{days !== null && days <= 30 && <> <Badge tone="warning">{days < 0 ? 'renewal date passed' : `renews in ${days} days`}</Badge></>}</> : '–'}</td>
                <td className="num">{monthWord(c)}</td>
                <td><div className="stack">
                  {c.kind === 'yearly'
                    ? <button type="button" className="button small" onClick={() => setForm({ mode: 'renew', line: c })}>Renewed</button>
                    : <button type="button" className="button small" onClick={() => setForm({ mode: 'change', line: c })}>Change from a date</button>}
                  {c.kind === 'yearly' && <button type="button" className="button small" onClick={() => setForm({ mode: 'change', line: c })}>Change</button>}
                  <button type="button" className="button small" onClick={() => end(c)}>End</button>
                </div></td>
              </tr>
            })}
            <tr className="cost-ai"><td><b>AI (by itself)</b></td><td>From Admin + real use</td><td className="num">{coin.real !== null ? `${rsCoin(coin.real)} a coin` : '–'}</td><td>real, last 30 days</td><td>–</td><td className="num">by coins used</td><td /></tr>
            </tbody></table></div>}
        <p className="sub">Yearly: amount + next renewal date; the month shows it ÷ 12; 30 days before, you get a reminder ("Domain renews on [date]: ₹[amount]"); after paying tap Renewed (next date + 12 months, new amount if it changed; last year's stays in old months). A monthly bill that changes: "Change from a date" keeps the old amount for old months.</p>
        {ended.length > 0 && <details className="sell-more"><summary>Ended ({ended.length})</summary>
          <ul className="list">{ended.map((c) => <li key={c.versionId}>{c.name} · {KIND_WORD[c.kind]} · {amountWord(c)} · {formatDate(c.fromDate)} – {formatDate(c.tillDate)}</li>)}</ul></details>}
      </Card>

      <div className="grid-2">
        <Card title="AI coins">
          <dl className="facts">
            <div><dt>Our cost per coin, at most (Admin's ₹ per coin ÷ markup)</dt><dd>{coin.max !== null ? rsCoin(coin.max) : 'Set AI prices first'}</dd></div>
            <div><dt>Real, last {actuals.days} days</dt><dd>{coin.real !== null ? `${formatNumber(coin.coins)} coins · ${rsCoin(coin.real)} a coin` : 'No AI used yet'}</dd></div>
          </dl>
          <label className="field"><span>Cost per coin to use below</span>
            <select value={coinMode} onChange={(event) => setCoinMode(event.target.value as 'real' | 'max')}>
              <option value="real" disabled={coin.real === null}>Real {coin.real !== null ? rsCoin(coin.real) : '(none yet)'}</option>
              <option value="max" disabled={coin.max === null}>At most {coin.max !== null ? rsCoin(coin.max) : '(not set)'}</option>
            </select></label>
          <h3>Watch</h3>
          <ul className="cost-risks">
            {aiRisks.map((r) => <li key={r.mode}><Badge tone="critical">Below cost</Badge> AI mode {r.mode}: ×{r.times} with markup ×{r.markup} sells under what it costs us.</li>)}
            {OTHER_RISKS.map((text) => <li key={text}>{text}</li>)}
          </ul>
        </Card>
        <Card title="How we count">
          <label className="field"><span>Share of plan coins really used, %</span><input inputMode="numeric" value={usedPct} onChange={(event) => setUsedPct(event.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={gstIn} onChange={(event) => setGstIn(event.target.checked)} /> Plan prices include GST (18% comes off first)</label>
          <p className="sub">Fixed costs are shared by the paying customers ({formatNumber(paying)} in the last {actuals.days} days). Free customers cost AI once and what they use; they pay nothing.
            Space for photos is {actuals.spaceCounted ? 'counted' : 'not counted yet'}. Database today: {formatNumber(Math.round(actuals.dbBytes / 1048576))} MB
            {actuals.dbBytesPerAccount !== null && <> ({formatNumber(Math.round(actuals.dbBytesPerAccount / 1024))} KB an account)</>}.</p>
        </Card>
      </div>

      <SpacePerStore space={actuals.space} costs={costs} />

      <Card title="Per plan">
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Plan</th><th className="num">Customers</th><th className="num">Price</th><th className="num">AI</th><th className="num">Other</th><th className="num">Fixed share</th><th className="num">Fee</th><th className="num">Our cost each</th><th className="num">Left each</th><th className="num">Margin</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.plan.code}>
            <td>{r.plan.name}</td><td className="num">{formatNumber(r.customers)}</td><td className="num">{rs(r.pricePaise)}</td><td className="num">{rs(r.aiPaise)}</td>
            <td className="num">{rs(r.otherPaise)}</td><td className="num">{rs(r.fixedShare)}</td><td className="num">{rs(r.feePaise)}</td><td className="num">{rs(r.costPaise)}</td>
            <td className={`num${r.leftPaise < 0 ? ' is-neg' : ''}`}>{rs(r.leftPaise)}</td>
            <td className={`num${r.leftPaise < 0 ? ' is-neg' : ''}`}>{r.margin === null ? '–' : `${(r.margin * 100).toFixed(1)}%`}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="stats compact">
          <Stat label="Fixed a month" value={rs(fixed)} hint="monthly + yearly ÷ 12 + once spread" />
          <Stat label="Paying customers" value={formatNumber(paying)} hint={`last ${actuals.days} days`} />
          <Stat label="Needed to cover fixed" value={fixed === 0 ? '–' : be === null ? 'never at these prices' : formatNumber(be)} hint="spread evenly over the paid plans" />
          <Stat label="Left this month" value={<span className={leftMonth < 0 ? 'is-neg' : ''}>{rs(leftMonth)}</span>} hint="today's customers, less all costs" />
        </div>
      </Card>

      <Card title="Use per customer on each plan">
        {unitsInUse.length === 0
          ? <p className="sub">Add a "Per unit" cost (₹ per GB, per e-invoice, per email…) to say how much one customer uses.</p>
          : <>
            <p className="sub">One account a month. Empty = the real last {actuals.days} days where we count it (stores, businesses, bills), else 0.</p>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Plan</th>{unitsInUse.map((unit) => <th key={unit} className="num">{UNIT_WORD[unit]}</th>)}<th /></tr></thead>
              <tbody>{plans.map((plan) => {
                const actual = actuals.plans.find((a) => a.plan === plan.code)
                const draft = usageDraft[plan.code] ?? {}
                return <tr key={plan.code}><td>{plan.name}</td>
                  {unitsInUse.map((unit) => {
                    const typed = usage[plan.code]?.[unit]
                    const real = unitUse(unit, undefined, actual)
                    return <td key={unit} className="num"><input className="cost-use" inputMode="decimal" aria-label={`${plan.name}: ${UNIT_WORD[unit]}`}
                      value={draft[unit] ?? (typed !== undefined ? String(typed) : '')} placeholder={real.real ? String(Math.round(real.amount * 100) / 100) : '0'}
                      onChange={(event) => setUsageDraft((all) => ({ ...all, [plan.code]: { ...all[plan.code], [unit]: event.target.value } }))} /></td>
                  })}
                  <td><button type="button" className="button small" disabled={Object.keys(draft).length === 0} onClick={() => saveUsage(plan)}>Save</button></td>
                </tr>
              })}</tbody>
            </table></div>
          </>}
      </Card>

      <Card title="What if">
        <p className="sub">Customers on each plan → money in, profit, what one costs, and how many we need with the same mix.</p>
        <div className="plan-form">
          {plans.map((plan) => <label key={plan.code} className="field"><span>{plan.name}</span>
            <input inputMode="numeric" value={counts[plan.code] ?? ''} placeholder="0" onChange={(event) => setCounts({ ...counts, [plan.code]: event.target.value })} /></label>)}
        </div>
        <div className="stats compact">
          <Stat label="Money in a month" value={rs(what.inPaise)} hint={`${formatNumber(what.paying)} paying of ${formatNumber(what.customers)}`} />
          <Stat label="Profit a month" value={<span className={what.profit < 0 ? 'is-neg' : ''}>{rs(what.profit)}</span>} hint="after fixed costs" />
          <Stat label="Cost each" value={what.costEach === null ? '–' : rs(what.costEach)} hint="fixed included" />
          <Stat label="Customers needed" value={what.customers === 0 ? '–' : what.breakEven === null ? 'never with this mix' : formatNumber(what.breakEven)} hint="to cover fixed, same mix" />
        </div>
      </Card>

      {form && <CostForm form={form} today={today} onClose={() => setForm(null)} onDone={done} />}
      {pending && <ConfirmDialog title={pending.title} action={pending.action} danger={pending.danger}
        onDone={async (reason) => { await pending.run(reason); data.reload() }} onClose={() => setPending(null)}><p>{pending.body}</p></ConfirmDialog>}
    </div>
  )
}

/** Add a cost, change it from a date, or mark a yearly one Renewed. One reason for the audit log. */
function CostForm({ form, today, onClose, onDone }: { form: Form; today: string; onClose: () => void; onDone: () => void }) {
  const line = form.mode === 'add' ? null : form.line
  const [kind, setKind] = useState<CostKind>(line?.kind ?? 'monthly')
  const [name, setName] = useState(line?.name ?? '')
  const [amount, setAmount] = useState(line ? (line.kind === 'percent' ? String(line.percent ?? '') : String((line.paise ?? 0) / 100)) : '')
  const [unit, setUnit] = useState<CostUnit>(line?.unit ?? 'gb_stored')
  const [months, setMonths] = useState(String(line?.months ?? 12))
  const [nextDue, setNextDue] = useState(form.mode === 'renew' && line?.nextDue ? plusYear(line.nextDue) : line?.nextDue ?? '')
  const [fromDate, setFromDate] = useState(today)
  const [note, setNote] = useState(line?.note ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const title = form.mode === 'add' ? 'Add a cost' : form.mode === 'renew' ? `${line!.name}: renewed` : `Change ${line!.name}`

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (reason.trim().length < 3) { setError('Write why (at least a few words).'); return }
    const p: Record<string, unknown> = { reason: reason.trim(), fromDate }
    if (line) p.id = line.id
    else p.kind = kind
    if (form.mode !== 'renew') { p.name = name.trim(); p.note = note.trim() }
    if (kind === 'percent') p.percent = Number(amount)
    else p.rupees = Number(amount)
    if (kind === 'unit') p.unit = unit
    if (kind === 'once') p.months = Number(months)
    if (kind === 'yearly') p.nextDue = nextDue
    if (form.mode === 'renew') p.renewed = true
    setBusy(true); setError('')
    try { await admin('save_cost', p); onDone() } catch (e) { setError(e instanceof AdminError || e instanceof Error ? e.message : 'Something went wrong.') } finally { setBusy(false) }
  }

  return (
    <div className="drawer-back" onClick={busy ? undefined : onClose}>
      <form className="drawer" role="dialog" aria-label={title} onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="drawer-head"><h2>{title}</h2><button type="button" className="button" onClick={onClose} disabled={busy}>Close</button></div>
        {form.mode !== 'renew' && <label className="field"><span>Name</span><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="e.g. Supabase (Prod)" /></label>}
        {form.mode === 'add'
          ? <label className="field"><span>Kind</span><select value={kind} onChange={(event) => setKind(event.target.value as CostKind)}>{KINDS.map((k) => <option key={k} value={k}>{KIND_WORD[k]}</option>)}</select></label>
          : <p className="sub">{KIND_WORD[kind]} (the kind of a cost never changes; end it and add a new one).</p>}
        <label className="field"><span>{kind === 'percent' ? 'Percent of each payment' : kind === 'unit' ? '₹ for each unit' : kind === 'yearly' ? '₹ a year' : kind === 'once' ? '₹ in all' : '₹ a month'}</span>
          <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        {kind === 'unit' && <label className="field"><span>Paid per</span><select value={unit} onChange={(event) => setUnit(event.target.value as CostUnit)}>{UNITS.map((u) => <option key={u} value={u}>{UNIT_WORD[u]}</option>)}</select></label>}
        {kind === 'once' && <label className="field"><span>Spread over months</span><input inputMode="numeric" value={months} onChange={(event) => setMonths(event.target.value)} /></label>}
        {kind === 'yearly' && <label className="field"><span>Next renewal</span><input type="date" value={nextDue} onChange={(event) => setNextDue(event.target.value)} /></label>}
        <label className="field"><span>{form.mode === 'add' ? 'Counts from' : 'New figure from'}</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
        {form.mode !== 'add' && <p className="sub">A later date keeps the old figure for the months before it; today changes it in place.</p>}
        {form.mode !== 'renew' && <label className="field"><span>Note (optional)</span><input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} /></label>}
        <label className="field"><span>Why? (kept in the audit log)</span><textarea rows={2} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        {error && <ErrorBox message={error} />}
        <div className="dialog-actions">
          <button type="button" className="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy}>{busy ? 'Saving…' : form.mode === 'renew' ? 'Save renewal' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}

/** V139: database space per store at the last nightly count, by business type and the 10 biggest stores, with our cost from the GB stored lines. */
function SpacePerStore({ space, costs }: { space?: SpaceSummary; costs: CostLine[] }) {
  if (!space?.measuredAt) return <Card title="Database space per store"><p className="sub">Not counted yet. It is counted every night.</p></Card>
  const gb = gbStoredPaise(costs)
  const cost = (bytes: number) => { const paise = spacePaise(costs, bytes); return paise === null ? '–' : rs(paise) }
  return (
    <Card title="Database space per store">
      <p className="sub">Counted {formatDateTime(space.measuredAt)}: {bytesWord(space.bytes)} in {formatNumber(space.stores)} stores
        {Number(space.files) > 0 && <> + {bytesWord(space.files)} photos</>}. A guess from each table's rows × its average row size.{' '}
        {gb === null ? 'Add a Per unit cost on "GB stored" to see what a store costs us.' : `A GB stored costs us ${rs(gb)} a month.`}</p>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Business type</th><th className="num">Stores</th><th className="num">Space</th><th className="num">A store on average</th><th className="num">Our cost a store, a month</th></tr></thead>
        <tbody>{space.byType.map((t) => {
          const each = Number(t.stores) > 0 ? Number(t.bytes) / Number(t.stores) : 0
          return <tr key={t.type}><td>{t.type}</td><td className="num">{formatNumber(t.stores)}</td><td className="num">{bytesWord(t.bytes)}</td>
            <td className="num">{bytesWord(each)}</td><td className="num">{cost(each)}</td></tr>
        })}</tbody>
      </table></div>
      <h3>Biggest stores</h3>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Store</th><th>Business type</th><th className="num">Space</th><th className="num">Our cost a month</th></tr></thead>
        <tbody>{space.top.map((t) => <tr key={t.storeId}>
          <td><a href={`#/customers/${t.ownerId}`}>{t.store}</a><span className="sub">{t.business}</span></td><td>{t.type}</td>
          <td className="num">{bytesWord(t.bytes)}{Number(t.files) > 0 && <span className="sub">+ {bytesWord(t.files)} photos</span>}</td><td className="num">{cost(t.bytes)}</td>
        </tr>)}</tbody>
      </table></div>
    </Card>
  )
}
