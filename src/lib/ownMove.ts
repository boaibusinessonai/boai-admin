import { isTower, moveFrom, STAGE_NAME, type Stage } from './releases'

// Own move on lower Admins (OWNMOVE, owner OK 2026-11-25, https://claude.ai/artifact/BtjhMi26yACF3b2RoJxP3V): only the PROD
// Admin moves code. A lower Admin (Build, DEV, SIT, UAT) shows its own "Send code → next", its upward key card and its First
// setup only while the PROD Admin has turned its switch on (release-own-move; admin.release_own_move_state). The page's
// rules, kept here so they are tested.

export type LowerStage = Exclude<Stage, 'prod'>
export const LOWER: LowerStage[] = ['build', 'dev', 'sit', 'uat']
/** This Admin's switch (admin.release_own_move_state). */
export type OwnState = { on: boolean; at: string | null; by: string | null; reason: string | null }
/** One lower Admin's switch as PROD reads it (release-own-move plan). */
export type OwnMove = OwnState & { stage: LowerStage; note: 'waiting' | 'not_connected' | 'unreachable' | null; message?: string }

/** The PROD card's row name: "Build Admin → DEV". */
export const rowName = (stage: LowerStage) => `${STAGE_NAME[stage]} Admin → ${STAGE_NAME[moveFrom(stage)!.to]}`

/** Does this Admin show its own move (button, upward keys, First setup)? Never on PROD; elsewhere only when switched on. */
export const ownMoveShown = (here: Stage | null, state: OwnState | null | undefined) =>
  !isTower(here) && Boolean(moveFrom(here)) && state?.on === true

/** A History row of a switch change, in words (incoming = the line on the lower stage itself). */
export function ownMoveHistoryLabel(m: { target: string; incoming?: boolean; ownMove?: boolean | null }): string {
  const word = m.ownMove ? 'on' : 'off'
  if (m.incoming) return `Own move turned ${word} from PROD Admin`
  return `Own move on ${STAGE_NAME[m.target as Stage] ?? m.target} Admin turned ${word}`
}

/** When it last changed, in words ("Never changed" when no line yet). */
export function lastChange(s: { at: string | null; by: string | null }): string {
  if (!s.at) return 'Never changed'
  return `Changed ${new Date(s.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}${s.by ? ` by ${s.by}` : ''}`
}
