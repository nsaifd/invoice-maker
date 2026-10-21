import { useLiveQuery } from 'dexie-react-hooks'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Check, RotateCcw, Save } from 'lucide-react'
import { db, styleOf, useSettings, type DocStyle, type FontId, type Invoice, type Settings, type TemplateId } from '../db'
import { FONTS, loadFont } from '../lib/fonts'
import { LAYOUTS, PRESETS, applyPreset, presetById, type Preset } from '../lib/presets'
import { sampleInvoice } from '../lib/sample'
import { InvoicePreview } from '../components/InvoicePreview'
import { FitToWidth, ScaledFrame } from '../components/doc'
import { Button, Field, PageHeader, inputCls } from '../components/ui'

const TITLES = ['Invoice', 'Tax Invoice', 'Bill', 'Cash Memo', 'Receipt', 'Proforma Invoice', 'Quotation']
const SWATCHES = ['#18181b', '#2563eb', '#4338ca', '#7c3aed', '#be185d', '#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#0f766e', '#0284c7', '#006a4e']

export default function TemplatesPage() {
  const settings = useSettings()
  const latest = useLiveQuery(() => db.invoices.orderBy(':id').last(), [])
  const [draft, setDraft] = useState<DocStyle | null>(null)
  const [filter, setFilter] = useState<'all' | TemplateId>('all')
  const [flash, setFlash] = useState('')
  const pick = useCallback((p: Preset) => setDraft((d) => d && applyPreset(d, p)), [])

  useEffect(() => {
    if (settings && !draft) setDraft(styleOf(settings))
  }, [settings, draft])

  // Preview with the user's latest real invoice when there is one.
  const sample: Invoice | null = useMemo(() => (settings ? (latest ? { ...latest, style: undefined } : sampleInvoice(settings)) : null), [settings, latest])

  if (!settings || !draft || !sample) return null

  const saved = styleOf(settings)
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)
  const set = (patch: Partial<DocStyle>) => setDraft({ ...draft, ...patch, preset: patch.preset ?? (Object.keys(patch).some((k) => k !== 'footerText' && k !== 'docTitle') ? 'custom' : draft.preset) })
  const current = presetById(draft.preset)
  const visible = PRESETS.filter((p) => filter === 'all' || p.template === filter)

  async function save() {
    await db.settings.put({ ...settings!, ...draft! })
    setFlash('Saved as your default design')
    setTimeout(() => setFlash(''), 2500)
  }

  return (
    <>
      <PageHeader
        title="Templates"
        subtitle={`${PRESETS.length} ready-made designs across ${Object.keys(LAYOUTS).length} layouts — pick one, then make it yours.`}
        actions={
          <>
            {flash && <span className="text-sm text-emerald-600">{flash}</span>}
            <Button variant="secondary" icon={RotateCcw} disabled={!dirty} onClick={() => setDraft(saved)}>
              Reset
            </Button>
            <Button icon={Save} disabled={!dirty} onClick={save}>
              Save as default
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0">
          <div className="mb-5 flex max-w-full gap-1 overflow-x-auto rounded-lg bg-zinc-100 p-1">
            {(['all', ...Object.keys(LAYOUTS)] as Array<'all' | TemplateId>).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${filter === f ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'}`}
              >
                {f === 'all' ? `All (${PRESETS.length})` : LAYOUTS[f].label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 2xl:grid-cols-4">
            {visible.map((p) => (
              <Thumb key={p.id} preset={p} settings={settings} sample={sample} selected={draft.preset === p.id} onPick={pick} />
            ))}
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4">
          <ScaledFrame
            header={
              <div>
                <div className="text-sm font-semibold text-zinc-900">{current ? current.name : 'Custom design'}</div>
                <div className="text-xs text-zinc-500">
                  {LAYOUTS[draft.template].label} layout · {FONTS[draft.font].label}
                </div>
              </div>
            }
          >
            <InvoicePreview invoice={sample} settings={{ ...settings, ...draft }} />
          </ScaledFrame>

          <div className="space-y-5 rounded-2xl border border-zinc-200 p-5">
            <div className="text-base font-semibold text-zinc-900">Customize</div>

            <Field label="Layout">
              <select className={inputCls} value={draft.template} onChange={(e) => set({ template: e.target.value as TemplateId })}>
                {Object.entries(LAYOUTS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l.label} — {l.description}
                  </option>
                ))}
              </select>
            </Field>

            <ColorField label="Main color" value={draft.accentColor} onChange={(accentColor) => set({ accentColor })} />
            <ColorField label="Second color" value={draft.accent2} onChange={(accent2) => set({ accent2 })} hint="Used for gradients, sidebars, rules and tints" />

            <Field label="Font">
              <FontSelect value={draft.font} onChange={(font) => set({ font })} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Segmented label="Text size" value={draft.textSize} options={[['sm', 'S'], ['md', 'M'], ['lg', 'L']]} onChange={(textSize) => set({ textSize })} />
              <Segmented label="Corners" value={draft.radius} options={[['none', 'Sharp'], ['sm', 'Soft'], ['lg', 'Round']]} onChange={(radius) => set({ radius })} />
            </div>
            <Segmented
              label="Table style"
              value={draft.tableStyle}
              options={[['plain', 'Plain'], ['lines', 'Lines'], ['striped', 'Striped'], ['grid', 'Grid']]}
              onChange={(tableStyle) => set({ tableStyle })}
            />

            <Field label="Document title">
              <div className="flex gap-2">
                <select className={`${inputCls} w-auto`} value={TITLES.includes(draft.docTitle) ? draft.docTitle : ''} onChange={(e) => e.target.value && set({ docTitle: e.target.value })}>
                  {TITLES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                  <option value="">Custom…</option>
                </select>
                <input className={inputCls} value={draft.docTitle} onChange={(e) => set({ docTitle: e.target.value })} />
              </div>
            </Field>

            <div className="space-y-2.5">
              <div className="text-sm font-medium text-zinc-700">Show on invoice</div>
              <Check2 label={`${settings.taxLabel || 'Tax'} column in items table`} checked={draft.showTaxColumn} onChange={(showTaxColumn) => set({ showTaxColumn })} />
              <Check2 label="Amount in words (e.g. “Taka Ten Thousand Only”)" checked={draft.amountInWords} onChange={(amountInWords) => set({ amountInWords })} />
              <Check2 label="Payment details" checked={draft.showPayment} onChange={(showPayment) => set({ showPayment })} />
              <Check2 label="Signature" checked={draft.showSignature} onChange={(showSignature) => set({ showSignature })} />
            </div>

            <Field label="Footer text">
              <input className={inputCls} placeholder="e.g. Trade License: 12345 · BIN: 000123456" value={draft.footerText} onChange={(e) => set({ footerText: e.target.value })} />
            </Field>

            <Button className="w-full" icon={Save} disabled={!dirty} onClick={save}>
              Save as default design
            </Button>
            <p className="text-xs text-zinc-500">Applies to all invoices that use the default design. You can also pick a different design for a single invoice in the invoice editor.</p>
          </div>
        </aside>
      </div>
    </>
  )
}

/** Gallery card. Memoized: thumbnails only depend on the saved settings, not on the draft being edited. */
const Thumb = memo(function Thumb({ preset, settings, sample, selected, onPick }: { preset: Preset; settings: Settings; sample: Invoice; selected: boolean; onPick: (p: Preset) => void }) {
  const style = applyPreset(styleOf(settings), preset)
  return (
    <button type="button" onClick={() => onPick(preset)} className="group text-left">
      <div
        className={`relative aspect-[210/297] overflow-hidden rounded-xl border bg-white transition ${selected ? 'border-blue-600 ring-4 ring-blue-600/15' : 'border-zinc-200 group-hover:border-zinc-300 group-hover:shadow-md'}`}
      >
        <FitToWidth>
          <InvoicePreview invoice={sample} settings={{ ...settings, ...style }} />
        </FitToWidth>
        {selected && (
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow">
            <Check className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ background: `linear-gradient(135deg, ${preset.accent} 50%, ${preset.accent2} 50%)` }} />
        <span className="truncate text-sm font-medium text-zinc-900">{preset.name}</span>
      </div>
      <div className="text-xs text-zinc-500">
        {LAYOUTS[preset.template].label} · {FONTS[preset.font].label.replace(/ \(.*\)/, '')}
      </div>
    </button>
  )
})

function ColorField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-zinc-700">{label}</div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="color" aria-label={label} className="h-9 w-11 cursor-pointer rounded-lg border border-zinc-200" value={value} onChange={(e) => onChange(e.target.value)} />
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Use ${c}`}
            onClick={() => onChange(c)}
            className={`h-6 w-6 rounded-full ring-offset-2 transition hover:scale-110 ${value.toLowerCase() === c ? 'ring-2 ring-zinc-400' : ''}`}
            style={{ background: c }}
          />
        ))}
      </div>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  )
}

export function FontSelect({ value, onChange }: { value: FontId; onChange: (f: FontId) => void }) {
  useEffect(() => {
    // Load every font so the options can be previewed in their own typeface.
    ;(Object.keys(FONTS) as FontId[]).forEach(loadFont)
  }, [])
  const groups = ['Sans', 'Serif', 'Mono', 'Bangla'] as const
  return (
    <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-zinc-200 p-1.5">
      {groups.flatMap((g) =>
        (Object.entries(FONTS) as Array<[FontId, (typeof FONTS)[FontId]]>)
          .filter(([, f]) => f.group === g)
          .map(([id, f]) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`rounded-md px-2.5 py-2 text-left text-sm transition ${value === id ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'hover:bg-zinc-50'}`}
              style={{ fontFamily: `"${f.family}"` }}
            >
              <span className="block truncate">{f.label.replace(/ \(.*\)/, '')}</span>
              <span className="block text-[11px] text-zinc-400" style={{ fontFamily: 'inherit' }}>
                {g === 'Bangla' ? 'আমার সোনার বাংলা' : 'Invoice 1,234.50'}
              </span>
            </button>
          )),
      )}
    </div>
  )
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-zinc-700">{label}</div>
      <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition ${value === v ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

function Check2({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-zinc-700">
      <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
