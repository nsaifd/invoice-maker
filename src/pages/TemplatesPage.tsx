import { useLiveQuery } from 'dexie-react-hooks'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, Copy, FileSignature, FileText, PenTool, RotateCcw, Save, Star, Trash2, Upload } from 'lucide-react'
import { db, styleOf, useSettings, type CoverStyle, type CustomTemplate, type DocStyle, type FontId, type HeadingStyle, type Invoice, type Proposal, type ProposalTheme, type Settings, type TemplateId } from '../db'
import { newProposal } from '../lib/proposal'
import { COVERS, HEADINGS, THEMES, applyTheme, themeById, type ThemePreset } from '../lib/proposalThemes'
import { ProposalDocument } from '../components/ProposalDocument'
import { FONTS, loadFont } from '../lib/fonts'
import { LAYOUTS, PRESETS, applyPreset, layoutLabel, presetById, type BuiltInLayout, type Preset } from '../lib/presets'
import { sampleInvoice } from '../lib/sample'
import { InvoicePreview } from '../components/InvoicePreview'
import { FitToWidth, ScaledFrame } from '../components/doc'
import { Button, Field, PageHeader, inputCls } from '../components/ui'

const TITLES = ['Invoice', 'Tax Invoice', 'Bill', 'Cash Memo', 'Receipt', 'Proforma Invoice', 'Quotation']
const SWATCHES = ['#18181b', '#2563eb', '#4338ca', '#7c3aed', '#be185d', '#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#0f766e', '#0284c7', '#006a4e']

