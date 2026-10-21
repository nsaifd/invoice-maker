import type { CSSProperties, ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, withStyle, type CustomTemplate, type Invoice, type Settings, type TemplateId } from '../db'
import { CustomPage } from './CustomDesign'
import { calcTotals, formatDate, formatMoney, toCents } from '../lib/invoice'
import { AmountWords, ItemsTable, PaymentBlock, ScaledFrame, SignatureBlock, TotalsBox, docFont, lookOf, type Look } from './doc'
import { initials } from './ui'

type Ctx = { inv: Invoice; s: Settings; L: Look }

/**
 * Renders an invoice as an A4 page using its own design, or the default design from Settings.
 * `customTemplate` is passed where the local database isn't available (the public share page).
 */
export function InvoicePreview({ invoice, settings, customTemplate }: { invoice: Invoice; settings: Settings; customTemplate?: CustomTemplate | null }) {
  const s = withStyle(settings, invoice.style)
  if (s.template === 'custom') return <CustomInvoice invoice={invoice} s={s} given={customTemplate} />
  return <BuiltIn invoice={invoice} s={s} />
}

function CustomInvoice({ invoice, s, given }: { invoice: Invoice; s: Settings; given?: CustomTemplate | null }) {
  const loaded = useLiveQuery(() => (given || !s.customTemplateId ? null : db.templates.get(s.customTemplateId).then((t) => t ?? null)), [given, s.customTemplateId])
  const template = given ?? loaded
  if (template === undefined && !given && s.customTemplateId) return <div className="bg-white" style={{ width: '210mm', height: '297mm' }} />
  // The uploaded design was deleted: fall back to a built-in look instead of a blank page.
  if (!template) return <BuiltIn invoice={invoice} s={{ ...s, template: 'minimal' }} />
  return (
    <div className="invoice-doc relative">
      <CustomPage template={template} background={template.background} zones={template.zones} data={{ s, invoice }} />
      {invoice.status === 'paid' && <PaidStamp />}
    </div>
  )
}

const PaidStamp = () => (
  <div className="pointer-events-none absolute right-[18mm] top-[58mm] z-10 rotate-[-12deg] rounded-lg border-[3px] border-emerald-500 bg-white/70 px-4 py-0.5 text-2xl font-extrabold tracking-[0.2em] text-emerald-500 opacity-80">
    PAID
  </div>
)

function BuiltIn({ invoice, s }: { invoice: Invoice; s: Settings }) {
  const L = lookOf(s)
  const Layout = LAYOUT_COMPONENTS[s.template as Exclude<TemplateId, 'custom'>] ?? Minimal
  return (
    <div
      className="invoice-doc relative flex flex-col overflow-hidden bg-white leading-relaxed text-zinc-500"
      style={{ width: '210mm', minHeight: '297mm', fontFamily: docFont(s), fontSize: L.fontSize }}
    >
      {invoice.status === 'paid' && <PaidStamp />}
      <Layout inv={invoice} s={s} L={L} />
      {s.footerText.trim() && <div className="whitespace-pre-line px-[15mm] pb-[8mm] text-center text-[0.82em] text-zinc-400">{s.footerText}</div>}
    </div>
  )
}

// ---------- shared pieces ----------

const title = (s: Settings) => (s.docTitle || 'Invoice').trim()
const taxOf = (s: Settings) => s.taxLabel || 'Tax'
const signer = (s: Settings) => s.signatory || s.businessName
const total = (inv: Invoice) => calcTotals(inv).total
const due = (inv: Invoice) => formatMoney(inv.status === 'paid' ? 0 : total(inv), inv.currency)
const businessLines = (s: Settings) => [s.email, s.phone, s.website, s.address]
const clientLines = (inv: Invoice) => [inv.client.company, inv.client.email, inv.client.phone, inv.client.address]

function Logo({ s, L, size = 56, onDark }: { s: Settings; L: Look; size?: number; onDark?: boolean }) {
  if (s.logo)
    return (
      <div className={onDark ? 'bg-white p-2' : ''} style={onDark ? { borderRadius: L.radius } : undefined}>
        <img src={s.logo} alt="" className="object-contain" style={{ maxHeight: size, maxWidth: size * 2.8 }} />
      </div>
    )
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{ width: size, height: size, fontSize: size * 0.34, background: onDark ? 'rgba(255,255,255,0.18)' : L.accent, color: '#fff' }}
    >
      {initials(s.businessName || 'B')}
    </div>
  )
}

