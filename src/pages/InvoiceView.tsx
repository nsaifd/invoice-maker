import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Copy, Download, Mail, Pencil, RotateCcw, Send, Trash2 } from 'lucide-react'
import { db, formatInvoiceNumber, getSettings, useSettings, type Invoice } from '../db'
import { addDays, calcTotals, displayStatus, formatDate, formatMoney, todayISO, uid } from '../lib/invoice'
import { ScaledPreview } from '../components/InvoicePreview'
import { Button, PageHeader, StatusBadge } from '../components/ui'

export default function InvoiceView() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const settings = useSettings()
  const inv = useLiveQuery(() => db.invoices.get(id).then((x) => x ?? null), [id])

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
      `Please find attached invoice ${inv!.number} for ${total}, due on ${formatDate(inv!.dueDate)}.`,
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

      <div className="grid items-start gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-4 xl:sticky xl:top-4 print:hidden">
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
          <p className="px-1 text-xs leading-relaxed text-zinc-500">
            <b>Download PDF</b> opens the print dialog — choose <b>Save as PDF</b>. <b>Email</b> opens your mail app; attach the downloaded PDF before sending.
          </p>
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
    </>
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
