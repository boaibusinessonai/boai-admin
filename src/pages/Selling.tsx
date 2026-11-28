import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Card, ErrorBox, Facts, Loading } from '../components/ui'
import {
  cardReach, cellWord, editId, effective, followers, givesLess, grouped, lockedIn, ownOf, reachedPlans, setEdit, shownLadder, tapCell, upgradeCheck,
  type Edits, type SellCell, type SellGrid, type SellPlan, type SellRow, type SellState,
} from '../lib/selling'
import { navigate } from '../lib/route'
import { admin } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'

// Admin › Selling (V101 read only; V105 editing, selling P3.2, board H7tJ8eg1zwWM4UV8Pii6Ub): everything BOAI sells, on
// every plan. Rows grouped Business add-ons · Store apps · Extras inside a page · One more · AI coins · Plan features; columns =
// the plan ladder Free → Diamond (old options and custom plans in a fold, read only). Tap a cell: as the plan below → In → Buy →
// Upgrade → Hidden → as the plan below; In on a plan stays In above it (those cells are locked). Faded = not set on this plan.
// Tap a name for its card (words, prices per plan, offer, sale, kinds, lock places), a plan name for its plan card. Save asks
// "How should this apply?" with counts only; admin.sell_save → Entitlements' app.sell_save (the one writer).

const STATE_WORD = { in: 'In: included', buy: 'Locked: buy alone', upgrade: 'Locked: comes with a bigger plan', hidden: 'Hidden' } as const
const PLACE_WORD: Record<string, string> = { menu: 'menu', page: 'inside its page', home: 'Home card' }
const KIND_WORD: Record<SellRow['kind'], string> = { addon: 'Add-on', extra: 'Extra inside a page', feature: 'Plan feature', more: 'One more', coins: 'AI coins' }
const SCOPE_WORD: Record<SellRow['scope'], string> = { business: 'Whole business', store: 'Each store', account: 'Account' }
const Soon = () => <Badge>Coming soon</Badge>

type ApplyTo = 'new' | 'renewal' | 'everyone'
type Reach = { free: boolean; customers: number; older: number; renewSoon: number; byHand: number; addOnBuyers: Record<string, number> }
type RowEdit = Partial<SellRow> & { offerSet?: { price: number; till: string } | null; everyKind?: boolean }
type Saving = { cells: Edits; rows: Record<string, RowEdit>; plans: string[] }
type Types = { types: { key: string; name: string }[] }

