import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Calendar, ChevronDown, Hash, Plus, Trash2 } from 'lucide-react'
import { db, emptyClient, formatInvoiceNumber, getSettings, useSettings, type Currency, type Invoice, type LineItem } from '../db'
import { CURRENCIES, calcTotals, formatMoney, newInvoice, newLineItem } from '../lib/invoice'
import { ClientFields } from '../components/ClientFields'
import { ScaledPreview } from '../components/InvoicePreview'
import { Button, Field, IconInput, PageHeader, SectionTitle, Toggle, initials, inputCls } from '../components/ui'

const PREVIEW_KEY = 'invoicekit.showPreview'

export default function InvoiceEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const clients = useLiveQuery(() => db.clients.orderBy('name').toArray(), []) ?? []
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), []) ?? []
  const [inv, setInv] = useState<Invoice | null>(null)
  const [saveClient, setSaveClient] = useState(true)
  const [saving, setSaving] = useState(false)
  const [discountOn, setDiscountOn] = useState(false)
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
      db.invoices.get(Number(id)).then((found) => {
        if (!found) return navigate('/', { replace: true })
        setInv(found)
        setDiscountOn(found.discountValue > 0)
      })
    else setInv(newInvoice(settings))
  }, [id, settings, inv, navigate])

  if (!settings || !inv) return null

  const set = (patch: Partial<Invoice>) => setInv((v) => v && { ...v, ...patch })
  const setItem = (idx: number, patch: Partial<LineItem>) => set({ items: inv.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) })
  const totals = calcTotals(inv)
  const money = (c: number) => formatMoney(c, inv.currency)
  const taxLabel = settings.taxLabel || 'Tax'

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
      if (inv.id) {
        await db.invoices.put(record)
      } else {
        const s = await getSettings()
        // Only advance the counter when the auto-suggested number was used.
        if (record.number === formatInvoiceNumber(s)) await db.settings.put({ ...s, nextNumber: s.nextNumber + 1 })
        savedId = await db.invoices.add(record)
      }
    })
    navigate(`/invoices/${savedId}`)
  }

  const clientPicker = clients.length > 0 && (
    <div className="relative flex items-center gap-2.5 rounded-full border border-zinc-200 bg-white py-1.5 pl-1.5 pr-9 shadow-xs">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
        {initials(inv.client.name || '+')}
      </span>
      <span className="min-w-0 max-w-44">
        <span className="block truncate text-sm font-medium text-zinc-900">{inv.clientId ? inv.client.name : 'New client'}</span>
        <span className="block truncate text-xs text-zinc-500">{inv.clientId ? inv.client.email || inv.client.company : 'or pick a saved one'}</span>
      </span>
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-zinc-400" />
      <select
        aria-label="Saved client"
        className="absolute inset-0 cursor-pointer opacity-0"
        value={inv.clientId ?? ''}
        onChange={(e) => {
          const c = clients.find((x) => x.id === Number(e.target.value))
          set(c ? { clientId: c.id, client: { name: c.name, company: c.company, email: c.email, phone: c.phone, address: c.address } } : { clientId: undefined, client: { ...emptyClient } })
        }}
      >
        <option value="">— New client —</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.company ? ` (${c.company})` : ''}
          </option>
        ))}
      </select>
    </div>
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
              action={
                products.length > 0 && (
                  <select
                    className={`${inputCls} w-auto py-2`}
                    value=""
                    onChange={(e) => {
                      const p = products.find((x) => x.id === Number(e.target.value))
                      if (!p) return
                      const item = newLineItem(settings, { description: p.description ? `${p.name}\n${p.description}` : p.name, rate: p.rate })
                      // Replace the initial empty row instead of leaving it dangling.
                      const items = inv.items.filter((i) => i.description.trim() || Number(i.rate))
                      set({ items: [...items, item] })
                    }}
                  >
                    <option value="">+ Add saved product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {formatMoney(Math.round(p.rate * 100), inv.currency)}
                      </option>
                    ))}
                  </select>
                )
              }
            />

            <div className="@container overflow-hidden rounded-xl border border-zinc-200">
              <div className="hidden grid-cols-[minmax(0,1fr)_60px_100px_60px_112px_32px] gap-2 bg-zinc-50 px-3 py-2.5 text-xs font-medium text-zinc-500 @2xl:grid">
                <span>Item</span>
                <span>Qty</span>
                <span>Rate</span>
                <span>{taxLabel} %</span>
                <span>Total</span>
                <span />
              </div>
              <div className="divide-y divide-zinc-100">
                {inv.items.map((item, i) => (
                  <div key={item.id} className="grid grid-cols-[1fr_1fr_1fr_32px] gap-2 p-3 @md:grid-cols-[1fr_1fr_1fr_1.4fr_32px] @2xl:grid-cols-[minmax(0,1fr)_60px_100px_60px_112px_32px] @2xl:items-start">
                    <textarea
                      rows={1}
                      placeholder="Item name"
                      className={`${inputCls} col-span-4 min-h-[38px] resize-y py-2 @md:col-span-5 @2xl:col-span-1`}
                      value={item.description}
                      onChange={(e) => setItem(i, { description: e.target.value })}
                    />
                    <NumInput label="Qty" value={item.qty} onChange={(qty) => setItem(i, { qty })} />
                    <NumInput label="Rate" value={item.rate} onChange={(rate) => setItem(i, { rate })} />
                    <NumInput label={`${taxLabel} %`} value={item.taxRate} onChange={(taxRate) => setItem(i, { taxRate })} />
                    <div className="col-span-3 @md:col-span-1">
                      <span className="mb-0.5 block text-[11px] text-zinc-500 @2xl:hidden">Total</span>
                      <div className="truncate rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-sm text-zinc-600">{money(totals.lines[i])}</div>
                    </div>
                    <button
                      type="button"
                      aria-label="Remove item"
                      className="flex h-[38px] items-center justify-center self-end rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:invisible @2xl:self-start"
                      disabled={inv.items.length === 1}
                      onClick={() => set({ items: inv.items.filter((_, j) => j !== i) })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1.5 border-t border-zinc-200 bg-zinc-50/60 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                onClick={() => set({ items: [...inv.items, newLineItem(settings)] })}
              >
                <Plus className="h-4 w-4" /> Add Item
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-3">
                <label className="flex items-center gap-2.5 text-sm font-medium text-zinc-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-blue-600"
                    checked={discountOn}
                    onChange={(e) => {
                      setDiscountOn(e.target.checked)
                      if (!e.target.checked) set({ discountValue: 0 })
                    }}
                  />
                  Add Discount
                </label>
                {discountOn && (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={0}
                      aria-label="Discount"
                      className={`${inputCls} w-28`}
                      value={inv.discountValue}
                      onChange={(e) => set({ discountValue: Number(e.target.value) })}
                    />
                    <select className={`${inputCls} w-auto`} value={inv.discountType} onChange={(e) => set({ discountType: e.target.value as Invoice['discountType'] })}>
                      <option value="percent">%</option>
                      <option value="fixed">{CURRENCIES[inv.currency].symbol} fixed</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="w-full space-y-2 rounded-xl bg-zinc-50 p-4 text-sm sm:w-72">
                <TotalRow label="Subtotal" value={money(totals.subtotal)} />
                {totals.discount > 0 && <TotalRow label="Discount" value={`-${money(totals.discount)}`} />}
                <TotalRow label={taxLabel} value={money(totals.tax)} />
                <div className="flex justify-between border-t border-zinc-200 pt-2 text-base font-semibold text-zinc-900">
                  <span>Grand Total</span>
                  <span>{money(totals.total)}</span>
                </div>
              </div>
            </div>
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

function NumInput({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label>
      <span className="mb-0.5 block text-[11px] text-zinc-500 @2xl:hidden">{label}</span>
      <input
        type="number"
        min={0}
        step="any"
        aria-label={label}
        className={`${inputCls} px-2.5 py-2`}
        value={Number.isNaN(value) ? '' : value}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      />
    </label>
  )
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-8 text-zinc-600">
      <span>{label}</span>
      <span className="font-medium text-zinc-800">{value}</span>
    </div>
  )
}
