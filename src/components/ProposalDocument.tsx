import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Acceptance, type CustomTemplate, type Proposal, type ProposalBlock, type ProposalTheme, type Settings } from '../db'
import { DEFAULT_MARGINS } from '../lib/customTemplate'
import { fontStack, loadFont } from '../lib/fonts'
import { formatDate, formatMoney } from '../lib/invoice'
import { proposalTotal, richLines } from '../lib/proposal'
import { themeOf } from '../lib/proposalThemes'
import { CustomPage } from './CustomDesign'
import { ClientSignature, ItemsTable, SignatureBlock, TotalsBox } from './doc'
import { initials } from './ui'

// Short sections are kept on one page so a heading isn't left alone at the bottom.
const KEEP_TOGETHER = new Set<ProposalBlock['type']>(['scope', 'pricing', 'timeline', 'signature'])

type Signed = Pick<Acceptance, 'name' | 'signature' | 'signedAt'> | null | undefined

type Props = {
  proposal: Proposal
  settings: Settings
  acceptance?: Signed
  /** Passed where the local database isn't available (the public share page). */
  customTemplate?: CustomTemplate | null
}

type Ctx = { proposal: Proposal; settings: Settings; theme: ProposalTheme; acceptance?: Signed; headingFont: string }

/** A4-wide, multi-page proposal. Each section carries data-section so the share page can track reading time. */
export function ProposalDocument({ proposal, settings, acceptance, customTemplate }: Props) {
  const theme = themeOf(proposal, settings)
  loadFont(theme.font)
  loadFont(theme.headingFont)
  const ctx: Ctx = { proposal, settings, theme, acceptance, headingFont: fontStack(theme.headingFont) }
  if (customTemplate || theme.customTemplateId) return <CustomProposal ctx={ctx} given={customTemplate} />
  return <BuiltInProposal ctx={ctx} />
}

// ---------- built-in themes ----------

function BuiltInProposal({ ctx }: { ctx: Ctx }) {
  const { proposal, theme } = ctx
  // Group consecutive content blocks so each group gets page padding; covers are full pages.
  const groups: Array<{ cover?: ProposalBlock; blocks: ProposalBlock[] }> = []
  for (const b of proposal.blocks) {
    if (b.type === 'cover') groups.push({ cover: b, blocks: [] })
    else if (!groups.length || groups.at(-1)!.cover) groups.push({ blocks: [b] })
    else groups.at(-1)!.blocks.push(b)
  }
  let n = 0
  return (
    <div className="proposal-doc bg-white text-[13px] leading-relaxed text-zinc-600" style={{ width: '210mm', fontFamily: fontStack(theme.font) }}>
      {groups.map((g, gi) =>
        g.cover ? (
          <section key={g.cover.id} data-section={g.cover.id} data-section-label="Cover" className="proposal-cover">
            <Cover ctx={ctx} subtitle={g.cover.type === 'cover' ? g.cover.subtitle : ''} />
          </section>
        ) : (
          <div key={`g${gi}`} className="proposal-body px-[16mm] py-[16mm]">
            {g.blocks.map((b, i) => {
              const index = 'heading' in b && b.heading ? ++n : n
              return (
                <section key={b.id} data-section={b.id} data-section-label={'heading' in b ? b.heading : ''} className={`${i > 0 ? 'pt-10' : ''} ${KEEP_TOGETHER.has(b.type) ? 'avoid-break' : ''}`}>
                  <Block block={b} ctx={ctx} index={index} />
                </section>
              )
            })}
          </div>
        ),
      )}
      {proposal.blocks.length === 0 && <div className="py-20 text-center text-zinc-400">Add blocks to build your proposal.</div>}
    </div>
  )
}

function Logo({ s, accent, onDark, size = 48 }: { s: Settings; accent: string; onDark?: boolean; size?: number }) {
  if (s.logo)
    return (
      <div className={onDark ? 'rounded-lg bg-white p-2' : ''}>
        <img src={s.logo} alt="" className="object-contain" style={{ maxHeight: size, maxWidth: size * 3.4 }} />
      </div>
    )
  return (
    <div className="flex items-center justify-center rounded-full font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.34, background: onDark ? 'rgba(255,255,255,0.2)' : accent }}>
      {initials(s.businessName || 'B')}
    </div>
  )
}