export function Selling() {
  const grid = useLoad(() => admin<SellGrid>('sell_grid'), 'sell_grid')
  const [edits, setEdits] = useState<Edits>({})
  const [card, setCard] = useState<SellRow | null>(null)
  const [saving, setSaving] = useState<Saving | null>(null)
  const [market, setMarket] = useState<boolean | null>(null)
  const [included, setIncluded] = useState<boolean | null>(null)
  // BROKEN-35: every tap can be undone before Save (one by one, or all), and the last tap is said in words.
  const [history, setHistory] = useState<Edits[]>([])
  const [said, setSaid] = useState('')
  if (grid.error) return <ErrorBox message={grid.error} onRetry={grid.reload} />
  if (!grid.data) return <Loading />
  const { plans, rows, cells, settings } = grid.data
  const ladder = plans.filter((plan) => plan.ladder)
  const shown = shownLadder(ladder)
  const others = plans.filter((plan) => !shown.includes(plan))
  const count = Object.keys(edits).length
  const done = () => { setEdits({}); setHistory([]); setSaid(''); setSaving(null); setCard(null); grid.reload() }
  const checks = upgradeCheck(rows, ladder, cells, edits).filter((check) => shown.includes(check.plan))
  const name = (code: string) => ladder.find((plan) => plan.code === code)?.name ?? code

  function tap(row: SellRow, index: number) {
    const next = tapCell(row, ladder, cells, edits, index)
    if (next === edits) return
    const plan = ladder[index]!
    const cell = effective(row, ladder, cells, next)[index]
    const above = shown.filter((one) => ladder.indexOf(one) > index).map((one) => one.code)
    const follow = followers(row, ladder, cells, next).filter((code) => above.includes(code)).map(name)
    setHistory([...history, edits])
    setEdits(next)
    setSaid(`${row.name} on ${plan.name}: ${cell?.own?.state ? STATE_WORD[cell.state] : `as the plan below (${STATE_WORD[cell?.state ?? 'hidden']})`}.${follow.length ? ` ${follow.join(', ')} follow${follow.length > 1 ? '' : 's'} it (nothing set there), so ${follow.length > 1 ? 'they change' : 'it changes'} too.` : ''}`)
  }
  const undo = () => { setEdits(history[history.length - 1] ?? {}); setHistory(history.slice(0, -1)); setSaid('') }
  const undoAll = () => { setEdits({}); setHistory([]); setSaid('') }

  return (
    <div className="page selling">
      <Card title="Everything we sell, on every plan" action={<div className="sell-actions">
        {/* V119: Plans & prices left the menu; its list, + New plan, other prices, AI use and Renewal open from here. */}
        <button type="button" className="button" onClick={() => navigate({ page: 'plans' })}>Plans, AI use & other prices</button>
        <button type="button" className="button" disabled={!history.length} onClick={undo}>Undo last</button>
        <button type="button" className="button" disabled={!count} onClick={undoAll}>Undo all</button>
        <button type="button" className={`button${count ? ' primary' : ''}`} disabled={!count}
          onClick={() => setSaving({ cells: edits, rows: {}, plans: reachedPlans(ladder, cells, edits) })}>{count ? `Save ${count} change${count > 1 ? 's' : ''}…` : 'No changes'}</button>
      </div>}>
        <p className="sub">Tap a cell to change it: as the plan below → In → Buy → Upgrade → Hidden (a plan feature has no Buy). Faded = nothing set on that plan: it takes the plan below, so a change flows up into the faded cells above it (they get a dotted ring). Included on a plan stays included on the plans above. Undo last / Undo all before Save; nothing reaches customers until Save. Only plans on offer are shown; the others are in the read-only fold below.</p>
        <div className="sell-legend">
          <span className="sell-cell is-in">In</span> included
          <span className="sell-cell is-buy">₹99</span> locked, buy alone
          <span className="sell-cell is-upgrade">↑ Gold</span> locked, comes with that plan
          <span className="sell-cell is-hidden">–</span> hidden
          <span className="sell-cell is-in is-changed">In</span> you changed it
          <span className="sell-cell is-in is-follows">In</span> follows your change below
        </div>
        {said && <p className="sell-said" role="status">Last tap: {said}</p>}
        <div className="sell-switches">
          <label className="switch"><input type="checkbox" role="switch" aria-label="Sell add-ons to other kinds of business too" checked={settings.marketSellsAll} onChange={() => setMarket(!settings.marketSellsAll)} />
            <span>Sell add-ons to other kinds too: <strong>{settings.marketSellsAll ? 'On' : 'Off'}</strong></span></label>
          <label className="switch"><input type="checkbox" role="switch" aria-label="Included things switch on by themselves" checked={Boolean(settings.includedAutoOn)} onChange={() => setIncluded(!settings.includedAutoOn)} />
            <span>Included things switch on by themselves: <strong>{settings.includedAutoOn ? 'On' : 'Off'}</strong></span></label>
          <span className="sell-switch">Grace days after a plan lapses: <strong>{settings.graceDays}</strong> <button type="button" className="text-button" onClick={() => navigate({ page: 'plans' })}>Plans › Renewal</button></span>
          <span className="sell-switch">Home cards at most <Soon /></span>
          <span className="sell-switch">“Not now” hides for <Soon /></span>
          <span className="sell-switch">Trial reminder before the end <Soon /></span>
        </div>
      </Card>
      <SellTable plans={shown} rows={rows} cells={cells} ladder={ladder} edits={edits} onCard={setCard} onTap={tap} />
      {others.length > 0 && <details className="sell-more">
        <summary>Plans not on offer, old options and custom plans ({others.length}), read only</summary>
        <p className="sub">Put a plan on offer in Plans to change it here. Customers already on these plans keep them; a change on the plan below still reaches them where nothing is set.</p>
        <SellTable plans={others} rows={rows} cells={cells} ladder={ladder} edits={{}} onCard={setCard} />
      </details>}
      <Card title="Upgrade check">
        <p className="sub">The plan below + buying one by one what a plan adds (at the plan below’s prices). Moving up should cost less. Worked out again as you change cells.</p>
        <ul className="sell-checks">
          {checks.map((check) => <li key={check.plan.code} className={check.passes ? 'ok' : 'bad'}>
            <strong>{check.plan.name} ₹{check.plan.monthly.toLocaleString('en-IN')}</strong>
            <span>{check.byParts === null ? `adds something ${check.below.name} can’t buy (${check.adds.join(', ')})` : `${check.below.name} ₹${check.below.monthly.toLocaleString('en-IN')}${check.adds.length ? ` + ${check.adds.join(' + ')}` : ''} = ₹${check.byParts.toLocaleString('en-IN')}`}</span>
            <Badge tone={check.passes ? 'good' : 'warning'}>{check.passes ? 'Moving up is cheaper ✓' : 'Buying the parts is cheaper'}</Badge>
          </li>)}
        </ul>
      </Card>
      {card && <ItemCard row={card} ladder={ladder} shown={shown} cells={cells} edits={edits} onClose={() => setCard(null)}
        onSave={(row, cellEdits) => setSaving({ rows: { [card.key]: row }, cells: cellEdits, plans: Object.keys(row).some((key) => ['price', 'onSale', 'offerSet'].includes(key)) ? cardReach(card, ladder, cells, cellEdits) : reachedPlans(ladder, cells, cellEdits) })} />}
      {saving && <ApplyDialog saving={saving} ladder={ladder} rows={rows} cells={cells} onDone={done} onClose={() => setSaving(null)} />}
      {included !== null && <IncludedDialog on={included} onClose={() => setIncluded(null)} onSaved={() => grid.reload()} />}
      {market !== null && <ConfirmDialog title={market ? 'Sell every add-on to every business?' : 'Sell only each business’s own add-ons?'} action={market ? 'Turn on' : 'Turn off'}
        onDone={async (reason) => { await admin('sell_save', { marketSellsAll: market, reason }); grid.reload() }} onClose={() => setMarket(null)}>
        <p>{market ? 'Every business’s Add-on Market shows every add-on again, e.g. Restaurant for a shop.' : 'Each business’s Add-on Market shows only the add-ons that fit its kind (on each add-on’s card). Add-ons a business already has stay on.'}</p>
      </ConfirmDialog>}
    </div>
  )
}

