// Import data for a customer: the web app's column guess (templates/columns.ts) and suggested fixes
// (templates/fixes.ts), copied here because the admin site is its own repo. Keep the two in step when
// either changes. SQL checks every row again whatever the sheet says.
type ItemKind = 'raw' | 'product' | 'service'

/** The fields api.import_start takes (app.import_fields), per page. */
export const IMPORT_FIELDS = ['name', 'category', 'unit', 'price', 'mrp', 'cost', 'hsn', 'barcode', 'brand', 'stock', 'reorder', 'uses', 'made', 'recipe', 'phone', 'email', 'address', 'gstin', 'balance'] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]
export type PartyKind = 'customers' | 'suppliers'
export type ImportKind = ItemKind | PartyKind
export const FIELDS_FOR: Record<ImportKind, readonly ImportField[]> = {
  customers: ['name', 'phone', 'email', 'address', 'gstin', 'balance'],
  suppliers: ['name', 'phone', 'address', 'gstin', 'balance'],
  raw: ['name', 'category', 'unit', 'cost', 'hsn', 'brand', 'barcode', 'stock', 'reorder', 'uses'],
  product: ['name', 'category', 'unit', 'price', 'mrp', 'cost', 'hsn', 'barcode', 'brand', 'stock', 'made'],
  service: ['name', 'category', 'price', 'hsn', 'recipe'],
}

// Headings people use (English and Hinglish, in Latin letters).
const HEADINGS: Record<ImportField, string[]> = {
  name: ['name', 'item', 'item name', 'product', 'product name', 'material', 'service', 'particulars', 'description', 'naam'],
  category: ['category', 'folder', 'group', 'department', 'section', 'type'],
  unit: ['unit', 'uom', 'units', 'measure'],
  price: ['price', 'selling price', 'sale price', 'rate', 'sp', 'selling rate', 'daam', 'keemat'],
  mrp: ['mrp', 'max retail price'],
  cost: ['cost', 'cost price', 'purchase price', 'buying price', 'cp', 'purchase rate', 'landing cost'],
  hsn: ['hsn', 'hsn code', 'sac', 'hsn/sac', 'hsn sac'],
  barcode: ['barcode', 'bar code', 'ean', 'code'],
  brand: ['brand', 'company', 'make', 'manufacturer'],
  stock: ['stock', 'opening stock', 'qty', 'quantity', 'stock qty', 'balance', 'in stock', 'current stock'],
  reorder: ['reorder', 'reorder level', 'min stock', 'minimum', 'alert at', 'alert below'],
  uses: ['uses', 'use', 'used for'],
  made: ['made', 'made here', 'make'],
  recipe: ['recipe', 'what goes in', 'ingredients', 'materials'],
  phone: ['phone', 'mobile', 'mobile no', 'mobile number', 'phone number', 'contact', 'contact no', 'whatsapp', 'cell', 'mob'],
  email: ['email', 'e mail', 'email id', 'mail'],
  address: ['address', 'addr', 'city', 'area', 'location', 'pata'],
  gstin: ['gstin', 'gst', 'gst no', 'gst number', 'gstin no'],
  balance: ['balance', 'opening balance', 'closing balance', 'due', 'dues', 'due amount', 'amount due', 'outstanding', 'amount', 'udhaar', 'udhar', 'baki', 'baaki', 'pending', 'to receive', 'to pay'],
}
/** More headings for the name column in a sheet of people (not for items: a Supplier column there isn't the item's name). */
export const NAME_HEADINGS: Record<PartyKind, string[]> = {
  customers: ['customer', 'customer name', 'client', 'buyer', 'party', 'party name', 'ledger', 'ledger name'],
  suppliers: ['supplier', 'supplier name', 'vendor', 'vendor name', 'party', 'party name', 'firm', 'ledger', 'ledger name'],
}

const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9/% ]/g, ' ').replace(/\s+/g, ' ').trim()
function score(cell: string, field: ImportField, names: string[]): number {
  const text = clean(cell)
  if (!text) return 0
  const words = field === 'name' ? [...HEADINGS.name, ...names] : HEADINGS[field]
  if (words.includes(text)) return 3
  if (words.some((word) => word.length > 2 && (text.startsWith(`${word} `) || text.endsWith(` ${word}`)))) return 2
  if (words.some((word) => word.length > 3 && text.includes(word))) return 1
  return 0
}

export type ColumnGuess = { headerRow: number; columns: Partial<Record<ImportField, number>> }

