import { useState, type FormEvent } from 'react'
import { formatDateTime } from '../lib/format'
import { admin, AdminError } from '../lib/supabase'
import type { Note } from '../lib/types'
import { ErrorBox } from './ui'

// Notes by admins on an owner's account or a lead (each one is in the audit log).

export function NoteForm({ targetType, targetId, onSaved }: { targetType: 'profile' | 'lead'; targetId: string; onSaved: () => void }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    setError('')
    try {
      await admin('add_note', { targetType, targetId, body: body.trim() })
      setBody('')
      onSaved()
    } catch (e) {
      setError(e instanceof AdminError ? e.message : 'Couldn’t save the note.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="note-form" onSubmit={save}>
      <textarea rows={3} maxLength={2000} placeholder="Add a note for the team" value={body} onChange={(event) => setBody(event.target.value)} aria-label="Note" />
      {error && <ErrorBox message={error} />}
      <button type="submit" className="button" disabled={busy || !body.trim()}>{busy ? 'Saving…' : 'Add note'}</button>
    </form>
  )
}

export function Notes({ notes }: { notes: Note[] }) {
  if (!notes.length) return <p className="muted">No notes yet.</p>
  return (
    <ul className="list notes">
      {notes.map((note) => <li key={note.id}><p className="note-body">{note.body}</p><span className="sub">{note.by} · {formatDateTime(note.createdAt)}</span></li>)}
    </ul>
  )
}
