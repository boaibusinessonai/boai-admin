import { createClient } from '@supabase/supabase-js'
import { loginLost } from './loginLost'
import { WAITS_FOR_APP, waitsForApp } from './waitsForApp'

// Supabase for the admin portal: Google sign-in, the TOTP second step, and
// the functions in the database's `admin` schema. Each of them checks, in the
// database, that the caller is an active admin with both steps done, so
// nothing here is trusted. The sign-in lives in this tab only (sessionStorage):
// closing the tab signs out.

// V134: a released stage's Admin site gets /stage.js with that stage's own database (Admin › Releases writes it), so one
// build serves every stage; without it the address built in is used.
type StageFile = { stage?: unknown; supabaseUrl?: unknown; publishableKey?: unknown } | null | undefined
const stageFile = typeof window === 'undefined' ? null : (window as unknown as { BOAI_STAGE?: StageFile }).BOAI_STAGE
const fromStage = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
const url = fromStage(stageFile?.supabaseUrl) ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined)
const key = fromStage(stageFile?.publishableKey) ?? (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)
/** This Admin's database address and stage name (from /stage.js on a released stage, else the build's). */
export const supabaseUrl = url
export const stageName = fromStage(stageFile?.stage) ?? (import.meta.env.VITE_STAGE as string | undefined)

export const supabaseConfigured = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost', key || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storage: window.sessionStorage, storageKey: 'boai-admin-auth' },
  db: { schema: 'admin' },
})

