import Dexie, { type EntityTable } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'

export type Currency = 'BDT' | 'USD' | 'EUR' | 'GBP' | 'INR'
export type InvoiceStatus = 'draft' | 'sent' | 'paid'
export type TemplateId = 'minimal' | 'classic' | 'bold' | 'sidebar' | 'split' | 'elegant' | 'cards' | 'receipt' | 'corporate' | 'gradient' | 'custom'
export type FontId =
  | 'jakarta'
  | 'inter'
  | 'poppins'
  | 'manrope'
  | 'dmsans'
  | 'outfit'
  | 'spacegrotesk'
  | 'plex'
  | 'worksans'
  | 'lora'
  | 'playfair'
  | 'merriweather'
  | 'libre'
  | 'mono'
  | 'hind'
  | 'notobn'

/** How a document looks. Lives on Settings (the default) and optionally on an invoice (an override). */
export interface DocStyle {
  /** Id of the preset this style started from, or 'custom'. */
  preset: string
  template: TemplateId
  accentColor: string
  accent2: string
  font: FontId
  textSize: 'sm' | 'md' | 'lg'
  radius: 'none' | 'sm' | 'lg'
  tableStyle: 'plain' | 'lines' | 'striped' | 'grid'
  docTitle: string
  showTaxColumn: boolean
  amountInWords: boolean
  showPayment: boolean
  showSignature: boolean
  footerText: string
  /** Uploaded design used when template is 'custom'. */
  customTemplateId?: number
}

export type CoverStyle = 'classic' | 'band' | 'fullbleed' | 'centered' | 'gradient' | 'minimal'
export type HeadingStyle = 'bar' | 'number' | 'underline' | 'pill'

/** How a proposal looks. Lives on Settings (the default) and optionally on a proposal. */
export interface ProposalTheme {
  preset: string
  cover: CoverStyle
  heading: HeadingStyle
  accent: string
  accent2: string
  font: FontId
  headingFont: FontId
  /** Uploaded design (cover + letterhead) used instead of the built-in cover. */
  customTemplateId?: number
}

// ---------- uploaded designs ----------

export type ZoneType =
  // invoice
  | 'title'
  | 'number'
  | 'issueDate'
  | 'dueDate'
  | 'client'
  | 'business'
  | 'items'
  | 'totals'
  | 'amountDue'
  | 'words'
  | 'notes'
  | 'terms'
  | 'payment'
  // proposal cover
  | 'proposalTitle'
  | 'subtitle'
  | 'preparedFor'
  | 'preparedBy'
  | 'date'
  | 'validUntil'
  | 'proposalNumber'
  | 'proposalTotal'
  // both
  | 'logo'
  | 'signature'
  | 'text'
  | 'cover'

/** A box placed on top of an uploaded design. Position and size are in millimetres on an A4 page. */
export interface Zone {
  id: string
  type: ZoneType
  x: number
  y: number
  w: number
  h: number
  fontSize: number
  color: string
  align: 'left' | 'center' | 'right'
  bold: boolean
  showLabel: boolean
  /** Custom text zone content. */
  text?: string
  /** Background fill for 'cover' (hide) zones and table headers. */
  fill?: string
  font?: FontId
}

export interface CustomTemplate {
  id?: number
  kind: 'invoice' | 'proposal'
  name: string
  /** Invoice: the page. Proposal: the cover page. JPEG/PNG data URL, A4 portrait. */
  background: string
  zones: Zone[]
  /** Proposal only: letterhead behind the content pages, and the safe area (mm) content stays inside. */
  pageBackground?: string
  margins?: { top: number; right: number; bottom: number; left: number }
  /** Proposal only: text color on content pages (the cover's fields have their own colors). */
  pageInk?: string
  /** Default text color and font for content placed on this design. */
  ink: string
  font: FontId
  accent: string
  createdAt: number
  updatedAt: number
}

