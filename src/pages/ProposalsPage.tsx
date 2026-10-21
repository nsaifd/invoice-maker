import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Eye, FileSignature, Plus, Search, Send, type LucideIcon } from 'lucide-react'
import { db, useSettings } from '../db'
import { formatDate, formatMoney, todayISO } from '../lib/invoice'
import { proposalDisplayStatus, proposalTotal, type ProposalDisplayStatus } from '../lib/proposal'
import { PageHeader, StatusBadge, initials, inputCls } from '../components/ui'

const filters: Array<'all' | ProposalDisplayStatus> = ['all', 'draft', 'sent', 'viewed', 'accepted', 'declined', 'expired']

export default function ProposalsPage() {
  const settings = useSettings()
  const proposals = useLiveQuery(() => db.proposals.orderBy('date').reverse().toArray(), [])
  const [filter, setFilter] = useState<(typeof filters)[number]>('all')
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const rows = useMemo(() => (proposals ?? []).map((p) => ({ p, status: proposalDisplayStatus(p), total: proposalTotal(p) })), [proposals])

  if (!settings || !proposals) return null
  const cur = settings.currency
  const inCur = rows.filter((r) => r.p.currency === cur)
  const open = inCur.filter((r) => r.status === 'sent' || r.status === 'viewed')
  const accepted = rows.filter((r) => r.status === 'accepted')
  const decided = rows.filter((r) => r.status === 'accepted' || r.status === 'declined').length
  const month = todayISO().slice(0, 7)
  const acceptedMonth = inCur.filter((r) => r.status === 'accepted' && (r.p.acceptance?.signedAt ?? new Date(r.p.updatedAt).toISOString()).startsWith(month))
  const sum = (xs: typeof rows) => xs.reduce((a, r) => a + r.total, 0)

  const needle = q.trim().toLowerCase()
  const visible = rows.filter(
    (r) => (filter === 'all' || r.status === filter) && (!needle || [r.p.number, r.p.title, r.p.client.name, r.p.client.company].some((s) => s.toLowerCase().includes(needle))),
  )

  return (
    <>
      <PageHeader
        title="Proposals"
        subtitle="Win work with proposals your clients can sign online."
        actions={
          <Link to="/proposals/new" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700">
            <Plus className="h-4 w-4" /> New Proposal
          </Link>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={FileSignature} label="Total proposals" value={String(proposals.length)} sub={`${rows.filter((r) => r.status === 'draft').length} drafts`} />
        <Stat icon={Send} label="Awaiting response" value={formatMoney(sum(open), cur)} sub={`${open.length} open`} tone="blue" />
        <Stat icon={CheckCircle2} label="Accepted this month" value={formatMoney(sum(acceptedMonth), cur)} sub={`${acceptedMonth.length} signed`} tone="green" />
        <Stat icon={Eye} label="Win rate" value={decided ? `${Math.round((accepted.length / decided) * 100)}%` : '—'} sub={`${accepted.length} of ${decided} decided`} tone="violet" />
      </div>

      {proposals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 py-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <FileSignature className="h-6 w-6" />
          </div>
          <div className="text-lg font-semibold text-zinc-900">No proposals yet</div>
          <p className="mt-1 text-sm text-zinc-500">Start from a ready-made structure and customize the blocks.</p>
          <Link to="/proposals/new" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> New Proposal
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200">
          <div className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-zinc-100 p-1">
              {filters.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${filter === f ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="relative sm:ml-auto sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input className={`${inputCls} py-2 pl-9`} placeholder="Search title or client…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Proposal</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Valid until</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {visible.map(({ p, status, total }) => (
                  <tr key={p.id} onClick={() => navigate(`/proposals/${p.id}`)} className="cursor-pointer hover:bg-zinc-50">
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-zinc-900">{p.title}</div>
                      <div className="text-xs text-zinc-500">{p.number}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">{initials(p.client.name)}</span>
                        <span className="truncate font-medium text-zinc-900">{p.client.name || '—'}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-zinc-500">{formatDate(p.date)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-zinc-500">{formatDate(p.validUntil)}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-zinc-900">{formatMoney(total, p.currency)}</td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-zinc-500">
                      No proposals match.
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
  green: 'bg-emerald-50 text-emerald-600',
  violet: 'bg-violet-50 text-violet-600',
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
