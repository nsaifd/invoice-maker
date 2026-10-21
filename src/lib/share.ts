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

export interface PublicShare {
  kind: ShareKind
  doc: SharedDoc
  status: ShareStatus
  acceptance: Pick<Acceptance, 'name' | 'signature' | 'signedAt'> | null
  decline: { name: string; reason: string; at: string } | null
  comments: Comment[]
  updatedAt: number
}

export interface Activity {
  status: ShareStatus
  acceptance: Acceptance | null
  decline: { name: string; reason: string; at: string } | null
  comments: Comment[]
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
    invoice: doc.invoice && { ...clean(doc.invoice)!, reminders: undefined, recurringId: undefined },
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
