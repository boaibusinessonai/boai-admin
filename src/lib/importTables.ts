// Import data for a customer, Tables to fill (185i-ADMIN, owner 2026-11-14): the same list as the app's Add many items
// (business-growth-portal templates/tables.ts, tradeTables.ts), copied here because the admin site is its own repo. Keep
// the two in step. A table shows when its page shows in that store's menu for the owner (feature on, page not hidden by
// the setup, the business kind, More prices); display only, SQL checks every row. Order = fill order (what other rows
// point at first). The trade tables' field keys are SQL's (app.import_trade_fields); their headings are the app's.
import { FIELDS_FOR, guessColumns, NAME_HEADINGS, type ImportField, type ImportKind } from './importSheet'

export type TradeKind = 'staff' | 'assets' | 'projects' | 'siteworkers' | 'diningtables' | 'rooms' | 'batches' | 'students' | 'consultfiles' | 'chairs' | 'membershipplans' | 'routes' | 'pricelists'
export type TableKind = ImportKind | TradeKind
export type TradeField = { key: string; label: string; need?: boolean; choices?: readonly string[]; headings: readonly string[] }
/** What admin.import_tables sends for a store. */
export type StoreFacts = { features: string[]; hidePages: string[]; kinds: string[]; morePrices: boolean; counts: Partial<Record<TableKind, number>> }
type Gate = { feature?: string; hide?: readonly string[]; kinds?: readonly string[]; morePrices?: true }

export const TABLES: readonly { kind: TableKind; label: string; gate: Gate }[] = [
  { kind: 'customers', label: 'Customers', gate: {} },
  { kind: 'suppliers', label: 'Suppliers', gate: { feature: 'purchases' } },
  { kind: 'raw', label: 'Inventory (items bought)', gate: { hide: ['raw', 'inventory'] } },
  { kind: 'product', label: 'Products', gate: { hide: ['product'] } },
  { kind: 'service', label: 'Services', gate: { hide: ['service'] } },
  { kind: 'projects', label: 'Projects', gate: { feature: 'projects' } },
  { kind: 'siteworkers', label: 'Site workers', gate: { feature: 'projects' } },
  { kind: 'staff', label: 'Staff', gate: { feature: 'staffPay' } },
  { kind: 'assets', label: 'Assets', gate: { feature: 'assets', hide: ['assets'] } },
  { kind: 'diningtables', label: 'Dining tables', gate: { feature: 'restaurant', hide: ['tables'] } },
  { kind: 'rooms', label: 'Rooms', gate: { feature: 'hotel', hide: ['rooms'] } },
  { kind: 'batches', label: 'Batches', gate: { feature: 'coaching', hide: ['classes'] } },
  { kind: 'students', label: 'Students', gate: { feature: 'coaching', hide: ['classes'] } },
  { kind: 'consultfiles', label: 'Patients', gate: { feature: 'clinic', hide: ['consults'] } },
  { kind: 'chairs', label: 'Chairs', gate: { feature: 'appointments', hide: ['appointments'], kinds: ['salon', 'spa_gym'] } },
  { kind: 'membershipplans', label: 'Membership plans', gate: { feature: 'memberships' } },
  { kind: 'routes', label: 'Routes', gate: { feature: 'distribution' } },
  { kind: 'pricelists', label: 'Price lists', gate: { morePrices: true } },
]

const passes = (facts: StoreFacts, gate: Gate) =>
  (!gate.feature || facts.features.includes(gate.feature)) && !(gate.hide ?? []).some((page) => facts.hidePages.includes(page))
  && (!gate.kinds || gate.kinds.some((kind) => facts.kinds.includes(kind))) && (!gate.morePrices || facts.morePrices)

/** This store's tables, in fill order, with how many rows each has now. */
export const tablesToFill = (facts: StoreFacts) =>
  TABLES.filter((table) => passes(facts, table.gate)).map((table) => ({ ...table, n: facts.counts[table.kind] ?? 0 }))