function SellTable({ plans, rows, cells, ladder, edits, onCard, onTap }: {
  plans: SellPlan[]; rows: SellRow[]; cells: SellGrid['cells']; ladder: SellPlan[]; edits: Edits; onCard: (row: SellRow) => void; onTap?: (row: SellRow, index: number) => void
}) {
  return (
    <div className="table-wrap">
      <table className="table sell-grid">
        <thead><tr><th>Thing sold</th><th>Lock shows</th>{plans.map((plan) => <th key={plan.code}>
          <button type="button" className="text-button" onClick={() => navigate({ page: 'plans', id: plan.code })} title={`${plan.name}: plan card`}>{plan.name}</button>
          <span className="sub">₹{plan.monthly.toLocaleString('en-IN')}</span></th>)}</tr></thead>
        <tbody>
          {grouped(rows).map(({ group, rows: part }) => [
            <tr key={group} className="sell-group"><td colSpan={plans.length + 2}>{group}</td></tr>,
            ...part.map((row) => {
              const eff = onTap ? effective(row, ladder, cells, edits) : []
              const follows = onTap ? followers(row, ladder, cells, edits) : []
              // A plan feature has no On sale of its own (it comes with a plan): only add-ons and extras say "Not on sale" (BROKEN-34).
              const offSale = !row.onSale && (row.kind === 'addon' || row.kind === 'extra')
              return (
                <tr key={row.key}>
                  <td className="sell-name"><button type="button" className="text-button" onClick={() => onCard(row)}>{row.name}</button>
                    {(offSale || !row.ready) && <span className="sub">{!row.ready ? 'Coming soon' : 'Not on sale'}</span>}</td>
                  <td className="sub">{row.places.map((place) => PLACE_WORD[place] ?? place).join(' · ') || '–'}</td>
                  {plans.map((plan) => {
                    const index = ladder.findIndex((one) => one.code === plan.code)
                    const cell: SellCell | undefined = onTap && index >= 0 ? eff[index] : cells[plan.code]?.[row.key]
                    const up = index >= 0 ? upAbove(row, ladder, index, onTap ? eff : null, cells) : null
                    const word = cellWord(row, cell, up)
                    const faded = !cell?.own?.state
                    const changed = Boolean(edits[editId(plan.code, row.key)])
                    const locked = onTap ? lockedIn(eff, index) : true
                    const follow = follows.includes(plan.code)
                    const title = `${row.name} on ${plan.name}: ${STATE_WORD[cell?.state ?? 'hidden']}${faded ? ' (as the plan below)' : ''}${follow ? ', follows your change below' : ''}${onTap && locked ? '. Included below, stays included.' : ''}`
                    const cls = `sell-cell is-${cell?.state ?? 'hidden'}${faded ? ' is-inherited' : ''}${changed ? ' is-changed' : ''}${follow ? ' is-follows' : ''}`
                    return <td key={plan.code}>{onTap && !locked
                      ? <button type="button" className={cls} title={title} aria-label={title} onClick={() => onTap(row, index)}>{word}</button>
                      : <span className={cls} title={title}>{word}</span>}</td>
                  })}
                </tr>
              )
            }),
          ])}
        </tbody>
      </table>
    </div>
  )
}

