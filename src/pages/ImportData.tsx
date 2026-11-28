import { useEffect, useState } from 'react'
import { Badge, Card, ErrorBox } from '../components/ui'
import { formatNumber } from '../lib/format'
import { chunksOf, repeatedRows, suggestFix, textRows, type ImportField, type ImportKind } from '../lib/importSheet'
import { blankHeadings, fieldsOf, guessTable, isTrade, neededKey, repeatedTradeRows, sheetNamed, TABLES, tablesToFill, type StoreFacts, type TableKind } from '../lib/importTables'
import { admin } from '../lib/supabase'
import type { Business } from '../lib/types'

// Import data for a customer who sent an Excel outside the app: pick the business and store; Tables to fill lists that
// store's tables as its app does (185i-ADMIN: each with how many rows it has, a blank sheet, all in one Excel); pick a
// table, the file and why; check the columns, then every row (nothing kept); the app's own fixes are applied when ticked; someone or
// something already there is left alone unless "Update" is ticked. Confirm saves it as the business owner
// (admin.import_*, the same checks as the app, audited). Balances go in without the owner's PIN.

type Book = { fileName: string; sheets: { name: string; rows: string[][] }[] }
type Outcome = 'new' | 'there' | 'updated'
type RowError = { row: number; message: string; field?: string }
type Answer = { ok: number; errors: RowError[]; done?: { row: number; outcome: Outcome }[]; import?: Batch }
type Batch = { id: string; created?: number; found?: number; skipped?: number; balances?: number }
type Row = { at: number; cells: string[]; repeatOf?: number; fixes: number; outcome?: Outcome | RowError }
const letter = (index: number) => (index < 26 ? String.fromCharCode(65 + index) : `${String.fromCharCode(64 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`)

