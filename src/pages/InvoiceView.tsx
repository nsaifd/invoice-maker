import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
      <div className="py-20 text-center text-slate-500">
        Invoice not found. <Link to="/" className="text-blue-600 underline">Back to invoices</Link>
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
        title={inv.number}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(`/invoices/${id}/edit`)}>Edit</Button>
            <Button variant="secondary" onClick={duplicate}>Duplicate</Button>
            <Button variant="secondary" onClick={email}>Email</Button>
            <Button onClick={downloadPdf}>Download PDF</Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-xs print:hidden">
        <StatusBadge status={status} />
        <span className="text-slate-600">
          {inv.client.name} · <span className="font-semibold text-slate-900">{total}</span> · due {formatDate(inv.dueDate)}
          {inv.paidAt && ` · paid ${formatDate(inv.paidAt)}`}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {inv.status === 'draft' && <Button variant="secondary" onClick={() => update({ status: 'sent' })}>Mark as sent</Button>}
          {inv.status !== 'paid' ? (
            <Button variant="secondary" className="!text-emerald-700" onClick={() => update({ status: 'paid', paidAt: todayISO() })}>Mark as paid</Button>
          ) : (
            <Button variant="secondary" onClick={() => update({ status: 'sent', paidAt: undefined })}>Mark as unpaid</Button>
          )}
          <Button variant="danger" onClick={remove}>Delete</Button>
        </div>
      </div>

      <p className="mb-3 text-xs text-slate-500 print:hidden">
        Tip: in the print dialog choose <b>Save as PDF</b> as the destination. "Email" opens your mail app — attach the downloaded PDF before sending.
      </p>

      <div className="mx-auto max-w-[calc(210mm+2.5rem)]">
        <ScaledPreview invoice={inv} settings={settings} />
      </div>
    </>
  )
}
