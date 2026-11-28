import { LogOut, Moon, Search, Sun } from 'lucide-react'
import { isOn, menuFor } from './lib/menu'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { CommandPalette } from './components/CommandPalette'
import { ErrorBox, Loading } from './components/ui'
import { navigate, useRoute } from './lib/route'
import { admin, pokeAlerts, SESSION_ENDED, stageName, supabase, supabaseConfigured, supabaseUrl } from './lib/supabase'
import { stageOf } from './lib/releases'
import { useTheme } from './lib/theme'
import { useLoad } from './lib/useLoad'
import type { Me, WhoAmI } from './lib/types'
import { Admins } from './pages/Admins'
import { AuditLog } from './pages/AuditLog'
import { BrandPage } from './pages/Brand'
import { BusinessTileEdit } from './pages/BusinessTileEdit'
import { BusinessTypes } from './pages/BusinessTypes'
import { Customer360 } from './pages/Customer360'
import { Connections } from './pages/Connections'
import { Customers } from './pages/Customers'
import { Dashboard } from './pages/Dashboard'
import { Issues } from './pages/Issues'
import { Leads } from './pages/Leads'
import { Selling } from './pages/Selling'
import { Costs } from './pages/Costs'
import { Numbers } from './pages/Numbers'
import { Plans } from './pages/Plans'
import { Releases } from './pages/Releases'
import { PlanEdit } from './pages/PlanEdit'
import { SignIn } from './pages/SignIn'
import { Site } from './pages/Site'
import { HelpWords } from './pages/HelpWords'
import { Support } from './pages/Support'
import { TestData } from './pages/TestData'
import { DemoStores } from './pages/DemoStores'
import { AiTaste } from './pages/AiTaste'

type Stage = { kind: 'loading' } | { kind: 'signed_out'; notice?: string } | { kind: 'ok'; me: Me } | { kind: 'error'; message: string }

const ENDED_NOTICES: Record<string, string> = {
  idle: 'You were signed out after 30 minutes without activity.',
  expired: 'Your admin session has ended. Please sign in again.',
  admin_session_expired: 'Your admin session has ended. Please sign in again.',
  not_admin: 'That Google account is not on the BOAI admin list.',
  not_found: 'That Google account is not on the BOAI admin list.',
  signed_out: '',
}

export default function App() {
  const [stage, setStage] = useState<Stage>({ kind: 'loading' })

  const signOut = useCallback(async (why = 'signed_out', tellDatabase = false) => {
    if (tellDatabase) await admin('sign_out').catch(() => {})
    await supabase.auth.signOut().catch(() => {})
    setStage({ kind: 'signed_out', notice: ENDED_NOTICES[why] || undefined })
  }, [])

  const check = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) { setStage((s) => (s.kind === 'signed_out' ? s : { kind: 'signed_out' })); return }
    try {
      const who = await admin<WhoAmI>('whoami')
      if (who.status === 'ok') { setStage({ kind: 'ok', me: who }); pokeAlerts(); return }
      if (who.status === 'not_admin') pokeAlerts()
      await signOut(who.status)
    } catch (error) {
      setStage({ kind: 'error', message: error instanceof Error ? error.message : 'Couldn’t reach BOAI.' })
    }
  }, [signOut])

  useEffect(() => {
    // Back from Google: the sign-in code in the address is exchanged first (getSession waits for it).
    void check()
    const ended = (event: Event) => {
      const code = (event as CustomEvent<string>).detail
      void signOut(code)
    }
    window.addEventListener(SESSION_ENDED, ended)
    return () => window.removeEventListener(SESSION_ENDED, ended)
  }, [check, signOut])

  if (!supabaseConfigured) return <main className="auth"><div className="auth-card"><ErrorBox message="Supabase isn’t configured: copy .env.example to .env." /></div></main>
  if (stage.kind === 'loading') return <main className="auth"><Loading /></main>
  if (stage.kind === 'error') return <main className="auth"><div className="auth-card"><ErrorBox message={stage.message} onRetry={check} /><button type="button" className="text-button" onClick={() => signOut()}>Sign out</button></div></main>
  if (stage.kind === 'signed_out') return <SignIn notice={stage.notice} />
  return <Shell me={stage.me} onSignOut={(why) => signOut(why, why !== 'expired')} />
}

