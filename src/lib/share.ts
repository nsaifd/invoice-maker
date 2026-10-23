import { useEffect, useState } from 'react'
import { db, styleOf, type Acceptance, type CustomTemplate, type Invoice, type Proposal, type Settings, type ShareRef } from '../db'

// Client for the share-link API in worker/index.ts.

export type ShareKind = 'proposal' | 'invoice'
export type ShareStatus = 'open' | 'accepted' | 'declined'

export interface SharedDoc {
  settings: Omit<Settings, 'id' | 'nextNumber' | 'nextProposalNumber'>
  proposal?: Proposal
  invoice?: Invoice
  /** Uploaded design the document uses, embedded so the client sees it without our local data. */
  customTemplate?: CustomTemplate
}

export interface Comment {
  author: 'owner' | 'client'
  name: string
  body: string
  at: number
}

/** A payment the client reported from the invoice link, and what the owner decided. */
export interface PaymentReport {
  id: number
  name: string
  method: string
  /** In whole currency units, like line-item rates. */
  amount: number
  reference: string
  paidOn: string
  note: string
  hasProof: boolean
  at: number
  status: 'pending' | 'confirmed' | 'rejected'
  reason?: string
}

/** What the client and owner did on a shared invoice. */
export interface InvoiceShareState {
  confirmation: { name: string; note: string; at: number } | null
  payments: PaymentReport[]
  paid: { paidOn: string; at: number } | null
  /** The owner set paid/unpaid on the server; otherwise the shared invoice's own status applies. */
  marked: boolean
}

export interface PublicShare {
  kind: ShareKind
  doc: SharedDoc
  status: ShareStatus
  acceptance: Pick<Acceptance, 'name' | 'signature' | 'signedAt'> | null
  decline: { name: string; reason: string; at: string } | null
  comments: Comment[]
  invoice?: InvoiceShareState
  updatedAt: number
}

export interface Activity {
  status: ShareStatus
  acceptance: Acceptance | null
  decline: { name: string; reason: string; at: string } | null
  comments: Comment[]
  invoice?: InvoiceShareState
  views: { opens: number; visitors: number; first: number | null; last: number | null }
  sections: Array<{ section: string; ms: number }>
  recent: Array<{ at: number; ip: string; ua: string }>
}

