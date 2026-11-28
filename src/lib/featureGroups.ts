import { sortByText } from './sort'

// The Plans & prices list: the businesses a store can run, then the features it can have, in groups.
// Groups and the rows in them go A to Z (owner 2026-11-11); Other stays last. The names come from the database.
// A row may sit under another (`under`) and may need another switched on to work (`needs`): only links the code has
// (owner 2026-11-12, feature tree: Admin shows which feature lies under which).
type Row = { key: string; meaning: string; under?: string; needs?: string; alsoShows?: string }
export type Section = 'Businesses' | 'Features'

const GROUPS: { section: Section; title: string; rows: Row[] }[] = [
  { section: 'Businesses', title: '', rows: [
    { key: 'restaurant', meaning: 'Tables, kitchen tickets, takeaway and delivery.' },
    { key: 'hotel', meaning: 'Rooms, bookings, the guest register and check-out bills.' },
    { key: 'clinic', meaning: 'Patients, tokens, visit notes and prescriptions; teeth chart and treatment plans, glasses, physio exercises and packages by practice.' },
    { key: 'coaching', meaning: 'Students, batches, attendance and monthly fees.' },
    { key: 'rentals', meaning: 'Bookings, deposits, hand-over and return with late fees.' },
    { key: 'fashion', meaning: 'Sizes and colours, MRP tags, exchanges.' },
    { key: 'jewellery', meaning: 'Gold and silver rates, weight and purity, old gold exchange.' },
    { key: 'wine', meaning: 'Bottles and cases, dry days, the excise register.' },
    { key: 'distribution', meaning: 'Cases and pieces, rate lists, orders from shops, schemes, routes and delivery challans.' },
    { key: 'projects', meaning: 'Sites, BOQ, labour, running bills.' },
    { key: 'memberships', meaning: 'Plans, members, renewals, pauses and check-in.' },
  ] },
  { section: 'Features', title: 'Work and bookings', rows: [
    { key: 'appointments', meaning: 'Bookings by staff and the walk-in queue.' },
    { key: 'jobs', meaning: 'Repairs and stitching: the problem, parts, work and the bill. Never in a store with Clinic: there it is Visit.' },
    { key: 'make', meaning: 'Recipes, batches and made-to-order, with what they cost.', alsoShows: 'showProducts' },
    { key: 'repack', meaning: 'Break a big pack into small packs for sale.' },
    { key: 'bookToVisits', meaning: 'Today’s bookings from Appointments show in the clinic’s Visits today (Booked, not come yet). Off: both pages work on their own.', under: 'appointments', needs: 'clinic' },
    { key: 'sendToJob', meaning: 'From an appointment, open a Job Card and start the work. Not in a store with Clinic: there bookings go to Visits today.', under: 'appointments', needs: 'jobs' },
  ] },
  { section: 'Features', title: 'Selling', rows: [
    { key: 'services', meaning: 'Services on the bill next to goods: work, fees, charges.' },
    { key: 'ordersForLater', meaning: 'Cakes, sweets and catering booked now for a later day: advance, ready, hand over, bill.' },
    { key: 'measurements', meaning: 'Customer measurements on One customer: garment lists and each customer’s measurements in inches. A tailor comes with it.' },
    { key: 'delivery', meaning: 'Send a bill to the customer’s address: packed, out, delivered, cash collected on the way.' },
  ] },
  { section: 'Features', title: 'GST', rows: [
    { key: 'gstInvoices', meaning: 'GST invoices on bills, and the Invoices page.' },
    { key: 'multiGst', meaning: 'Multiple GST numbers: one GST number for each state the stores are in. Off: one number for all stores.' },
    { key: 'gstReturns', meaning: 'Monthly GSTR-1 and GSTR-3B, with an Excel file.' },
  ] },
  { section: 'Features', title: 'Stock and buying', rows: [
    { key: 'stock', meaning: 'Counts stock: quantities, low stock, count and waste, between stores.' },
    { key: 'inventoryPage', meaning: 'Shows or hides the Inventory page. With Purchases page off too, the business stops counting stock.', under: 'stock' },
    { key: 'showProducts', meaning: 'Shows the Products page to a trade that makes nothing (admin only). Opens from Inventory’s “Products ›”.', under: 'stock', needs: 'make' },
    { key: 'purchases', meaning: 'Supplier bills and suppliers, and the books behind them.' },
    { key: 'purchasesPage', meaning: 'Shows or hides the Purchases page. With Inventory page off too, the business stops counting stock.', under: 'purchases' },
  ] },
  { section: 'Features', title: 'Money, people and things', rows: [
    { key: 'ledger', meaning: 'The business ledger and petty cash.' },
    { key: 'staffPay', meaning: 'Staff register and their pay.' },
    { key: 'assets', meaning: 'Equipment and things the business owns.' },
    { key: 'maintenance', meaning: 'Upkeep and repairs of those things.', under: 'assets' },
  ] },
  { section: 'Features', title: 'Customers and reports', rows: [
    { key: 'dashboard', meaning: 'The owner’s numbers page.' },
    { key: 'insights', meaning: 'Sales, customers, dues and stock in plain words.' },
    { key: 'campaigns', meaning: 'Offers, birthday wishes, refer a friend, loyalty points, WhatsApp.' },
    { key: 'display', meaning: 'The bill on a second screen for the customer, and a catalogue link.' },
    { key: 'whiteLabel', meaning: 'No “Provided by BOAI”: just the business’s name and logo.' },
  ] },
  { section: 'Features', title: 'Data', rows: [
    { key: 'imports', meaning: 'Bring items and customers in from a sheet.' },
    { key: 'offline', meaning: 'Bills made with no internet, sent in later.' },
    { key: 'setupChange', meaning: 'Lets the owner change the business setup (admin only).' },
  ] },
  { section: 'Features', title: 'AI', rows: [
    { key: 'aiStock', meaning: 'What to reorder, and dead or expiring stock.' },
    { key: 'aiDataEntry', meaning: 'A photo of a supplier bill becomes entries.' },
    { key: 'aiAssistant', meaning: 'Ask questions in plain language.' },
    { key: 'aiComeBack', meaning: 'Regular customers who stopped coming, reminded of their loyalty points (tap to send).' },
    { key: 'aiEntry', meaning: 'AI buttons on work pages (AI Sale, AI Payment, AI Stock, AI Make): say or type it, check and save.' },
    { key: 'aiImport', meaning: 'AI Import: AI reads a messy Excel, matches the columns and suggests fixes; the customer accepts each one.' },
  ] },
]

