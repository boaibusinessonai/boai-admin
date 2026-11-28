// Admin › Connections (CONN-1, owner OK v11 2026-11-23 https://claude.ai/artifact/CC9GQaZjXBHoCrWXrZYKkk): every key sits next to
// the thing it opens, read from this project's secrets (admin-keys-status): set / missing / due. "This Admin" = its own parts;
// "Send code → <next>" = every key that move reads (the names the release functions use, see supabase/functions/release-*).
import { STAGE_NAME, type Stage, type Target } from './releases'

/** One key: its setting name (as the release functions read it, without CONN_), what it is, and whether Add / Replace can write it. */
export type KeyRow = { name: string; label: string; secret: boolean; rotateDays: number; canAdd: boolean }
export type PartRow = { part: string; keys: KeyRow[] }
export type DueKey = { name: string; status?: 'ok' | 'soon' | 'overdue'; dueOn?: string }
export type RowState = { tone: 'good' | 'warning' | 'critical'; text: string }

const key = (name: string, label: string, secret: boolean): KeyRow =>
  ({ name, label, secret, rotateDays: secret ? 90 : 365, canAdd: name.startsWith('RELEASE_') })

/** The keys "Send code → to" reads on this project (release-sql, -repo, -site, -functions). */
export function nextParts(to: Target): PartRow[] {
  const s = to.toUpperCase()
  const n = STAGE_NAME[to]
  return [
    { part: `${n} database`, keys: [key(`RELEASE_DB_URL_${s}`, 'Database password address', true)] },
    { part: `${n} code repo`, keys: [key(`RELEASE_REPO_${s}`, 'Repo (owner/name)', false), key(`RELEASE_GITHUB_TOKEN_${s}`, 'GitHub write token', true)] },
    { part: `${n} Admin repo`, keys: [key(`RELEASE_ADMIN_REPO_${s}`, 'Repo (owner/name)', false), key(`RELEASE_ADMIN_GITHUB_TOKEN_${s}`, 'GitHub write token', true)] },
    { part: `${n} app functions`, keys: [key(`RELEASE_SUPABASE_URL_${s}`, 'Project link', false), key(`RELEASE_SUPABASE_TOKEN_${s}`, 'Supabase access token', true)] },
    { part: `${n} website`, keys: [key(`RELEASE_SITE_${s}`, 'Firebase site', false), key(`RELEASE_PUBLISHABLE_KEY_${s}`, 'Publishable key', true), key(`RELEASE_FIREBASE_KEY_${s}`, 'Firebase key', true)] },
    { part: `${n} Admin website`, keys: [key(`RELEASE_ADMIN_SITE_${s}`, 'Firebase site', false)] },
  ]
}

/** This Admin's own parts: the code it sends (only when it has a next layer) and the stage's own keys (status only:
 *  the app reads them by their plain name, so they are changed in Supabase › Edge Functions › Secrets). */
export function ownParts(sends: boolean): PartRow[] {
  const code: PartRow[] = sends ? [
    { part: 'App code it sends', keys: [key('RELEASE_SOURCE_REPO', 'Repo (owner/name@branch:folder)', false), key('RELEASE_SOURCE_TOKEN', 'GitHub read token', true)] },
    { part: 'AI code it sends', keys: [key('RELEASE_AI_SOURCE_REPO', 'Repo (owner/name@branch:folder)', false), key('RELEASE_AI_SOURCE_TOKEN', 'GitHub read token', true)] },
    { part: 'Admin code it sends', keys: [key('RELEASE_ADMIN_SOURCE_REPO', 'Repo (owner/name)', false), key('RELEASE_ADMIN_SOURCE_TOKEN', 'GitHub read token', true)] },
    { part: 'Websites it sends', keys: [key('RELEASE_SOURCE_SITE', 'Website address', false), key('RELEASE_SOURCE_ADMIN_SITE', 'Admin website address', false)] },
  ] : []
  return [
    ...code,
    { part: 'AI (OpenAI)', keys: [key('OPENAI_API_KEY', 'OpenAI key', true)] },
    { part: 'Payments (Razorpay)', keys: [key('RAZORPAY_KEY_ID', 'Key id', true), key('RAZORPAY_KEY_SECRET', 'Key secret', true)] },
    { part: 'Alerts (Telegram)', keys: [key('TELEGRAM_BOT_TOKEN', 'Bot token', true), key('TELEGRAM_CHAT_ID', 'Chat id', true)] },
  ]
}

