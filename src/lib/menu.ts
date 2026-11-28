import { Database, Store, Sparkles, TrendingUp, Wallet, Grid3x3, Tags, Type, BarChart3, Bug, Globe, Layers, Inbox, LifeBuoy, Plug, ScrollText, Rocket, ShieldCheck, Users, BookOpen } from 'lucide-react'
import type { Route } from './route'
import type { Stage } from './releases'

// The menu in groups, A to Z inside each group (owner 2026-11-11). Dashboard stays on top as the home page.
export type NavItem = { route: Route; label: string; icon: typeof BarChart3; group: string; ownerOnly?: boolean; noSupport?: boolean; noFinance?: boolean; stages?: Stage[] }
export const NAV: NavItem[] = [
  { route: { page: 'dashboard' }, label: 'Dashboard', icon: BarChart3, group: '' },
  { route: { page: 'customers' }, label: 'Customers', icon: Users, group: 'Customers' },
  { route: { page: 'leads' }, label: 'Leads', icon: Inbox, group: 'Customers' },
  { route: { page: 'issues' }, label: 'Problems', icon: Bug, group: 'Customers' },
  { route: { page: 'support' }, label: 'Support', icon: LifeBuoy, group: 'Customers', noFinance: true },
  // V119 (Admin board H7tJ8eg1zwWM4UV8Pii6Ub): the Selling group in the board's order. Packages (V105) and Lures (V98) are gone;
  // Plans & prices is back in the menu right under Selling (BROKEN-11, owner 2026-11-24: "I need the Plans page"; the Selling
  // grid is hard to use for setting plans and what the landing page shows). Selling's button and plan names still open it too.
  { route: { page: 'selling' }, label: 'Selling', icon: Grid3x3, group: 'Selling', noSupport: true },
  { route: { page: 'plans' }, label: 'Plans & prices', icon: Tags, group: 'Selling', noSupport: true },
  // ML-6: the AI packs' free weekly taste (on / off, free rows, day), owner + finance.
  { route: { page: 'aitaste' }, label: 'AI free taste', icon: Sparkles, group: 'Selling', noSupport: true },
  // V113: which lock works (seen → tapped → bought), owner + finance.
  { route: { page: 'numbers' }, label: 'Numbers', icon: TrendingUp, group: 'Selling', noSupport: true },
  // V116: what running BOAI costs, per plan (owner + finance).
  { route: { page: 'costs' }, label: 'Costs', icon: Wallet, group: 'Selling', noSupport: true },
  { route: { page: 'types' }, label: 'Business types', icon: Layers, group: 'Selling' },
  // Test data (owner 2026-11-24): only the PROD Admin (tower: Build, DEV, SIT, UAT) and the Build Admin (Build) make test logins.
  { route: { page: 'testdata' }, label: 'Test data', icon: Database, group: 'Data', noFinance: true, stages: ['prod', 'build'] },
  // DEMO-1 (board AdminDemo): the landing's demo stores, on every stage (the database refuses making them where they don't live).
  { route: { page: 'demostores' }, label: 'Demo stores', icon: Store, group: 'Data' },
  { route: { page: 'admins' }, label: 'Admins', icon: ShieldCheck, group: 'Setup', ownerOnly: true },
  { route: { page: 'audit' }, label: 'Audit log', icon: ScrollText, group: 'Setup', ownerOnly: true },
  { route: { page: 'connections' }, label: 'Connections', icon: Plug, group: 'Setup', ownerOnly: true },
  // V90: move code Dev → SIT → UAT → PROD (owner only).
  { route: { page: 'releases' }, label: 'Releases', icon: Rocket, group: 'Setup', ownerOnly: true },
  { route: { page: 'site' }, label: 'Public website', icon: Globe, group: 'Setup', ownerOnly: true },
  { route: { page: 'brand' }, label: 'App name & logo', icon: Type, group: 'Setup', ownerOnly: true },
  { route: { page: 'help' }, label: 'Help words', icon: BookOpen, group: 'Setup', ownerOnly: true },
]

export const isOn = (current: Route, item: Route) => current.page === item.page || (item.page === 'customers' && current.page === 'customer')


/** The menu for this admin's role on this stage. */
export const menuFor = (role: string, here: Stage | null) => NAV.filter((item) => (!item.ownerOnly || role === 'owner') && (!item.noSupport || role !== 'support')
  && (!item.noFinance || role !== 'finance') && (!item.stages || (here !== null && item.stages.includes(here))))