/** depth 1 = sits under the row above it; needs = the key that must be on too; alsoShows = a row elsewhere this one opens. */
export type GroupedFeature<F> = F & { meaning?: string; depth: 0 | 1; needs?: string; alsoShows?: string }

/** Every feature from the database lands in a group; one this list doesn't know yet goes under Other, so nothing can disappear.
 *  Inside a group: top rows A to Z, each followed by the rows under it, A to Z. */
export function groupFeatures<F extends { key: string; name?: string }>(features: F[]): { section: Section; title: string; rows: GroupedFeature<F>[] }[] {
  const byKey = new Map(features.map((feature) => [feature.key, feature]))
  const groups = sortByText(GROUPS, (group) => group.title).map((group) => {
    const rows = group.rows.flatMap(({ key, meaning, under, needs, alsoShows }) => {
      const feature = byKey.get(key)
      if (!feature) return []
      byKey.delete(key)
      return [{ feature: { ...feature, meaning, needs, alsoShows }, under }]
    })
    const present = new Set(rows.map((row) => row.feature.key))
    const top = byName(rows.filter((row) => !row.under || !present.has(row.under)).map((row) => row.feature))
    const tree = top.flatMap((parent) => [
      { ...parent, depth: 0 as const },
      ...byName(rows.filter((row) => row.under === parent.key).map((row) => row.feature)).map((child) => ({ ...child, depth: 1 as const })),
    ])
    return { section: group.section, title: group.title, rows: tree as GroupedFeature<F>[] }
  })
  const other = byName([...byKey.values()]).map((feature) => ({ ...feature, depth: 0 as const })) as GroupedFeature<F>[]
  return [...groups, { section: 'Features' as const, title: 'Other', rows: other }].filter((group) => group.rows.length > 0)
}

/** The name to show for a key ("needs Make on"), from the database list. */
export function featureName(features: { key: string; name?: string }[], key: string): string {
  return features.find((feature) => feature.key === key)?.name ?? key
}

/** A main feature with the smaller ones under it, so a page can draw them together in one box. */
export function families<F extends { depth: 0 | 1 }>(rows: F[]): { head: F; kids: F[] }[] {
  const out: { head: F; kids: F[] }[] = []
  for (const row of rows) {
    const last = out[out.length - 1]
    if (row.depth && last) last.kids.push(row)
    else out.push({ head: row, kids: [] })
  }
  return out
}

const byName = <F extends { key: string; name?: string }>(rows: F[]) => sortByText(rows, (row) => row.name ?? row.key)
