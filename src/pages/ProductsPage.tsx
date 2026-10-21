import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, useSettings, type Product } from '../db'
import { formatAmount } from '../lib/invoice'
import { Package, Plus } from 'lucide-react'
import { Button, Field, Modal, NumberInput, PageHeader, inputCls } from '../components/ui'

const blank = (): Product => ({ name: '', description: '', rate: 0, unit: '', createdAt: Date.now() })

export default function ProductsPage() {
  const settings = useSettings()
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), [])
  const [editing, setEditing] = useState<Product | null>(null)

  async function save() {
    if (!editing) return
    if (!editing.name.trim()) return alert('Please enter a name.')
    await db.products.put(editing)
    setEditing(null)
  }

  if (!settings) return null
  const set = (patch: Partial<Product>) => setEditing((p) => p && { ...p, ...patch })

  return (
    <>
      <PageHeader
        title="Products & Services"
        subtitle="Save what you sell often, then add it to an invoice in one click."
        actions={
          <Button icon={Plus} onClick={() => setEditing(blank())}>
            Add Item
          </Button>
        }
      />
      {products && products.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-300 py-14 text-center text-sm text-zinc-500">
          <Package className="mx-auto mb-3 h-8 w-8 text-zinc-300" />
          No saved products or services yet.
        </div>
      )}
      {products && products.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 text-right font-medium">Rate</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-zinc-100">
                  <td className="px-4 py-3 font-medium text-zinc-900">{p.name}</td>
                  <td className="px-4 py-3 text-zinc-500">{p.description}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {formatAmount(p.rate, settings.currency)}
                    {p.unit && <span className="text-zinc-400"> / {p.unit}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Button variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
                    <Button variant="ghost" className="hover:!text-red-600" onClick={() => confirm(`Delete ${p.name}?`) && db.products.delete(p.id!)}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!editing} title={editing?.id ? 'Edit item' : 'New item'} onClose={() => setEditing(null)}>
        {editing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name *" className="sm:col-span-2">
              <input className={inputCls} value={editing.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <textarea rows={2} className={inputCls} value={editing.description} onChange={(e) => set({ description: e.target.value })} />
            </Field>
            <Field label={`Rate (${settings.currency})`}>
              <NumberInput value={editing.rate} onChange={(rate) => set({ rate })} />
            </Field>
            <Field label="Unit (optional)">
              <input className={inputCls} placeholder="hour, page, month…" value={editing.unit} onChange={(e) => set({ unit: e.target.value })} />
            </Field>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </div>
      </Modal>
    </>
  )
}