/** "↑ <plan>": the first ladder plan above where it is In (after the edits when given). */
function upAbove(row: SellRow, ladder: SellPlan[], index: number, eff: SellCell[] | null, cells: SellGrid['cells']) {
  for (let i = index + 1; i < ladder.length; i++) if ((eff ? eff[i] : cells[ladder[i]!.code]?.[row.key])?.state === 'in') return ladder[i]!.name
  return null
}

const priced = (row: SellRow) => row.kind === 'addon' || row.kind === 'extra' || (row.kind === 'more' && row.key !== 'messages')
const num = (text: string) => (text.trim() === '' ? undefined : Number(text))
const whole = (text: string) => text.trim() === '' || /^\d{1,7}$/.test(text.trim())

/** The item card (board): words, kind, price every plan + per plan, offer, on sale, ready, kinds, lock places, packs, customers. */
function ItemCard({ row, ladder, shown, cells, edits, onClose, onSave }: {
  row: SellRow; ladder: SellPlan[]; shown: SellPlan[]; cells: SellGrid['cells']; edits: Edits; onClose: () => void; onSave: (row: RowEdit, cells: Edits) => void
}) {
  const types = useLoad(() => (row.kind === 'addon' ? admin<Types>('business_types', {}) : Promise.resolve({ types: [] } as Types)), `types|${row.kind}`)
  const owners = useLoad(() => (row.kind === 'addon' ? admin<{ customers: Record<string, number> }>('packages') : Promise.resolve({ customers: {} as Record<string, number> })), `packages|${row.kind}`)
  const [name, setName] = useState(row.name)
  const [blurb, setBlurb] = useState(row.blurb ?? '')
  const [base, setBase] = useState(row.price === undefined ? '' : String(row.price))
  const [planPrice, setPlanPrice] = useState<Record<string, string>>(() => Object.fromEntries(ladder.map((plan) => {
    const own = ownOf(cells, edits, plan.code, row.key).price
    return [plan.code, own === undefined ? '' : String(own)]
  })))
  const [offer, setOffer] = useState(row.offer === undefined ? '' : String(row.offer))
  const [till, setTill] = useState(row.offerTill ?? '')
  const [onSale, setOnSale] = useState(row.onSale)
  const [ready, setReady] = useState(row.ready)
  const [everyKind, setEveryKind] = useState(Boolean(row.everyKind))
  const [kinds, setKinds] = useState(row.kinds)
  const [freeWith, setFreeWith] = useState(row.freeWith)
  const [places, setPlaces] = useState(row.places)
  const [packs, setPacks] = useState(() => JSON.stringify(row.packs ?? []))
  const [error, setError] = useState('')
  const addon = row.kind === 'addon'
  const packed = row.kind === 'coins' || row.key === 'messages'
  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((one) => one !== key) : [...list, key].sort())

  function review() {
    setError('')
    const out: RowEdit = {}
    if (name.trim() !== row.name) { if (!name.trim()) return setError('Write a name.'); out.name = name.trim() }
    if (blurb.trim() !== (row.blurb ?? '')) out.blurb = blurb.trim()
    if (priced(row) && base !== (row.price === undefined ? '' : String(row.price))) {
      if (!whole(base) || ((row.kind === 'addon' || row.kind === 'extra') && base.trim() === '')) return setError('Price every plan: a whole number of rupees (to stop selling it, switch off On sale).')
      out.price = num(base)
    }
    if (priced(row) && (offer !== (row.offer === undefined ? '' : String(row.offer)) || till !== (row.offerTill ?? ''))) {
      if (offer.trim() === '' && till === '') out.offerSet = null
      else if (!whole(offer) || offer.trim() === '' || !/^\d{4}-\d{2}-\d{2}$/.test(till)) return setError('Offer: a price and its last day (or both empty).')
      else out.offerSet = { price: Number(offer), till }
    }
    if ((row.kind === 'addon' || row.kind === 'extra') && onSale !== row.onSale) out.onSale = onSale
    if (ready !== row.ready) out.ready = ready
    if (addon) {
      if (everyKind !== Boolean(row.everyKind)) out.everyKind = everyKind
      if (!everyKind && kinds.join() !== row.kinds.join()) { if (!kinds.length) return setError('Tick the kinds of business it fits, or Every kind.'); out.kinds = kinds }
      if (freeWith.join() !== row.freeWith.join()) out.freeWith = freeWith
    }
    if (places.join() !== row.places.join()) out.places = places
    if (packed && packs !== JSON.stringify(row.packs ?? [])) {
      try { out.packs = JSON.parse(packs) as unknown[] } catch { return setError('Packs: keep the layout, change the numbers.') }
    }
    let cellEdits: Edits = {}
    if (priced(row)) for (const plan of ladder) {
      const text = planPrice[plan.code] ?? ''
      if (!whole(text)) return setError(`${plan.name}: a whole number of rupees, or empty for the plan below.`)
      cellEdits = setEdit(cells, cellEdits, { plan: plan.code, key: row.key, price: num(text) ?? null })
    }
    if (!Object.keys(out).length && !Object.keys(cellEdits).length) return setError('Nothing changed.')
    onSave(out, cellEdits)
  }

  return (
    <div className="drawer-back" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label={row.name} onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head"><h2>{row.name}</h2><button type="button" className="button" onClick={onClose}>Close</button></div>
        <label className="field"><span>Name customers see</span><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
        <label className="field"><span>One line on the lock sheet</span><input value={blurb} maxLength={400} placeholder="What it does, in shop words" onChange={(event) => setBlurb(event.target.value)} /></label>
        <Facts items={[['Kind', KIND_WORD[row.kind]], ['Bought for', SCOPE_WORD[row.scope]]]} />
        {priced(row) && <>
          <label className="field"><span>Price every plan, ₹ a month{row.kind === 'more' ? ' (empty: not on sale)' : ''}</span><input inputMode="numeric" value={base} onChange={(event) => setBase(event.target.value)} /></label>
          <div className="sell-plan-prices">
            <span className="sub">Price on a plan (empty = as the plan below, then the every-plan price)</span>
            {shown.map((plan) => <label key={plan.code} className="field"><span>{plan.name}</span>
              <input inputMode="numeric" value={planPrice[plan.code] ?? ''} placeholder="as below" onChange={(event) => setPlanPrice({ ...planPrice, [plan.code]: event.target.value })} /></label>)}
          </div>
          <div className="plan-form">
            <label className="field"><span>Offer price ₹</span><input inputMode="numeric" value={offer} onChange={(event) => setOffer(event.target.value)} /></label>
            <label className="field"><span>Offer till</span><input type="date" value={till} onChange={(event) => setTill(event.target.value)} /></label>
          </div>
        </>}
        {packed && <label className="field"><span>Packs (change the numbers, keep the layout)</span><textarea rows={3} spellCheck={false} value={packs} onChange={(event) => setPacks(event.target.value)} /></label>}
        <div className="field"><span>Lock shows in</span><div className="chips">
          {(['menu', 'page', 'home'] as const).map((place) => <label key={place} className="check"><input type="checkbox" checked={places.includes(place)} onChange={() => setPlaces(toggle(places, place))} /> {PLACE_WORD[place]}</label>)}
        </div></div>
        <label className="field"><span>The real number on its sheet / Home card</span><select disabled><option>Coming soon</option></select></label>
        {addon && <div className="field"><span>Fits these businesses</span>
          <label className="check"><input type="checkbox" checked={everyKind} onChange={(event) => setEveryKind(event.target.checked)} /> Every kind</label>
          {!everyKind && (types.data ? <div className="chips">{types.data.types.map((type) => <label key={type.key} className="check"><input type="checkbox" checked={kinds.includes(type.key)} onChange={() => setKinds(toggle(kinds, type.key))} /> {type.name}</label>)}</div> : <Loading />)}
          <span className="sub">Comes free with</span>
          {types.data ? <div className="chips">{types.data.types.map((type) => <label key={type.key} className="check"><input type="checkbox" checked={freeWith.includes(type.key)} onChange={() => setFreeWith(toggle(freeWith, type.key))} /> {type.name}</label>)}</div> : <Loading />}
        </div>}
        <div className="plan-form">
          {(row.kind === 'addon' || row.kind === 'extra') && <label className="field"><span>On sale</span><select value={onSale ? 'yes' : 'no'} onChange={(event) => setOnSale(event.target.value === 'yes')}><option value="yes">Yes</option><option value="no">No (holders keep it)</option></select></label>}
          <label className="field"><span>Ready</span><select value={ready ? 'yes' : 'no'} onChange={(event) => setReady(event.target.value === 'yes')}><option value="yes">Yes</option><option value="no">Coming soon (never locked)</option></select></label>
        </div>
        <h3>On each plan</h3>
        <ul className="sell-plans">
          {shown.map((plan) => {
            const cell = effective(row, ladder, cells, edits)[ladder.indexOf(plan)]
            return <li key={plan.code}><span>{plan.name}</span><Badge tone={cell?.state === 'in' ? 'good' : cell?.state === 'buy' ? 'warning' : 'neutral'}>{STATE_WORD[(cell?.state ?? 'hidden') as SellState]}</Badge>
              {!cell?.own?.state && <span className="sub">as the plan below</span>}</li>
          })}
        </ul>
        <span className="sub">Change these in the grid.</span>
        {addon && <Facts items={[['Businesses that have it now', owners.data ? (owners.data.customers[row.key]
          ? <button key="n" type="button" className="text-button" onClick={() => navigate({ page: 'customers', addOn: row.key, addOnName: row.name })}>{owners.data.customers[row.key]}</button> : '0') : '…'],
          ['Last 30 days: saw the lock · tapped · bought', <Soon key="soon" />]]} />}
        {error && <ErrorBox message={error} />}
        <div className="dialog-actions"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="button" className="button primary" onClick={review}>Save card…</button></div>
      </aside>
    </div>
  )
}