function Details({ ctx, tone = 'dark', centered }: { ctx: Ctx; tone?: 'dark' | 'light'; centered?: boolean }) {
  const { proposal: p, settings: s } = ctx
  const light = tone === 'light'
  const label = `mb-1 text-[11px] font-semibold uppercase tracking-wider ${light ? 'text-white/60' : 'text-zinc-400'}`
  const strong = `font-semibold ${light ? 'text-white' : 'text-zinc-900'}`
  return (
    <div className={`grid grid-cols-2 gap-x-8 gap-y-5 ${centered ? 'text-center' : ''} ${light ? 'text-white/80' : ''}`}>
      <div>
        <div className={label}>Prepared for</div>
        <div className={strong}>{p.client.name || 'Client name'}</div>
        {p.client.company && <div>{p.client.company}</div>}
        {p.client.email && <div>{p.client.email}</div>}
      </div>
      <div>
        <div className={label}>Prepared by</div>
        <div className={strong}>{s.businessName || 'Your Business'}</div>
        {s.email && <div>{s.email}</div>}
        {s.phone && <div>{s.phone}</div>}
      </div>
      <div>
        <div className={label}>Date</div>
        <div className={strong}>{formatDate(p.date)}</div>
      </div>
      <div>
        <div className={label}>Valid until</div>
        <div className={strong}>{formatDate(p.validUntil)}</div>
      </div>
    </div>
  )
}