export const STYLE_KEYS: Array<keyof DocStyle> = [
  'preset',
  'template',
  'accentColor',
  'accent2',
  'font',
  'textSize',
  'radius',
  'tableStyle',
  'docTitle',
  'showTaxColumn',
  'amountInWords',
  'showPayment',
  'showSignature',
  'footerText',
  'customTemplateId',
]

export interface PaymentDetails {
  bankName: string
  accountName: string
  accountNumber: string
  branch: string
  routingNumber: string
  swift: string
  bkash: string
  nagad: string
  rocket: string
  other: string
}

export interface Settings extends DocStyle {
  id: 'default'
  businessName: string
  email: string
  phone: string
  website: string
  address: string
  logo?: string
  signature?: string
  signatory: string
  currency: Currency
  taxLabel: string
  taxRate: number
  invoicePrefix: string
  nextNumber: number
  dueDays: number
  proposalTheme: ProposalTheme
  proposalPrefix: string
  nextProposalNumber: number
  proposalValidDays: number
  notes: string
  terms: string
  payment: PaymentDetails
}

export interface ClientInfo {
  name: string
  company: string
  email: string
  phone: string
  address: string
}

export interface Client extends ClientInfo {
  id?: number
  createdAt: number
}

export interface Product {
  id?: number
  name: string
  description: string
  rate: number
  unit: string
  createdAt: number
}

export interface LineItem {
  id: string
  description: string
  qty: number
  rate: number
  taxRate: number
}

export interface Invoice {
  id?: number
  number: string
  status: InvoiceStatus
  clientId?: number
  // Snapshot of the client at the time of invoicing, so later client edits don't change old invoices.
  client: ClientInfo
  issueDate: string
  dueDate: string
  currency: Currency
  items: LineItem[]
  discountType: 'percent' | 'fixed'
  discountValue: number
  notes: string
  terms: string
  paidAt?: string
  reminders?: Array<{ at: number; channel: 'email' | 'whatsapp' }>
  /** Per-invoice design; falls back to the default style in Settings. */
  style?: DocStyle
  recurringId?: number
  share?: ShareRef
  createdAt: number
  updatedAt: number
}

/** A published copy of a document on the server, reachable at /p/:id. */
export interface ShareRef {
  id: string
  ownerKey: string
  publishedAt: number
}

export interface Acceptance {
  name: string
  email: string
  signature: string
  signedAt: string
  ip: string
  userAgent: string
}

export type ProposalStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined'

export type ProposalBlock =
  | { id: string; type: 'cover'; subtitle: string }
  | { id: string; type: 'text'; heading: string; body: string }
  | { id: string; type: 'scope'; heading: string; items: string[] }
  | { id: string; type: 'pricing'; heading: string; items: LineItem[]; discountType: 'percent' | 'fixed'; discountValue: number }
  | { id: string; type: 'timeline'; heading: string; milestones: Array<{ id: string; title: string; when: string; description: string }> }
  | { id: string; type: 'signature'; heading: string; body: string }

export type BlockType = ProposalBlock['type']

export interface Proposal {
  id?: number
  number: string
  title: string
  status: ProposalStatus
  clientId?: number
  client: ClientInfo
  date: string
  validUntil: string
  currency: Currency
  blocks: ProposalBlock[]
  /** Per-proposal look; falls back to the default proposal theme in Settings. */
  theme?: ProposalTheme
  share?: ShareRef
  acceptance?: Acceptance
  declined?: { name: string; reason: string; at: string }
  invoiceId?: number
  createdAt: number
  updatedAt: number
}

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface RecurringRule {
  id?: number
  sourceInvoiceId?: number
  // Copy of the invoice fields each generated invoice starts from.
  template: Pick<Invoice, 'clientId' | 'client' | 'currency' | 'items' | 'discountType' | 'discountValue' | 'notes' | 'terms'>
  frequency: Frequency
  nextDate: string
  endDate?: string
  active: boolean
  generatedCount: number
  createdAt: number
}

