import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Acceptance, Currency, FontId, LineItem, Settings } from '../db'
import { calcTotals, formatMoney } from '../lib/invoice'

// Building blocks shared by the invoice templates and the proposal document.

export const FONTS: Record<FontId, { label: string; family: string }> = {
  jakarta: { label: 'Plus Jakarta Sans', family: '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif' },
  inter: { label: 'Inter', family: '"Inter", ui-sans-serif, system-ui, sans-serif' },
  lora: { label: 'Lora (serif)', family: '"Lora", Georgia, serif' },
}

export const docFont = (s: Settings) => (FONTS[s.font] ?? FONTS.jakarta).family

export function paymentRows(s: Settings): Array<[string, string]> {
  const p = s.payment
  return (
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
    ] as Array<[string, string]>
  ).filter(([, v]) => v.trim())
}

export function ItemsTable({
  items,
  currency,
  taxLabel,
  headStyle,
  headClass = 'bg-zinc-50 text-zinc-500',
}: {
  items: LineItem[]
  currency: Currency
  taxLabel: string
  headStyle?: React.CSSProperties
  headClass?: string
}) {
  const { lines } = calcTotals({ items, discountType: 'fixed', discountValue: 0 })
  const money = (c: number) => formatMoney(c, currency)
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className={`text-left ${headClass}`} style={headStyle}>
          <th className="rounded-l-md px-3 py-2.5 font-medium">Item Name</th>
          <th className="w-14 px-3 py-2.5 text-center font-medium">QTY</th>
          <th className="w-28 px-3 py-2.5 text-right font-medium">Rate</th>
          <th className="w-16 px-3 py-2.5 text-center font-medium">{taxLabel}</th>
          <th className="w-32 rounded-r-md px-3 py-2.5 text-right font-medium">Amount</th>
        </tr>
      </thead>
      <tbody className="text-zinc-800">
        {items.map((item, i) => (
          <tr key={item.id} className="avoid-break border-b border-zinc-100 align-top">
            <td className="whitespace-pre-line px-3 py-2.5">{item.description || <span className="text-zinc-300">Item name</span>}</td>
            <td className="px-3 py-2.5 text-center">{item.qty}</td>
            <td className="px-3 py-2.5 text-right">{money(Math.round((Number(item.rate) || 0) * 100))}</td>
            <td className="px-3 py-2.5 text-center">{Number(item.taxRate) || 0}%</td>
            <td className="px-3 py-2.5 text-right">{money(lines[i])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function TotalsBox({
  doc,
  currency,
  taxLabel,
  accent,
  className = 'rounded-lg bg-zinc-50 px-3 py-2',
  totalLabel = 'Grand Total',
}: {
  doc: { items: LineItem[]; discountType: 'percent' | 'fixed'; discountValue: number }
  currency: Currency
  taxLabel: string
  accent: string
  className?: string
  totalLabel?: string
}) {
  const t = calcTotals(doc)
  const money = (c: number) => formatMoney(c, currency)
  return (
    <div className={`avoid-break ${className}`}>
      <Row label="Subtotal" value={money(t.subtotal)} />
      {t.discount > 0 && <Row label={`Discount${doc.discountType === 'percent' ? ` (${doc.discountValue}%)` : ''}`} value={`-${money(t.discount)}`} />}
      <Row label={taxLabel} value={money(t.tax)} />
      <div className="mt-1 flex justify-between border-t border-zinc-200 pt-2.5 pb-1 text-[14px] font-bold text-zinc-900">
        <span>{totalLabel}</span>
        <span style={{ color: accent }}>{money(t.total)}</span>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5">
      <span>{label}</span>
      <span className="font-medium text-zinc-800">{value}</span>
    </div>
  )
}

export function PaymentBlock({ settings, title = 'Payment Method' }: { settings: Settings; title?: string }) {
  const rows = paymentRows(settings)
  const other = settings.payment.other.trim()
  if (!rows.length && !other) return null
  return (
    <div>
      <div className="mb-1 font-semibold text-zinc-900">{title}</div>
      {rows.map(([k, v]) => (
        <div key={k}>
          {k}: <span className="text-zinc-700">{v}</span>
        </div>
      ))}
      {other && <div className="whitespace-pre-line">{other}</div>}
    </div>
  )
}

export function SignatureBlock({ image, name, caption = 'Authorized signature' }: { image?: string; name: string; caption?: string }) {
  if (!image && !name) return null
  return (
    <div className="min-w-40 text-center">
      {image ? <img src={image} alt="" className="mx-auto mb-1 max-h-14 max-w-[160px] object-contain" /> : <div className="h-12" />}
      <div className="border-t border-zinc-300 pt-1.5 font-semibold text-zinc-900">{name}</div>
      <div className="text-[11px]">{caption}</div>
    </div>
  )
}

export function ClientSignature({ acceptance }: { acceptance?: Pick<Acceptance, 'name' | 'signature' | 'signedAt'> | null }) {
  if (!acceptance)
    return (
      <div className="min-w-48 text-center">
        <div className="h-12" />
        <div className="border-t border-dashed border-zinc-300 pt-1.5 text-zinc-400">Awaiting client signature</div>
      </div>
    )
  return (
    <div className="min-w-48 text-center">
      <img src={acceptance.signature} alt="" className="mx-auto mb-1 max-h-14 max-w-[180px] object-contain" />
      <div className="border-t border-zinc-300 pt-1.5 font-semibold text-zinc-900">{acceptance.name}</div>
      <div className="text-[11px]">Signed {new Date(acceptance.signedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</div>
    </div>
  )
}

/** Renders a document into #print-root so window.print() outputs only that document. */
export function PrintPortal({ children }: { children: ReactNode }) {
  const target = document.getElementById('print-root')
  return target ? createPortal(children, target) : null
}

/** Gray "desk" with an A4-wide document scaled to fit its width, so it never forces horizontal scrolling. */
export function ScaledFrame({ header, children }: { header?: ReactNode; children: ReactNode }) {
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
          <div className="rounded-sm shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_-6px_rgba(0,0,0,0.08)]" style={{ zoom }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
