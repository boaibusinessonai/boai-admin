// Admin › Business types › one business › Ready list (V21, ctl-6): the items a new business of this kind is offered
// to tick at setup and on Add items. Edited on the newest live list; businesses keep what they already took.

export type Folder = { key: string; kind: 'raw' | 'product' | 'service'; name: string; made?: boolean; onOrder?: boolean }
export type ReadyItem = { id: string; kind: Folder['kind']; categoryKey: string; name: string; unit: string; hsn?: string; common: boolean; /** ITEM-PHOTO: its picture (path in item-photos) and tile. */ picture?: string; tile?: string }
export type ReadyList = { template: { key: string; version: number; names: { en: string } }; folders: Folder[]; units: string[]; items: ReadyItem[] }
export type ItemDraft = { id?: string; folder: string; name: string; unit: string; hsn: string; common: boolean }

const PAGE: Record<Folder['kind'], string> = { raw: 'Goods', product: 'Products', service: 'Services' }

/** "Products · Dishes (made on order)" */
export function folderLabel(folder: Folder) {
  const how = folder.onOrder ? ' (made on order)' : folder.made ? ' (made here)' : ''
  return `${PAGE[folder.kind]} · ${folder.name}${how}`
}

/** A folder's id in a picker: kind and key (the same key can sit on two pages). */
export const folderId = (folder: Pick<Folder, 'kind' | 'key'>) => `${folder.kind}:${folder.key}`

/** Items of one folder: shown first, then the list's order. */
export const itemsIn = (list: ReadyList, id: string) => list.items.filter((item) => folderId({ kind: item.kind, key: item.categoryKey }) === id)

/** What stops Save, or null. The database checks the same. */
export function draftProblem(draft: ItemDraft, list: ReadyList): string | null {
  const name = draft.name.trim()
  if (!name) return 'Write the item’s name.'
  if (name.length > 160) return 'Up to 160 letters.'
  if (!list.units.includes(draft.unit)) return 'Pick a unit.'
  if (draft.hsn.trim() && !/^[0-9]{4,8}$/.test(draft.hsn.trim())) return 'HSN / SAC is 4 to 8 digits.'
  const [kind] = draft.folder.split(':')
  if (list.items.some((item) => item.id !== draft.id && item.kind === kind && item.name.toLowerCase() === name.toLowerCase())) return 'This list already has an item with this name.'
  return null
}

/** The admin call's body for a draft. */
export function draftBody(draft: ItemDraft, template: string) {
  const [kind, categoryKey] = draft.folder.split(':')
  return { template, ...(draft.id ? { id: draft.id } : {}), kind, categoryKey, name: draft.name.trim(), unit: draft.unit, ...(draft.hsn.trim() ? { hsn: draft.hsn.trim() } : {}), common: draft.common }
}
