// ML-6: Admin › AI free taste: the free weekly taste of each AI pack (ML_PLAN "Free taste and paid"). Every store without the
// pack gets one Home card + Bell note a week with the top rows open and the rest locked (built in ML-7). Admin data only:
// a pack starts off with no numbers; the database (admin.ml_free_save) checks the same rules as `problem` below.

export type Pack = 'stocksense' | 'comeback' | 'bizbrain'
export type TasteRow = { on: boolean; rows: number | null; day: number | null; updatedBy?: string | null; updatedAt?: string | null }
export type Taste = { packs: Record<Pack, TasteRow> }
export type TasteForm = { on: boolean; rows: string; day: string }

export const PACKS: { key: Pack; name: string; what: string }[] = [
  { key: 'stocksense', name: 'StockSense', what: 'What to buy before it runs out, and stock to clear.' },
  { key: 'comeback', name: 'ComeBack', what: 'Regular customers who stopped coming, and who to remind first.' },
  { key: 'bizbrain', name: 'BizBrain', what: 'Cash for the next weeks, and who will likely pay late.' },
]
/** 1 = Monday … 7 = Sunday, as the database keeps it. */
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export const ROWS_MAX = 50

export const formOf = (row: TasteRow | undefined): TasteForm => ({ on: row?.on ?? false, rows: row?.rows ? String(row.rows) : '', day: row?.day ? String(row.day) : '' })

/** What is wrong with the form, in words; null when it can be saved. */
export function problem(form: TasteForm): string | null {
  const rows = form.rows.trim()
  if (rows && !(/^\d+$/.test(rows) && Number(rows) >= 1 && Number(rows) <= ROWS_MAX)) return `Free rows must be 1 to ${ROWS_MAX}.`
  if (form.on && (!rows || !form.day)) return 'Set the free rows and the day before turning it on.'
  return null
}

/** What admin.ml_free_save gets (without the reason). Empty numbers are sent as not set. */
export const payload = (pack: Pack, form: TasteForm) => ({ pack, on: form.on, rows: form.rows.trim() ? Number(form.rows) : null, day: form.day ? Number(form.day) : null })

export const changed = (row: TasteRow | undefined, form: TasteForm) => JSON.stringify(formOf(row)) !== JSON.stringify({ ...form, rows: form.rows.trim() })

/** One line for a pack: what stores get now. */
export function summary(row: TasteRow | undefined): string {
  if (!row?.on) return 'Off: no free weekly card.'
  return `On: every ${DAYS[(row.day ?? 1) - 1]}, top ${row.rows} ${row.rows === 1 ? 'row' : 'rows'} open, the rest locked.`
}
