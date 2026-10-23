// Share-link backend: stores published proposals/invoices in D1 so clients can view,
// comment on and sign them at /p/:id. Everything else is served from static assets.

import { ACCOUNT_SCHEMA, HttpError, handleAuth, handleSync } from './accounts'

interface Env {
  DB: D1Database
  ASSETS: Fetcher
  /** Marketing site. Visitors who aren't logged in are sent here from the home page. */
  LANDING_URL?: string
  /** The landing-page Worker, served on the home.* hostname through this Worker. */
  LANDING?: Fetcher
}

// The landing page's sign-up and sign-in buttons should open the app. It is a separate static
// site, so this small script (added to its pages) sends those clicks here, keeping other links.
const LANDING_LINKS = (app: string) => `<script>
document.addEventListener('click', function (e) {
  var el = e.target.closest && e.target.closest('a,button');
  if (!el || el.closest('form') || el.hasAttribute('aria-expanded')) return;
  var href = el.getAttribute('href') || '';
  if (href.indexOf(${JSON.stringify(app)}) === 0) return;
  var t = (el.textContent || '').trim().toLowerCase();
  if (!t || t.length > 30) return;
  var to = /^(sign ?in|log ?in)/.test(t) ? '/login' : /(start|get started|try|sign ?up|create account|join)/.test(t) ? '/signup' : '';
  if (!to) return;
  e.preventDefault(); e.stopPropagation();
  location.href = ${JSON.stringify(app)} + to;
}, true);
</script>`

