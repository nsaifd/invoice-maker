import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Download, FileX, MessageCircle, PenLine, Send, XCircle } from 'lucide-react'
import { db, type Settings } from '../db'
import { calcTotals, formatDate, formatMoney } from '../lib/invoice'
import { proposalTotal } from '../lib/proposal'
import { acceptShare, declineShare, fetchShare, postComment, sendEvents, type PublicShare } from '../lib/share'
import { InvoicePreview } from '../components/InvoicePreview'
import { ProposalDocument } from '../components/ProposalDocument'
import { PrintPortal, ScaledFrame } from '../components/doc'
import { CommentList } from '../components/SharePanel'
import { SignaturePad, type SignaturePadHandle } from '../components/SignaturePad'
import { Button, Field, Modal, initials, inputCls } from '../components/ui'

const NAME_KEY = 'invoicekit.visitorName'

function storage(key: string, value?: string): string {
  try {
    if (value !== undefined) localStorage.setItem(key, value)
    return localStorage.getItem(key) ?? ''
  } catch {
    return value ?? ''
  }
}

function visitorId(): string {
  let id = storage('invoicekit.visitor')
  if (!id) id = storage('invoicekit.visitor', crypto.randomUUID())
  return id || 'anonymous'
}

/** The page a client opens from a share link. Works without login and without the owner's local data. */
export default function PublicPage() {
  const { id = '' } = useParams()
  const [data, setData] = useState<PublicShare | null>(null)
  const [error, setError] = useState('')
  const [isOwner, setIsOwner] = useState<boolean | null>(null)
  const [modal, setModal] = useState<'accept' | 'decline' | null>(null)
  const docRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchShare(id).then(setData, (e: Error) => setError(e.message))
    // Opening your own link from the same browser shouldn't count as a client view.
    Promise.all([db.proposals.filter((p) => p.share?.id === id).count(), db.invoices.filter((i) => i.share?.id === id).count()])
      .then(([a, b]) => setIsOwner(a + b > 0))
      .catch(() => setIsOwner(false))
  }, [id])

  useViewTracking(id, docRef, !!data && isOwner === false)

  useEffect(() => {
    if (!data) return
    const d = data.doc
    document.title = d.proposal ? `${d.proposal.title} — ${d.settings.businessName}` : `Invoice ${d.invoice?.number} — ${d.settings.businessName}`
  }, [data])

  if (error)
    return (
      <Shell>
        <div className="mx-auto max-w-md py-24 text-center">
          <FileX className="mx-auto mb-4 h-10 w-10 text-zinc-300" />
          <h1 className="text-lg font-semibold text-zinc-900">Document unavailable</h1>
          <p className="mt-1 text-sm text-zinc-500">{error}</p>
        </div>
      </Shell>
    )
  if (!data) return <Shell>{null}</Shell>

  const settings = { ...data.doc.settings, id: 'default', nextNumber: 0, nextProposalNumber: 0 } as Settings
  const { proposal, invoice } = data.doc
  const custom = data.doc.customTemplate ?? null
  const doc = proposal ? (
    <ProposalDocument proposal={proposal} settings={settings} acceptance={data.acceptance} customTemplate={custom} />
  ) : invoice ? (
    <InvoicePreview invoice={invoice} settings={settings} customTemplate={custom} />
  ) : null
  const total = proposal ? formatMoney(proposalTotal(proposal), proposal.currency) : invoice ? formatMoney(calcTotals(invoice).total, invoice.currency) : ''
  const canRespond = data.kind === 'proposal' && data.status === 'open'

  function download() {
    const prev = document.title
    document.title = proposal ? `${proposal.number} - ${proposal.title}` : `${invoice?.number}`
    window.print()
    document.title = prev
  }

  return (
    <Shell
      settings={settings}
      actions={
        <>
          <Button variant="secondary" icon={Download} onClick={download}>
            <span className="hidden sm:inline">Download PDF</span>
          </Button>
          {canRespond && (
            <>
              <Button variant="secondary" icon={XCircle} onClick={() => setModal('decline')} className="hidden sm:inline-flex">
                Decline
              </Button>
              <Button icon={PenLine} onClick={() => setModal('accept')}>
                Accept & Sign
              </Button>
            </>
          )}
        </>
      }
    >
      {isOwner && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          This is your own share link. Views from this browser are not counted, and this is exactly what your client sees.
        </div>
      )}
      {data.status === 'accepted' && data.acceptance && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>
            Accepted and signed by <b>{data.acceptance.name}</b> on {new Date(data.acceptance.signedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.
          </span>
        </div>
      )}
      {data.status === 'declined' && data.decline && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <XCircle className="h-5 w-5 shrink-0" />
          <span>
            Declined by {data.decline.name} on {formatDate(data.decline.at.slice(0, 10))}.
          </span>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div ref={docRef} className="min-w-0">
          <ScaledFrame>{doc}</ScaledFrame>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-20">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="text-sm text-zinc-500">{proposal ? 'Proposal total' : 'Amount due'}</div>
            <div className="text-2xl font-semibold tracking-tight text-zinc-900">{invoice?.status === 'paid' ? 'Paid' : total}</div>
            <dl className="mt-3 space-y-1 text-sm">
              {proposal && <Row label="Valid until" value={formatDate(proposal.validUntil)} />}
              {invoice && <Row label="Due date" value={formatDate(invoice.dueDate)} />}
              <Row label="From" value={settings.businessName} />
            </dl>
            {canRespond && (
              <div className="mt-4 grid gap-2">
                <Button icon={PenLine} onClick={() => setModal('accept')}>
                  Accept & Sign
                </Button>
                <Button variant="secondary" icon={XCircle} onClick={() => setModal('decline')}>
                  Decline
                </Button>
              </div>
            )}
          </div>
          <PublicComments id={id} comments={data.comments} onChange={(comments) => setData({ ...data, comments })} />
        </aside>
      </div>

      <AcceptModal
        open={modal === 'accept'}
        onClose={() => setModal(null)}
        total={total}
        defaultName={proposal?.client.name ?? ''}
        defaultEmail={proposal?.client.email ?? ''}
        onAccept={async (body) => {
          const r = await acceptShare(id, body)
          setData({ ...data, status: 'accepted', acceptance: r.acceptance })
          setModal(null)
        }}
      />
      <DeclineModal
        open={modal === 'decline'}
        onClose={() => setModal(null)}
        defaultName={proposal?.client.name ?? ''}
        onDecline={async (body) => {
          const r = await declineShare(id, body)
          setData({ ...data, status: 'declined', decline: r.decline })
          setModal(null)
        }}
      />
      <PrintPortal>{doc}</PrintPortal>
    </Shell>
  )
}

