import { ArrowDown, ArrowUp } from 'lucide-react'
import { useState } from 'react'
import { Badge, Card } from '../components/ui'
import { admin } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'
import { BUILT_IN_LINES, BUILT_IN_MARKS, BUILT_IN_SUBLINE, cardKinds, cardState, headingLines, headingSave, logoOk, marksSave, marksText, move, partnerRows, type Landing, type Partner, type SiteTab } from '../lib/publicSite'

// Public website › Heading, Partners, Business cards, Our app (DEMO-1). Owner 2026-11-27: the landing's own words and
// colours are not edited here; only the heading's 2 lines (C15 2026-11-28: no big BOAI; + the sentence under it, its marked words). Empty boxes = the website's built-in
// lines (shown greyed). Cancel drops the changes; Save… asks why (audit).

type Demo = { kind: string; name: string; ready: boolean; on: boolean }
type Props = { tab: SiteTab; saved: Landing; draft: Landing | null; setDraft: (next: Landing | null) => void; demos: Demo[]; appFile: string | null; onSave: () => void }

export function LandingTabs({ tab, saved, draft, setDraft, demos, appFile, onSave }: Props) {
  const l: Landing = { ...saved, ...(draft ?? {}) }
  const change = (part: Partial<Landing>) => setDraft({ ...(draft ?? {}), ...part })
  const kinds = useLoad(() => admin<{ kinds: { key: string; name: string }[] }>('demo_stores'), 'demo_stores')
  const [partner, setPartner] = useState<{ index: number; row: Partner } | null>(null)
  const [logoProblem, setLogoProblem] = useState('')
  const [adding, setAdding] = useState('')
  const [lines, setLines] = useState<[string, string]>(() => headingLines(l.heading))
  const [marks, setMarks] = useState(() => marksText(l.marks))
  const kindName = (key: string) => kinds.data?.kinds.find((k) => k.key === key)?.name ?? key
  const partners = partnerRows(l)
  const cards = cardKinds(l)
  const setLine = (i: 0 | 1, value: string) => { const next: [string, string] = i === 0 ? [value, lines[1]] : [lines[0], value]; setLines(next); change({ heading: headingSave(next) }) }
  const readLogo = (file: File | undefined) => {
    setLogoProblem('')
    if (!file || !partner) return
    if (!logoOk(file.type, file.size)) { setLogoProblem('Use an SVG, PNG, JPEG or WebP picture up to 200 KB.'); return }
    const reader = new FileReader()
    reader.onload = () => setPartner({ ...partner, row: { ...partner.row, logo: String(reader.result) } })
    reader.readAsDataURL(file)
  }
  const actions = (
    <div className="dialog-actions">
      <button type="button" className="button" disabled={!draft} onClick={() => { setDraft(null); setLines(headingLines(saved.heading)); setMarks(marksText(saved.marks)) }}>Cancel</button>
      <button type="button" className="button primary" disabled={!draft} onClick={onSave}>Save…</button>
    </div>
  )

  if (tab === 'heading') return (
    <>
      <Card title="Heading">
        <div className="plan-form">
          <label className="field"><span>Line 1</span><input maxLength={40} placeholder={BUILT_IN_LINES[0]} value={lines[0]} onChange={(event) => setLine(0, event.target.value)} /></label>
          <label className="field"><span>Line 2</span><input maxLength={40} placeholder={BUILT_IN_LINES[1]} value={lines[1]} onChange={(event) => setLine(1, event.target.value)} /></label>
          <label className="field"><span>Sentence under the heading</span><textarea maxLength={200} rows={2} placeholder={BUILT_IN_SUBLINE} value={l.subline ?? ''} onChange={(event) => change({ subline: event.target.value.replace(/\s*\n\s*/g, ' ') })} /></label>
          <label className="field"><span>Words to mark (separate with commas)</span><input maxLength={120} placeholder={BUILT_IN_MARKS} value={marks} onChange={(event) => { setMarks(event.target.value); change({ marks: marksSave(event.target.value) }) }} /></label>
        </div>
        <p className="muted">The heading is 2 lines. Fill both, or leave both empty for the built-in lines. Words to mark get a soft gold mark when they are in the lines. Empty boxes = the built-in words.</p>
        <p className="muted">The “Start at ₹…” price tag shows the lowest monthly price of the plans on the Prices page (Plans), by itself.</p>
      </Card>
      {actions}
    </>
  )

  if (tab === 'partners') return (
    <>
      <Card title="Valued Partners (the cloud on the landing)" action={<button type="button" className="button small" disabled={partners.length >= 12} onClick={() => setPartner({ index: -1, row: { name: '', shown: true } })}>+ Add partner</button>}>
        <ul className="list site-rows">
          {partners.map((p, i) => (
            <li key={`${p.name}-${i}`}>
              <Order onUp={() => change({ partners: move(partners, i, -1) })} onDown={() => change({ partners: move(partners, i, 1) })} first={i === 0} last={i === partners.length - 1} />
              {p.logo ? <img className="site-logo" src={p.logo} alt="" width="32" height="32" /> : <span className="site-logo" aria-hidden="true">{p.name.charAt(0)}</span>}
              <strong>{p.name}</strong> <span className="sub">{p.kind}</span>
              <label className="field inline"><input type="checkbox" checked={p.shown} onChange={(event) => change({ partners: partners.map((one, at) => (at === i ? { ...one, shown: event.target.checked } : one)) })} /><span>{p.shown ? 'Shown' : 'Hidden'}</span></label>
              <button type="button" className="button small" onClick={() => setPartner({ index: i, row: { ...p } })}>Edit</button>
            </li>
          ))}
        </ul>
        {partner && (
          <div className="plan-form site-edit">
            <label className="field"><span>Name</span><input maxLength={80} value={partner.row.name} onChange={(event) => setPartner({ ...partner, row: { ...partner.row, name: event.target.value } })} /></label>
            <label className="field"><span>Kind</span><input maxLength={40} value={partner.row.kind ?? ''} onChange={(event) => setPartner({ ...partner, row: { ...partner.row, kind: event.target.value } })} /></label>
            <label className="field"><span>One line in their words</span><input maxLength={120} value={partner.row.line ?? ''} onChange={(event) => setPartner({ ...partner, row: { ...partner.row, line: event.target.value } })} /></label>
            <label className="field"><span>Logo or photo (SVG, PNG, JPEG or WebP, up to 200 KB)</span><input type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" onChange={(event) => readLogo(event.target.files?.[0])} /></label>
            {logoProblem && <p className="muted">{logoProblem}</p>}
            <div className="dialog-actions">
              <button type="button" className="button" onClick={() => setPartner(null)}>Cancel</button>
              {partner.index >= 0 && <button type="button" className="button" onClick={() => { change({ partners: partners.filter((_, at) => at !== partner.index) }); setPartner(null) }}>Remove</button>}
              <button type="button" className="button" disabled={!partner.row.name.trim()} onClick={() => { change({ partners: partner.index < 0 ? [...partners, partner.row] : partners.map((one, at) => (at === partner.index ? partner.row : one)) }); setPartner(null) }}>Keep</button>
            </div>
          </div>
        )}
        <p className="muted">Only real businesses that said yes. Name, kind, logo or photo, one line in their words.</p>
      </Card>
      {actions}
    </>
  )

  if (tab === 'cards') return (
    <>
      <Card title="Pick your business: cards" action={
        <span className="site-add">
          <select value={adding} onChange={(event) => setAdding(event.target.value)} aria-label="Add a kind">
            <option value="">Add a kind…</option>
            {(kinds.data?.kinds ?? []).filter((k) => !cards.includes(k.key)).map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
          </select>
          <button type="button" className="button small" disabled={!adding} onClick={() => { change({ cards: [...cards, adding] }); setAdding('') }}>Add</button>
        </span>}>
        <p className="muted">One card per business kind from Business types. A card with a ready demo store opens it; the rest go to More businesses.</p>
        <ul className="list site-rows">
          {cards.map((kind, i) => (
            <li key={kind}>
              <Order onUp={() => change({ cards: move(cards, i, -1) })} onDown={() => change({ cards: move(cards, i, 1) })} first={i === 0} last={i === cards.length - 1} />
              <strong>{kindName(kind)}</strong>
              <Badge tone={cardState(kind, demos) === 'Demo ready' ? 'good' : 'neutral'}>{cardState(kind, demos)}</Badge>
              <button type="button" className="button small" onClick={() => change({ cards: cards.filter((one) => one !== kind) })}>Remove</button>
            </li>
          ))}
        </ul>
        <p className="muted">Demo stores are made in Data › Demo stores. More businesses and Not sure? always follow these cards.</p>
      </Card>
      {actions}
    </>
  )

  return (
    <>
      <Card title="Our app">
        <div className="plan-form">
          <label className="field"><span>Install mobile app: link</span>
            <select value={l.app?.mobile ?? 'apk'} onChange={(event) => change({ app: { ...l.app, mobile: event.target.value as 'apk' | 'play' } })}>
              <option value="apk">Newest phone app (APK, from Phone app updates)</option>
              <option value="play">Google Play link</option>
            </select></label>
          {l.app?.mobile === 'play'
            ? <label className="field"><span>Google Play link</span><input maxLength={300} placeholder="https://play.google.com/…" value={l.app?.play ?? ''} onChange={(event) => change({ app: { ...l.app, play: event.target.value } })} /></label>
            : <p className="muted">{appFile ? 'The newest phone app file sent to phones is the link.' : 'No phone app file sent yet: the button shows “Coming soon”.'}</p>}
          <label className="field"><span>Install web app</span>
            <select value={l.app?.web === false ? 'hide' : 'show'} onChange={(event) => change({ app: { ...l.app, web: event.target.value === 'show' } })}>
              <option value="show">Show the browser’s Install button</option>
              <option value="hide">Hide</option>
            </select></label>
          <label className="field inline"><input type="checkbox" checked={Boolean(l.app?.topBar)} onChange={(event) => change({ app: { ...l.app, topBar: event.target.checked } })} /><span>“Get the app” in the top bar</span></label>
        </div>
      </Card>
      {actions}
    </>
  )
}

function Order({ onUp, onDown, first, last }: { onUp: () => void; onDown: () => void; first: boolean; last: boolean }) {
  return (
    <span className="site-order">
      <button type="button" className="icon-button" aria-label="Up" disabled={first} onClick={onUp}><ArrowUp size={14} /></button>
      <button type="button" className="icon-button" aria-label="Down" disabled={last} onClick={onDown}><ArrowDown size={14} /></button>
    </span>
  )
}

/** "Preview (what visitors see)": the notice ribbon and the heading with the unsaved lines. */
/** The line with its marked words in a soft mark, as the website draws them (C15). */
function marked(line: string, marks: string[]) {
  const words = marks.map((m) => m.trim()).filter(Boolean)
  if (!words.length) return line
  const find = new RegExp(`(${words.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
  return line.split(find).filter(Boolean).map((part, i) => (words.includes(part) ? <mark key={i} className="site-mark">{part}</mark> : part))
}

export function Preview({ landing, ribbon }: { landing: Landing; ribbon: { title: string | null; message: string; placesLeft: number | null } | null }) {
  const own = headingLines(landing.heading)
  const lines = own[0] ? own : BUILT_IN_LINES
  return (
    <aside className="site-preview" aria-label="Preview (what visitors see)">
      <b>Preview (what visitors see)</b>
      {ribbon && <div className="site-ribbon" style={{ background: '#0b5d45' }}><b>{ribbon.title}</b> · {ribbon.message}{ribbon.placesLeft !== null ? ` · ${ribbon.placesLeft} places left` : ''}</div>}
      <div className="site-bigbox">
        <div className="site-heading site-heading-two"><span>{lines.map((line) => <span key={line}>{marked(line, (landing.marks ?? marksSave(BUILT_IN_MARKS)).split('|'))}</span>)}</span></div>
        <p className="site-sub">{landing.subline || BUILT_IN_SUBLINE}</p>
      </div>
      <span className="muted">Changes show here before Save.</span>
    </aside>
  )
}
