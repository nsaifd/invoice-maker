import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Calendar, Hash } from 'lucide-react'
import { styleOf, bumpCounter, db, suggestNumber, useSettings, type Currency, type Invoice } from '../db'
import { CURRENCIES, newInvoice } from '../lib/invoice'
import { LAYOUTS, PRESETS, applyPreset, presetById } from '../lib/presets'
import { LineItemsEditor, ProductPicker } from '../components/LineItemsEditor'
import { ClientFields, ClientPicker } from '../components/ClientFields'
import { ScaledPreview } from '../components/InvoicePreview'
import { Button, Field, IconInput, PageHeader, SectionTitle, Toggle, inputCls } from '../components/ui'

const PREVIEW_KEY = 'invoicekit.showPreview'

export default function InvoiceEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const clients = useLiveQuery(() => db.clients.orderBy('name').toArray(), []) ?? []
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), []) ?? []
  const uploads = useLiveQuery(() => db.templates.where('kind').equals('invoice').toArray(), []) ?? []
  const [inv, setInv] = useState<Invoice | null>(null)
  const [saveClient, setSaveClient] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(() => {
    try {
      return localStorage.getItem(PREVIEW_KEY) !== '0'
    } catch {
      return true
    }
  })

  useEffect(() => {
    if (!settings || inv) return
    if (id)
      db.invoices.get(id).then((found) => {
        if (!found) return navigate('/', { replace: true })
        setInv(found)
      })
    else {
      const fresh = newInvoice(settings)
      setInv(fresh)
      // The counter's number may already be taken (typed by hand or synced from another device).
      suggestNumber('invoice').then((number) => setInv((v) => (v && !v.id && v.number === fresh.number ? { ...v, number } : v)))
    }
  }, [id, settings, inv, navigate])

  if (!settings || !inv) return null

  const set = (patch: Partial<Invoice>) => setInv((v) => v && { ...v, ...patch })

  function togglePreview(v: boolean) {
    setShowPreview(v)
    try {
      localStorage.setItem(PREVIEW_KEY, v ? '1' : '0')
    } catch {
      /* preference only */
    }
  }

  async function save() {
    if (!inv) return
    if (!inv.client.name.trim()) return alert('Please enter the client name.')
    if (!inv.number.trim()) return alert('Please enter an invoice number.')
    const clash = await db.invoices.where('number').equals(inv.number.trim()).first()
    if (clash && clash.id !== inv.id && !confirm(`Invoice ${inv.number} already exists. Save anyway?`)) return

    setSaving(true)
    const items = inv.items.filter((i) => i.description.trim() || Number(i.rate))
    let savedId = inv.id
    await db.transaction('rw', db.invoices, db.clients, db.settings, async () => {
      let clientId = inv.clientId
      if (!clientId && saveClient) clientId = await db.clients.add({ ...inv.client, createdAt: Date.now() })
      const record: Invoice = { ...inv, number: inv.number.trim(), items, clientId, updatedAt: Date.now() }
      if (inv.id) await db.invoices.put(record)
      else savedId = await db.invoices.add(record)
      // Move the counter past this number, so the next invoice doesn't reuse it.
      await bumpCounter('invoice', record.number)
    })
    navigate(`/invoices/${savedId}`)
  }

  const clientPicker = (
    <ClientPicker clients={clients} clientId={inv.clientId} client={inv.client} onSelect={(clientId, client) => set({ clientId, client })} />
  )

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Invoices', to: '/' }, { label: inv.id ? 'Edit Invoice' : 'New Invoice' }]}
        title={inv.id ? `Edit ${inv.number}` : 'New Invoice'}
        subtitle={inv.id ? 'Update the details and save your changes.' : 'Create a new invoice and download it as a PDF.'}
        actions={
          <>
            <Toggle label="Show Preview" checked={showPreview} onChange={togglePreview} />
            <Button variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              Save Invoice
            </Button>
          </>
        }
      />

      <div className={`grid items-start gap-6 ${showPreview ? 'xl:grid-cols-[minmax(0,1fr)_minmax(0,540px)] 2xl:grid-cols-2' : ''}`}>
        <div className={`min-w-0 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white ${showPreview ? '' : 'mx-auto w-full max-w-3xl'}`}>
          <section className="p-6">
            <SectionTitle title="Client Details" subtitle="Who is this invoice for?" action={clientPicker} />
            <ClientFields value={inv.client} onChange={(client) => set({ client })} />
            {!inv.clientId && (
              <label className="mt-4 flex items-center gap-2 text-sm text-zinc-600">
                <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={saveClient} onChange={(e) => setSaveClient(e.target.checked)} />
                Save this client for future invoices
              </label>
            )}
          </section>

          <section className="p-6">
            <SectionTitle title="Invoice Details" subtitle="Number, dates and currency." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Invoice Number">
                <IconInput icon={Hash} value={inv.number} onChange={(e) => set({ number: e.target.value })} />
              </Field>
              <Field label="Currency">
                <select className={inputCls} value={inv.currency} onChange={(e) => set({ currency: e.target.value as Currency })}>
                  {Object.entries(CURRENCIES).map(([code, c]) => (
                    <option key={code} value={code}>
                      {c.symbol} {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Issued Date">
                <IconInput icon={Calendar} type="date" value={inv.issueDate} onChange={(e) => set({ issueDate: e.target.value })} />
              </Field>
              <Field label="Due Date">
                <IconInput icon={Calendar} type="date" value={inv.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
              </Field>
            </div>
          </section>

          <section className="p-6">
            <SectionTitle
              title="Product Details"
              subtitle="What are you billing for?"
              action={<ProductPicker products={products} currency={inv.currency} settings={settings} items={inv.items} onAdd={(items) => set({ items })} />}
            />
            <LineItemsEditor key={inv.id ?? 'new'} value={inv} onChange={set} currency={inv.currency} settings={settings} />
          </section>

          <section className="p-6">
            <SectionTitle
              title="Design"
              subtitle="Use your default design, or pick a different one for this invoice."
              action={
                <Link to="/templates" className="text-sm font-medium text-blue-600 hover:underline">
                  Browse templates →
                </Link>
              }
            />
            <select
              className={inputCls}
              value={inv.style ? (inv.style.template === 'custom' ? `custom:${inv.style.customTemplateId}` : inv.style.preset) : ''}
              onChange={(e) => {
                const v = e.target.value
                if (v.startsWith('custom:')) return set({ style: { ...styleOf(settings), template: 'custom', preset: 'custom', customTemplateId: v.slice(7) } })
                const p = presetById(v)
                set({ style: p ? applyPreset(styleOf(settings), p) : undefined })
              }}
            >
              <option value="">Default design ({settings.template === 'custom' ? (uploads.find((t) => t.id === settings.customTemplateId)?.name ?? 'Your design') : (presetById(settings.preset)?.name ?? 'Custom')})</option>
              {uploads.length > 0 && (
                <optgroup label="My uploads">
                  {uploads.map((t) => (
                    <option key={t.id} value={`custom:${t.id}`}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {Object.entries(LAYOUTS).map(([layout, l]) => (
                <optgroup key={layout} label={l.label}>
                  {PRESETS.filter((p) => p.template === layout).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ))}
              {inv.style && inv.style.template !== 'custom' && !presetById(inv.style.preset) && <option value={inv.style.preset}>Custom</option>}
            </select>
          </section>

          <section className="p-6">
            <SectionTitle title="Notes & Terms" subtitle="Shown at the bottom of the invoice." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Note">
                <textarea rows={3} className={inputCls} value={inv.notes} onChange={(e) => set({ notes: e.target.value })} />
              </Field>
              <Field label="Terms">
                <textarea rows={3} className={inputCls} value={inv.terms} onChange={(e) => set({ terms: e.target.value })} />
              </Field>
            </div>
          </section>
        </div>

        {showPreview && (
          <div className="min-w-0 xl:sticky xl:top-4">
            <ScaledPreview invoice={inv} settings={settings} header={<span className="text-lg font-semibold text-zinc-900">Preview</span>} />
          </div>
        )}
      </div>
    </>
  )
}
