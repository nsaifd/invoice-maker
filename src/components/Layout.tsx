import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Building2,
  CheckCircle2,
  ChevronsUpDown,
  CloudOff,
  FileSignature,
  FileText,
  Loader2,
  LogOut,
  Menu,
  Package,
  Palette,
  RefreshCw,
  Repeat,
  Search,
  Settings,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { runRecurring } from '../lib/recurring'
import { useSettings } from '../db'
import { timeAgo } from '../lib/share'
import { confirmSignOut, deviceHasAccount, syncNow, syncReady, useSyncStatus, type SyncStatus } from '../lib/sync'
import { initials } from './ui'

const menu: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
  { to: '/', label: 'Invoices', icon: FileText, end: true },
  { to: '/proposals', label: 'Proposals', icon: FileSignature },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/templates', label: 'Templates', icon: Palette },
]

/**
 * The app needs an account. Anyone not logged in goes to the login page first; once logged in,
 * the app opens straight to the dashboard. Someone who has logged in on this device before keeps
 * working while offline.
 */
export function Layout() {
  const status = useSyncStatus()
  const location = useLocation()
  if (status.state === 'loading') return <Splash />
  if (!status.user && (status.state === 'signedOut' || !deviceHasAccount()))
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />
  return <AppShell />
}

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white">
      <img src="/logo.svg" alt="Involet" className="h-9 w-auto" />
      <Loader2 className="h-5 w-5 animate-spin text-zinc-400" aria-label="Loading" />
    </div>
  )
}

function AppShell() {
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState('')
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])

  // Create any recurring invoices that came due while the app was closed.
  useEffect(() => {
    syncReady
      .then(runRecurring)
      .then((n) => {
        if (!n) return
        setToast(`${n} recurring invoice${n === 1 ? ' was' : 's were'} created as draft${n === 1 ? '' : 's'}.`)
        setTimeout(() => setToast(''), 6000)
      })
      .catch(console.error)
  }, [])

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block print:hidden">
        <Sidebar />
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-200 bg-zinc-100/90 px-4 py-3 backdrop-blur lg:hidden print:hidden">
        <Brand />
        <button type="button" aria-label="Open menu" className="rounded-lg p-2 text-zinc-600 hover:bg-white" onClick={() => setOpen(true)}>
          <Menu className="h-5 w-5" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-zinc-900/40" />
          <div className="absolute inset-y-0 left-0 w-72 bg-zinc-100 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" aria-label="Close menu" className="absolute right-3 top-4 rounded-lg p-1.5 text-zinc-500 hover:bg-white" onClick={() => setOpen(false)}>
              <X className="h-5 w-5" />
            </button>
            <Sidebar />
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" /> {toast}
        </div>
      )}

      <main className="min-w-0 flex-1 lg:py-3 lg:pr-3">
        <div className="min-h-[calc(100vh-1.5rem)] bg-white px-4 py-6 sm:px-8 sm:py-8 lg:rounded-2xl lg:border lg:border-zinc-200">
          <SyncBanner />
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function Brand() {
  return (
    <Link to="/" className="flex items-center" aria-label="Involet home">
      <img src="/logo.svg" alt="Involet" className="h-8 w-auto" />
    </Link>
  )
}