export const isTrade = (kind: TableKind): kind is TradeKind => !(kind in FIELDS_FOR)

/** The trade tables' columns (first = needed in every row, except where marked). */
export const TRADE_FIELDS: Record<TradeKind, readonly TradeField[]> = {
  staff: [
    { key: 'name', label: 'Name', need: true, headings: ['name', 'naam', 'staff', 'staff name', 'employee', 'employee name', 'worker'] },
    { key: 'phone', label: 'Mobile number', headings: ['phone', 'mobile', 'mobile no', 'mobile number', 'phone number', 'contact', 'contact no', 'whatsapp', 'mob'] },
    { key: 'roleTitle', label: 'Role', headings: ['role', 'job', 'post', 'designation', 'work', 'kaam'] },
    { key: 'payType', label: 'Pay type', choices: ['daily', 'monthly', 'class', 'none'], headings: ['pay type', 'pay', 'paid', 'wage type', 'salary type'] },
    { key: 'payRate', label: 'Daily wage or salary', headings: ['rate', 'pay rate', 'salary', 'wage', 'daily wage', 'monthly salary', 'amount', 'tankha'] },
    { key: 'commissionPercent', label: 'Commission %', headings: ['commission', 'commission %', 'commission percent'] },
    { key: 'hourlyRate', label: 'Hourly rate', headings: ['hourly', 'hourly rate', 'overtime', 'ot rate', 'per hour'] },
    { key: 'joinedOn', label: 'Joined on', headings: ['joined', 'joined on', 'joining date', 'date of joining', 'doj', 'start date'] },
  ],
  assets: [
    { key: 'name', label: 'Name', need: true, headings: ['name', 'naam', 'asset', 'asset name', 'item', 'equipment', 'machine', 'saman'] },
    { key: 'category', label: 'Category', need: true, headings: ['category', 'group', 'type', 'kind of asset'] },
    { key: 'kind', label: 'Kept as', choices: ['equipment', 'pooled'], headings: ['kept as', 'kind', 'how kept'] },
    { key: 'count', label: 'How many', headings: ['qty', 'quantity', 'count', 'how many', 'nos', 'pieces'] },
    { key: 'unit', label: 'Unit', headings: ['unit', 'uom'] },
    { key: 'cost', label: 'Cost', headings: ['cost', 'price', 'bought for', 'purchase price', 'value', 'amount'] },
    { key: 'purchasedOn', label: 'Bought on', headings: ['bought on', 'purchase date', 'purchased on', 'date of purchase', 'bought'] },
    { key: 'warrantyUntil', label: 'Warranty till', headings: ['warranty', 'warranty till', 'warranty until', 'warranty up to'] },
    { key: 'brand', label: 'Brand', headings: ['brand', 'company', 'make'] },
    { key: 'model', label: 'Model', headings: ['model', 'model no'] },
    { key: 'code', label: 'Code', headings: ['code', 'asset code', 'tag', 'serial', 'serial no'] },
    { key: 'supplier', label: 'Bought from', headings: ['supplier', 'bought from', 'vendor', 'dealer'] },
    { key: 'notes', label: 'Notes', headings: ['notes', 'note', 'remarks'] },
  ],
  projects: [
    { key: 'name', label: 'Project', need: true, headings: ['name', 'naam', 'project', 'project name', 'site', 'work', 'job'] },
    { key: 'client', label: 'Client', need: true, headings: ['client', 'customer', 'party', 'owner', 'client name'] },
    { key: 'siteAddress', label: 'Site address', headings: ['site address', 'address', 'location', 'site'] },
    { key: 'contract', label: 'Contract \u20b9', headings: ['contract', 'contract value', 'contract amount', 'value', 'amount', 'order value'] },
    { key: 'retentionPct', label: 'Retention %', headings: ['retention', 'retention %', 'retention percent'] },
    { key: 'materialEst', label: 'Material estimate \u20b9', headings: ['material', 'material estimate', 'material cost', 'material budget'] },
    { key: 'startOn', label: 'Starts on', headings: ['start', 'start date', 'starts', 'started on', 'from'] },
    { key: 'endOn', label: 'Ends on', headings: ['end', 'end date', 'finish', 'due date', 'to', 'handover'] },
    { key: 'notes', label: 'Notes', headings: ['notes', 'note', 'remarks'] },
  ],
  siteworkers: [
    { key: 'name', label: 'Name', need: true, headings: ['name', 'naam', 'worker', 'worker name', 'labour', 'mazdoor'] },
    { key: 'skill', label: 'Skill', headings: ['skill', 'work', 'trade', 'kaam', 'role'] },
    { key: 'phone', label: 'Mobile number', headings: ['phone', 'mobile', 'mobile no', 'mobile number', 'phone number', 'contact', 'contact no', 'whatsapp', 'mob'] },
    { key: 'payType', label: 'Pay type', choices: ['daily', 'contract'], headings: ['pay type', 'pay', 'paid'] },
    { key: 'dailyWage', label: 'Daily wage', headings: ['wage', 'daily wage', 'rate', 'per day', 'dihadi', 'mazdoori'] },
  ],
  diningtables: [
    { key: 'name', label: 'Table', need: true, headings: ['name', 'naam', 'table', 'table name', 'table no', 'table number'] },
    { key: 'area', label: 'Area', headings: ['area', 'section', 'floor', 'room', 'zone'] },
    { key: 'seats', label: 'Seats', headings: ['seats', 'chairs', 'covers', 'people', 'capacity'] },
  ],
  rooms: [
    { key: 'name', label: 'Room number', need: true, headings: ['name', 'naam', 'room', 'room no', 'room number'] },
    { key: 'type', label: 'Room type', need: true, headings: ['type', 'room type', 'category', 'kind'] },
    { key: 'rate', label: 'Rate a night \u20b9', need: true, headings: ['rate', 'tariff', 'price', 'rent', 'per night', 'room rate'] },
    { key: 'floor', label: 'Floor', headings: ['floor', 'level', 'wing'] },
    { key: 'beds', label: 'Beds', headings: ['beds', 'bed', 'no of beds'] },
    { key: 'maxGuests', label: 'Guests', headings: ['guests', 'max guests', 'people', 'occupancy', 'pax'] },
    { key: 'ac', label: 'AC', headings: ['ac', 'a/c', 'air conditioned'] },
    { key: 'tv', label: 'TV', headings: ['tv', 't v', 'television'] },
  ],
  batches: [
    { key: 'name', label: 'Batch', need: true, headings: ['name', 'naam', 'batch', 'batch name', 'class', 'course'] },
    { key: 'subject', label: 'Subject', headings: ['subject', 'topic'] },
    { key: 'days', label: 'Days', headings: ['days', 'day', 'runs on', 'weekdays'] },
    { key: 'startsAt', label: 'Starts at', headings: ['starts', 'start', 'start time', 'from', 'time'] },
    { key: 'endsAt', label: 'Ends at', headings: ['ends', 'end', 'end time', 'to', 'till'] },
    { key: 'feePeriod', label: 'Fee per', choices: ['month', 'course', 'class'], headings: ['fee type', 'fee period', 'fee per', 'fees per'] },
    { key: 'fee', label: 'Fee \u20b9', headings: ['fee', 'fees', 'amount'] },
    { key: 'gstRate', label: 'GST %', headings: ['gst', 'gst %', 'gst rate', 'tax'] },
    { key: 'capacity', label: 'Seats', headings: ['capacity', 'seats', 'limit', 'max students'] },
    { key: 'teacher', label: 'Teacher', headings: ['teacher', 'faculty', 'sir', 'madam', 'tutor'] },
    { key: 'room', label: 'Classroom', headings: ['room', 'classroom', 'hall'] },
  ],
  students: [
    { key: 'name', label: 'Student', need: true, headings: ['name', 'naam', 'student', 'student name', 'child', 'child name'] },
    { key: 'grade', label: 'Class', headings: ['grade', 'class', 'std', 'standard'] },
    { key: 'school', label: 'School', headings: ['school', 'college'] },
    { key: 'phone', label: 'Student mobile', headings: ['student phone', 'student mobile', 'phone', 'mobile'] },
    { key: 'payer', label: 'Who pays', need: true, headings: ['payer', 'parent', 'father', 'mother', 'guardian', 'parent name', 'who pays'] },
    { key: 'payerPhone', label: 'Payer mobile', headings: ['parent phone', 'parent mobile', 'payer phone', 'father phone', 'guardian phone'] },
  ],
  consultfiles: [
    { key: 'name', label: 'Patient', need: true, headings: ['name', 'naam', 'patient', 'patient name'] },
    { key: 'consent', label: 'Consent', need: true, headings: ['consent', 'agreed', 'consent given', 'permission'] },
    { key: 'phone', label: 'Mobile number', headings: ['phone', 'mobile', 'mobile no', 'mobile number', 'phone number', 'contact', 'contact no', 'whatsapp', 'mob'] },
    { key: 'relation', label: 'Relation', choices: ['self', 'child', 'spouse', 'parent', 'other'], headings: ['relation', 'relation to payer'] },
    { key: 'ageYears', label: 'Age', headings: ['age', 'age years', 'umar'] },
    { key: 'gender', label: 'Gender', choices: ['female', 'male', 'other'], headings: ['gender', 'sex'] },
    { key: 'fileNo', label: 'File no.', headings: ['file no', 'file', 'file number', 'reg no', 'opd no', 'uhid'] },
    { key: 'address', label: 'Address', headings: ['address', 'area', 'city', 'pata'] },
    { key: 'allergies', label: 'Allergies', headings: ['allergies', 'allergy', 'allergic to'] },
  ],
  chairs: [
    { key: 'name', label: 'Chair', need: true, headings: ['name', 'naam', 'chair', 'chair name', 'station', 'bed', 'room'] },
  ],
  membershipplans: [
    { key: 'name', label: 'Plan', need: true, headings: ['name', 'naam', 'plan', 'plan name', 'package', 'membership'] },
    { key: 'length', label: 'Length', need: true, headings: ['length', 'duration', 'months', 'period', 'validity'] },
    { key: 'unit', label: 'Length in', choices: ['month', 'day'], headings: ['in', 'unit', 'length in', 'duration in'] },
    { key: 'price', label: 'Price \u20b9', need: true, headings: ['price', 'fee', 'fees', 'amount', 'rate'] },
    { key: 'visits', label: 'Visits', headings: ['visits', 'sessions', 'classes', 'visit limit'] },
    { key: 'gstRate', label: 'GST %', choices: ['18', '5', '0'], headings: ['gst', 'gst %', 'gst rate', 'tax'] },
  ],
  routes: [
    { key: 'name', label: 'Route', need: true, headings: ['name', 'naam', 'route', 'route name', 'beat', 'line', 'area'] },
    { key: 'days', label: 'Days', headings: ['days', 'day', 'runs on', 'visit days'] },
    { key: 'shops', label: 'Shops', headings: ['shops', 'shop', 'customers', 'parties', 'outlets', 'dukan'] },
    { key: 'van', label: 'Van', headings: ['van', 'vehicle', 'gaadi', 'vehicle no'] },
  ],
  pricelists: [
    { key: 'list', label: 'Price list', need: true, headings: ['list', 'price list', 'list name', 'rate list'] },
    { key: 'item', label: 'Item', need: true, headings: ['item', 'item name', 'product', 'product name', 'particulars'] },
    { key: 'price', label: 'Price \u20b9', need: true, headings: ['price', 'rate', 'list price', 'amount'] },
  ],
}

