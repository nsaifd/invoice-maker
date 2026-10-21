import type { Currency, Invoice, LineItem, Settings } from '../db'
import { emptyClient, formatInvoiceNumber } from '../db'

export const CURRENCIES: Record<Currency, { symbol: string; locale: string; label: string }> = {
  BDT: { symbol: '৳', locale: 'en-IN', label: 'BDT — Bangladeshi Taka' },
  USD: { symbol: '$', locale: 'en-US', label: 'USD — US Dollar' },
  EUR: { symbol: '€', locale: 'en-IE', label: 'EUR — Euro' },
  GBP: { symbol: '£', locale: 'en-GB', label: 'GBP — British Pound' },
  INR: { symbol: '₹', locale: 'en-IN', label: 'INR — Indian Rupee' },
}

// All money math happens in integer cents (paisa) to avoid floating-point errors.
const toCents = (n: number) => Math.round((Number(n) || 0) * 100)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function calcTotals(inv: Pick<Invoice, 'items' | 'discountType' | 'discountValue'>) {
  const lines = inv.items.map((i) => Math.round((Number(i.qty) || 0) * toCents(i.rate)))
  const subtotal = sum(lines)
  const discount =
    inv.discountType === 'percent'
      ? Math.round((subtotal * Math.min(Math.max(Number(inv.discountValue) || 0, 0), 100)) / 100)
      : Math.min(Math.max(toCents(inv.discountValue), 0), subtotal)
  // Discount is spread proportionally across lines before tax.
  const factor = subtotal ? (subtotal - discount) / subtotal : 0
  const tax = Math.round(sum(lines.map((l, idx) => (l * (Number(inv.items[idx].taxRate) || 0)) / 100)) * factor)
  return { lines, subtotal, discount, tax, total: subtotal - discount + tax }
}

export function formatMoney(cents: number, currency: Currency): string {
  const c = CURRENCIES[currency] ?? CURRENCIES.USD
  const n = (Math.abs(cents) / 100).toLocaleString(c.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${cents < 0 ? '-' : ''}${c.symbol}${n}`
}

export function todayISO(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function formatDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export type DisplayStatus = 'draft' | 'sent' | 'paid' | 'overdue'

export function displayStatus(inv: Pick<Invoice, 'status' | 'dueDate'>): DisplayStatus {
  if (inv.status === 'sent' && inv.dueDate && inv.dueDate < todayISO()) return 'overdue'
  return inv.status
}

export const uid = () => Math.random().toString(36).slice(2, 10)

export function newLineItem(settings: Settings, patch: Partial<LineItem> = {}): LineItem {
  return { id: uid(), description: '', qty: 1, rate: 0, taxRate: settings.taxRate, ...patch }
}

export function newInvoice(settings: Settings): Invoice {
  const issueDate = todayISO()
  return {
    number: formatInvoiceNumber(settings),
    status: 'draft',
    client: { ...emptyClient },
    issueDate,
    dueDate: addDays(issueDate, settings.dueDays),
    currency: settings.currency,
    items: [newLineItem(settings)],
    discountType: 'percent',
    discountValue: 0,
    notes: settings.notes,
    terms: settings.terms,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}
