// Accounts and cloud sync.
//
// Passwords never reach the server: the browser derives a key with PBKDF2 (310k iterations,
// salted with the email) and sends that. The server stores SHA-256(random salt + key), which
// keeps sign-in within the Workers CPU budget while a leaked database still has to be
// brute-forced through PBKDF2. Sessions are random tokens in an HttpOnly cookie; only their
// hash is stored.

export interface Env {
  DB: D1Database
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export const SYNC_TABLES = ['settings', 'clients', 'products', 'invoices', 'proposals', 'recurring', 'templates'] as const

export const ACCOUNT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    pass_salt TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    rec_salt TEXT NOT NULL,
    rec_hash TEXT NOT NULL,
    seq INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    ua TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)`,
  `CREATE TABLE IF NOT EXISTS records (
    user_id TEXT NOT NULL,
    tbl TEXT NOT NULL,
    rid TEXT NOT NULL,
    data TEXT,
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    seq INTEGER NOT NULL,
    PRIMARY KEY (user_id, tbl, rid)
  )`,
  `CREATE INDEX IF NOT EXISTS records_seq ON records (user_id, seq)`,
  `CREATE TABLE IF NOT EXISTS attempts (
    k TEXT PRIMARY KEY,
    n INTEGER NOT NULL,
    reset_at INTEGER NOT NULL
  )`,
]

const SESSION_DAYS = 180
const COOKIE = 'involet_session'
const MAX_RECORD_BYTES = 1_900_000
// Free-plan Workers allow 50 D1 queries per request; keep pushes comfortably below that.
export const MAX_CHANGES_PER_PUSH = 40
const PULL_LIMIT = 40

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })

const enc = new TextEncoder()

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomToken(bytes = 32): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const hashKey = (salt: string, key: string) => sha256(`${salt}:${key}`)

async function body<T>(req: Request, max = 64_000): Promise<T> {
  const text = await req.text()
  if (text.length > max) throw new HttpError(413, 'Request too large')
  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

const normalizeEmail = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '')
const isEmail = (v: string) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
/** Keys are base64 of 32 bytes, derived in the browser. */
const isKey = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(v)

/** Simple fixed-window rate limit stored in D1. */
async function limit(env: Env, key: string, max: number, windowMs: number) {
  const now = Date.now()
  const row = await env.DB.prepare('SELECT n, reset_at FROM attempts WHERE k = ?').bind(key).first<{ n: number; reset_at: number }>()
  if (!row || row.reset_at < now) {
    await env.DB.prepare('INSERT INTO attempts (k, n, reset_at) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = 1, reset_at = excluded.reset_at').bind(key, now + windowMs).run()
    return
  }
  if (row.n >= max) throw new HttpError(429, `Too many attempts. Please try again in ${Math.ceil((row.reset_at - now) / 60000)} minutes.`)
  await env.DB.prepare('UPDATE attempts SET n = n + 1 WHERE k = ?').bind(key).run()
}

async function createSession(env: Env, req: Request, userId: string): Promise<string> {
  const token = randomToken()
  const now = Date.now()
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ua) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256(token), userId, now, now + SESSION_DAYS * 86_400_000, (req.headers.get('user-agent') ?? '').slice(0, 200))
    .run()
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}`
}

const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

