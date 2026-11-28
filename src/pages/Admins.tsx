import { UserPlus } from 'lucide-react'
import { compareText } from '../lib/sort'
import { useState, type FormEvent } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Card, ErrorBox, Loading } from '../components/ui'
import { formatAgo, formatDate, formatDateTime } from '../lib/format'
import { admin } from '../lib/supabase'
import type { AdminPerson, AdminRole } from '../lib/types'
import { useLoad } from '../lib/useLoad'

// Admins & roles (owner only). The portal adds and changes finance and support
// admins; owners are added in the database only, so they can't be locked out.

const ROLE_INFO: Record<AdminRole, string> = {
  owner: 'Everything, including admins and the audit log',
  finance: 'Payments, credit, refunds and plans, and everything support sees',
  support: 'Dashboard, Customer 360, leads and notes (read-only on accounts)',
}
const STATUS: Record<AdminPerson['status'], { label: string; tone: 'good' | 'warning' | 'critical' }> = {
  active: { label: 'Active', tone: 'good' },
  invited: { label: 'Not signed in yet', tone: 'warning' },
  removed: { label: 'Removed', tone: 'critical' },
}

type Pending =
  | { kind: 'add'; email: string; role: AdminRole }
  | { kind: 'role'; person: AdminPerson; role: AdminRole }
  | { kind: 'active'; person: AdminPerson; active: boolean }

export function Admins() {
  const { data, error, reload } = useLoad(() => admin<{ admins: AdminPerson[]; me: string }>('admins'), 'admins')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AdminRole>('support')
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)

  function startAdd(event: FormEvent) {
    event.preventDefault()
    const clean = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { setFormError('Enter their Google email address.'); return }
    if (data?.admins.some((a) => a.email === clean)) { setFormError('This email is already on the list. Change it below.'); return }
    setFormError('')
    setPending({ kind: 'add', email: clean, role })
  }

  async function apply(reason: string) {
    if (!pending) return
    if (pending.kind === 'add') {
      await admin('add_admin', { email: pending.email, role: pending.role, reason })
      setEmail('')
    } else if (pending.kind === 'role') {
      await admin('update_admin', { adminId: pending.person.id, role: pending.role, reason })
    } else {
      await admin('update_admin', { adminId: pending.person.id, active: pending.active, reason })
    }
    reload()
  }

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Admins &amp; roles</h1><p className="muted">Who can use BOAI Admin. Every change needs a reason and your code, is in the audit log and sends you an alert.</p></div>
      </header>

      <Card title="Add someone">
        <form className="add-admin" onSubmit={startAdd}>
          <label className="field"><span>Their Google email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@gmail.com" autoComplete="off" /></label>
          <label className="field"><span>Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value as AdminRole)}>
              <option value="support">Support</option>
              <option value="finance">Finance</option>
            </select>
          </label>
          <button type="submit" className="button primary"><UserPlus size={16} aria-hidden="true" /> Add</button>
        </form>
        <p className="muted small">{ROLE_INFO[role]}. Nothing is sent to them: share the admin site's address. They sign in with this Google account and set up their own code. Owners are added in the database only.</p>
        {formError && <ErrorBox message={formError} />}
      </Card>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <Card title={`On the list (${data.admins.filter((a) => a.active).length} active)`}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Admin</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Added</th><th /></tr></thead>
              <tbody>
                {[...data.admins].sort((a, b) => compareText(a.role, b.role) || compareText(a.email, b.email)).map((person) => {
                  const fixed = person.role === 'owner' || person.id === data.me
                  return (
                    <tr key={person.id}>
                      <td><strong>{person.email}</strong>{person.id === data.me && <span className="sub">You</span>}</td>
                      <td>
                        {fixed || !person.active
                          ? <span className="stack">{person.role}{person.role === 'owner' && <span className="sub">changed in the database only</span>}</span>
                          : (
                            <select value={person.role} aria-label={`Role of ${person.email}`} onChange={(event) => setPending({ kind: 'role', person, role: event.target.value as AdminRole })}>
                              <option value="support">support</option>
                              <option value="finance">finance</option>
                            </select>
                          )}
                      </td>
                      <td><Badge tone={STATUS[person.status].tone}>{STATUS[person.status].label}</Badge></td>
                      <td>
                        {person.lastSession ? formatAgo(person.lastSession.startedAt) : 'never'}
                        {person.lastSession && <span className="sub" title={person.lastSession.device ?? ''}>{formatDateTime(person.lastSession.startedAt)} · {person.lastSession.ip ?? 'unknown IP'}</span>}
                      </td>
                      <td>{formatDate(person.createdAt)}{person.addedBy && <span className="sub">by {person.addedBy}</span>}</td>
                      <td>
                        {!fixed && (person.active
                          ? <button type="button" className="button small danger" onClick={() => setPending({ kind: 'active', person, active: false })}>Remove</button>
                          : <button type="button" className="button small" onClick={() => setPending({ kind: 'active', person, active: true })}>Switch on again</button>)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pending && (
        <ConfirmDialog
          title={pending.kind === 'add' ? 'Add an admin' : pending.kind === 'role' ? 'Change role' : pending.active ? 'Switch access back on' : 'Remove access'}
          action={pending.kind === 'add' ? 'Add' : pending.kind === 'role' ? 'Change role' : pending.active ? 'Switch on' : 'Remove'}
          danger={pending.kind === 'active' && !pending.active}
          onDone={apply} onClose={() => setPending(null)}>
          {pending.kind === 'add' && <p><strong>{pending.email}</strong> gets <strong>{pending.role}</strong> access: {ROLE_INFO[pending.role].toLowerCase()}.</p>}
          {pending.kind === 'role' && <p><strong>{pending.person.email}</strong>: {pending.person.role} → <strong>{pending.role}</strong>. {ROLE_INFO[pending.role]}.</p>}
          {pending.kind === 'active' && (pending.active
            ? <p><strong>{pending.person.email}</strong> can sign in again as {pending.person.role}.</p>
            : <p><strong>{pending.person.email}</strong> loses access on their next click. Their past actions stay in the audit log under their name.</p>)}
        </ConfirmDialog>
      )}
    </div>
  )
}