function Cover({ ctx, subtitle }: { ctx: Ctx; subtitle: string }) {
  const { proposal: p, settings: s, theme: t, headingFont } = ctx
  const title = p.title || 'Untitled proposal'
  const page = 'flex flex-col'
  const pageStyle = { height: '297mm' }
  const H1 = ({ className = '', style }: { className?: string; style?: React.CSSProperties }) => (
    <h1 className={`font-extrabold leading-[1.08] tracking-tight ${className}`} style={{ fontFamily: headingFont, ...style }}>
      {title}
    </h1>
  )
  switch (t.cover) {
    case 'band':
      return (
        <div className="grid grid-cols-[62mm_1fr]" style={pageStyle}>
          <div className="flex flex-col justify-between px-[10mm] py-[16mm] text-white" style={{ background: t.accent }}>
            <Logo s={s} accent={t.accent} onDark />
            <div className="text-[13px] font-semibold uppercase tracking-[0.35em] text-white/70" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
              Proposal · {p.number}
            </div>
          </div>
          <div className={`${page} px-[16mm] py-[16mm]`}>
            <div className="my-auto">
              <div className="mb-6 h-1.5 w-16 rounded-full" style={{ background: t.accent2 }} />
              <H1 className="text-[46px] text-zinc-900" />
              {subtitle && <p className="mt-5 text-[16px] text-zinc-500">{subtitle}</p>}
            </div>
            <div className="border-t border-zinc-200 pt-6">
              <Details ctx={ctx} />
            </div>
          </div>
        </div>
      )
    case 'fullbleed':
      return (
        <div className={`${page} px-[16mm] py-[16mm] text-white`} style={{ ...pageStyle, background: t.accent }}>
          <div className="flex items-center justify-between">
            <Logo s={s} accent={t.accent} onDark />
            <span className="rounded-full border border-white/30 px-3 py-1 text-[12px] font-medium text-white/80">#{p.number}</span>
          </div>
          <div className="my-auto">
            <div className="text-[13px] font-semibold uppercase tracking-[0.3em]" style={{ color: t.accent2 }}>
              Proposal
            </div>
            <H1 className="mt-4 text-[52px] text-white" />
            {subtitle && <p className="mt-5 max-w-[150mm] text-[17px] text-white/80">{subtitle}</p>}
          </div>
          <div className="border-t border-white/20 pt-6">
            <Details ctx={ctx} tone="light" />
          </div>
        </div>
      )
    case 'centered':
      return (
        <div className={`${page} items-center px-[20mm] py-[18mm] text-center`} style={pageStyle}>
          <Logo s={s} accent={t.accent} />
          <div className="mt-3 text-[12px] font-semibold uppercase tracking-[0.35em] text-zinc-500">{s.businessName}</div>
          <div className="my-auto w-full">
            <div className="mx-auto mb-8 w-24 border-t" style={{ borderColor: t.accent2 }} />
            <div className="text-[12px] uppercase tracking-[0.4em]" style={{ color: t.accent }}>
              A proposal for {p.client.company || p.client.name || 'you'}
            </div>
            <H1 className="mt-5 text-[46px] font-semibold text-zinc-900" />
            {subtitle && <p className="mx-auto mt-5 max-w-[140mm] text-[16px] italic text-zinc-500">{subtitle}</p>}
            <div className="mx-auto mt-8 w-24 border-t" style={{ borderColor: t.accent2 }} />
          </div>
          <div className="w-full">
            <Details ctx={ctx} centered />
          </div>
        </div>
      )
    case 'gradient':
      return (
        <div className={page} style={pageStyle}>
          <div className="flex h-[58%] flex-col justify-between px-[16mm] py-[16mm] text-white" style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})` }}>
            <div className="flex items-center justify-between">
              <Logo s={s} accent={t.accent} onDark />
              <span className="text-[12px] font-medium text-white/80">#{p.number}</span>
            </div>
            <div>
              <div className="text-[13px] font-semibold uppercase tracking-[0.3em] text-white/75">Proposal</div>
              <H1 className="mt-3 text-[50px] text-white" />
            </div>
          </div>
          <div className="flex flex-1 flex-col px-[16mm] py-[14mm]">
            {subtitle && <p className="text-[17px] text-zinc-600">{subtitle}</p>}
            <div className="mt-auto">
              <Details ctx={ctx} />
            </div>
          </div>
        </div>
      )
    case 'minimal':
      return (
        <div className={`${page} px-[18mm] py-[18mm]`} style={pageStyle}>
          <div className="flex items-start justify-between text-[12px] text-zinc-500">
            <Logo s={s} accent={t.accent} size={40} />
            <div className="text-right">
              <div className="font-semibold text-zinc-900">{p.number}</div>
              <div>{formatDate(p.date)}</div>
            </div>
          </div>
          <div className="mt-[40mm]">
            <span className="inline-block h-4 w-4 rounded-full" style={{ background: t.accent }} />
            <H1 className="mt-6 text-[60px] leading-[1.02] text-zinc-900" />
            {subtitle && <p className="mt-6 max-w-[130mm] text-[17px] text-zinc-500">{subtitle}</p>}
          </div>
          <div className="mt-auto border-t-2 pt-6" style={{ borderColor: t.accent2 }}>
            <Details ctx={ctx} />
          </div>
        </div>
      )
    default:
      return (
        <div className={`${page} px-[16mm] py-[16mm]`} style={pageStyle}>
          <div className="flex items-center justify-between">
            <Logo s={s} accent={t.accent} />
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">#{p.number}</span>
          </div>
          <div className="my-auto py-16">
            <div className="mb-6 h-1.5 w-16 rounded-full" style={{ background: t.accent }} />
            <div className="text-[13px] font-semibold uppercase tracking-[0.2em]" style={{ color: t.accent }}>
              Proposal
            </div>
            <H1 className="mt-3 text-[44px] text-zinc-900" />
            {subtitle && <p className="mt-4 max-w-[140mm] text-[16px] text-zinc-500">{subtitle}</p>}
          </div>
          <div className="border-t border-zinc-200 pt-6">
            <Details ctx={ctx} />
          </div>
        </div>
      )
  }
}

function Heading({ text, ctx, index }: { text: string; ctx: Ctx; index: number }) {
  const { theme: t, headingFont } = ctx
  const h2 = (cls = '') => (
    <h2 className={`text-[22px] font-bold tracking-tight text-zinc-900 ${cls}`} style={{ fontFamily: headingFont }}>
      {text}
    </h2>
  )
  switch (t.heading) {
    case 'number':
      return (
        <div className="avoid-break mb-4 flex items-baseline gap-3">
          <span className="text-[15px] font-bold tabular-nums" style={{ color: t.accent }}>
            {String(index).padStart(2, '0')}
          </span>
          {h2()}
        </div>
      )
    case 'underline':
      return <div className="avoid-break mb-4 border-b-2 pb-2" style={{ borderColor: t.accent2 }}>{h2()}</div>
    case 'pill':
      return (
        <div className="avoid-break mb-4">
          <span className="mb-2 inline-block rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider" style={{ background: `${t.accent}14`, color: t.accent }}>
            Section {String(index).padStart(2, '0')}
          </span>
          {h2()}
        </div>
      )
    default:
      return (
        <div className="avoid-break mb-4">
          <div className="mb-2 h-1 w-10 rounded-full" style={{ background: t.accent }} />
          {h2()}
        </div>
      )
  }
}

function RichLine({ l }: { l: { kind: 'p' | 'li'; text: string } }) {
  if (l.kind === 'li')
    return (
      <div className="flex gap-2.5 pl-1">
        <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
        <span>{l.text}</span>
      </div>
    )
  return l.text ? <p>{l.text}</p> : <div className="h-1" />
}

function Rich({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {richLines(text).map((l, i) => (
        <RichLine key={i} l={l} />
      ))}
    </div>
  )
}

function Block({ block: b, ctx, index }: { block: ProposalBlock; ctx: Ctx; index: number }) {
  const { proposal, settings, theme: t, acceptance } = ctx
  const taxLabel = settings.taxLabel || 'Tax'
  const heading = 'heading' in b && b.heading ? <Heading text={b.heading} ctx={ctx} index={index} /> : null
  switch (b.type) {
    case 'cover':
      return null
    case 'text':
      return (
        <>
          {heading}
          <Rich text={b.body} />
        </>
      )
    case 'scope':
      return (
        <>
          {heading}
          <div className="grid gap-2">
            {b.items
              .filter((x) => x.trim())
              .map((item, i) => (
                <div key={i} className="avoid-break flex items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: t.accent }}>
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
          {heading}
          <ItemsTable items={b.items} currency={proposal.currency} taxLabel={taxLabel} headClass="bg-zinc-50 text-zinc-500" />
          <div className="mt-4 flex justify-end">
            <TotalsBox doc={b} currency={proposal.currency} taxLabel={taxLabel} accent={t.accent} className="w-80 rounded-lg bg-zinc-50 px-3 py-2" totalLabel="Total" />
          </div>
        </>
      )
    case 'timeline':
      return (
        <>
          {heading}
          <ol className="relative ml-2 border-l-2 border-zinc-100">
            {b.milestones.map((m) => (
              <li key={m.id} className="avoid-break relative pb-5 pl-6 last:pb-0">
                <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full ring-4 ring-white" style={{ background: t.accent }} />
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-semibold text-zinc-900">{m.title}</span>
                  {m.when && (
                    <span className="text-[12px] font-medium" style={{ color: t.accent }}>
                      {m.when}
                    </span>
                  )}
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
          {heading}
          {b.body && <Rich text={b.body} />}
          {total > 0 && (
            <div className="mt-4 flex items-center justify-between rounded-lg px-4 py-3" style={{ background: `${t.accent}10` }}>
              <span className="font-medium text-zinc-700">Total investment</span>
              <span className="text-lg font-bold" style={{ color: t.accent }}>
                {formatMoney(total, proposal.currency)}
              </span>
            </div>
          )}
          <div className="mt-12 flex items-end justify-between gap-10">
            <SignatureBlock
              image={settings.signature}
              name={settings.signatory || settings.businessName || 'Your Business'}
              caption={settings.signatory && settings.businessName ? settings.businessName : 'Authorized signature'}
            />
            <ClientSignature acceptance={acceptance} />
          </div>
        </div>
      )
    }
  }
}

// ---------- uploaded design: cover + letterhead pages ----------

type Unit = { key: string; blockId: string; label: string; first: boolean; gapBefore: number; keepWithNext: boolean; node: ReactNode }

/** Splits blocks into small pieces so long sections can continue on the next page. */
function toUnits(ctx: Ctx): Unit[] {
  const units: Unit[] = []
  let n = 0
  ctx.proposal.blocks.forEach((b) => {
    if (b.type === 'cover') return
    const label = 'heading' in b ? b.heading : ''
    const index = 'heading' in b && b.heading ? ++n : n
    const gap = units.length ? 9 : 0
    if (b.type === 'text') {
      if (b.heading) units.push({ key: `${b.id}-h`, blockId: b.id, label, first: true, gapBefore: gap, keepWithNext: true, node: <Heading text={b.heading} ctx={ctx} index={index} /> })
      richLines(b.body).forEach((l, i) =>
        units.push({ key: `${b.id}-${i}`, blockId: b.id, label, first: !b.heading && i === 0, gapBefore: !b.heading && i === 0 ? gap : 2, keepWithNext: false, node: <RichLine l={l} /> }),
      )
      return
    }
    units.push({ key: b.id, blockId: b.id, label, first: true, gapBefore: gap, keepWithNext: false, node: <Block block={b} ctx={ctx} index={index} /> })
  })
  return units
}

const PX_PER_MM = 96 / 25.4

function CustomProposal({ ctx, given }: { ctx: Ctx; given?: CustomTemplate | null }) {
  const id = ctx.theme.customTemplateId
  const loaded = useLiveQuery(() => (given || !id ? null : db.templates.get(id).then((t) => t ?? null)), [given, id])
  const template = given ?? loaded
  if (template === undefined) return <div className="bg-white" style={{ width: '210mm', height: '297mm' }} />
  if (!template) return <BuiltInProposal ctx={{ ...ctx, theme: { ...ctx.theme, customTemplateId: undefined } }} />
  // Headings and highlights follow the uploaded design's accent color.
  return <CustomPages ctx={{ ...ctx, theme: { ...ctx.theme, accent: template.accent } }} template={template} />
}

function CustomPages({ ctx, template }: { ctx: Ctx; template: CustomTemplate }) {
  const m = template.margins ?? DEFAULT_MARGINS
  const width = 210 - m.left - m.right
  const usable = 297 - m.top - m.bottom
  const units = useMemo(() => toUnits(ctx), [ctx])
  const measureRef = useRef<HTMLDivElement>(null)
  const [heights, setHeights] = useState<number[] | null>(null)
  const font = fontStack(template.font)
  const signature = JSON.stringify([ctx.proposal.blocks, ctx.theme, ctx.acceptance?.signedAt, m, template.font])

  useLayoutEffect(() => {
    let cancelled = false
    const measure = () => {
      const el = measureRef.current
      if (!el || cancelled) return
      setHeights(Array.from(el.children).map((c) => (c as HTMLElement).getBoundingClientRect().height / PX_PER_MM))
    }
    measure()
    // Re-measure once web fonts have loaded, since they change line breaks.
    document.fonts?.ready.then(measure)
    return () => {
      cancelled = true
    }
  }, [signature])

  const pages = useMemo(() => {
    if (!heights) return [] as Unit[][]
    const out: Unit[][] = [[]]
    let used = 0
    units.forEach((u, i) => {
      const gap = out.at(-1)!.length ? u.gapBefore : 0
      // Keep a heading together with the first line that follows it.
      const need = gap + heights[i] + (u.keepWithNext && heights[i + 1] ? heights[i + 1] + 2 : 0)
      if (used + need > usable && out.at(-1)!.length) {
        out.push([])
        used = 0
      }
      used += (out.at(-1)!.length ? u.gapBefore : 0) + heights[i]
      out.at(-1)!.push(u)
    })
    return out
  }, [heights, units, usable])

  const coverBlock = ctx.proposal.blocks.find((b) => b.type === 'cover')
  const bodyStyle = { fontFamily: font, color: template.pageInk ?? '#3f3f46', fontSize: 13, lineHeight: 1.6 }

  return (
    <div className="proposal-doc bg-white" style={{ width: '210mm' }}>
      {coverBlock && (
        <section data-section={coverBlock.id} data-section-label="Cover" className="proposal-cover">
          <CustomPage template={template} background={template.background} zones={template.zones} data={{ s: ctx.settings, proposal: ctx.proposal }} />
        </section>
      )}
      {pages.map((pg, pi) => (
        <div key={pi} className="proposal-cover relative overflow-hidden bg-white" style={{ width: '210mm', height: '297mm' }}>
          {template.pageBackground && <img src={template.pageBackground} alt="" className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />}
          <div className="absolute" style={{ left: `${m.left}mm`, top: `${m.top}mm`, width: `${width}mm`, ...bodyStyle }}>
            {pg.map((u, i) => (
              <div key={u.key} data-section={u.first ? u.blockId : undefined} data-section-label={u.first ? u.label : undefined} style={{ paddingTop: i ? `${u.gapBefore}mm` : 0 }}>
                {u.node}
              </div>
            ))}
          </div>
        </div>
      ))}
      {createPortal(
        <div ref={measureRef} aria-hidden className="pointer-events-none fixed left-[-10000px] top-0" style={{ width: `${width}mm`, visibility: 'hidden', ...bodyStyle }}>
          {units.map((u) => (
            <Fragment key={u.key}>
              <div>{u.node}</div>
            </Fragment>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
