import { AlignLeft, CalendarRange, FileText, ListChecks, PenLine, Receipt, type LucideIcon } from 'lucide-react'
import type { BlockType, Invoice, Proposal, ProposalBlock, Settings } from '../db'
import { emptyClient, formatProposalNumber } from '../db'
import { addDays, calcTotals, newLineItem, todayISO, uid } from './invoice'

export const BLOCKS: Record<BlockType, { label: string; description: string; icon: LucideIcon }> = {
  cover: { label: 'Cover', description: 'Title page with client and dates', icon: FileText },
  text: { label: 'Text', description: 'About us, introduction, terms…', icon: AlignLeft },
  scope: { label: 'Scope', description: 'Checklist of deliverables', icon: ListChecks },
  pricing: { label: 'Pricing', description: 'Line items with totals', icon: Receipt },
  timeline: { label: 'Timeline', description: 'Milestones and dates', icon: CalendarRange },
  signature: { label: 'Signature', description: 'Acceptance and signatures', icon: PenLine },
}

/** Presets shown in the "Add block" menu. Several presets share a block type. */
export const PRESETS: Array<{ key: string; label: string; type: BlockType; make: (s: Settings) => ProposalBlock }> = [
  { key: 'cover', label: 'Cover page', type: 'cover', make: () => ({ id: uid(), type: 'cover', subtitle: '' }) },
  {
    key: 'about',
    label: 'About us',
    type: 'text',
    make: (s) => ({
      id: uid(),
      type: 'text',
      heading: 'About Us',
      body: `${s.businessName || 'We'} help businesses grow with thoughtful, high-quality work.\n\nWhy work with us:\n- Clear communication and on-time delivery\n- Experienced team\n- Support after launch`,
    }),
  },
  { key: 'text', label: 'Text section', type: 'text', make: () => ({ id: uid(), type: 'text', heading: 'Introduction', body: '' }) },
  {
    key: 'scope',
    label: 'Scope of work',
    type: 'scope',
    make: () => ({ id: uid(), type: 'scope', heading: 'Scope of Work', items: ['Discovery and planning', 'Design', 'Development', 'Testing and launch'] }),
  },
  {
    key: 'pricing',
    label: 'Pricing table',
    type: 'pricing',
    make: (s) => ({ id: uid(), type: 'pricing', heading: 'Investment', items: [newLineItem(s)], discountType: 'percent', discountValue: 0 }),
  },
  {
    key: 'timeline',
    label: 'Timeline',
    type: 'timeline',
    make: () => ({
      id: uid(),
      type: 'timeline',
      heading: 'Timeline',
      milestones: [
        { id: uid(), title: 'Kick-off', when: 'Week 1', description: 'Requirements and planning' },
        { id: uid(), title: 'Delivery', when: 'Week 4', description: 'Final handover' },
      ],
    }),
  },
  {
    key: 'terms',
    label: 'Terms & conditions',
    type: 'text',
    make: () => ({
      id: uid(),
      type: 'text',
      heading: 'Terms & Conditions',
      body: '- 50% advance payment to start, 50% on delivery\n- Two rounds of revisions are included\n- Prices are valid until the date shown on the cover',
    }),
  },
  {
    key: 'signature',
    label: 'Signature',
    type: 'signature',
    make: () => ({ id: uid(), type: 'signature', heading: 'Acceptance', body: 'By signing below, you accept this proposal and its terms.' }),
  },
]

const preset = (key: string, s: Settings) => PRESETS.find((p) => p.key === key)!.make(s)

export function newProposal(settings: Settings): Proposal {
  const date = todayISO()
  return {
    number: formatProposalNumber(settings),
    title: 'Project Proposal',
    status: 'draft',
    client: { ...emptyClient },
    date,
    validUntil: addDays(date, settings.proposalValidDays),
    currency: settings.currency,
    blocks: ['cover', 'about', 'scope', 'pricing', 'timeline', 'terms', 'signature'].map((k) => preset(k, settings)),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export const blockTitle = (b: ProposalBlock) => (b.type === 'cover' ? 'Cover page' : b.heading || BLOCKS[b.type].label)

export function proposalTotal(p: Pick<Proposal, 'blocks'>): number {
  return p.blocks.reduce((sum, b) => (b.type === 'pricing' ? sum + calcTotals(b).total : sum), 0)
}

export type ProposalDisplayStatus = Proposal['status'] | 'expired'

export function proposalDisplayStatus(p: Pick<Proposal, 'status' | 'validUntil'>): ProposalDisplayStatus {
  if ((p.status === 'sent' || p.status === 'viewed') && p.validUntil && p.validUntil < todayISO()) return 'expired'
  return p.status
}

/** Builds invoice fields from a proposal's pricing blocks. */
export function invoiceFromProposal(p: Proposal): Pick<Invoice, 'client' | 'clientId' | 'currency' | 'items' | 'discountType' | 'discountValue'> {
  const pricing = p.blocks.filter((b): b is Extract<ProposalBlock, { type: 'pricing' }> => b.type === 'pricing')
  const items = pricing.flatMap((b) => b.items.map((i) => ({ ...i, id: uid() })))
  let discountType: Invoice['discountType'] = 'percent'
  let discountValue = 0
  const discounted = pricing.filter((b) => calcTotals(b).discount)
  const first = pricing[0]
  if (first && pricing.every((b) => b.discountType === first.discountType && b.discountValue === first.discountValue) && (pricing.length === 1 || first.discountType === 'percent')) {
    // One table, or every table has the same % off: the invoice's own discount gives the same total.
    discountType = first.discountType
    discountValue = first.discountValue
  } else {
    // Tables with different discounts can't share one invoice discount without changing the tax
    // (each table's discount reduces only its own lines' tax). Each discount becomes a minus line
    // per tax rate instead, so the invoice adds up exactly like the proposal.
    for (const b of discounted) {
      const { lines, subtotal, discount } = calcTotals(b)
      const byTax = new Map<number, number>()
      b.items.forEach((it, idx) => byTax.set(Number(it.taxRate) || 0, (byTax.get(Number(it.taxRate) || 0) ?? 0) + lines[idx]))
      let left = discount
      const rates = [...byTax].filter(([, base]) => base)
      rates.forEach(([taxRate, base], k) => {
        const cents = k === rates.length - 1 ? left : Math.round((discount * base) / subtotal)
        left -= cents
        if (cents) items.push({ id: uid(), description: `Discount${b.heading ? ` — ${b.heading}` : ''}`, qty: 1, rate: -cents / 100, taxRate })
      })
    }
  }
  return { client: { ...p.client }, clientId: p.clientId, currency: p.currency, items, discountType, discountValue }
}

/** Renders "- item" lines as bullets and everything else as paragraphs. */
export function richLines(text: string): Array<{ kind: 'p' | 'li'; text: string }> {
  return text
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l, i, arr) => l || (i > 0 && arr[i - 1]))
    .map((l) => (/^\s*[-•*]\s+/.test(l) ? { kind: 'li' as const, text: l.replace(/^\s*[-•*]\s+/, '') } : { kind: 'p' as const, text: l }))
}