function Shell({ settings, actions, children }: { settings?: Settings; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {settings?.logo ? (
              <img src={settings.logo} alt="" className="h-8 max-w-[120px] object-contain" />
            ) : settings ? (
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: settings.accentColor }}>
                {initials(settings.businessName || 'B')}
              </span>
            ) : null}
            <span className="truncate font-semibold text-zinc-900">{settings?.businessName}</span>
          </div>
          <div className="flex shrink-0 gap-2">{actions}</div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="pb-8 text-center text-xs text-zinc-400">Sent with InvoiceKit</footer>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="truncate font-medium text-zinc-900">{value}</dd>
    </div>
  )
}

function PublicComments({ id, comments, onChange }: { id: string; comments: PublicShare['comments']; onChange: (c: PublicShare['comments']) => void }) {
  const [name, setName] = useState(() => storage(NAME_KEY))
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  async function send() {
    if (!name.trim()) return alert('Please enter your name.')
    if (!text.trim()) return
    setBusy(true)
    try {
      storage(NAME_KEY, name.trim())
      const r = await postComment(id, { name, body: text })
      onChange(r.comments)
      setText('')
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2 font-semibold text-zinc-900">
        <MessageCircle className="h-4 w-4" /> Questions & comments
      </div>
      <CommentList comments={comments} />
      <div className="mt-3 space-y-2">
        <input className={`${inputCls} py-2`} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea rows={2} className={inputCls} placeholder="Write a comment…" value={text} onChange={(e) => setText(e.target.value)} />
        <Button className="w-full" icon={Send} disabled={busy || !text.trim()} onClick={send}>
          Post comment
        </Button>
      </div>
    </div>
  )
}

function AcceptModal({
  open,
  onClose,
  total,
  defaultName,
  defaultEmail,
  onAccept,
}: {
  open: boolean
  onClose: () => void
  total: string
  defaultName: string
  defaultEmail: string
  onAccept: (body: { name: string; email: string; signature: string }) => Promise<void>
}) {
  const [name, setName] = useState(defaultName)
  const [email, setEmail] = useState(defaultEmail)
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pad = useRef<SignaturePadHandle>(null)

  async function submit() {
    setError('')
    if (!name.trim()) return setError('Please enter your full name.')
    const signature = await pad.current?.toDataURL()
    if (!signature) return setError('Please draw or type your signature.')
    if (!agree) return setError('Please confirm that you accept the proposal.')
    setBusy(true)
    try {
      await onAccept({ name: name.trim(), email: email.trim(), signature })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title="Accept & sign proposal" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name *">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email">
            <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <SignaturePad ref={pad} defaultName={defaultName} />
        <label className="flex items-start gap-2.5 text-sm text-zinc-700">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>
            I accept this proposal{total ? ` (${total})` : ''} and its terms. I understand this electronic signature is legally binding, and that the date, time and IP address are recorded.
          </span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={PenLine} disabled={busy} onClick={submit}>
            {busy ? 'Signing…' : 'Sign & Accept'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function DeclineModal({
  open,
  onClose,
  defaultName,
  onDecline,
}: {
  open: boolean
  onClose: () => void
  defaultName: string
  onDecline: (body: { name: string; reason: string }) => Promise<void>
}) {
  const [name, setName] = useState(defaultName)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} title="Decline proposal" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Your name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Reason (optional)">
          <textarea rows={3} className={inputCls} placeholder="Let them know why, or what would change your mind" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onDecline({ name, reason })
              } catch (e) {
                alert((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            Decline proposal
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Records an "open" and how long each [data-section] is on screen, flushed every 15s and when leaving. */
function useViewTracking(id: string, root: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !root.current) return
    const visitor = visitorId()
    sendEvents(id, visitor, [{ type: 'open' }])
    const visible = new Set<string>()
    const pending = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const sid = (e.target as HTMLElement).dataset.section!
          if (e.isIntersecting && e.intersectionRatio > 0.15) visible.add(sid)
          else visible.delete(sid)
        }
      },
      { threshold: [0, 0.15, 0.5] },
    )
    root.current.querySelectorAll<HTMLElement>('[data-section]').forEach((el) => io.observe(el))
    const tick = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      visible.forEach((sid) => pending.set(sid, (pending.get(sid) ?? 0) + 1000))
    }, 1000)
    const flush = () => {
      const events = [...pending].map(([section, ms]) => ({ type: 'section' as const, section, ms }))
      pending.clear()
      sendEvents(id, visitor, events)
    }
    const flushTimer = setInterval(flush, 15_000)
    const onHide = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      flush()
      io.disconnect()
      clearInterval(tick)
      clearInterval(flushTimer)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [id, root, enabled])
}