/** "How should this apply?": the plans reached with their counts, the choice, the reason. Gives less → not Everyone now. */
function ApplyDialog({ saving, ladder, rows, cells, onDone, onClose }: {
  saving: Saving; ladder: SellPlan[]; rows: SellRow[]; cells: SellGrid['cells']; onDone: () => void; onClose: () => void
}) {
  const reach = useLoad(() => (saving.plans.length ? admin<Record<string, Reach>>('sell_reach', { plans: saving.plans }) : Promise.resolve({} as Record<string, Reach>)), saving.plans.join())
  const [applyTo, setApplyTo] = useState<ApplyTo | null>(null)
  const keys = [...new Set([...Object.values(saving.cells).map((edit) => edit.key), ...Object.keys(saving.rows)])]
  const less = givesLess(rows, ladder, cells, saving.cells, Object.fromEntries(Object.entries(saving.rows).map(([key, row]) => [key, { ...(row.price !== undefined ? { price: row.price } : {}) }])))
  const lessWithCustomers = Object.entries(less).filter(([code]) => reach.data && (reach.data[code]?.customers ?? 0) + (reach.data[code]?.older ?? 0) > 0)
  const paid = saving.plans.filter((code) => code !== 'free')
  const asks = paid.length > 0
  const name = (code: string) => ladder.find((plan) => plan.code === code)?.name ?? code
  const n = (value: number) => value.toLocaleString('en-IN')

  async function save(reason: string) {
    if (asks && !applyTo) throw new Error('Choose how this change applies to customers already on these plans.')
    const rowsOut = Object.entries(saving.rows).map(([key, row]) => ({
      key,
      ...(row.name !== undefined ? { name: row.name } : {}), ...(row.blurb !== undefined ? { blurb: row.blurb } : {}),
      ...('price' in row ? { base: row.price ?? null } : {}), ...('offerSet' in row ? { offer: row.offerSet } : {}),
      ...(row.onSale !== undefined ? { onSale: row.onSale } : {}), ...(row.ready !== undefined ? { ready: row.ready } : {}),
      ...(row.everyKind !== undefined ? { everyKind: row.everyKind } : {}), ...(row.kinds !== undefined ? { kinds: row.kinds } : {}),
      ...(row.freeWith !== undefined ? { freeWith: row.freeWith } : {}), ...(row.places !== undefined ? { lockPlaces: row.places } : {}),
      ...(row.packs !== undefined ? { packs: row.packs } : {}),
    }))
    await admin('sell_save', {
      ...(rowsOut.length ? { rows: rowsOut } : {}),
      ...(Object.keys(saving.cells).length ? { cells: Object.values(saving.cells) } : {}),
      applyTo: asks ? applyTo : 'everyone', reason,
    })
    onDone()
  }

  return (
    <ConfirmDialog title="How should this apply?" action="Save" onDone={save} onClose={onClose}>
      <div className="apply-box">
        <p>{Object.keys(saving.cells).length ? `${Object.keys(saving.cells).length} change(s) in the grid` : 'Card changed'}{saving.plans.length ? ` · reaches ${saving.plans.map(name).join(', ')} (plans that take it from a changed one get it too).` : ' · words only: nothing changes for customers.'}</p>
        {/* BROKEN-35: the choice comes first (the owner found only the Why? box); the counts follow. */}
        {asks && <>
          <strong>1. Who gets this change?</strong>
          <div className="apply-choices" role="radiogroup" aria-label="How should this apply?">
            {([
              ['new', 'New buyers only', 'Today’s customers keep what they have.'],
              ['renewal', 'Each at their next renewal', 'They see it before they pay again.'],
              ['everyone', 'Everyone now', lessWithCustomers.length ? `Not allowed: this gives less (${lessWithCustomers.map(([code, names]) => `${name(code)}: ${names.join(', ')}`).join('; ')}). Nobody is lowered mid-period.` : 'Only for changes that give more.'],
            ] as const).map(([value, label, says]) => {
              const off = value === 'everyone' && lessWithCustomers.length > 0
              return <label key={value} className={`apply-choice${applyTo === value ? ' on' : ''}${off ? ' is-off' : ''}`}>
                <input type="radio" name="applyTo" value={value} disabled={off} checked={applyTo === value} onChange={() => setApplyTo(value)} />
                <span><strong>{label}</strong><span className="sub">{says}</span></span>
              </label>
            })}
          </div>
        </>}
        {saving.plans.includes('free') && <p className="apply-note">Free has no renewals: a change there reaches every Free account now.{paid.length ? ' Save Free’s change on its own if the paid plans should wait.' : ''}</p>}
        {saving.plans.length > 0 && (!reach.data ? (reach.error ? <ErrorBox message={reach.error} onRetry={reach.reload} /> : <p className="sub">Counting customers…</p>) : <>
          <strong>Customers on these plans</strong>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Plan</th><th>Customers</th><th>Renew in 30 days</th><th>Paying for it now</th></tr></thead>
            <tbody>{saving.plans.map((code) => {
              const r = reach.data![code]
              return <tr key={code}><td>{name(code)}</td><td>{r ? n(r.customers) : '–'}{r && r.older > 0 && <span className="sub"> + {n(r.older)} on older terms</span>}</td>
                <td>{r && !r.free ? n(r.renewSoon) : '–'}</td><td>{r ? n(keys.reduce((sum, key) => sum + (r.addOnBuyers[key] ?? 0), 0)) : '–'}</td></tr>
            })}</tbody>
          </table></div>
        </>)}
        {asks && <strong>2. Write why below, then Save.</strong>}
      </div>
    </ConfirmDialog>
  )
}

