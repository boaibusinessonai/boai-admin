import { ArrowDown, ArrowUp } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { autoJobName, jobChanges, moveJob, sameList, toggleJob, type AutoJob } from '../lib/autoJobs'
import { admin } from '../lib/supabase'

// Business types › a business's page › Automation jobs (AUTO-0): which automation jobs each kind of this business sees
// in Store settings › Automation, in order. Tick, move, Save… with a reason (finance). Reaches every store of the kind at once.

export function AutoJobs({ kinds, jobs, lists, canEdit, onSaved }: {
  kinds: { key: string; name: string }[]; jobs: AutoJob[]; lists: Record<string, string[]>; canEdit: boolean; onSaved: () => void
}) {
  const [kind, setKind] = useState(kinds[0]?.key ?? '')
  const [edited, setEdited] = useState<Record<string, string[]>>({})
  const [pending, setPending] = useState(false)
  if (kinds.length === 0) return null
  const saved = lists[kind] ?? []
  const list = edited[kind] ?? saved
  const set = (next: string[]) => setEdited({ ...edited, [kind]: next })
  const others = jobs.filter((job) => !list.includes(job.key))
  const ready = (key: string) => jobs.find((job) => job.key === key)?.ready
  const save = async (reason: string) => {
    await admin('save_auto_jobs', { kind, jobs: list, reason })
    setEdited(Object.fromEntries(Object.entries(edited).filter(([key]) => key !== kind)))
    onSaved()
  }
  return (
    <section className="plan-form" aria-label="Automation jobs">
      <h3 className="span-2">Automation jobs</h3>
      <p className="sub span-2">What Store settings › Automation lists for this kind, in this order. Reaches every store of the kind at once; a job taken off keeps its stores’ settings.</p>
      {kinds.length > 1 && (
        <label className="field span-2"><span>Kind</span>
          <select value={kind} onChange={(event) => setKind(event.target.value)}>{kinds.map((one) => <option key={one.key} value={one.key}>{one.name}</option>)}</select>
        </label>
      )}
      <ol className="span-2 auto-jobs">
        {list.map((key, at) => (
          <li key={key}>
            <label className="check"><input type="checkbox" checked disabled={!canEdit} onChange={() => set(toggleJob(list, key))} />{' '}{autoJobName(key)}
              {!ready(key) && <span className="sub"> · coming soon (its engine is not built yet)</span>}</label>
            {canEdit && key !== 'bot' && (
              <span>
                <button type="button" className="icon-button" aria-label={`Move ${autoJobName(key)} up`} disabled={at <= 1} onClick={() => set(moveJob(list, key, -1))}><ArrowUp size={14} /></button>
                <button type="button" className="icon-button" aria-label={`Move ${autoJobName(key)} down`} disabled={at === list.length - 1} onClick={() => set(moveJob(list, key, 1))}><ArrowDown size={14} /></button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {others.length > 0 && (
        <div className="span-2">
          <p className="sub">Not on this kind’s list:</p>
          {others.map((job) => (
            <label key={job.key} className="check"><input type="checkbox" checked={false} disabled={!canEdit} onChange={() => set(toggleJob(list, job.key))} />{' '}{autoJobName(job.key)}</label>
          ))}
        </div>
      )}
      {canEdit && (
        <div className="dialog-actions span-2">
          <button type="button" className="button primary" disabled={sameList(list, saved)} onClick={() => setPending(true)}>Save jobs…</button>
        </div>
      )}
      {pending && (
        <ConfirmDialog title="Save these automation jobs?" action="Save" onDone={save} onClose={() => setPending(false)}>
          <p>{kinds.find((one) => one.key === kind)?.name}: {jobChanges(saved, list).join('; ')}. Every store of this kind sees it at once.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}