/** TOWER-1 (owner 2026-11-24): PROD holds one key set per stage (supabase/functions/_shared/release.ts). A stage that is a
 *  source gives its code repo (AI code = its ai-service folder), Admin repo, database, project link and both sites; a target
 *  also needs its Supabase token, publishable key and Firebase key. PROD's own database and project link are its own. */
export function towerParts(stage: Stage): PartRow[] {
  const s = stage.toUpperCase()
  const source = stage === 'build'
  const parts: PartRow[] = [
    ...(stage === 'prod' ? [] : [{ part: 'Database', keys: [key(`RELEASE_DB_URL_${s}`, 'Database password address', true)] }]),
    { part: 'Code repo (app + AI)', keys: [key(`RELEASE_REPO_${s}`, 'Repo (owner/name@branch:folder)', false), key(`RELEASE_GITHUB_TOKEN_${s}`, source ? 'GitHub read token' : 'GitHub write token', true)] },
    { part: 'Admin repo', keys: [key(`RELEASE_ADMIN_REPO_${s}`, 'Repo (owner/name)', false), key(`RELEASE_ADMIN_GITHUB_TOKEN_${s}`, source ? 'GitHub read token' : 'GitHub write token', true)] },
    { part: 'Project', keys: [...(stage === 'prod' ? [] : [key(`RELEASE_SUPABASE_URL_${s}`, 'Project link', false)]), ...(source ? [] : [key(`RELEASE_SUPABASE_TOKEN_${s}`, 'Supabase access token', true)])] },
    { part: 'Website', keys: [key(`RELEASE_SITE_${s}`, 'Firebase site', false), ...(source ? [] : [key(`RELEASE_PUBLISHABLE_KEY_${s}`, 'Publishable key', true), key(`RELEASE_FIREBASE_KEY_${s}`, 'Firebase key', true)])] },
    { part: 'Admin website', keys: [key(`RELEASE_ADMIN_SITE_${s}`, 'Firebase site', false)] },
  ]
  return parts.filter((part) => part.keys.length > 0)
}

export const allNames = (parts: PartRow[]) => parts.flatMap((p) => p.keys.map((k) => k.name))

/** The key-list entry (due date) for a setting: CONN_<name>; a …_DEV one also the old …_SIT name (BOAI Build, CHAIN-1). */
export function dueOf(keys: DueKey[], name: string): DueKey | undefined {
  const find = (n: string) => keys.find((k) => k.name === `CONN_${n}`)
  return find(name) ?? (name.endsWith('_DEV') ? find(`${name.slice(0, -4)}_SIT`) : undefined)
}

/** set / missing / due, in words. */
export function rowState(set: boolean | undefined, due: DueKey | undefined): RowState {
  if (!set) return { tone: 'critical', text: 'missing' }
  if (due?.status === 'overdue') return { tone: 'critical', text: 'change now' }
  if (due?.status === 'soon') return { tone: 'warning', text: `due ${due.dueOn ?? 'soon'}` }
  return { tone: 'good', text: due?.dueOn ? `set · due ${due.dueOn}` : 'set' }
}

/** A part is ready when every key it needs is set. */
export const partReady = (part: PartRow, set: Record<string, boolean>) => part.keys.every((k) => set[k.name])

/** A Supabase project ref from a pasted link (https://<ref>.supabase.co or …/dashboard/project/<ref>) or the ref itself. */
export function refOf(link: string): string | null {
  const t = link.trim()
  return t.match(/^([a-z0-9]{20})$/)?.[1] ?? t.match(/https:\/\/([a-z0-9]{20})\.supabase\.co/)?.[1] ?? t.match(/\/project\/([a-z0-9]{20})/)?.[1] ?? null
}

/** The secret name a connected database's key is saved under. */
export const otherDbKey = (name: string) => `CONN_DB_${name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'OTHER'}`
