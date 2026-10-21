import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Eye, ExternalLink, Link2, Mail, MessageCircle, RefreshCw, Send, ShieldCheck, Unlink } from 'lucide-react'
import type { ShareRef } from '../db'
import { fetchActivity, formatDuration, postComment, publish, republish, shareUrl, timeAgo, unpublish, type Activity, type ShareKind, type SharedDoc } from '../lib/share'
import { normalizePhone } from '../lib/recurring'
import { Button, inputCls } from './ui'

const panel = 'rounded-2xl border border-zinc-200 p-5'

export function SharePanel({
  kind,
  share,
  dirty,
  locked,
  makeDoc,
  onChange,
  message,
}: {
  kind: ShareKind
  share?: ShareRef
  /** The local document changed after it was last published. */
  dirty: boolean
  /** Signed proposals can't be republished. */
  locked?: boolean
  makeDoc: () => SharedDoc
  onChange: (share: ShareRef | undefined) => void | Promise<unknown>
  /** Text for the WhatsApp/email share; the link is appended. */
  message: { subject: string; body: string; email?: string; phone?: string }
}) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!share)
    return (
      <div className={panel}>
        <div className="mb-1 flex items-center gap-2 font-semibold text-zinc-900">
          <Link2 className="h-4 w-4" /> Share online
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          {kind === 'proposal'
            ? 'Create a private link. Your client can read, comment, and accept with an e-signature — no login needed.'
            : 'Create a private link your client can open to view and download the invoice. You’ll see when they open it.'}
        </p>
        <Button className="w-full" icon={Link2} disabled={busy} onClick={() => run(async () => onChange(await publish(kind, makeDoc())))}>
          {busy ? 'Creating…' : 'Create share link'}
        </Button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    )

  const url = shareUrl(share.id)
  const text = `${message.body}\n\n${url}`
  return (
    <div className={panel}>
      <div className="mb-3 flex items-center gap-2 font-semibold text-zinc-900">
        <Link2 className="h-4 w-4" /> Share link
      </div>
      <div className="flex gap-2">
        <input readOnly value={url} className={`${inputCls} py-2 text-xs`} onFocus={(e) => e.target.select()} />
        <Button
          variant="secondary"
          aria-label="Copy link"
          className="px-2.5"
          onClick={() => {
            navigator.clipboard?.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <a href={url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
          <ExternalLink className="h-3.5 w-3.5" /> Open
        </a>
        <a
          href={`https://wa.me/${normalizePhone(message.phone ?? '')}?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </a>
        <a
          href={`mailto:${encodeURIComponent(message.email ?? '')}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(text)}`}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <Mail className="h-3.5 w-3.5" /> Email
        </a>
      </div>
      {dirty && !locked && (
        <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          You changed this document after sharing it.
          <Button className="mt-2 w-full" icon={RefreshCw} disabled={busy} onClick={() => run(async () => onChange(await republish(share, makeDoc())))}>
            {busy ? 'Updating…' : 'Update shared version'}
          </Button>
        </div>
      )}
      <button
        type="button"
        disabled={busy}
        className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-600"
        onClick={() =>
          confirm('Remove the link? Your client will no longer be able to open it, and its views and comments are deleted.') &&
          run(async () => {
            await unpublish(share).catch((e: Error) => {
              // Already gone on the server: still clear it locally.
              if (!/does not exist/.test(e.message)) throw e
            })
            await onChange(undefined)
          })
        }
      >
        <Unlink className="h-3.5 w-3.5" /> Remove link
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}

/** Polls the owner-only activity endpoint while the page is open. */
export function useActivity(share: ShareRef | undefined, onUpdate?: (a: Activity) => void) {
  const [activity, setActivity] = useState<Activity | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!share) return
    try {
      const a = await fetchActivity(share)
      setActivity(a)
      setError('')
      onUpdate?.(a)
    } catch (e) {
      setError((e as Error).message)
    }
    // onUpdate is intentionally excluded so a new callback identity doesn't restart polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share?.id, share?.ownerKey])
  const shareId = share?.id
  useEffect(() => {
    setActivity(null)
    if (!shareId) return
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [shareId, load])
  return { activity, setActivity, error, reload: load }
}

export function ActivityPanel({ activity, error, sectionLabels }: { activity: Activity | null; error: string; sectionLabels?: Record<string, string> }) {
  if (error) return <div className={`${panel} text-sm text-red-600`}>{error}</div>
  if (!activity) return <div className={`${panel} text-sm text-zinc-400`}>Loading activity…</div>
  const v = activity.views
  const maxMs = Math.max(1, ...activity.sections.map((s) => s.ms))
  return (
    <div className={panel}>
      <div className="mb-4 flex items-center gap-2 font-semibold text-zinc-900">
        <Eye className="h-4 w-4" /> Activity
      </div>
      {v.opens === 0 ? (
        <p className="text-sm text-zinc-500">Not opened yet. You’ll see here when your client views it.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-zinc-50 p-3">
              <div className="text-xl font-semibold text-zinc-900">{v.opens}</div>
              <div className="text-xs text-zinc-500">
                view{v.opens === 1 ? '' : 's'} · {v.visitors} device{v.visitors === 1 ? '' : 's'}
              </div>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3">
              <div className="text-sm font-semibold text-zinc-900">{v.last ? timeAgo(v.last) : '—'}</div>
              <div className="text-xs text-zinc-500">last opened</div>
              {v.first && <div className="mt-1 text-[11px] text-zinc-400">first {timeAgo(v.first)}</div>}
            </div>
          </div>
          {activity.sections.length > 0 && sectionLabels && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-medium text-zinc-500">Time spent per section</div>
              <div className="space-y-2">
                {activity.sections
                  .filter((s) => sectionLabels[s.section] !== undefined)
                  .map((s) => (
                    <div key={s.section} className="text-xs">
                      <div className="mb-0.5 flex justify-between gap-2">
                        <span className="truncate text-zinc-700">{sectionLabels[s.section] || 'Section'}</span>
                        <span className="shrink-0 text-zinc-500">{formatDuration(s.ms)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-100">
                        <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${(s.ms / maxMs) * 100}%` }} />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function AuditTrail({ acceptance }: { acceptance: NonNullable<Activity['acceptance']> }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
      <div className="mb-3 flex items-center gap-2 font-semibold text-emerald-800">
        <ShieldCheck className="h-4 w-4" /> Signed by client
      </div>
      <div className="mb-3 rounded-lg bg-white p-2">
        <img src={acceptance.signature} alt="Client signature" className="mx-auto max-h-16" />
      </div>
      <dl className="space-y-1 text-xs">
        {(
          [
            ['Name', acceptance.name],
            ['Email', acceptance.email],
            ['Signed at', new Date(acceptance.signedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' })],
            ['IP address', acceptance.ip],
            ['Browser', acceptance.userAgent],
          ] as const
        )
          .filter(([, val]) => val)
          .map(([k, val]) => (
            <div key={k} className="grid grid-cols-[72px_1fr] gap-2">
              <dt className="text-zinc-500">{k}</dt>
              <dd className="break-words text-zinc-800">{val}</dd>
            </div>
          ))}
      </dl>
    </div>
  )
}

export function CommentsPanel({ share, activity, ownerName, onPosted }: { share: ShareRef; activity: Activity | null; ownerName: string; onPosted: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const comments = activity?.comments ?? []
  async function send() {
    if (!text.trim()) return
    setBusy(true)
    try {
      await postComment(share.id, { name: ownerName || 'Owner', body: text }, share.ownerKey)
      setText('')
      onPosted()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={panel}>
      <div className="mb-3 flex items-center gap-2 font-semibold text-zinc-900">
        <MessageCircle className="h-4 w-4" /> Comments {comments.length > 0 && <span className="text-xs font-normal text-zinc-500">({comments.length})</span>}
      </div>
      <CommentList comments={comments} />
      <div className="mt-3 flex gap-2">
        <input className={`${inputCls} py-2`} placeholder="Reply to your client…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <Button aria-label="Send reply" className="px-3" disabled={busy || !text.trim()} onClick={send}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function CommentList({ comments }: { comments: Activity['comments'] }) {
  if (!comments.length) return <p className="text-sm text-zinc-500">No comments yet.</p>
  return (
    <div className="max-h-72 space-y-2.5 overflow-y-auto">
      {comments.map((c, i) => (
        <div key={i} className={`rounded-xl px-3 py-2 text-sm ${c.author === 'owner' ? 'ml-6 bg-blue-50' : 'mr-6 bg-zinc-100'}`}>
          <div className="mb-0.5 flex justify-between gap-2 text-[11px] text-zinc-500">
            <span className="font-medium text-zinc-700">{c.name}</span>
            <span>{timeAgo(c.at)}</span>
          </div>
          <div className="whitespace-pre-line text-zinc-800">{c.body}</div>
        </div>
      ))}
    </div>
  )
}
