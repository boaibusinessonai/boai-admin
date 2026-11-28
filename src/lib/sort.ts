// A to Z the way people read it: case does not matter, "Store 2" comes before "Store 10" (owner 2026-11-11:
// keep everything in groups and in A to Z order). Lists ordered by time or price keep their own order.
const collator = new Intl.Collator('en-IN', { sensitivity: 'base', numeric: true })

export const compareText = (a: string, b: string) => collator.compare(a, b)

/** A sorted copy; the list passed in is not changed. */
export function sortByText<T>(list: readonly T[], text: (item: T) => string): T[] {
  return [...list].sort((a, b) => compareText(text(a), text(b)))
}
