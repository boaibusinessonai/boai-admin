import { useEffect, useState, type ChangeEvent } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Card, ErrorBox, Loading } from '../components/ui'
import { admin } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'
import { autoSplit, BRAND_FONTS, FONTS_HREF, followName, letterLogo, letterOf, LOGO_TYPES, logoProblem, NAME_OK, splitName } from '../lib/brandStyles'

// App name & logo (owner 2026-11-12): "until we finalise the name". Type a name, pick one of 6 style cards
// (font + gold part + letter logo), or upload a logo; Save for all changes the web app, landing, bills and
// messages in about a minute. Installed-app icon, Google sign-in name and domain need a rebuild (said on the page).

type Brand = { plain: string; gold: string; tagline: string; topLine: string | null; hero?: string | null; taglineColor?: string | null; taglineHighlight?: string | null; taglineAt?: number | null; company?: string | null; font: string | null; logo: string | null }
type LogoKind = 'letter' | 'own' | 'builtin'
/** Ready colours for the tagline (any other colour can be picked too). Empty = the landing page's own look. */
const TAG_COLORS = ['#17202b', '#1f4e79', '#0f766e', '#15803d', '#b45309', '#c2410c', '#b91c1c', '#7e22ce']

function ColorPick({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  return (
    <div className="field"><span>{label}</span>
      <div className="brand-colors">
        <button type="button" className={`brand-color is-default ${value ? '' : 'is-on'}`} aria-pressed={!value} onClick={() => onChange('')}>Default</button>
        {TAG_COLORS.map((c) => <button type="button" key={c} className={`brand-color ${value === c ? 'is-on' : ''}`} style={{ background: c }} aria-label={c} aria-pressed={value === c} onClick={() => onChange(c)} />)}
        <label className="brand-color-any">Any colour <input type="color" value={value || '#17202b'} onChange={(e) => onChange(e.target.value)} /></label>
      </div>
    </div>
  )
}

/** The tagline in its two colours, cut where the owner set it (at = letters from the start; at the end = one colour). */
const taglineParts = (t: string, at: number): [string, string] => [t.slice(0, Math.min(at, t.length)), t.slice(Math.min(at, t.length))]

function useBrandFonts() {
  useEffect(() => {
    if (document.querySelector('link[data-brand-fonts]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONTS_HREF
    link.dataset.brandFonts = ''
    document.head.appendChild(link)
  }, [])
}

function Wordmark({ plain, gold, font }: { plain: string; gold: string; font: string | null }) {
  return <span className="brand-word" style={font ? { fontFamily: `'${font}', sans-serif` } : undefined}>{plain}<span className="brand-gold">{gold}</span></span>
}

function LetterMark({ letter, font }: { letter: string; font: string }) {
  return <span className="brand-letter" style={{ fontFamily: `'${font}', sans-serif` }} aria-hidden="true">{letter}</span>
}

export function BrandPage() {
  useBrandFonts()
  const { data, error, reload } = useLoad(() => admin<Brand>('brand'), 'brand')
  const [name, setName] = useState<string | null>(null)
  const [at, setAt] = useState(0)
  const [tagline, setTagline] = useState('')
  const [topLine, setTopLine] = useState('')
  const [hero, setHero] = useState('')
  const [company, setCompany] = useState('')
  const [tagColor, setTagColor] = useState('')
  const [tagHigh, setTagHigh] = useState('')
  const [tagAt, setTagAt] = useState(0)
  const [font, setFont] = useState<string | null>(null)
  const [logoKind, setLogoKind] = useState<LogoKind>('builtin')
  const [ownLogo, setOwnLogo] = useState<string | null>(null)
  const [logoError, setLogoError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!data) return
    setName(data.plain + data.gold)
    setAt(data.plain.length)
    setTagline(data.tagline)
    setTopLine(data.topLine ?? '')
    setHero(data.hero ?? '')
    setCompany(data.company ?? '')
    setTagColor(data.taglineColor ?? '')
    setTagHigh(data.taglineHighlight ?? '')
    setTagAt(data.taglineAt ?? data.tagline.length)
    setFont(data.font)
    setOwnLogo(data.logo)
    setLogoKind(data.logo ? 'own' : 'builtin')
  }, [data])

  if (error) return <div className="page"><ErrorBox message={error} onRetry={reload} /></div>
  if (!data || name === null) return <Loading />

  const { plain, gold } = splitName(name, at)
  const letter = letterOf(name)
  const pickFont = font ?? BRAND_FONTS[0]
  const tagParts = taglineParts(tagline, tagAt)
  const tagAtSaved = tagAt >= tagline.length ? null : tagAt
  const nameBad = !name.trim() || !NAME_OK.test(name) || plain.length > 30 || gold.length > 30
  const changed = plain !== data.plain || gold !== data.gold || tagline !== data.tagline || (topLine || null) !== (data.topLine || null) || (hero.trim() || null) !== (data.hero || null) || (company.trim() || null) !== (data.company || null)
    || (tagColor || null) !== (data.taglineColor || null) || (tagHigh || null) !== (data.taglineHighlight || null)
    || (tagAtSaved ?? null) !== (data.taglineAt ?? null)
    || font !== data.font || (logoKind === 'own' ? ownLogo : logoKind === 'letter' ? 'letter' : null) !== data.logo
  const ready = !nameBad && tagline.trim().length > 0 && !(logoKind === 'own' && !ownLogo)

  function typeName(next: string) {
    const was = name ?? ''
    setName(next)
    setAt(autoSplit(next))
    setTagline((v) => followName(v, was, next))
    setTopLine((v) => followName(v, was, next))
    setSaved(false)
  }

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const problem = logoProblem(file)
    setLogoError(problem ?? '')
    if (problem) return
    const reader = new FileReader()
    reader.onload = () => { setOwnLogo(String(reader.result)); setLogoKind('own'); setSaved(false) }
    reader.readAsDataURL(file)
  }

  async function save(reason: string) {
    const logo = logoKind === 'own' ? ownLogo : logoKind === 'letter' ? await letterLogo(letter, pickFont) : null
    await admin('save_brand', { plain, gold, tagline: tagline.trim(), topLine: topLine.trim() || null, hero: hero.trim() || null, company: company.trim() || null, taglineColor: tagColor || null, taglineHighlight: tagHigh || null, taglineAt: tagAtSaved, font, logo, reason })
    setSaved(true)
  }

  const logoShown = logoKind === 'own' && ownLogo ? <img className="brand-logo-img" src={ownLogo} alt="" />
    : logoKind === 'letter' ? <LetterMark letter={letter} font={pickFont} />
    : <img className="brand-logo-img brand-builtin" src="/brand/boai-mark.svg" alt="" />

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>App name &amp; logo</h1><p className="muted">Until the name is final. Save for all changes the app, the website, sign-in pages, Terms and Privacy, bills and messages in about a minute.</p></div>
      </header>

      <Card title="Name">
        <div className="plan-form">
          <label className="field"><span>App name (one word or two)</span><input maxLength={60} value={name} onChange={(e) => typeName(e.target.value)} /></label>
          <div className="field"><span>Gold part starts at</span>
            <div className="brand-split">
              <button type="button" className="button small" aria-label="Gold part one letter earlier" disabled={at <= 1} onClick={() => { setAt(at - 1); setSaved(false) }}>◀</button>
              <Wordmark plain={plain} gold={gold} font={font} />
              <button type="button" className="button small" aria-label="Gold part one letter later" disabled={at >= name.length} onClick={() => { setAt(at + 1); setSaved(false) }}>▶</button>
            </div>
          </div>
          <label className="field"><span>Tagline (browser tab, landing)</span><input maxLength={80} value={tagline} onChange={(e) => { const next = e.target.value; setTagAt(tagAt >= tagline.length ? next.length : Math.min(tagAt, next.length)); setTagline(next); setSaved(false) }} /></label>
          <div className="field"><span>Second colour starts at</span>
            <div className="brand-split">
              <button type="button" className="button small" aria-label="Second colour one letter earlier" disabled={tagAt <= 0} onClick={() => { setTagAt(tagAt - 1); setSaved(false) }}>◀</button>
              <span className="brand-tag-split" style={tagColor ? { color: tagColor } : undefined}>{tagParts[0]}<span className="brand-tag-cut" aria-hidden="true">|</span><em style={tagHigh ? { background: 'none', color: tagHigh } : undefined}>{tagParts[1]}</em></span>
              <button type="button" className="button small" aria-label="Second colour one letter later" disabled={tagAt >= tagline.length} onClick={() => { setTagAt(tagAt + 1); setSaved(false) }}>▶</button>
            </div>
            <span className="sub">At the far right = the whole tagline in one colour.</span>
          </div>
          <ColorPick label="Tagline colour 1" value={tagColor} onChange={(c) => { setTagColor(c); setSaved(false) }} />
          <ColorPick label="Tagline colour 2" value={tagHigh} onChange={(c) => { setTagHigh(c); setSaved(false) }} />
          <label className="field"><span>Top line (landing, optional)</span><input maxLength={80} value={topLine} onChange={(e) => { setTopLine(e.target.value); setSaved(false) }} /></label>
          <label className="field"><span>Company name (landing and legal footers; empty = BOAI Private Limited)</span><input maxLength={120} value={company} placeholder="BOAI Private Limited" onChange={(e) => { setCompany(e.target.value); setSaved(false) }} /></label>
        </div>
        {nameBad && name.trim() && <p className="form-error">Use letters, numbers and spaces only, up to 30 in each part.</p>}
      </Card>

      <Card title="Pick a style">
        <div className="brand-cards">
          {BRAND_FONTS.map((f) => (
            <button type="button" key={f} className={`brand-card ${font === f ? 'is-on' : ''}`} aria-pressed={font === f} onClick={() => { setFont(f); setSaved(false) }}>
              <LetterMark letter={letter} font={f} />
              <Wordmark plain={plain} gold={gold} font={f} />
              <span className="sub">{f}</span>
            </button>
          ))}
        </div>
        {font && <button type="button" className="text-button" onClick={() => { setFont(null); setSaved(false) }}>Use the app's own font instead</button>}
      </Card>

      <Card title="Logo">
        <div className="brand-logo-choice" role="radiogroup" aria-label="Logo">
          <label className="field inline"><input type="radio" name="logo" checked={logoKind === 'letter'} onChange={() => { setLogoKind('letter'); setSaved(false) }} /><span>Letter logo “{letter}” in the picked style</span></label>
          <label className="field inline"><input type="radio" name="logo" checked={logoKind === 'own'} disabled={!ownLogo} onChange={() => { setLogoKind('own'); setSaved(false) }} /><span>My own picture</span></label>
          <label className="field inline"><input type="radio" name="logo" checked={logoKind === 'builtin'} onChange={() => { setLogoKind('builtin'); setSaved(false) }} /><span>Today's logo</span></label>
        </div>
        <label className="button small brand-upload">Upload logo…<input type="file" accept={LOGO_TYPES.join(',')} onChange={upload} hidden /></label>
        <span className="muted"> Square SVG or PNG, up to 200 KB.</span>
        {logoError && <p className="form-error">{logoError}</p>}
      </Card>

      <Card title="Preview">
        <div className="brand-preview">
          <div className="brand-preview-bar">{logoShown}<Wordmark plain={plain} gold={gold} font={font} /></div>
          <p className="brand-preview-tagline" style={tagColor ? { color: tagColor } : undefined}>{tagParts[0]}{tagParts[1] && <em style={tagHigh ? { background: 'none', color: tagHigh } : undefined}>{tagParts[1]}</em>}</p>
          <div className="brand-preview-body">
            <strong>{tagline || ' '}</strong>
            {topLine && <span>{topLine}</span>}
            <span className="sub">Browser tab: {tagline} · Bills: Provided by {plain + gold}</span>
            <span className="sub">Footer: © {new Date().getFullYear()} {company.trim() || 'BOAI Private Limited'}</span>
          </div>
        </div>
        <p className="muted">Not changed from here (needs a rebuild once the name is final): the installed app's icon and name on phones, the Google sign-in screen, the sign-in email sender and the web address.</p>
        <div className="dialog-actions">
          {saved && <span className="badge badge-good">Saved. Shows everywhere in about a minute.</span>}
          <button type="button" className="button primary" disabled={!ready || !changed} onClick={() => setConfirm(true)}>Save for all…</button>
        </div>
      </Card>

      {confirm && <ConfirmDialog title={`Change the app name to ${plain + gold}?`} action="Save for all" onDone={async (reason) => { await save(reason); reload() }} onClose={() => setConfirm(false)}>
        <p>Every customer sees the new name and logo in about a minute. It goes in the audit log and you get an alert.</p>
      </ConfirmDialog>}
    </div>
  )
}
