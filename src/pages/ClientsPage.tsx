import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, emptyClient, type Client } from '../db'
import { ClientFields } from '../components/ClientFields'
import { Button, Card, Modal, PageHeader } from '../components/ui'

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
      <PageHeader title="Clients" actions={<Button onClick={() => setEditing({ ...emptyClient, createdAt: Date.now() })}>+ Add client</Button>} />
      {clients && clients.length === 0 && <Card className="py-12 text-center text-slate-500">No clients yet. Clients are also saved automatically when you create an invoice.</Card>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clients?.map((c) => (
          <Card key={c.id}>
            <div className="font-semibold text-slate-900">{c.name}</div>
            {c.company && <div className="text-sm text-slate-600">{c.company}</div>}
            <div className="mt-2 space-y-0.5 text-sm text-slate-500">
              {c.email && <div className="truncate">{c.email}</div>}
              {c.phone && <div>{c.phone}</div>}
              {c.address && <div className="whitespace-pre-line">{c.address}</div>}
            </div>
            <div className="mt-4 flex gap-2">
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
