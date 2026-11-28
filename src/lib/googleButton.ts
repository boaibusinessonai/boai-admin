// V140: Google sign-in on our own page. Google's button (Google Identity Services) gives an ID token here and
// supabase.auth.signInWithIdToken turns it into the session, so Google says "continue to <our site>", never the
// <ref>.supabase.co address. The web client ID is per stage and read when the page opens (/stage.js, written by
// Admin › Releases), never built in. No client ID yet → the page keeps today's redirect sign-in.
// Each stage's Supabase › Auth › Google must list the same client ID, and the client must allow the site's address.

type Stage = { googleClientId?: unknown } | null | undefined
type Credential = { credential?: string }
type ButtonOptions = { type: 'standard'; theme: 'outline'; size: 'large'; text: 'continue_with' | 'signup_with' | 'signin_with'; shape: 'rectangular'; logo_alignment: 'center'; width: number }
type GoogleId = {
  initialize: (config: { client_id: string; callback: (answer: Credential) => void; nonce: string; auto_select: boolean; cancel_on_tap_outside: boolean; use_fedcm_for_button?: boolean; ux_mode: 'popup'; context: 'signin' | 'signup' }) => void
  renderButton: (parent: HTMLElement, options: ButtonOptions) => void
}
type GoogleWindow = { BOAI_STAGE?: Stage; google?: { accounts?: { id?: GoogleId } } }

const SCRIPT = 'https://accounts.google.com/gsi/client'
const CLIENT_ID = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/

/** The stage's Google web client ID from /stage.js, or '' (then the old redirect sign-in is used). */
export function googleClientId(stage: Stage = typeof window === 'undefined' ? null : (window as unknown as GoogleWindow).BOAI_STAGE): string {
  const id = typeof stage?.googleClientId === 'string' ? stage.googleClientId.trim() : ''
  return CLIENT_ID.test(id) ? id : ''
}

/** A fresh nonce: Google gets its SHA-256 (hex), Supabase the raw value, so a token can't be replayed. */
export async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const raw = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return { raw, hashed: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('') }
}

let loading: Promise<GoogleId> | null = null
function loadGoogle(): Promise<GoogleId> {
  const ready = () => (window as unknown as GoogleWindow).google?.accounts?.id
  const now = ready()
  if (now) return Promise.resolve(now)
  loading ??= new Promise<GoogleId>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => { const id = ready(); if (id) resolve(id); else reject(new Error('google_missing')) }
    script.onerror = () => reject(new Error('google_blocked'))
    document.head.appendChild(script)
  }).catch((error: unknown) => { loading = null; throw error })
  return loading
}

/**
 * Draws Google's own button into `parent`. On a pick, `onToken(idToken, rawNonce)` signs in.
 * Rejects when Google can't be reached (the caller then shows its own button with the old sign-in).
 */
export async function drawGoogleButton(parent: HTMLElement, clientId: string, mode: 'signin' | 'signup', onToken: (idToken: string, nonce: string) => void): Promise<void> {
  const [google, nonce] = await Promise.all([loadGoogle(), makeNonce()])
  google.initialize({
    client_id: clientId,
    nonce: nonce.hashed,
    callback: (answer) => { if (answer.credential) onToken(answer.credential, nonce.raw) },
    auto_select: false,
    cancel_on_tap_outside: true,
    use_fedcm_for_button: true,
    ux_mode: 'popup',
    context: mode,
  })
  parent.replaceChildren()
  google.renderButton(parent, {
    type: 'standard', theme: 'outline', size: 'large', shape: 'rectangular', logo_alignment: 'center',
    text: mode === 'signup' ? 'signup_with' : 'continue_with',
    // Google allows 200–400 px.
    width: Math.max(200, Math.min(400, Math.round(parent.getBoundingClientRect().width) || 320)),
  })
}
