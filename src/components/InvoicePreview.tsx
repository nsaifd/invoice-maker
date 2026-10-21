import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Invoice, Settings } from '../db'
import { calcTotals, formatDate, formatMoney } from '../lib/invoice'
import { initials } from './ui'

export function InvoicePreview({ invoice, settings }: { invoice: Invoice; settings: Settings }) {
  const t = calcTotals(invoice)
  const money = (c: number) => formatMoney(c, invoice.currency)
  const accent = settings.accentColor || '#2563eb'
  const taxLabel = settings.taxLabel || 'Tax'
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
  const signName = settings.signatory || settings.businessName

  return (
    <div
      className="print-area relative flex flex-col bg-white text-[12.5px] leading-relaxed text-zinc-500"
      style={{ width: '210mm', minHeight: '297mm', padding: '15mm 15mm 16mm' }}
    >
      {invoice.status === 'paid' && (
        <div className="pointer-events-none absolute right-[18mm] top-[52mm] rotate-[-12deg] rounded-lg border-[3px] border-emerald-500 px-4 py-0.5 text-2xl font-extrabold tracking-[0.2em] text-emerald-500 opacity-80">
          PAID
        </div>
      )}

      <header className="flex items-start justify-between gap-8">
        <div>
          <div className="text-[34px] font-extrabold leading-none tracking-tight text-zinc-900">INVOICE</div>
          <div className="mt-3 flex items-center gap-2">
            <span>Invoice Number</span>
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">#{invoice.number}</span>
          </div>
        </div>
        {settings.logo ? (
          <img src={settings.logo} alt="" className="max-h-16 max-w-[160px] object-contain" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white" style={{ background: accent }}>
            {initials(settings.businessName || 'B')}
          </div>
        )}
      </header>

      <div className="-mx-[15mm] mt-7 border-t border-zinc-200" />

      <section className="mt-7 grid grid-cols-2 gap-8">
        <Party label="Billed by:" name={settings.businessName || 'Your Business'} lines={[settings.email, settings.phone, settings.website, settings.address]} />
        <Party label="Billed to:" name={c.name || 'Client name'} lines={[c.company, c.email, c.phone, c.address]} />
      </section>

      <section className="mt-6 grid grid-cols-2 gap-8">
        <div>
          <div>Date Issue:</div>
          <div className="font-semibold text-zinc-900">{formatDate(invoice.issueDate)}</div>
        </div>
        <div>
          <div>Due Date:</div>
          <div className="font-semibold text-zinc-900">{formatDate(invoice.dueDate)}</div>
        </div>
      </section>

      <div className="mt-8 mb-3">Invoice Items/Service:</div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-zinc-50 text-left text-zinc-500">
            <th className="rounded-l-md px-3 py-2.5 font-medium">Item Name</th>
            <th className="w-14 px-3 py-2.5 text-center font-medium">QTY</th>
            <th className="w-28 px-3 py-2.5 text-right font-medium">Rate</th>
            <th className="w-16 px-3 py-2.5 text-center font-medium">{taxLabel}</th>
            <th className="w-32 rounded-r-md px-3 py-2.5 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="text-zinc-800">
          {invoice.items.map((item, i) => (
            <tr key={item.id} className="border-b border-zinc-100 align-top">
              <td className="whitespace-pre-line px-3 py-2.5">{item.description || <span className="text-zinc-300">Item name</span>}</td>
              <td className="px-3 py-2.5 text-center">{item.qty}</td>
              <td className="px-3 py-2.5 text-right">{money(Math.round((Number(item.rate) || 0) * 100))}</td>
              <td className="px-3 py-2.5 text-center">{Number(item.taxRate) || 0}%</td>
              <td className="px-3 py-2.5 text-right">{money(t.lines[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 rounded-lg bg-zinc-50 px-3 py-2">
        <TotalRow label="Subtotal" value={money(t.subtotal)} />
        {t.discount > 0 && (
          <TotalRow label={`Discount${invoice.discountType === 'percent' ? ` (${invoice.discountValue}%)` : ''}`} value={`-${money(t.discount)}`} />
        )}
        <TotalRow label={taxLabel} value={money(t.tax)} />
        <div className="mt-1 flex justify-between border-t border-zinc-200 pt-2.5 pb-1 text-[14px] font-bold text-zinc-900">
          <span>Grand Total</span>
          <span style={{ color: accent }}>{money(t.total)}</span>
        </div>
      </div>

      {invoice.notes.trim() && (
        <div className="mt-4 whitespace-pre-line rounded-md border border-zinc-200 px-3 py-2 text-zinc-600">
          <span className="font-medium text-zinc-800">Note: </span>
          {invoice.notes}
        </div>
      )}
      {invoice.terms.trim() && <div className="mt-3 whitespace-pre-line text-[11.5px]">{invoice.terms}</div>}

      <footer className="mt-auto flex items-end justify-between gap-8 pt-10">
        <div>
          {(paymentRows.length > 0 || p.other.trim()) && (
            <>
              <div className="mb-1 font-semibold text-zinc-900">Payment Method</div>
              {paymentRows.map(([k, v]) => (
                <div key={k}>
                  {k}: <span className="text-zinc-700">{v}</span>
                </div>
              ))}
              {p.other.trim() && <div className="whitespace-pre-line">{p.other}</div>}
            </>
          )}
        </div>
        {(settings.signature || signName) && (
          <div className="min-w-40 text-center">
            {settings.signature ? <img src={settings.signature} alt="" className="mx-auto mb-1 max-h-14 max-w-[160px] object-contain" /> : <div className="h-12" />}
            <div className="border-t border-zinc-300 pt-1.5 font-semibold text-zinc-900">{signName}</div>
            <div className="text-[11px]">Authorized signature</div>
          </div>
        )}
      </footer>
    </div>
  )
}

function Party({ label, name, lines }: { label: string; name: string; lines: string[] }) {
  return (
    <div>
      <div className="mb-1">{label}</div>
      <div className="font-semibold text-zinc-900">{name}</div>
      {lines
        .filter((l) => l?.trim())
        .map((l, i) => (
          <div key={i} className="whitespace-pre-line">
            {l}
          </div>
        ))}
    </div>
  )
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5">
      <span>{label}</span>
      <span className="font-medium text-zinc-800">{value}</span>
    </div>
  )
}

/** Gray "desk" with the A4 page scaled to fit its width, so it never forces horizontal scrolling. */
export function ScaledPreview({ invoice, settings, header }: { invoice: Invoice; settings: Settings; header?: ReactNode }) {
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
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
      {header && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-3.5">{header}</div>}
      <div className="p-4 sm:p-6">
        <div ref={ref} className="mx-auto max-w-[210mm]">
          <div className="preview-zoom rounded-sm shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_-6px_rgba(0,0,0,0.08)]" style={{ zoom }}>
            <InvoicePreview invoice={invoice} settings={settings} />
          </div>
        </div>
      </div>
    </div>
  )
}
