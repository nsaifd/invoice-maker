import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRightLeft, CheckCircle2, Copy, Download, FileText, Pencil, Send, Trash2, XCircle } from 'lucide-react'
import { db, formatProposalNumber, getSettings, takeInvoiceNumber, useSettings, type Proposal, type ShareRef } from '../db'
import { addDays, formatDate, formatMoney, todayISO, uid } from '../lib/invoice'
import { blockTitle, invoiceFromProposal, proposalDisplayStatus, proposalTotal } from '../lib/proposal'
import { snapshot, timeAgo, type Activity } from '../lib/share'
import { ProposalDocument } from '../components/ProposalDocument'
import { PrintPortal, ScaledFrame } from '../components/doc'
import { ActivityPanel, AuditTrail, CommentsPanel, SharePanel, useActivity } from '../components/SharePanel'
import { Button, PageHeader, StatusBadge } from '../components/ui'

export default function ProposalView() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const settings = useSettings()
  const p = useLiveQuery(() => db.proposals.get(id).then((x) => x ?? null), [id])

  // Bring the client's actions (views, signature, decline) into the local copy.
  const { activity, error, reload } = useActivity(p?.share, (a: Activity) => {
    db.proposals.get(id).then((cur) => {
      if (!cur) return
      const patch: Partial<Proposal> = {}
      if (a.status === 'accepted' && a.acceptance && cur.status !== 'accepted') Object.assign(patch, { status: 'accepted', acceptance: a.acceptance })
      else if (a.status === 'declined' && a.decline && cur.status !== 'declined') Object.assign(patch, { status: 'declined', declined: a.decline })
      else if (a.views.opens > 0 && (cur.status === 'sent' || cur.status === 'draft')) patch.status = 'viewed'
      if (Object.keys(patch).length) db.proposals.update(id, patch)
    })
  })

  if (!settings || p === undefined) return null
  if (p === null)
    return (
      <div className="py-20 text-center text-zinc-500">
        Proposal not found.{' '}
        <Link to="/proposals" className="text-blue-600 underline">
          Back to proposals
        </Link>
      </div>
    )

  const status = proposalDisplayStatus(p)
  const total = formatMoney(proposalTotal(p), p.currency)
  const update = (patch: Partial<Proposal>) => db.proposals.update(id, patch)
  const acceptance = activity?.acceptance ?? p.acceptance
  const sectionLabels = Object.fromEntries(p.blocks.map((b) => [b.id, blockTitle(b)]))

  function downloadPdf() {
    const prev = document.title
    document.title = `${p!.number} - ${p!.title}`
    window.print()
    document.title = prev
  }

  async function onShareChange(share: ShareRef | undefined) {
    await update({ share, status: share && p!.status === 'draft' ? 'sent' : p!.status })
  }

  async function convert() {
    if (p!.invoiceId && !confirm('An invoice was already created from this proposal. Create another one?')) return
    const s = await getSettings()
    const issueDate = todayISO()
    const invoiceId = await db.transaction('rw', db.invoices, db.proposals, db.settings, async () => {
      const newId = await db.invoices.add({
        ...invoiceFromProposal(p!),
        number: await takeInvoiceNumber(),
        status: 'draft',
        issueDate,
        dueDate: addDays(issueDate, s.dueDays),
        notes: `${s.notes}\nRef: proposal ${p!.number}`.trim(),
        terms: s.terms,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      await db.proposals.update(id, { invoiceId: newId })
      return newId
    })
    navigate(`/invoices/${invoiceId}/edit`)
  }

  async function duplicate() {
    const s = await getSettings()
    const date = todayISO()
    const copy: Proposal = {
      ...structuredClone(p!),
      id: undefined,
      number: formatProposalNumber(s),
      status: 'draft',
      date,
      validUntil: addDays(date, s.proposalValidDays),
      share: undefined,
      acceptance: undefined,
      declined: undefined,
      invoiceId: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    copy.blocks = copy.blocks.map((b) => ({ ...b, id: uid() }))
    const newId = await db.transaction('rw', db.proposals, db.settings, async () => {
      await db.settings.put({ ...s, nextProposalNumber: s.nextProposalNumber + 1 })
      return db.proposals.add(copy)
    })
    navigate(`/proposals/${newId}/edit`)
  }

  async function remove() {
    if (!confirm(`Delete proposal ${p!.number}? This cannot be undone.`)) return
    await db.proposals.delete(id)
    navigate('/proposals')
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Proposals', to: '/proposals' }, { label: p.number }]}
        title={p.title}
        subtitle={`${p.number} · ${p.client.name}${p.client.company ? ` · ${p.client.company}` : ''}`}
        actions={
          <>
            <Button variant="secondary" icon={Pencil} onClick={() => navigate(`/proposals/${id}/edit`)}>
              Edit
            </Button>
            <Button variant="secondary" icon={Copy} onClick={duplicate}>
              Duplicate
            </Button>
            <Button variant="ghost" icon={Trash2} className="hover:!bg-red-50 hover:!text-red-600" onClick={remove}>
              Delete
            </Button>
            <Button icon={ArrowRightLeft} onClick={convert} variant={p.status === 'accepted' ? 'primary' : 'secondary'}>
              Convert to Invoice
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
            <div className="mt-4 text-sm text-zinc-500">Proposal value</div>
            <div className="text-2xl font-semibold tracking-tight text-zinc-900">{total}</div>
            <dl className="mt-4 space-y-1.5 border-t border-zinc-100 pt-4 text-sm">
              <Row label="Date" value={formatDate(p.date)} />
              <Row label="Valid until" value={formatDate(p.validUntil)} />
              {p.declined && <Row label="Declined" value={timeAgo(p.declined.at)} />}
            </dl>
            {p.declined?.reason && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">“{p.declined.reason}” — {p.declined.name}</p>}
            {p.invoiceId && (
              <Link to={`/invoices/${p.invoiceId}`} className="mt-4 flex items-center gap-2 rounded-lg bg-zinc-50 p-3 text-sm font-medium text-blue-700 hover:bg-zinc-100">
                <FileText className="h-4 w-4" /> View created invoice
              </Link>
            )}
            {!p.share && p.status !== 'accepted' && p.status !== 'declined' && (
              <div className="mt-4 grid gap-2">
                {p.status === 'draft' && (
                  <Button variant="secondary" icon={Send} onClick={() => update({ status: 'sent' })}>
                    Mark as Sent
                  </Button>
                )}
                <Button variant="secondary" icon={CheckCircle2} className="!text-emerald-700" onClick={() => update({ status: 'accepted' })}>
                  Mark as Accepted
                </Button>
                <Button variant="secondary" icon={XCircle} onClick={() => update({ status: 'declined' })}>
                  Mark as Declined
                </Button>
              </div>
            )}
          </div>

          <SharePanel
            kind="proposal"
            share={p.share}
            dirty={!!p.share && p.updatedAt > p.share.publishedAt}
            locked={p.status === 'accepted'}
            makeDoc={() => snapshot(settings, { proposal: p })}
            onChange={onShareChange}
            message={{
              subject: `Proposal: ${p.title} — ${settings.businessName}`,
              body: `Hi ${p.client.name},\n\nHere is our proposal "${p.title}". You can review it, leave comments, and accept it online:`,
              email: p.client.email,
              phone: p.client.phone,
            }}
          />
          {acceptance && 'ip' in acceptance && <AuditTrail acceptance={acceptance} />}
          {p.share && (
            <>
              <ActivityPanel activity={activity} error={error} sectionLabels={sectionLabels} />
              <CommentsPanel share={p.share} activity={activity} ownerName={settings.businessName} onPosted={reload} />
            </>
          )}
        </aside>

        <ScaledFrame
          header={
            <>
              <span className="text-lg font-semibold text-zinc-900">Preview</span>
              <Button icon={Download} onClick={downloadPdf}>
                Download PDF
              </Button>
            </>
          }
        >
          <ProposalDocument proposal={p} settings={settings} acceptance={acceptance} />
        </ScaledFrame>
      </div>

      <PrintPortal>
        <ProposalDocument proposal={p} settings={settings} acceptance={acceptance} />
      </PrintPortal>
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
