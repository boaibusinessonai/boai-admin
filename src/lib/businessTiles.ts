// Admin › Business types as the sign-up's businesses (BUILD_PLAN 195-c, owner OK 2026-11-16).
// The tile decides what its kinds get free and can buy: saving writes the same lists to every kind of the tile.
// Kinds that differ today are shown; a difference the admin does not touch stays as it is.
// The businesses, their names, one lines and kinds are data (tpl_tiles via admin.business_types, NEED admin-words 2026-11-18).

/** A sign-up business as the database has it. */
export type SignUpTile = { key: string; name: string; about: string; kinds: string[] }
/** One card: a sign-up business, or one kind of a business Admin shows as several cards (signUp = that business). */
export type Tile = { key: string; name: string; kinds: readonly string[]; signUp?: SignUpTile }

/** Sign-up businesses Admin shows as one card per kind, each saved alone (195-c2, owner OK 2026-11-17). */
export const SPLIT = ['classes']

/** The cards in sign-up order; a split business becomes one card per kind, named as the kind. */
export function cardsOf(tiles: SignUpTile[], kindName: (key: string) => string): Tile[] {
  return tiles.flatMap((tile) => SPLIT.includes(tile.key)
    ? tile.kinds.map((kind) => ({ key: kind, name: kindName(kind), kinds: [kind], signUp: tile }))
    : [{ key: tile.key, name: tile.name, kinds: tile.kinds, signUp: tile }])
}

/** Kinds the database has that sit in none of the 12 (e.g. a type added here): edited one by one. */
export const LONE = 'type:'

export type Kind = { key: string; name: string; comesWith: string[]; own: string[] }
/** A key on every kind of the group, on some, or on none. */
export type Spread = 'all' | 'some' | 'none'
/** What saving does with a key: put it on every kind, take it off every kind, or leave each kind as it is. */
export type Pick = 'all' | 'none' | 'keep'
export type Draft = { free: Record<string, Pick>; buy: Record<string, Pick> }

const spread = (count: number, of: number): Spread => (count === 0 ? 'none' : count === of ? 'all' : 'some')
const startPick = (s: Spread): Pick => (s === 'some' ? 'keep' : s)

/** Kinds with the key free, and kinds that can buy it (own list, not free). */
export const freeOn = (kinds: Kind[], key: string) => kinds.filter((kind) => kind.comesWith.includes(key))
export const buyOn = (kinds: Kind[], key: string) => kinds.filter((kind) => kind.own.includes(key) && !kind.comesWith.includes(key))
export const freeSpread = (kinds: Kind[], key: string) => spread(freeOn(kinds, key).length, kinds.length)
export const buySpread = (kinds: Kind[], key: string) => spread(buyOn(kinds, key).length, kinds.length)

/** The edit page starts from what the kinds have today; a mixed key starts as 'keep'. */
export function startDraft(kinds: Kind[], keys: string[]): Draft {
  return {
    free: Object.fromEntries(keys.map((key) => [key, startPick(freeSpread(kinds, key))])),
    buy: Object.fromEntries(keys.map((key) => [key, startPick(buySpread(kinds, key))])),
  }
}

/** A tick: on everywhere → off everywhere; off or mixed → on everywhere. */
export const flip = (pick: Pick): Pick => (pick === 'all' ? 'none' : 'all')

const has = (pick: Pick | undefined, today: boolean) => (pick === 'all' ? true : pick === 'none' ? false : today)

/**
 * What each kind is saved with. keys = the keys the page ticks; any other key a kind has (e.g. an every-business
 * add-on on its own list) stays. Free wins: a key free on a kind is never on its can-buy list.
 */
export function kindLists(kind: Kind, draft: Draft, keys: string[]): { key: string; comesWith: string[]; canAdd: string[] } {
  const ticked = new Set(keys)
  const comesWith = [...kind.comesWith.filter((key) => !ticked.has(key)), ...keys.filter((key) => has(draft.free[key], kind.comesWith.includes(key)))]
  const free = new Set(comesWith)
  const canAdd = [...kind.own.filter((key) => !ticked.has(key) && !free.has(key)),
    ...keys.filter((key) => !free.has(key) && has(draft.buy[key], kind.own.includes(key) && !kind.comesWith.includes(key)))]
  return { key: kind.key, comesWith, canAdd }
}

export type KindChange = { key: string; name: string; freeOn: string[]; freeOff: string[]; buyOn: string[]; buyOff: string[] }

/** Per kind, what saving changes (only kinds that change). */
export function tileChanges(kinds: Kind[], draft: Draft, keys: string[]): { changes: KindChange[]; save: ReturnType<typeof kindLists>[] } {
  const changes: KindChange[] = []
  const save: ReturnType<typeof kindLists>[] = []
  for (const kind of kinds) {
    const next = kindLists(kind, draft, keys)
    const buyToday = kind.own.filter((key) => !kind.comesWith.includes(key))
    const change = {
      key: kind.key, name: kind.name,
      freeOn: next.comesWith.filter((key) => !kind.comesWith.includes(key)), freeOff: kind.comesWith.filter((key) => !next.comesWith.includes(key)),
      buyOn: next.canAdd.filter((key) => !buyToday.includes(key)), buyOff: buyToday.filter((key) => !next.canAdd.includes(key) && !next.comesWith.includes(key)),
    }
    if (change.freeOn.length || change.freeOff.length || change.buyOn.length || change.buyOff.length) { changes.push(change); save.push(next) }
  }
  return { changes, save }
}

/** The group behind a page address: one of the 12, or a lone kind ('type:<key>'). */
export function groupOf(id: string, names: Record<string, string>, cards: Tile[]): { key: string; name: string; kinds: string[]; signUp?: SignUpTile } | null {
  const tile = cards.find((one) => one.key === id)
  if (tile) return { key: tile.key, name: tile.name, kinds: tile.kinds.filter((kind) => kind in names), ...(tile.signUp ? { signUp: tile.signUp } : {}) }
  if (id.startsWith(LONE) && id.slice(LONE.length) in names) return { key: id.slice(LONE.length), name: names[id.slice(LONE.length)]!, kinds: [id.slice(LONE.length)] }
  return null
}

/** The kinds the database has outside the 12. */
export const loneKinds = (keys: string[], cards: Tile[]) => keys.filter((key) => !cards.some((tile) => tile.kinds.includes(key)))
