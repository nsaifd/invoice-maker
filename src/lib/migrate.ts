import Dexie from 'dexie'
import { db, newId, SYNC_TABLES, type SyncTable } from '../db'

// Before accounts existed, records used auto-increment numbers (1, 2, 3…) as ids. Two devices
// would both create "invoice 5", so ids are now random strings. This converts old data —
// from the previous local database or from an old backup file — and keeps every reference
// between records (invoice → client, proposal → invoice, …) pointing at the right record.

type Row = Record<string, unknown> & { id?: unknown }
export type BackupData = Partial<Record<SyncTable, Row[]>>

export function remapLegacy(data: BackupData): Record<SyncTable, Row[]> {
  const maps = Object.fromEntries(SYNC_TABLES.map((t) => [t, new Map<string, string>()])) as Record<SyncTable, Map<string, string>>
  const out = Object.fromEntries(SYNC_TABLES.map((t) => [t, [] as Row[]])) as Record<SyncTable, Row[]>

  for (const t of SYNC_TABLES) {
    for (const row of data[t] ?? []) {
      const old = row.id
      // Settings keep their fixed id; ids that are already strings came from a new-format backup.
      const id = t === 'settings' ? 'default' : typeof old === 'string' && old ? old : newId()
      if (old !== undefined && old !== null) maps[t].set(String(old), id)
      out[t].push({ ...row, id })
    }
  }

  const ref = (t: SyncTable, v: unknown) => (v === undefined || v === null || v === '' ? undefined : (maps[t].get(String(v)) ?? (typeof v === 'string' ? v : undefined)))
  const withStyleRef = <T extends { customTemplateId?: unknown } | undefined>(style: T): T =>
    style ? ({ ...style, customTemplateId: ref('templates', style.customTemplateId) } as T) : style

  out.settings = out.settings.map((s) => ({
    ...s,
    customTemplateId: ref('templates', s.customTemplateId),
    proposalTheme: withStyleRef(s.proposalTheme as { customTemplateId?: unknown } | undefined),
  }))
  out.invoices = out.invoices.map((i) => ({
    ...i,
    clientId: ref('clients', i.clientId),
    recurringId: ref('recurring', i.recurringId),
    style: withStyleRef(i.style as { customTemplateId?: unknown } | undefined),
  }))
  out.proposals = out.proposals.map((p) => ({
    ...p,
    clientId: ref('clients', p.clientId),
    invoiceId: ref('invoices', p.invoiceId),
    theme: withStyleRef(p.theme as { customTemplateId?: unknown } | undefined),
  }))
  out.recurring = out.recurring.map((r) => {
    const template = r.template as { clientId?: unknown } | undefined
    return { ...r, sourceInvoiceId: ref('invoices', r.sourceInvoiceId), template: template && { ...template, clientId: ref('clients', template.clientId) } }
  })
  for (const t of SYNC_TABLES) out[t] = out[t].map(({ _dirty: _d, _ts: _t, ...row }) => row)
  return out
}

/** Writes converted data. Runs as a normal local change, so it is uploaded on the next sync. */
export async function writeAll(data: Record<SyncTable, Row[]>) {
  await db.transaction('rw', SYNC_TABLES.map((t) => db.table(t)), async () => {
    for (const t of SYNC_TABLES) if (data[t].length) await db.table(t).bulkPut(data[t])
  })
}

const MIGRATED_KEY = 'involet.migrated'

function flag(set?: boolean): boolean {
  try {
    if (set) localStorage.setItem(MIGRATED_KEY, '1')
    return localStorage.getItem(MIGRATED_KEY) === '1'
  } catch {
    return false
  }
}

/** Copies data from the old 'invoicekit' database into the new one, once. The old database is kept as a safety net. */
async function migrateLegacyDatabase() {
  if (flag()) return
  if (!(await Dexie.exists('invoicekit'))) return void flag(true)
  const counts = await Promise.all(SYNC_TABLES.map((t) => db.table(t).count()))
  if (counts.some((n) => n > 0)) return void flag(true)

  const old = new Dexie('invoicekit')
  old.version(1).stores({ settings: 'id', clients: '++id, name', products: '++id, name', invoices: '++id, number, status, clientId, issueDate, dueDate' })
  old.version(2).stores({ proposals: '++id, number, status, clientId, date', recurring: '++id, nextDate, active' })
  old.version(3).stores({ templates: '++id, kind, name' })
  try {
    await old.open()
    const data: BackupData = {}
    for (const t of SYNC_TABLES) {
      const table = old.tables.find((x) => x.name === t)
      data[t] = table ? ((await table.toArray()) as Row[]) : []
    }
    await writeAll(remapLegacy(data))
    flag(true)
  } finally {
    old.close()
  }
}

/** Resolves once local data is ready to use. */
export const ready: Promise<void> = migrateLegacyDatabase().catch((e) => console.error('Could not migrate old data', e))
