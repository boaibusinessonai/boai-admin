import { Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatRupees } from '../lib/format'
import { navigate, type Route } from '../lib/route'
import { admin } from '../lib/supabase'
import type { SearchResult } from '../lib/types'

// Ctrl/Cmd+K: one search over owners, businesses, leads and payments (Razorpay ids too).

type Hit = { key: string; group: string; title: string; detail: string; route: Route }

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const [result, setResult] = useState<SearchResult | null>(null)
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { input.current?.focus() }, [])

  useEffect(() => {
    const text = q.trim()
    if (text.length < 2) return
    let live = true
    const timer = window.setTimeout(async () => {
      setBusy(true)
      try {
        const found = await admin<SearchResult>('search', { q: text })
        if (live) { setResult(found); setActive(0) }
      } catch {
        if (live) setResult(null)
      } finally {
        if (live) setBusy(false)
      }
    }, 300)
    return () => { live = false; window.clearTimeout(timer) }
  }, [q])

  const shown = q.trim().length >= 2 ? result : null
  const hits = useMemo<Hit[]>(() => !shown ? [] : [
    ...shown.owners.map((o) => ({ key: `o${o.id}`, group: 'Owners', title: o.name, detail: [o.email, o.phone].filter(Boolean).join(' · '), route: { page: 'customer', id: o.id } as Route })),
    ...shown.businesses.map((b) => ({ key: `b${b.id}`, group: 'Businesses', title: b.name, detail: `${b.industry ?? ''}${b.deleted ? ' · deleted' : ''}`, route: { page: 'customer', id: b.ownerId } as Route })),
    ...shown.leads.map((l) => ({ key: `l${l.id}`, group: 'Leads', title: l.name, detail: `${l.phone} · ${l.status}`, route: { page: 'leads', id: l.id } as Route })),
    ...shown.payments.map((p) => ({ key: `p${p.id}`, group: 'Payments', title: p.title, detail: `${formatRupees(p.amount)} · ${p.status}`, route: { page: 'customer', id: p.ownerId } as Route })),
  ], [shown])

  const go = (hit: Hit | undefined) => { if (hit) { navigate(hit.route); onClose() } }
  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search everything" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-input">
          <Search size={18} aria-hidden="true" />
          <input ref={input} value={q} placeholder="Search owners, businesses, phones, leads, payment ids…" onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose()
              if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(hits.length - 1, i + 1)) }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
              if (event.key === 'Enter') go(hits[active])
            }} aria-label="Search" />
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <ul className="palette-results" role="listbox">
          {hits.map((hit, index) => (
            <li key={hit.key} role="option" aria-selected={index === active}>
              {(index === 0 || hits[index - 1]!.group !== hit.group) && <span className="palette-group">{hit.group}</span>}
              <button type="button" className={`palette-hit ${index === active ? 'is-on' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => go(hit)}>
                <strong>{hit.title}</strong><span className="sub">{hit.detail}</span>
              </button>
            </li>
          ))}
          {q.trim().length >= 2 && !busy && shown && !hits.length && <li className="muted palette-empty">Nothing found.</li>}
          {busy && <li className="muted palette-empty">Searching…</li>}
        </ul>
        <p className="palette-foot muted small">Searches are logged.</p>
      </div>
    </div>
  )
}
