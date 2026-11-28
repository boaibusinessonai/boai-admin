// Admin > App name & logo (owner 2026-11-12, until the name is final): the style cards made from a typed name.
// Fonts chosen by the owner 2026-11-12. The database keeps {plain, gold, tagline, topLine, font, logo} (app.brand).

export const BRAND_FONTS = ['Poppins', 'Montserrat', 'Playfair Display', 'Baloo 2', 'Nunito', 'Raleway'] as const
export const FONTS_HREF = `https://fonts.googleapis.com/css2?${BRAND_FONTS.map((f) => `family=${f.replace(/ /g, '+')}:wght@700;800`).join('&')}&display=swap`

/** The app's colours: navy square, gold letter / gold part (same as the web app's logo). */
export const NAVY = '#173d3d'
export const GOLD = '#daa940'

export const NAME_OK = /^[A-Za-z0-9 ]+$/

/** Where the gold part starts: at the first capital after the first letter ("BOAI" → 6), else the middle. */
export function autoSplit(name: string): number {
  const at = name.slice(1).search(/[A-Z]/)
  if (at >= 0) return at + 1
  return Math.max(1, Math.ceil(name.length / 2))
}

/** The name cut into its plain and gold parts; the split stays between the first and last letter. */
export function splitName(name: string, at: number): { plain: string; gold: string } {
  const cut = Math.min(Math.max(at, 1), name.length)
  return { plain: name.slice(0, cut), gold: name.slice(cut) }
}

/** Swaps the old name for the new one in a tagline or top line (so "Use BOAI, …" follows the typed name). */
export function followName(text: string, from: string, to: string): string {
  return from && to && from !== to ? text.split(from).join(to) : text
}

/** The first letter of the name, for the letter logo. */
export const letterOf = (name: string) => (name.trim()[0] ?? 'D').toUpperCase()

/** A letter logo as a PNG data link: navy rounded square, gold letter in the chosen font (drawn once the font is in). */
export async function letterLogo(letter: string, font: string, size = 256): Promise<string> {
  try { await document.fonts.load(`800 ${size * 0.62}px "${font}"`, letter) } catch { /* draws with the fallback font */ }
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const r = size * 0.24
  g.fillStyle = NAVY
  g.beginPath()
  g.roundRect(0, 0, size, size, r)
  g.fill()
  g.fillStyle = GOLD
  g.font = `800 ${size * 0.62}px "${font}", sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const m = g.measureText(letter)
  const y = size / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
  g.textBaseline = 'alphabetic'
  g.fillText(letter, size / 2, y)
  return canvas.toDataURL('image/png')
}

/** An uploaded logo: SVG, PNG, JPEG or WebP, up to 200 KB (the database refuses anything else). */
export const LOGO_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp']
export const LOGO_MAX = 200 * 1024
export function logoProblem(file: { type: string; size: number }): string | null {
  if (!LOGO_TYPES.includes(file.type)) return 'Use an SVG, PNG, JPEG or WebP picture.'
  if (file.size > LOGO_MAX) return 'The picture is over 200 KB. Use a smaller one.'
  return null
}
