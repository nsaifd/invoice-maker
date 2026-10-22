import type { Invoice, Settings } from '../db'
import { addDays, todayISO, uid } from './invoice'
import { region } from './locale'

/** Example invoice used to preview designs before the user has real data. */
export function sampleInvoice(s: Settings): Invoice {
  const issueDate = todayISO()
  // Sample client and prices that fit the chosen currency, so previews look local to you.
  const r = region(s.currency)
  return {
    number: `${s.invoicePrefix}0042`,
    status: 'sent',
    client: { ...r.sampleClient },
    issueDate,
    dueDate: addDays(issueDate, s.dueDays),
    currency: s.currency,
    items: r.sampleItems.map((it) => ({ id: uid(), ...it, qty: 1, taxRate: s.taxRate })),
    discountType: 'percent',
    discountValue: 5,
    notes: s.notes,
    terms: s.terms,
    createdAt: 0,
    updatedAt: 0,
  }
}
