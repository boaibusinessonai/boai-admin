// Admin › Releases › First setup (V121, owner OK 2026-11-20 on the preview https://claude.ai/artifact/Y8vZm87SN8gFsCG5wd8ByP).
// A numbered step list per stage, done in order: SIT, then UAT, then PROD. Ticks are saved in the database
// (admin.release_step / admin.release_setup, audit lines), so every computer shows where the owner stopped.
// Step kinds: 'you' = clicks only the owner can do (Done button); 'run' = the system does it on a button;
// 'check' = turns green only when the system finds it. A run/check whose automation is not built yet shows Coming soon
// and can be marked done by hand, so the list still guides the owner today.

import { moveFrom, type Part, type Stage } from './releases'

/** The stages that get a First setup (CHAIN-1: BOAI DEV was set up by hand from Build, so not listed). */
export type SetupStage = 'sit' | 'uat' | 'prod'

export type StepKind = 'you' | 'run' | 'check'
/** Built automations: 'sql' / 'repo' / 'site' = that part of the move (release-sql / release-repo / release-site apply, same as
 *  Regular updates); 'reach' / 'repo-reach' / 'site-reach' = that function's plan reaches the stage (database, repo, website);
 *  'admin' (V134) = release-site publishes this stage's tested Admin build on the stage's own Admin site;
 *  'functions' (V133) = release-functions deploys the app's and the AI service's Edge Functions to the stage;
 *  'clean' (V132) = SIT's Clean start: release-sql's plan lists an old app's leftovers; none = green at once, else the exact SQL to run. */
export type StepAction = 'sql' | 'reach' | 'repo' | 'repo-reach' | 'site' | 'site-reach' | 'clean' | 'functions' | 'admin'
/** The move part a run step does, and the function a check step asks. */
export const ACTION_PART: Record<StepAction, Part> = { sql: 'sql', reach: 'sql', repo: 'repo', 'repo-reach': 'repo', site: 'site', 'site-reach': 'site', clean: 'sql', functions: 'functions', admin: 'admin' }
export const isCheck = (action: StepAction | undefined) => action === 'reach' || action === 'repo-reach' || action === 'site-reach'
export type Step = { key: string; group: string; kind: StepKind; title: string; words: string; action?: StepAction }
export type Tick = { stage: SetupStage; step: string; done: boolean; at: string; by: string }

export const SETUP_STAGES: SetupStage[] = ['sit', 'uat', 'prod']

/** CONN-1 (owner OK v11): an Admin shows only its next layer's First setup (DEV → SIT, SIT → UAT, UAT → PROD); Build (DEV was
 *  set up by hand) and PROD have none. */
export function setupFor(here: Stage | null): SetupStage | null {
  const next = moveFrom(here)?.to
  return next && (SETUP_STAGES as string[]).includes(next) ? next as SetupStage : null
}

/** Which Admin runs a stage's setup buttons: the stage before it, like its moves (SIT from Dev, UAT from SIT, PROD from UAT; V135).
 *  PROD's keys are secrets of the UAT project's release functions: on Supabase's servers, never on a computer. */
export const RUNS_FROM: Record<SetupStage, Stage> = { sit: 'dev', uat: 'sit', prod: 'uat' }
/** Built automations per stage (V135: PROD too, with its backup, website put back on failure and the phone code). */
const ACTION_READY: Record<SetupStage, boolean> = { sit: true, uat: true, prod: true }

const DB: Record<SetupStage, string> = { sit: 'the BOAI SIT project (the new Supabase account on the BOAI login)', uat: 'the BOAI UAT project', prod: 'the BOAI PROD project' }
const NAME: Record<SetupStage, string> = { sit: 'SIT', uat: 'UAT', prod: 'PROD' }

