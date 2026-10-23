import { useState } from 'react'
import { BadgeCheck, Check, CheckCircle2, Clock, Copy, ImagePlus, Loader2, Wallet, XCircle } from 'lucide-react'
import type { Invoice, Settings } from '../db'
import { calcTotals, formatDate, formatMoney, toCents, todayISO } from '../lib/invoice'
import { compressImage } from '../lib/image'
import { paymentMethods } from '../lib/payments'
import type { InvoiceShareState } from '../lib/share'
import { Button, Field, Modal, NumberInput, inputCls } from './ui'

// The client's side of a shared invoice: what's owed, how to pay, and telling you they paid.

const EMPTY: InvoiceShareState = { confirmation: null, payments: [], paid: null, marked: false }

/** What the client should see, combining the shared invoice with what happened since. */
export function invoiceView(invoice: Invoice, state: InvoiceShareState = EMPTY) {
  const paid = state.marked ? !!state.paid : invoice.status === 'paid'
  const paidOn = state.paid?.paidOn ?? invoice.paidAt
  const total = calcTotals(invoice).total
  const received = state.payments.filter((p) => p.status === 'confirmed').reduce((a, p) => a + toCents(p.amount), 0)
  const due = paid ? 0 : Math.max(total - received, 0)
  const pending = state.payments.filter((p) => p.status === 'pending')
  const last = state.payments.at(-1)
  return {
    paid,
    paidOn,
    total,
    received,
    due,
    pending,
    rejected: last?.status === 'rejected' ? last : undefined,
    /** The invoice as it should be drawn (with the PAID stamp once paid). */
    shown: { ...invoice, status: paid ? 'paid' : invoice.status === 'paid' ? 'sent' : invoice.status, paidAt: paid ? paidOn : undefined } as Invoice,
  }
}

type View = ReturnType<typeof invoiceView>

export function InvoiceBanner({ view, currency, business }: { view: View; currency: Invoice['currency']; business: string }) {
  const money = (n: number) => formatMoney(toCents(n), currency)
  if (view.paid)
    return (
      <Banner tone="green" icon={CheckCircle2}>
        <b>Paid — thank you!</b> {view.paidOn ? `Payment received on ${formatDate(view.paidOn)}.` : 'Payment received.'}
      </Banner>
    )
  if (view.pending.length)
    return (
      <Banner tone="amber" icon={Clock}>
        You reported a payment of <b>{money(view.pending.reduce((a, p) => a + p.amount, 0))}</b>
        {view.pending.length === 1 ? ` via ${view.pending[0].method}` : ''}. {business || 'The sender'} will confirm it soon.
      </Banner>
    )
  if (view.rejected)
    return (
      <Banner tone="red" icon={XCircle}>
        {business || 'The sender'} couldn’t confirm your payment of <b>{money(view.rejected.amount)}</b>
        {view.rejected.reason ? `: “${view.rejected.reason}”` : '.'} Please check the details and report it again, or leave a comment.
      </Banner>
    )
  return null
}

function Banner({ tone, icon: Icon, children }: { tone: 'green' | 'amber' | 'red'; icon: typeof Clock; children: React.ReactNode }) {
  const cls = { green: 'border-emerald-200 bg-emerald-50 text-emerald-800', amber: 'border-amber-200 bg-amber-50 text-amber-900', red: 'border-red-200 bg-red-50 text-red-800' }[tone]
  return (
    <div role="status" className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${cls}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

/** Amount due, payment progress, and the client's actions. */
export function InvoiceSummary({
  invoice,
  settings,
  view,
  state,
  isOwner,
  onPay,
  onConfirm,
}: {
  invoice: Invoice
  settings: Settings
  view: View
  state: InvoiceShareState
  isOwner: boolean
  onPay: () => void
  onConfirm: () => void
}) {
  const m = (cents: number) => formatMoney(cents, invoice.currency)
  const partly = view.received > 0 && !view.paid
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-zinc-500">{view.paid ? 'Status' : partly ? 'Balance due' : 'Amount due'}</span>
        {view.paid && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            <Check className="h-3 w-3" /> Paid
          </span>
        )}
      </div>
      <div className="text-2xl font-semibold tracking-tight text-zinc-900">{view.paid ? 'Paid' : m(view.due)}</div>
      <dl className="mt-3 space-y-1 text-sm">
        {(partly || view.paid) && <Row label="Invoice total" value={m(view.total)} />}
        {partly && <Row label="Paid so far" value={m(view.received)} />}
        {view.paid && view.paidOn ? <Row label="Paid on" value={formatDate(view.paidOn)} /> : <Row label="Due date" value={formatDate(invoice.dueDate)} />}
        <Row label="From" value={settings.businessName} />
      </dl>
      {state.confirmation && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700">
          <BadgeCheck className="h-3.5 w-3.5" /> Confirmed by {state.confirmation.name} on {formatDate(new Date(state.confirmation.at).toISOString().slice(0, 10))}
        </p>
      )}
      {!view.paid &&
        (isOwner ? (
          <p className="mt-4 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-500">Your client sees “I’ve paid” and “Confirm invoice” buttons here.</p>
        ) : (
          <div className="mt-4 grid gap-2">
            <Button icon={Wallet} onClick={onPay}>
              I’ve paid
            </Button>
            {!state.confirmation && (
              <Button variant="secondary" icon={BadgeCheck} onClick={onConfirm}>
                Confirm invoice
              </Button>
            )}
          </div>
        ))}
    </div>
  )
}