function Lines({ lines, className = '' }: { lines: string[]; className?: string }) {
  return (
    <>
      {lines
        .filter((l) => l?.trim())
        .map((l, i) => (
          <div key={i} className={`whitespace-pre-line ${className}`}>
            {l}
          </div>
        ))}
    </>
  )
}

function Party({ label, name, lines, labelClass = '', nameClass = 'text-zinc-900' }: { label: string; name: string; lines: string[]; labelClass?: string; nameClass?: string }) {
  return (
    <div>
      {label && <div className={`mb-1 ${labelClass}`}>{label}</div>}
      <div className={`font-semibold ${nameClass}`}>{name}</div>
      <Lines lines={lines} />
    </div>
  )
}

const Caps = ({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) => (
  <div className={`text-[0.8em] font-semibold uppercase tracking-wider ${className}`} style={style}>
    {children}
  </div>
)

function Extras({ inv, s, L, className = 'mt-4' }: Ctx & { className?: string }) {
  return (
    <div className={className}>
      {s.amountInWords && <AmountWords cents={total(inv)} currency={inv.currency} className="mb-3" />}
      {inv.notes.trim() && (
        <div className="avoid-break whitespace-pre-line border border-zinc-200 px-3 py-2 text-zinc-600" style={{ borderRadius: L.radius }}>
          <span className="font-medium text-zinc-800">Note: </span>
          {inv.notes}
        </div>
      )}
      {inv.terms.trim() && <div className="mt-3 whitespace-pre-line text-[0.92em]">{inv.terms}</div>}
    </div>
  )
}

function FooterRow({ s, left }: { s: Settings; left?: ReactNode }) {
  return (
    <footer className="avoid-break mt-auto flex items-end justify-between gap-8 pt-10">
      <div>{left ?? (s.showPayment && <PaymentBlock settings={s} />)}</div>
      {s.showSignature && <SignatureBlock image={s.signature} name={signer(s)} />}
    </footer>
  )
}

const Page = ({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) => (
  <div className={`flex flex-1 flex-col px-[15mm] pb-[14mm] pt-[15mm] ${className}`} style={style}>
    {children}
  </div>
)

// ---------- layouts ----------

function Minimal({ inv, s, L }: Ctx) {
  return (
    <Page>
      <header className="flex items-start justify-between gap-8">
        <div>
          <div className="text-[2.7em] font-extrabold uppercase leading-none tracking-tight text-zinc-900">{title(s)}</div>
          <div className="mt-3 flex items-center gap-2">
            <span>Invoice Number</span>
            <span className="bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700" style={{ borderRadius: L.radius }}>
              #{inv.number}
            </span>
          </div>
        </div>
        <Logo s={s} L={L} />
      </header>
      <div className="-mx-[15mm] mt-7 border-t border-zinc-200" />
      <section className="mt-7 grid grid-cols-2 gap-8">
        <Party label="Billed by:" name={s.businessName || 'Your Business'} lines={businessLines(s)} />
        <Party label="Billed to:" name={inv.client.name || 'Client name'} lines={clientLines(inv)} />
      </section>
      <section className="mt-6 grid grid-cols-2 gap-8">
        <div>
          <div>Date Issue:</div>
          <div className="font-semibold text-zinc-900">{formatDate(inv.issueDate)}</div>
        </div>
        <div>
          <div>Due Date:</div>
          <div className="font-semibold text-zinc-900">{formatDate(inv.dueDate)}</div>
        </div>
      </section>
      <div className="mb-3 mt-8">Invoice Items/Service:</div>
      <ItemsTable items={inv.items} currency={inv.currency} taxLabel={taxOf(s)} look={L} head="soft" />
      <TotalsBox doc={inv} currency={inv.currency} taxLabel={taxOf(s)} look={L} variant="box" className="mt-4" />
      <Extras inv={inv} s={s} L={L} />
      <FooterRow s={s} />
    </Page>
  )
}

function Classic({ inv, s, L }: Ctx) {
  return (
    <>
      <div className="h-2" style={{ background: L.accent }} />
      <Page className="pt-[13mm]">
        <header className="flex items-start justify-between gap-8">
          <div className="min-w-0">
            {s.logo && <img src={s.logo} alt="" className="mb-3 max-h-14 max-w-[170px] object-contain" />}
            <Party label="" name={s.businessName || 'Your Business'} lines={businessLines(s)} />
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[2.4em] font-bold uppercase tracking-tight" style={{ color: L.accent }}>
              {title(s)}
            </div>
            <div className="font-medium text-zinc-900">{inv.number}</div>
          </div>
        </header>
        <section className="mt-10 grid grid-cols-2 gap-8">
          <Party label="BILL TO" name={inv.client.name || 'Client name'} lines={clientLines(inv)} labelClass="text-[0.85em] font-semibold tracking-wider text-zinc-400" />
          <div className="ml-auto grid grid-cols-[auto_auto] gap-x-6 gap-y-1 self-start text-right">
            <span className="text-zinc-400">Issue date</span>
            <span className="font-medium text-zinc-900">{formatDate(inv.issueDate)}</span>
            <span className="text-zinc-400">Due date</span>
            <span className="font-medium text-zinc-900">{formatDate(inv.dueDate)}</span>
            <span className="text-zinc-400">Amount due</span>
            <span className="font-semibold text-zinc-900">{due(inv)}</span>
          </div>
        </section>
        <div className="mt-10">
          <ItemsTable items={inv.items} currency={inv.currency} taxLabel={taxOf(s)} look={L} head="accent" />
        </div>
        <div className="mt-5 flex justify-end">
          <TotalsBox doc={inv} currency={inv.currency} taxLabel={taxOf(s)} look={L} variant="lines" className="w-72" totalLabel="Total" />
        </div>
        <Extras inv={inv} s={s} L={L} />
        <FooterRow s={s} />
      </Page>
    </>
  )
}

function Bold({ inv, s, L }: Ctx) {
  return (
    <>
      <header className="flex items-center justify-between gap-8 px-[15mm] pb-8 pt-[13mm] text-white" style={{ background: L.accent }}>
        <div className="flex items-center gap-4">
          <Logo s={s} L={L} size={52} onDark />
          <div>
            <div className="text-[1.25em] font-bold">{s.businessName || 'Your Business'}</div>
            <div className="text-white/80">{[s.email, s.phone].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[2.7em] font-extrabold uppercase leading-none tracking-tight">{title(s)}</div>
          <div className="mt-2 text-white/85">#{inv.number}</div>
        </div>
      </header>
      <Page className="pt-8">
        <section className="grid grid-cols-3 gap-6">
          <Party label="Billed to" name={inv.client.name || 'Client name'} lines={clientLines(inv)} labelClass="text-[0.85em] font-semibold uppercase tracking-wider" />
          <div>
            <Caps className="mb-1">Issued</Caps>
            <div className="font-semibold text-zinc-900">{formatDate(inv.issueDate)}</div>
            <Caps className="mb-1 mt-3">Due</Caps>
            <div className="font-semibold text-zinc-900">{formatDate(inv.dueDate)}</div>
          </div>
          <div className="p-4 text-right" style={{ background: `${L.accent}12`, borderRadius: L.radius * 1.5 }}>
            <Caps>Total due</Caps>
            <div className="mt-1 text-[1.9em] font-extrabold" style={{ color: L.accent }}>
              {due(inv)}
            </div>
          </div>
        </section>
        <div className="mt-8">
          <ItemsTable items={inv.items} currency={inv.currency} taxLabel={taxOf(s)} look={L} head="tint" />
        </div>
        <div className="mt-5 flex justify-end">
          <TotalsBox doc={inv} currency={inv.currency} taxLabel={taxOf(s)} look={L} variant="accent" className="w-72" />
        </div>
        <Extras inv={inv} s={s} L={L} />
        <FooterRow
          s={s}
          left={
            <>
              {s.showPayment && <PaymentBlock settings={s} />}
              {s.address && <div className="mt-2 whitespace-pre-line text-[0.85em]">{s.address}</div>}
            </>
          }
        />
      </Page>
    </>
  )
}

function Sidebar({ inv, s, L }: Ctx) {
  return (
    <div className="grid flex-1 grid-cols-[64mm_1fr]">
      <aside className="flex flex-col gap-7 px-[9mm] pb-[14mm] pt-[14mm] text-white/75" style={{ background: L.accent }}>
        <div>
          <Logo s={s} L={L} size={50} onDark />
          <div className="mt-4 text-[1.2em] font-bold text-white">{s.businessName || 'Your Business'}</div>
          <Lines lines={businessLines(s)} className="text-[0.92em]" />
        </div>
        <div>
          <Caps className="mb-1.5 text-white/55">Billed to</Caps>
          <div className="font-semibold text-white">{inv.client.name || 'Client name'}</div>
          <Lines lines={clientLines(inv)} className="text-[0.92em]" />
        </div>
        <div className="grid gap-3">
          <div>
            <Caps className="text-white/55">Issued</Caps>
            <div className="font-semibold text-white">{formatDate(inv.issueDate)}</div>
          </div>
          <div>
            <Caps className="text-white/55">Due</Caps>
            <div className="font-semibold text-white">{formatDate(inv.dueDate)}</div>
          </div>
        </div>
        {s.showPayment && (
          <div className="mt-auto text-[0.9em]">
            <PaymentBlock settings={s} tone="light" />
          </div>
        )}
      </aside>
      <main className="flex flex-col px-[11mm] pb-[14mm] pt-[14mm]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[2.6em] font-extrabold uppercase leading-none tracking-tight text-zinc-900">{title(s)}</div>
            <div className="mt-2 font-medium" style={{ color: L.accent }}>
              #{inv.number}
            </div>
          </div>
          <div className="text-right">
            <Caps>Amount due</Caps>
            <div className="text-[1.6em] font-extrabold text-zinc-900">{due(inv)}</div>
          </div>
        </div>
        <div className="mt-10">
          <ItemsTable items={inv.items} currency={inv.currency} taxLabel={taxOf(s)} look={L} head="line" />
        </div>
        <div className="mt-5 flex justify-end">
          <TotalsBox doc={inv} currency={inv.currency} taxLabel={taxOf(s)} look={L} variant="lines" className="w-64" />
        </div>
        <Extras inv={inv} s={s} L={L} />
        {s.showSignature && (
          <footer className="avoid-break mt-auto flex justify-end pt-10">
            <SignatureBlock image={s.signature} name={signer(s)} />
          </footer>
        )}
      </main>
    </div>
  )
}

function Split({ inv, s, L }: Ctx) {
  return (
    <>
      <header className="flex items-stretch justify-between">
        <div className="w-[56%] px-[15mm] pb-[10mm] pt-[14mm] text-white" style={{ background: L.accent, borderBottomRightRadius: L.radius * 4 }}>
          <div className="text-[2.9em] font-extrabold uppercase leading-none tracking-tight">{title(s)}</div>
          <div className="mt-3 text-white/80">No. {inv.number}</div>
          <div className="mt-6 inline-block px-3 py-1.5 font-semibold" style={{ background: 'rgba(255,255,255,0.16)', borderRadius: L.radius }}>
            Amount due {due(inv)}
          </div>
        </div>
        <div className="flex flex-col items-end px-[15mm] pt-[14mm] text-right">
          <Logo s={s} L={L} size={46} />
          <div className="mt-3 font-semibold text-zinc-900">{s.businessName || 'Your Business'}</div>
          <Lines lines={businessLines(s)} className="text-[0.92em]" />
        </div>
      </header>
      <Page className="pt-9">
        <section className="grid grid-cols-4 divide-x divide-zinc-200">
          <div className="col-span-2 pr-5">
            <Caps className="mb-1" style={{ color: L.accent }}>
              Billed to
            </Caps>
            <div className="font-semibold text-zinc-900">{inv.client.name || 'Client name'}</div>
            <Lines lines={clientLines(inv)} />
          </div>
          <div className="px-5">
            <Caps className="mb-1" style={{ color: L.accent }}>
              Issued
            </Caps>
            <div className="font-semibold text-zinc-900">{formatDate(inv.issueDate)}</div>
          </div>
          <div className="pl-5">
            <Caps className="mb-1" style={{ color: L.accent }}>
              Due
            </Caps>
            <div className="font-semibold text-zinc-900">{formatDate(inv.dueDate)}</div>
          </div>
        </section>
        <div className="mt-9">
          <ItemsTable items={inv.items} currency={inv.currency} taxLabel={taxOf(s)} look={L} head="accent" />
        </div>
        <div className="mt-5 flex justify-end">
          <TotalsBox doc={inv} currency={inv.currency} taxLabel={taxOf(s)} look={L} variant="accent" className="w-72" />
        </div>
        <Extras inv={inv} s={s} L={L} />
        <FooterRow s={s} />
      </Page>
    </>
  )
}

function Elegant({ inv, s, L }: Ctx) {
  return (
    <Page className="px-[18mm] pt-[17mm]">
      <header className="text-center">
        <div className="flex justify-center">
          {s.logo ? (
            <img src={s.logo} alt="" className="max-h-14 max-w-[160px] object-contain" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 text-[1.4em] font-semibold" style={{ borderColor: L.accent, color: L.accent }}>
              {initials(s.businessName || 'B')}
            </div>
          )}
        </div>
        <div className="mt-3 text-[1.1em] font-semibold uppercase tracking-[0.3em] text-zinc-900">{s.businessName || 'Your Business'}</div>
        <div className="mt-1 text-[0.9em]">{[s.address.replace(/\n/g, ', '), s.phone, s.email].filter(Boolean).join('  ·  ')}</div>
        <div className="mx-auto mt-6 w-full border-t" style={{ borderColor: L.accent2 }} />
        <div className="mx-auto mt-[3px] w-full border-t" style={{ borderColor: L.accent2 }} />
        <div className="mt-6 text-[2.6em] font-normal uppercase tracking-[0.18em]" style={{ color: L.accent }}>
          {title(s)}
        </div>
        <div className="mt-1 tracking-wide">
          No. {inv.number} · Issued {formatDate(inv.issueDate)} · Due {formatDate(inv.dueDate)}
        </div>
      </header>
      <section className="mt-9 text-center">
        <div className="text-[0.82em] uppercase tracking-[0.25em]">Prepared for</div>
        <div className="mt-1 text-[1.15em] font-semibold text-zinc-900">{inv.client.name || 'Client name'}</div>
        <div>{clientLines(inv).filter((l) => l?.trim()).map((l) => l.replace(/\n/g, ', ')).join(' · ')}</div>
      </section>
      <div className="mt-9">
        <ItemsTable items={inv.items} currency={inv.currency} taxLabel={taxOf(s)} look={{ ...L, accent: L.accent2 }} head="line" />
      </div>
      <div className="mt-5 flex justify-end">
        <TotalsBox doc={inv} currency={inv.currency} taxLabel={taxOf(s)} look={L} variant="lines" className="w-72" totalLabel="Total" />
      </div>
      <Extras inv={inv} s={s} L={L} className="mt-5 text-center italic" />
      <FooterRow s={s} />
    </Page>
  )
}

function Cards({ inv, s, L }: Ctx) {
  const card = 'bg-white p-[6mm] shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/5'
  const r = { borderRadius: L.radius * 1.4 }
  return (
    <div className="flex flex-1 flex-col gap-[5mm] p-[11mm]" style={{ background: L.accent2 }}>
      <div className={`${card} flex items-center justify-between gap-6`} style={r}>
        <div className="flex items-center gap-4">
          <Logo s={s} L={L} size={48} />
          <div>
            <div className="text-[1.15em] font-bold text-zinc-900">{s.businessName || 'Your Business'}</div>
            <div className="text-[0.92em]">{[s.email, s.phone].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[2.2em] font-extrabold uppercase leading-none tracking-tight" style={{ color: L.accent }}>
            {title(s)}
          </div>
          <div className="mt-2 inline-block px-2 py-0.5 font-medium" style={{ background: `${L.accent}14`, color: L.accent, borderRadius: L.radius }}>
            #{inv.number}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-[5mm]">
        <div className={`${card} col-span-1`} style={r}>
          <Caps className="mb-1.5">Billed to</Caps>
          <div className="font-semibold text-zinc-900">{inv.client.name || 'Client name'}</div>
          <Lines lines={clientLines(inv)} className="text-[0.92em]" />
        </div>
        <div className={card} style={r}>
          <Caps className="mb-1.5">Dates</Caps>
          <div>
            Issued <span className="font-semibold text-zinc-900">{formatDate(inv.issueDate)}</span>
          </div>
          <div className="mt-1">
            Due <span className="font-semibold text-zinc-900">{formatDate(inv.dueDate)}</span>
          </div>
        </div>
        <div className="p-[6mm] text-white" style={{ ...r, background: L.accent }}>
          <Caps className="mb-1.5 text-white/70">Amount due</Caps>
          <div className="text-[1.7em] font-extrabold">{due(inv)}</div>
        </div>
      </div>
      <div className={card} style={r}>
        <ItemsTable items={inv.items} currency={inv.currency} taxLabel={taxOf(s)} look={L} head="tint" />
        <div className="mt-4 flex justify-end">
          <TotalsBox doc={inv} currency={inv.currency} taxLabel={taxOf(s)} look={L} variant="accent" className="w-72" />
        </div>
        <Extras inv={inv} s={s} L={L} />
      </div>
      {(s.showPayment || s.showSignature) && (
        <div className={`${card} mt-auto flex items-end justify-between gap-8`} style={r}>
          <div>{s.showPayment && <PaymentBlock settings={s} />}</div>
          {s.showSignature && <SignatureBlock image={s.signature} name={signer(s)} />}
        </div>
      )}
    </div>
  )
}

function Receipt({ inv, s, L }: Ctx) {
  const t = calcTotals(inv)
  const money = (c: number) => formatMoney(c, inv.currency)
  const dash = <div className="my-4 border-t-2 border-dashed border-zinc-300" />
  const row = (k: ReactNode, v: ReactNode, cls = '') => (
    <div className={`flex justify-between gap-4 ${cls}`}>
      <span>{k}</span>
      <span className="text-right">{v}</span>
    </div>
  )
  return (
    <div className="flex flex-1 justify-center bg-zinc-50 py-[12mm]">
      <div className="flex w-[128mm] flex-col bg-white px-[10mm] py-[10mm] text-zinc-700 shadow-[0_1px_3px_rgba(0,0,0,0.08)]" style={{ borderRadius: L.radius }}>
        <div className="text-center">
          <div className="flex justify-center">
            <Logo s={s} L={L} size={44} />
          </div>
          <div className="mt-3 text-[1.25em] font-bold text-zinc-900">{s.businessName || 'Your Business'}</div>
          <Lines lines={[s.address, s.phone, s.email]} className="text-[0.9em]" />
        </div>
        {dash}
        <div className="text-center text-[1.3em] font-bold uppercase tracking-[0.3em]" style={{ color: L.accent }}>
          {title(s)}
        </div>
        <div className="mt-2 text-[0.92em]">
          {row('No.', inv.number)}
          {row('Date', formatDate(inv.issueDate))}
          {row('Due', formatDate(inv.dueDate))}
          {row('Customer', inv.client.name || '—')}
          {inv.client.phone && row('Phone', inv.client.phone)}
        </div>
        {dash}
        <div className="space-y-2.5">
          {inv.items.map((it, i) => (
            <div key={it.id} className="avoid-break">
              {row(<span className="font-medium text-zinc-900">{it.description || 'Item'}</span>, <span className="font-medium text-zinc-900">{money(t.lines[i])}</span>)}
              <div className="text-[0.88em] text-zinc-500">
                {it.qty} × {money(toCents(it.rate))}
                {L.showTax && Number(it.taxRate) ? ` · ${taxOf(s)} ${it.taxRate}%` : ''}
              </div>
            </div>
          ))}
        </div>
        {dash}
        <div className="space-y-1">
          {row('Subtotal', money(t.subtotal))}
          {t.discount > 0 && row('Discount', `-${money(t.discount)}`)}
          {(t.tax > 0 || L.showTax) && row(taxOf(s), money(t.tax))}
        </div>
        <div className="mt-3 border-y-2 border-zinc-900 py-2">{row('TOTAL', money(t.total), 'text-[1.35em] font-extrabold text-zinc-900')}</div>
        {s.amountInWords && <AmountWords cents={t.total} currency={inv.currency} className="mt-3 text-center" />}
        {s.showPayment && (
          <div className="mt-4 text-[0.9em]">
            <PaymentBlock settings={s} title="Pay to" />
          </div>
        )}
        {(inv.notes.trim() || inv.terms.trim()) && (
          <div className="mt-4 whitespace-pre-line text-center text-[0.9em]">
            {inv.notes}
            {inv.notes.trim() && inv.terms.trim() ? '\n' : ''}
            {inv.terms}
          </div>
        )}
        <div className="mt-6 text-center font-semibold tracking-widest text-zinc-900">*** THANK YOU ***</div>
        <div
          className="mx-auto mt-4 h-10 w-48 opacity-80"
          style={{ background: 'repeating-linear-gradient(90deg,#18181b 0 2px,transparent 2px 4px,#18181b 4px 5px,transparent 5px 8px,#18181b 8px 11px,transparent 11px 12px)' }}
        />
        <div className="mt-1 text-center text-[0.8em] tracking-[0.3em]">{inv.number}</div>
        {s.showSignature && s.signature && (
          <div className="mt-6 flex justify-center">
            <SignatureBlock image={s.signature} name={signer(s)} />
          </div>
        )}
      </div>
    </div>
  )
}

function Corporate({ inv, s, L }: Ctx) {
  const box = 'border border-zinc-300'
  const boxHead = 'px-3 py-1.5 text-[0.8em] font-semibold uppercase tracking-wider text-white'
  return (
    <>
      <div className="flex h-2">
        <div className="flex-[3]" style={{ background: L.accent }} />
        <div className="flex-1" style={{ background: L.accent2 }} />
      </div>
      <Page className="pt-[11mm]">
        <header className="flex items-start justify-between gap-8">
          <div className="flex items-start gap-4">
            <Logo s={s} L={L} size={56} />
            <div>
              <div className="text-[1.35em] font-bold text-zinc-900">{s.businessName || 'Your Business'}</div>
              <Lines lines={businessLines(s)} className="text-[0.92em]" />
            </div>
          </div>
          <div className={`${box} min-w-[66mm]`}>
            <div className="px-3 py-2 text-center text-[1.35em] font-bold uppercase tracking-wider text-white" style={{ background: L.accent }}>
              {title(s)}
            </div>
            <table className="w-full">
              <tbody>
                {(
                  [
                    ['Invoice No.', inv.number],
                    ['Issue Date', formatDate(inv.issueDate)],
                    ['Due Date', formatDate(inv.dueDate)],
                  ] as const
                ).map(([k, v]) => (
                  <tr key={k} className="border-t border-zinc-300">
                    <td className="px-3 py-1.5">{k}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-zinc-900">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </header>
        <section className="mt-7 grid grid-cols-2 gap-5">
          <div className={box}>
            <div className={boxHead} style={{ background: L.accent }}>
              Bill To
            </div>
            <div className="px-3 py-2.5">
              <Party label="" name={inv.client.name || 'Client name'} lines={clientLines(inv)} />
            </div>
          </div>
          <div className={box}>
            <div className={boxHead} style={{ background: L.accent }}>
              Summary
            </div>
            <div className="space-y-1 px-3 py-2.5">
              <div className="flex justify-between">
                <span>Currency</span>
                <span className="font-semibold text-zinc-900">{inv.currency}</span>
              </div>
              <div className="flex justify-between">
                <span>Status</span>
                <span className="font-semibold capitalize text-zinc-900">{inv.status}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-200 pt-1">
                <span>Amount Due</span>
                <span className="text-[1.15em] font-bold" style={{ color: L.accent }}>
                  {due(inv)}
                </span>
              </div>
            </div>
          </div>
        </section>
        <div className="mt-6">
          <ItemsTable items={inv.items} currency={inv.currency} taxLabel={taxOf(s)} look={{ ...L, table: 'grid' }} head="accent" />
        </div>
        <div className="mt-4 flex justify-end">
          <TotalsBox doc={inv} currency={inv.currency} taxLabel={taxOf(s)} look={L} variant="grid" className="w-80" totalLabel="Net Payable" />
        </div>
        {s.amountInWords && (
          <div className={`${box} mt-4 px-3 py-2`}>
            <AmountWords cents={total(inv)} currency={inv.currency} />
          </div>
        )}
        {(inv.notes.trim() || inv.terms.trim()) && (
          <div className="mt-4 whitespace-pre-line text-[0.92em]">
            {inv.notes.trim() && <div>{inv.notes}</div>}
            {inv.terms.trim() && <div className="mt-1 text-zinc-400">{inv.terms}</div>}
          </div>
        )}
        <footer className="avoid-break mt-auto grid grid-cols-2 gap-5 pt-8">
          <div className={box}>
            <div className={boxHead} style={{ background: L.accent }}>
              Bank / Payment Details
            </div>
            <div className="px-3 py-2.5 text-[0.92em]">{s.showPayment ? <PaymentBlock settings={s} title="" /> : '—'}</div>
          </div>
          <div className={`${box} flex flex-col`}>
            <div className={boxHead} style={{ background: L.accent }}>
              For {s.businessName || 'Your Business'}
            </div>
            <div className="flex flex-1 items-end justify-center px-3 pb-3 pt-6">{s.showSignature && <SignatureBlock image={s.signature} name={signer(s)} />}</div>
          </div>
        </footer>
      </Page>
    </>
  )
}

function Gradient({ inv, s, L }: Ctx) {
  const gradient = `linear-gradient(135deg, ${L.accent}, ${L.accent2})`
  return (
    <>
      <header className="px-[15mm] pb-[22mm] pt-[13mm] text-white" style={{ background: gradient }}>
        <div className="flex items-start justify-between gap-8">
          <div className="flex items-center gap-4">
            <Logo s={s} L={L} size={50} onDark />
            <div>
              <div className="text-[1.25em] font-bold">{s.businessName || 'Your Business'}</div>
              <div className="text-white/80">{[s.email, s.phone].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[3em] font-extrabold uppercase leading-none tracking-tight">{title(s)}</div>
            <div className="mt-2 text-white/85">#{inv.number}</div>
          </div>
        </div>
      </header>
      <div className="relative z-[1] mx-[15mm] -mt-[13mm] grid grid-cols-3 gap-6 bg-white p-[6mm] shadow-[0_6px_24px_-6px_rgba(0,0,0,0.18)]" style={{ borderRadius: L.radius * 1.4 }}>
        <Party label="Billed to" name={inv.client.name || 'Client name'} lines={clientLines(inv)} labelClass="text-[0.8em] font-semibold uppercase tracking-wider" />
        <div>
          <Caps className="mb-1">Issued</Caps>
          <div className="font-semibold text-zinc-900">{formatDate(inv.issueDate)}</div>
          <Caps className="mb-1 mt-3">Due</Caps>
          <div className="font-semibold text-zinc-900">{formatDate(inv.dueDate)}</div>
        </div>
        <div className="text-right">
          <Caps>Amount due</Caps>
          <div className="mt-1 bg-clip-text text-[1.9em] font-extrabold text-transparent" style={{ backgroundImage: gradient }}>
            {due(inv)}
          </div>
        </div>
      </div>
      <Page className="pt-9">
        <ItemsTable items={inv.items} currency={inv.currency} taxLabel={taxOf(s)} look={L} head="tint" />
        <div className="mt-5 flex justify-end">
          <TotalsBox doc={inv} currency={inv.currency} taxLabel={taxOf(s)} look={L} variant="gradient" className="w-72" />
        </div>
        <Extras inv={inv} s={s} L={L} />
        <FooterRow s={s} />
      </Page>
    </>
  )
}

const LAYOUT_COMPONENTS: Record<Exclude<TemplateId, 'custom'>, (c: Ctx) => ReactNode> = {
  minimal: Minimal,
  classic: Classic,
  bold: Bold,
  sidebar: Sidebar,
  split: Split,
  elegant: Elegant,
  cards: Cards,
  receipt: Receipt,
  corporate: Corporate,
  gradient: Gradient,
}

/** Scaled on-screen preview of an invoice. */
export function ScaledPreview({ invoice, settings, header }: { invoice: Invoice; settings: Settings; header?: ReactNode }) {
  return (
    <ScaledFrame header={header}>
      <InvoicePreview invoice={invoice} settings={settings} />
    </ScaledFrame>
  )
}
