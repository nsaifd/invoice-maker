import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, emptyClient, formatInvoiceNumber, getSettings, useSettings, type Currency, type Invoice, type LineItem } from '../db'
import { CURRENCIES, calcTotals, formatMoney, newInvoice, newLineItem } from '../lib/invoice'
import { ClientFields } from '../components/ClientFields'
import { ScaledPreview } from '../components/InvoicePreview'
import { Button, Card, Field, PageHeader, inputCls } from '../components/ui'

export default function InvoiceEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const clients = useLiveQuery(() => db.clients.orderBy('name').toArray(), []) ?? []
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), []) ?? []
  const [inv, setInv] = useState<Invoice | null>(null)
  const [saveClient, setSaveClient] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!settings || inv) return
    if (id) db.invoices.get(Number(id)).then((found) => (found ? setInv(found) : navigate('/', { replace: true })))
    else setInv(newInvoice(settings))
  }, [id, settings, inv, navigate])

  if (!settings || !inv) return null

  const set = (patch: Partial<Invoice>) => setInv((v) => v && { ...v, ...patch })
  const setItem = (idx: number, patch: Partial<LineItem>) => set({ items: inv.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) })
  const totals = calcTotals(inv)
  const money = (c: number) => formatMoney(c, inv.currency)

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

  return (
    <>
      <PageHeader
        title={inv.id ? `Edit ${inv.number}` : 'New invoice'}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              Save invoice
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Client</h2>
              {clients.length > 0 && (
                <select
                  className={`${inputCls} w-auto`}
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
              )}
            </div>
            <ClientFields value={inv.client} onChange={(client) => set({ client })} />
            {!inv.clientId && (
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={saveClient} onChange={(e) => setSaveClient(e.target.checked)} />
                Save this client for future invoices
              </label>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">Details</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Invoice number">
                <input className={inputCls} value={inv.number} onChange={(e) => set({ number: e.target.value })} />
              </Field>
              <Field label="Issue date">
                <input type="date" className={inputCls} value={inv.issueDate} onChange={(e) => set({ issueDate: e.target.value })} />
              </Field>
              <Field label="Due date">
                <input type="date" className={inputCls} value={inv.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
              </Field>
              <Field label="Currency">
                <select className={inputCls} value={inv.currency} onChange={(e) => set({ currency: e.target.value as Currency })}>
                  {Object.keys(CURRENCIES).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Items</h2>
              {products.length > 0 && (
                <select
                  className={`${inputCls} w-auto`}
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
                  <option value="">+ Add from products…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatMoney(Math.round(p.rate * 100), inv.currency)}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="mb-1 hidden grid-cols-12 gap-2 px-3 text-xs font-medium text-slate-500 sm:grid">
              <span className="col-span-4">Description</span>
              <span className="col-span-2 text-right">Qty</span>
              <span className="col-span-2 text-right">Rate</span>
              <span className="col-span-2 text-right">{settings.taxLabel || 'Tax'} %</span>
              <span className="col-span-2 text-right">Amount</span>
            </div>
            <div className="space-y-3">
              {inv.items.map((item, i) => (
                <div key={item.id} className="grid grid-cols-6 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-12 sm:items-start">
                  <textarea
                    rows={1}
                    placeholder="Description"
                    className={`${inputCls} col-span-6 sm:col-span-4`}
                    value={item.description}
                    onChange={(e) => setItem(i, { description: e.target.value })}
                  />
                  <NumInput label="Qty" className="col-span-2 sm:col-span-2" value={item.qty} onChange={(qty) => setItem(i, { qty })} />
                  <NumInput label="Rate" className="col-span-2 sm:col-span-2" value={item.rate} onChange={(rate) => setItem(i, { rate })} />
                  <NumInput label={`${settings.taxLabel || 'Tax'} %`} className="col-span-2 sm:col-span-2" value={item.taxRate} onChange={(taxRate) => setItem(i, { taxRate })} />
                  <div className="col-span-6 flex items-center justify-between gap-2 sm:col-span-2 sm:flex-col sm:items-end sm:justify-start">
                    <span className="pt-2 text-sm font-medium text-slate-900">{money(totals.lines[i])}</span>
                    <button
                      type="button"
                      className="text-xs text-slate-400 hover:text-red-600 disabled:invisible"
                      disabled={inv.items.length === 1}
                      onClick={() => set({ items: inv.items.filter((_, j) => j !== i) })}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="secondary" className="mt-3" onClick={() => set({ items: [...inv.items, newLineItem(settings)] })}>
              + Add item
            </Button>

            <div className="mt-6 flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-2">
                <Field label="Discount">
                  <input type="number" min={0} className={`${inputCls} w-28`} value={inv.discountValue} onChange={(e) => set({ discountValue: Number(e.target.value) })} />
                </Field>
                <select className={`${inputCls} w-auto`} value={inv.discountType} onChange={(e) => set({ discountType: e.target.value as Invoice['discountType'] })}>
                  <option value="percent">%</option>
                  <option value="fixed">{CURRENCIES[inv.currency].symbol} fixed</option>
                </select>
              </div>
              <div className="min-w-56 space-y-1 text-sm">
                <TotalRow label="Subtotal" value={money(totals.subtotal)} />
                {totals.discount > 0 && <TotalRow label="Discount" value={`-${money(totals.discount)}`} />}
                <TotalRow label={settings.taxLabel || 'Tax'} value={money(totals.tax)} />
                <TotalRow label="Total" value={money(totals.total)} bold />
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">Notes & terms</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Notes (shown to client)">
                <textarea rows={3} className={inputCls} value={inv.notes} onChange={(e) => set({ notes: e.target.value })} />
              </Field>
              <Field label="Terms">
                <textarea rows={3} className={inputCls} value={inv.terms} onChange={(e) => set({ terms: e.target.value })} />
              </Field>
            </div>
          </Card>
        </div>

        <div className="min-w-0">
          <div className="xl:sticky xl:top-20">
            <div className="mb-2 text-sm font-medium text-slate-500">Live preview</div>
            <ScaledPreview invoice={inv} settings={settings} />
          </div>
        </div>
      </div>
    </>
  )
}

function NumInput({ label, value, onChange, className }: { label: string; value: number; onChange: (n: number) => void; className?: string }) {
  return (
    <label className={className}>
      <span className="mb-0.5 block text-[11px] text-slate-500 sm:sr-only">{label}</span>
      <input
        type="number"
        min={0}
        step="any"
        placeholder={label}
        title={label}
        className={`${inputCls} text-right`}
        value={Number.isNaN(value) ? '' : value}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      />
    </label>
  )
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-8 ${bold ? 'border-t border-slate-200 pt-1 text-base font-semibold text-slate-900' : 'text-slate-600'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
