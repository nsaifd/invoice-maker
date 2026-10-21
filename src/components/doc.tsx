import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Acceptance, Currency, DocStyle, LineItem, Settings } from '../db'
import { fontStack, loadFont } from '../lib/fonts'
import { calcTotals, formatMoney, toCents } from '../lib/invoice'
import { amountInWords } from '../lib/words'

// Building blocks shared by the invoice templates and the proposal document.

export { FONTS } from '../lib/fonts'

/** Font stack for a document; also makes sure the font file is loading. */
export function docFont(s: Pick<DocStyle, 'font'>): string {
  loadFont(s.font)
  return fontStack(s.font)
}

/** Resolved design tokens used by the building blocks. */
export interface Look {
  accent: string
  accent2: string
  radius: number
  table: DocStyle['tableStyle']
  showTax: boolean
  fontSize: number
}

export function lookOf(s: Partial<DocStyle>): Look {
  return {
    accent: s.accentColor || '#2563eb',
    accent2: s.accent2 || '#93c5fd',
    radius: { none: 0, sm: 6, lg: 14 }[s.radius ?? 'sm'],
    table: s.tableStyle ?? 'lines',
    showTax: s.showTaxColumn ?? true,
    fontSize: { sm: 11.5, md: 12.5, lg: 13.5 }[s.textSize ?? 'md'],
  }
}

const DEFAULT_LOOK = lookOf({})

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

export type HeadStyle = 'soft' | 'accent' | 'tint' | 'line' | 'dark'

