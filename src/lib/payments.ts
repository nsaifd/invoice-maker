import { db, type Invoice, type Payment } from '../db'
import { calcTotals, toCents, todayISO, uid } from './invoice'
import { reviewInvoice, type PaymentReport } from './share'

/** Paid so far and still owed, in cents. A paid invoice owes nothing even without recorded payments. */
export function balance(inv: Pick<Invoice, 'items' | 'discountType' | 'discountValue' | 'status' | 'payments'>) {
  const total = calcTotals(inv).total
  const paid = (inv.payments ?? []).reduce((a, p) => a + toCents(p.amount), 0)
  return { total, paid, due: inv.status === 'paid' ? 0 : Math.max(total - paid, 0) }
}

/** Payment methods the client can pick, starting with the ones in your payment details. */
export function paymentMethods(p: { bkash: string; nagad: string; rocket: string; bankName: string; accountNumber: string }): string[] {
  const configured = [p.bkash.trim() && 'bKash', p.nagad.trim() && 'Nagad', p.rocket.trim() && 'Rocket', (p.bankName.trim() || p.accountNumber.trim()) && 'Bank transfer'].filter(Boolean) as string[]
  return [...new Set([...configured, 'Bank transfer', 'Cash', 'Card', 'Other'])]
}

/**
 * You confirm a payment the client reported: it's recorded on the invoice, the client's page shows
 * it as received, and once the full amount is in, the invoice becomes paid (on both sides).
 */
export async function confirmReported(inv: Invoice, report: PaymentReport) {
  if (!inv.share || !inv.id) return
  if ((inv.payments ?? []).some((p) => p.reportId === report.id)) return
  await reviewInvoice(inv.share, { type: 'payment_ok', paymentId: report.id })
  const payment: Payment = { id: uid(), amount: report.amount, method: report.method, reference: report.reference, paidOn: report.paidOn, note: report.note, reportId: report.id }
  const payments = [...(inv.payments ?? []), payment]
  const fully = balance({ ...inv, status: 'sent', payments }).due === 0
  // Payment state isn't an edit of the document, so updatedAt (which flags the share as outdated) stays.
  await db.invoices.update(inv.id, { payments, ...(fully ? { status: 'paid' as const, paidAt: report.paidOn } : {}) })
  if (fully) await reviewInvoice(inv.share, { type: 'paid', paidOn: report.paidOn })
}

export const rejectReported = (inv: Invoice, report: PaymentReport, reason: string) => inv.share && reviewInvoice(inv.share, { type: 'payment_rejected', paymentId: report.id, reason })

/** Marks the invoice paid or unpaid here, and on the client's page if it was shared. */
export async function setPaid(inv: Invoice, paid: boolean) {
  const paidAt = todayISO()
  await db.invoices.update(inv.id!, paid ? { status: 'paid', paidAt } : { status: 'sent', paidAt: undefined })
  // Best effort: the invoice is updated here even when the server can't be reached.
  if (inv.share) await reviewInvoice(inv.share, paid ? { type: 'paid', paidOn: paidAt } : { type: 'unpaid' }).catch(() => {})
}
