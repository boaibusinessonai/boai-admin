import { Plus } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Card, ErrorBox, Loading } from '../components/ui'
import { buySpread, cardsOf, freeSpread, LONE, loneKinds, type Kind, type SignUpTile, type Tile } from '../lib/businessTiles'
import { compareText, sortByText } from '../lib/sort'
import { navigate } from '../lib/route'
import { admin } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'

export type Feature = { name: string; monthlyPaise?: number }
type BusinessType = { key: string; name: string; comesWith: string[]; canAdd: string[] }
export type TypesData = { features: Record<string, Feature>; types: BusinessType[]; ownCanAdd: Record<string, string[]>; everyType: string[]; customers: Record<string, number>; tiles: SignUpTile[]
  /** AUTO-0: the automation jobs and each kind's list (Store settings › Automation). */
  autoJobs?: { key: string; ready: boolean }[]; autoKinds?: Record<string, string[]> }

/** A new type's key from its name: lower case, words joined by _, at most 40 letters. */
export const typeKey = (name: string) => name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)

/** The page's data: every type, the sign-up's businesses, and businesses per business and per kind. */
export function loadTypes() {
  return admin<TypesData>('business_types', {})
}
/** The cards: the sign-up's businesses from the database, Classes & appointments as its kinds. */
export const cardsFrom = (data: TypesData): Tile[] => cardsOf(data.tiles, (key) => data.types.find((type) => type.key === key)?.name ?? key)
export const kindsFrom = (data: TypesData, keys: string[]): Kind[] =>
  keys.flatMap((key) => data.types.filter((type) => type.key === key).map((type) => ({ key: type.key, name: type.name, comesWith: type.comesWith, own: data.ownCanAdd[type.key] ?? [] })))

type Draft = { tile: string; basedOn: string; name: string; synonyms: string }

