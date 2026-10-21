import type { Acceptance, Proposal, ProposalBlock, Settings } from '../db'
import { formatDate, formatMoney } from '../lib/invoice'
import { proposalTotal, richLines } from '../lib/proposal'
import { ClientSignature, ItemsTable, SignatureBlock, TotalsBox, docFont } from './doc'
import { initials } from './ui'

// Short sections are kept on one page so a heading isn't left alone at the bottom.
const KEEP_TOGETHER = new Set<ProposalBlock['type']>(['scope', 'pricing', 'timeline', 'signature'])

type Props = {
  proposal: Proposal
  settings: Settings
  acceptance?: Pick<Acceptance, 'name' | 'signature' | 'signedAt'> | null
}

/** A4-wide, multi-page proposal. Each block carries data-section so the share page can track reading time. */
export function ProposalDocument({ proposal, settings, acceptance }: Props) {
  const accent = settings.accentColor || '#2563eb'
  const blocks = proposal.blocks
  return (
    <div className="proposal-doc bg-white text-[13px] leading-relaxed text-zinc-600" style={{ width: '210mm', padding: '16mm', fontFamily: docFont(settings) }}>
      {blocks.map((b, i) => (
        <section
          key={b.id}
          data-section={b.id}
          data-section-label={b.type === 'cover' ? 'Cover' : b.heading}
          className={
            b.type === 'cover'
              ? ''
              : `${i > 0 && blocks[i - 1].type === 'cover' ? 'break-before' : ''} ${i > 0 ? 'pt-10' : ''} ${KEEP_TOGETHER.has(b.type) ? 'avoid-break' : ''}`
          }
        >
          <Block block={b} proposal={proposal} settings={settings} accent={accent} acceptance={acceptance} />
        </section>
      ))}
      {blocks.length === 0 && <div className="py-20 text-center text-zinc-400">Add blocks to build your proposal.</div>}
    </div>
  )
}

function Heading({ text, accent }: { text: string; accent: string }) {
  return (
    <div className="avoid-break mb-4">
      <div className="mb-2 h-1 w-10 rounded-full" style={{ background: accent }} />
      <h2 className="text-[22px] font-bold tracking-tight text-zinc-900">{text}</h2>
    </div>
  )
}

function Rich({ text }: { text: string }) {
  const lines = richLines(text)
  return (
    <div className="space-y-2">
      {lines.map((l, i) =>
        l.kind === 'li' ? (
          <div key={i} className="flex gap-2.5 pl-1">
            <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
            <span>{l.text}</span>
          </div>
        ) : l.text ? (
          <p key={i}>{l.text}</p>
        ) : (
          <div key={i} className="h-1" />
        ),
      )}
    </div>
  )
}

function Block({ block: b, proposal, settings, accent, acceptance }: { block: ProposalBlock; accent: string } & Props) {
  const taxLabel = settings.taxLabel || 'Tax'
  switch (b.type) {
    case 'cover':
      return (
        <div className="flex min-h-[262mm] flex-col">
          <div className="flex items-center justify-between">
            {settings.logo ? (
              <img src={settings.logo} alt="" className="max-h-14 max-w-[170px] object-contain" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full text-base font-bold text-white" style={{ background: accent }}>
                {initials(settings.businessName || 'B')}
              </div>
            )}
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">#{proposal.number}</span>
          </div>
          <div className="my-auto py-16">
            <div className="mb-6 h-1.5 w-16 rounded-full" style={{ background: accent }} />
            <div className="text-[13px] font-semibold uppercase tracking-[0.2em]" style={{ color: accent }}>
              Proposal
            </div>
            <h1 className="mt-3 text-[44px] font-extrabold leading-[1.1] tracking-tight text-zinc-900">{proposal.title || 'Untitled proposal'}</h1>
            {b.subtitle && <p className="mt-4 max-w-[140mm] text-[16px] text-zinc-500">{b.subtitle}</p>}
          </div>
          <div className="grid grid-cols-2 gap-8 border-t border-zinc-200 pt-6">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Prepared for</div>
              <div className="font-semibold text-zinc-900">{proposal.client.name || 'Client name'}</div>
              {proposal.client.company && <div>{proposal.client.company}</div>}
              {proposal.client.email && <div>{proposal.client.email}</div>}
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Prepared by</div>
              <div className="font-semibold text-zinc-900">{settings.businessName || 'Your Business'}</div>
              {settings.email && <div>{settings.email}</div>}
              {settings.phone && <div>{settings.phone}</div>}
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Date</div>
              <div className="font-medium text-zinc-900">{formatDate(proposal.date)}</div>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Valid until</div>
              <div className="font-medium text-zinc-900">{formatDate(proposal.validUntil)}</div>
            </div>
          </div>
        </div>
      )
    case 'text':
      return (
        <>
          {b.heading && <Heading text={b.heading} accent={accent} />}
          <Rich text={b.body} />
        </>
      )
    case 'scope':
      return (
        <>
          {b.heading && <Heading text={b.heading} accent={accent} />}
          <div className="grid gap-2">
            {b.items
              .filter((x) => x.trim())
              .map((item, i) => (
                <div key={i} className="avoid-break flex items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: accent }}>
                    ✓
                  </span>
                  <span className="text-zinc-800">{item}</span>
                </div>
              ))}
          </div>
        </>
      )
    case 'pricing':
      return (
        <>
          {b.heading && <Heading text={b.heading} accent={accent} />}
          <ItemsTable items={b.items} currency={proposal.currency} taxLabel={taxLabel} />
          <div className="mt-4 flex justify-end">
            <TotalsBox doc={b} currency={proposal.currency} taxLabel={taxLabel} accent={accent} className="w-80 rounded-lg bg-zinc-50 px-3 py-2" totalLabel="Total" />
          </div>
        </>
      )
    case 'timeline':
      return (
        <>
          {b.heading && <Heading text={b.heading} accent={accent} />}
          <ol className="relative ml-2 border-l-2 border-zinc-100">
            {b.milestones.map((m) => (
              <li key={m.id} className="avoid-break relative pb-5 pl-6 last:pb-0">
                <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full ring-4 ring-white" style={{ background: accent }} />
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-semibold text-zinc-900">{m.title}</span>
                  {m.when && <span className="text-[12px] font-medium" style={{ color: accent }}>{m.when}</span>}
                </div>
                {m.description && <div className="mt-0.5">{m.description}</div>}
              </li>
            ))}
          </ol>
        </>
      )
    case 'signature': {
      const total = proposalTotal(proposal)
      return (
        <div className="avoid-break">
          {b.heading && <Heading text={b.heading} accent={accent} />}
          {b.body && <Rich text={b.body} />}
          {total > 0 && (
            <div className="mt-4 flex items-center justify-between rounded-lg px-4 py-3" style={{ background: `${accent}10` }}>
              <span className="font-medium text-zinc-700">Total investment</span>
              <span className="text-lg font-bold" style={{ color: accent }}>
                {formatMoney(total, proposal.currency)}
              </span>
            </div>
          )}
          <div className="mt-12 flex items-end justify-between gap-10">
            <SignatureBlock image={settings.signature} name={settings.signatory || settings.businessName || 'Your Business'} caption={settings.signatory && settings.businessName ? settings.businessName : 'Authorized signature'} />
            <ClientSignature acceptance={acceptance} />
          </div>
        </div>
      )
    }
  }
}
