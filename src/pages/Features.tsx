import { Fragment, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Card, ErrorBox, Loading } from '../components/ui'
import { formatRupees } from '../lib/format'
import { admin } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'
import { featureName, groupFeatures } from '../lib/featureGroups'
import { sortByText } from '../lib/sort'
import type { Business } from '../lib/types'

// Features are chosen and charged per store: pick a business, pick a store, switch with a reason.
// Off hides the feature; its data stays and returns when it is switched on again.

type Feature = {
  key: string; name: string; group: string; monthlyPaise?: number; on: boolean; source?: string
  grant?: { id: string; source: 'admin_on' | 'admin_off'; reason?: string }; offAbove?: boolean; openWork?: number
}
type Pending = { title: string; danger?: boolean; body: string; run: (reason: string) => Promise<unknown> }

const WHY_OFF: Record<string, string> = {
  admin_off: 'Off by BOAI', store_off: 'The owner switched it off for this store', package_off: 'Not chosen for this store',
  admin_only: 'Only BOAI switches this on', plan: 'Not in the plan', default: 'Off by default',
}

export function Features({ businesses }: { businesses: Business[] }) {
  const [businessId, setBusinessId] = useState(businesses[0]?.id ?? '')
  const business = businesses.find((b) => b.id === businessId)
  const stores = business?.stores.filter((s) => s.active) ?? []
  const [picked, setPicked] = useState('')
  const storeId = stores.some((s) => s.id === picked) ? picked : stores[0]?.id ?? ''
  const { data, error, reload } = useLoad(() => (storeId ? admin<{ features: Feature[] }>('store_features', { storeId }) : Promise.resolve({ features: [] as Feature[] })), storeId || 'none')
  const [pending, setPending] = useState<Pending | null>(null)
  const storeName = stores.find((s) => s.id === storeId)?.name ?? ''
  const on = (key: string) => data?.features.find((feature) => feature.key === key)?.on ?? false

  if (!businesses.length) return <p className="muted">No business yet.</p>

  function switchIt(feature: Feature) {
    const on = !feature.on
    const work = !on && feature.openWork ? `This store has ${feature.openWork} ${openWorkWords(feature.key, feature.openWork)} using it. They will not be able to finish them until it is back on. ` : ''
    setPending({
      title: `Switch ${feature.name} ${on ? 'on' : 'off'} for ${storeName}?`, danger: !on,
      body: on ? 'Only this store gets it. Other stores stay as they are.' : `${work}Its data stays and comes back when it is switched on again. Other stores stay as they are.`,
      run: (reason) => admin('set_store_feature', { storeId, key: feature.key, on, reason }),
    })
  }
  function removeSwitch(feature: Feature) {
    setPending({
      title: `Remove our switch on ${feature.name}?`, body: 'The store goes back to what its plan and its owner\'s choices give.',
      run: (reason) => admin('end_entitlement', { grantId: feature.grant!.id, reason }),
    })
  }

  return (
    <Card title="Features for one store">
      <div className="plan-form">
        <label className="field"><span>Business</span>
          <select value={businessId} onChange={(event) => { setBusinessId(event.target.value); setPicked('') }}>
            {sortByText(businesses, (b) => b.name).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Store</span>
          <select value={storeId} onChange={(event) => setPicked(event.target.value)}>
            {sortByText(stores, (s) => s.name).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!storeId && <p className="muted">This business has no open store.</p>}
      {storeId && !data && !error && <Loading />}
      {data && storeId && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Feature</th><th>Price</th><th>Now</th><th></th></tr></thead>
            <tbody>
              {groupFeatures(data.features).map((group) => (<Fragment key={`${group.section}${group.title}`}>
                <tr className="group-row"><th colSpan={4}>{group.title || group.section}</th></tr>
                {group.rows.map((feature, index) => { const waits = feature.needs && !on(feature.needs); const kidsBelow = group.rows[index + 1]?.depth === 1; return (<tr key={feature.key} className={feature.depth ? 'feature-child' : kidsBelow ? 'feature-head' : undefined}>
                  <td>{feature.depth ? feature.name : <strong>{feature.name}</strong>}
                    {feature.needs && <span className={`sub${waits ? ' needs' : ''}`}>Needs {featureName(data.features, feature.needs)} on{waits ? ': off for this store, so this does nothing yet' : ''}</span>}</td>
                  <td>{feature.monthlyPaise ? `${formatRupees(feature.monthlyPaise / 100)}/month` : '—'}</td>
                  <td>
                    <Badge tone={feature.on ? 'good' : 'neutral'}>{feature.on ? 'On' : 'Off'}</Badge>
                    {feature.grant && <span className="sub">Our switch: {feature.grant.source === 'admin_on' ? 'on' : 'off'}{feature.grant.reason ? ` · ${feature.grant.reason}` : ''}</span>}
                    {!feature.on && !feature.grant && feature.source && WHY_OFF[feature.source] && <span className="sub">{WHY_OFF[feature.source]}</span>}
                    {feature.offAbove && <span className="sub">Off for the whole business or account, so this store can't have it</span>}
                  </td>
                  <td className="contact">
                    <button type="button" className="button small" disabled={feature.offAbove} onClick={() => switchIt(feature)}>Switch {feature.on ? 'off' : 'on'}</button>
                    {feature.grant && <button type="button" className="button small" onClick={() => removeSwitch(feature)}>Remove our switch</button>}
                  </td>
                </tr>) })}
              </Fragment>))}
            </tbody>
          </table>
        </div>
      )}
      {pending && <ConfirmDialog title={pending.title} danger={pending.danger} action="Confirm" onDone={async (reason) => { await pending.run(reason); reload() }} onClose={() => setPending(null)}><p>{pending.body}</p></ConfirmDialog>}
    </Card>
  )
}

/** What the open work is, in words, for the switch-off warning. */
function openWorkWords(key: string, n: number): string {
  const many = n !== 1
  if (key === 'memberships') return many ? 'members with a running membership' : 'member with a running membership'
  if (key === 'delivery') return many ? 'deliveries not yet done' : 'delivery not yet done'
  if (key === 'ordersForLater') return many ? 'orders for later not yet handed over' : 'order for later not yet handed over'
  return many ? 'open orders or guests' : 'open order or guest'
}
