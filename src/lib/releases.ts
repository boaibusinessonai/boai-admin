// Admin › Releases (V90, PROD S3): code moves one way, one stage at a time: Build → DEV → SIT → UAT → PROD (CHAIN-1: Build is its own layer).
// A move runs from the Admin of its source stage (release-sql lives on that project and copies from its own database).
// Steps per move: 1 Database (release-sql), 2 Code to the repo (release-repo) and 3 Website (release-site), V91.

export type Stage = 'build' | 'dev' | 'sit' | 'uat' | 'prod'
export type Target = Exclude<Stage, 'build'>
export type Move = { from: Stage; to: Target; label: string }

export const STAGE_NAME: Record<Stage, string> = { build: 'Build', dev: 'DEV', sit: 'SIT', uat: 'UAT', prod: 'PROD' }
export const MOVES: Move[] = [
  { from: 'build', to: 'dev', label: 'Build → DEV' },
  { from: 'dev', to: 'sit', label: 'DEV → SIT' },
  { from: 'sit', to: 'uat', label: 'SIT → UAT' },
  { from: 'uat', to: 'prod', label: 'UAT → PROD' },
]

/** Supabase projects we know: BOAI Build (dgvm…), BOAI DEV (sdvu…), SIT (hqjm…). A stage that a move reached knows itself
 * from the /stage.js the move wrote (stage name = the move's target); UAT/PROD the same way. */
const PROJECTS: Record<string, Stage> = { dgvmkoxyigdenddhtvov: 'build', sdvuedqkujocxgeaovjk: 'dev', hqjmukqngavtdxfjmnpd: 'sit', pjgpydgrkzuujnserjei: 'uat', jeirdoiuucykhezlbzdt: 'prod' }

/** The one move this Admin runs (CHAIN-1: each layer sends code only to the next one); none on PROD or an unknown stage. */
export const moveFrom = (here: Stage | null): Move | null => MOVES.find((one) => one.from === here) ?? null

// ── Control tower (TOWER-1, owner 2026-11-24) ──────────────────────────────────
// The PROD Admin runs every move with a chosen From (all keys in PROD's secrets; lower layers hold no keys upward).
// Lower Admins keep their own one move. A tower move sends {from} with every release call.
export const isTower = (here: Stage | null) => here === 'prod'
/** The body a move adds to every release call: {from} only for a tower move. */
export const fromBody = (move: Move, tower: boolean): { from?: Stage } => (tower ? { from: move.from } : {})
/** One run Build → … → stop (each hop in order); stop = the last stage it reaches. */
export const runTo = (stop: Target): Move[] => MOVES.slice(0, MOVES.findIndex((one) => one.to === stop) + 1)
/** History: a move's name from where it went and (tower) where from. */
export const moveLabel = (target: string, from?: string | null) =>
  (from ? `${STAGE_NAME[from as Stage] ?? from} → ${STAGE_NAME[target as Stage] ?? target}` : MOVES.find((one) => one.to === target)?.label ?? target)

// TOWER-3 (owner 2026-11-24): switches for what a tower move sends; what is off stays as it is in the next stage.
export type Code = 'app' | 'admin' | 'mobile'
export const CODES: { key: Code; label: string; words: string }[] = [
  { key: 'app', label: 'App', words: 'customer website, app code + AI code, app functions, app database changes' },
  { key: 'admin', label: 'Admin', words: 'Admin website, Admin code, Admin functions + move functions, Admin database functions' },
  { key: 'mobile', label: 'Mobile', words: "mobile app code + the phones' live quiet update (waits there for Send to phones)" },
]
/** The steps a move with these switches runs. */
export function codeParts(on: Code[]): Part[] {
  const app = on.includes('app'); const admin = on.includes('admin')
  return PARTS.filter((part) => (part === 'sql' || part === 'functions' ? app || admin : part === 'repo' ? on.length > 0 : part === 'site' ? app : part === 'phone' ? on.includes('mobile') : admin))
}

/** Which stage this Admin runs on: VITE_STAGE first, else the Supabase address; unknown = null (no move can run). */
export function stageOf(url: string | undefined, named: string | undefined): Stage | null {
  const n = named?.trim().toLowerCase()
  if (n === 'build' || n === 'dev' || n === 'sit' || n === 'uat' || n === 'prod') return n
  const ref = url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
  return (ref && PROJECTS[ref]) || null
}

export type PlanAnswer = {
  target: Target; upToDate: boolean; words: string[]; migrations: string[]
  sourceMissing: { migrations: number; units: number; parts: number }
  functions: { fresh: boolean; added: number | unknown[]; changed: unknown[]; removed: unknown[]; recreated: unknown[]; blocked: unknown[] }
}
export type ApplyAnswer = { applied: string[]; functions: 'none' | 'applied' | 'waiting'; done: boolean; left: number }