class InvoiceDB extends Dexie {
  settings!: EntityTable<Settings, 'id'>
  clients!: EntityTable<Client, 'id'>
  products!: EntityTable<Product, 'id'>
  invoices!: EntityTable<Invoice, 'id'>
  proposals!: EntityTable<Proposal, 'id'>
  recurring!: EntityTable<RecurringRule, 'id'>
  templates!: EntityTable<CustomTemplate, 'id'>

  constructor() {
    super('invoicekit')
    this.version(1).stores({
      settings: 'id',
      clients: '++id, name',
      products: '++id, name',
      invoices: '++id, number, status, clientId, issueDate, dueDate',
    })
    this.version(2).stores({
      proposals: '++id, number, status, clientId, date',
      recurring: '++id, nextDate, active',
    })
    this.version(3).stores({
      templates: '++id, kind, name',
    })
  }
}

export const db = new InvoiceDB()

export const emptyClient: ClientInfo = { name: '', company: '', email: '', phone: '', address: '' }

export const defaultSettings: Settings = {
  id: 'default',
  businessName: '',
  email: '',
  phone: '',
  website: '',
  address: '',
  signatory: '',
  currency: 'BDT',
  taxLabel: 'VAT',
  taxRate: 15,
  invoicePrefix: 'INV-',
  nextNumber: 1,
  dueDays: 14,
  preset: 'minimal-ink',
  template: 'minimal',
  accentColor: '#2563eb',
  accent2: '#93c5fd',
  font: 'jakarta',
  textSize: 'md',
  radius: 'sm',
  tableStyle: 'lines',
  docTitle: 'Invoice',
  showTaxColumn: true,
  amountInWords: false,
  showPayment: true,
  showSignature: true,
  footerText: '',
  proposalTheme: {
    preset: 'p-classic-blue',
    cover: 'classic',
    heading: 'bar',
    accent: '#2563eb',
    accent2: '#93c5fd',
    font: 'jakarta',
    headingFont: 'jakarta',
  },
  proposalPrefix: 'PRO-',
  nextProposalNumber: 1,
  proposalValidDays: 30,
  notes: 'Thank you for your business.',
  terms: 'Payment is due by the due date shown above.',
  payment: {
    bankName: '',
    accountName: '',
    accountNumber: '',
    branch: '',
    routingNumber: '',
    swift: '',
    bkash: '',
    nagad: '',
    rocket: '',
    other: '',
  },
}

export async function getSettings(): Promise<Settings> {
  const saved = await db.settings.get('default')
  return saved
    ? {
        ...defaultSettings,
        ...saved,
        payment: { ...defaultSettings.payment, ...saved.payment },
        proposalTheme: { ...defaultSettings.proposalTheme, ...saved.proposalTheme },
      }
    : defaultSettings
}

/** Returns undefined only while loading. */
export function useSettings(): Settings | undefined {
  return useLiveQuery(getSettings, [])
}

export function styleOf(s: Settings): DocStyle {
  return Object.fromEntries(STYLE_KEYS.map((k) => [k, s[k]])) as unknown as DocStyle
}

/** Settings with an invoice's own design applied on top. */
export function withStyle(s: Settings, style?: DocStyle): Settings {
  return style ? { ...s, ...style } : s
}

export function formatInvoiceNumber(s: Pick<Settings, 'invoicePrefix' | 'nextNumber'>): string {
  return `${s.invoicePrefix}${String(s.nextNumber).padStart(4, '0')}`
}

export function formatProposalNumber(s: Pick<Settings, 'proposalPrefix' | 'nextProposalNumber'>): string {
  return `${s.proposalPrefix}${String(s.nextProposalNumber).padStart(4, '0')}`
}

/** Allocates the next invoice number inside the caller's transaction (which must include db.settings). */
export async function takeInvoiceNumber(): Promise<string> {
  const s = await getSettings()
  await db.settings.put({ ...s, nextNumber: s.nextNumber + 1 })
  return formatInvoiceNumber(s)
}
