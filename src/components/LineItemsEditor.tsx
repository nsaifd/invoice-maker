import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Currency, Invoice, LineItem, Product, Settings } from '../db'
import { CURRENCIES, calcTotals, formatAmount, formatMoney, newLineItem } from '../lib/invoice'
import { NumberInput, inputCls } from './ui'

type Priced = { items: LineItem[]; discountType: Invoice['discountType']; discountValue: number }

/** Line items, discount and totals — shared by the invoice editor and proposal pricing blocks. */
export function LineItemsEditor({
  value,
  onChange,
  currency,
  settings,
  totalLabel = 'Grand Total',
}: {
  value: Priced
  onChange: (patch: Partial<Priced>) => void
  currency: Currency
  settings: Settings
  totalLabel?: string
}) {
  const [discountOn, setDiscountOn] = useState(value.discountValue > 0)
  const taxLabel = settings.taxLabel || 'Tax'
  const totals = calcTotals(value)
  const money = (c: number) => formatMoney(c, currency)
  const setItem = (idx: number, patch: Partial<LineItem>) => onChange({ items: value.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) })

  return (
    <>
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
          {value.items.map((item, i) => (
            <div
              key={item.id}
              className="grid grid-cols-[1fr_1fr_1fr_32px] gap-2 p-3 @md:grid-cols-[1fr_1fr_1fr_1.4fr_32px] @2xl:grid-cols-[minmax(0,1fr)_60px_100px_60px_112px_32px] @2xl:items-start"
            >
              <textarea
                rows={1}
                placeholder="Item name"
                className={`${inputCls} col-span-4 min-h-[38px] resize-y py-2 @md:col-span-5 @2xl:col-span-1`}
                value={item.description}
                onChange={(e) => setItem(i, { description: e.target.value })}
              />
              <NumInput label="Qty" value={item.qty} onChange={(qty) => setItem(i, { qty })} />
              <NumInput label="Rate" allowNegative value={item.rate} onChange={(rate) => setItem(i, { rate })} />
              <NumInput label={`${taxLabel} %`} max={100} value={item.taxRate} onChange={(taxRate) => setItem(i, { taxRate })} />
              <div className="col-span-3 @md:col-span-1">
                <span className="mb-0.5 block text-[11px] text-zinc-500 @2xl:hidden">Total</span>
                <div className="truncate rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-sm text-zinc-600">{money(totals.lines[i])}</div>
              </div>
              <button
                type="button"
                aria-label="Remove item"
                className="flex h-[38px] items-center justify-center self-end rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:invisible @2xl:self-start"
                disabled={value.items.length === 1}
                onClick={() => onChange({ items: value.items.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="flex w-full items-center justify-center gap-1.5 border-t border-zinc-200 bg-zinc-50/60 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          onClick={() => onChange({ items: [...value.items, newLineItem(settings)] })}
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
                if (!e.target.checked) onChange({ discountValue: 0 })
              }}
            />
            Add Discount
          </label>
          {discountOn && (
            <div className="flex gap-2">
              <NumberInput
                aria-label="Discount"
                className="w-28"
                max={value.discountType === 'percent' ? 100 : undefined}
                value={value.discountValue}
                onChange={(discountValue) => onChange({ discountValue })}
              />
              <select className={`${inputCls} w-auto`} value={value.discountType} onChange={(e) => onChange({ discountType: e.target.value as Invoice['discountType'] })}>
                <option value="percent">%</option>
                <option value="fixed">{CURRENCIES[currency].symbol} fixed</option>
              </select>
            </div>
          )}
        </div>
        <div className="w-full space-y-2 rounded-xl bg-zinc-50 p-4 text-sm sm:w-72">
          <TotalRow label="Subtotal" value={money(totals.subtotal)} />
          {totals.discount > 0 && <TotalRow label="Discount" value={`-${money(totals.discount)}`} />}
          <TotalRow label={taxLabel} value={money(totals.tax)} />
          <div className="flex justify-between border-t border-zinc-200 pt-2 text-base font-semibold text-zinc-900">
            <span>{totalLabel}</span>
            <span>{money(totals.total)}</span>
          </div>
        </div>
      </div>
    </>
  )
}

/** "+ Add saved product…" dropdown; replaces the initial empty row instead of leaving it dangling. */
export function ProductPicker({
  products,
  currency,
  settings,
  items,
  onAdd,
}: {
  products: Product[]
  currency: Currency
  settings: Settings
  items: LineItem[]
  onAdd: (items: LineItem[]) => void
}) {
  if (!products.length) return null
  return (
    <select
      className={`${inputCls} w-auto py-2`}
      value=""
      onChange={(e) => {
        const p = products.find((x) => x.id === e.target.value)
        if (!p) return
        const item = newLineItem(settings, { description: p.description ? `${p.name}\n${p.description}` : p.name, rate: p.rate })
        onAdd([...items.filter((i) => i.description.trim() || Number(i.rate)), item])
      }}
    >
      <option value="">+ Add saved product…</option>
      {products.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} — {formatAmount(p.rate, currency)}
        </option>
      ))}
    </select>
  )
}

// Quantity can't go below 0. A negative rate makes a credit line (refund, advance already paid).
function NumInput({ label, value, onChange, ...limits }: { label: string; value: number; onChange: (n: number) => void; allowNegative?: boolean; max?: number }) {
  return (
    <label>
      <span className="mb-0.5 block text-[11px] text-zinc-500 @2xl:hidden">{label}</span>
      <NumberInput aria-label={label} className="px-2.5 py-2" value={value} onChange={onChange} {...limits} />
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
