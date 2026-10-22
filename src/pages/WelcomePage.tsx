import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ImagePlus, Loader2 } from 'lucide-react'
import { db, getSettings, useSettings, type Currency, type Settings } from '../db'
import { CURRENCIES } from '../lib/invoice'
import { resizeImage } from '../lib/image'
import { region } from '../lib/locale'
import { sampleInvoice } from '../lib/sample'
import { InvoicePreview } from '../components/InvoicePreview'
import { FitToWidth } from '../components/doc'
import { SignatureField } from '../components/SignatureField'
import { Button, Field, inputCls } from '../components/ui'

/**
 * First step after creating an account: the details that appear on every invoice and proposal,
 * with a live preview, so nothing goes out as "Your Business".
 */
export default function WelcomePage() {
  const saved = useSettings()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const [s, setS] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (saved && !s) setS(saved)
  }, [saved, s])
  if (!s) return null

  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch })
  const text = (k: 'businessName' | 'email' | 'phone' | 'address' | 'signatory') => ({
    value: s[k] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set({ [k]: e.target.value }),
  })

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!s!.businessName.trim()) return
    setBusy(true)
    // Merge onto the latest copy, in case sync brought in changes meanwhile.
    const latest = await getSettings()
    const { businessName, email, phone, address, signatory, logo, signature, currency } = s!
    const changedCurrency = currency !== latest.currency
    const r = region(currency)
    await db.settings.put({
      ...latest,
      businessName: businessName.trim(),
      email,
      phone,
      address,
      signatory,
      logo,
      signature,
      currency,
      // Picking another currency here also picks that market's usual tax.
      ...(changedCurrency ? { taxLabel: r.taxLabel, taxRate: r.taxRate } : {}),
    })
    navigate(from, { replace: true })
  }

  const preview = { ...s, ...(s.currency !== saved?.currency ? { taxLabel: region(s.currency).taxLabel, taxRate: region(s.currency).taxRate } : {}) }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:py-16">
        <div>
          <img src="/logo.svg" alt="Involet" className="h-8" />
          <p className="mt-10 text-sm font-medium text-blue-600">Welcome to Involet</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Set up your business</h1>
          <p className="mt-2 text-sm text-zinc-500">This appears on every invoice and proposal you send. You can change it any time in Settings.</p>

          <form onSubmit={save} className="mt-8 space-y-5">
            <div className="flex flex-wrap gap-4">
              <ImagePick label="Logo" value={s.logo} onPick={async (f) => set({ logo: await resizeImage(f, 480) })} onClear={() => set({ logo: undefined })} />
              <div>
                <div className="mb-1.5 text-sm font-medium text-zinc-700">Signature</div>
                <SignatureField value={s.signature} name={s.signatory || s.businessName} onChange={(signature) => set({ signature })} />
              </div>
            </div>
            <Field label="Business name *">
              <input className={inputCls} placeholder="Ex. Acme Design Studio" autoFocus required {...text('businessName')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email">
                <input type="email" className={inputCls} placeholder="hello@yourbusiness.com" {...text('email')} />
              </Field>
              <Field label="Phone">
                <input className={inputCls} placeholder={region(s.currency).placeholder.phone} {...text('phone')} />
              </Field>
            </div>
            <Field label="Address">
              <textarea rows={2} className={inputCls} {...text('address')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name under signature">
                <input className={inputCls} placeholder={s.businessName || 'Your name'} {...text('signatory')} />
              </Field>
              <Field label="Currency">
                <select className={inputCls} value={s.currency} onChange={(e) => set({ currency: e.target.value as Currency })}>
                  {Object.entries(CURRENCIES).map(([code, c]) => (
                    <option key={code} value={code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Button type="submit" disabled={busy || !s.businessName.trim()} className="px-5 py-2.5">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save and continue
              </Button>
              <Link to={from} replace className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
                Skip for now
              </Link>
            </div>
          </form>
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-10">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Live preview</p>
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl shadow-zinc-900/5">
              <FitToWidth>
                <InvoicePreview invoice={sampleInvoice(preview)} settings={preview} />
              </FitToWidth>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ImagePick({ label, value, onPick, onClear }: { label: string; value?: string; onPick: (f: File) => void; onClear: () => void }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-zinc-700">{label}</div>
      <div className="flex items-center gap-3">
        <label className="flex h-16 w-32 cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white hover:border-blue-400 hover:bg-blue-50/40">
          {value ? <img src={value} alt={label} className="max-h-14 max-w-28 object-contain" /> : <ImagePlus className="h-5 w-5 text-zinc-400" />}
          <input type="file" accept="image/*" aria-label={`Upload ${label.toLowerCase()}`} className="hidden" onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />
        </label>
        {value && (
          <button type="button" className="text-sm text-zinc-500 hover:text-red-600" onClick={onClear}>
            Remove
          </button>
        )}
      </div>
    </div>
  )
}
