import { useMemo, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Card, ErrorBox, Loading } from '../components/ui'
import { changesToSend, chapters, goneKeys, matches, missingParts, ownWordsProblem } from '../lib/helpWords'
import { admin } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'

// Admin › Help words (V21, ctl-5): the words of the app's Help & guide and page walk-throughs. Blank = the built-in
// words. Changes show in the app at its next start, with no deploy.

type Data = { help?: Record<string, string> }

export function HelpWords() {
  const { data, error, reload } = useLoad(() => admin<Data>('site'), 'site')
  const all = useMemo(() => chapters(), [])
  const [chapter, setChapter] = useState(all[0]?.key ?? '')
  const [q, setQ] = useState('')
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  if (error) return <div className="page"><ErrorBox message={error} onRetry={reload} /></div>
  if (!data) return <Loading />
  const saved = data.help ?? {}
  const shown = (key: string) => edits[key] ?? saved[key] ?? ''
  const changes = changesToSend(edits, saved)
  const problems = Object.keys(edits).map((key) => ownWordsProblem(key, edits[key]!)).filter(Boolean)
  const searching = q.trim() !== ''
  const list = all.flatMap((c) => (searching || c.key === chapter ? c.rows.filter((row) => matches(row, shown(row.key), q)).map((row) => ({ ...row, chapter: c.title })) : []))
  const gone = goneKeys(saved)
  const changedCount = Object.keys(saved).length
  const save = async (reason: string) => {
    await admin('save_help_words', { words: changes, reason })
    setEdits({})
    reload()
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Help words</h1>
          <p className="muted">The words of Help &amp; guide and the page walk-throughs in the app. Leave a box empty for the built-in words. People see a change the next time they open the app; nothing is deployed.</p>
        </div>
      </header>
      <Card title={`${changedCount} of ${all.reduce((n, c) => n + c.rows.length, 0)} changed`}>
        <label className="field"><span>Find words</span><input value={q} placeholder="A word in the guide, e.g. khata" onChange={(event) => setQ(event.target.value)} /></label>
        {!searching && (
          <div className="chips" role="tablist" aria-label="Chapters">
            {all.map((c) => (
              <button key={c.key} type="button" role="tab" aria-selected={c.key === chapter} className={`chip${c.key === chapter ? ' is-on' : ''}`} onClick={() => setChapter(c.key)}>
                {c.title}{c.rows.some((row) => saved[row.key]) ? ' •' : ''}
              </button>
            ))}
          </div>
        )}
      </Card>
      <ul className="list">
        {list.length === 0 && <li className="muted">No help words have these words.</li>}
        {list.map((row) => {
          const own = shown(row.key)
          const problem = ownWordsProblem(row.key, own)
          const missing = own.trim() ? missingParts(row.key, own) : []
          return (
            <li key={row.key} className="help-word">
              <div className="sub">{searching ? `${row.chapter} · ` : ''}{row.key}{saved[row.key] ? <> <Badge tone="accent">Changed</Badge></> : null}</div>
              <p className="muted">Built-in: {row.builtIn}</p>
              <label className="field"><span>Own words (empty: built-in)</span>
                <textarea rows={2} maxLength={2000} value={own} onChange={(event) => setEdits({ ...edits, [row.key]: event.target.value })} /></label>
              {problem && <p className="tone-critical">{problem}</p>}
              {!problem && missing.length > 0 && <p className="tone-warning">These words leave out {missing.map((p) => `{${p}}`).join(', ')} (the app fills it in).</p>}
            </li>
          )
        })}
      </ul>
      {gone.length > 0 && (
        <Card title="Changed words the app no longer has">
          <p className="muted">The app dropped these keys, so these words show nowhere. Clear them to tidy up.</p>
          <ul className="list">
            {gone.map((key) => (
              <li key={key}>{key}: {saved[key]}{' '}
                <button type="button" className="button small" onClick={() => setEdits({ ...edits, [key]: '' })}>{edits[key] === '' ? 'Will clear' : 'Clear'}</button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="plan-edit-actions dialog-actions">
        <button type="button" className="button" disabled={Object.keys(edits).length === 0} onClick={() => setEdits({})}>Undo my changes</button>
        <button type="button" className="button primary" disabled={Object.keys(changes).length === 0 || problems.length > 0} onClick={() => setPending(true)}>
          Save {Object.keys(changes).length || ''} {Object.keys(changes).length === 1 ? 'change' : 'changes'}…
        </button>
      </div>
      {pending && (
        <ConfirmDialog title="Save these help words?" action="Save" onDone={save} onClose={() => setPending(false)}>
          <p>Everyone sees these words the next time they open the app.</p>
          <ul>
            {Object.entries(changes).map(([key, words]) => <li key={key}><b>{key}:</b> {words || 'back to the built-in words'}</li>)}
          </ul>
        </ConfirmDialog>
      )}
    </div>
  )
}