function InvoiceDesigns({ settings }: { settings: Settings }) {
  const customs = useLiveQuery(() => db.templates.where('kind').equals('invoice').toArray(), []) ?? []
  const latest = useLiveQuery(() => db.invoices.orderBy(':id').last(), [])
  const [draft, setDraft] = useState<DocStyle | null>(null)
  const [filter, setFilter] = useState<'all' | BuiltInLayout>('all')
  const [flash, setFlash] = useState('')
  const pick = useCallback((p: Preset) => setDraft((d) => d && applyPreset(d, p)), [])

  useEffect(() => {
    if (settings && !draft) setDraft(styleOf(settings))
  }, [settings, draft])

  // Preview with the user's latest real invoice when there is one.
  const sample: Invoice | null = useMemo(() => (settings ? (latest ? { ...latest, style: undefined } : sampleInvoice(settings)) : null), [settings, latest])

  if (!draft || !sample) return null

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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {PRESETS.length} ready-made designs across {Object.keys(LAYOUTS).length} layouts — or upload your own.
        </p>
        <div className="flex items-center gap-2">
          {flash && <span className="text-sm text-emerald-600">{flash}</span>}
          <Button variant="secondary" icon={RotateCcw} disabled={!dirty} onClick={() => setDraft(saved)}>
            Reset
          </Button>
          <Button icon={Save} disabled={!dirty} onClick={save}>
            Save as default
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0">
          <div className="mb-5 flex max-w-full gap-1 overflow-x-auto rounded-lg bg-zinc-100 p-1">
            {(['all', ...Object.keys(LAYOUTS)] as Array<'all' | BuiltInLayout>).map((f) => (
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
            {filter === 'all' && (
              <>
                <UploadCard kind="invoice" />
                {customs.map((t) => (
                  <CustomThumb
                    key={t.id}
                    t={t}
                    selected={draft.template === 'custom' && draft.customTemplateId === t.id}
                    onPick={() => setDraft({ ...draft, template: 'custom', preset: 'custom', customTemplateId: t.id })}
                  />
                ))}
              </>
            )}
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
                  {layoutLabel(draft.template)} layout · {FONTS[draft.font].label}
                </div>
              </div>
            }
          >
            <InvoicePreview invoice={sample} settings={{ ...settings, ...draft }} />
          </ScaledFrame>

          {draft.template === 'custom' ? (
            <div className="space-y-3 rounded-2xl border border-zinc-200 p-5">
              <div className="text-base font-semibold text-zinc-900">Your uploaded design</div>
              <p className="text-sm text-zinc-500">Fields, colors and positions are set in the designer. Prices, items and totals come from each invoice.</p>
              {draft.customTemplateId && (
                <Link to={`/templates/design/${draft.customTemplateId}`} className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                  <PenTool className="h-4 w-4" /> Edit this design
                </Link>
              )}
              <Check2 label={`${settings.taxLabel || 'Tax'} column in items table`} checked={draft.showTaxColumn} onChange={(showTaxColumn) => set({ showTaxColumn, preset: 'custom' })} />
              <Button className="w-full" icon={Save} disabled={!dirty} onClick={save}>
                Save as default design
              </Button>
            </div>
          ) : (
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
          )}
        </aside>
      </div>
    </>
  )
}

/** Gallery card. Memoized: thumbnails only depend on the saved settings, not on the draft being edited. */
const Thumb = memo(function Thumb({ preset, settings, sample, selected, onPick }: { preset: Preset; settings: Settings; sample: Invoice; selected: boolean; onPick: (p: Preset) => void }) {
  const style = applyPreset(styleOf(settings), preset)
  return (
    <button type="button" onClick={() => onPick(preset)} className="group min-w-0 text-left">
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

// ---------- page shell with tabs ----------

const TABS = [
  { key: 'invoice', label: 'Invoice designs', icon: FileText },
  { key: 'proposal', label: 'Proposal themes', icon: FileSignature },
  { key: 'mine', label: 'My uploads', icon: Upload },
] as const

export default function TemplatesPage() {
  const settings = useSettings()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'invoice') as (typeof TABS)[number]['key']
  if (!settings) return null
  return (
    <>
      <PageHeader title="Templates" subtitle="Choose how your invoices and proposals look — or upload your own design." />
      <div className="mb-6 flex max-w-full gap-1 overflow-x-auto border-b border-zinc-200">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setParams({ tab: key }, { replace: true })}
            className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {tab === 'invoice' && <InvoiceDesigns settings={settings} />}
      {tab === 'proposal' && <ProposalThemes settings={settings} />}
      {tab === 'mine' && <MyDesigns settings={settings} />}
    </>
  )
}

function UploadCard({ kind }: { kind: CustomTemplate['kind'] }) {
  return (
    <Link to={`/templates/design/new?kind=${kind}`} className="group min-w-0 text-left">
      <div className="flex aspect-[210/297] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-300 bg-white p-4 text-center transition group-hover:border-blue-400 group-hover:bg-blue-50/40">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Upload className="h-5 w-5" />
        </span>
        <span className="text-sm font-semibold text-zinc-900">Upload your design</span>
        <span className="text-xs text-zinc-500">PDF, PNG or JPG from Canva, Figma, Word…</span>
      </div>
      <div className="mt-2 text-sm font-medium text-zinc-900">Your own design</div>
      <div className="text-xs text-zinc-500">We add live, editable fields</div>
    </Link>
  )
}

function CustomThumb({ t, selected, onPick }: { t: CustomTemplate; selected: boolean; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} className="group min-w-0 text-left">
      <div
        className={`relative aspect-[210/297] overflow-hidden rounded-xl border bg-white transition ${selected ? 'border-blue-600 ring-4 ring-blue-600/15' : 'border-zinc-200 group-hover:border-zinc-300 group-hover:shadow-md'}`}
      >
        <img src={t.background} alt="" className="h-full w-full object-cover" />
        <span className="absolute left-2 top-2 rounded-full bg-zinc-900/80 px-2 py-0.5 text-[10px] font-medium text-white">Uploaded</span>
        {selected && (
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow">
            <Check className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="mt-2 truncate text-sm font-medium text-zinc-900">{t.name}</div>
      <div className="text-xs text-zinc-500">{t.zones.length} fields</div>
    </button>
  )
}

// ---------- proposal themes ----------

function sampleProposal(s: Settings, latest?: Proposal | null): Proposal {
  if (latest) return { ...latest, theme: undefined }
  const p = newProposal(s)
  return {
    ...p,
    title: 'E-commerce Website Redesign',
    client: { name: 'Rahim Ahmed', company: 'Rahim Traders Ltd.', email: 'rahim@example.com', phone: '', address: '' },
    blocks: p.blocks.map((b) => (b.type === 'cover' ? { ...b, subtitle: 'A faster, mobile-first store that turns visitors into customers.' } : b.type === 'pricing' ? { ...b, items: [{ ...b.items[0], description: 'Design & development', rate: 120000 }] } : b)),
  }
}

const ProposalThumb = memo(function ProposalThumb({ theme, settings, proposal, selected, onPick }: { theme: ThemePreset; settings: Settings; proposal: Proposal; selected: boolean; onPick: (t: ThemePreset) => void }) {
  const cover = useMemo(() => ({ ...proposal, blocks: proposal.blocks.filter((b) => b.type === 'cover'), theme: applyTheme(settings.proposalTheme, theme) }), [proposal, settings.proposalTheme, theme])
  return (
    <button type="button" onClick={() => onPick(theme)} className="group min-w-0 text-left">
      <div
        className={`relative aspect-[210/297] overflow-hidden rounded-xl border bg-white transition ${selected ? 'border-blue-600 ring-4 ring-blue-600/15' : 'border-zinc-200 group-hover:border-zinc-300 group-hover:shadow-md'}`}
      >
        <FitToWidth>
          <ProposalDocument proposal={cover} settings={settings} />
        </FitToWidth>
        {selected && (
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow">
            <Check className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ background: `linear-gradient(135deg, ${theme.accent} 50%, ${theme.accent2} 50%)` }} />
        <span className="truncate text-sm font-medium text-zinc-900">{theme.name}</span>
      </div>
      <div className="text-xs text-zinc-500">
        {COVERS[theme.cover].label} · {HEADINGS[theme.heading].label}
      </div>
    </button>
  )
})

function ProposalThemes({ settings }: { settings: Settings }) {
  const latest = useLiveQuery(() => db.proposals.orderBy(':id').last().then((x) => x ?? null), [])
  const customs = useLiveQuery(() => db.templates.where('kind').equals('proposal').toArray(), []) ?? []
  const [draft, setDraft] = useState<ProposalTheme>(settings.proposalTheme)
  const [flash, setFlash] = useState('')
  const pick = useCallback((t: ThemePreset) => setDraft((d) => applyTheme(d, t)), [])
  const sample = useMemo(() => (latest === undefined ? null : sampleProposal(settings, latest)), [settings, latest])
  if (!sample) return null

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.proposalTheme)
  const set = (patch: Partial<ProposalTheme>) => setDraft({ ...draft, ...patch, preset: 'custom' })
  const preview = { ...sample, theme: draft }

  async function save() {
    await db.settings.put({ ...settings, proposalTheme: draft })
    setFlash('Saved as your default proposal theme')
    setTimeout(() => setFlash(''), 2500)
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">{THEMES.length} themes with different covers, headings, colors and fonts.</p>
        <div className="flex items-center gap-2">
          {flash && <span className="text-sm text-emerald-600">{flash}</span>}
          <Button variant="secondary" icon={RotateCcw} disabled={!dirty} onClick={() => setDraft(settings.proposalTheme)}>
            Reset
          </Button>
          <Button icon={Save} disabled={!dirty} onClick={save}>
            Save as default
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 2xl:grid-cols-4">
          <UploadCard kind="proposal" />
          {customs.map((t) => (
            <CustomThumb key={t.id} t={t} selected={draft.customTemplateId === t.id} onPick={() => setDraft({ ...draft, preset: 'custom', customTemplateId: t.id })} />
          ))}
          {THEMES.map((t) => (
            <ProposalThumb key={t.id} theme={t} settings={settings} proposal={sample} selected={draft.preset === t.id && !draft.customTemplateId} onPick={pick} />
          ))}
        </div>
        <aside className="space-y-4 xl:sticky xl:top-4">
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
            <div className="border-b border-zinc-200 bg-white px-5 py-3.5">
              <div className="text-sm font-semibold text-zinc-900">{draft.customTemplateId ? 'Your uploaded design' : (themeById(draft.preset)?.name ?? 'Custom theme')}</div>
              <div className="text-xs text-zinc-500">Scroll to see the inside pages</div>
            </div>
            <div className="max-h-[520px] overflow-y-auto p-4">
              <FitToWidth>
                <div className="shadow-md">
                  <ProposalDocument proposal={preview} settings={settings} />
                </div>
              </FitToWidth>
            </div>
          </div>

          {draft.customTemplateId ? (
            <div className="space-y-3 rounded-2xl border border-zinc-200 p-5">
              <p className="text-sm text-zinc-500">Your cover and letterhead come from your upload. Section headings, colors and fonts below still apply to the content.</p>
              <Link to={`/templates/design/${draft.customTemplateId}`} className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                <PenTool className="h-4 w-4" /> Edit this design
              </Link>
            </div>
          ) : null}

          <div className="space-y-5 rounded-2xl border border-zinc-200 p-5">
            <div className="text-base font-semibold text-zinc-900">Customize</div>
            {!draft.customTemplateId && (
              <Field label="Cover style">
                <select className={inputCls} value={draft.cover} onChange={(e) => set({ cover: e.target.value as CoverStyle })}>
                  {Object.entries(COVERS).map(([k, c]) => (
                    <option key={k} value={k}>
                      {c.label} — {c.description}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Segmented
              label="Section headings"
              value={draft.heading}
              options={Object.entries(HEADINGS).map(([k, h]) => [k as HeadingStyle, h.label.replace(/ \(.*\)/, '')])}
              onChange={(heading) => set({ heading })}
            />
            <ColorField label="Main color" value={draft.accent} onChange={(accent) => set({ accent })} />
            <ColorField label="Second color" value={draft.accent2} onChange={(accent2) => set({ accent2 })} />
            <Field label="Heading font">
              <FontSelect value={draft.headingFont} onChange={(headingFont) => set({ headingFont })} />
            </Field>
            <Field label="Body font">
              <FontSelect value={draft.font} onChange={(font) => set({ font })} />
            </Field>
            <Button className="w-full" icon={Save} disabled={!dirty} onClick={save}>
              Save as default theme
            </Button>
            <p className="text-xs text-zinc-500">You can also choose a different theme for a single proposal in the proposal editor.</p>
          </div>
        </aside>
      </div>
    </>
  )
}

// ---------- my uploads ----------

function MyDesigns({ settings }: { settings: Settings }) {
  const templates = useLiveQuery(() => db.templates.orderBy(':id').reverse().toArray(), [])
  if (!templates) return null
  const isDefault = (t: CustomTemplate) =>
    t.kind === 'invoice' ? settings.template === 'custom' && settings.customTemplateId === t.id : settings.proposalTheme.customTemplateId === t.id

  async function makeDefault(t: CustomTemplate) {
    if (t.kind === 'invoice') await db.settings.put({ ...settings, template: 'custom', preset: 'custom', customTemplateId: t.id })
    else await db.settings.put({ ...settings, proposalTheme: { ...settings.proposalTheme, preset: 'custom', customTemplateId: t.id } })
  }

  async function remove(t: CustomTemplate) {
    const used = await db.invoices.filter((i) => i.style?.customTemplateId === t.id).count()
    if (!confirm(`Delete “${t.name}”?${used ? ` ${used} invoice(s) use it and will switch to a built-in design.` : ''}`)) return
    await db.transaction('rw', db.templates, db.settings, async () => {
      await db.templates.delete(t.id!)
      if (isDefault(t)) {
        if (t.kind === 'invoice') await db.settings.put({ ...settings, template: 'minimal', preset: 'minimal-ink', customTemplateId: undefined })
        else await db.settings.put({ ...settings, proposalTheme: { ...settings.proposalTheme, customTemplateId: undefined } })
      }
    })
  }

  async function duplicate(t: CustomTemplate) {
    await db.templates.add({ ...structuredClone(t), id: undefined, name: `${t.name} (copy)`, createdAt: Date.now(), updatedAt: Date.now() })
  }

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        {(['invoice', 'proposal'] as const).map((k) => (
          <Link
            key={k}
            to={`/templates/design/new?kind=${k}`}
            className="flex items-center gap-4 rounded-2xl border-2 border-dashed border-zinc-300 p-5 transition hover:border-blue-400 hover:bg-blue-50/40"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Upload className="h-6 w-6" />
            </span>
            <span>
              <span className="block font-semibold text-zinc-900">Upload {k === 'invoice' ? 'an invoice' : 'a proposal'} design</span>
              <span className="block text-sm text-zinc-500">{k === 'invoice' ? 'Your own layout — we add live items, totals and dates.' : 'Your cover and letterhead — content flows across pages.'}</span>
            </span>
          </Link>
        ))}
      </div>
      {templates.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 py-14 text-center text-sm text-zinc-500">No uploaded designs yet.</div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {templates.map((t) => (
            <div key={t.id} className="min-w-0">
              <Link to={`/templates/design/${t.id}`} className="relative block aspect-[210/297] overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:shadow-md">
                <img src={t.background} alt="" className="h-full w-full object-cover" />
                <span className="absolute left-2 top-2 rounded-full bg-zinc-900/80 px-2 py-0.5 text-[10px] font-medium capitalize text-white">{t.kind}</span>
                {isDefault(t) && (
                  <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
                    <Star className="h-3 w-3" /> Default
                  </span>
                )}
              </Link>
              <div className="mt-2 truncate text-sm font-medium text-zinc-900">{t.name}</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <Link to={`/templates/design/${t.id}`} className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                  Edit
                </Link>
                {!isDefault(t) && (
                  <button type="button" onClick={() => makeDefault(t)} className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                    Set default
                  </button>
                )}
                <button type="button" aria-label="Duplicate" onClick={() => duplicate(t)} className="rounded-md border border-zinc-200 px-2 py-1 text-zinc-500 hover:bg-zinc-50">
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Delete" onClick={() => remove(t)} className="rounded-md border border-zinc-200 px-2 py-1 text-zinc-500 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
