import type { CSSProperties, ReactNode } from 'react'
import type { CustomTemplate, Invoice, Proposal, Settings, Zone } from '../db'
import { fontStack, loadFont } from '../lib/fonts'
import { calcTotals, formatDate, formatMoney, toCents } from '../lib/invoice'
import { proposalTotal } from '../lib/proposal'
import { amountInWords } from '../lib/words'
import { paymentRows } from './doc'
import { initials } from './ui'

export interface ZoneData {
  s: Settings
  invoice?: Invoice
  proposal?: Proposal
}

/** One A4 page: the uploaded design with live data placed in its zones. */
export function CustomPage({
  template,
  background,
  zones,
  data,
  children,
  className = '',
}: {
  template: CustomTemplate
  background: string
  zones: Zone[]
  data: ZoneData
  children?: ReactNode
  className?: string
}) {
  loadFont(template.font)
  return (
    <div className={`custom-page relative overflow-hidden bg-white ${className}`} style={{ width: '210mm', height: '297mm', fontFamily: fontStack(template.font), color: template.ink }}>
      <img src={background} alt="" className="pointer-events-none absolute inset-0 h-full w-full select-none" draggable={false} />
      {/* Hide boxes go underneath, so they can never cover a real field. */}
      {[...zones].sort((a, b) => Number(b.type === 'cover') - Number(a.type === 'cover')).map((z) => (
        <div key={z.id} className="absolute overflow-hidden" style={zoneBox(z, template)}>
          <ZoneContent zone={z} data={data} template={template} />
        </div>
      ))}
      {children}
    </div>
  )
}

export function zoneBox(z: Zone, t: Pick<CustomTemplate, 'font'>): CSSProperties {
  if (z.font) loadFont(z.font)
  return {
    left: `${z.x}mm`,
    top: `${z.y}mm`,
    width: `${z.w}mm`,
    height: `${z.h}mm`,
    fontSize: z.fontSize,
    lineHeight: 1.35,
    color: z.color,
    textAlign: z.align,
    fontWeight: z.bold ? 700 : 400,
    fontFamily: fontStack(z.font ?? t.font),
    background: z.type === 'cover' ? z.fill : undefined,
  }
}

function Label({ zone, children }: { zone: Zone; children: ReactNode }) {
  if (!zone.showLabel) return null
  return <div style={{ fontSize: '0.72em', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.6, marginBottom: '0.2em' }}>{children}</div>
}

const Lines = ({ lines }: { lines: Array<string | undefined> }) => (
  <>
    {lines
      .filter((l) => l?.trim())
      .map((l, i) => (
        <div key={i} style={{ whiteSpace: 'pre-line', fontWeight: 400 }}>
          {l}
        </div>
      ))}
  </>
)

