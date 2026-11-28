// Business types › a business's page › Automation jobs (AUTO-0): each business kind's automation jobs, in order. The list
// is Admin data: a saved list reaches every store of that kind at once (admin.save_auto_jobs); a job taken off keeps the
// stores' settings and only hides its row. The WhatsApp bot stays the first row when it is ticked.

export type AutoJob = { key: string; ready: boolean }

/** The jobs' names as the business app shows them (Store settings › Automation). */
export const AUTO_JOB_NAMES: Record<string, string> = {
  bot: 'WhatsApp bot', dues: 'Dues reminder', reorder: 'Supplier reorder', ready: 'Ready to collect', review: 'Google review ask',
  comeback: 'Come back', booking: 'Booking reminder', bookAgain: 'Book again', estimateOk: 'Estimate OK by reply', serviceDue: 'Service due',
  estimateFollow: 'Estimate follow-up', runningBill: 'Running bill due', payDay: 'Worker pay day', refill: 'Refill due', fee: 'Fee due',
  // AUTO-1: the thank-you the morning after a bill, with the owner's next-visit offer (before Google review ask).
  thanks: 'Thank-you after a bill',
}
export const autoJobName = (key: string) => AUTO_JOB_NAMES[key] ?? key

/** Tick or untick a job: a ticked one joins at the end (the bot first). */
export function toggleJob(list: string[], key: string): string[] {
  if (list.includes(key)) return list.filter((one) => one !== key)
  return key === 'bot' ? ['bot', ...list] : [...list, key]
}

/** Move a ticked job up (-1) or down (+1); the bot stays first. */
export function moveJob(list: string[], key: string, by: -1 | 1): string[] {
  const at = list.indexOf(key)
  const to = at + by
  if (at < 0 || to < 0 || to >= list.length || key === 'bot' || list[to] === 'bot') return list
  const next = [...list]
  next[at] = list[to]!
  next[to] = key
  return next
}

export const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((one, i) => one === b[i])

/** What a save changes, in words for the confirm box. */
export function jobChanges(before: string[], after: string[]): string[] {
  const added = after.filter((key) => !before.includes(key)).map(autoJobName)
  const removed = before.filter((key) => !after.includes(key)).map(autoJobName)
  const moved = added.length === 0 && removed.length === 0 && !sameList(before, after)
  return [added.length ? `adds ${added.join(', ')}` : '', removed.length ? `takes off ${removed.join(', ')} (its settings are kept)` : '', moved ? 'changes the order' : ''].filter(Boolean)
}
