import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorBox, Loading } from '../components/ui'
import { buyOn, flip, freeOn, groupOf, startDraft, tileChanges, type Draft, type Kind, type Pick } from '../lib/businessTiles'
import { compareText } from '../lib/sort'
import { navigate } from '../lib/route'
import { admin } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'
import { AutoJobs } from './AutoJobs'
import { ReadyList } from './ReadyList'
import { cardsFrom, kindsFrom, loadTypes } from './BusinessTypes'

// One of the 12 businesses on its own page (owner OK 2026-11-16): Free and Can buy ticks for the whole tile.
// A key only some kinds have shows those kinds and stays as it is unless ticked. Save writes every changed kind at once.
// Its name and one line on the sign-up and calculators are saved on their own (admin.save_tile, NEED admin-words 2026-11-18).

const back = () => navigate({ page: 'types' })

function Tick({ pick, label, some, disabled, onFlip }: { pick: Pick; label: string; some: string[]; disabled?: boolean; onFlip: () => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={pick === 'all'} disabled={disabled} ref={(el) => { if (el) el.indeterminate = pick === 'keep' }} onChange={onFlip} />
      {' '}{label}{pick === 'keep' && <span className="sub tone-warning"> · only {some.join(', ')} (kept as is unless you tick)</span>}
    </label>
  )
}