// Business types as the sign-up's 12 businesses (owner OK 2026-11-16): each card shows its kinds, what they get free and
// can buy, and how many businesses use it. Edit opens the tile on its own page. Changes reach new businesses only.
export function BusinessTypes({ canEdit }: { canEdit: boolean }) {
  const list = useLoad(loadTypes, 'types')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pending, setPending] = useState(false)
  if (list.error) return <ErrorBox message={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />
  const data = list.data
  const name = (key: string) => data.features[key]?.name ?? key
  const names = (keys: string[]) => [...keys].sort((a, b) => compareText(name(a), name(b))).map(name).join(', ')
  const cards = cardsFrom(data)
  const lone = loneKinds(data.types.map((type) => type.key), cards)

  const card = (id: string, title: string, kinds: Kind[], customers: number | undefined, signUp?: SignUpTile, split?: boolean) => {
    const keys = Object.keys(data.features)
    const free = keys.filter((key) => freeSpread(kinds, key) === 'all')
    const buy = keys.filter((key) => !data.everyType.includes(key) && buySpread(kinds, key) === 'all')
    const differ = keys.filter((key) => freeSpread(kinds, key) === 'some' || (!data.everyType.includes(key) && buySpread(kinds, key) === 'some'))
    return (
      <div key={id} className="plan-card">
        <button type="button" className="plan-card-open" onClick={() => navigate({ page: 'types', id })}>
          <strong>{title}</strong>
          {split && signUp && <span className="sub">At sign-up: {signUp.name}</span>}
          {signUp?.about && <span className="sub">“{signUp.about}”</span>}
          <span className="sub">{kinds.map((kind) => kind.name).join(', ') || 'No kinds yet'}</span>
          <span><b>Free:</b> {free.length ? names(free) : 'nothing extra'}</span>
          <span><b>Can buy:</b> {buy.length ? names(buy) : 'only what every business can'}</span>
          {differ.length > 0 && <span className="tone-warning">Kinds differ: {names(differ)}</span>}
          <span className="sub">{customers === undefined ? '' : `${customers.toLocaleString('en-IN')} ${customers === 1 ? 'business' : 'businesses'}`}</span>
        </button>
        {canEdit && <button type="button" className="button" onClick={() => navigate({ page: 'types', id })}>Edit</button>}
      </div>
    )
  }

  const tileKinds = draft ? kindsFrom(data, cards.find((tile) => tile.key === draft.tile)?.kinds.slice() ?? []) : []
  const newKey = draft ? typeKey(draft.name) : ''
  const taken = draft && data.types.some((type) => type.key === newKey || type.name.toLowerCase() === draft.name.trim().toLowerCase())
  const ready = draft && newKey !== '' && !taken && draft.basedOn !== ''
  const save = async (reason: string) => {
    if (!draft) return
    const from = data.types.find((type) => type.key === draft.basedOn)
    const synonyms = draft.synonyms.split(',').map((word) => word.trim()).filter(Boolean)
    await admin('save_business_type', { key: newKey, name: draft.name.trim(), basedOn: draft.basedOn, ...(synonyms.length ? { synonyms } : {}), comesWith: from?.comesWith ?? [], reason })
    setDraft(null)
    list.reload()
  }

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Business types</h1><p className="muted">The businesses of the sign-up, with the name and line people see there; Classes & appointments is shown as its 3 kinds. Each card decides what its kinds get free and can buy. Changes reach new businesses only; change an existing one from its Features tab. Prices are a month, per store.</p></div>
      </header>
      {data.everyType.length > 0 && <p className="sub">Every business can also buy: {names(data.everyType)}.</p>}
      <div className="plan-cards">
        {cards.map((tile) => card(tile.key, tile.name, kindsFrom(data, [...tile.kinds]), data.customers[tile.key], tile.signUp, tile.signUp?.key !== tile.key))}
      </div>
      {lone.length > 0 && (
        <>
          <h3>Not in any sign-up business</h3>
          <p className="sub">The sign-up does not show these yet.</p>
          <div className="plan-cards">{sortByText(lone, (key) => data.types.find((type) => type.key === key)?.name ?? key).map((key) => card(`${LONE}${key}`, data.types.find((type) => type.key === key)?.name ?? key, kindsFrom(data, [key]), undefined))}</div>
        </>
      )}

      {canEdit && (
        <details className="plan-more">
          <summary>More</summary>
          {!draft && <button type="button" className="button" onClick={() => setDraft({ tile: '', basedOn: '', name: '', synonyms: '' })}><Plus size={16} aria-hidden="true" /> Add a business type</button>}
          {draft && (
            <Card title="New business type">
              <div className="plan-form">
                <label className="field"><span>Which business</span>
                  <select value={draft.tile} onChange={(event) => setDraft({ ...draft, tile: event.target.value, basedOn: '' })}>
                    <option value="">Choose…</option>
                    {cards.map((tile) => <option key={tile.key} value={tile.key}>{tile.name}</option>)}
                  </select>
                </label>
                <label className="field"><span>Built the same way as</span>
                  <select value={draft.basedOn} disabled={!draft.tile} onChange={(event) => setDraft({ ...draft, basedOn: event.target.value })}>
                    <option value="">Choose…</option>
                    {tileKinds.map((kind) => <option key={kind.key} value={kind.key}>{kind.name}</option>)}
                  </select>
                </label>
                <label className="field"><span>Name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                <label className="field"><span>Other words people search for it by, with commas (optional)</span><input value={draft.synonyms} onChange={(event) => setDraft({ ...draft, synonyms: event.target.value })} /></label>
                {taken && <p className="tone-critical span-2">A type with this name already exists.</p>}
                <p className="muted span-2">Its setup, units, ready item list, free and can-buy lists are copied from the type you choose. The sign-up shows only the kinds already in its businesses, so a new type waits under “Not in any sign-up business”.</p>
              </div>
              <div className="dialog-actions">
                <button type="button" className="button" onClick={() => setDraft(null)}>Cancel</button>
                <button type="button" className="button primary" disabled={!ready} onClick={() => setPending(true)}>Save…</button>
              </div>
            </Card>
          )}
        </details>
      )}

      {pending && draft && (
        <ConfirmDialog title="Add this business type?" action="Save" onDone={save} onClose={() => setPending(false)}>
          <p>{draft.name.trim()} will be offered to new businesses, built like {data.types.find((type) => type.key === draft.basedOn)?.name}.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}