export function ItemsTable({
  items,
  currency,
  taxLabel,
  look = DEFAULT_LOOK,
  head = 'soft',
  headStyle,
  headClass,
}: {
  items: LineItem[]
  currency: Currency
  taxLabel: string
  look?: Look
  head?: HeadStyle
  /** Legacy overrides used by proposals. */
  headStyle?: CSSProperties
  headClass?: string
}) {
  const { lines } = calcTotals({ items, discountType: 'fixed', discountValue: 0 })
  const money = (c: number) => formatMoney(c, currency)
  const grid = look.table === 'grid'
  const r = grid ? 0 : look.radius
  const heads: Record<HeadStyle, { cls: string; style?: CSSProperties }> = {
    soft: { cls: 'bg-zinc-50 text-zinc-500' },
    accent: { cls: 'text-white', style: { background: look.accent } },
    tint: { cls: 'text-zinc-900 font-semibold', style: { background: `${look.accent}16` } },
    line: { cls: 'text-zinc-900 uppercase tracking-wider text-[0.82em]', style: { borderTop: `1.5px solid ${look.accent}`, borderBottom: `1.5px solid ${look.accent}` } },
    dark: { cls: 'bg-zinc-900 text-white' },
  }
  const h = heads[head]
  const cell = grid ? 'border border-zinc-300' : ''
  const rowCls = (i: number) => {
    if (grid) return 'align-top'
    if (look.table === 'striped') return `align-top ${i % 2 ? 'bg-zinc-50/80' : ''}`
    if (look.table === 'lines') return 'align-top border-b border-zinc-100'
    return 'align-top'
  }
  const thFirst = { borderTopLeftRadius: r, borderBottomLeftRadius: r }
  const thLast = { borderTopRightRadius: r, borderBottomRightRadius: r }
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className={`text-left ${headClass ?? h.cls}`} style={headStyle ?? h.style}>
          <th className={`px-3 py-2.5 font-medium ${cell}`} style={thFirst}>
            Item Name
          </th>
          <th className={`w-14 px-3 py-2.5 text-center font-medium ${cell}`}>QTY</th>
          <th className={`w-28 px-3 py-2.5 text-right font-medium ${cell}`}>Rate</th>
          {look.showTax && <th className={`w-16 px-3 py-2.5 text-center font-medium ${cell}`}>{taxLabel}</th>}
          <th className={`w-32 px-3 py-2.5 text-right font-medium ${cell}`} style={thLast}>
            Amount
          </th>
        </tr>
      </thead>
      <tbody className="text-zinc-800">
        {items.map((item, i) => (
          <tr key={item.id} className={`avoid-break ${rowCls(i)}`}>
            <td className={`whitespace-pre-line px-3 py-2.5 ${cell}`} style={look.table === 'striped' ? { borderTopLeftRadius: r, borderBottomLeftRadius: r } : undefined}>
              {item.description || <span className="text-zinc-300">Item name</span>}
            </td>
            <td className={`px-3 py-2.5 text-center ${cell}`}>{item.qty}</td>
            <td className={`px-3 py-2.5 text-right ${cell}`}>{money(toCents(item.rate))}</td>
            {look.showTax && <td className={`px-3 py-2.5 text-center ${cell}`}>{Number(item.taxRate) || 0}%</td>}
            <td className={`px-3 py-2.5 text-right ${cell}`} style={look.table === 'striped' ? { borderTopRightRadius: r, borderBottomRightRadius: r } : undefined}>
              {money(lines[i])}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export type TotalsVariant = 'box' | 'lines' | 'accent' | 'grid' | 'gradient'

export function TotalsBox({
  doc,
  currency,
  taxLabel,
  accent,
  look,
  variant = 'box',
  className = '',
  totalLabel = 'Grand Total',
}: {
  doc: { items: LineItem[]; discountType: 'percent' | 'fixed'; discountValue: number }
  currency: Currency
  taxLabel: string
  /** Legacy: proposals pass only an accent color. */
  accent?: string
  look?: Look
  variant?: TotalsVariant
  className?: string
  totalLabel?: string
}) {
  const L = look ?? { ...DEFAULT_LOOK, accent: accent ?? DEFAULT_LOOK.accent }
  const t = calcTotals(doc)
  const money = (c: number) => formatMoney(c, currency)
  const rows: Array<[string, string]> = [['Subtotal', money(t.subtotal)]]
  if (t.discount > 0) rows.push([`Discount${doc.discountType === 'percent' ? ` (${doc.discountValue}%)` : ''}`, `-${money(t.discount)}`])
  if (t.tax > 0 || L.showTax) rows.push([taxLabel, money(t.tax)])

  if (variant === 'grid')
    return (
      <table className={`avoid-break border-collapse ${className}`}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="border border-zinc-300 px-3 py-1.5">{k}</td>
              <td className="border border-zinc-300 px-3 py-1.5 text-right font-medium text-zinc-800">{v}</td>
            </tr>
          ))}
          <tr className="font-bold text-white" style={{ background: L.accent }}>
            <td className="border px-3 py-2" style={{ borderColor: L.accent }}>
              {totalLabel}
            </td>
            <td className="border px-3 py-2 text-right" style={{ borderColor: L.accent }}>
              {money(t.total)}
            </td>
          </tr>
        </tbody>
      </table>
    )

  const filled = variant === 'accent' || variant === 'gradient'
  return (
    <div className={`avoid-break ${variant === 'box' ? 'bg-zinc-50 px-3 py-2' : ''} ${className}`} style={variant === 'box' ? { borderRadius: L.radius } : undefined}>
      {rows.map(([k, v]) => (
        <div key={k} className={`flex justify-between py-1.5 ${variant === 'lines' ? 'border-b border-zinc-100' : ''} ${filled ? 'px-3' : ''}`}>
          <span>{k}</span>
          <span className="font-medium text-zinc-800">{v}</span>
        </div>
      ))}
      {filled ? (
        <div
          className="mt-2 flex justify-between px-3 py-2.5 text-[1.12em] font-bold text-white"
          style={{ borderRadius: L.radius, background: variant === 'gradient' ? `linear-gradient(135deg, ${L.accent}, ${L.accent2})` : L.accent }}
        >
          <span>{totalLabel}</span>
          <span>{money(t.total)}</span>
        </div>
      ) : (
        <div className="mt-1 flex justify-between pb-1 pt-2.5 text-[1.12em] font-bold text-zinc-900" style={{ borderTop: variant === 'lines' ? `2px solid ${L.accent}` : '1px solid #e4e4e7' }}>
          <span>{totalLabel}</span>
          <span style={{ color: L.accent }}>{money(t.total)}</span>
        </div>
      )}
    </div>
  )
}

export function AmountWords({ cents, currency, className = '' }: { cents: number; currency: Currency; className?: string }) {
  return (
    <div className={`avoid-break text-[0.92em] ${className}`}>
      <span className="font-medium text-zinc-700">In words: </span>
      <span className="italic text-zinc-600">{amountInWords(cents, currency)}</span>
    </div>
  )
}

export function PaymentBlock({ settings, title = 'Payment Method', tone = 'dark' }: { settings: Settings; title?: string; tone?: 'dark' | 'light' }) {
  const rows = paymentRows(settings)
  const other = settings.payment.other.trim()
  if (!rows.length && !other) return null
  const light = tone === 'light'
  return (
    <div>
      <div className={`mb-1 font-semibold ${light ? 'text-white' : 'text-zinc-900'}`}>{title}</div>
      {rows.map(([k, v]) => (
        <div key={k}>
          {k}: <span className={light ? 'text-white' : 'text-zinc-700'}>{v}</span>
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
      <div className="text-[0.85em]">{caption}</div>
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

/** Scales an A4-wide (210mm) child down to the available width. */
export function FitToWidth({ children, className = '' }: { children: ReactNode; className?: string }) {
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
    <div ref={ref} className={`mx-auto max-w-[210mm] ${className}`}>
      <div style={{ zoom }}>{children}</div>
    </div>
  )
}

/** Gray "desk" with an A4-wide document scaled to fit its width, so it never forces horizontal scrolling. */
export function ScaledFrame({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
      {header && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-3.5">{header}</div>}
      <div className="p-4 sm:p-6">
        <FitToWidth>
          <div className="rounded-sm shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_-6px_rgba(0,0,0,0.08)]">{children}</div>
        </FitToWidth>
      </div>
    </div>
  )
}