export function setupSteps(stage: SetupStage): Step[] {
  const S = NAME[stage]
  const prod = stage === 'prod'
  const steps: (Step | null)[] = [
    { key: 'db-ready', group: 'Database', kind: 'you', title: `${S} database ready`,
      words: `Use ${DB[stage]}.${prod ? ' Move it to the Pro plan with point-in-time backup before real customers.' : ''}` },
    { key: 'db-password', group: 'Database', kind: 'check', action: 'reach', title: `${S} database password saved`,
      words: `Paste it in Supabase as the secret RELEASE_DB_URL_${S}. Check now turns green only when this Admin can reach that database.` },
    stage === 'sit' ? { key: 'clean-start', group: 'Database', kind: 'run', action: 'clean', title: 'Clean start',
      words: 'Check now looks for an old app\'s tables in this project. A new, empty project has none: the step turns green by itself. If some are found, it shows the exact SQL that removes them: copy it, or run it here with a reason.' } : null,
    { key: 'install-sql', group: 'Database', kind: 'run', action: 'sql', title: 'Install all SQL',
      words: 'All migrations in number order, then the functions. Shows the list first, ticks each one live, stops and says why on any error.' },
    { key: 'db-settings', group: 'Database', kind: 'you', title: `${S} database settings`,
      words: `Turn on the api and admin schemas, Google + email sign-in, site address, authenticator (MFA).${prod ? ' Confirm email ON, leaked-password check ON, own email sender.' : ''}` },
    { key: 'repo-token', group: 'Code and website', kind: 'check', action: 'repo-reach', title: `${S} repo + write token saved`,
      words: `Make the ${S} repo in the BOAI GitHub and a token that can write only to it. In Connections › Keys fill: ${S} repo, Token to write the ${S} repo, This stage's code repo, Token to read this stage's code. Check now turns green when both repos answer.` },
    { key: 'copy-code', group: 'Code and website', kind: 'run', action: 'repo', title: `Copy code to the ${S} repo`,
      words: 'The tested version, code only (no agent notes, no tests), into its main-app folder. Shows what changes first.' },
    { key: 'site-key', group: 'Code and website', kind: 'check', action: 'site-reach', title: `${S} website + Firebase key saved`,
      words: `Site in the BOAI Firebase project. In Connections › Keys fill: ${S} website, Firebase key for the ${S} website, ${S} database address for the website, ${S} publishable key, This stage's website address.` },
    { key: 'publish-site', group: 'Code and website', kind: 'run', action: 'site', title: `Publish the ${S} website`,
      words: 'Copies the tested website (no new build) and writes its database address into it: the site reads it when it opens, so the same build works on every stage.' },
    { key: 'app-functions', group: 'App functions and keys', kind: 'run', action: 'functions', title: 'Deploy app functions',
      words: `Every app function in the tested code (whatsapp, razorpay, contact, delete-account, admin-alert, photos, the release functions…) and the AI functions, to ${S}. In Connections › Keys fill: Supabase access token for ${S}, This stage's AI service repo and its token.` },
    { key: 'keys', group: 'App functions and keys', kind: 'you', title: `${S} keys (${prod ? 'live keys' : 'test keys'})`,
      words: `Type them in the ${S} project's own secret store (Supabase › Edge Functions › Secrets). Keys are never shown or saved on this page.` },
    { key: 'publish-admin', group: 'Admin deployment', kind: 'run', action: 'admin', title: `Publish the ${S} Admin`,
      words: `Copies the tested Admin website to the ${S} Admin site, connected only to the ${S} database (the Admin SQL came with Install all SQL). In Connections › Keys fill: This stage's Admin website address, ${S} Admin website.` },
    { key: 'admin-signin', group: 'Admin deployment', kind: 'you', title: `Your ${S} Admin sign-in`, words: 'Google sign-in + authenticator code for your owner account.' },
    { key: 'open-check', group: 'Final check', kind: 'check', title: `Open ${S} signed in`,
      words: `Sign up, make a business, a bill, a payment${prod ? ', plan payment, WhatsApp test, Admin sign-in with code' : ', Admin sign-in'}.${stage === 'sit' ? ' After this, the SIT Admin takes over for UAT and PROD.' : ''}` },
  ]
  return steps.filter((step): step is Step => step !== null)
}

/** The latest tick per step of one stage, by step key. */
export function ticksOf(ticks: Tick[], stage: SetupStage): Map<string, Tick> {
  return new Map(ticks.filter((tick) => tick.stage === stage && tick.done).map((tick) => [tick.step, tick]))
}

/** Index of the first step not done (= the one open now); steps after it wait. -1 = all done. */
export function openIndex(steps: Step[], done: Map<string, Tick>): number {
  return steps.findIndex((step) => !done.has(step.key))
}

/** Can this step's button run here? Built automation only, only from the Admin that runs the stage. */
export function canRun(step: Step, stage: SetupStage, here: Stage | null): boolean {
  return Boolean(step.action) && ACTION_READY[stage] && here === RUNS_FROM[stage]
}

/** Why a run/check step has no working button here (null = it can run). */
export function runNote(step: Step, stage: SetupStage, here: Stage | null): string | null {
  if (step.kind === 'you') return null
  if (!step.action || !ACTION_READY[stage]) return 'Coming soon. Do it by hand, then mark it done.'
  if (here !== RUNS_FROM[stage]) return `Runs from the ${RUNS_FROM[stage] === 'dev' ? 'Dev' : NAME[RUNS_FROM[stage] as SetupStage]} Admin.`
  return null
}