function sessionToken(req: Request): string | null {
  const m = (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`))
  return m ? m[1] : null
}

interface User {
  id: string
  email: string
}

export async function currentUser(env: Env, req: Request): Promise<User | null> {
  const token = sessionToken(req)
  if (!token) return null
  const row = await env.DB.prepare('SELECT u.id, u.email, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
    .bind(await sha256(token))
    .first<{ id: string; email: string; expires_at: number }>()
  if (!row || row.expires_at < Date.now()) return null
  return { id: row.id, email: row.email }
}

async function requireUser(env: Env, req: Request): Promise<User> {
  const user = await currentUser(env, req)
  if (!user) throw new HttpError(401, 'Please log in again.')
  return user
}

interface UserRow {
  id: string
  email: string
  pass_salt: string
  pass_hash: string
  rec_salt: string
  rec_hash: string
}

async function checkPassword(user: UserRow, key: unknown): Promise<boolean> {
  return isKey(key) && sameString(await hashKey(user.pass_salt, key), user.pass_hash)
}

export async function handleAuth(req: Request, env: Env, action: string): Promise<Response> {
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown'
  const db = env.DB

  if (action === 'me' && req.method === 'GET') {
    // Signed out is a normal state, not an error.
    return json({ user: await currentUser(env, req) })
  }

  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')

  if (action === 'signup') {
    const b = await body<{ email?: string; key?: string; recoveryKey?: string }>(req)
    const email = normalizeEmail(b.email)
    if (!isEmail(email)) throw new HttpError(400, 'Please enter a valid email address.')
    if (!isKey(b.key) || !isKey(b.recoveryKey)) throw new HttpError(400, 'Invalid request')
    await limit(env, `signup:${ip}`, 10, 3_600_000)
    if (await db.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) throw new HttpError(409, 'An account with this email already exists. Try logging in.')
    const id = randomToken(12)
    const passSalt = randomToken(16)
    const recSalt = randomToken(16)
    await db
      .prepare('INSERT INTO users (id, email, pass_salt, pass_hash, rec_salt, rec_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, email, passSalt, await hashKey(passSalt, b.key), recSalt, await hashKey(recSalt, b.recoveryKey), Date.now())
      .run()
    return json({ user: { id, email } }, 201, { 'set-cookie': await createSession(env, req, id) })
  }

  if (action === 'login') {
    const b = await body<{ email?: string; key?: string }>(req)
    const email = normalizeEmail(b.email)
    await limit(env, `login:${email}`, 10, 900_000)
    await limit(env, `ip:${ip}`, 60, 900_000)
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>()
    if (!user || !(await checkPassword(user, b.key))) throw new HttpError(401, 'Email or password is incorrect.')
    await db.prepare('DELETE FROM attempts WHERE k = ?').bind(`login:${email}`).run()
    return json({ user: { id: user.id, email: user.email } }, 200, { 'set-cookie': await createSession(env, req, user.id) })
  }

  if (action === 'logout') {
    const token = sessionToken(req)
    if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
    return json({ ok: true }, 200, { 'set-cookie': clearCookie })
  }

  if (action === 'recover') {
    const b = await body<{ email?: string; recoveryKey?: string; newKey?: string; newRecoveryKey?: string }>(req)
    const email = normalizeEmail(b.email)
    await limit(env, `recover:${email}`, 5, 3_600_000)
    await limit(env, `ip:${ip}`, 60, 900_000)
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>()
    const ok = !!user && isKey(b.recoveryKey) && sameString(await hashKey(user.rec_salt, b.recoveryKey), user.rec_hash)
    if (!user || !ok) throw new HttpError(401, 'That recovery code doesn’t match this email.')
    if (!isKey(b.newKey) || !isKey(b.newRecoveryKey)) throw new HttpError(400, 'Invalid request')
    const passSalt = randomToken(16)
    const recSalt = randomToken(16)
    // A used recovery code is replaced, and every existing session is signed out.
    await db.batch([
      db.prepare('UPDATE users SET pass_salt = ?, pass_hash = ?, rec_salt = ?, rec_hash = ? WHERE id = ?').bind(passSalt, await hashKey(passSalt, b.newKey), recSalt, await hashKey(recSalt, b.newRecoveryKey), user.id),
      db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
      db.prepare('DELETE FROM attempts WHERE k = ?').bind(`login:${email}`),
    ])
    return json({ user: { id: user.id, email: user.email } }, 200, { 'set-cookie': await createSession(env, req, user.id) })
  }

  // The rest need a signed-in user who confirms their current password.
  const me = await requireUser(env, req)
  const user = (await db.prepare('SELECT * FROM users WHERE id = ?').bind(me.id).first<UserRow>())!
  const b = await body<{ key?: string; newKey?: string; newRecoveryKey?: string }>(req)
  await limit(env, `confirm:${me.id}`, 10, 900_000)
  if (!(await checkPassword(user, b.key))) throw new HttpError(401, 'Your current password is incorrect.')

  if (action === 'password') {
    if (!isKey(b.newKey)) throw new HttpError(400, 'Invalid request')
    const salt = randomToken(16)
    const token = sessionToken(req)
    // Keep this device signed in; sign out every other device.
    await db.batch([
      db.prepare('UPDATE users SET pass_salt = ?, pass_hash = ? WHERE id = ?').bind(salt, await hashKey(salt, b.newKey), me.id),
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(me.id, token ? await sha256(token) : ''),
    ])
    return json({ ok: true })
  }
  if (action === 'recovery-code') {
    if (!isKey(b.newRecoveryKey)) throw new HttpError(400, 'Invalid request')
    const salt = randomToken(16)
    await db.prepare('UPDATE users SET rec_salt = ?, rec_hash = ? WHERE id = ?').bind(salt, await hashKey(salt, b.newRecoveryKey), me.id).run()
    return json({ ok: true })
  }
  if (action === 'delete') {
    await db.batch([
      db.prepare('DELETE FROM records WHERE user_id = ?').bind(me.id),
      db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(me.id),
      db.prepare('DELETE FROM users WHERE id = ?').bind(me.id),
    ])
    return json({ ok: true }, 200, { 'set-cookie': clearCookie })
  }
  throw new HttpError(404, 'Not found')
}

interface Change {
  tbl?: string
  id?: string
  data?: unknown
  updatedAt?: number
  deleted?: boolean
}

export async function handleSync(req: Request, env: Env): Promise<Response> {
  const user = await requireUser(env, req)
  const db = env.DB

  if (req.method === 'GET') {
    const since = Math.max(0, Number(new URL(req.url).searchParams.get('since')) || 0)
    const { results } = await db
      .prepare('SELECT tbl, rid, data, updated_at, deleted, seq FROM records WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?')
      .bind(user.id, since, PULL_LIMIT)
      .all<{ tbl: string; rid: string; data: string | null; updated_at: number; deleted: number; seq: number }>()
    return json({
      records: results.map((r) => ({ tbl: r.tbl, id: r.rid, data: r.data ? JSON.parse(r.data) : null, updatedAt: r.updated_at, deleted: !!r.deleted, seq: r.seq })),
      seq: results.length ? results[results.length - 1].seq : since,
      more: results.length === PULL_LIMIT,
    })
  }

  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
  const b = await body<{ changes?: Change[] }>(req, MAX_CHANGES_PER_PUSH * MAX_RECORD_BYTES)
  const changes = Array.isArray(b.changes) ? b.changes : []
  if (changes.length > MAX_CHANGES_PER_PUSH) throw new HttpError(413, `Send at most ${MAX_CHANGES_PER_PUSH} changes at a time`)
  const valid = changes.map((c) => {
    if (!c.tbl || !(SYNC_TABLES as readonly string[]).includes(c.tbl)) throw new HttpError(400, 'Unknown table')
    if (typeof c.id !== 'string' || !c.id || c.id.length > 64) throw new HttpError(400, 'Invalid id')
    const updatedAt = Number(c.updatedAt)
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) throw new HttpError(400, 'Invalid timestamp')
    const data = c.deleted ? null : JSON.stringify(c.data ?? null)
    if (data && data.length > MAX_RECORD_BYTES) throw new HttpError(413, 'A record is too large to sync')
    return { tbl: c.tbl, id: c.id, data, updatedAt: Math.min(updatedAt, Date.now() + 60_000), deleted: c.deleted ? 1 : 0 }
  })
  if (!valid.length) return json({ ok: true })

  // Reserve a block of sequence numbers so other devices can pull "everything after N".
  const row = await db.prepare('UPDATE users SET seq = seq + ? WHERE id = ? RETURNING seq').bind(valid.length, user.id).first<{ seq: number }>()
  let seq = row!.seq - valid.length
  await db.batch(
    valid.map((c) =>
      db
        .prepare(
          `INSERT INTO records (user_id, tbl, rid, data, updated_at, deleted, seq) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, tbl, rid) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted, seq = excluded.seq
           WHERE excluded.updated_at >= records.updated_at`,
        )
        .bind(user.id, c.tbl, c.id, c.data, c.updatedAt, c.deleted, ++seq),
    ),
  )
  return json({ ok: true })
}