function Sidebar() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  function search(e: FormEvent) {
    e.preventDefault()
    navigate(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : '/')
  }

  const item = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
      isActive ? 'border border-zinc-200 bg-white text-zinc-900 shadow-xs' : 'border border-transparent text-zinc-600 hover:bg-white/70 hover:text-zinc-900'
    }`

  return (
    <div className="flex h-full flex-col px-4 py-5">
      <Brand />

      <form onSubmit={search} className="relative mt-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search invoices"
          className="w-full rounded-lg border border-zinc-200 bg-white/70 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-zinc-400 focus:border-blue-500 focus:bg-white"
        />
      </form>

      <div className="mb-2 mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Menu</div>
      <nav className="space-y-1">
        {menu.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={item}>
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-zinc-200 pt-4">
        <ProfileMenu />
      </div>
    </div>
  )
}

/** One place for the business profile, settings, account and sync status, and logging out. */
function ProfileMenu() {
  const settings = useSettings()
  const status = useSyncStatus()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const name = settings?.businessName || 'Set up your business'
  const avatar = (size: string) =>
    settings?.logo ? (
      <img src={settings.logo} alt="" className={`${size} shrink-0 rounded-full border border-zinc-100 bg-white object-contain`} />
    ) : (
      <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white`}>{initials(settings?.businessName || status.user?.email || 'Me')}</span>
    )

  async function logOut() {
    setBusy(true)
    if (await confirmSignOut()) navigate('/login', { replace: true })
    else setBusy(false)
  }

  const row = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
  return (
    <div ref={ref} className="relative">
      {open && (
        <div role="menu" className="absolute inset-x-0 bottom-full z-30 mb-2 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg shadow-zinc-900/10">
          <div className="flex items-center gap-3 px-2.5 pb-2.5 pt-2">
            {avatar('h-10 w-10')}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-900">{name}</div>
              <div className="truncate text-xs text-zinc-500">{status.user?.email ?? 'Offline'}</div>
            </div>
          </div>
          <div className="border-t border-zinc-100 pt-1.5">
            <Link role="menuitem" to="/settings#business" className={row}>
              <Building2 className="h-4 w-4 text-zinc-400" /> Business profile
            </Link>
            <Link role="menuitem" to="/settings#account" className={row}>
              <UserCog className="h-4 w-4 text-zinc-400" /> Account & security
            </Link>
            <Link role="menuitem" to="/settings" className={row}>
              <Settings className="h-4 w-4 text-zinc-400" /> Settings
            </Link>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-zinc-100 px-2.5 pb-1 pt-2.5">
            <SyncBadge status={status} />
            {status.user && (
              <button type="button" aria-label="Sync now" title="Sync now" disabled={status.state === 'syncing'} onClick={() => syncNow()} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50">
                <RefreshCw className={`h-3.5 w-3.5 ${status.state === 'syncing' ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
          <div className="mt-1.5 border-t border-zinc-100 pt-1.5">
            <button role="menuitem" type="button" disabled={busy} onClick={logOut} className={`${row} text-red-600 hover:bg-red-50 hover:text-red-700`}>
              <LogOut className="h-4 w-4" /> {busy ? 'Logging out…' : 'Log out'}
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-3 rounded-xl border bg-white p-2.5 text-left shadow-xs transition hover:bg-zinc-50 ${open ? 'border-zinc-300' : 'border-zinc-200'}`}
      >
        <span className="relative">
          {avatar('h-9 w-9')}
          <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${dotColor(status)}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-zinc-900">{name}</span>
          {/* Normally your email; while offline or when sync fails, that instead. */}
          {status.state === 'offline' || status.state === 'error' ? <SyncBadge status={status} /> : <span className="block truncate text-xs text-zinc-500">{status.user?.email}</span>}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-zinc-400" />
      </button>
    </div>
  )
}

const dotColor = (status: SyncStatus) =>
  ({ loading: 'bg-zinc-300', signedOut: 'bg-zinc-300', syncing: 'bg-blue-500 animate-pulse', synced: 'bg-emerald-500', offline: 'bg-amber-500', error: 'bg-red-500' })[status.state]

/** Sync state as a colored dot and a short label. */
export function SyncBadge({ status }: { status: SyncStatus }) {
  const labels: Record<SyncStatus['state'], string> = {
    loading: 'Checking…',
    signedOut: 'Not syncing',
    syncing: 'Syncing…',
    synced: status.lastSync ? `Synced ${timeAgo(status.lastSync)}` : 'Synced',
    offline: status.pending ? `Offline · ${status.pending} to sync` : 'Offline',
    error: 'Sync problem',
  }
  const label = labels[status.state]
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-zinc-500">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor(status)}`} />
      <span className="truncate">{label}</span>
    </span>
  )
}

/** Sync problems are shown above every page until they're resolved. */
function SyncBanner() {
  const status = useSyncStatus()
  if (!status.error) return null
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <CloudOff className="h-4 w-4 shrink-0" />
      <span className="flex-1">{status.error}</span>
      <button type="button" className="font-semibold underline" onClick={() => syncNow()}>
        Try again
      </button>
    </div>
  )
}
