import { useEffect, useRef, useState } from 'react'
import { db, defaultSettings, useSettings, type Currency, type FontId, type Invoice, type PaymentDetails, type Settings, type TemplateId } from '../db'
import { CURRENCIES, addDays, todayISO, uid } from '../lib/invoice'
import { InvoicePreview, TEMPLATES } from '../components/InvoicePreview'
import { FONTS, ScaledFrame } from '../components/doc'
import { Button, Card, Field, PageHeader, inputCls } from '../components/ui'

export default function SettingsPage() {
  const saved = useSettings()
  const [s, setS] = useState<Settings | null>(null)
  const [flash, setFlash] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (saved && !s) setS(saved)
  }, [saved, s])

  if (!s) return null

  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch })
  const text = (k: keyof Settings) => ({
    value: String(s[k] ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set({ [k]: e.target.value }),
  })
  const pay = (k: keyof PaymentDetails) => ({
    value: s.payment[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set({ payment: { ...s.payment, [k]: e.target.value } }),
  })
  const notify = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(''), 2500)
  }

  async function save() {
    await db.settings.put({
      ...s!,
      nextNumber: Math.max(1, Math.floor(s!.nextNumber) || 1),
      nextProposalNumber: Math.max(1, Math.floor(s!.nextProposalNumber) || 1),
    })
    notify('Settings saved')
  }

  async function onLogo(file?: File) {
    if (file) set({ logo: await resizeImage(file, 480) })
  }

  async function exportData() {
    const data = {
      app: 'invoicekit',
      version: 2,
      exportedAt: new Date().toISOString(),
      settings: await db.settings.toArray(),
      clients: await db.clients.toArray(),
      products: await db.products.toArray(),
      invoices: await db.invoices.toArray(),
      proposals: await db.proposals.toArray(),
      recurring: await db.recurring.toArray(),
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `invoicekit-backup-${new Date().toISOString().slice(0, 10)}.json` })
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importData(file?: File) {
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      if (data.app !== 'invoicekit') throw new Error('Not an InvoiceKit backup file.')
      if (!confirm('This replaces ALL current data with the backup. Continue?')) return
      const tables = [db.settings, db.clients, db.products, db.invoices, db.proposals, db.recurring]
      await db.transaction('rw', tables, async () => {
        await Promise.all(tables.map((t) => t.clear()))
        await db.settings.bulkPut(data.settings ?? [])
        await db.clients.bulkPut(data.clients ?? [])
        await db.products.bulkPut(data.products ?? [])
        await db.invoices.bulkPut(data.invoices ?? [])
        await db.proposals.bulkPut(data.proposals ?? [])
        await db.recurring.bulkPut(data.recurring ?? [])
      })
      const restored = await db.settings.get('default')
      setS(restored ? { ...defaultSettings, ...restored } : defaultSettings)
      notify('Backup restored')
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`)
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Your business details, invoice defaults and backups."
        actions={
          <>
            {flash && <span className="self-center text-sm text-emerald-600">{flash}</span>}
            <Button onClick={save}>Save settings</Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Business</h2>
          <div className="mb-4 flex items-center gap-4">
            <div className="flex h-16 w-32 items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50">
              {s.logo ? <img src={s.logo} alt="Logo" className="max-h-14 max-w-28 object-contain" /> : <span className="text-xs text-zinc-400">No logo</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="cursor-pointer text-sm font-medium text-blue-600 hover:underline">
                Upload logo
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
              </label>
              {s.logo && (
                <button type="button" className="text-left text-sm text-zinc-500 hover:text-red-600" onClick={() => set({ logo: undefined })}>
                  Remove
                </button>
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name" className="sm:col-span-2">
              <input className={inputCls} {...text('businessName')} />
            </Field>
            <Field label="Email">
              <input type="email" className={inputCls} {...text('email')} />
            </Field>
            <Field label="Phone">
              <input className={inputCls} {...text('phone')} />
            </Field>
            <Field label="Website" className="sm:col-span-2">
              <input className={inputCls} {...text('website')} />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <textarea rows={2} className={inputCls} {...text('address')} />
            </Field>
          </div>

          <div className="mt-6 border-t border-zinc-100 pt-5">
            <div className="mb-3 text-sm font-medium text-zinc-700">Signature</div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-16 w-40 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50">
                {s.signature ? <img src={s.signature} alt="Signature" className="max-h-14 max-w-36 object-contain" /> : <span className="text-xs text-zinc-400">No signature</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="cursor-pointer text-sm font-medium text-blue-600 hover:underline">
                  Upload signature
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => e.target.files?.[0] && set({ signature: await resizeImage(e.target.files[0], 480) })} />
                </label>
                {s.signature && (
                  <button type="button" className="text-left text-sm text-zinc-500 hover:text-red-600" onClick={() => set({ signature: undefined })}>
                    Remove
                  </button>
                )}
              </div>
              <Field label="Name under signature" className="min-w-48 flex-1">
                <input className={inputCls} placeholder={s.businessName || 'Your name'} {...text('signatory')} />
              </Field>
            </div>
            <p className="mt-2 text-xs text-zinc-500">Tip: sign on white paper, take a photo, and upload a tightly cropped PNG.</p>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">Invoice defaults</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Currency" className="sm:col-span-2">
              <select className={inputCls} value={s.currency} onChange={(e) => set({ currency: e.target.value as Currency })}>
                {Object.entries(CURRENCIES).map(([code, c]) => (
                  <option key={code} value={code}>{c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Tax label">
              <input className={inputCls} placeholder="VAT, GST, Tax…" {...text('taxLabel')} />
            </Field>
            <Field label="Default tax rate (%)">
              <input type="number" min={0} step="any" className={inputCls} value={s.taxRate} onChange={(e) => set({ taxRate: Number(e.target.value) })} />
            </Field>
            <Field label="Invoice number prefix">
              <input className={inputCls} {...text('invoicePrefix')} />
            </Field>
            <Field label="Next invoice number">
              <input type="number" min={1} className={inputCls} value={s.nextNumber} onChange={(e) => set({ nextNumber: Number(e.target.value) })} />
            </Field>
            <Field label="Payment due in (days)">
              <input type="number" min={0} className={inputCls} value={s.dueDays} onChange={(e) => set({ dueDays: Number(e.target.value) })} />
            </Field>
            <Field label="Default notes" className="sm:col-span-2">
              <textarea rows={2} className={inputCls} {...text('notes')} />
            </Field>
            <Field label="Default terms" className="sm:col-span-2">
              <textarea rows={2} className={inputCls} {...text('terms')} />
            </Field>
          </div>
          <h3 className="mb-3 mt-6 border-t border-zinc-100 pt-5 text-sm font-semibold text-zinc-900">Proposals</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Number prefix">
              <input className={inputCls} {...text('proposalPrefix')} />
            </Field>
            <Field label="Next number">
              <input type="number" min={1} className={inputCls} value={s.nextProposalNumber} onChange={(e) => set({ nextProposalNumber: Number(e.target.value) })} />
            </Field>
            <Field label="Valid for (days)">
              <input type="number" min={1} className={inputCls} value={s.proposalValidDays} onChange={(e) => set({ proposalValidDays: Number(e.target.value) })} />
            </Field>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-1 font-semibold">Design</h2>
          <p className="mb-5 text-sm text-zinc-500">Choose how your invoices and proposals look. Changes preview instantly.</p>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
            <div className="space-y-5">
              <div>
                <div className="mb-2 text-sm font-medium text-zinc-700">Invoice template</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(Object.entries(TEMPLATES) as Array<[TemplateId, (typeof TEMPLATES)[TemplateId]]>).map(([key, t]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => set({ template: key })}
                      className={`rounded-xl border-2 p-3 text-left transition ${s.template === key ? 'border-blue-600 bg-blue-50/40' : 'border-zinc-200 hover:border-zinc-300'}`}
                    >
                      <TemplateThumb id={key} accent={s.accentColor} />
                      <div className="mt-2 text-sm font-semibold text-zinc-900">{t.label}</div>
                      <div className="text-xs text-zinc-500">{t.description}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Font">
                  <select className={inputCls} value={s.font} onChange={(e) => set({ font: e.target.value as FontId })}>
                    {Object.entries(FONTS).map(([k, f]) => (
                      <option key={k} value={k}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Brand color">
                  <div className="flex items-center gap-2">
                    <input type="color" className="h-10 w-12 cursor-pointer rounded-lg border border-zinc-200" value={s.accentColor} onChange={(e) => set({ accentColor: e.target.value })} />
                    {['#2563eb', '#0f766e', '#7c3aed', '#e11d48', '#ea580c', '#18181b'].map((c) => (
                      <button key={c} type="button" aria-label={`Use ${c}`} onClick={() => set({ accentColor: c })} className="h-6 w-6 rounded-full ring-offset-2 hover:ring-2 hover:ring-zinc-300" style={{ background: c }} />
                    ))}
                  </div>
                </Field>
              </div>
            </div>
            <ScaledFrame>
              <InvoicePreview invoice={sampleInvoice(s)} settings={s} />
            </ScaledFrame>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Payment details</h2>
          <p className="mb-4 text-sm text-zinc-500">Only filled fields are shown on invoices.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bank name"><input className={inputCls} {...pay('bankName')} /></Field>
            <Field label="Account name"><input className={inputCls} {...pay('accountName')} /></Field>
            <Field label="Account number"><input className={inputCls} {...pay('accountNumber')} /></Field>
            <Field label="Branch"><input className={inputCls} {...pay('branch')} /></Field>
            <Field label="Routing number"><input className={inputCls} {...pay('routingNumber')} /></Field>
            <Field label="SWIFT code"><input className={inputCls} {...pay('swift')} /></Field>
            <Field label="bKash"><input className={inputCls} placeholder="01XXXXXXXXX (Personal/Merchant)" {...pay('bkash')} /></Field>
            <Field label="Nagad"><input className={inputCls} {...pay('nagad')} /></Field>
            <Field label="Rocket"><input className={inputCls} {...pay('rocket')} /></Field>
            <Field label="Other instructions" className="sm:col-span-2">
              <textarea rows={2} className={inputCls} placeholder="PayPal, Payoneer, Wise…" {...pay('other')} />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Backup & restore</h2>
          <p className="mb-4 text-sm text-zinc-500">
            Your data is stored only in this browser. Export a backup regularly, and use it to move your data to another device or browser.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportData}>Export backup (.json)</Button>
            <label className="inline-flex cursor-pointer items-center rounded-md border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 shadow-xs hover:bg-zinc-50">
              Import backup…
              <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => importData(e.target.files?.[0])} />
            </label>
          </div>
        </Card>
      </div>
    </>
  )
}

/** Downscales an uploaded logo so it stays small inside IndexedDB and backups. */
function resizeImage(file: File, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Could not read image'))
    img.src = url
  })
}

function sampleInvoice(s: Settings): Invoice {
  const issueDate = todayISO()
  return {
    number: `${s.invoicePrefix}0042`,
    status: 'sent',
    client: { name: 'Rahim Ahmed', company: 'Rahim Traders Ltd.', email: 'rahim@example.com', phone: '', address: 'Gulshan, Dhaka' },
    issueDate,
    dueDate: addDays(issueDate, s.dueDays),
    currency: s.currency,
    items: [
      { id: uid(), description: 'Website design', qty: 1, rate: 25000, taxRate: s.taxRate },
      { id: uid(), description: 'Hosting (1 year)', qty: 1, rate: 4500, taxRate: s.taxRate },
    ],
    discountType: 'percent',
    discountValue: 0,
    notes: s.notes,
    terms: s.terms,
    createdAt: 0,
    updatedAt: 0,
  }
}

function TemplateThumb({ id, accent }: { id: TemplateId; accent: string }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-zinc-200 bg-white p-2">
      {id === 'bold' && <div className="absolute inset-x-0 top-0 h-6" style={{ background: accent }} />}
      {id === 'classic' && <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />}
      <div className="relative mt-1 flex justify-between">
        <div className={`h-2 w-10 rounded ${id === 'bold' ? 'bg-white/80' : 'bg-zinc-800'}`} style={id === 'classic' ? { background: accent } : undefined} />
        <div className={`h-3 w-3 rounded-full ${id === 'bold' ? 'bg-white/70' : ''}`} style={id !== 'bold' ? { background: accent } : undefined} />
      </div>
      <div className={`mt-${id === 'bold' ? '4' : '3'} space-y-1`}>
        <div className="h-1 w-14 rounded bg-zinc-200" />
        <div className="h-1 w-10 rounded bg-zinc-200" />
      </div>
      <div className="mt-2 h-1.5 rounded" style={{ background: id === 'minimal' ? '#f4f4f5' : id === 'classic' ? accent : `${accent}30` }} />
      <div className="mt-1 space-y-1">
        <div className="h-1 rounded bg-zinc-100" />
        <div className="h-1 rounded bg-zinc-100" />
      </div>
      <div className="ml-auto mt-1.5 h-2 w-12 rounded" style={{ background: id === 'minimal' ? '#f4f4f5' : `${accent}40` }} />
    </div>
  )
}