/** The row that looks most like headings (within the first 8), then each field's best column; strongest matches first. */
export function guessColumns(rows: string[][], fields: readonly ImportField[], names: string[] = []): ColumnGuess {
  let headerRow = 0
  let best = -1
  rows.slice(0, 8).forEach((row, index) => {
    const total = fields.reduce((sum, field) => sum + Math.max(0, ...row.map((cell) => score(cell, field, names))), 0)
    if (total > best) { best = total; headerRow = index }
  })
  const header = rows[headerRow] ?? []
  const columns: Partial<Record<ImportField, number>> = {}
  const used = new Set<number>()
  const candidates = fields.flatMap((field) => header.map((cell, column) => ({ field, column, value: score(cell, field, names) }))).filter((entry) => entry.value > 0).sort((a, b) => b.value - a.value)
  for (const entry of candidates) {
    if (columns[entry.field] !== undefined || used.has(entry.column)) continue
    columns[entry.field] = entry.column
    used.add(entry.column)
  }
  return { headerRow, columns }
}

/** A sheet as text cells (what the xlsx reader gives, any type). */
export const textRows = (rows: unknown[][]): string[][] => rows.map((row) => Array.from(row, (cell) => (cell === null || cell === undefined ? '' : String(cell).trim().slice(0, 300))))

export type Chunk = { rows: string[][]; sheetRows: number[] }
/**
 * The rows under the headings, empty ones left out, in chunks of ≤ `size`, each row with its
 * sheet number (1 = the sheet's first row).
 */
export function chunksOf(rows: string[][], headerRow: number, size = 200): Chunk[] {
  const kept: { cells: string[]; at: number }[] = []
  rows.forEach((cells, index) => { if (index > headerRow && cells.some((cell) => cell !== '')) kept.push({ cells, at: index + 1 }) })
  const chunks: Chunk[] = []
  for (let i = 0; i < kept.length; i += size) {
    const part = kept.slice(i, i + size)
    chunks.push({ rows: part.map((row) => row.cells), sheetRows: part.map((row) => row.at) })
  }
  return chunks
}

/** A row error from api.import_rows (row = 1 + its place in the chunk sent) with the sheet's row number. */
export const sheetRowOf = (chunk: Chunk, row: number) => chunk.sheetRows[row - 1] ?? row

/** The columns api.import_start takes: only fields with a column. */
export const columnsBody = (columns: Partial<Record<ImportField, number>>) =>
  Object.fromEntries(Object.entries(columns).filter(([, column]) => typeof column === 'number' && column >= 0)) as Record<string, number>

export type FixWhy = 'spaces' | 'number' | 'drcr' | 'phone' | 'gstin' | 'email' | 'unit' | 'hsn' | 'yesno' | 'ai'
/** `note`: the AI's own few words on an AI fix. */
export type Fix = { value: string; why: FixWhy; note?: string }

const NUMBERS: ImportField[] = ['price', 'mrp', 'cost', 'stock', 'reorder', 'balance']
const TEXTS: ImportField[] = ['name', 'category', 'brand', 'address', 'uses', 'recipe']

/** Units people write, to the unit the app knows. */
const UNITS: Record<string, string> = {
  kgs: 'kg', kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg', 'kg.': 'kg',
  gms: 'g', gm: 'g', gram: 'g', grams: 'g', grm: 'g', gr: 'g',
  ltr: 'l', ltrs: 'l', lt: 'l', lit: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l', 'ltr.': 'l',
  mls: 'ml', millilitre: 'ml', milliliter: 'ml',
  pc: 'piece', pcs: 'piece', 'pcs.': 'piece', pieces: 'piece', nos: 'piece', 'nos.': 'piece', no: 'piece', number: 'piece', numbers: 'piece', each: 'piece', ea: 'piece', unit: 'piece', units: 'piece',
  mtr: 'm', mtrs: 'm', meter: 'm', meters: 'm', metre: 'm', metres: 'm',
  dzn: 'dozen', doz: 'dozen', dozens: 'dozen',
  pkt: 'pack', pkts: 'pack', packet: 'pack', packets: 'pack', packs: 'pack',
  boxes: 'box', bottles: 'bottle', btl: 'bottle', bags: 'bag', ft: 'ft', feet: 'ft',
}
const YES = ['y', 'yes', 'haan', 'ha', 'han', 'true', '1', 'made']
const NO = ['n', 'no', 'nahi', 'nahin', 'false', '0']

