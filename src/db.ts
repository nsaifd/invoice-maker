import Dexie, { type EntityTable, type Table, type Transaction } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { regionDefaults } from './lib/locale'

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
  customTemplateId?: string
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
  customTemplateId?: string
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
  id?: string
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
  id?: string
  createdAt: number
}

export interface Product {
  id?: string
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
  id?: string
  number: string
  status: InvoiceStatus
  clientId?: string
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
  /** Payments received so far (an invoice can be paid in parts). */
  payments?: Payment[]
  /** The client confirmed the invoice from its share link. */
  clientConfirmation?: { name: string; note: string; at: number }
  reminders?: Array<{ at: number; channel: 'email' | 'whatsapp' }>
  /** Per-invoice design; falls back to the default style in Settings. */
  style?: DocStyle
  recurringId?: string
  share?: ShareRef
  createdAt: number
  updatedAt: number
}

export interface Payment {
  id: string
  /** In whole currency units, like line-item rates. */
  amount: number
  method: string
  reference: string
  paidOn: string
  note: string
  /** Set when the client reported it from the share link and you confirmed it. */
  reportId?: number
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
  id?: string
  number: string
  title: string
  status: ProposalStatus
  clientId?: string
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
  invoiceId?: string
  createdAt: number
  updatedAt: number
}

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface RecurringRule {
  id?: string
  sourceInvoiceId?: string
  // Copy of the invoice fields each generated invoice starts from.
  template: Pick<Invoice, 'clientId' | 'client' | 'currency' | 'items' | 'discountType' | 'discountValue' | 'notes' | 'terms'>
  frequency: Frequency
  nextDate: string
  /** Day of month the schedule started on, so monthly dates don't drift after short months. */
  anchorDay?: number
  endDate?: string
  active: boolean
  generatedCount: number
  createdAt: number
}

/** Tables that are synced to the user's account. */
export const SYNC_TABLES = ['settings', 'clients', 'products', 'invoices', 'proposals', 'recurring', 'templates'] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

/** Sync bookkeeping stored on every synced record. */
export interface SyncMeta {
  /** Last local change time (ms). */
  _ts?: number
  /** 1 while the change hasn't been uploaded yet. */
  _dirty?: 0 | 1
}

/** A deletion waiting to be uploaded. */
export interface Tombstone {
  tbl: SyncTable
  id: string
  ts: number
}

class InvoiceDB extends Dexie {
  settings!: EntityTable<Settings & SyncMeta, 'id'>
  clients!: EntityTable<Client & SyncMeta, 'id'>
  products!: EntityTable<Product & SyncMeta, 'id'>
  invoices!: EntityTable<Invoice & SyncMeta, 'id'>
  proposals!: EntityTable<Proposal & SyncMeta, 'id'>
  recurring!: EntityTable<RecurringRule & SyncMeta, 'id'>
  templates!: EntityTable<CustomTemplate & SyncMeta, 'id'>
  outbox!: Dexie.Table<Tombstone, [string, string]>

  constructor() {
    // A new database: records use random string ids so several devices can create them without clashing.
    super('involet')
    this.version(1).stores({
      settings: 'id, _dirty',
      clients: 'id, name, createdAt, _dirty',
      products: 'id, name, createdAt, _dirty',
      invoices: 'id, number, status, clientId, issueDate, dueDate, createdAt, _dirty',
      proposals: 'id, number, status, clientId, date, createdAt, _dirty',
      recurring: 'id, nextDate, active, createdAt, _dirty',
      templates: 'id, kind, name, createdAt, _dirty',
      outbox: '[tbl+id]',
    })
  }
}

export const db = new InvoiceDB()

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => ID_ALPHABET[b % 36]).join('')
}

/** Writes inside a transaction marked this way come from the server and must not be re-uploaded. */
export function markRemote(tx: Transaction | null) {
  if (tx) (tx as unknown as { remote?: boolean }).remote = true
}
const isRemote = (tx: unknown) => !!(tx as { remote?: boolean } | null)?.remote

let onLocalChange: () => void = () => {}
/** The sync engine registers here to hear about local edits. */
export function setLocalChangeListener(fn: () => void) {
  onLocalChange = fn
}

for (const name of SYNC_TABLES) {
  const table = db.table(name)
  table.hook('creating', function (_pk, obj: { id?: string } & SyncMeta, tx) {
    if (!obj.id) obj.id = newId()
    if (!isRemote(tx)) {
      obj._ts = Date.now()
      obj._dirty = 1
      tx.on('complete', () => onLocalChange())
    }
    return obj.id
  })
  table.hook('updating', function (_mods, _pk, _obj, tx) {
    if (isRemote(tx)) return
    tx.on('complete', () => onLocalChange())
    return { _ts: Date.now(), _dirty: 1 }
  })
  table.hook('deleting', function (pk, _obj, tx) {
    if (isRemote(tx)) return
    tx.on('complete', () => {
      db.outbox.put({ tbl: name, id: String(pk), ts: Date.now() }).then(() => onLocalChange())
    })
  })
}

export const emptyClient: ClientInfo = { name: '', company: '', email: '', phone: '', address: '' }

export const defaultSettings: Settings = {
  id: 'default',
  businessName: '',
  email: '',
  phone: '',
  website: '',
  address: '',
  signatory: '',
  // Currency and tax follow the visitor's region (Taka and 15% VAT in Bangladesh).
  ...regionDefaults(),
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

type NumberKind = 'invoice' | 'proposal'
const NUMBERING = {
  invoice: { table: () => db.invoices, prefix: 'invoicePrefix', counter: 'nextNumber' },
  proposal: { table: () => db.proposals, prefix: 'proposalPrefix', counter: 'nextProposalNumber' },
} as const

function formatNumber(prefix: string, n: number) {
  return `${prefix}${String(n).padStart(4, '0')}`
}

/**
 * The counter's next number, skipping any already used — e.g. one typed by hand or synced
 * from another device — so two documents never get the same number.
 */
async function nextFree(kind: NumberKind, s: Settings): Promise<{ number: string; n: number }> {
  const { table, prefix, counter } = NUMBERING[kind]
  let n = Math.max(1, Math.floor(Number(s[counter]) || 1))
  for (let i = 0; i < 10_000; i++, n++) {
    const number = formatNumber(s[prefix], n)
    if (!(await (table() as unknown as Table).where('number').equals(number).count())) return { number, n }
  }
  return { number: formatNumber(s[prefix], n), n }
}

/** A suggested number for a new document; nothing is reserved until it is saved. */
export async function suggestNumber(kind: NumberKind): Promise<string> {
  return (await nextFree(kind, await getSettings())).number
}

/** Allocates the next free number inside the caller's transaction (which must include db.settings and the documents' table). */
export async function takeNumber(kind: NumberKind): Promise<string> {
  const s = await getSettings()
  const { number, n } = await nextFree(kind, s)
  await db.settings.put({ ...s, [NUMBERING[kind].counter]: n + 1 })
  return number
}

export const takeInvoiceNumber = () => takeNumber('invoice')

/**
 * After a document is saved with `number`: if it uses the current prefix and a number at or past
 * the counter (the suggested one, or one typed by hand), move the counter past it.
 */
export async function bumpCounter(kind: NumberKind, number: string): Promise<void> {
  const s = await getSettings()
  const { prefix, counter } = NUMBERING[kind]
  const p = s[prefix]
  if (!number.startsWith(p)) return
  const rest = number.slice(p.length)
  if (!/^\d{1,9}$/.test(rest)) return
  const n = Number(rest)
  if (n >= s[counter]) await db.settings.put({ ...s, [counter]: n + 1 })
}
