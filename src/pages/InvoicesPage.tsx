import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db, useSettings } from '../db'
import { calcTotals, displayStatus, formatDate, formatMoney, todayISO, type DisplayStatus } from '../lib/invoice'
import { Card, PageHeader, StatusBadge, inputCls } from '../components/ui'

const filters: Array<'all' | DisplayStatus> = ['all', 'draft', 'sent', 'overdue', 'paid']

export default function InvoicesPage() {
  const settings = useSettings()
  const invoices = useLiveQuery(() => db.invoices.orderBy('issueDate').reverse().toArray(), [])
  const [filter, setFilter] = useState<(typeof filters)[number]>('all')
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  const rows = useMemo(
    () => (invoices ?? []).map((inv) => ({ inv, status: displayStatus(inv), total: calcTotals(inv).total })),
    [invoices],
  )

  if (!settings || !invoices) return null
  const cur = settings.currency
  const month = todayISO().slice(0, 7)
  const inCur = rows.filter((r) => r.inv.currency === cur)
  const outstanding = inCur.filter((r) => r.status === 'sent' || r.status === 'overdue').reduce((a, r) => a + r.total, 0)
  const overdue = inCur.filter((r) => r.status === 'overdue')
  const paidMonth = inCur.filter((r) => r.status === 'paid' && r.inv.paidAt?.startsWith(month)).reduce((a, r) => a + r.total, 0)

  const needle = q.trim().toLowerCase()
  const visible = rows.filter(
    (r) =>
      (filter === 'all' || r.status === filter) &&
      (!needle || [r.inv.number, r.inv.client.name, r.inv.client.company].some((s) => s.toLowerCase().includes(needle))),
  )

  return (
    <>
      <PageHeader title="Invoices" />

      {!settings.businessName && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Add your business name, logo and payment details in{' '}
          <Link to="/settings" className="font-medium underline">
            Settings
          </Link>{' '}
          so they appear on your invoices.
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Outstanding" value={formatMoney(outstanding, cur)} />
        <Stat label="Overdue" value={formatMoney(overdue.reduce((a, r) => a + r.total, 0), cur)} sub={`${overdue.length} invoice${overdue.length === 1 ? '' : 's'}`} tone="red" />
        <Stat label="Paid this month" value={formatMoney(paidMonth, cur)} tone="green" />
      </div>

      {invoices.length === 0 ? (
        <Card className="py-14 text-center">
          <div className="text-lg font-medium text-slate-900">No invoices yet</div>
          <p className="mt-1 text-sm text-slate-500">Create your first invoice — it takes about a minute.</p>
          <Link to="/invoices/new" className="mt-5 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            + New invoice
          </Link>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
            <div className="flex gap-1 overflow-x-auto">
              {filters.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${filter === f ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <input className={`${inputCls} sm:ml-auto sm:w-64`} placeholder="Search number or client…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Number</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Issued</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ inv, status, total }) => (
                  <tr key={inv.id} onClick={() => navigate(`/invoices/${inv.id}`)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{inv.number}</td>
                    <td className="px-4 py-3">{inv.client.name || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(inv.issueDate)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(inv.dueDate)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-900">{formatMoney(total, inv.currency)}</td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      No invoices match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'red' | 'green' }) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-emerald-600' : 'text-slate-900'
  return (
    <Card>
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </Card>
  )
}