/**
 * A number from what people type: ₹, Rs, INR, commas, spaces and "/-" dropped; (1,200) is minus;
 * a trailing unit ("25 kg") dropped. A balance with Dr or Cr: for customers Dr is what they owe
 * (plus) and Cr minus; for suppliers the other way round. null when it still isn't a number.
 */
export function readNumber(value: string, field: ImportField, kind: ImportKind): { value: string; drcr: boolean } | null {
  let text = value.trim().toLowerCase()
  let sign = 1
  let drcr = false
  const side = text.match(/\s*\b(dr|cr)\.?$/)
  if (side && field === 'balance') {
    drcr = true
    text = text.slice(0, side.index).trim()
    sign = (side[1] === 'dr') === (kind !== 'suppliers') ? 1 : -1
  }
  if (/^\(.*\)$/.test(text)) { sign = -sign; text = text.slice(1, -1) }
  text = text.replace(/^(rs\.?|inr|₹)\s*/, '').replace(/\/-$/, '').replace(/[₹,\s]/g, '')
  if (field === 'stock' || field === 'reorder') text = text.replace(/[a-z.]+$/, '')
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null
  const number = Number(text) * sign
  return { value: String(Number.isInteger(number) ? number : Number(number.toFixed(4))), drcr }
}

/** An Indian mobile number in 10 digits (+91, 91 or 0 in front dropped; the first of two numbers), or null. */
export function readPhone(value: string): string | null {
  const first = value.split(/[,/;]|\bor\b/)[0] ?? ''
  let digits = first.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return /^[6-9]\d{9}$/.test(digits) ? digits : null
}

/** The fix the app suggests for one cell, or null when it looks right (or can't be fixed by tidying). */
export function suggestFix(field: ImportField, value: string, kind: ImportKind): Fix | null {
  const original = value
  if (!original.trim()) return null
  const change = (next: string, why: FixWhy): Fix | null => (next !== original ? { value: next, why } : null)
  if (NUMBERS.includes(field)) {
    const read = readNumber(original, field, kind)
    return read ? change(read.value, read.drcr ? 'drcr' : 'number') : null
  }
  if (field === 'phone') {
    const phone = readPhone(original)
    return phone ? change(phone, 'phone') : null
  }
  if (field === 'gstin') {
    const gstin = original.toUpperCase().replace(/[\s-]/g, '')
    return /^\d{2}[A-Z0-9]{13}$/.test(gstin) ? change(gstin, 'gstin') : null
  }
  if (field === 'email') {
    const email = original.trim().replace(/^mailto:/i, '').toLowerCase()
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? change(email, 'email') : null
  }
  if (field === 'unit') {
    const unit = original.trim().toLowerCase()
    return change(UNITS[unit] ?? unit, UNITS[unit] ? 'unit' : 'spaces')
  }
  if (field === 'hsn' || field === 'barcode') {
    const digits = original.replace(/\s/g, '')
    return field === 'hsn' && /^\d[\d.\s]*$/.test(original.trim()) ? change(original.replace(/\D/g, ''), 'hsn') : change(digits, 'spaces')
  }
  if (field === 'made') {
    const word = original.trim().toLowerCase()
    return YES.includes(word) ? change('yes', 'yesno') : NO.includes(word) ? change('no', 'yesno') : null
  }
  if (TEXTS.includes(field)) return change(original.replace(/\s+/g, ' ').trim(), 'spaces')
  return null
}

/**
 * Rows the sheet has twice: for each later row, the first row it repeats (by place in `rows`).
 * People: the same mobile number, or the same name when neither has one. Items: the same name.
 */
export function repeatedRows(rows: string[][], columns: Partial<Record<ImportField, number>>, kind: ImportKind): Map<number, number> {
  const seen = new Map<string, number>()
  const repeats = new Map<number, number>()
  const cell = (row: string[], field: ImportField) => (columns[field] === undefined ? '' : (row[columns[field]!] ?? '').trim())
  rows.forEach((row, index) => {
    const name = cell(row, 'name').replace(/\s+/g, ' ').toLowerCase()
    if (!name) return
    const phone = kind === 'customers' ? readPhone(cell(row, 'phone')) : null
    const key = phone ? `phone:${phone}` : `name:${name}`
    const first = seen.get(key)
    if (first !== undefined) repeats.set(index, first)
    else seen.set(key, index)
  })
  return repeats
}
