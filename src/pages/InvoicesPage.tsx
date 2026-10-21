import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, BellRing, CheckCircle2, Clock, FileText, Mail, MessageCircle, Plus, Search, type LucideIcon } from 'lucide-react'
import { db, useSettings, type Currency } from '../db'
import { addDays, calcTotals, displayStatus, formatDate, formatMoney, todayISO, type DisplayStatus } from '../lib/invoice'
import { openReminder } from '../lib/recurring'
import { shareUrl, timeAgo } from '../lib/share'
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
  const outstanding = rows.filter((r) => r.status === 'sent' || r.status === 'overdue')
  const overdue = rows.filter((r) => r.status === 'overdue')
  const paidMonth = rows.filter((r) => r.status === 'paid' && r.inv.paidAt?.startsWith(month))
  const sum = (xs: typeof rows) => xs.filter((r) => r.inv.currency === cur).reduce((a, r) => a + r.total, 0)
  // Amounts in other currencies can't be added together, so they're listed separately.
  const others = (xs: typeof rows) => {
    const by = new Map<Currency, number>()
    for (const r of xs) if (r.inv.currency !== cur) by.set(r.inv.currency, (by.get(r.inv.currency) ?? 0) + r.total)
    return [...by].map(([c, t]) => `+ ${formatMoney(t, c)}`)
  }
  const count = (n: number) => `${n} invoice${n === 1 ? '' : 's'}`

  const soon = addDays(todayISO(), 3)
  const attention = rows.filter((r) => r.status === 'overdue' || (r.status === 'sent' && r.inv.dueDate <= soon)).sort((a, b) => a.inv.dueDate.localeCompare(b.inv.dueDate))

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
        <Stat icon={Clock} label="Outstanding" value={formatMoney(sum(outstanding), cur)} extra={others(outstanding)} sub={count(outstanding.length)} tone="blue" />
        <Stat icon={AlertCircle} label="Overdue" value={formatMoney(sum(overdue), cur)} extra={others(overdue)} sub={count(overdue.length)} tone="red" />
        <Stat icon={CheckCircle2} label="Paid this month" value={formatMoney(sum(paidMonth), cur)} extra={others(paidMonth)} sub={count(paidMonth.length)} tone="green" />
      </div>

      {attention.length > 0 && (
        <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/40">
          <div className="flex items-center gap-2 px-5 pt-4 font-semibold text-zinc-900">
            <BellRing className="h-4 w-4 text-amber-600" /> Needs attention
            <span className="text-xs font-normal text-zinc-500">overdue or due in the next 3 days</span>
          </div>
          <div className="divide-y divide-amber-100 px-5 pb-2">
            {attention.slice(0, 6).map(({ inv, status, total }) => {
              const last = inv.reminders?.at(-1)
              const link = inv.share ? shareUrl(inv.share.id) : undefined
              return (
                <div key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm">
                  <Link to={`/invoices/${inv.id}`} className="min-w-40 flex-1">
                    <span className="font-medium text-zinc-900">{inv.client.name}</span>
                    <span className="ml-2 text-zinc-500">{inv.number}</span>
                    <span className={`block text-xs ${status === 'overdue' ? 'text-red-600' : 'text-amber-700'}`}>
                      {status === 'overdue' ? 'Overdue since' : 'Due'} {formatDate(inv.dueDate)}
                      {last && <span className="text-zinc-500"> · reminded {timeAgo(last.at)}</span>}
                    </span>
                  </Link>
                  <span className="font-semibold text-zinc-900">{formatMoney(total, inv.currency)}</span>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => openReminder('email', inv, settings, link)} className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                      <Mail className="h-3.5 w-3.5" /> Remind
                    </button>
                    <button type="button" onClick={() => openReminder('whatsapp', inv, settings, link)} className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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

function Stat({ icon: Icon, label, value, extra, sub, tone = 'default' }: { icon: LucideIcon; label: string; value: string; extra?: string[]; sub?: string; tone?: keyof typeof tones }) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-5">
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="text-sm font-medium text-zinc-500">{label}</span>
      </div>
      <div className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900">{value}</div>
      {extra?.map((x) => (
        <div key={x} className="text-sm font-medium text-zinc-600">
          {x}
        </div>
      ))}
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  )
}
