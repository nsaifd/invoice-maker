import { Link, NavLink, Outlet } from 'react-router-dom'

const nav = [
  { to: '/', label: 'Invoices', end: true },
  { to: '/clients', label: 'Clients' },
  { to: '/products', label: 'Products' },
  { to: '/settings', label: 'Settings' },
]

export function Layout() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            InvoiceKit
          </Link>
          <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <Link to="/invoices/new" className="ml-auto rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-xs hover:bg-blue-700">
            + New invoice
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
