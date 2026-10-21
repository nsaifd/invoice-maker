import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, emptyClient, type Client } from '../db'
import { ClientFields } from '../components/ClientFields'
import { Mail, MapPin, Phone, Plus, Users } from 'lucide-react'
import { Button, Card, Modal, PageHeader, initials } from '../components/ui'

export default function ClientsPage() {
  const clients = useLiveQuery(() => db.clients.orderBy('name').toArray(), [])
  const [editing, setEditing] = useState<Client | null>(null)

  async function save() {
    if (!editing) return
    if (!editing.name.trim()) return alert('Please enter a name.')
    await db.clients.put(editing)
    setEditing(null)
  }

  async function remove(c: Client) {
    if (!confirm(`Delete ${c.name}? Existing invoices keep their copy of the client details.`)) return
    await db.clients.delete(c.id!)
  }

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="People and companies you bill."
        actions={
          <Button icon={Plus} onClick={() => setEditing({ ...emptyClient, createdAt: Date.now() })}>
            Add Client
          </Button>
        }
      />
      {clients && clients.length === 0 && <div className="rounded-2xl border border-dashed border-zinc-300 py-14 text-center text-sm text-zinc-500">
          <Users className="mx-auto mb-3 h-8 w-8 text-zinc-300" />
          No clients yet. Clients are also saved automatically when you create an invoice.
        </div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clients?.map((c) => (
          <Card key={c.id}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">{initials(c.name)}</span>
              <div className="min-w-0">
                <div className="truncate font-semibold text-zinc-900">{c.name}</div>
                {c.company && <div className="truncate text-sm text-zinc-500">{c.company}</div>}
              </div>
            </div>
            <div className="mt-4 space-y-1.5 text-sm text-zinc-600">
              {c.email && <div className="flex items-center gap-2 truncate"><Mail className="h-4 w-4 shrink-0 text-zinc-400" />{c.email}</div>}
              {c.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-zinc-400" />{c.phone}</div>}
              {c.address && <div className="flex gap-2 whitespace-pre-line"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />{c.address}</div>}
            </div>
            <div className="mt-5 flex gap-2 border-t border-zinc-100 pt-4">
              <Button variant="secondary" onClick={() => setEditing(c)}>Edit</Button>
              <Button variant="ghost" className="hover:!text-red-600" onClick={() => remove(c)}>Delete</Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={!!editing} title={editing?.id ? 'Edit client' : 'New client'} onClose={() => setEditing(null)}>
        {editing && <ClientFields value={editing} onChange={(v) => setEditing({ ...editing, ...v })} />}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </div>
      </Modal>
    </>
  )
}
