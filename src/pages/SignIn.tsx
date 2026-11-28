import { LogIn, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ErrorBox } from '../components/ui'
import { drawGoogleButton, googleClientId } from '../lib/googleButton'
import { supabase } from '../lib/supabase'

// Sign in with Google; the account must be on the admin list.

export function SignIn({ notice }: { notice?: string }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function google() {
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/`, queryParams: { prompt: 'select_account' } } })
    if (error) { setError(error.message); setBusy(false) }
  }
  // V140: with the stage's Google client ID (/stage.js), Google's own button signs in on this page; else the redirect.
  const box = useRef<HTMLDivElement>(null)
  const [drawn, setDrawn] = useState(false)
  const clientId = googleClientId()
  useEffect(() => {
    if (!clientId || !box.current) return
    let live = true
    drawGoogleButton(box.current, clientId, 'signin', (token, nonce) => {
      setBusy(true)
      setError('')
      void supabase.auth.signInWithIdToken({ provider: 'google', token, nonce }).then(({ error }) => { if (live && error) { setError(error.message); setBusy(false) } })
    }).then(() => { if (live) setDrawn(true) }, () => { if (live) setDrawn(false) })
    return () => { live = false }
  }, [clientId])
  return (
    <main className="auth">
      <div className="auth-card">
        <ShieldCheck size={32} className="auth-icon" aria-hidden="true" />
        <h1>BOAI Admin</h1>
        <p className="muted">For BOAI's own team. Sign in with the Google account on the admin list.</p>
        {notice && <p className="notice" role="status">{notice}</p>}
        {error && <ErrorBox message={error} />}
        {clientId && <div ref={box} className="google-own" hidden={!drawn} aria-busy={busy} />}
        {!drawn && <button type="button" className="button primary wide" onClick={google} disabled={busy}><LogIn size={18} aria-hidden="true" /> Sign in with Google</button>}
      </div>
    </main>
  )
}
