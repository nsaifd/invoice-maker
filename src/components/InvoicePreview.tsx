import type { ReactNode } from 'react'
import type { Invoice, Settings, TemplateId } from '../db'
import { calcTotals, formatDate, formatMoney } from '../lib/invoice'
import { ItemsTable, PaymentBlock, ScaledFrame, SignatureBlock, TotalsBox, docFont } from './doc'
import { initials } from './ui'

export const TEMPLATES: Record<TemplateId, { label: string; description: string }> = {
  minimal: { label: 'Minimal', description: 'Clean and airy, neutral colors' },
  classic: { label: 'Classic', description: 'Brand color bar and table header' },
  bold: { label: 'Bold', description: 'Full brand-color header band' },
}

type Props = { invoice: Invoice; settings: Settings }

export function InvoicePreview({ invoice, settings }: Props) {
  const Template = { minimal: Minimal, classic: Classic, bold: Bold }[settings.template] ?? Minimal
  return (
    <div
      className="invoice-doc relative flex flex-col bg-white text-[12.5px] leading-relaxed text-zinc-500"
      style={{ width: '210mm', minHeight: '297mm', padding: '15mm 15mm 16mm', fontFamily: docFont(settings) }}
    >
      {invoice.status === 'paid' && (
        <div className="pointer-events-none absolute right-[18mm] top-[52mm] z-10 rotate-[-12deg] rounded-lg border-[3px] border-emerald-500 bg-white/60 px-4 py-0.5 text-2xl font-extrabold tracking-[0.2em] text-emerald-500 opacity-80">
          PAID
        </div>
      )}
      <Template invoice={invoice} settings={settings} />
    </div>
  )
}

const accentOf = (s: Settings) => s.accentColor || '#2563eb'
const taxOf = (s: Settings) => s.taxLabel || 'Tax'
const signer = (s: Settings) => s.signatory || s.businessName

function Logo({ settings, className = '' }: { settings: Settings; className?: string }) {
  if (settings.logo) return <img src={settings.logo} alt="" className={`max-h-16 max-w-[160px] object-contain ${className}`} />
  return (
    <div className={`flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white ${className}`} style={{ background: accentOf(settings) }}>
      {initials(settings.businessName || 'B')}
    </div>
  )
}

