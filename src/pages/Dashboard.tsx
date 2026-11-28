import { RefreshCw } from 'lucide-react'
import { BarList, Card, ColumnChart, ErrorBox, Loading, Stat } from '../components/ui'
import { formatDate, formatDateTime, formatNumber, formatRupees, percent } from '../lib/format'
import { navigate } from '../lib/route'
import { useLoad } from '../lib/useLoad'
import { admin } from '../lib/supabase'
import type { AdminRole, Dashboard as Data } from '../lib/types'
import { monthNow, rs, type CostsData } from '../lib/costs'
import type { NumbersData } from '../lib/numbers'
import type { AdminPlan } from '../lib/planForm'

const shortDay = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

// V119 (Admin board H7tJ8eg1zwWM4UV8Pii6Ub): Our costs a month and Left a month (from Costs, its starting choices), Locks bought
// (from Numbers, last 30 days), and yearly costs that renew within 30 days (the admin has no To-do page; the Dashboard is its home).
// Owner and finance only: the database refuses Costs and Numbers to support. One of them failing leaves its boxes out.
const quiet = <T,>(load: () => Promise<T>) => load().catch(() => null)

export function Dashboard({ role }: { role: AdminRole }) {
  const { data, error, loading, reload } = useLoad(() => admin<Data>('dashboard'), 'dashboard')
  const money = role !== 'support'
  const costs = useLoad(() => money ? quiet(() => Promise.all([admin<CostsData>('costs'), admin<{ plans: AdminPlan[] }>('plans')])) : Promise.resolve(null), `dash-costs:${money}`)
  const locks = useLoad(() => money ? quiet(() => admin<NumbersData>('sell_numbers', { days: 30 })) : Promise.resolve(null), `dash-locks:${money}`)
  const month = costs.data ? monthNow(costs.data[0], costs.data[1].plans) : null
  const renewals = costs.data?.[0].renewalsDue ?? []
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <Loading />
  const { signups, businesses, accounts, revenue, bills, changes } = data
  const paidPlans = data.byPlan.filter((plan) => plan.code !== 'free')
  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Dashboard</h1><p className="muted">As of {formatDateTime(data.asOf)}</p></div>
        <button type="button" className="button" onClick={() => { reload(); costs.reload(); locks.reload() }} disabled={loading}><RefreshCw size={16} aria-hidden="true" className={loading ? 'spin' : ''} /> Refresh</button>
      </header>

      {renewals.length > 0 && <div className="note" role="status">
        {renewals.map((c) => <p key={c.id}><b>{c.name} renews on {c.nextDue ? formatDate(c.nextDue) : 'soon'}: {rs(c.paise ?? 0)}.</b> Once paid, tap Renewed on Costs.{' '}
          <button type="button" className="button small" onClick={() => navigate({ page: 'costs' })}>Open Costs</button></p>)}
      </div>}

      <div className="stats">
        <Stat label="MRR" value={formatRupees(revenue.mrr)} hint={`${formatRupees(revenue.mrr * 12)} a year at this rate`} />
        {month && <Stat label="Our costs a month" value={rs(month.costPaise)} hint="From Costs: fixed bills + what today's customers use" />}
        {month && <Stat label="Left a month" value={<span className={month.leftPaise < 0 ? 'tone-critical' : ''}>{rs(month.leftPaise)}</span>} hint="Today's customers' money less our costs" />}
        {locks.data && <Stat label="Locks bought this month" value={formatNumber(locks.data.totals.bought)} hint="Last 30 days, from Numbers" />}
        <Stat label="Paid accounts" value={formatNumber(accounts.paid)} hint={`${percent(accounts.paid, accounts.total)} of ${formatNumber(accounts.total)} accounts`} />
        <Stat label="Collected this month" value={formatRupees(revenue.collectedMonth)} hint={`+ ${formatRupees(revenue.gstMonth)} GST`} />
        <Stat label="Collected this year" value={formatRupees(revenue.collectedYear)} hint={`Since ${formatDate(revenue.yearStarts)}`} />
        <Stat label="Sign-ups" value={formatNumber(signups.today)} hint={`today · ${formatNumber(signups.week)} this week · ${formatNumber(signups.month)} in 30 days`} />
        <Stat label="Active businesses" value={formatNumber(businesses.active7)} hint={`billed in 7 days · ${formatNumber(businesses.active30)} in 30 · of ${formatNumber(businesses.total)}`} />
        <Stat label="Bills made" value={formatNumber(bills.today)} hint={`today · ${formatNumber(bills.month)} in 30 days (${formatRupees(bills.valueMonth)})`} />
        <Stat label="Credit owed to owners" value={formatRupees(data.creditOwed)} hint="Used first on their next payments" />
      </div>

      <div className="grid-2">
        <Card title="Sign-ups, last 30 days">
          <ColumnChart label="Sign-ups per day" points={signups.series.map((point) => ({ label: shortDay(point.day), value: point.count }))} format={formatNumber} />
          <p className="muted small">{formatNumber(signups.notSetUp)} signed in but never finished setting up a business.</p>
        </Card>
        <Card title="Money to watch">
          <ul className="watch">
            <li><button type="button" className="link-row" onClick={() => navigate({ page: 'customers', state: 'due7' })}><span>Renewals due in 7 days</span><strong>{formatNumber(accounts.renewalsDue7)}</strong></button></li>
            <li><button type="button" className="link-row" onClick={() => navigate({ page: 'customers', state: 'grace' })}><span>In grace (payment missed, under 7 days)</span><strong className={accounts.grace ? 'tone-warning' : ''}>{formatNumber(accounts.grace)}</strong></button></li>
            <li><button type="button" className="link-row" onClick={() => navigate({ page: 'customers', state: 'lapsed' })}><span>Lapsed to Free (paid plan ran out)</span><strong className={accounts.lapsed ? 'tone-critical' : ''}>{formatNumber(accounts.lapsed)}</strong></button></li>
            <li><span>Free → paid: accounts that ever paid</span><strong>{formatNumber(accounts.everPaid)} ({percent(accounts.everPaid, accounts.total)})</strong></li>
            <li><span>On Free now</span><strong>{formatNumber(accounts.free)}</strong></li>
          </ul>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="MRR by plan">
          <BarList label="MRR by plan" rows={paidPlans.map((plan) => ({ label: `${plan.name} (${plan.accounts})`, value: plan.mrr }))} format={formatRupees} />
        </Card>
        <Card title="Accounts by plan">
          <BarList label="Accounts by plan" rows={data.byPlan.map((plan) => ({ label: plan.name, value: plan.accounts }))} format={formatNumber} />
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Plan changes, last 30 days">
          <div className="stats compact">
            <Stat label="New paid" value={formatNumber(changes.newPaid)} />
            <Stat label="Upgrades" value={formatNumber(changes.upgrades)} />
            <Stat label="Downgrades" value={formatNumber(changes.downgrades)} />
            <Stat label="Churned" value={formatNumber(changes.churned)} hint="Paid → Free" />
          </div>
          <p className="muted small">Recorded once a day from {changes.since ? formatDate(changes.since) : 'today'}; earlier changes weren't kept.</p>
        </Card>
        <Card title="MRR over time">
          {data.mrrSeries.length > 1
            ? <ColumnChart label="MRR per day" points={data.mrrSeries.map((point) => ({ label: shortDay(point.day), value: point.mrr }))} format={formatRupees} />
            : <p className="muted">The chart starts filling from today: one point a day.</p>}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Top business types">
          <BarList label="Businesses by type" rows={data.businessTypes.map((row) => ({ label: row.type, value: row.count }))} format={formatNumber} />
        </Card>
        <Card title="Businesses by state">
          <BarList label="Businesses by state" rows={data.states.map((row) => ({ label: row.state, value: row.count }))} format={formatNumber} />
          <p className="muted small">From the state set for GST. The app doesn't ask for a city yet.</p>
        </Card>
      </div>
    </div>
  )
}