function Shell({ me, onSignOut }: { me: Me; onSignOut: (why: string) => void }) {
  const route = useRoute()
  const { theme, toggle } = useTheme()
  const [palette, setPalette] = useState(false)
  const lastActive = useRef(0)
  const waiting = useLoad(() => admin<{ waiting: number; stuck: number }>('issues_waiting'), `${route.page}|${'id' in route ? route.id : ''}`)
  const asking = useLoad(() => me.role !== 'finance' ? admin<{ requests: unknown[] }>('support_requests') : Promise.resolve({ requests: [] }), `${route.page}|${'id' in route ? route.id : ''}`)

  // Signs out after 30 idle minutes (the database refuses the session then too), and at the 12-hour end.
  useEffect(() => {
    const touch = () => { lastActive.current = Date.now() }
    touch()
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((name) => window.addEventListener(name, touch, { passive: true }))
    const timer = window.setInterval(() => {
      if (Date.now() - lastActive.current > me.idleMinutes * 60000) onSignOut('idle')
      else if (Date.now() > new Date(me.sessionEndsAt).getTime()) onSignOut('expired')
    }, 20000)
    return () => { events.forEach((name) => window.removeEventListener(name, touch)); window.clearInterval(timer) }
  }, [me, onSignOut])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPalette((open) => !open) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const items = menuFor(me.role, stageOf(supabaseUrl, stageName))
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">BOAI <span>Admin</span></div>
        <nav aria-label="Main">
          {items.map(({ route: target, label, icon: Icon, group }, index) => (<Fragment key={label}>
            {group && group !== items[index - 1]?.group && <div className="nav-group">{group}</div>}
            <a href={`#/${target.page}`} className={`nav-item ${isOn(route, target) ? 'is-on' : ''}`} aria-current={isOn(route, target) ? 'page' : undefined}>
              <Icon size={18} aria-hidden="true" /> <span>{label}</span>
              {target.page === 'issues' && waiting.data && waiting.data.waiting + waiting.data.stuck > 0 && <span className={`badge badge-${waiting.data.stuck ? 'critical' : 'accent'} nav-count`}>{waiting.data.stuck ? `${waiting.data.stuck} stuck` : waiting.data.waiting}</span>}
              {target.page === 'support' && asking.data && asking.data.requests.length > 0 && <span className="badge badge-accent nav-count">{asking.data.requests.length}</span>}
            </a>
          </Fragment>))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <button type="button" className="search-button" onClick={() => setPalette(true)}><Search size={16} aria-hidden="true" /> <span>Search</span> <kbd>⌘K</kbd></button>
          <div className="topbar-side">
            <button type="button" className="icon-button" onClick={toggle} aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
            <span className="who" title={me.email}><span className="who-email">{me.email}</span> <span className="badge badge-neutral">{me.role}</span></span>
            <button type="button" className="icon-button" onClick={() => onSignOut('signed_out')} aria-label="Sign out" title="Sign out"><LogOut size={18} /></button>
          </div>
        </header>
        <main className="content">
          {route.page === 'dashboard' && <Dashboard role={me.role} />}
          {route.page === 'customers' && <Customers state={route.state} addOn={route.addOn} addOnName={route.addOnName} />}
          {route.page === 'customer' && <Customer360 id={route.id} canSupport={me.role !== 'finance'} canDelete={me.role === 'owner'} canGiveCredits={me.role !== 'support'} />}
          {route.page === 'support' && (me.role !== 'finance' ? <Support /> : <ErrorBox message="Only the owner and support roles open a business in Support mode." />)}
          {route.page === 'leads' && <Leads id={route.id} />}
          {route.page === 'issues' && <Issues id={route.id} />}
          {route.page === 'packages' && (me.role !== 'support' ? <Selling /> : <ErrorBox message="Selling is for the owner and finance roles." />)}
          {route.page === 'selling' && (me.role !== 'support' ? <Selling /> : <ErrorBox message="Selling is for the owner and finance roles." />)}
          {route.page === 'costs' && (me.role !== 'support' ? <Costs /> : <ErrorBox message="Costs is for the owner and finance roles." />)}
          {route.page === 'numbers' && (me.role !== 'support' ? <Numbers /> : <ErrorBox message="Numbers is for the owner and finance roles." />)}
          {route.page === 'plans' && (me.role !== 'support' ? (route.id ? <PlanEdit key={route.id} code={route.id} /> : <Plans />) : <ErrorBox message="Plans and prices are for the owner and finance roles." />)}
          {route.page === 'types' && (route.id ? <BusinessTileEdit key={route.id} id={route.id} canEdit={me.role !== 'support'} /> : <BusinessTypes canEdit={me.role !== 'support'} />)}
          {route.page === 'site' && (me.role === 'owner' ? <Site /> : <ErrorBox message="Only the owner role changes the public website." />)}
          {route.page === 'brand' && (me.role === 'owner' ? <BrandPage /> : <ErrorBox message="Only the owner role changes the app name and logo." />)}
          {route.page === 'help' && (me.role === 'owner' ? <HelpWords /> : <ErrorBox message="Only the owner role changes the help words." />)}
          {route.page === 'connections' && (me.role === 'owner' ? <Connections /> : <ErrorBox message="Only the owner role sees the connections." />)}
          {route.page === 'releases' && (me.role === 'owner' ? <Releases /> : <ErrorBox message="Only the owner role moves code between stages." />)}
          {route.page === 'aitaste' && (me.role !== 'support' ? <AiTaste /> : <ErrorBox message="AI free taste is for the owner and finance roles." />)}
          {route.page === 'testdata' && (me.role !== 'finance' ? <TestData role={me.role} /> : <ErrorBox message="Test data is for the owner and support roles." />)}
          {route.page === 'demostores' && <DemoStores role={me.role} />}
          {route.page === 'audit' && (me.role === 'owner' ? <AuditLog /> : <ErrorBox message="Only the owner role sees the audit log." />)}
          {route.page === 'admins' && (me.role === 'owner' ? <Admins /> : <ErrorBox message="Only the owner role manages admins." />)}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Main">
        {items.map(({ route: target, label, icon: Icon }) => (
          <button type="button" key={label} className={isOn(route, target) ? 'is-on' : ''} onClick={() => navigate(target)}><Icon size={20} aria-hidden="true" /><span>{label}</span></button>
        ))}
      </nav>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  )
}
