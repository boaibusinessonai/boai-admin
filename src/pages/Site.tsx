import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Card, ErrorBox, Loading, OpensInView } from '../components/ui'
import { admin } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'
import { SITE_TABS, type Landing, type SiteTab } from '../lib/publicSite'
import { LandingTabs, Preview } from './SiteLanding'

// Public website in tabs (DEMO-1, owner 2026-11-26, board AdminA): the tabs follow the landing page from top to bottom
// (Top box · Right box · Business cards · Our app · Links · Notices · Questions · Legal), a small live preview, Save. Changes
// show on the website in about a minute, no deploy. Words only: a discount is still given by hand, so an offer changes no charge.

type Notice = { id?: string; kind: string; title: string | null; message: string; placesLeft: number | null; on: boolean; startsOn: string | null; endsOn: string | null }
type Links = Partial<Record<(typeof LINK_FIELDS)[number][0], string>>
type Faq = { q: string; a: string }
type Legal = { company?: Partial<Record<(typeof COMPANY_FIELDS)[number][0], string>>; docs?: Record<string, string> }
type Data = { open: boolean; links: Links; notices: Notice[]; faq: Faq[]; legal: Legal; landing?: Landing; demos?: { kind: string; name: string; ready: boolean; on: boolean }[]; appFile?: string | null; webAddress?: string | null }
type Pending = { title: string; danger?: boolean; run: (reason: string) => Promise<unknown> }

const LINK_FIELDS = [['facebook', 'Facebook link'], ['instagram', 'Instagram link'], ['youtube', 'YouTube link'], ['phone', 'Phone'], ['whatsapp', 'WhatsApp number'], ['email', 'Email']] as const
// Legal pages (V20): the company's details fill the pages' [placeholders]; a page's own text replaces its built-in words.
const COMPANY_FIELDS = [['address', 'Registered office address'], ['email', 'Support email (empty: the Email above)'], ['phone', 'Phone (empty: the Phone above)'], ['grievanceEmail', 'Grievance email'], ['securityEmail', 'Security email'], ['city', 'City (for courts)'], ['cin', 'CIN'], ['gstin', 'GSTIN'], ['owner', 'Grievance Officer name'], ['hours', 'Hours']] as const
const LEGAL_PAGES: [string, string][] = [['terms', 'Terms of Service'], ['privacy', 'Privacy Policy'], ['refunds', 'Refund and Cancellation Policy'], ['delivery', 'Service Delivery Policy'], ['contact', 'Contact us'], ['about', 'About'], ['grievance', 'Grievance Officer'], ['data-processing', 'Data Processing Terms'], ['sub-processors', 'Sub-processors'], ['acceptable-use', 'Acceptable Use Policy'], ['cookies', 'Cookies and Local Storage'], ['security', 'Security'], ['licences', 'Open-source licences']]
const KINDS: [string, string][] = [['ribbon', 'Ribbon (top of the page)'], ['banner', 'Banner'], ['announcement', 'Announcement']]
const BLANK: Notice = { kind: 'banner', title: '', message: '', placesLeft: null, on: true, startsOn: null, endsOn: null }

function showing(notice: Notice) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  if (!notice.on) return <Badge>Off</Badge>
  if (notice.startsOn && notice.startsOn > today) return <Badge tone="accent">From {notice.startsOn}</Badge>
  if (notice.endsOn && notice.endsOn < today) return <Badge tone="warning">Ended</Badge>
  return <Badge tone="good">Showing</Badge>
}

