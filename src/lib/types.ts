import type { LeadStatus } from './format'

// The shapes the admin functions return (apps/api/sql/30_admin.sql).

export type AdminRole = 'owner' | 'finance' | 'support'
export type Me = { status: 'ok'; email: string; role: AdminRole; sessionEndsAt: string; idleMinutes: number }
export type WhoAmI = Me | { status: 'signed_out' | 'not_admin' | 'expired' }

export type AccountLine = { plan: string | null; planName?: string; chosenPlan?: string; state: string; billing?: string; paidUntil?: string | null; monthly?: number }

export type Dashboard = {
  asOf: string
  today: string
  signups: { today: number; week: number; month: number; notSetUp: number; series: { day: string; count: number }[] }
  businesses: { total: number; active7: number; active30: number; stores: number }
  accounts: { total: number; paid: number; free: number; grace: number; lapsed: number; everPaid: number; renewalsDue7: number }
  revenue: { mrr: number; collectedMonth: number; gstMonth: number; collectedYear: number; yearStarts: string }
  byPlan: { code: string; name: string; accounts: number; mrr: number }[]
  changes: { since: string | null; upgrades: number; downgrades: number; newPaid: number; churned: number }
  mrrSeries: { day: string; mrr: number; paid: number }[]
  creditOwed: number
  bills: { today: number; week: number; month: number; total: number; valueMonth: number }
  businessTypes: { type: string; count: number }[]
  states: { state: string; count: number }[]
}

export type CustomerRow = {
  id: string; name: string; email: string | null; phone: string | null; createdAt: string; onboarded: boolean; credit: number
  account: AccountLine; businesses: string[]; lastBill: string | null
}

export type Store = {
  id: string; name: string; code: string; address: string | null; active: boolean; createdAt: string; bills30: number
  /** V139: the last nightly count of this store's database space; null = not counted yet. */
  space?: StoreSpace | null
}
export type SpacePart = { table: string; rows: number; bytes: number }
export type StoreSpace = { bytes: number; files: number; parts: SpacePart[]; measuredAt: string }
export type Business = {
  id: string; name: string; industry: string | null; phone: string | null; address: string | null; gstin: string | null; state: string | null
  createdAt: string; deletedAt: string | null; packs: string[]; extraApps?: string[]; stores: Store[]
  people: { name: string; role: string; active: boolean; locked: boolean; failures: number; stores: number; createdAt: string }[]
  staff: number
  usage: { bills: number; bills30: number; sales30: number; items: number; customers: number; lastBill: string | null }
}
export type Payment = { id: string; title: string; amount: number; gst: number; creditUsed: number; status: string; createdAt: string; paidAt: string | null; orderId: string | null; paymentId: string | null }
export type Note = { id: string; body: string; by: string; createdAt: string }
export type AuditEntry = {
  id: number; at: string; adminEmail: string; adminRole: string | null; action: string; targetType: string | null; targetId: string | null
  reason: string | null; before: unknown; after: unknown; ip: string | null; userAgent: string | null; hash: string
}
export type Lead = {
  id: string; name: string; phone: string; email: string | null; business: string | null; businessType: string | null; city: string | null; branches: number | null
  message: string | null; source: string; createdAt: string; updatedAt: string | null; status: LeadStatus; followUpOn: string | null
  kind: 'refund' | 'talk'; linked: boolean; match: { id: string; name: string; email: string | null } | null; notes: number
}

export type Customer360 = {
  profile: {
    id: string; name: string; email: string | null; phone: string | null; credit: number; hasPassword: boolean; hasPin: boolean; pinLocked: boolean; pinFailures: number
    createdAt: string; onboardedAt: string | null; deleted: boolean; lastSignIn: string | null; lastPinSession: string | null; lastBill: string | null
  }
  account: AccountLine
  businesses: Business[]
  payments: Payment[]
  paidTotal: number
  notes: Note[]
  leads: Lead[]
  planHistory: { plan: string; planName: string; paid: boolean; monthly: number; at: string }[]
  adminHistory: AuditEntry[]
}

export type SearchResult = {
  owners: { id: string; name: string; email: string | null; phone: string | null }[]
  businesses: { id: string; name: string; industry: string | null; ownerId: string; deleted: boolean }[]
  leads: { id: string; name: string; phone: string; status: string }[]
  payments: { id: string; title: string; amount: number; status: string; ownerId: string }[]
}

export type AdminPerson = {
  id: string; email: string; role: AdminRole; active: boolean; status: 'active' | 'invited' | 'removed'; createdAt: string; updatedAt: string | null
  lastSeenAt: string | null; addedBy: string | null; lastSession: { startedAt: string; ip: string | null; device: string | null } | null
}
