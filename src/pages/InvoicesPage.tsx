import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Clock, FileText, Plus, Search, type LucideIcon } from 'lucide-react'
import { db, useSettings } from '../db'
import { calcTotals, displayStatus, formatDate, formatMoney, todayISO, type DisplayStatus } from '../lib/invoice'
import { PageHeader, StatusBadge, initials, inputCls } from '../components/ui'

const filters: Array<'all' | DisplayStatus> = ['all', 'draft', 'sent', 'overdue', 'paid']

export default function InvoicesPage() {
  const settings = useSettings()
  const invoices = useLiveQuery(() => db.invoices.orderBy('issueDate').reverse().toArray(), [])
  const [params] = useSearchParams()
  const [filter, setFilter] = useState<(typeof filters)[number]>('all')
  const [q, setQ] = useState(params.get('q') ?? '')
  const navigate = useNavigate()

  // Sidebar search navigates here with ?q=
  useEffect(() => setQ(params.get('q') ?? ''), [params])

  const rows = useMemo(
    () => (invoices ?? []).map((inv) => ({ inv, status: displayStatus(inv), total: calcTotals(inv).total })),
    [invoices],
  )

  if (!settings || !invoices) return null
  const cur = settings.currency
  const month = todayISO().slice(0, 7)
  const inCur = rows.filter((r) => r.inv.currency === cur)
  const outstanding = inCur.filter((r) => r.status === 'sent' || r.status === 'overdue')
  const overdue = inCur.filter((r) => r.status === 'overdue')
  const paidMonth = inCur.filter((r) => r.status === 'paid' && r.inv.paidAt?.startsWith(month))
  const sum = (xs: typeof rows) => xs.reduce((a, r) => a + r.total, 0)
  const count = (n: number) => `${n} invoice${n === 1 ? '' : 's'}`

  const needle = q.trim().toLowerCase()
  const visible = rows.filter(
    (r) =>
      (filter === 'all' || r.status === filter) &&
      (!needle || [r.inv.number, r.inv.client.name, r.inv.client.company].some((s) => s.toLowerCase().includes(needle))),
  )

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Track, manage and get paid for your work."
        actions={
          <Link to="/invoices/new" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700">
            <Plus className="h-4 w-4" /> New Invoice
          </Link>
        }
      />

      {!settings.businessName && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Add your business name, logo and payment details in{' '}
            <Link to="/settings" className="font-semibold underline">
              Settings
            </Link>{' '}
            so they appear on your invoices.
          </span>
        </div>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={FileText} label="Total invoices" value={String(invoices.length)} sub={`${rows.filter((r) => r.status === 'draft').length} drafts`} />
        <Stat icon={Clock} label="Outstanding" value={formatMoney(sum(outstanding), cur)} sub={count(outstanding.length)} tone="blue" />
        <Stat icon={AlertCircle} label="Overdue" value={formatMoney(sum(overdue), cur)} sub={count(overdue.length)} tone="red" />
        <Stat icon={CheckCircle2} label="Paid this month" value={formatMoney(sum(paidMonth), cur)} sub={count(paidMonth.length)} tone="green" />
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 py-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <FileText className="h-6 w-6" />
          </div>
          <div className="text-lg font-semibold text-zinc-900">No invoices yet</div>
          <p className="mt-1 text-sm text-zinc-500">Create your first invoice — it takes about a minute.</p>
          <Link to="/invoices/new" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> New Invoice
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200">
          <div className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex gap-1 overflow-x-auto rounded-lg bg-zinc-100 p-1">
              {filters.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${filter === f ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="relative sm:ml-auto sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input className={`${inputCls} py-2 pl-9`} placeholder="Search number or client…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Invoice</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Issued</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {visible.map(({ inv, status, total }) => (
                  <tr key={inv.id} onClick={() => navigate(`/invoices/${inv.id}`)} className="cursor-pointer hover:bg-zinc-50">
                    <td className="whitespace-nowrap px-4 py-3.5 font-medium text-zinc-900">{inv.number}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
                          {initials(inv.client.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-zinc-900">{inv.client.name || '—'}</span>
                          {inv.client.company && <span className="block truncate text-xs text-zinc-500">{inv.client.company}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-zinc-500">{formatDate(inv.issueDate)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-zinc-500">{formatDate(inv.dueDate)}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-zinc-900">{formatMoney(total, inv.currency)}</td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-zinc-500">
                      No invoices match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

const tones = {
  default: 'bg-zinc-100 text-zinc-600',
  blue: 'bg-blue-50 text-blue-600',
  red: 'bg-red-50 text-red-600',
  green: 'bg-emerald-50 text-emerald-600',
}

function Stat({ icon: Icon, label, value, sub, tone = 'default' }: { icon: LucideIcon; label: string; value: string; sub?: string; tone?: keyof typeof tones }) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-5">
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="text-sm font-medium text-zinc-500">{label}</span>
      </div>
      <div className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  )
}