/** A plan can run only when the source keeps all its SQL and no function type change needs a full rebuild. */
export function planBlock(plan: PlanAnswer): string | null {
  const m = plan.sourceMissing
  if (m.migrations || m.units || m.parts) return 'This database does not keep all its SQL yet (run bun run migrate on it first).'
  if (plan.functions.blocked.length) return 'A type changed: the target needs a full rebuild, which this page does not do.'
  if (plan.upToDate) return 'Nothing to move: the target is already the same.'
  return null
}

/** PROD needs the word PROD typed as well as a reason, and (V135, S10) a code sent to the owner's phone: 6 digits. */
/** TOWER-5 (owner 2026-11-24): the phone code is asked only while its switch is on (off until go-live). */
export const confirmOk = (to: Target, typed: string, code = '', needCode = true) => to !== 'prod' || (typed.trim() === 'PROD' && (!needCode || /^\d{6}$/.test(code.replace(/\s/g, ''))))

/** One more apply round adds its migrations to the ones done so far. */
export function addRound(done: string[], round: ApplyAnswer): string[] {
  return [...done, ...round.applied.filter((name) => !done.includes(name))]
}

// ── Code and website (V91) ──────────────────────────────────────────────
export type Part = 'backup' | 'sql' | 'repo' | 'site' | 'functions' | 'admin' | 'phone'
export const PARTS: Part[] = ['sql', 'repo', 'site', 'functions', 'admin', 'phone']
/** 'admin' (V134) = release-site with {app: 'admin'}: the stage's own Admin website. 'backup' (V135) = release-sql {part: 'backup'}. */
export const PART_FN = { backup: 'release-sql', sql: 'release-sql', repo: 'release-repo', site: 'release-site', functions: 'release-functions', admin: 'release-site', phone: 'release-phone' } as const
/** What a part adds to its function's body. */
export const partBody = (part: Part): { app?: 'admin'; part?: 'backup' } => (part === 'admin' ? { app: 'admin' } : part === 'backup' ? { part: 'backup' } : {})

/** V135 (PROD S10): every PROD move that touches the database backs PROD's data up first. */
export const moveParts = (to: Target, parts: Part[]): Part[] => (to === 'prod' && parts.includes('sql') ? ['backup', ...parts] : parts)
/** BROKEN-44: the phone app update step runs only in a control tower move (release-phone copies between two stages). */
export const moveSteps = (parts: Part[], tower: boolean): Part[] => (tower ? parts : parts.filter((part) => part !== 'phone'))
/** The website parts a failed PROD move puts back (those it already published), newest first. */
export const putBack = (to: Target, published: Part[]): Part[] => (to === 'prod' ? published.filter((part) => part === 'site' || part === 'admin').reverse() : [])
export type BackupPlan = { tables: number; bytes: number; dbBytes: number; backups: string[]; words: string[] }
export type BackupRound = { done: boolean; state: unknown; schema: string; copied: number; total: number; removed: string[] }

export type RepoPlan = { source: { sha: string; message: string; date: string | null }; target: string; files: number; added: number; changed: number; removed: number; send: number; upToDate: boolean; words: string[] }
export type RepoRound = { done: boolean; state: unknown; sent: number; left: number; wait?: number; commit?: string; short?: string }
/** release (V135) = the Firebase version the stage's site serves now: put back if a later PROD step fails. */
export type SitePlan = { commit: string | null; files: number; live: string | null; release?: string | null; words: string[] }
export type SiteRound = { done: boolean; state: unknown; uploaded: number; files: number; commit?: string | null }

/** App functions (V133): what release-functions would deploy, and one deploy round. */
export type FunctionsPlan = { functions: { name: string; from: 'app' | 'ai'; there: boolean }[]; aiSkipped: string | null; upToDate: boolean; words: string[] }
export type FunctionsRound = { done: boolean; state: unknown; deployed: string[]; left: number }

/** BROKEN-44: the From stage's live quiet phone update and the number it gets on the next stage (release-phone). */
export type PhonePlan = { upToDate: boolean; from: { version: string; note: string | null }; version: string | null; files: number; words: string[] }
export type PhoneRound = { done: boolean; state: unknown; sent: number; files: number; version: string }

/** A part whose keys are not in Connections › Keys yet is skipped (said on its step), not an error for the move. */
export const notConnected = (code: string | undefined) => code === 'target_not_set_up' || code === 'source_not_set_up'

/** Nothing for this part to do: the stage already has it. */
export function partSame(part: Part, plan: PlanAnswer | RepoPlan | SitePlan | FunctionsPlan | BackupPlan | PhonePlan): boolean {
  if (part === 'backup') return false
  if (part === 'phone') return (plan as PhonePlan).upToDate
  if (part === 'sql') return (plan as PlanAnswer).upToDate
  if (part === 'functions') return (plan as FunctionsPlan).upToDate
  if (part === 'repo') return (plan as RepoPlan).upToDate
  const site = plan as SitePlan
  return Boolean(site.commit && site.live && site.commit.startsWith(site.live))
}

/** The code version a part moved, short (for History). */
export const shortOf = (sha: string | null | undefined) => (sha ? sha.slice(0, 7) : undefined)
