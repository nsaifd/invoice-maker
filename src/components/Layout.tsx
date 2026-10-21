import { useEffect, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CheckCircle2, Cloud, CloudOff, FileSignature, FileText, Menu, Package, Palette, Repeat, Search, Settings, Users, X, type LucideIcon } from 'lucide-react'
import { runRecurring } from '../lib/recurring'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, useSettings } from '../db'
import { timeAgo } from '../lib/share'
import { useSyncStatus, type SyncStatus } from '../lib/sync'
import { initials } from './ui'

const menu: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
  { to: '/', label: 'Invoices', icon: FileText, end: true },
  { to: '/proposals', label: 'Proposals', icon: FileSignature },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/templates', label: 'Templates', icon: Palette },
]

export function Layout() {
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState('')
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])

  // Create any recurring invoices that came due while the app was closed.
  useEffect(() => {
    runRecurring()
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
  const settings = useSettings()
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

      <div className="mt-auto space-y-1 border-t border-zinc-200 pt-4">
        <NavLink to="/settings" className={item}>
          <Settings className="h-[18px] w-[18px]" />
          Settings
        </NavLink>
        <AccountCard />
        <Link to="/settings" className="mt-2 flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-xs hover:bg-zinc-50">
          {settings?.logo ? (
            <img src={settings.logo} alt="" className="h-9 w-9 shrink-0 rounded-full border border-zinc-100 object-contain" />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
              {initials(settings?.businessName || 'My Business')}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-zinc-900">{settings?.businessName || 'Set up business'}</span>
            <span className="block truncate text-xs text-zinc-500">{settings?.email || 'Add your details'}</span>
          </span>
        </Link>
      </div>
    </div>
  )
}

/** Sync state as a colored dot and a short label. */
export function SyncBadge({ status }: { status: SyncStatus }) {
  const map: Record<SyncStatus['state'], [string, string]> = {
    loading: ['bg-zinc-300', 'Checking…'],
    signedOut: ['bg-zinc-300', 'Only on this device'],
    syncing: ['bg-blue-500 animate-pulse', 'Syncing…'],
    synced: ['bg-emerald-500', status.lastSync ? `Synced ${timeAgo(status.lastSync)}` : 'Synced'],
    offline: ['bg-amber-500', status.pending ? `Offline · ${status.pending} to sync` : 'Offline'],
    error: ['bg-red-500', 'Sync problem'],
  }
  const [dot, label] = map[status.state]
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-zinc-500">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span className="truncate">{label}</span>
    </span>
  )
}

function AccountCard() {
  const status = useSyncStatus()
  if (status.state === 'loading') return null
  if (!status.user && status.error)
    return (
      <Link to="/login" className="mt-3 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm hover:bg-amber-100/70">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
          <CloudOff className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-amber-900">Session expired</span>
          <span className="block text-xs text-amber-800">Log in to keep syncing</span>
        </span>
      </Link>
    )
  if (!status.user)
    return (
      <Link to="/signup" className="mt-3 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm hover:bg-blue-100/70">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2E5AF5] text-white">
          <Cloud className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-blue-900">Sync across devices</span>
          <span className="block text-xs text-blue-700">Create a free account</span>
        </span>
      </Link>
    )
  return (
    <Link to="/settings#account" className="mt-3 flex items-center gap-3 rounded-xl p-2 hover:bg-white/70" title={status.error ?? undefined}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2E5AF5] text-xs font-semibold uppercase text-white">{status.user.email[0]}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-zinc-900">{status.user.email}</span>
        <SyncBadge status={status} />
      </span>
    </Link>
  )
}

/** Nudges people who keep data only in this browser to create an account. */
function SyncBanner() {
  const status = useSyncStatus()
  const count = useLiveQuery(async () => (await db.invoices.count()) + (await db.proposals.count()), []) ?? 0
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem('involet.hideSyncBanner') === '1'
    } catch {
      return false
    }
  })
  if (status.state === 'loading') return null
  // Problems (expired session, sync errors) are always shown; the sign-up nudge can be dismissed.
  if (status.error || status.user || count === 0 || hidden) {
    if (!status.error) return null
    return (
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <CloudOff className="h-4 w-4 shrink-0" />
        <span className="flex-1">{status.error}</span>
        {!status.user && (
          <Link to="/login" className="font-semibold underline">
            Log in
          </Link>
        )}
      </div>
    )
  }
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      <Cloud className="h-4 w-4 shrink-0" />
      <span className="min-w-48 flex-1">
        <b>Your data is only saved in this browser.</b> Create a free account to use it on your phone and other computers — and never lose it.
      </span>
      <div className="flex items-center gap-2">
        <Link to="/signup" className="rounded-lg bg-[#2E5AF5] px-3 py-1.5 font-medium text-white hover:bg-blue-700">
          Create account
        </Link>
        <Link to="/login" className="rounded-lg px-3 py-1.5 font-medium text-blue-800 hover:bg-blue-100">
          Log in
        </Link>
        <button
          type="button"
          aria-label="Dismiss"
          className="rounded-md p-1 text-blue-700 hover:bg-blue-100"
          onClick={() => {
            setHidden(true)
            try {
              sessionStorage.setItem('involet.hideSyncBanner', '1')
            } catch {
              /* preference only */
            }
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
