import { moveLabel, STAGE_NAME, type Stage } from './releases'

// Releases › Sync settings (SYNCSET, owner OK 2026-11-25): the page's rules, kept here so they are tested.

export const SYNC_STAGES: Stage[] = ['build', 'dev', 'sit', 'uat', 'prod']
export const SYNC_PARTS = [
  ['plans', 'Plans + Selling page'], ['types', 'Business types'], ['ready', 'Ready lists'], ['ai', 'AI prices + Help words'],
  ['taste', 'AI free taste'], ['site', 'Public website'], ['brand', 'App name & logo'],
] as const
export type SyncPart = typeof SYNC_PARTS[number][0]

/** From and To are never the same stage: picking the To stage as From moves To to the first other stage. */
export function pickStages(from: Stage, to: Stage): { from: Stage; to: Stage } {
  return { from, to: from === to ? SYNC_STAGES.find((s) => s !== from)! : to }
}

/** The ticked parts, always in the page's order. */
export function tickPart(list: SyncPart[], key: SyncPart, on: boolean): SyncPart[] {
  return SYNC_PARTS.map(([k]) => k).filter((k) => (k === key ? on : list.includes(k)))
}

/** The typed stage name confirms the copy (any letter case, spaces around ignored). */
export const confirmed = (typed: string, to: Stage) => typed.trim().toUpperCase() === STAGE_NAME[to].toUpperCase()

/** A History row of a settings copy, in words. */
export function syncHistoryLabel(m: { target: string; from?: string | null; incoming?: boolean }): string {
  if (m.incoming) return `Settings in from ${m.target}`
  if (m.from === m.target) return 'Settings put back (Undo)'
  return `Settings ${moveLabel(m.target, m.from)}`
}
