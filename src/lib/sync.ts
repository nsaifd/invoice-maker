import { useSyncExternalStore } from 'react'
import { SYNC_TABLES, db, markRemote, setLocalChangeListener, type SyncTable } from '../db'
import { ApiError, api, logoutRequest, me, type User } from './auth'

// Offline-first sync: every edit is saved locally first and flagged _dirty; the engine uploads
// dirty records and deletions, then downloads everything changed since the last pull.
// Conflicts resolve per record by "last edit wins" (the server keeps the newest updatedAt).

export type SyncState = 'loading' | 'signedOut' | 'syncing' | 'synced' | 'offline' | 'error'

export interface SyncStatus {
  state: SyncState
  user: User | null
  lastSync: number | null
  error: string | null
  /** Local changes not uploaded yet. */
  pending: number
}

let status: SyncStatus = { state: 'loading', user: null, lastSync: null, error: null, pending: 0 }
const listeners = new Set<() => void>()
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
  )
}

// ---- local bookkeeping ----

const KEY = { seq: 'involet.sync.seq', owner: 'involet.sync.owner', last: 'involet.sync.last' }
function store(key: string, value?: string | null): string | null {
  try {
    if (value === null) localStorage.removeItem(key)
    else if (value !== undefined) localStorage.setItem(key, value)
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

async function pendingCount(): Promise<number> {
  const counts = await Promise.all(SYNC_TABLES.map((t) => db.table(t).where('_dirty').equals(1).count()))
  return counts.reduce((a, b) => a + b, 0) + (await db.outbox.count())
}

/** Removes all local data, e.g. when signing out on a shared computer. */
async function wipeLocal() {
  await db.transaction('rw', [...SYNC_TABLES.map((t) => db.table(t)), db.outbox], async (tx) => {
    markRemote(tx)
    for (const t of SYNC_TABLES) await db.table(t).clear()
    await db.outbox.clear()
  })
  store(KEY.seq, null)
}

/**
 * Data on this device belongs to whoever signed in on it. Data created before any sign-in has
 * no owner and is uploaded to the first account that signs in. If a different account signs
 * in, the previous account's local copy is removed (it is already in that account's cloud).
 */
async function adoptDevice(user: User) {
  const owner = store(KEY.owner)
  if (owner && owner !== user.id) await wipeLocal()
  store(KEY.owner, user.id)
}

// ---- push / pull ----

type Change = { tbl: SyncTable; id: string; data?: unknown; updatedAt: number; deleted?: boolean }
const BATCH = 35 // the server accepts 40 per request
const MAX_BATCH_BYTES = 3_000_000

async function push() {
  const changes: Change[] = []
  for (const t of SYNC_TABLES) {
    const rows = (await db.table(t).where('_dirty').equals(1).toArray()) as Array<Record<string, unknown> & { id: string; _ts?: number }>
    for (const { _dirty: _d, _ts, ...data } of rows) changes.push({ tbl: t, id: data.id as string, data, updatedAt: _ts ?? Date.now() })
  }
  const tombstones = await db.outbox.toArray()
  for (const tomb of tombstones) {
    // A record that was deleted and then re-created (e.g. a restored backup) is uploaded as a record instead.
    if (!changes.some((c) => c.tbl === tomb.tbl && c.id === tomb.id)) changes.push({ tbl: tomb.tbl, id: tomb.id, updatedAt: tomb.ts, deleted: true })
  }

  let i = 0
  while (i < changes.length) {
    const batch: Change[] = []
    let bytes = 0
    while (i < changes.length && batch.length < BATCH) {
      const size = JSON.stringify(changes[i]).length
      if (batch.length && bytes + size > MAX_BATCH_BYTES) break
      batch.push(changes[i++])
      bytes += size
    }
    await api('sync', { body: { changes: batch } })
    // Mark uploaded rows clean — unless they were edited again while the request was in flight.
    await db.transaction('rw', [...SYNC_TABLES.map((t) => db.table(t)), db.outbox], async (tx) => {
      markRemote(tx)
      for (const c of batch) {
        if (c.deleted) {
          const tomb = await db.outbox.get([c.tbl, c.id])
          if (tomb && tomb.ts <= c.updatedAt) await db.outbox.delete([c.tbl, c.id])
          continue
        }
        const row = (await db.table(c.tbl).get(c.id)) as { _ts?: number } | undefined
        if (row && row._ts === c.updatedAt) await db.table(c.tbl).update(c.id, { _dirty: 0 })
        await db.outbox.delete([c.tbl, c.id])
      }
    })
  }
}

type Remote = { tbl: SyncTable; id: string; data: Record<string, unknown> | null; updatedAt: number; deleted: boolean }

async function pull() {
  let since = Number(store(KEY.seq) ?? 0) || 0
  for (;;) {
    const page = await api<{ records: Remote[]; seq: number; more: boolean }>(`sync?since=${since}`)
    await db.transaction('rw', [...SYNC_TABLES.map((t) => db.table(t)), db.outbox], async (tx) => {
      markRemote(tx)
      for (const r of page.records) {
        if (!(SYNC_TABLES as readonly string[]).includes(r.tbl)) continue
        const table = db.table(r.tbl)
        const local = (await table.get(r.id)) as { _dirty?: number; _ts?: number } | undefined
        // A newer unsent local edit wins; it will be uploaded on the next push.
        if (local?._dirty && (local._ts ?? 0) > r.updatedAt) continue
        if (r.deleted) await table.delete(r.id)
        else if (r.data) await table.put({ ...r.data, id: r.id, _ts: r.updatedAt, _dirty: 0 })
      }
    })
    since = page.seq
    store(KEY.seq, String(since))
    if (!page.more) break
  }
}

// ---- scheduling ----

let running: Promise<void> | null = null
let again = false
let debounce: ReturnType<typeof setTimeout> | undefined

export function syncNow(): Promise<void> {
  if (!status.user) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    setStatus({ state: 'syncing', error: null })
    try {
      do {
        again = false
        await push()
        await pull()
      } while (again)
      const now = Date.now()
      store(KEY.last, String(now))
      setStatus({ state: 'synced', lastSync: now, pending: await pendingCount() })
    } catch (e) {
      const err = e as ApiError
      if (err.status === 401) setStatus({ state: 'signedOut', user: null, error: 'Your session expired. Log in again to keep syncing.' })
      else if (err.status === 0) setStatus({ state: 'offline', error: null, pending: await pendingCount() })
      else setStatus({ state: 'error', error: err.message, pending: await pendingCount() })
    } finally {
      running = null
    }
  })()
  return running
}