export const ITEM_LABEL: Record<ImportField, string> = {
  name: 'Name', category: 'Folder', unit: 'Unit', price: 'Selling price', mrp: 'MRP', cost: 'Cost price', hsn: 'HSN code', barcode: 'Barcode', brand: 'Brand',
  stock: 'Opening stock', reorder: 'Alert below', uses: 'Used for', made: 'Made here', recipe: 'What goes in', phone: 'Mobile number', email: 'Email', address: 'Address', gstin: 'GSTIN', balance: 'Balance',
}

/** A table's columns as {key, label, need}: items and parties from importSheet, the rest from TRADE_FIELDS. */
export const fieldsOf = (kind: TableKind): { key: string; label: string; need?: boolean; choices?: readonly string[] }[] =>
  isTrade(kind) ? [...TRADE_FIELDS[kind]] : FIELDS_FOR[kind].map((key) => ({ key, label: ITEM_LABEL[key], need: key === 'name' }))

/** The column a row can't be without (a price row: its list). */
export const neededKey = (kind: TableKind) => (kind === 'pricelists' ? 'list' : 'name')

const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9/% ]/g, ' ').replace(/\s+/g, ' ').trim()
const score = (cell: string, headings: readonly string[]) => {
  const text = clean(cell)
  if (!text) return 0
  if (headings.includes(text)) return 3
  if (headings.some((word) => word.length > 2 && (text.startsWith(`${word} `) || text.endsWith(` ${word}`)))) return 2
  if (headings.some((word) => word.length > 3 && text.includes(word))) return 1
  return 0
}

