import { useEffect, useState } from 'react'

// Pages by the address after # (#/customers/<id>), so a page can be reloaded or shared between admins.

export type Route =
  | { page: 'dashboard' }
  | { page: 'customers'; state?: string; addOn?: string; addOnName?: string }
  | { page: 'customer'; id: string }
  | { page: 'leads'; id?: string }
  | { page: 'issues'; id?: string }
  | { page: 'audit' }
  | { page: 'admins' }
  | { page: 'packages' }
  | { page: 'selling' }
  | { page: 'costs' }
  | { page: 'numbers' }
  | { page: 'plans'; id?: string }
  | { page: 'types'; id?: string }
  | { page: 'site' }
  | { page: 'brand' }
  | { page: 'help' }
  | { page: 'support' }
  | { page: 'connections' }
  | { page: 'releases' }
  | { page: 'testdata' }
  | { page: 'demostores' }
  | { page: 'aitaste' }

export function parseRoute(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?')
  const [, page, id] = path.split('/')
  if (page === 'customers' && id) return { page: 'customer', id }
  if (page === 'customers') {
    const q = new URLSearchParams(query)
    return { page: 'customers', state: q.get('state') || undefined, addOn: q.get('addOn') || undefined, addOnName: q.get('addOnName') || undefined }
  }
  if (page === 'leads') return { page: 'leads', id: id || undefined }
  if (page === 'issues') return { page: 'issues', id: id || undefined }
  if (page === 'audit') return { page: 'audit' }
  if (page === 'admins') return { page: 'admins' }
  if (page === 'packages') return { page: 'packages' }
  if (page === 'selling') return { page: 'selling' }
  if (page === 'costs') return { page: 'costs' }
  if (page === 'numbers') return { page: 'numbers' }
  if (page === 'plans') return { page: 'plans', id: id ? decodeURIComponent(id) : undefined }
  if (page === 'types') return { page: 'types', id: id ? decodeURIComponent(id) : undefined }
  if (page === 'site') return { page: 'site' }
  if (page === 'brand') return { page: 'brand' }
  if (page === 'help') return { page: 'help' }
  if (page === 'support') return { page: 'support' }
  if (page === 'connections') return { page: 'connections' }
  if (page === 'releases') return { page: 'releases' }
  if (page === 'testdata') return { page: 'testdata' }
  if (page === 'demostores') return { page: 'demostores' }
  if (page === 'aitaste') return { page: 'aitaste' }
  return { page: 'dashboard' }
}

export function routeHash(route: Route) {
  if (route.page === 'customer') return `#/customers/${route.id}`
  if (route.page === 'customers' && route.addOn) return `#/customers?addOn=${encodeURIComponent(route.addOn)}${route.addOnName ? `&addOnName=${encodeURIComponent(route.addOnName)}` : ''}`
  if (route.page === 'customers' && route.state) return `#/customers?state=${encodeURIComponent(route.state)}`
  if (route.page === 'leads') return route.id ? `#/leads/${route.id}` : '#/leads'
  if (route.page === 'issues') return route.id ? `#/issues/${route.id}` : '#/issues'
  if (route.page === 'plans') return route.id ? `#/plans/${encodeURIComponent(route.id)}` : '#/plans'
  if (route.page === 'types') return route.id ? `#/types/${encodeURIComponent(route.id)}` : '#/types'
  return `#/${route.page}`
}

export const navigate = (route: Route) => { window.location.hash = routeHash(route) }

export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  useEffect(() => {
    const changed = () => { setRoute(parseRoute(window.location.hash)); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [])
  return route
}
