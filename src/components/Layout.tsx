import { useEffect, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { FileText, Menu, Package, Search, Settings, Users, X, type LucideIcon } from 'lucide-react'
import { useSettings } from '../db'
import { initials } from './ui'

const menu: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
  { to: '/', label: 'Invoices', icon: FileText, end: true },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/products', label: 'Products', icon: Package },
]

export function Layout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])

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

      <main className="min-w-0 flex-1 lg:py-3 lg:pr-3">
        <div className="min-h-[calc(100vh-1.5rem)] bg-white px-4 py-6 sm:px-8 sm:py-8 lg:rounded-2xl lg:border lg:border-zinc-200">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-900">
      <img src="/favicon.svg" alt="" className="h-7 w-7" />
      InvoiceKit
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
        <Link to="/settings" className="mt-3 flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-xs hover:bg-zinc-50">
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
