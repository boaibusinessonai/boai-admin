// "Price to check" notes on Admin › Plans › What AI use costs (admin-ai-price-reminder, owner 2026-11-15). A note shows on
// its model's row until the model is in the saved prices' `checked` list: saved with a new price for that row, or Done.

type Model = { in: number; cached?: number; out?: number; perMChars?: number }

/** The models that carry a note, and what it says. */
export const PRICE_NOTES: Record<string, string> = {
  'gpt-4o-mini-transcribe': 'Price to check: OpenAI charges sound higher than text. Set the real price.',
}

/** The note for a model, while its price is not checked. */
export const priceNote = (name: string, checked: string[] | undefined) => (checked ?? []).includes(name) ? undefined : PRICE_NOTES[name]

const same = (a: Model | undefined, b: Model | undefined) => JSON.stringify([a?.in, a?.cached, a?.out, a?.perMChars]) === JSON.stringify([b?.in, b?.cached, b?.out, b?.perMChars])

/** The checked list to save: the ones checked before (still listed) and each noted model whose price is changed now. */
export function checkedAfter(before: Record<string, Model>, checked: string[] | undefined, models: Record<string, Model>) {
  const changed = Object.keys(PRICE_NOTES).filter((name) => models[name] && before[name] && !same(before[name], models[name]))
  return [...new Set([...(checked ?? []), ...changed])].filter((name) => models[name])
}
