import { useEffect, useRef, useState } from 'react'
import type { Invoice, Settings } from '../db'
import { calcTotals, formatDate, formatMoney } from '../lib/invoice'

export function InvoicePreview({ invoice, settings }: { invoice: Invoice; settings: Settings }) {
  const t = calcTotals(invoice)
  const money = (c: number) => formatMoney(c, invoice.currency)
  const accent = settings.accentColor || '#2563eb'
  const p = settings.payment
  const paymentRows = (
    [
      ['Bank', p.bankName],
      ['Account name', p.accountName],
      ['Account no.', p.accountNumber],
      ['Branch', p.branch],
      ['Routing no.', p.routingNumber],
      ['SWIFT', p.swift],
      ['bKash', p.bkash],
      ['Nagad', p.nagad],
      ['Rocket', p.rocket],
    ] as const
  ).filter(([, v]) => v.trim())
  const c = invoice.client

  return (
    <div
      className="print-area relative bg-white text-[13px] leading-relaxed text-slate-700 shadow-lg"
      style={{ width: '210mm', minHeight: '297mm', padding: '16mm 16mm 20mm' }}
    >
      <div className="absolute inset-x-0 top-0 h-2" style={{ background: accent }} />

      {invoice.status === 'paid' && (
        <div className="pointer-events-none absolute right-[16mm] top-[60mm] rotate-[-12deg] rounded-md border-4 border-emerald-500 px-4 py-1 text-3xl font-bold tracking-widest text-emerald-500 opacity-70">
          PAID
        </div>
      )}

      <header className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          {settings.logo && <img src={settings.logo} alt="" className="mb-3 max-h-16 max-w-[180px] object-contain" />}
          <div className="text-base font-semibold text-slate-900">{settings.businessName || 'Your Business Name'}</div>
          <div className="whitespace-pre-line text-slate-500">{settings.address}</div>
          <div className="text-slate-500">{[settings.phone, settings.email, settings.website].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-3xl font-bold tracking-tight" style={{ color: accent }}>
            INVOICE
          </div>
          <div className="mt-1 font-medium text-slate-900">{invoice.number}</div>
        </div>
      </header>

      <section className="mt-10 grid grid-cols-2 gap-8">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Bill to</div>
          <div className="font-semibold text-slate-900">{c.name || 'Client name'}</div>
          {c.company && <div>{c.company}</div>}
          <div className="whitespace-pre-line text-slate-500">{c.address}</div>
          <div className="text-slate-500">{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="ml-auto grid grid-cols-[auto_auto] gap-x-6 gap-y-1 self-start text-right">
          <span className="text-slate-400">Issue date</span>
          <span className="font-medium text-slate-900">{formatDate(invoice.issueDate)}</span>
          <span className="text-slate-400">Due date</span>
          <span className="font-medium text-slate-900">{formatDate(invoice.dueDate)}</span>
          <span className="text-slate-400">Amount due</span>
          <span className="font-semibold text-slate-900">{money(invoice.status === 'paid' ? 0 : t.total)}</span>
        </div>
      </section>

      <table className="mt-10 w-full border-collapse">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-white" style={{ background: accent }}>
            <th className="px-3 py-2 font-semibold">Description</th>
            <th className="w-16 px-3 py-2 text-right font-semibold">Qty</th>
            <th className="w-28 px-3 py-2 text-right font-semibold">Rate</th>
            <th className="w-16 px-3 py-2 text-right font-semibold">{settings.taxLabel || 'Tax'}</th>
            <th className="w-32 px-3 py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, i) => (
            <tr key={item.id} className="border-b border-slate-100 align-top">
              <td className="whitespace-pre-line px-3 py-2.5 text-slate-900">{item.description || <span className="text-slate-300">Item description</span>}</td>
              <td className="px-3 py-2.5 text-right">{item.qty}</td>
              <td className="px-3 py-2.5 text-right">{money(Math.round((Number(item.rate) || 0) * 100))}</td>
              <td className="px-3 py-2.5 text-right">{Number(item.taxRate) || 0}%</td>
              <td className="px-3 py-2.5 text-right font-medium text-slate-900">{money(t.lines[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 flex justify-end">
        <div className="w-72">
          <Row label="Subtotal" value={money(t.subtotal)} />
          {t.discount > 0 && (
            <Row
              label={`Discount${invoice.discountType === 'percent' ? ` (${invoice.discountValue}%)` : ''}`}
              value={`-${money(t.discount)}`}
            />
          )}
          <Row label={settings.taxLabel || 'Tax'} value={money(t.tax)} />
          <div className="mt-2 flex justify-between rounded-md px-3 py-2.5 text-base font-bold text-white" style={{ background: accent }}>
            <span>Total</span>
            <span>{money(t.total)}</span>
          </div>
        </div>
      </div>

      <section className="mt-12 grid grid-cols-2 gap-8">
        {(paymentRows.length > 0 || p.other.trim()) && (
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Payment details</div>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
              {paymentRows.map(([k, v]) => (
                <div key={k} className="contents">
                  <span className="text-slate-400">{k}</span>
                  <span className="font-medium text-slate-900">{v}</span>
                </div>
              ))}
            </div>
            {p.other.trim() && <div className="mt-1 whitespace-pre-line">{p.other}</div>}
          </div>
        )}
        <div className="space-y-4">
          {invoice.notes.trim() && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Notes</div>
              <div className="whitespace-pre-line">{invoice.notes}</div>
            </div>
          )}
          {invoice.terms.trim() && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Terms</div>
              <div className="whitespace-pre-line text-slate-500">{invoice.terms}</div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 px-3 py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  )
}

/** Scales the A4 page down to fit its container, so it never forces horizontal scrolling. */
export function ScaledPreview({ invoice, settings }: { invoice: Invoice; settings: Settings }) {
  const ref = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const A4_PX = 794 // 210mm at 96dpi
    const ro = new ResizeObserver(([entry]) => setZoom(Math.min(1, entry.contentRect.width / A4_PX)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="rounded-lg bg-slate-200/70 p-3 sm:p-5">
      <div ref={ref} className="mx-auto max-w-[210mm]">
        <div className="preview-zoom" style={{ zoom }}>
          <InvoicePreview invoice={invoice} settings={settings} />
        </div>
      </div>
    </div>
  )
}