export function ZoneContent({ zone: z, data, template }: { zone: Zone; data: ZoneData; template: CustomTemplate }) {
  const { s, invoice: inv, proposal: p } = data
  const accent = template.accent
  const currency = inv?.currency ?? p?.currency ?? s.currency
  const money = (c: number) => formatMoney(c, currency)

  switch (z.type) {
    case 'cover':
      return null
    case 'text':
      return <div style={{ whiteSpace: 'pre-line' }}>{z.text}</div>
    case 'logo':
      return s.logo ? (
        <img src={s.logo} alt="" className="h-full w-full object-contain" style={{ objectPosition: z.align === 'left' ? 'left center' : z.align === 'right' ? 'right center' : 'center' }} />
      ) : (
        <div className="flex h-full items-center" style={{ justifyContent: z.align === 'left' ? 'flex-start' : z.align === 'right' ? 'flex-end' : 'center' }}>
          <span className="flex aspect-square h-full max-h-16 items-center justify-center rounded-full font-bold text-white" style={{ background: accent, fontSize: '1.2em' }}>
            {initials(s.businessName || 'B')}
          </span>
        </div>
      )
    case 'signature':
      return (
        <div className="flex h-full flex-col justify-end">
          {s.signature && <img src={s.signature} alt="" className="mx-auto mb-1 max-h-[60%] object-contain" style={{ marginLeft: z.align === 'left' ? 0 : undefined, marginRight: z.align === 'right' ? 0 : undefined }} />}
          <div style={{ borderTop: `1px solid ${z.color}55`, paddingTop: '0.3em', fontWeight: 600 }}>{s.signatory || s.businessName}</div>
          <div style={{ fontSize: '0.82em', opacity: 0.7, fontWeight: 400 }}>Authorized signature</div>
        </div>
      )
    case 'business':
      return (
        <div>
          <Label zone={z}>From</Label>
          <div style={{ fontWeight: 700 }}>{s.businessName || 'Your Business'}</div>
          <Lines lines={[s.email, s.phone, s.website, s.address]} />
        </div>
      )
  }

  if (inv) {
    const t = calcTotals(inv)
    switch (z.type) {
      case 'title':
        return <div>{s.docTitle || 'Invoice'}</div>
      case 'number':
        return (
          <div>
            <Label zone={z}>Invoice No.</Label>
            {inv.number}
          </div>
        )
      case 'issueDate':
        return (
          <div>
            <Label zone={z}>Issue date</Label>
            {formatDate(inv.issueDate)}
          </div>
        )
      case 'dueDate':
        return (
          <div>
            <Label zone={z}>Due date</Label>
            {formatDate(inv.dueDate)}
          </div>
        )
      case 'client':
        return (
          <div>
            <Label zone={z}>Bill to</Label>
            <div style={{ fontWeight: 700 }}>{inv.client.name || 'Client name'}</div>
            <Lines lines={[inv.client.company, inv.client.email, inv.client.phone, inv.client.address]} />
          </div>
        )
      case 'items':
        return <ZoneItems inv={inv} s={s} zone={z} accent={accent} />
      case 'totals':
        return (
          <div style={{ fontWeight: 400 }}>
            {(
              [
                ['Subtotal', money(t.subtotal)],
                t.discount > 0 ? [`Discount${inv.discountType === 'percent' ? ` (${inv.discountValue}%)` : ''}`, `-${money(t.discount)}`] : null,
                t.tax > 0 ? [s.taxLabel || 'Tax', money(t.tax)] : null,
              ].filter(Boolean) as Array<[string, string]>
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3" style={{ padding: '0.15em 0' }}>
                <span style={{ opacity: 0.75 }}>{k}</span>
                <span>{v}</span>
              </div>
            ))}
            <div className="flex justify-between gap-3" style={{ borderTop: `1.5px solid ${accent}`, marginTop: '0.3em', paddingTop: '0.35em', fontWeight: 700, fontSize: '1.15em' }}>
              <span>Total</span>
              <span style={{ color: accent }}>{money(t.total)}</span>
            </div>
          </div>
        )
      case 'amountDue':
        return (
          <div>
            <Label zone={z}>Amount due</Label>
            {money(inv.status === 'paid' ? 0 : t.total)}
          </div>
        )
      case 'words':
        return (
          <div>
            <span style={{ fontWeight: 600 }}>In words: </span>
            <span style={{ fontStyle: 'italic', fontWeight: 400 }}>{amountInWords(t.total, inv.currency)}</span>
          </div>
        )
      case 'notes':
        return (
          <div>
            <Label zone={z}>Notes</Label>
            <div style={{ whiteSpace: 'pre-line', fontWeight: 400 }}>{inv.notes}</div>
          </div>
        )
      case 'terms':
        return (
          <div>
            <Label zone={z}>Terms</Label>
            <div style={{ whiteSpace: 'pre-line', fontWeight: 400 }}>{inv.terms}</div>
          </div>
        )
      case 'payment':
        return (
          <div>
            <Label zone={z}>Payment details</Label>
            {paymentRows(s).map(([k, v]) => (
              <div key={k} style={{ fontWeight: 400 }}>
                <span style={{ opacity: 0.7 }}>{k}:</span> {v}
              </div>
            ))}
            {s.payment.other.trim() && <div style={{ whiteSpace: 'pre-line', fontWeight: 400 }}>{s.payment.other}</div>}
          </div>
        )
    }
  }

  if (p) {
    const cover = p.blocks.find((b) => b.type === 'cover')
    switch (z.type) {
      case 'proposalTitle':
        return <div style={{ lineHeight: 1.12 }}>{p.title || 'Untitled proposal'}</div>
      case 'subtitle':
        return <div style={{ whiteSpace: 'pre-line' }}>{cover?.type === 'cover' ? cover.subtitle : ''}</div>
      case 'preparedFor':
        return (
          <div>
            <Label zone={z}>Prepared for</Label>
            <div style={{ fontWeight: 700 }}>{p.client.name || 'Client name'}</div>
            <Lines lines={[p.client.company, p.client.email]} />
          </div>
        )
      case 'preparedBy':
        return (
          <div>
            <Label zone={z}>Prepared by</Label>
            <div style={{ fontWeight: 700 }}>{s.businessName || 'Your Business'}</div>
            <Lines lines={[s.email, s.phone]} />
          </div>
        )
      case 'date':
        return (
          <div>
            <Label zone={z}>Date</Label>
            {formatDate(p.date)}
          </div>
        )
      case 'validUntil':
        return (
          <div>
            <Label zone={z}>Valid until</Label>
            {formatDate(p.validUntil)}
          </div>
        )
      case 'proposalNumber':
        return (
          <div>
            <Label zone={z}>Proposal No.</Label>
            {p.number}
          </div>
        )
      case 'proposalTotal':
        return (
          <div>
            <Label zone={z}>Total investment</Label>
            {money(proposalTotal(p))}
          </div>
        )
    }
  }
  return null
}

function ZoneItems({ inv, s, zone, accent }: { inv: Invoice; s: Settings; zone: Zone; accent: string }) {
  const { lines } = calcTotals({ items: inv.items, discountType: 'fixed', discountValue: 0 })
  const money = (c: number) => formatMoney(c, inv.currency)
  const head = zone.fill || accent
  const showTax = s.showTaxColumn
  const th: CSSProperties = { padding: '0.45em 0.6em', fontWeight: 600, background: head, color: '#fff' }
  const td: CSSProperties = { padding: '0.45em 0.6em', borderBottom: `1px solid ${zone.color}22`, verticalAlign: 'top', fontWeight: 400 }
  return (
    <table className="w-full border-collapse" style={{ textAlign: 'left' }}>
      <thead>
        <tr>
          <th style={th}>Item</th>
          <th style={{ ...th, textAlign: 'center', width: '9%' }}>Qty</th>
          <th style={{ ...th, textAlign: 'right', width: '19%' }}>Rate</th>
          {showTax && <th style={{ ...th, textAlign: 'center', width: '10%' }}>{s.taxLabel || 'Tax'}</th>}
          <th style={{ ...th, textAlign: 'right', width: '21%' }}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {inv.items.map((it, i) => (
          <tr key={it.id}>
            <td style={{ ...td, whiteSpace: 'pre-line' }}>{it.description || 'Item'}</td>
            <td style={{ ...td, textAlign: 'center' }}>{it.qty}</td>
            <td style={{ ...td, textAlign: 'right' }}>{money(toCents(it.rate))}</td>
            {showTax && <td style={{ ...td, textAlign: 'center' }}>{Number(it.taxRate) || 0}%</td>}
            <td style={{ ...td, textAlign: 'right' }}>{money(lines[i])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