async function api<T>(path: string, init: RequestInit & { ownerKey?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (init.ownerKey) headers['x-owner-key'] = init.ownerKey
  let res: Response
  try {
    res = await fetch(`/api/shares${path}`, { ...init, headers })
  } catch {
    throw new Error('Could not reach the server. Check your internet connection.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  return data as T
}

/** Strips private fields (owner key, reminders) before a document leaves the browser. */
export async function snapshot(settings: Settings, doc: { proposal?: Proposal; invoice?: Invoice }): Promise<SharedDoc> {
  const style = doc.invoice ? (doc.invoice.style ?? styleOf(settings)) : undefined
  const templateId = doc.proposal ? (doc.proposal.theme ?? settings.proposalTheme).customTemplateId : style?.template === 'custom' ? style.customTemplateId : undefined
  const customTemplate = templateId ? await db.templates.get(templateId) : undefined
  const { id: _id, nextNumber: _n, nextProposalNumber: _p, ...publicSettings } = settings
  const clean = <T extends { share?: ShareRef }>(d?: T) => d && { ...d, share: undefined }
  return {
    settings: publicSettings,
    proposal: doc.proposal && { ...clean(doc.proposal)!, acceptance: undefined, declined: undefined, invoiceId: undefined },
    // Payments and the client's confirmation reach the client page from the server, not the snapshot.
    invoice: doc.invoice && { ...clean(doc.invoice)!, reminders: undefined, recurringId: undefined, payments: undefined, clientConfirmation: undefined },
    customTemplate,
  }
}

export const shareUrl = (id: string) => `${location.origin}/p/${id}`

export async function publish(kind: ShareKind, doc: SharedDoc): Promise<ShareRef> {
  const r = await api<{ id: string; ownerKey: string }>('', { method: 'POST', body: JSON.stringify({ kind, doc }) })
  return { id: r.id, ownerKey: r.ownerKey, publishedAt: Date.now() }
}

export async function republish(share: ShareRef, doc: SharedDoc): Promise<ShareRef> {
  await api(`/${share.id}`, { method: 'PUT', body: JSON.stringify({ doc }), ownerKey: share.ownerKey })
  return { ...share, publishedAt: Date.now() }
}

export const unpublish = (share: ShareRef) => api(`/${share.id}`, { method: 'DELETE', ownerKey: share.ownerKey })

export const fetchShare = (id: string) => api<PublicShare>(`/${id}`)

export const fetchActivity = (share: ShareRef) => api<Activity>(`/${share.id}/activity`, { ownerKey: share.ownerKey })

export const acceptShare = (id: string, body: { name: string; email: string; signature: string }) =>
  api<{ acceptance: PublicShare['acceptance'] }>(`/${id}/accept`, { method: 'POST', body: JSON.stringify(body) })

export const declineShare = (id: string, body: { name: string; reason: string }) =>
  api<{ decline: PublicShare['decline'] }>(`/${id}/decline`, { method: 'POST', body: JSON.stringify(body) })

export const confirmInvoice = (id: string, body: { name: string; note: string }) =>
  api<{ invoice: InvoiceShareState }>(`/${id}/confirm`, { method: 'POST', body: JSON.stringify(body) })

export const reportPayment = (id: string, body: { name: string; method: string; amount: number; reference: string; paidOn: string; note: string; proof?: string }) =>
  api<{ invoice: InvoiceShareState }>(`/${id}/payments`, { method: 'POST', body: JSON.stringify(body) })

export type Review = { type: 'payment_ok' | 'payment_rejected'; paymentId: number; reason?: string } | { type: 'paid'; paidOn: string } | { type: 'unpaid' }

/** The owner confirms or rejects a reported payment, or marks the invoice paid/unpaid for the client. */
export const reviewInvoice = (share: ShareRef, review: Review) =>
  api<{ invoice: InvoiceShareState }>(`/${share.id}/review`, { method: 'POST', body: JSON.stringify(review), ownerKey: share.ownerKey })

export const fetchProof = (share: ShareRef, paymentId: number) => api<{ proof: string }>(`/${share.id}/payments/${paymentId}/proof`, { ownerKey: share.ownerKey })

/** News on many shared invoices at once (payments reported, confirmations), keyed by share id. */
export const fetchInbox = (shares: ShareRef[]) =>
  api<{ shares: Record<string, InvoiceShareState> }>('/inbox', { method: 'POST', body: JSON.stringify({ shares: shares.map((s) => ({ id: s.id, ownerKey: s.ownerKey })) }) })

export const postComment = (id: string, body: { name: string; body: string }, ownerKey?: string) =>
  api<{ comments: Comment[] }>(`/${id}/comments`, { method: 'POST', body: JSON.stringify(body), ownerKey })

/** Sends view-tracking events; uses keepalive so it also works while the page is closing. */
export function sendEvents(id: string, visitor: string, events: Array<{ type: 'open' | 'section'; section?: string; ms?: number }>) {
  if (!events.length) return
  fetch(`/api/shares/${id}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ visitor, events }),
    keepalive: true,
  }).catch(() => {})
}

export function timeAgo(ts: number | string): string {
  const ms = Date.now() - new Date(ts).getTime()
  const m = Math.round(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

/** News from your shared, unpaid invoices (payments to review), refreshed every minute while shown. */
export function useInvoiceInbox(invoices: Array<{ share?: ShareRef; status: string }> | undefined) {
  const shares = (invoices ?? []).filter((i) => i.share && i.status !== 'paid').map((i) => i.share!)
  const key = shares.map((s) => s.id).join(',')
  const [inbox, setInbox] = useState<Record<string, InvoiceShareState>>({})
  useEffect(() => {
    if (!key) return setInbox({})
    let alive = true
    const load = () =>
      fetchInbox(shares)
        .then((r) => alive && setInbox(r.shares))
        .catch(() => {})
    load()
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
    // `shares` is derived from `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return inbox
}
