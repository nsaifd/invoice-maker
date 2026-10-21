import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BellRing, CheckCircle2, Copy, Download, Mail, MessageCircle, Pencil, Repeat, RotateCcw, Send, Trash2 } from 'lucide-react'
import { db, formatInvoiceNumber, getSettings, useSettings, type Frequency, type Invoice } from '../db'
import { addDays, calcTotals, displayStatus, formatDate, formatMoney, todayISO, uid } from '../lib/invoice'
import { FREQUENCIES, nextOccurrence, openReminder, ruleFromInvoice } from '../lib/recurring'
import { shareUrl, snapshot, timeAgo } from '../lib/share'
import { InvoicePreview, ScaledPreview } from '../components/InvoicePreview'
import { PrintPortal } from '../components/doc'
import { ActivityPanel, CommentsPanel, SharePanel, useActivity } from '../components/SharePanel'
import { Button, Field, Modal, PageHeader, StatusBadge, inputCls } from '../components/ui'

export default function InvoiceView() {
  const id = useParams().id ?? ''
  const navigate = useNavigate()
  const settings = useSettings()
  const inv = useLiveQuery(() => db.invoices.get(id).then((x) => x ?? null), [id])
  const rule = useLiveQuery(() => (inv?.recurringId ? db.recurring.get(inv.recurringId) : undefined), [inv?.recurringId])
  const [recurringOpen, setRecurringOpen] = useState(false)
  const { activity, error, reload } = useActivity(inv?.share)

  if (!settings || inv === undefined) return null
  if (inv === null)
    return (
      <div className="py-20 text-center text-zinc-500">
        Invoice not found.{' '}
        <Link to="/" className="text-blue-600 underline">
          Back to invoices
        </Link>
      </div>
    )

  const status = displayStatus(inv)
  const total = formatMoney(calcTotals(inv).total, inv.currency)
  const update = (patch: Partial<Invoice>) => db.invoices.update(id, { ...patch, updatedAt: Date.now() })
  const link = inv.share ? shareUrl(inv.share.id) : undefined
  const lastReminder = inv.reminders?.at(-1)

  function downloadPdf() {
    // The browser's "Save as PDF" uses the document title as the file name.
    const prev = document.title
    document.title = `${inv!.number} - ${inv!.client.name}`
    window.print()
    document.title = prev
    if (inv!.status === 'draft') update({ status: 'sent' })
  }

  function email() {
    const subject = `Invoice ${inv!.number} from ${settings!.businessName || 'us'}`
    const body = [
      `Hi ${inv!.client.name},`,
      '',
      `Please find ${link ? 'below' : 'attached'} invoice ${inv!.number} for ${total}, due on ${formatDate(inv!.dueDate)}.`,
      link ? `\nView and download it online: ${link}` : '',
      '',
      'Thank you,',
      settings!.businessName,
    ].join('\n')
    window.location.href = `mailto:${encodeURIComponent(inv!.client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    if (inv!.status === 'draft') update({ status: 'sent' })
  }

  async function duplicate() {
    const s = await getSettings()
    const issueDate = todayISO()
    const copy: Invoice = {
      ...inv!,
      id: undefined,
      number: formatInvoiceNumber(s),
      status: 'draft',
      paidAt: undefined,
      share: undefined,
      reminders: undefined,
      recurringId: undefined,
      issueDate,
      dueDate: addDays(issueDate, s.dueDays),
      items: inv!.items.map((i) => ({ ...i, id: uid() })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const newId = await db.transaction('rw', db.invoices, db.settings, async () => {
      await db.settings.put({ ...s, nextNumber: s.nextNumber + 1 })
      return db.invoices.add(copy)
    })
    navigate(`/invoices/${newId}/edit`)
  }

  async function remove() {
    if (!confirm(`Delete invoice ${inv!.number}? This cannot be undone.`)) return
    await db.invoices.delete(id)
    navigate('/')
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Invoices', to: '/' }, { label: inv.number }]}
        title={inv.number}
        subtitle={`${inv.client.name}${inv.client.company ? ` · ${inv.client.company}` : ''}`}
        actions={
          <>
            <Button variant="secondary" icon={Pencil} onClick={() => navigate(`/invoices/${id}/edit`)}>
              Edit
            </Button>
            <Button variant="secondary" icon={Copy} onClick={duplicate}>
              Duplicate
            </Button>
            <Button variant="ghost" icon={Trash2} className="hover:!bg-red-50 hover:!text-red-600" onClick={remove}>
              Delete
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-500">Status</span>
              <StatusBadge status={status} />
            </div>
            <div className="mt-4 text-sm text-zinc-500">Amount</div>
            <div className="text-2xl font-semibold tracking-tight text-zinc-900">{total}</div>
            <dl className="mt-4 space-y-1.5 border-t border-zinc-100 pt-4 text-sm">
              <Row label="Issued" value={formatDate(inv.issueDate)} />
              <Row label="Due" value={formatDate(inv.dueDate)} />
              {inv.paidAt && <Row label="Paid on" value={formatDate(inv.paidAt)} />}
            </dl>
            <div className="mt-5 grid gap-2">
              {inv.status === 'draft' && (
                <Button variant="secondary" icon={Send} onClick={() => update({ status: 'sent' })}>
                  Mark as Sent
                </Button>
              )}
              {inv.status !== 'paid' ? (
                <Button variant="secondary" icon={CheckCircle2} className="!text-emerald-700" onClick={() => update({ status: 'paid', paidAt: todayISO() })}>
                  Mark as Paid
                </Button>
              ) : (
                <Button variant="secondary" icon={RotateCcw} onClick={() => update({ status: 'sent', paidAt: undefined })}>
                  Mark as Unpaid
                </Button>
              )}
            </div>
          </div>

          {inv.status === 'sent' && (
            <div className={`rounded-2xl border p-5 ${status === 'overdue' ? 'border-red-200 bg-red-50/40' : 'border-zinc-200'}`}>
              <div className="mb-1 flex items-center gap-2 font-semibold text-zinc-900">
                <BellRing className="h-4 w-4" /> Payment reminder
              </div>
              <p className="mb-3 text-sm text-zinc-500">
                {lastReminder ? `Last reminded ${timeAgo(lastReminder.at)} via ${lastReminder.channel === 'email' ? 'email' : 'WhatsApp'}.` : 'Send a friendly reminder with one click.'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" icon={Mail} onClick={() => openReminder('email', inv, settings, link)}>
                  Email
                </Button>
                <Button variant="secondary" icon={MessageCircle} onClick={() => openReminder('whatsapp', inv, settings, link)}>
                  WhatsApp
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-zinc-200 p-5">
            <div className="mb-1 flex items-center gap-2 font-semibold text-zinc-900">
              <Repeat className="h-4 w-4" /> Recurring
            </div>
            {rule ? (
              <p className="text-sm text-zinc-500">
                {FREQUENCIES[rule.frequency]} · {rule.active ? `next on ${formatDate(rule.nextDate)}` : 'paused'}.{' '}
                <Link to="/recurring" className="font-medium text-blue-600 hover:underline">
                  Manage
                </Link>
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm text-zinc-500">Bill this client on a schedule — new invoices are created automatically.</p>
                <Button variant="secondary" icon={Repeat} className="w-full" onClick={() => setRecurringOpen(true)}>
                  Make recurring
                </Button>
              </>
            )}
          </div>

          <SharePanel
            kind="invoice"
            share={inv.share}
            dirty={!!inv.share && inv.updatedAt > inv.share.publishedAt}
            makeDoc={() => snapshot(settings, { invoice: inv })}
            onChange={(share) => db.invoices.update(id, { share })}
            message={{
              subject: `Invoice ${inv.number} from ${settings.businessName}`,
              body: `Hi ${inv.client.name},\n\nHere is invoice ${inv.number} for ${total}, due on ${formatDate(inv.dueDate)}. You can view and download it here:`,
              email: inv.client.email,
              phone: inv.client.phone,
            }}
          />
          {inv.share && (
            <>
              <ActivityPanel activity={activity} error={error} />
              <CommentsPanel share={inv.share} activity={activity} ownerName={settings.businessName} onPosted={reload} />
            </>
          )}
        </aside>

        <ScaledPreview
          invoice={inv}
          settings={settings}
          header={
            <>
              <span className="text-lg font-semibold text-zinc-900">Preview</span>
              <div className="flex gap-2">
                <Button variant="secondary" icon={Mail} onClick={email}>
                  Email
                </Button>
                <Button icon={Download} onClick={downloadPdf}>
                  Download PDF
                </Button>
              </div>
            </>
          }
        />
      </div>

      <RecurringModal open={recurringOpen} onClose={() => setRecurringOpen(false)} invoice={inv} />
      <PrintPortal>
        <InvoicePreview invoice={inv} settings={settings} />
      </PrintPortal>
    </>
  )
}

function RecurringModal({ open, onClose, invoice }: { open: boolean; onClose: () => void; invoice: Invoice }) {
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [nextDate, setNextDate] = useState(() => nextOccurrence(invoice.issueDate, 'monthly'))
  const [endDate, setEndDate] = useState('')
  async function save() {
    await db.transaction('rw', db.recurring, db.invoices, async () => {
      const ruleId = await db.recurring.add(ruleFromInvoice(invoice, frequency, nextDate, endDate))
      await db.invoices.update(invoice.id!, { recurringId: ruleId })
    })
    onClose()
  }
  return (
    <Modal open={open} title="Make this invoice recurring" onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Repeat" className="sm:col-span-2">
          <select
            className={inputCls}
            value={frequency}
            onChange={(e) => {
              const f = e.target.value as Frequency
              setFrequency(f)
              setNextDate(nextOccurrence(invoice.issueDate, f))
            }}
          >
            {Object.entries(FREQUENCIES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Next invoice on">
          <input type="date" className={inputCls} value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
        </Field>
        <Field label="End date (optional)">
          <input type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
      <p className="mt-4 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-500">
        A draft copy of this invoice is created on each date, with a new number. Because your data lives in this browser, invoices are created the next time you open Involet on or
        after that date.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button icon={Repeat} onClick={save} disabled={!nextDate}>
          Start schedule
        </Button>
      </div>
    </Modal>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-900">{value}</dd>
    </div>
  )
}
