// Share-link backend: stores published proposals/invoices in D1 so clients can view,
// comment on and sign them at /p/:id. Everything else is served from static assets.

import { ACCOUNT_SCHEMA, HttpError, handleAuth, handleSync } from './accounts'

interface Env {
  DB: D1Database
  ASSETS: Fetcher
  /** Marketing site. Visitors who aren't logged in are sent here from the home page. */
  LANDING_URL?: string
  /** The landing-page Worker, served on LANDING_URL's hostname through this Worker. */
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
  const res = await env.LANDING!.fetch(req)
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

  const [id, action] = path
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
    const landing = env.LANDING_URL ? new URL(env.LANDING_URL) : null
    // home.involet.saifux.co is the landing page; its buttons lead to involet.saifux.co.
    if (landing && env.LANDING && url.hostname === landing.hostname) return serveLanding(req, env, `${url.protocol}//${url.host.replace(/^home\./, '')}`)
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
