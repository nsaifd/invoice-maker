import Dexie, { type EntityTable } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'

export type Currency = 'BDT' | 'USD' | 'EUR' | 'GBP' | 'INR'
export type InvoiceStatus = 'draft' | 'sent' | 'paid'

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

export interface Settings {
  id: 'default'
  businessName: string
  email: string
  phone: string
  website: string
  address: string
  logo?: string
  currency: Currency
  taxLabel: string
  taxRate: number
  invoicePrefix: string
  nextNumber: number
  dueDays: number
  accentColor: string
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
  createdAt: number
  updatedAt: number
}

class InvoiceDB extends Dexie {
  settings!: EntityTable<Settings, 'id'>
  clients!: EntityTable<Client, 'id'>
  products!: EntityTable<Product, 'id'>
  invoices!: EntityTable<Invoice, 'id'>

  constructor() {
    super('invoicekit')
    this.version(1).stores({
      settings: 'id',
      clients: '++id, name',
      products: '++id, name',
      invoices: '++id, number, status, clientId, issueDate, dueDate',
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
  currency: 'BDT',
  taxLabel: 'VAT',
  taxRate: 15,
  invoicePrefix: 'INV-',
  nextNumber: 1,
  dueDays: 14,
  accentColor: '#2563eb',
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
  return saved ? { ...defaultSettings, ...saved, payment: { ...defaultSettings.payment, ...saved.payment } } : defaultSettings
}

/** Returns undefined only while loading. */
export function useSettings(): Settings | undefined {
  return useLiveQuery(getSettings, [])
}

export function formatInvoiceNumber(s: Pick<Settings, 'invoicePrefix' | 'nextNumber'>): string {
  return `${s.invoicePrefix}${String(s.nextNumber).padStart(4, '0')}`
}
