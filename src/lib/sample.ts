import type { Invoice, Settings } from '../db'
import { addDays, todayISO, uid } from './invoice'

/** Example invoice used to preview designs before the user has real data. */
export function sampleInvoice(s: Settings): Invoice {
  const issueDate = todayISO()
  return {
    number: `${s.invoicePrefix}0042`,
    status: 'sent',
    client: { name: 'Rahim Ahmed', company: 'Rahim Traders Ltd.', email: 'rahim@example.com', phone: '+880 1711-000000', address: 'House 12, Road 5, Gulshan, Dhaka' },
    issueDate,
    dueDate: addDays(issueDate, s.dueDays),
    currency: s.currency,
    items: [
      { id: uid(), description: 'Website design & development', qty: 1, rate: 45000, taxRate: s.taxRate },
      { id: uid(), description: 'Logo & brand guidelines', qty: 1, rate: 12000, taxRate: s.taxRate },
      { id: uid(), description: 'Hosting (1 year)', qty: 1, rate: 4500, taxRate: s.taxRate },
    ],
    discountType: 'percent',
    discountValue: 5,
    notes: s.notes,
    terms: s.terms,
    createdAt: 0,
    updatedAt: 0,
  }
}