type IncludedReach = { on: boolean; stores: number; things: { key: string; name: string; stores: number }[] }

/** V114 (S2): the counts first, then the switch. On: what the plans include (In) turns on in every store it fits, until the
 * owner switches it off there. Off: stores that never chose it themselves lose it again. */
function IncludedDialog({ on, onClose, onSaved }: { on: boolean; onClose: () => void; onSaved: () => void }) {
  const reach = useLoad(() => admin<IncludedReach>('included_reach'), 'included-reach')
  return (
    <ConfirmDialog title={on ? 'Switch included things on by themselves?' : 'Stop switching included things on?'} action={on ? 'Turn on' : 'Turn off'}
      onDone={async (reason) => { await admin('sell_save', { includedAutoOn: on, reason }); onSaved() }} onClose={onClose}>
      <p>{on ? 'Each add-on a store’s plan includes (In) and that fits its kind of business switches on in that store by itself. The store owner can switch it off; then it stays off there.'
        : 'Stores go back to switching included add-ons on themselves. Where an owner switched one on or off, that stays. Where nobody chose, it goes off.'}</p>
      {reach.error ? <ErrorBox message={reach.error} onRetry={reach.reload} /> : !reach.data ? <Loading label="Counting stores…" /> : on ? (
        reach.data.things.length ? <>
          <p><strong>Turns on {reach.data.things.reduce((n, x) => n + x.stores, 0)} add-ons in {reach.data.stores} store{reach.data.stores === 1 ? '' : 's'} today:</strong></p>
          <ul className="list">{reach.data.things.map((x) => <li key={x.key}>{x.name}<span className="sub">{x.stores} store{x.stores === 1 ? '' : 's'}</span></li>)}</ul>
        </> : <p className="muted">Nothing would change today: no store has an included add-on left off without choosing.</p>
      ) : <p className="muted">Stores where nobody chose: the add-ons they got this way go off.</p>}
    </ConfirmDialog>
  )
}
