import { useState } from 'react'
import { BadgeCheck, Check, Image, Loader2, Wallet, X } from 'lucide-react'
import type { Invoice } from '../db'
import { formatDate, formatMoney, toCents } from '../lib/invoice'
import { confirmReported, rejectReported } from '../lib/payments'
import { fetchProof, timeAgo, type Activity, type PaymentReport } from '../lib/share'
import { Button, Modal } from './ui'

const panel = 'rounded-2xl border border-zinc-200 p-5'

/** What the client did on the invoice link: confirmed it, reported payments — and your review. */
export function ClientResponsePanel({ invoice, activity, onChanged }: { invoice: Invoice; activity: Activity | null; onChanged: () => void }) {
  const state = activity?.invoice
  if (!state || (!state.confirmation && !state.payments.length)) return null
  const pending = state.payments.filter((p) => p.status === 'pending')
  return (
    <div className={`${panel} ${pending.length ? 'border-amber-300 bg-amber-50/40' : ''}`}>
      <div className="mb-3 flex items-center gap-2 font-semibold text-zinc-900">
        <Wallet className="h-4 w-4" /> Client response
        {pending.length > 0 && <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">{pending.length} to review</span>}
      </div>
      {state.confirmation && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>{state.confirmation.name}</b> confirmed this invoice {timeAgo(state.confirmation.at)}.
            {state.confirmation.note && <span className="mt-1 block text-emerald-900">“{state.confirmation.note}”</span>}
          </span>
        </div>
      )}
      <div className="space-y-3">
        {[...state.payments].reverse().map((p) => (
          <ReportCard key={p.id} invoice={invoice} report={p} onChanged={onChanged} />
        ))}
      </div>
    </div>
  )
}

function ReportCard({ invoice, report: p, onChanged }: { invoice: Invoice; report: PaymentReport; onChanged: () => void }) {
  const [busy, setBusy] = useState<'ok' | 'no' | null>(null)
  const [proof, setProof] = useState<string | null>(null)
  const [error, setError] = useState('')
  const money = formatMoney(toCents(p.amount), invoice.currency)

  async function run(kind: 'ok' | 'no', fn: () => Promise<unknown>) {
    setBusy(kind)
    setError('')
    try {
      await fn()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-zinc-900">
            {money} <span className="font-normal text-zinc-500">via {p.method}</span>
          </div>
          <div className="text-xs text-zinc-500">
            {p.name} · paid {formatDate(p.paidOn)} · reported {timeAgo(p.at)}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            p.status === 'pending' ? 'bg-amber-100 text-amber-800' : p.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {p.status === 'pending' ? 'To review' : p.status === 'confirmed' ? 'Received' : 'Not received'}
        </span>
      </div>
      {(p.reference || p.note) && (
        <dl className="mt-2 space-y-0.5 text-xs">
          {p.reference && (
            <div>
              <dt className="inline text-zinc-500">Transaction ID: </dt>
              <dd className="inline font-mono font-medium text-zinc-900">{p.reference}</dd>
            </div>
          )}
          {p.note && <div className="text-zinc-600">“{p.note}”</div>}
        </dl>
      )}
      {p.reason && <p className="mt-1 text-xs text-red-700">Your reply: {p.reason}</p>}
      {p.hasProof && (
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline"
          onClick={async () => {
            try {
              setProof((await fetchProof(invoice.share!, p.id)).proof)
            } catch (e) {
              setError((e as Error).message)
            }
          }}
        >
          <Image className="h-3.5 w-3.5" /> View screenshot
        </button>
      )}
      {p.status === 'pending' && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button icon={busy === 'ok' ? Loader2 : Check} disabled={!!busy} className="!py-1.5 text-xs" onClick={() => run('ok', () => confirmReported(invoice, p))}>
            Received
          </Button>
          <Button
            variant="secondary"
            icon={busy === 'no' ? Loader2 : X}
            disabled={!!busy}
            className="!py-1.5 text-xs"
            onClick={() => {
              const reason = prompt('Why couldn’t you confirm it? Your client sees this.', 'I couldn’t find this payment. Please check the transaction ID.')
              if (reason !== null) run('no', async () => rejectReported(invoice, p, reason))
            }}
          >
            Not received
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <Modal open={!!proof} title="Payment screenshot" onClose={() => setProof(null)}>
        {proof && <img src={proof} alt="Payment screenshot" className="mx-auto max-h-[70vh] rounded-lg" />}
      </Modal>
    </div>
  )
}

/** Payments recorded on the invoice so far. */
export function PaymentList({ invoice }: { invoice: Invoice }) {
  if (!invoice.payments?.length) return null
  return (
    <div className="mt-4 border-t border-zinc-100 pt-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Payments received</div>
      <ul className="space-y-1.5 text-sm">
        {invoice.payments.map((p) => (
          <li key={p.id} className="flex justify-between gap-3">
            <span className="min-w-0 truncate text-zinc-600">
              {formatDate(p.paidOn)} · {p.method}
              {p.reference && <span className="font-mono text-xs text-zinc-400"> {p.reference}</span>}
            </span>
            <span className="shrink-0 font-medium text-zinc-900">{formatMoney(toCents(p.amount), invoice.currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