function Party({ label, name, lines, labelClass = '' }: { label: string; name: string; lines: string[]; labelClass?: string }) {
  return (
    <div>
      <div className={`mb-1 ${labelClass}`}>{label}</div>
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

const businessLines = (s: Settings) => [s.email, s.phone, s.website, s.address]
const clientLines = (inv: Invoice) => [inv.client.company, inv.client.email, inv.client.phone, inv.client.address]

function NotesTerms({ invoice }: { invoice: Invoice }) {
  return (
    <>
      {invoice.notes.trim() && (
        <div className="avoid-break mt-4 whitespace-pre-line rounded-md border border-zinc-200 px-3 py-2 text-zinc-600">
          <span className="font-medium text-zinc-800">Note: </span>
          {invoice.notes}
        </div>
      )}
      {invoice.terms.trim() && <div className="mt-3 whitespace-pre-line text-[11.5px]">{invoice.terms}</div>}
    </>
  )
}

function Footer({ settings, children }: { settings: Settings; children?: ReactNode }) {
  return (
    <footer className="avoid-break mt-auto flex items-end justify-between gap-8 pt-10">
      <div>{children ?? <PaymentBlock settings={settings} />}</div>
      <SignatureBlock image={settings.signature} name={signer(settings)} />
    </footer>
  )
}

function Minimal({ invoice, settings }: Props) {
  return (
    <>
      <header className="flex items-start justify-between gap-8">
        <div>
          <div className="text-[34px] font-extrabold leading-none tracking-tight text-zinc-900">INVOICE</div>
          <div className="mt-3 flex items-center gap-2">
            <span>Invoice Number</span>
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">#{invoice.number}</span>
          </div>
        </div>
        <Logo settings={settings} />
      </header>
      <div className="-mx-[15mm] mt-7 border-t border-zinc-200" />
      <section className="mt-7 grid grid-cols-2 gap-8">
        <Party label="Billed by:" name={settings.businessName || 'Your Business'} lines={businessLines(settings)} />
        <Party label="Billed to:" name={invoice.client.name || 'Client name'} lines={clientLines(invoice)} />
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
      <ItemsTable items={invoice.items} currency={invoice.currency} taxLabel={taxOf(settings)} />
      <TotalsBox doc={invoice} currency={invoice.currency} taxLabel={taxOf(settings)} accent={accentOf(settings)} className="mt-4 rounded-lg bg-zinc-50 px-3 py-2" />
      <NotesTerms invoice={invoice} />
      <Footer settings={settings} />
    </>
  )
}

function Classic({ invoice, settings }: Props) {
  const accent = accentOf(settings)
  const total = formatMoney(calcTotals(invoice).total, invoice.currency)
  return (
    <>
      <div className="absolute inset-x-0 top-0 h-2" style={{ background: accent }} />
      <header className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          {settings.logo && <img src={settings.logo} alt="" className="mb-3 max-h-14 max-w-[170px] object-contain" />}
          <Party label="" name={settings.businessName || 'Your Business'} lines={businessLines(settings)} labelClass="hidden" />
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[30px] font-bold tracking-tight" style={{ color: accent }}>
            INVOICE
          </div>
          <div className="font-medium text-zinc-900">{invoice.number}</div>
        </div>
      </header>
      <section className="mt-10 grid grid-cols-2 gap-8">
        <Party label="BILL TO" name={invoice.client.name || 'Client name'} lines={clientLines(invoice)} labelClass="text-[11px] font-semibold tracking-wider text-zinc-400" />
        <div className="ml-auto grid grid-cols-[auto_auto] gap-x-6 gap-y-1 self-start text-right">
          <span className="text-zinc-400">Issue date</span>
          <span className="font-medium text-zinc-900">{formatDate(invoice.issueDate)}</span>
          <span className="text-zinc-400">Due date</span>
          <span className="font-medium text-zinc-900">{formatDate(invoice.dueDate)}</span>
          <span className="text-zinc-400">Amount due</span>
          <span className="font-semibold text-zinc-900">{invoice.status === 'paid' ? formatMoney(0, invoice.currency) : total}</span>
        </div>
      </section>
      <div className="mt-10">
        <ItemsTable
          items={invoice.items}
          currency={invoice.currency}
          taxLabel={taxOf(settings)}
          headClass="text-white text-[11px] uppercase tracking-wider"
          headStyle={{ background: accent }}
        />
      </div>
      <div className="mt-5 flex justify-end">
        <TotalsBox doc={invoice} currency={invoice.currency} taxLabel={taxOf(settings)} accent={accent} className="w-72 px-3" totalLabel="Total" />
      </div>
      <NotesTerms invoice={invoice} />
      <Footer settings={settings} />
    </>
  )
}

function Bold({ invoice, settings }: Props) {
  const accent = accentOf(settings)
  return (
    <>
      <header className="-mx-[15mm] -mt-[15mm] flex items-center justify-between gap-8 px-[15mm] pb-8 pt-[13mm] text-white" style={{ background: accent }}>
        <div className="flex items-center gap-4">
          {settings.logo ? (
            <div className="rounded-lg bg-white p-2">
              <img src={settings.logo} alt="" className="max-h-12 max-w-[130px] object-contain" />
            </div>
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-lg font-bold">{initials(settings.businessName || 'B')}</div>
          )}
          <div>
            <div className="text-base font-bold">{settings.businessName || 'Your Business'}</div>
            <div className="text-white/80">{[settings.email, settings.phone].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[34px] font-extrabold leading-none tracking-tight">INVOICE</div>
          <div className="mt-2 text-white/85">#{invoice.number}</div>
        </div>
      </header>
      <section className="mt-8 grid grid-cols-3 gap-6">
        <Party label="Billed to" name={invoice.client.name || 'Client name'} lines={clientLines(invoice)} labelClass="text-[11px] font-semibold uppercase tracking-wider" />
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider">Issued</div>
          <div className="font-semibold text-zinc-900">{formatDate(invoice.issueDate)}</div>
          <div className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wider">Due</div>
          <div className="font-semibold text-zinc-900">{formatDate(invoice.dueDate)}</div>
        </div>
        <div className="rounded-xl p-4 text-right" style={{ background: `${accent}12` }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider">Total due</div>
          <div className="mt-1 text-2xl font-extrabold" style={{ color: accent }}>
            {formatMoney(invoice.status === 'paid' ? 0 : calcTotals(invoice).total, invoice.currency)}
          </div>
        </div>
      </section>
      <div className="mt-8">
        <ItemsTable items={invoice.items} currency={invoice.currency} taxLabel={taxOf(settings)} headClass="text-zinc-900 font-semibold" headStyle={{ background: `${accent}14` }} />
      </div>
      <div className="mt-5 flex justify-end">
        <TotalsBox doc={invoice} currency={invoice.currency} taxLabel={taxOf(settings)} accent={accent} className="w-72 px-3" />
      </div>
      <NotesTerms invoice={invoice} />
      <Footer settings={settings}>
        <PaymentBlock settings={settings} />
        {settings.address && <div className="mt-2 whitespace-pre-line text-[11px]">{settings.address}</div>}
      </Footer>
    </>
  )
}

/** Scaled on-screen preview of an invoice. */
export function ScaledPreview({ invoice, settings, header }: Props & { header?: ReactNode }) {
  return (
    <ScaledFrame header={header}>
      <InvoicePreview invoice={invoice} settings={settings} />
    </ScaledFrame>
  )
}