async function serveLanding(req: Request, env: Env, appOrigin: string): Promise<Response> {
  let res: Response
  try {
    res = await env.LANDING!.fetch(req)
  } catch (e) {
    return new Response(`Landing page is unavailable: ${(e as Error).message}`, { status: 502, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }
  if (!(res.headers.get('content-type') ?? '').includes('text/html')) return res
  return new HTMLRewriter().on('body', {
    element(body) {
      body.append(LANDING_LINKS(appOrigin), { html: true })
    },
  }).transform(res)
}

type Kind = 'proposal' | 'invoice'
type Status = 'open' | 'accepted' | 'declined'

// D1 rows are limited to 2 MB; uploaded designs are compressed JPEGs well below this.
const MAX_DOC_BYTES = 1_900_000
const MAX_SIGNATURE_BYTES = 300_000
const MAX_EVENTS_PER_SHARE = 5000
const MAX_COMMENTS_PER_SHARE = 200
const MAX_PAYMENT_REPORTS = 20
const MAX_PROOF_BYTES = 450_000

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    kind TEXT NOT NULL,
    doc TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    acceptance TEXT,
    decline TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    share_id TEXT NOT NULL,
    type TEXT NOT NULL,
    section TEXT,
    ms INTEGER,
    visitor TEXT,
    ip TEXT,
    ua TEXT,
    at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS events_share ON events (share_id, at)`,
  `CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    share_id TEXT NOT NULL,
    author TEXT NOT NULL,
    name TEXT NOT NULL,
    body TEXT NOT NULL,
    at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS comments_share ON comments (share_id, at)`,
  // What happened to a shared invoice: the client confirming it or reporting a payment, and the
  // owner confirming/rejecting a payment or marking the invoice paid/unpaid. Append-only.
  `CREATE TABLE IF NOT EXISTS share_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    share_id TEXT NOT NULL,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS share_actions_share ON share_actions (share_id, id)`,
]

let schemaReady: Promise<unknown> | null = null
function ensureSchema(db: D1Database) {
  schemaReady ??= db.batch([...SCHEMA, ...ACCOUNT_SCHEMA].map((sql) => db.prepare(sql))).catch((e) => {
    schemaReady = null
    throw e
  })
  return schemaReady
}


const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

function randomId(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

function sameKey(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function readJson<T>(req: Request, maxBytes: number): Promise<T> {
  const text = await req.text()
  if (text.length > maxBytes) throw new HttpError(413, 'Payload too large')
  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

interface ShareRow {
  id: string
  owner_key: string
  kind: Kind
  doc: string
  status: Status
  acceptance: string | null
  decline: string | null
  created_at: number
  updated_at: number
}

async function getShare(env: Env, id: string): Promise<ShareRow> {
  const row = await env.DB.prepare('SELECT * FROM shares WHERE id = ?').bind(id).first<ShareRow>()
  if (!row) throw new HttpError(404, 'This link does not exist or was removed.')
  return row
}

function isOwner(req: Request, row: ShareRow) {
  const key = req.headers.get('x-owner-key') ?? ''
  return key !== '' && sameKey(key, row.owner_key)
}

function requireOwner(req: Request, row: ShareRow) {
  if (!isOwner(req, row)) throw new HttpError(403, 'Not allowed')
}

async function listComments(env: Env, id: string) {
  const { results } = await env.DB.prepare('SELECT author, name, body, at FROM comments WHERE share_id = ? ORDER BY at').bind(id).all()
  return results
}

type ActionType = 'confirm' | 'payment' | 'payment_ok' | 'payment_rejected' | 'paid' | 'unpaid'
interface ActionRow {
  id: number
  share_id: string
  type: ActionType
  data: string
  at: number
}

export interface PaymentReport {
  id: number
  name: string
  method: string
  amount: number
  reference: string
  paidOn: string
  note: string
  hasProof: boolean
  at: number
  status: 'pending' | 'confirmed' | 'rejected'
  reason?: string
}

/** The invoice's state for both sides, folded from its action log. */
function invoiceState(actions: ActionRow[]) {
  let confirmation: { name: string; note: string; at: number } | null = null
  let paid: { paidOn: string; at: number } | null = null
  // Whether the owner has set paid/unpaid here; if not, the shared invoice's own status applies.
  let marked = false
  const payments = new Map<number, PaymentReport>()
  for (const a of actions) {
    const d = JSON.parse(a.data)
    if (a.type === 'confirm') confirmation = { name: d.name, note: d.note ?? '', at: a.at }
    else if (a.type === 'payment')
      payments.set(a.id, { id: a.id, name: d.name, method: d.method, amount: d.amount, reference: d.reference, paidOn: d.paidOn, note: d.note, hasProof: !!d.proof, at: a.at, status: 'pending' })
    else if (a.type === 'payment_ok' || a.type === 'payment_rejected') {
      const p = payments.get(d.paymentId)
      if (p) Object.assign(p, { status: a.type === 'payment_ok' ? 'confirmed' : 'rejected', reason: d.reason || undefined })
    } else if (a.type === 'paid') [paid, marked] = [{ paidOn: d.paidOn, at: a.at }, true]
    else if (a.type === 'unpaid') [paid, marked] = [null, true]
  }
  return { confirmation, payments: [...payments.values()], paid, marked }
}

async function listActions(env: Env, id: string) {
  const { results } = await env.DB.prepare('SELECT * FROM share_actions WHERE share_id = ? ORDER BY id').bind(id).all<ActionRow>()
  return results
}

const addAction = (env: Env, id: string, type: ActionType, data: unknown, at: number) =>
  env.DB.prepare('INSERT INTO share_actions (share_id, type, data, at) VALUES (?, ?, ?, ?)').bind(id, type, JSON.stringify(data), at).run()

const isoDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')

async function handleApi(req: Request, env: Env, path: string[]): Promise<Response> {
  await ensureSchema(env.DB)
  const method = req.method
  const now = Date.now()

  // POST /api/shares — publish a document
  if (path.length === 0 && method === 'POST') {
    const body = await readJson<{ kind?: Kind; doc?: unknown }>(req, MAX_DOC_BYTES)
    if (body.kind !== 'proposal' && body.kind !== 'invoice') throw new HttpError(400, 'Unknown kind')
    if (!body.doc || typeof body.doc !== 'object') throw new HttpError(400, 'Missing document')
    const id = randomId(16)
    const ownerKey = randomId(32)
    await env.DB.prepare('INSERT INTO shares (id, owner_key, kind, doc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, ownerKey, body.kind, JSON.stringify(body.doc), now, now)
      .run()
    return json({ id, ownerKey }, 201)
  }

  // POST /api/shares/inbox — the owner's app asks which shared invoices have news (in one request).
  if (path[0] === 'inbox' && path.length === 1 && method === 'POST') {
    const body = await readJson<{ shares?: Array<{ id?: string; ownerKey?: string }> }>(req, 20_000)
    const asked = (body.shares ?? []).filter((x) => typeof x.id === 'string' && typeof x.ownerKey === 'string').slice(0, 90) // D1 allows 100 bound values
    if (!asked.length) return json({ shares: {} })
    const marks = asked.map(() => '?').join(',')
    const ids = asked.map((x) => x.id!)
    const [owners, acts] = await env.DB.batch([
      env.DB.prepare(`SELECT id, owner_key FROM shares WHERE id IN (${marks})`).bind(...ids),
      env.DB.prepare(`SELECT * FROM share_actions WHERE share_id IN (${marks}) ORDER BY id`).bind(...ids),
    ])
    const keys = new Map((owners.results as Array<{ id: string; owner_key: string }>).map((r) => [r.id, r.owner_key]))
    const out: Record<string, ReturnType<typeof invoiceState>> = {}
    for (const x of asked) {
      const key = keys.get(x.id!)
      if (!key || !sameKey(key, x.ownerKey!)) continue
      out[x.id!] = invoiceState((acts.results as unknown as ActionRow[]).filter((a) => a.share_id === x.id))
    }
    return json({ shares: out })
  }

  const [id, action, sub] = path
  if (!id) throw new HttpError(404, 'Not found')
  const row = await getShare(env, id)

  if (!action) {
    if (method === 'GET') {
      const acceptance = row.acceptance ? JSON.parse(row.acceptance) : null
      return json({
        kind: row.kind,
        doc: JSON.parse(row.doc),
        status: row.status,
        // The client sees the signature but not the audit details (IP, browser).
        acceptance: acceptance && { name: acceptance.name, signature: acceptance.signature, signedAt: acceptance.signedAt },
        decline: row.decline ? JSON.parse(row.decline) : null,
        comments: await listComments(env, id),
        invoice: row.kind === 'invoice' ? invoiceState(await listActions(env, id)) : undefined,
        updatedAt: row.updated_at,
      })
    }
    if (method === 'PUT') {
      requireOwner(req, row)
      if (row.status === 'accepted') throw new HttpError(409, 'This proposal is signed and can no longer be changed.')
      const body = await readJson<{ doc?: unknown }>(req, MAX_DOC_BYTES)
      if (!body.doc || typeof body.doc !== 'object') throw new HttpError(400, 'Missing document')
      await env.DB.prepare('UPDATE shares SET doc = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(body.doc), now, id).run()
      return json({ ok: true })
    }
    if (method === 'DELETE') {
      requireOwner(req, row)
      await env.DB.batch([
        env.DB.prepare('DELETE FROM events WHERE share_id = ?').bind(id),
        env.DB.prepare('DELETE FROM comments WHERE share_id = ?').bind(id),
        env.DB.prepare('DELETE FROM share_actions WHERE share_id = ?').bind(id),
        env.DB.prepare('DELETE FROM shares WHERE id = ?').bind(id),
      ])
      return json({ ok: true })
    }
  }

  const ip = req.headers.get('cf-connecting-ip') ?? ''
  const ua = (req.headers.get('user-agent') ?? '').slice(0, 300)

  if (action === 'events' && method === 'POST') {
    // Owner previews are not counted as client views.
    if (isOwner(req, row)) return json({ ok: true })
    const body = await readJson<{ visitor?: string; events?: Array<{ type?: string; section?: string; ms?: number }> }>(req, 20_000)
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM events WHERE share_id = ?').bind(id).first<{ n: number }>()
    if ((count?.n ?? 0) >= MAX_EVENTS_PER_SHARE) return json({ ok: true })
    const visitor = str(body.visitor, 40)
    const stmts = (body.events ?? [])
      .slice(0, 40) // stays under the 50 D1 queries a free-plan request may make
      .filter((e) => e.type === 'open' || e.type === 'section')
      .map((e) =>
        env.DB.prepare('INSERT INTO events (share_id, type, section, ms, visitor, ip, ua, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(
          id,
          e.type,
          e.type === 'section' ? str(e.section, 80) : null,
          e.type === 'section' ? Math.min(Math.max(Math.round(Number(e.ms) || 0), 0), 10 * 60_000) : null,
          visitor,
          ip,
          ua,
          now,
        ),
      )
    if (stmts.length) await env.DB.batch(stmts)
    return json({ ok: true })
  }

  if (action === 'accept' && method === 'POST') {
    if (row.kind !== 'proposal') throw new HttpError(400, 'Only proposals can be signed')
    if (row.status !== 'open') throw new HttpError(409, `This proposal was already ${row.status}.`)
    const body = await readJson<{ name?: string; email?: string; signature?: string }>(req, MAX_SIGNATURE_BYTES + 2000)
    const name = str(body.name, 120)
    const signature = typeof body.signature === 'string' ? body.signature : ''
    if (!name) throw new HttpError(400, 'Please enter your full name.')
    if (!signature.startsWith('data:image/png;base64,') || signature.length > MAX_SIGNATURE_BYTES) throw new HttpError(400, 'Please add your signature.')
    const acceptance = { name, email: str(body.email, 200), signature, signedAt: new Date(now).toISOString(), ip, userAgent: ua }
    await env.DB.prepare("UPDATE shares SET status = 'accepted', acceptance = ?, updated_at = ? WHERE id = ? AND status = 'open'")
      .bind(JSON.stringify(acceptance), now, id)
      .run()
    return json({ ok: true, acceptance: { name, signature, signedAt: acceptance.signedAt } })
  }

  if (action === 'decline' && method === 'POST') {
    if (row.kind !== 'proposal') throw new HttpError(400, 'Only proposals can be declined')
    if (row.status !== 'open') throw new HttpError(409, `This proposal was already ${row.status}.`)
    const body = await readJson<{ name?: string; reason?: string }>(req, 5000)
    const decline = { name: str(body.name, 120) || 'Client', reason: str(body.reason, 2000), at: new Date(now).toISOString() }
    await env.DB.prepare("UPDATE shares SET status = 'declined', decline = ?, updated_at = ? WHERE id = ? AND status = 'open'")
      .bind(JSON.stringify(decline), now, id)
      .run()
    return json({ ok: true, decline })
  }

  // ---- invoices: the client confirms or reports a payment; the owner reviews ----

  if ((action === 'confirm' || action === 'payments' || action === 'review') && row.kind !== 'invoice') throw new HttpError(400, 'Only invoices support this')

  if (action === 'confirm' && method === 'POST') {
    const body = await readJson<{ name?: string; note?: string }>(req, 5000)
    const name = str(body.name, 120)
    if (!name) throw new HttpError(400, 'Please enter your name.')
    const state = invoiceState(await listActions(env, id))
    if (state.confirmation) throw new HttpError(409, `Already confirmed by ${state.confirmation.name}.`)
    await addAction(env, id, 'confirm', { name, note: str(body.note, 1000), ip, userAgent: ua }, now)
    return json({ invoice: invoiceState(await listActions(env, id)) }, 201)
  }

  if (action === 'payments' && method === 'POST' && !sub) {
    const body = await readJson<{ name?: string; method?: string; amount?: number; reference?: string; paidOn?: string; note?: string; proof?: string }>(req, MAX_PROOF_BYTES + 5000)
    const name = str(body.name, 120)
    const payMethod = str(body.method, 40)
    const amount = Math.round(Number(body.amount) * 100) / 100
    if (!name) throw new HttpError(400, 'Please enter your name.')
    if (!payMethod) throw new HttpError(400, 'Please choose how you paid.')
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) throw new HttpError(400, 'Please enter the amount you paid.')
    const proof = typeof body.proof === 'string' && body.proof ? body.proof : ''
    if (proof && (!/^data:image\/(jpeg|png|webp);base64,/.test(proof) || proof.length > MAX_PROOF_BYTES)) throw new HttpError(400, 'The screenshot is too large or not an image.')
    const actions = await listActions(env, id)
    const state = invoiceState(actions)
    if (state.paid) throw new HttpError(409, 'This invoice is already marked as paid.')
    if (state.payments.length >= MAX_PAYMENT_REPORTS) throw new HttpError(429, 'Too many payment reports on this invoice.')
    const data = { name, method: payMethod, amount, reference: str(body.reference, 120), paidOn: isoDate(body.paidOn) || new Date(now).toISOString().slice(0, 10), note: str(body.note, 1000), proof, ip, userAgent: ua }
    await addAction(env, id, 'payment', data, now)
    return json({ invoice: invoiceState(await listActions(env, id)) }, 201)
  }

  // GET /:id/payments/:paymentId/proof — the screenshot, for the owner only (kept out of polling).
  if (action === 'payments' && sub && method === 'GET') {
    requireOwner(req, row)
    const a = await env.DB.prepare("SELECT data FROM share_actions WHERE share_id = ? AND id = ? AND type = 'payment'").bind(id, Number(sub)).first<{ data: string }>()
    const proof = a ? (JSON.parse(a.data).proof as string) : ''
    if (!proof) throw new HttpError(404, 'No screenshot')
    return json({ proof })
  }

  if (action === 'review' && method === 'POST') {
    requireOwner(req, row)
    const body = await readJson<{ type?: string; paymentId?: number; reason?: string; paidOn?: string }>(req, 5000)
    const state = invoiceState(await listActions(env, id))
    if (body.type === 'payment_ok' || body.type === 'payment_rejected') {
      const p = state.payments.find((x) => x.id === Number(body.paymentId))
      if (!p) throw new HttpError(404, 'Payment not found')
      await addAction(env, id, body.type, { paymentId: p.id, reason: str(body.reason, 500) }, now)
    } else if (body.type === 'paid') await addAction(env, id, 'paid', { paidOn: isoDate(body.paidOn) || new Date(now).toISOString().slice(0, 10) }, now)
    else if (body.type === 'unpaid') await addAction(env, id, 'unpaid', {}, now)
    else throw new HttpError(400, 'Unknown review')
    return json({ invoice: invoiceState(await listActions(env, id)) })
  }

  if (action === 'comments' && method === 'POST') {
    const body = await readJson<{ name?: string; body?: string }>(req, 10_000)
    const text = str(body.body, 2000)
    if (!text) throw new HttpError(400, 'Comment is empty')
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM comments WHERE share_id = ?').bind(id).first<{ n: number }>()
    if ((count?.n ?? 0) >= MAX_COMMENTS_PER_SHARE) throw new HttpError(429, 'Too many comments on this document')
    const owner = isOwner(req, row)
    await env.DB.prepare('INSERT INTO comments (share_id, author, name, body, at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, owner ? 'owner' : 'client', str(body.name, 120) || (owner ? 'Owner' : 'Client'), text, now)
      .run()
    return json({ ok: true, comments: await listComments(env, id) }, 201)
  }

  if (action === 'activity' && method === 'GET') {
    requireOwner(req, row)
    const db = env.DB
    const [opens, sections, recent] = await db.batch([
      db.prepare("SELECT COUNT(*) AS opens, COUNT(DISTINCT visitor) AS visitors, MIN(at) AS first, MAX(at) AS last FROM events WHERE share_id = ? AND type = 'open'").bind(id),
      db.prepare("SELECT section, SUM(ms) AS ms FROM events WHERE share_id = ? AND type = 'section' GROUP BY section ORDER BY ms DESC").bind(id),
      db.prepare("SELECT at, ip, ua FROM events WHERE share_id = ? AND type = 'open' ORDER BY at DESC LIMIT 20").bind(id),
    ])
    const o = (opens.results[0] ?? {}) as { opens?: number; visitors?: number; first?: number; last?: number }
    return json({
      status: row.status,
      acceptance: row.acceptance ? JSON.parse(row.acceptance) : null,
      decline: row.decline ? JSON.parse(row.decline) : null,
      comments: await listComments(env, id),
      invoice: row.kind === 'invoice' ? invoiceState(await listActions(env, id)) : undefined,
      views: { opens: o.opens ?? 0, visitors: o.visitors ?? 0, first: o.first ?? null, last: o.last ?? null },
      sections: sections.results,
      recent: recent.results,
    })
  }

  throw new HttpError(405, 'Method not allowed')
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url)
    // home.involet.saifux.co is the landing page; its buttons lead to involet.saifux.co.
    if (env.LANDING && url.hostname.startsWith('home.')) return serveLanding(req, env, `${url.protocol}//${url.host.slice('home.'.length)}`)
    // The home page shows the marketing site to visitors without a session; logged-in people
    // go straight to their dashboard. Every other page (login, share links…) works as usual.
    if (url.pathname === '/' && env.LANDING_URL && !/(?:^|;\s*)involet_session=/.test(req.headers.get('cookie') ?? ''))
      return new Response(null, { status: 302, headers: { location: env.LANDING_URL, 'cache-control': 'no-store' } })
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req)
    const parts = url.pathname.split('/').filter(Boolean) // ['api', 'shares', ...]
    try {
      if (parts[1] === 'auth' || parts[1] === 'sync') {
        // Cookies are sent automatically, so writes must also carry a header other sites can't set.
        if (req.method !== 'GET' && req.headers.get('x-involet') !== '1') throw new HttpError(403, 'Missing request header')
        await ensureSchema(env.DB)
        return parts[1] === 'auth' ? await handleAuth(req, env, parts[2] ?? '') : await handleSync(req, env)
      }
      if (parts[1] !== 'shares') throw new HttpError(404, 'Not found')
      return await handleApi(req, env, parts.slice(2))
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status)
      console.error(e)
      return json({ error: 'Something went wrong. Please try again.' }, 500)
    }
  },
} satisfies ExportedHandler<Env>