export function BusinessTileEdit({ id, canEdit }: { id: string; canEdit: boolean }) {
  const list = useLoad(loadTypes, 'types')
  const [edited, setDraft] = useState<Draft | null>(null)
  const [pending, setPending] = useState(false)
  const [words, setWords] = useState<{ name: string; about: string } | null>(null)
  const [wordsPending, setWordsPending] = useState(false)
  if (list.error) return <div className="page"><ErrorBox message={list.error} onRetry={list.reload} /></div>
  if (!list.data) return <Loading />
  const data = list.data
  const group = groupOf(id, Object.fromEntries(data.types.map((type) => [type.key, type.name])), cardsFrom(data))
  if (!group) return <div className="page"><ErrorBox message="There is no such business." /><button type="button" className="button" onClick={back}>Back to Business types</button></div>
  const kinds: Kind[] = kindsFrom(data, group.kinds)
  const name = (key: string) => data.features[key]?.name ?? key
  const price = (key: string) => { const paise = data.features[key]?.monthlyPaise; return paise ? ` ₹${(paise / 100).toLocaleString('en-IN')}` : '' }
  const keys = Object.keys(data.features).sort((a, b) => compareText(name(a), name(b)))
  const buyKeys = keys.filter((key) => !data.everyType.includes(key))
  const draft = edited ?? startDraft(kinds, keys)
  const { changes, save: rows } = tileChanges(kinds, draft, keys)
  const list2 = (list: string[]) => list.map(name).join(', ')
  const save = async (reason: string) => {
    await admin('save_business_tile', { tile: group.key, kinds: rows, reason })
    back()
  }
  const customers = data.customers[group.key]
  const signUp = group.signUp
  const shownWords = words ?? { name: signUp?.name ?? '', about: signUp?.about ?? '' }
  const wordsChanged = Boolean(signUp) && (shownWords.name.trim() !== signUp?.name || shownWords.about.trim() !== signUp?.about)
  const shared = signUp && signUp.key !== group.key
  const saveWords = async (reason: string) => {
    if (!signUp) return
    await admin('save_tile', { key: signUp.key, name: shownWords.name.trim(), about: shownWords.about.trim(), reason })
    setWords(null)
    list.reload()
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <button type="button" className="text-button" onClick={back}><ArrowLeft size={16} /> Business types</button>
          <h1>{group.name}</h1>
          <p className="muted">Kinds: {kinds.map((kind) => kind.name).join(', ')}{customers !== undefined ? ` · ${customers.toLocaleString('en-IN')} ${customers === 1 ? 'business' : 'businesses'}` : ''}. Changes reach new businesses only.</p>
        </div>
      </header>
      {signUp && (
        <div className="plan-form">
          <h3 className="span-2">On the sign-up and price calculators{shared ? ` (shared by every ${signUp.name} card)` : ''}</h3>
          <label className="field"><span>Name on sign-up</span>
            <input value={shownWords.name} maxLength={60} disabled={!canEdit} onChange={(event) => setWords({ ...shownWords, name: event.target.value })} /></label>
          <label className="field"><span>One line</span>
            <input value={shownWords.about} maxLength={160} disabled={!canEdit} onChange={(event) => setWords({ ...shownWords, about: event.target.value })} /></label>
          {canEdit && (
            <div className="dialog-actions span-2">
              <button type="button" className="button primary" disabled={!wordsChanged || shownWords.name.trim() === ''} onClick={() => setWordsPending(true)}>Save words…</button>
            </div>
          )}
        </div>
      )}
      <div className="grid-2">
        <div>
          <h3>Free (comes with)</h3>
          {keys.map((key) => (
            <Tick key={key} pick={draft.free[key]!} label={`${name(key)}${price(key)}`} some={freeOn(kinds, key).map((kind) => kind.name)} disabled={!canEdit}
              onFlip={() => setDraft({ ...draft, free: { ...draft.free, [key]: flip(draft.free[key]!) } })} />
          ))}
        </div>
        <div>
          <h3>Can buy</h3>
          {buyKeys.map((key) => (
            <Tick key={key} pick={draft.free[key] === 'all' ? 'none' : draft.buy[key]!} label={`${name(key)}${price(key)}${draft.free[key] === 'all' ? ' (free)' : ''}`}
              some={buyOn(kinds, key).map((kind) => kind.name)} disabled={!canEdit || draft.free[key] === 'all'}
              onFlip={() => setDraft({ ...draft, buy: { ...draft.buy, [key]: flip(draft.buy[key]!) } })} />
          ))}
          {data.everyType.length > 0 && <p className="sub">Every business can also buy: {list2(data.everyType)}.</p>}
        </div>
      </div>
      {canEdit && (
        <div className="plan-edit-actions dialog-actions">
          <button type="button" className="button" onClick={back}>Cancel</button>
          <button type="button" className="button primary" disabled={rows.length === 0} onClick={() => setPending(true)}>Save…</button>
        </div>
      )}
      <AutoJobs key={`auto-${group.key}`} kinds={kinds.map((kind) => ({ key: kind.key, name: kind.name }))} jobs={data.autoJobs ?? []} lists={data.autoKinds ?? {}} canEdit={canEdit} onSaved={list.reload} />
      <ReadyList key={group.key} kinds={kinds.map((kind) => ({ key: kind.key, name: kind.name }))} canEdit={canEdit} />
      {wordsPending && signUp && (
        <ConfirmDialog title="Save these words?" action="Save" onDone={saveWords} onClose={() => setWordsPending(false)}>
          <p>The sign-up and both price calculators will show “{shownWords.name.trim()}”{shownWords.about.trim() ? ` with the line “${shownWords.about.trim()}”` : ' with no line'}.</p>
        </ConfirmDialog>
      )}
      {pending && (
        <ConfirmDialog title="Save this change?" action="Save" onDone={save} onClose={() => setPending(false)}>
          <p>New businesses of these kinds get this. Businesses already set up stay as they are.</p>
          <ul>
            {changes.map((change) => (
              <li key={change.key}><b>{change.name}:</b>{' '}
                {[change.freeOn.length && `free now ${list2(change.freeOn)}`, change.freeOff.length && `no longer free ${list2(change.freeOff)}`,
                  change.buyOn.length && `can buy ${list2(change.buyOn)}`, change.buyOff.length && `can no longer buy ${list2(change.buyOff)}`].filter(Boolean).join('; ')}
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
    </div>
  )
}