export function Site() {
  const { data, error, reload } = useLoad(() => admin<Data>('site'), 'site')
  const [draft, setDraft] = useState<Notice | null>(null)
  const [links, setLinks] = useState<Links | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [faq, setFaq] = useState<Faq[] | null>(null)
  const [legal, setLegal] = useState<Legal | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [page, setPage] = useState(LEGAL_PAGES[0]![0])
  const [tab, setTab] = useState<SiteTab>('heading')
  const [landing, setLanding] = useState<Landing | null>(null)
  if (error) return <div className="page"><ErrorBox message={error} onRetry={reload} /></div>
  if (!data) return <Loading />
  // The stage's app website (Open the website ↗): Admin and app share the host's name pattern (boai-build-admin → boai-build).
  const appSite = typeof window === 'undefined' ? null : window.location.hostname.includes('-admin') ? `${window.location.protocol}//${window.location.host.replace('-admin', '')}/` : null
  const shownLinks = links ?? data.links
  const shownFaq = faq ?? data.faq ?? []
  const shownLegal = legal ?? data.legal ?? {}
  const editFaq = (index: number, change: Partial<Faq>) => setFaq(shownFaq.map((item, at) => (at === index ? { ...item, ...change } : item)))
  const moveFaq = (index: number, by: number) => {
    const next = [...shownFaq]; const [item] = next.splice(index, 1); next.splice(index + by, 0, item!); setFaq(next)
  }
  const faqReady = shownFaq.every((item) => item.q.trim() && item.a.trim())
  const setCompany = (key: string, value: string) => setLegal({ ...shownLegal, company: { ...shownLegal.company, [key]: value } })
  const setDoc = (value: string) => setLegal({ ...shownLegal, docs: { ...shownLegal.docs, [page]: value } })
  const saveLegal = (reason: string) => {
    const filled = (box: Record<string, string> = {}) => Object.fromEntries(Object.entries(box).filter(([, value]) => value.trim()))
    return admin('save_site_legal', { company: filled(shownLegal.company), docs: filled(shownLegal.docs), reason })
  }
  const set = (change: Partial<Notice>) => setDraft((current) => (current ? { ...current, ...change } : current))
  const settings = (open: boolean, reason: string) => {
    const filled = Object.fromEntries(Object.entries(shownLinks).filter(([, value]) => value))
    return admin('save_site_settings', { open, ...filled, reason })
  }
  function saveNotice(notice: Notice) {
    const { id, kind, title, message, placesLeft, on, startsOn, endsOn } = notice
    setPending({ title: 'Save this notice?', run: async (reason) => {
      await admin('save_notice', { ...(id ? { id } : {}), kind, title: title || null, message, placesLeft, on, startsOn: startsOn || null, endsOn: endsOn || null, reason })
      setDraft(null)
    } })
  }
  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Public website</h1><p className="muted">The landing’s heading lines, customers cloud, cards, app links, notices, questions and legal pages. Save shows on the website in about a minute, no deploy.</p></div>
        <div className="site-head-end">
          <Badge tone={data.open ? 'good' : 'warning'}>{data.open ? 'Website open' : 'Website closed'}</Badge>
          {appSite && <a className="button small" href={appSite} target="_blank" rel="noopener noreferrer">Open the website ↗</a>}
          <button type="button" className="button small" title="Closed: the website shows only “BOAI, by invitation” and Sign in. People who already have accounts keep working." onClick={() => setPending({ title: data.open ? 'Close the public website?' : 'Open the public website?', danger: data.open, run: (reason) => settings(!data.open, reason) })}>{data.open ? 'Close the website…' : 'Open the website…'}</button>
        </div>
      </header>

      <div className="tabs site-tabs" role="tablist" aria-label="Public website parts">
        {SITE_TABS.map(([key, name]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={`tab${tab === key ? ' is-on' : ''}`} onClick={() => setTab(key)}>{name}</button>)}
      </div>

      <div className="site-split">
      <div className="site-main">
      {(tab === 'heading' || tab === 'partners' || tab === 'cards' || tab === 'app') && (
        <LandingTabs tab={tab} saved={data.landing ?? {}} draft={landing} setDraft={setLanding} demos={data.demos ?? []} appFile={data.appFile ?? null}
          onSave={() => setPending({ title: 'Save the landing page?', run: async (reason) => { await admin('save_site_landing', { ...(landing ?? {}), reason }); setLanding(null) } })} />
      )}

      {tab === 'notices' && <Card title="Offers and notices" action={<button type="button" className="button small" onClick={() => setDraft({ ...BLANK })}>New notice</button>}>
        <ul className="list">
          {data.notices.map((notice) => (
            <li key={notice.id}>{showing(notice)} <strong>{notice.title}</strong> {notice.message}
              <span className="sub">{KINDS.find(([kind]) => kind === notice.kind)?.[1]}{notice.placesLeft !== null ? ` · ${notice.placesLeft} places left` : ''}{notice.startsOn ? ` · from ${notice.startsOn}` : ''}{notice.endsOn ? ` · to ${notice.endsOn}` : ''}</span>{' '}
              <button type="button" className="button small" onClick={() => setDraft({ ...notice })}>Edit</button>{' '}
              <button type="button" className="button small" onClick={() => setPending({ title: 'Remove this notice?', danger: true, run: (reason) => admin('delete_notice', { id: notice.id, reason }) })}>Remove</button>
            </li>
          ))}
        </ul>
        {draft && (
          <OpensInView><div className="plan-form">
            <label className="field"><span>Where</span><select value={draft.kind} onChange={(event) => set({ kind: event.target.value })}>{KINDS.map(([kind, name]) => <option key={kind} value={kind}>{name}</option>)}</select></label>
            <label className="field"><span>Heading (optional)</span><input maxLength={80} value={draft.title ?? ''} onChange={(event) => set({ title: event.target.value })} /></label>
            <label className="field"><span>Words</span><input maxLength={300} value={draft.message} onChange={(event) => set({ message: event.target.value })} /></label>
            <label className="field"><span>Places left (optional)</span><input inputMode="numeric" value={draft.placesLeft ?? ''} onChange={(event) => set({ placesLeft: /^\d+$/.test(event.target.value) ? Number(event.target.value) : null })} /></label>
            <label className="field"><span>From (blank: now)</span><input type="date" value={draft.startsOn ?? ''} onChange={(event) => set({ startsOn: event.target.value || null })} /></label>
            <label className="field"><span>To (blank: no end)</span><input type="date" value={draft.endsOn ?? ''} onChange={(event) => set({ endsOn: event.target.value || null })} /></label>
            <label className="field inline"><input type="checkbox" checked={draft.on} onChange={(event) => set({ on: event.target.checked })} /><span>On</span></label>
            <div className="dialog-actions">
              <button type="button" className="button" onClick={() => setDraft(null)}>Cancel</button>
              <button type="button" className="button primary" disabled={!draft.message.trim()} onClick={() => saveNotice(draft)}>Save…</button>
            </div>
          </div></OpensInView>
        )}
        <p className="muted">Words only: an offer here changes no price or charge (a discount is still given by hand). From / To dates switch it on and off by itself.</p>
      </Card>}

      {tab === 'links' && <Card title="Links and contact numbers">
        <div className="plan-form">
          {LINK_FIELDS.map(([key, name]) => (
            <label className="field" key={key}><span>{name}</span><input value={shownLinks[key] ?? ''} onChange={(event) => setLinks({ ...shownLinks, [key]: event.target.value })} /></label>
          ))}
        </div>
        <div className="dialog-actions"><button type="button" className="button" disabled={!links} onClick={() => setPending({ title: 'Save the links?', run: async (reason) => { await settings(data.open, reason); setLinks(null) } })}>Save links…</button></div>
      </Card>}

      {tab === 'links' && <Card title="This website's address">
        <p className="muted">Links in the WhatsApp messages the app sends by itself (pay links, feedback links) start with it. Set it on each stage (a release never copies it); not set = such a message waits for the shop to send it.</p>
        <div className="plan-form">
          <label className="field"><span>Address (like https://example.web.app)</span><input value={address ?? data.webAddress ?? ''} onChange={(event) => setAddress(event.target.value)} /></label>
        </div>
        <div className="dialog-actions"><button type="button" className="button" disabled={address === null} onClick={() => setPending({ title: 'Save the website address?', run: async (reason) => { await admin('save_site_address', { address: address ?? '', reason }); setAddress(null) } })}>Save address…</button></div>
      </Card>}

      {tab === 'questions' && <Card title="Questions on the landing page" action={<button type="button" className="button small" onClick={() => setFaq([...shownFaq, { q: '', a: '' }])} disabled={shownFaq.length >= 30}>Add a question</button>}>
        <p className="muted">Shown in this order under Setup on the landing page. No questions: the FAQ is not shown. Up to 30.</p>
        <div className="plan-form">
          {shownFaq.map((item, index) => (
            <div className="field" key={index}>
              <label className="field"><span>Question {index + 1}</span><input maxLength={150} value={item.q} onChange={(event) => editFaq(index, { q: event.target.value })} /></label>
              <label className="field"><span>Answer</span><textarea rows={2} maxLength={1000} value={item.a} onChange={(event) => editFaq(index, { a: event.target.value })} /></label>
              <div className="dialog-actions">
                <button type="button" className="button small" disabled={index === 0} onClick={() => moveFaq(index, -1)}>Up</button>
                <button type="button" className="button small" disabled={index === shownFaq.length - 1} onClick={() => moveFaq(index, 1)}>Down</button>
                <button type="button" className="button small" onClick={() => setFaq(shownFaq.filter((_, at) => at !== index))}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        <div className="dialog-actions"><button type="button" className="button" disabled={!faq || !faqReady} onClick={() => setPending({ title: 'Save the questions?', run: async (reason) => { await admin('save_site_faq', { items: shownFaq.map(({ q, a }) => ({ q: q.trim(), a: a.trim() })), reason }); setFaq(null) } })}>Save questions…</button></div>
      </Card>}

      {tab === 'legal' && <Card title="Legal pages">
        <p className="muted">The company's details fill the [boxes in brackets] on every policy page and the footers. Empty: the page keeps its built-in words. Grace days come from Plans › Renewal. Have a lawyer check changes.</p>
        <div className="plan-form">
          {COMPANY_FIELDS.map(([key, name]) => (
            <label className="field" key={key}><span>{name}</span><input maxLength={key === 'address' ? 300 : 254} value={shownLegal.company?.[key] ?? ''} onChange={(event) => setCompany(key, event.target.value)} /></label>
          ))}
        </div>
        <label className="field"><span>Page</span><select value={page} onChange={(event) => setPage(event.target.value)}>{LEGAL_PAGES.map(([slug, name]) => <option key={slug} value={slug}>{name}{shownLegal.docs?.[slug]?.trim() ? ' (own text)' : ''}</option>)}</select></label>
        <label className="field"><span>Own text for this page (empty: the built-in words). A line starting “## ” is a heading, “- ” a list line.</span><textarea rows={12} maxLength={40000} value={shownLegal.docs?.[page] ?? ''} onChange={(event) => setDoc(event.target.value)} /></label>
        <p className="muted">To start from today's words, open the page on the website (#/legal/{page}) and copy them in.</p>
        <div className="dialog-actions"><button type="button" className="button" disabled={!legal} onClick={() => setPending({ title: 'Save the legal pages?', run: async (reason) => { await saveLegal(reason); setLegal(null) } })}>Save legal pages…</button></div>
      </Card>}
      </div>
      <Preview landing={{ ...(data.landing ?? {}), ...(landing ?? {}) }} ribbon={data.notices.find((n) => n.kind === 'ribbon' && n.on) ?? null} />
      </div>

      {pending && <ConfirmDialog title={pending.title} action="Confirm" danger={pending.danger} onDone={async (reason) => { await pending.run(reason); reload() }} onClose={() => setPending(null)}><p>This changes the public website. It goes in the audit log.</p></ConfirmDialog>}
    </div>
  )
}
