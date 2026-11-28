import { ladder, planGroup, type AdminPlan } from './planForm'

// Admin › Packages (187b, board AdminPackages): words worked out from the plans list, read only.

/** "In plan" (builder box 3, read from the Plans ticks): all · <plan> and up · the plans by name · — */
export function inPlan(plans: AdminPlan[], key: string) {
  const list = ladder(plans)
  const on = list.map((plan) => plan.includes.includes(key) || plan.features.includes(key))
  if (!on.some(Boolean)) return '—'
  if (on.every(Boolean)) return 'all'
  const first = on.indexOf(true)
  if (on.slice(first).every(Boolean)) return `${list[first]!.name} and up`
  return list.filter((_, index) => on[index]).map((plan) => plan.name).join(', ')
}

/** The paid plans on sale, in ladder order: the columns of the Extras tab (Bronze to Diamond). */
export const paidPlans = (plans: AdminPlan[]) => ladder(plans).filter((plan) => planGroup(plan) !== 'free')