export class AdminError extends Error {
  readonly code: string
  readonly status: number
  constructor(message: string, code: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** Codes that end the admin session in the browser too. */
export const SESSION_ENDED = 'boai-admin-session-ended'

/** Calls admin.<fn>(p); the database's own error (code in hint) comes back as AdminError. */
export async function admin<T>(fn: string, p: Record<string, unknown> = {}): Promise<T> {
  let { data, error, status } = await supabase.rpc(fn, { p })
  if (loginLost(status, error?.code)) {
    const { data: renewed } = await supabase.auth.refreshSession()
    if (renewed.session) ({ data, error, status } = await supabase.rpc(fn, { p }))
  }
  if (error) {
    if (loginLost(status, error.code)) {
      window.dispatchEvent(new CustomEvent(SESSION_ENDED, { detail: 'expired' }))
      throw new AdminError('Your admin session has ended. Please sign in again.', 'admin_session_expired', status)
    }
    if (waitsForApp(error.code, error.message)) {
      console.warn(`admin.${fn}:`, error.message)
      throw new AdminError(WAITS_FOR_APP, 'waits_for_app', status)
    }
    const code = error.hint || (status === 401 ? 'unauthenticated' : 'error')
    // "Not found." with nothing more is the gate's answer: no longer an admin.
    if (code === 'admin_session_expired' || (code === 'not_found' && error.message === 'Not found.')) {
      window.dispatchEvent(new CustomEvent(SESSION_ENDED, { detail: code }))
    }
    throw new AdminError(error.message || 'Something went wrong.', code, status)
  }
  return data as T
}

/** Wakes the Edge Function that sends alerts to the owner's phone (it only sends what the database queued). */
export function pokeAlerts() {
  if (!url || !key) return
  fetch(`${url}/functions/v1/admin-alert`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {})
}

/** Checks one connection answers (Edge Function admin-check-connection, which holds the keys) and returns it with the answer. */
export async function checkConnection<T>(id: string): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const response = await fetch(`${url}/functions/v1/admin-check-connection`, {
    method: 'POST', headers: { apikey: key ?? '', Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
  })
  const body = await response.json().catch(() => null) as { connection?: T; message?: string } | null
  if (!response.ok || !body?.connection) throw new AdminError(body?.message ?? 'The check did not run. Is admin-check-connection deployed?', 'check_failed', response.status)
  return body.connection
}

/** Removes a deleted customer's sign-in (Edge Function admin-erase-login; the database checks it was erased). */
export async function eraseLogin(authUid: string): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const response = await fetch(`${url}/functions/v1/admin-erase-login`, {
    method: 'POST', headers: { apikey: key ?? '', Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ authUid }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null
    throw new AdminError(`The account is deleted, but its sign-in was not removed: ${body?.message ?? 'please try again'}.`, 'not_removed', response.status)
  }
}

/** Replaces a key's value (Edge Function admin-replace-key): tried on everything that uses it, then written to the secret stores. */
export async function replaceKey(name: string, value: string): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const response = await fetch(`${url}/functions/v1/admin-replace-key`, {
    method: 'POST', headers: { apikey: key ?? '', Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, value }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null
    throw new AdminError(body?.message ?? 'The key was not changed. Is admin-replace-key deployed?', 'not_replaced', response.status)
  }
}

/** CONN-1: which keys this project holds (Edge Function admin-keys-status): set / missing, plain addresses only. */
export async function keysStatus(names: string[]): Promise<{ set: Record<string, boolean>; shown: Record<string, string> }> {
  const { data } = await supabase.auth.getSession()
  const response = await fetch(`${url}/functions/v1/admin-keys-status`, {
    method: 'POST', headers: { apikey: key ?? '', Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ names }),
  })
  const body = await response.json().catch(() => null) as { set?: Record<string, boolean>; shown?: Record<string, string>; message?: string } | null
  if (!response.ok || !body?.set) throw new AdminError(body?.message ?? 'The keys could not be read. Is admin-keys-status deployed?', 'keys_failed', response.status)
  return { set: body.set, shown: body.shown ?? {} }
}

/** CONN-1: deletes a listed key's secret from this project (admin-replace-key with remove); the list line goes with delete_key. */
export async function removeKey(name: string): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const response = await fetch(`${url}/functions/v1/admin-replace-key`, {
    method: 'POST', headers: { apikey: key ?? '', Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, remove: true }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null
    throw new AdminError(body?.message ?? 'The key was not removed.', 'not_removed', response.status)
  }
}

/** Runs a release Edge Function on this project as the signed-in owner admin: release-sql (V89/V90), release-repo and
 *  release-site (V91); plan or one apply round. */
/** DATA-1/2: release-data also takes kind (up|down), start, pick, cancel and from (this stage's name, for the other Admin's History). */
/** SYNCSET: release-settings (PROD Admin) takes from, parts and mode undo. */
export async function releaseCall<T>(fn: 'release-sql' | 'release-repo' | 'release-site' | 'release-functions' | 'release-data' | 'release-settings' | 'release-phone' | 'release-own-move', body: { target: string; mode: 'plan' | 'apply' | 'clean' | 'rollback' | 'undo'; parts?: string[]; reason?: string; state?: unknown; sql?: string; app?: 'admin'; part?: 'backup'; version?: string; kind?: 'up' | 'down'; start?: boolean; pick?: { businesses?: string[]; sample?: number }; cancel?: boolean; from?: string; only?: string[]; on?: boolean }): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const response = await fetch(`${url}/functions/v1/${fn}`, {
    method: 'POST', headers: { apikey: key ?? '', Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const answer = await response.json().catch(() => null) as (T & { error?: string; message?: string }) | null
  if (!response.ok || !answer) throw new AdminError(answer?.message ?? `${fn} did not answer. Is it deployed on this project?`, answer?.error ?? 'release_failed', response.status)
  return answer
}

/** release-sql (V89/V90): plan or one apply round. */
export const releaseSql = <T>(body: { target: string; mode: 'plan' | 'apply'; reason?: string }) => releaseCall<T>('release-sql', body)

/** Admin › Test data (owner 2026-11-24): one step of admin-test-data on a stage (types, list, facts, make, fill, remove). */
export async function testData<T>(body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const response = await fetch(`${url}/functions/v1/admin-test-data`, {
    method: 'POST', headers: { apikey: key ?? '', Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const answer = await response.json().catch(() => null) as (T & { error?: string; message?: string }) | null
  if (!response.ok || !answer) throw new AdminError(answer?.message ?? 'Test data did not answer. Is admin-test-data deployed on this project?', answer?.error ?? 'testdata_failed', response.status)
  return answer
}

/** ITEM-PHOTO: a ready item's picture through the Edge Function `photos` (ready_add / ready_remove): the database checks the
 * admin and keeps the reason; the files go to the public bucket item-photos under ready-list/. */
export async function readyPictureCall(body: Record<string, unknown>): Promise<{ picture?: string; url?: string; ok?: boolean }> {
  const { data } = await supabase.auth.getSession()
  let response: Response
  try {
    response = await fetch(`${url}/functions/v1/photos`, {
      method: 'POST', headers: { apikey: key ?? '', Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
  } catch {
    throw new AdminError('Could not reach the photos function. Check the internet and try again.', 'network_error', 0)
  }
  const answer = await response.json().catch(() => null) as { picture?: string; url?: string; ok?: boolean; error?: string; message?: string } | null
  if (!response.ok) throw new AdminError(answer?.message ?? 'The picture was not saved. Try again.', answer?.error ?? 'error', response.status)
  return answer ?? {}
}