/** A field's headings, and its own label (what a blank sheet says). */
const wordsOf = (field: TradeField) => [...field.headings, clean(field.label)]

/** The headings row (within the first 8) and each column's best match: as the app guesses; the admin can change any. */
export function guessTable(rows: string[][], kind: TableKind): { headerRow: number; columns: Record<string, number> } {
  if (!isTrade(kind)) {
    const g = guessColumns(rows, FIELDS_FOR[kind], kind === 'customers' || kind === 'suppliers' ? NAME_HEADINGS[kind] : [])
    return { headerRow: g.headerRow, columns: g.columns as Record<string, number> }
  }
  const fields = TRADE_FIELDS[kind]
  let headerRow = 0
  let best = -1
  rows.slice(0, 8).forEach((row, index) => {
    const total = fields.reduce((sum, field) => sum + Math.max(0, ...row.map((cell) => score(cell, wordsOf(field)))), 0)
    if (total > best) { best = total; headerRow = index }
  })
  const header = rows[headerRow] ?? []
  const columns: Record<string, number> = {}
  const used = new Set<number>()
  const candidates = fields.flatMap((field) => header.map((cell, column) => ({ key: field.key, column, value: score(cell, wordsOf(field)) }))).filter((one) => one.value > 0).sort((a, b) => b.value - a.value)
  for (const one of candidates) {
    if (columns[one.key] !== undefined || used.has(one.column)) continue
    columns[one.key] = one.column
    used.add(one.column)
  }
  return { headerRow, columns }
}

/** A trade sheet's rows the sheet has twice (same needed cell, and item for a price row, ignoring case and spaces): place → first place. */
export function repeatedTradeRows(rows: string[][], columns: Record<string, number>, kind: TradeKind): Map<number, number> {
  const keyCols = kind === 'pricelists' ? ['list', 'item'] : ['name']
  const seen = new Map<string, number>()
  const out = new Map<number, number>()
  rows.forEach((cells, place) => {
    const key = keyCols.map((k) => (columns[k] === undefined ? '' : (cells[columns[k]!] ?? '').trim().replace(/\s+/g, ' ').toLowerCase())).join('|')
    if (!key.replace(/\|/g, '')) return
    const first = seen.get(key)
    if (first === undefined) seen.set(key, place)
    else out.set(place, first)
  })
  return out
}

/** The sheet of a workbook that goes to a table: one named like it, else the first. */
export const sheetNamed = (names: string[], label: string) => Math.max(0, names.findIndex((name) => name.trim().toLowerCase() === label.toLowerCase()))

/** A blank sheet's headings (never sample data). */
export const blankHeadings = (kind: TableKind) => fieldsOf(kind).map((field) => field.label)