export function ImportData({ businesses }: { businesses: Business[] }) {
  const [businessId, setBusinessId] = useState(businesses[0]?.id ?? '')
  const stores = businesses.find((b) => b.id === businessId)?.stores.filter((s) => s.active) ?? []
  const [picked, setPicked] = useState('')
  const storeId = stores.some((s) => s.id === picked) ? picked : stores[0]?.id ?? ''
  const [kind, setKind] = useState<TableKind>('customers')
  const [facts, setFacts] = useState<StoreFacts | null>(null)
  const [reason, setReason] = useState('')
  const [book, setBook] = useState<Book | null>(null)
  const [sheet, setSheet] = useState(0)
  const [headerRow, setHeaderRow] = useState(0)
  const [columns, setColumns] = useState<Record<string, number | undefined>>({})
  const [useFixes, setUseFixes] = useState(true)
  const [update, setUpdate] = useState(false)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [batch, setBatch] = useState<Batch | null>(null)
  const [result, setResult] = useState<{ batch?: Batch; outcomes: Map<number, Outcome | RowError> } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fields = fieldsOf(kind)
  const trade = isTrade(kind)
  const label = TABLES.find((table) => table.kind === kind)?.label ?? kind
  const sheetRows = book?.sheets[sheet]?.rows ?? []
  const reset = () => { setRows(null); setBatch(null); setResult(null) }
  const guess = (from: string[][], value: TableKind) => {
    const g = guessTable(from, value)
    setHeaderRow(g.headerRow); setColumns(g.columns); reset()
  }
  useEffect(() => {
    if (!storeId) { setFacts(null); return }
    let live = true
    setFacts(null)
    admin<StoreFacts>('import_tables', { storeId }).then((got) => { if (live) setFacts(got) }, (caught: unknown) => { if (live) setError(caught instanceof Error ? caught.message : 'Something went wrong.') })
    return () => { live = false }
  }, [storeId, result])
  const tables = facts ? tablesToFill(facts) : []
  useEffect(() => { if (facts && !tablesToFill(facts).some((table) => table.kind === kind)) setKind('customers') }, [facts, kind])
  const pick = (value: TableKind) => {
    setKind(value); setUpdate(false)
    if (!book) return
    const at = sheetNamed(book.sheets.map((one) => one.name), TABLES.find((table) => table.kind === value)?.label ?? value)
    setSheet(at); guess(book.sheets[at]?.rows ?? [], value)
  }
  const blank = (list: TableKind[]) => void run(async () => {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    for (const one of list) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([blankHeadings(one)]), (TABLES.find((table) => table.kind === one)?.label ?? one).slice(0, 31))
    const store = stores.find((s) => s.id === storeId)?.name ?? 'store'
    XLSX.writeFile(workbook, list.length === 1 ? `${TABLES.find((table) => table.kind === list[0])?.label ?? 'sheet'} - ${store}.xlsx` : `Tables to fill - ${store}.xlsx`)
  })
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await work() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Something went wrong.') } finally { setBusy(false) }
  }
  const open = (file: File) => void run(async () => {
    const XLSX = await import('xlsx')
    const read = /\.csv$/i.test(file.name) ? XLSX.read(await file.text(), { type: 'string' }) : XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const next = { fileName: file.name.slice(0, 200), sheets: read.SheetNames.map((name) => ({ name, rows: textRows(XLSX.utils.sheet_to_json<unknown[]>(read.Sheets[name]!, { header: 1, raw: false, defval: '' })) })) }
    const at = sheetNamed(next.sheets.map((one) => one.name), label)
    setBook(next); setSheet(at); guess(next.sheets[at]?.rows ?? [], kind)
  })
  const mapped = fields.map((field) => field.key).filter((key) => columns[key] !== undefined)
  /** The rows as they will be sent: the app's fixes applied when ticked; rows the sheet has twice marked. */
  const prepared = (): Row[] => {
    const data = chunksOf(sheetRows, headerRow).flatMap((chunk) => chunk.rows.map((cells, n) => ({ cells: [...cells], at: chunk.sheetRows[n]! })))
    const repeats = isTrade(kind) ? repeatedTradeRows(data.map((row) => row.cells), columns as Record<string, number>, kind) : repeatedRows(data.map((row) => row.cells), columns as Partial<Record<ImportField, number>>, kind)
    return data.map((row, place) => {
      let fixes = 0
      for (const field of isTrade(kind) ? [] : mapped) {
        const fix = suggestFix(field as ImportField, row.cells[columns[field]!] ?? '', kind as ImportKind)
        if (fix) { fixes++; if (useFixes) row.cells[columns[field]!] = fix.value }
      }
      return { at: row.at, cells: row.cells, fixes, repeatOf: repeats.has(place) ? data[repeats.get(place)!]!.at : undefined }
    })
  }
  const started = async () => {
    if (batch) return batch
    const made = (await admin<{ import: Batch }>('import_start', { storeId, reason, kind, fileName: book?.fileName, columns: Object.fromEntries(Object.entries(columns).filter(([, c]) => typeof c === 'number')) })).import
    setBatch(made)
    return made
  }
  /** Sends the rows that aren't repeats, 200 a call; what came back for each, by sheet row. */
  const send = async (list: Row[], preview: boolean) => {
    const made = await started()
    const sent = list.filter((row) => !row.repeatOf)
    const back = new Map<number, Outcome | RowError>()
    for (let i = 0; i < sent.length; i += 200) {
      const part = sent.slice(i, i + 200)
      const answer = await admin<Answer>('import_rows', { storeId, importId: made.id, rows: part.map((row) => row.cells), preview, ...(update && !trade && !preview ? { update: part.map((_, n) => n + 1) } : {}) })
      for (const d of answer.done ?? []) back.set(part[d.row - 1]!.at, d.outcome)
      for (const e of answer.errors ?? []) back.set(part[e.row - 1]!.at, { ...e, row: part[e.row - 1]!.at })
    }
    return back
  }
  const check = () => void run(async () => {
    const list = prepared()
    const back = await send(list, true)
    setRows(list.map((row) => ({ ...row, outcome: back.get(row.at) })))
  })
  const save = () => void run(async () => {
    if (!rows) return
    const outcomes = await send(rows, false)
    const finished = (await admin<{ import: Batch }>('import_finish', { storeId, importId: (await started()).id })).import
    setResult({ batch: finished, outcomes })
  })
  const resultSheet = () => void run(async () => {
    if (!rows || !result) return
    const XLSX = await import('xlsx')
    const header = sheetRows[headerRow] ?? []
    const width = Math.max(header.length, ...rows.map((row) => row.cells.length))
    const said = (row: Row) => {
      if (row.repeatOf) return `Skipped: same as row ${row.repeatOf}`
      const got = result.outcomes.get(row.at)
      return typeof got === 'object' ? `Not added: ${got.message}` : got === 'new' ? 'Added' : got === 'updated' ? 'Updated' : got === 'there' ? 'Already there, not changed' : 'Not added'
    }
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[...Array.from({ length: width }, (_, n) => header[n] ?? ''), 'Result'], ...rows.map((row) => [...Array.from({ length: width }, (_, n) => row.cells[n] ?? ''), said(row)])]), 'Result')
    XLSX.writeFile(workbook, `${(book?.fileName ?? 'sheet').replace(/\.[a-z]+$/i, '')}-result.xlsx`)
  })

  if (!businesses.length) return <p className="muted">No business yet.</p>
  const count = (test: (row: Row) => boolean) => rows?.filter(test).length ?? 0
  const problems = rows?.filter((row) => typeof row.outcome === 'object') ?? []
  const willAdd = count((row) => row.outcome === 'new')
  const there = count((row) => row.outcome === 'there')
  const header = sheetRows[headerRow] ?? []
  const width = Math.max(header.length, ...sheetRows.slice(headerRow + 1, headerRow + 6).map((row) => row.length))

  return (
    <Card title="Import data for this customer">
      <p className="muted">For an Excel the customer sent outside the app. Every row is checked the same way as in their app, and saved as the business owner. Nothing is saved until you confirm; the audit log keeps who and why.</p>
      <div className="plan-form">
        <label className="field"><span>Business</span>
          <select value={businessId} onChange={(event) => { setBusinessId(event.target.value); setPicked(''); reset() }}>{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </label>
        <label className="field"><span>Store</span>
          <select value={storeId} onChange={(event) => { setPicked(event.target.value); reset() }}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <label className="field"><span>Why (for the audit log)</span>
          <input value={reason} placeholder="Customer sent the sheet on WhatsApp" onChange={(event) => setReason(event.target.value)} />
        </label>
        <label className="field"><span>Excel or CSV file</span>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) open(file); event.target.value = '' }} />
        </label>
      </div>
      {error && <ErrorBox message={error} />}
      {!storeId && <p className="muted">This business has no open store.</p>}
      {storeId && (
        <>
          <h3>Tables to fill ({stores.find((s) => s.id === storeId)?.name})</h3>
          {!facts ? <p className="muted">Loading…</p> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Table</th><th>Already</th><th></th><th></th></tr></thead>
              <tbody>{tables.map((table, n) => (
                <tr key={table.kind}>
                  <td>{n + 1} {table.label}</td>
                  <td>{formatNumber(table.n)}{table.n === 0 && <> <Badge tone="critical">!</Badge></>}</td>
                  <td><button type="button" className="button" disabled={busy} onClick={() => blank([table.kind])}>Blank sheet</button></td>
                  <td>{kind === table.kind ? <Badge tone="accent">Adding to this</Badge> : <button type="button" className="button" disabled={busy} onClick={() => pick(table.kind)}>Add to this</button>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          {facts && <div className="contact"><button type="button" className="button" disabled={busy} onClick={() => blank(tables.map((table) => table.kind))}>Download all as one Excel</button></div>}
          <p className="muted">Opening balances: cash and bank are typed by the owner in Business settings › Opening balances; customer and supplier balances come in their sheets (Balance column).</p>
          <p><strong>Adds to:</strong> {label}</p>
        </>
      )}
      {book && storeId && !result && (
        <>
          <div className="plan-form">
            {book.sheets.length > 1 && <label className="field"><span>Sheet</span>
              <select value={sheet} onChange={(event) => { const n = Number(event.target.value); setSheet(n); guess(book.sheets[n]?.rows ?? [], kind) }}>{book.sheets.map((s, n) => <option key={s.name} value={n}>{s.name}</option>)}</select>
            </label>}
            <label className="field"><span>Headings are in</span>
              <select value={headerRow} onChange={(event) => { setHeaderRow(Number(event.target.value)); reset() }}>{sheetRows.slice(0, 8).map((row, n) => <option key={n} value={n}>Row {n + 1}: {row.filter(Boolean).slice(0, 3).join(', ')}</option>)}</select>
            </label>
            {fields.map((field) => (
              <label className="field" key={field.key}><span>{field.label}{field.need ? ' (needed)' : ''}{field.choices ? ` (${field.choices.join(' / ')})` : ''}</span>
                <select value={columns[field.key] ?? ''} onChange={(event) => { setColumns({ ...columns, [field.key]: event.target.value === '' ? undefined : Number(event.target.value) }); reset() }}>
                  <option value="">Not in the sheet</option>
                  {Array.from({ length: width }, (_, n) => <option key={n} value={n}>{letter(n)}{header[n] ? ` · ${header[n]}` : ''}</option>)}
                </select>
              </label>
            ))}
          </div>
          {!trade && <label className="check"><input type="checkbox" checked={useFixes} onChange={(event) => { setUseFixes(event.target.checked); setRows(null) }} /> Tidy cells as the app suggests (₹1,200 to 1200, Dr/Cr to plus/minus, +91 off mobile numbers, Kgs to kg, extra spaces)</label>}
          {!trade && <label className="check"><input type="checkbox" checked={update} onChange={(event) => setUpdate(event.target.checked)} /> Update what is already there from the sheet (else left as it is; an item's stock never changes)</label>}
          {trade && <p className="muted">Names already there are left alone. What a row points at (a client, a supplier, an item, shops) must already be there.</p>}
          <div className="contact">
            <button type="button" className="button" disabled={busy || columns[neededKey(kind)] === undefined || reason.trim().length < 3} onClick={check}>Check every row</button>
          </div>
          {rows && (
            <>
              <p>
                <Badge tone="good">{formatNumber(willAdd)} will be added</Badge>{' '}
                <Badge tone="accent">{formatNumber(there)} already there{update ? ', will be updated' : ', left as they are'}</Badge>{' '}
                {count((row) => Boolean(row.repeatOf)) > 0 && <><Badge>{formatNumber(count((row) => Boolean(row.repeatOf)))} skipped (twice in the sheet)</Badge>{' '}</>}
                {problems.length > 0 && <Badge tone="critical">{formatNumber(problems.length)} need a fix, not saved</Badge>}
                {useFixes && count((row) => row.fixes > 0) > 0 && <span className="sub">{formatNumber(rows.reduce((sum, row) => sum + row.fixes, 0))} cells tidied.</span>}
              </p>
              {problems.length > 0 && (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>Row</th><th>Problem</th>{mapped.map((field) => <th key={field}>{fields.find((one) => one.key === field)?.label}</th>)}</tr></thead>
                  <tbody>{problems.slice(0, 100).map((row) => <tr key={row.at}><td>{row.at}</td><td>{(row.outcome as RowError).message}</td>{mapped.map((field) => <td key={field}>{row.cells[columns[field]!]}</td>)}</tr>)}</tbody>
                </table></div>
              )}
              {problems.length > 0 && <p className="muted">Fix these in the sheet and choose it again, or save the rest now.</p>}
              <div className="contact">
                <button type="button" className="button primary" disabled={busy || willAdd + (update ? there : 0) === 0} onClick={save}>Confirm and save ({formatNumber(willAdd + (update ? there : 0))})</button>
              </div>
            </>
          )}
        </>
      )}
      {result && (
        <>
          <p><strong>Saved:</strong> {formatNumber(result.batch?.created ?? 0)} added, {formatNumber(result.batch?.found ?? 0)} already there{update ? ' (updated)' : ''}, {formatNumber(result.batch?.skipped ?? 0)} not added{result.batch?.balances ? `, ${formatNumber(result.batch.balances)} balances set` : ''}.</p>
          <div className="contact">
            <button type="button" className="button" onClick={resultSheet}>Download result sheet</button>
            <button type="button" className="button primary" onClick={() => { setBook(null); reset() }}>Import another sheet</button>
          </div>
        </>
      )}
    </Card>
  )
}