setLocalChangeListener(() => {
  pendingCount().then((pending) => setStatus({ pending }))
  if (!status.user) return
  clearTimeout(debounce)
  debounce = setTimeout(syncNow, 1200)
})

let started = false
function startLoop() {
  if (started) return
  started = true
  setInterval(() => document.visibilityState === 'visible' && syncNow(), 30_000)
  window.addEventListener('online', () => syncNow())
  window.addEventListener('focus', () => syncNow())
}

let markReady: () => void = () => {}
/**
 * Resolves after the first sync attempt on app start (or right away when signed out). Work that
 * creates records automatically, like recurring invoices, waits for it so it sees other devices' data.
 */
export const syncReady = new Promise<void>((resolve) => (markReady = resolve))

/** Called once on app start. */
export async function initSync() {
  try {
    await startSync()
  } finally {
    markReady()
  }
}

async function startSync() {
  const last = Number(store(KEY.last)) || null
  setStatus({ lastSync: last, pending: await pendingCount() })
  try {
    const user = await me()
    if (!user) return setStatus({ state: 'signedOut', user: null })
    await adoptDevice(user)
    setStatus({ user })
    startLoop()
    await syncNow()
  } catch {
    // Offline at startup: keep working locally and retry when the connection comes back.
    setStatus({ state: 'offline' })
    window.addEventListener('online', () => startSync(), { once: true })
  }
}

/** After sign-up, log-in or recovery. Uploads this device's data and downloads the account's. */
export async function onSignedIn(user: User) {
  await adoptDevice(user)
  setStatus({ user, error: null })
  startLoop()
  await syncNow()
}

export async function hasUnsyncedChanges(): Promise<boolean> {
  return (await pendingCount()) > 0
}

/** Whether someone has signed in on this device before (their data may be here, e.g. while offline). */
export function deviceHasAccount(): boolean {
  return !!store(KEY.owner)
}

/** Asks first when some changes haven't reached the cloud yet. Returns false if cancelled. */
export async function confirmSignOut(): Promise<boolean> {
  if ((await hasUnsyncedChanges()) && !confirm('Some changes haven’t synced yet (you may be offline). If you log out now they will be lost. Log out anyway?')) return false
  await signOut()
  return true
}

/** Signs out and removes this device's copy (it stays in the account). */
export async function signOut() {
  await syncNow().catch(() => {})
  await logoutRequest().catch(() => {})
  await wipeLocal()
  store(KEY.owner, null)
  store(KEY.last, null)
  setStatus({ state: 'signedOut', user: null, lastSync: null, pending: 0, error: null })
}

/** After the account was deleted on the server. */
export async function forgetAccount() {
  await wipeLocal()
  store(KEY.owner, null)
  store(KEY.last, null)
  setStatus({ state: 'signedOut', user: null, lastSync: null, pending: 0, error: null })
}
