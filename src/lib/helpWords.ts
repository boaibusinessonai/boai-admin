import { HELP_WORDS } from './helpWords.data'

// Admin › Help words (V21, ctl-5): the guide's built-in words by chapter, Admin's own words beside them.
// Own words may use only the {parts} the built-in words use (the app fills those; any other would show as typed).

export type HelpRow = { key: string; builtIn: string }
export type Chapter = { key: string; title: string; rows: HelpRow[] }

const BUILT_IN = new Map(HELP_WORDS)

/** Chapters in the guide's order; keys with no chapter ('help.download') go under "The Help page". */
export function chapters(words: [string, string][] = HELP_WORDS): Chapter[] {
  const out = new Map<string, Chapter>()
  for (const [key, builtIn] of words) {
    const parts = key.split('.')
    const chapter = parts.length > 2 ? parts[1]! : ''
    if (!out.has(chapter)) out.set(chapter, { key: chapter, title: chapter ? (BUILT_IN.get(`help.${chapter}.title`) ?? chapter) : 'The Help page', rows: [] })
    out.get(chapter)!.rows.push({ key, builtIn })
  }
  return [...out.values()]
}

const partsOf = (text: string) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))

/** What is wrong with own words for a key, or null. Missing parts are allowed (said as a warning by `missingParts`). */
export function ownWordsProblem(key: string, own: string): string | null {
  const text = own.trim()
  if (!text) return null
  if (text.length > 2000) return 'Up to 2,000 letters.'
  const allowed = partsOf(BUILT_IN.get(key) ?? '')
  const unknown = [...partsOf(text)].filter((part) => !allowed.has(part))
  if (unknown.length) return `The app can't fill ${unknown.map((p) => `{${p}}`).join(', ')}${allowed.size ? `; use ${[...allowed].map((p) => `{${p}}`).join(', ')}` : ''}.`
  return null
}

/** The {parts} of the built-in words that the own words leave out. */
export const missingParts = (key: string, own: string) => [...partsOf(BUILT_IN.get(key) ?? '')].filter((part) => !partsOf(own).has(part))

/** Rows whose key or words (built-in or own) have the search words. */
export function matches(row: HelpRow, own: string | undefined, q: string) {
  const words = q.trim().toLowerCase()
  return !words || row.key.toLowerCase().includes(words) || row.builtIn.toLowerCase().includes(words) || Boolean(own?.toLowerCase().includes(words))
}

/** Saved own words for keys the app no longer has: shown so they can be cleared. */
export const goneKeys = (saved: Record<string, string>) => Object.keys(saved).filter((key) => !BUILT_IN.has(key)).sort()

/** The changes to send: edited keys whose words differ from what is saved ('' = back to the built-in). */
export function changesToSend(edits: Record<string, string>, saved: Record<string, string>) {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(edits)) {
    const text = value.trim()
    const next = text === (BUILT_IN.get(key) ?? '').trim() ? '' : text
    if (next !== (saved[key] ?? '')) out[key] = next
  }
  return out
}
