import type { Frequency, Invoice, RecurringRule, Settings } from '../db'
import { db, getSettings, takeInvoiceNumber } from '../db'
import { addDays, calcTotals, formatDate, formatMoney, todayISO, uid } from './invoice'

export const FREQUENCIES: Record<Frequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Every 3 months',
  yearly: 'Yearly',
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  // Clamp to the last day of the month (e.g. 31 Jan + 1 month → 28/29 Feb).
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return target.toISOString().slice(0, 10)
}

export function nextOccurrence(iso: string, f: Frequency): string {
  if (f === 'weekly') return addDays(iso, 7)
  return addMonths(iso, f === 'monthly' ? 1 : f === 'quarterly' ? 3 : 12)
}

export function ruleFromInvoice(inv: Invoice, frequency: Frequency, nextDate: string, endDate?: string): RecurringRule {
  const { clientId, client, currency, items, discountType, discountValue, notes, terms } = inv
  return {
    sourceInvoiceId: inv.id,
    template: { clientId, client, currency, items, discountType, discountValue, notes, terms },
    frequency,
    nextDate,
    endDate: endDate || undefined,
    active: true,
    generatedCount: 0,
    createdAt: Date.now(),
  }
}

/**
 * Creates every invoice whose scheduled date has arrived. Runs when the app opens, since
 * there is no server holding your data; missed dates are caught up (up to 24 per rule).
 */
export async function runRecurring(): Promise<number> {
  const today = todayISO()
  const due = await db.recurring.where('nextDate').belowOrEqual(today).filter((r) => r.active).toArray()
  let created = 0
  for (const rule of due) {
    await db.transaction('rw', db.recurring, db.invoices, db.settings, async () => {
      const fresh = await db.recurring.get(rule.id!)
      if (!fresh?.active) return
      const s = await getSettings()
      let next = fresh.nextDate
      let count = fresh.generatedCount
      for (let i = 0; i < 24 && next <= today && (!fresh.endDate || next <= fresh.endDate); i++) {
        await db.invoices.add({
          ...fresh.template,
          items: fresh.template.items.map((it) => ({ ...it, id: uid() })),
          number: await takeInvoiceNumber(),
          status: 'draft',
          issueDate: next,
          dueDate: addDays(next, s.dueDays),
          recurringId: fresh.id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        created++
        count++
        next = nextOccurrence(next, fresh.frequency)
      }
      const ended = !!fresh.endDate && next > fresh.endDate
      await db.recurring.update(fresh.id!, { nextDate: next, generatedCount: count, active: !ended })
    })
  }
  return created
}

// Reminders: the app prepares the message, your own email or WhatsApp sends it.

export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  // Bangladeshi local mobile numbers: 01XXXXXXXXX → 8801XXXXXXXXX
  if (digits.length === 11 && digits.startsWith('01')) digits = `88${digits}`
  return digits
}

export function reminderText(inv: Invoice, settings: Settings, link?: string): { subject: string; body: string } {
  const total = formatMoney(calcTotals(inv).total, inv.currency)
  const overdue = inv.dueDate < todayISO()
  const subject = `${overdue ? 'Overdue' : 'Reminder'}: invoice ${inv.number} from ${settings.businessName || 'us'}`
  const body = [
    `Hi ${inv.client.name},`,
    '',
    overdue
      ? `This is a friendly reminder that invoice ${inv.number} for ${total} was due on ${formatDate(inv.dueDate)} and is still unpaid.`
      : `This is a friendly reminder that invoice ${inv.number} for ${total} is due on ${formatDate(inv.dueDate)}.`,
    link ? `\nView the invoice online: ${link}` : '',
    '',
    'Thank you,',
    settings.businessName,
  ].join('\n')
  return { subject, body }
}

export function openReminder(channel: 'email' | 'whatsapp', inv: Invoice, settings: Settings, link?: string) {
  const { subject, body } = reminderText(inv, settings, link)
  if (channel === 'email') {
    window.location.href = `mailto:${encodeURIComponent(inv.client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  } else {
    window.open(`https://wa.me/${normalizePhone(inv.client.phone)}?text=${encodeURIComponent(body)}`, '_blank', 'noopener')
  }
  return db.invoices.update(inv.id!, { reminders: [...(inv.reminders ?? []), { at: Date.now(), channel }] })
}
