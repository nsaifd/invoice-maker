import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { Pause, Play, Repeat, Trash2 } from 'lucide-react'
import { db } from '../db'
import { calcTotals, formatDate, formatMoney } from '../lib/invoice'
import { FREQUENCIES } from '../lib/recurring'
import { Button, PageHeader, initials } from '../components/ui'

export default function RecurringPage() {
  const rules = useLiveQuery(() => db.recurring.orderBy('nextDate').toArray(), [])
  if (!rules) return null

  return (
    <>
      <PageHeader title="Recurring Invoices" subtitle="Retainers and subscriptions that bill on a schedule." />
      {rules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 py-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Repeat className="h-6 w-6" />
          </div>
          <div className="text-lg font-semibold text-zinc-900">No recurring invoices</div>
          <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
            Open any invoice and choose <b>Make recurring</b> to bill that client weekly, monthly, quarterly or yearly.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Repeats</th>
                <th className="px-4 py-3 font-medium">Next invoice</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rules.map((r) => (
                <tr key={r.id} className={r.active ? '' : 'text-zinc-400'}>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">{initials(r.template.client.name)}</span>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-zinc-900">{r.template.client.name}</div>
                        {r.sourceInvoiceId && (
                          <Link to={`/invoices/${r.sourceInvoiceId}`} className="text-xs text-blue-600 hover:underline">
                            Source invoice
                          </Link>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">{FREQUENCIES[r.frequency]}</td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    {r.active ? formatDate(r.nextDate) : r.endDate && r.nextDate > r.endDate ? 'Ended' : 'Paused'}
                    {r.endDate && <div className="text-xs text-zinc-400">until {formatDate(r.endDate)}</div>}
                  </td>
                  <td className="px-4 py-3.5">{r.generatedCount} invoices</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-zinc-900">{formatMoney(calcTotals(r.template).total, r.template.currency)}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <Button variant="ghost" icon={r.active ? Pause : Play} onClick={() => db.recurring.update(r.id!, { active: !r.active })}>
                      {r.active ? 'Pause' : 'Resume'}
                    </Button>
                    <Button
                      variant="ghost"
                      icon={Trash2}
                      className="hover:!text-red-600"
                      onClick={async () => {
                        if (!confirm('Stop this schedule? Invoices already created are kept.')) return
                        await db.transaction('rw', db.recurring, db.invoices, async () => {
                          await db.recurring.delete(r.id!)
                          if (r.sourceInvoiceId) await db.invoices.update(r.sourceInvoiceId, { recurringId: undefined })
                        })
                      }}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-zinc-500">New invoices are created as drafts when you open InvoiceKit on or after the scheduled date, so you can review them before sending.</p>
    </>
  )
}
