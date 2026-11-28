// Plans & prices › AI modes and heavy use (V22, owner 2026-11-15): Best / Moderate / Low each cost credits × and use a
// model; heavy use makes a business's later answers of the day cost more; the day's share splits a plan's monthly
// credits over the days left. All saved with the AI prices (admin.save_ai_prices); the database checks the same.

export const MODES = [['best', 'Best'], ['moderate', 'Moderate'], ['low', 'Low']] as const
export type ModeKey = (typeof MODES)[number][0]
export type Modes = Partial<Record<ModeKey, { times: number; model?: string }>>
export type Step = { from: number; times: number }
export type ModesForm = { modes: Record<ModeKey, { times: string; model: string }>; steps: { from: string; times: string }[]; sharePlans: string[] }

export function modesForm(modes: Modes = {}, steps: Step[] = [], sharePlans: string[] = []): ModesForm {
  const row = (k: ModeKey) => ({ times: String(modes[k]?.times ?? 1), model: modes[k]?.model ?? '' })
  return { modes: { best: row('best'), moderate: row('moderate'), low: row('low') }, steps: steps.map((s) => ({ from: String(s.from), times: String(s.times) })), sharePlans: [...sharePlans] }
}

/** {modes, heavyUse, dailySharePlans} to save, or the problem in plain words. */
export function readModesForm(form: ModesForm, models: string[]): { ok: { modes: Modes; heavyUse: Step[]; dailySharePlans: string[] } } | { problem: string } {
  const modes: Modes = {}
  for (const [key, name] of MODES) {
    const times = Number(form.modes[key].times)
    if (!Number.isFinite(times) || times < 0.1 || times > 10) return { problem: `${name}: credits × is a number from 0.1 to 10.` }
    const model = form.modes[key].model.trim()
    if (model && !models.includes(model)) return { problem: `${name}: pick a model from the price list.` }
    modes[key] = model ? { times, model } : { times }
  }
  const heavyUse: Step[] = []
  for (const [i, s] of form.steps.entries()) {
    const from = Number(s.from); const times = Number(s.times)
    if (!Number.isInteger(from) || from < 2 || from > 100000) return { problem: `Step ${i + 1}: “from answer” is a whole number from 2.` }
    if (!Number.isFinite(times) || times < 1 || times > 10) return { problem: `Step ${i + 1}: credits × is a number from 1 to 10.` }
    const last = heavyUse[heavyUse.length - 1]
    if (last && (from <= last.from || times <= last.times)) return { problem: `Step ${i + 1} must start later and cost more than the one before.` }
    heavyUse.push({ from, times })
  }
  if (heavyUse.length > 10) return { problem: 'Up to 10 steps.' }
  return { ok: { modes, heavyUse, dailySharePlans: form.sharePlans } }
}