/** Your payment details as a list the client can copy from. */
export function HowToPay({ settings }: { settings: Settings }) {
  const p = settings.payment
  const wallets = (
    [
      ['bKash', p.bkash],
      ['Nagad', p.nagad],
      ['Rocket', p.rocket],
    ] as const
  ).filter(([, v]) => v.trim())
  const bank = (
    [
      ['Bank', p.bankName],
      ['Account name', p.accountName],
      ['Account no.', p.accountNumber],
      ['Branch', p.branch],
      ['Routing no.', p.routingNumber],
      ['SWIFT', p.swift],
    ] as const
  ).filter(([, v]) => v.trim())
  const other = p.other.trim()
  if (!wallets.length && !bank.length && !other) return null
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2 font-semibold text-zinc-900">
        <Wallet className="h-4 w-4" /> How to pay
      </div>
      <div className="space-y-3 text-sm">
        {wallets.map(([k, v]) => (
          <CopyRow key={k} label={k} value={v} />
        ))}
        {bank.length > 0 && (
          <div className="rounded-xl bg-zinc-50 p-3">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Bank transfer</div>
            <div className="space-y-1.5">
              {bank.map(([k, v]) => (
                <CopyRow key={k} label={k} value={v} compact />
              ))}
            </div>
          </div>
        )}
        {other && <p className="whitespace-pre-line text-zinc-600">{other}</p>}
      </div>
    </div>
  )
}

function CopyRow({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className={`flex items-center justify-between gap-2 ${compact ? '' : 'rounded-xl border border-zinc-200 px-3 py-2'}`}>
      <div className="min-w-0">
        <div className="text-xs text-zinc-500">{label}</div>
        <div className="truncate font-medium text-zinc-900">{value}</div>
      </div>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        onClick={() => {
          navigator.clipboard?.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  )
}

export function ReportPaymentModal({
  open,
  onClose,
  settings,
  currency,
  due,
  defaultName,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  settings: Settings
  currency: Invoice['currency']
  /** Still owed, in cents: the default amount. */
  due: number
  defaultName: string
  onSubmit: (body: { name: string; method: string; amount: number; reference: string; paidOn: string; note: string; proof?: string }) => Promise<void>
}) {
  const methods = paymentMethods(settings.payment)
  const [name, setName] = useState(defaultName)
  const [method, setMethod] = useState(methods[0])
  const [amount, setAmount] = useState(due / 100)
  const [reference, setReference] = useState('')
  const [paidOn, setPaidOn] = useState(todayISO())
  const [note, setNote] = useState('')
  const [proof, setProof] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const wallet = ['bKash', 'Nagad', 'Rocket'].includes(method)

  async function submit() {
    setError('')
    if (!name.trim()) return setError('Please enter your name.')
    if (!(amount > 0)) return setError('Please enter the amount you paid.')
    if (wallet && !reference.trim()) return setError(`Please enter the ${method} transaction ID (TrxID).`)
    setBusy(true)
    try {
      await onSubmit({ name: name.trim(), method, amount, reference: reference.trim(), paidOn, note: note.trim(), proof })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title="Tell us you’ve paid" onClose={onClose}>
      <div className="space-y-4">
        <p className="-mt-3 text-sm text-zinc-500">
          {settings.businessName || 'The sender'} will check the payment and mark the invoice as paid. Amount due: <b className="text-zinc-800">{formatMoney(due, currency)}</b>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Your name *">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Paid with">
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
              {methods.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Amount paid *">
            <NumberInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Date paid">
            <input type="date" className={inputCls} value={paidOn} max={todayISO()} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        </div>
        <Field label={wallet ? `${method} transaction ID (TrxID) *` : 'Transaction ID / reference'}>
          <input className={inputCls} placeholder={wallet ? 'Ex. 8N7A6D5C4B' : 'Optional'} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <div>
          <div className="mb-1.5 text-sm font-medium text-zinc-700">Payment screenshot (optional)</div>
          <div className="flex items-center gap-3">
            <label className="flex h-16 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-zinc-300 bg-white hover:border-blue-400">
              {proof ? <img src={proof} alt="Payment screenshot" className="h-full w-full object-cover" /> : <ImagePlus className="h-5 w-5 text-zinc-400" />}
              <input
                type="file"
                accept="image/*"
                aria-label="Upload payment screenshot"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  try {
                    setProof(await compressImage(f))
                  } catch (err) {
                    setError((err as Error).message)
                  }
                }}
              />
            </label>
            {proof && (
              <button type="button" className="text-sm text-zinc-500 hover:text-red-600" onClick={() => setProof(undefined)}>
                Remove
              </button>
            )}
          </div>
        </div>
        <Field label="Note (optional)">
          <textarea rows={2} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={busy ? Loader2 : Check} disabled={busy} onClick={submit}>
            {busy ? 'Sending…' : 'Send payment details'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function ConfirmInvoiceModal({
  open,
  onClose,
  total,
  defaultName,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  total: string
  defaultName: string
  onSubmit: (body: { name: string; note: string }) => Promise<void>
}) {
  const [name, setName] = useState(defaultName)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <Modal open={open} title="Confirm invoice" onClose={onClose}>
      <div className="space-y-3">
        <p className="-mt-3 text-sm text-zinc-500">Let the sender know you’ve received this invoice and agree with the amount ({total}).</p>
        <Field label="Your name *">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Note (optional)">
          <textarea rows={2} className={inputCls} placeholder="Ex. We’ll pay by Friday." value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            icon={BadgeCheck}
            disabled={busy}
            onClick={async () => {
              setError('')
              if (!name.trim()) return setError('Please enter your name.')
              setBusy(true)
              try {
                await onSubmit({ name: name.trim(), note: note.trim() })
              } catch (e) {
                setError((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            Confirm invoice
          </Button>
        </div>
      </div>
    </Modal>
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
