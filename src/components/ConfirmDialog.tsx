import { X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AdminError } from '../lib/supabase'
import { ErrorBox } from './ui'

// A change that matters: say what will happen and write why. The database keeps
// the reason in the audit log.

export function ConfirmDialog({ title, children, action, danger = false, onDone, onClose }: {
  title: string; children: ReactNode; action: string; danger?: boolean
  onDone: (reason: string) => Promise<void>; onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const first = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { first.current?.focus() }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (reason.trim().length < 3) { setError('Write why (at least a few words).'); return }
    setBusy(true)
    setError('')
    try {
      await onDone(reason.trim())
      onClose()
    } catch (e) {
      setError(e instanceof AdminError || e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="palette-backdrop" onMouseDown={busy ? undefined : onClose}>
      <form className="dialog" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}
        onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onClose() }}>
        <header className="card-head"><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button></header>
        <div className="dialog-body">{children}</div>
        <label className="field">
          <span>Why? (kept in the audit log)</span>
          <textarea ref={first} rows={2} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        {error && <ErrorBox message={error} />}
        <div className="dialog-actions">
          <button type="button" className="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={`button ${danger ? 'danger' : 'primary'}`} disabled={busy}>{busy ? 'Saving…' : action}</button>
        </div>
      </form>
    </div>
  )
}
