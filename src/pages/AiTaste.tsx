import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Card, ErrorBox, Loading } from '../components/ui'
import { changed, DAYS, formOf, payload, PACKS, problem, ROWS_MAX, summary, type Pack, type Taste, type TasteForm } from '../lib/aiTaste'
import { admin } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'

// Admin › AI free taste (ML-6, ML_PLAN "Free taste and paid"): per AI pack (StockSense, ComeBack, BizBrain) the free weekly
// taste every store without the pack gets: on / off, how many rows are open, which day. Owner + finance; each save asks why
// (audit log). Admin data only: packs start off with no numbers. The weekly card itself comes with ML-7.

export function AiTaste() {
  const { data, error, reload } = useLoad(() => admin<Taste>('ml_free'), 'ml_free')
  const [forms, setForms] = useState<Partial<Record<Pack, TasteForm>>>({})
  const [saving, setSaving] = useState<Pack | null>(null)
  if (error) return <div className="page"><ErrorBox message={error} onRetry={reload} /></div>
  if (!data) return <Loading />
  const formFor = (pack: Pack) => forms[pack] ?? formOf(data.packs[pack])
  const set = (pack: Pack, part: Partial<TasteForm>) => setForms({ ...forms, [pack]: { ...formFor(pack), ...part } })
  const save = async (pack: Pack, reason: string) => {
    await admin('ml_free_save', { ...payload(pack, formFor(pack)), reason })
    setForms((now) => { const next = { ...now }; delete next[pack]; return next })
    reload()
  }
  const pending = saving ? PACKS.find((p) => p.key === saving)! : null

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>AI free taste</h1>
          <p className="muted">Once a week, every store without an AI pack gets a free card on Home and a Bell note with the pack's top rows open and the rest locked, from its own numbers. Set it per pack here. A pack stays off until it has free rows and a day.</p>
        </div>
      </header>
      {PACKS.map(({ key, name, what }) => {
        const row = data.packs[key]
        const form = formFor(key)
        const wrong = problem(form)
        return (
          <Card key={key} title={<>{name} {row?.on ? <Badge tone="good">On</Badge> : <Badge>Off</Badge>}</>}>
            <p className="muted">{what}</p>
            <p>{summary(row)}{row?.updatedBy ? <span className="muted"> Last changed by {row.updatedBy}.</span> : null}</p>
            <label className="check"><input type="checkbox" checked={form.on} onChange={(event) => set(key, { on: event.target.checked })} /> Free weekly card on</label>
            <label className="field"><span>Free rows (open on the card, 1 to {ROWS_MAX})</span>
              <input inputMode="numeric" value={form.rows} onChange={(event) => set(key, { rows: event.target.value.replace(/[^\d]/g, '') })} /></label>
            <label className="field"><span>Day of the week</span>
              <select value={form.day} onChange={(event) => set(key, { day: event.target.value })}>
                <option value="">Not set</option>
                {DAYS.map((day, i) => <option key={day} value={String(i + 1)}>{day}</option>)}
              </select></label>
            {wrong && <p className="tone-warning" role="status">{wrong}</p>}
            <div className="dialog-actions">
              <button type="button" className="button" disabled={!forms[key]} onClick={() => setForms((now) => { const next = { ...now }; delete next[key]; return next })}>Undo</button>
              <button type="button" className="button primary" disabled={!changed(row, form) || wrong !== null} onClick={() => setSaving(key)}>Save {name}…</button>
            </div>
          </Card>
        )
      })}
      {pending && (
        <ConfirmDialog title={`Save ${pending.name} free taste?`} action="Save" onDone={(reason) => save(pending.key, reason)} onClose={() => setSaving(null)}>
          <p>{summary({ on: formFor(pending.key).on, rows: Number(formFor(pending.key).rows) || null, day: Number(formFor(pending.key).day) || null })}</p>
          <p className="muted">Stores see it from the next weekly run. Stores that have {pending.name} are not changed.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}
