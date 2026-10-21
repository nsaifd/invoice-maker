import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Copy,
  Eye,
  EyeOff,
  FileImage,
  Grid3x3,
  ImagePlus,
  Pipette,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react'
import { db, useSettings, type CustomTemplate, type FontId, type Invoice, type Proposal, type Settings, type Zone, type ZoneType } from '../db'
import { A4, DEFAULT_MARGINS, ZONES, autoPlace, blankTemplate, newZone, readDesign, sampleColor } from '../lib/customTemplate'
import { FONTS, fontStack, loadFont } from '../lib/fonts'
import { uid } from '../lib/invoice'
import { newProposal } from '../lib/proposal'
import { sampleInvoice } from '../lib/sample'
import { ZoneContent, zoneBox, type ZoneData } from '../components/CustomDesign'
import { ProposalDocument } from '../components/ProposalDocument'
import { FitToWidth } from '../components/doc'
import { Button, Field, inputCls } from '../components/ui'

const ZONE_GROUPS: Record<'invoice' | 'proposal', Array<{ title: string; types: ZoneType[] }>> = {
  invoice: [
    { title: 'Details', types: ['title', 'number', 'issueDate', 'dueDate', 'client', 'business'] },
    { title: 'Money', types: ['items', 'totals', 'amountDue', 'words', 'payment'] },
    { title: 'Text & more', types: ['notes', 'terms', 'logo', 'signature', 'text', 'cover'] },
  ],
  proposal: [
    { title: 'Cover details', types: ['proposalTitle', 'subtitle', 'preparedFor', 'preparedBy', 'date', 'validUntil', 'proposalNumber', 'proposalTotal'] },
    { title: 'Text & more', types: ['logo', 'text', 'cover'] },
  ],
}

export default function TemplateDesigner() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const kind = (params.get('kind') === 'proposal' ? 'proposal' : 'invoice') as CustomTemplate['kind']
  const latestInvoice = useLiveQuery(() => db.invoices.orderBy(':id').last().then((x) => x ?? null), [])
  const latestProposal = useLiveQuery(() => db.proposals.orderBy(':id').last().then((x) => x ?? null), [])
  const [tpl, setTpl] = useState<CustomTemplate | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [savedJson, setSavedJson] = useState('')

  useEffect(() => {
    if (!id) return setLoaded(true)
    db.templates.get(Number(id)).then((t) => {
      if (!t) return navigate('/templates?tab=mine', { replace: true })
      setTpl(t)
      setSavedJson(JSON.stringify(t))
      setLoaded(true)
    })
  }, [id, navigate])

  if (!settings || !loaded || latestInvoice === undefined || latestProposal === undefined) return null
  if (!tpl) return <UploadStep kind={kind} settings={settings} onReady={(t) => setTpl(t)} />
  return <Designer tpl={tpl} setTpl={setTpl} settings={settings} latestInvoice={latestInvoice} latestProposal={latestProposal} savedJson={savedJson} onSaved={setSavedJson} />
}

// ---------- step 1: upload ----------

function UploadStep({ kind, settings, onReady }: { kind: CustomTemplate['kind']; settings: Settings; onReady: (t: CustomTemplate) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const accent = kind === 'invoice' ? settings.accentColor : settings.proposalTheme.accent

  async function handle(file?: File) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const { pages } = await readDesign(file, 'contain', kind === 'proposal' ? 2 : 1)
      const t = blankTemplate(kind, pages[0], settings.font, accent)
      t.name = file.name.replace(/\.[^.]+$/, '').slice(0, 60) || t.name
      // A two-page PDF for a proposal: page 1 is the cover, page 2 the letterhead.
      if (kind === 'proposal') t.pageBackground = pages[1] ?? pages[0]
      onReady(t)
    } catch (e) {
      setError((e as Error).message || 'Could not read that file.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl py-6">
      <Link to="/templates?tab=mine" className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> Templates
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-[28px]">Use your own {kind} design</h1>
      <p className="mt-1 text-zinc-500">
        Upload a design you made in Canva, Figma, Photoshop or Word. We place live fields on top — prices, items and totals stay editable and always add up.
      </p>

      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          handle(e.dataTransfer.files[0])
        }}
        className={`mt-8 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition ${
          drag ? 'border-blue-500 bg-blue-50' : 'border-zinc-300 bg-white hover:border-blue-400 hover:bg-blue-50/40'
        }`}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          {busy ? <Sparkles className="h-7 w-7 animate-pulse" /> : <Upload className="h-7 w-7" />}
        </span>
        <span className="mt-4 text-base font-semibold text-zinc-900">{busy ? 'Reading your design…' : 'Drop your design here, or click to choose'}</span>
        <span className="mt-1 text-sm text-zinc-500">PDF, PNG or JPG · A4 portrait works best</span>
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" disabled={busy} onChange={(e) => handle(e.target.files?.[0])} />
      </label>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {(kind === 'invoice'
          ? [
              ['1', 'Design with space', 'Keep your logo, colors and footer. Leave empty space where the details and items go.'],
              ['2', 'Export as PDF or PNG', 'A4 size. If your design has sample text, you can hide it with “Hide boxes”.'],
              ['3', 'Place the fields', 'We auto-place them; drag and resize to fit your design. Save, and every invoice uses it.'],
            ]
          : [
              ['1', 'Cover + letterhead', 'Page 1 of a PDF becomes the cover, page 2 the letterhead for content pages.'],
              ['2', 'Or a single image', 'One image is used for both. You can replace either one later.'],
              ['3', 'Set the safe area', 'Tell us where text may go on content pages so it never covers your header or footer.'],
            ]
        ).map(([n, t, d]) => (
          <div key={n} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">{n}</span>
            <div className="mt-3 text-sm font-semibold text-zinc-900">{t}</div>
            <p className="mt-1 text-sm text-zinc-500">{d}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- step 2: designer ----------

function Designer({
  tpl,
  setTpl,
  settings,
  latestInvoice,
  latestProposal,
  savedJson,
  onSaved,
}: {
  tpl: CustomTemplate
  setTpl: (t: CustomTemplate) => void
  settings: Settings
  latestInvoice: Invoice | null
  latestProposal: Proposal | null
  savedJson: string
  onSaved: (json: string) => void
}) {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string | null>(null)
  const [snap, setSnap] = useState(true)
  const [showGuides, setShowGuides] = useState(true)
  const [face, setFace] = useState<'cover' | 'pages'>('cover')
  const [flash, setFlash] = useState('')
  const [preview, setPreview] = useState(false)
  const isProposal = tpl.kind === 'proposal'
  const dirty = JSON.stringify(tpl) !== savedJson
  const zone = tpl.zones.find((z) => z.id === selected) ?? null

  const data: ZoneData = useMemo(() => {
    if (isProposal) {
      const p = latestProposal ?? { ...newProposal(settings), title: 'Website Redesign Proposal', client: { name: 'Rahim Ahmed', company: 'Rahim Traders Ltd.', email: 'rahim@example.com', phone: '', address: '' } }
      return { s: settings, proposal: p }
    }
    return { s: settings, invoice: latestInvoice ? { ...latestInvoice, style: undefined } : sampleInvoice(settings) }
  }, [isProposal, latestInvoice, latestProposal, settings])

  const update = useCallback((patch: Partial<CustomTemplate>) => setTpl({ ...tpl, ...patch, updatedAt: Date.now() }), [tpl, setTpl])
  const updateZone = useCallback((zid: string, patch: Partial<Zone>) => update({ zones: tpl.zones.map((z) => (z.id === zid ? { ...z, ...patch } : z)) }), [tpl, update])

  function addZone(type: ZoneType) {
    const z = newZone(type, { x: (A4.w - ZONES[type].w) / 2, y: 120 }, tpl.ink)
    update({ zones: [...tpl.zones, z] })
    setSelected(z.id)
  }

  function removeZone(zid: string) {
    update({ zones: tpl.zones.filter((z) => z.id !== zid) })
    setSelected(null)
  }

  function duplicateZone(zid: string) {
    const z = tpl.zones.find((x) => x.id === zid)
    if (!z) return
    const copy = { ...z, id: uid(), x: Math.min(z.x + 5, A4.w - z.w), y: Math.min(z.y + 5, A4.h - z.h) }
    update({ zones: [...tpl.zones, copy] })
    setSelected(copy.id)
  }

  // Keyboard: arrows nudge, Delete removes, Ctrl/Cmd+D duplicates, Esc deselects.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (!zone) return
      const step = e.shiftKey ? 5 : 1
      const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
      if (move[e.key]) {
        e.preventDefault()
        const [dx, dy] = move[e.key]
        updateZone(zone.id, { x: clamp(zone.x + dx, 0, A4.w - zone.w), y: clamp(zone.y + dy, 0, A4.h - zone.h) })
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        removeZone(zone.id)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateZone(zone.id)
      } else if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function save(asDefault: boolean) {
    const record = { ...tpl, updatedAt: Date.now() }
    const newId = await db.transaction('rw', db.templates, db.settings, async () => {
      const tid = (await db.templates.put(record)) as number
      if (asDefault) {
        const s = await db.settings.get('default')
        if (s) {
          if (isProposal) await db.settings.put({ ...s, proposalTheme: { ...settings.proposalTheme, ...s.proposalTheme, preset: 'custom', customTemplateId: tid } })
          else await db.settings.put({ ...s, template: 'custom', preset: 'custom', customTemplateId: tid })
        } else {
          await db.settings.put(
            isProposal
              ? { ...settings, proposalTheme: { ...settings.proposalTheme, preset: 'custom', customTemplateId: tid } }
              : { ...settings, template: 'custom', preset: 'custom', customTemplateId: tid },
          )
        }
      }
      return tid
    })
    const saved = { ...record, id: newId }
    setTpl(saved)
    onSaved(JSON.stringify(saved))
    setFlash(asDefault ? `Saved — now your default ${tpl.kind} design` : 'Saved')
    setTimeout(() => setFlash(''), 2500)
    if (!tpl.id) navigate(`/templates/design/${newId}`, { replace: true })
  }

  async function replaceImage(file: File | undefined, which: 'background' | 'pageBackground') {
    if (!file) return
    try {
      const { pages } = await readDesign(file, 'contain', 1)
      update({ [which]: pages[0] })
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const onCover = !isProposal || face === 'cover'

  return (
    <div className="-mx-4 -my-6 sm:-mx-8 sm:-my-8">
      {/* top bar */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:rounded-t-2xl">
        <Link to="/templates?tab=mine" className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" aria-label="Back to templates">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <input
          aria-label="Design name"
          className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-base font-semibold text-zinc-900 hover:border-zinc-200 focus:border-blue-500 focus:outline-none sm:max-w-xs"
          value={tpl.name}
          onChange={(e) => update({ name: e.target.value })}
        />
        <span className="hidden rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium capitalize text-zinc-600 sm:inline">{tpl.kind}</span>
        {isProposal && (
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm">
            {(['cover', 'pages'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFace(f)
                  setSelected(null)
                }}
                className={`rounded-md px-3 py-1 font-medium ${face === f ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500'}`}
              >
                {f === 'cover' ? 'Cover page' : 'Content pages'}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {flash && <span className="hidden text-sm text-emerald-600 sm:inline">{flash}</span>}
          <Button variant="secondary" icon={preview ? EyeOff : Eye} onClick={() => setPreview((v) => !v)}>
            <span className="hidden sm:inline">{preview ? 'Edit' : 'Preview'}</span>
          </Button>
          <Button variant="secondary" icon={Save} onClick={() => save(false)} disabled={!dirty && !!tpl.id}>
            Save
          </Button>
          <Button icon={Sparkles} onClick={() => save(true)}>
            <span className="hidden sm:inline">Save & use as default</span>
            <span className="sm:hidden">Use</span>
          </Button>
        </div>
      </div>

      {preview ? (
        <div className="bg-zinc-100 px-4 py-8">
          <div className="mx-auto max-w-[210mm] space-y-6">
            <p className="text-center text-sm text-zinc-500">Preview with {isProposal ? (latestProposal ? 'your latest proposal' : 'sample data') : latestInvoice ? 'your latest invoice' : 'sample data'}</p>
            <FitToWidth>
              <div className="shadow-lg">
                {isProposal ? (
                  <ProposalDocument proposal={data.proposal!} settings={{ ...settings, proposalTheme: { ...settings.proposalTheme, customTemplateId: -1 } }} customTemplate={tpl} />
                ) : (
                  <PreviewInvoice tpl={tpl} data={data} />
                )}
              </div>
            </FitToWidth>
          </div>
        </div>
      ) : (
        <div className="grid min-h-[calc(100vh-8rem)] lg:grid-cols-[250px_minmax(0,1fr)_290px]">
          {/* left: fields */}
          <aside className="border-b border-zinc-200 p-4 lg:border-b-0 lg:border-r">
            {onCover ? (
              <>
                {ZONE_GROUPS[tpl.kind].map((g) => (
                  <div key={g.title} className="mb-5">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{g.title}</div>
                    <div className="flex flex-wrap gap-1.5 lg:flex-col">
                      {g.types.map((t) => {
                        const placed = tpl.zones.some((z) => z.type === t)
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => addZone(t)}
                            className="flex items-center gap-2 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-left text-sm text-zinc-700 hover:border-blue-300 hover:bg-blue-50/50"
                          >
                            <Plus className="h-3.5 w-3.5 text-zinc-400" />
                            <span className="flex-1">{ZONES[t].label}</span>
                            {placed && t !== 'text' && t !== 'cover' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="On the page" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Replace all fields with the automatic layout?')) update({ zones: autoPlace(tpl.kind, tpl.ink) })
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
                >
                  <Wand2 className="h-4 w-4" /> Auto-place fields
                </button>
              </>
            ) : (
              <div className="space-y-3 text-sm text-zinc-600">
                <div className="font-semibold text-zinc-900">Content pages</div>
                <p>Your proposal sections flow across as many pages as needed, on top of this letterhead.</p>
                <p>
                  Drag the <span className="font-medium text-blue-600">blue safe area</span> edges so text never covers your header, footer or side graphics.
                </p>
              </div>
            )}
          </aside>

          {/* center: canvas */}
          <main className="min-w-0 bg-zinc-100 px-4 py-6 sm:px-8">
            <div className="mx-auto mb-3 flex max-w-[210mm] items-center justify-between text-xs text-zinc-500">
              <span>{onCover ? 'Click a field to edit · drag to move · corners to resize · arrows to nudge' : 'Drag the edges of the safe area'}</span>
              <div className="flex gap-1">
                <IconToggle on={snap} onClick={() => setSnap((v) => !v)} label="Snap to grid" icon={<Grid3x3 className="h-4 w-4" />} />
                <IconToggle on={showGuides} onClick={() => setShowGuides((v) => !v)} label="Show field outlines" icon={<Eye className="h-4 w-4" />} />
              </div>
            </div>
            <FitToWidth>
              {onCover ? (
                <Canvas tpl={tpl} data={data} selected={selected} onSelect={setSelected} onChange={updateZone} snap={snap} guides={showGuides} />
              ) : (
                <MarginCanvas tpl={tpl} onChange={(margins) => update({ margins })} snap={snap} data={data} />
              )}
            </FitToWidth>
          </main>

          {/* right: properties */}
          <aside className="space-y-5 border-t border-zinc-200 p-4 lg:border-l lg:border-t-0">
            {zone && onCover ? (
              <ZoneProps
                zone={zone}
                tpl={tpl}
                onChange={(patch) => updateZone(zone.id, patch)}
                onRemove={() => removeZone(zone.id)}
                onDuplicate={() => duplicateZone(zone.id)}
              />
            ) : (
              <TemplateProps tpl={tpl} face={onCover ? 'cover' : 'pages'} onChange={update} onReplace={replaceImage} />
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

function PreviewInvoice({ tpl, data }: { tpl: CustomTemplate; data: ZoneData }) {
  loadFont(tpl.font)
  return (
    <div className="relative bg-white" style={{ width: '210mm', height: '297mm', fontFamily: fontStack(tpl.font), color: tpl.ink }}>
      <img src={tpl.background} alt="" className="absolute inset-0 h-full w-full" />
      {tpl.zones.map((z) => (
        <div key={z.id} className="absolute overflow-hidden" style={zoneBox(z, tpl)}>
          <ZoneContent zone={z} data={data} template={tpl} />
        </div>
      ))}
    </div>
  )
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)
const snapTo = (v: number, on: boolean) => (on ? Math.round(v) : Math.round(v * 10) / 10)

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** The A4 page with the uploaded design and draggable, resizable fields. */
function Canvas({
  tpl,
  data,
  selected,
  onSelect,
  onChange,
  snap,
  guides,
}: {
  tpl: CustomTemplate
  data: ZoneData
  selected: string | null
  onSelect: (id: string | null) => void
  onChange: (id: string, patch: Partial<Zone>) => void
  snap: boolean
  guides: boolean
}) {
  const pageRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; handle: Handle; startX: number; startY: number; orig: Zone; mmPerPx: number } | null>(null)
  loadFont(tpl.font)

  function start(e: React.PointerEvent, z: Zone, handle: Handle) {
    e.stopPropagation()
    e.preventDefault()
    onSelect(z.id)
    const rect = pageRef.current!.getBoundingClientRect()
    drag.current = { id: z.id, handle, startX: e.clientX, startY: e.clientY, orig: z, mmPerPx: A4.w / rect.width }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function move(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.startX) * d.mmPerPx
    const dy = (e.clientY - d.startY) * d.mmPerPx
    const o = d.orig
    const MIN = 4
    let { x, y, w, h } = o
    if (d.handle === 'move') {
      x = clamp(snapTo(o.x + dx, snap), 0, A4.w - o.w)
      y = clamp(snapTo(o.y + dy, snap), 0, A4.h - o.h)
    } else {
      if (d.handle.includes('e')) w = clamp(snapTo(o.w + dx, snap), MIN, A4.w - o.x)
      if (d.handle.includes('s')) h = clamp(snapTo(o.h + dy, snap), MIN, A4.h - o.y)
      if (d.handle.includes('w')) {
        const nx = clamp(snapTo(o.x + dx, snap), 0, o.x + o.w - MIN)
        w = o.w + (o.x - nx)
        x = nx
      }
      if (d.handle.includes('n')) {
        const ny = clamp(snapTo(o.y + dy, snap), 0, o.y + o.h - MIN)
        h = o.h + (o.y - ny)
        y = ny
      }
    }
    onChange(d.id, { x, y, w, h })
  }

  return (
    <div
      ref={pageRef}
      className="relative touch-none select-none overflow-hidden bg-white shadow-lg"
      style={{ width: '210mm', height: '297mm', fontFamily: fontStack(tpl.font), color: tpl.ink }}
      onPointerDown={() => onSelect(null)}
      onPointerMove={move}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <img src={tpl.background} alt="" className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />
      {tpl.zones.map((z) => (
        <ZoneFrame key={z.id} zone={z} tpl={tpl} data={data} selected={z.id === selected} guides={guides} onStart={start} />
      ))}
    </div>
  )
}

function ZoneFrame({
  zone: z,
  tpl,
  data,
  selected,
  guides,
  onStart,
}: {
  zone: Zone
  tpl: CustomTemplate
  data: ZoneData
  selected: boolean
  guides: boolean
  onStart: (e: React.PointerEvent, z: Zone, h: Handle) => void
}) {
  const inner = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState(false)
  useLayoutEffect(() => {
    const el = inner.current
    if (el) setOverflow(el.scrollHeight > el.clientHeight + 2)
  })
  const outline = selected ? '2px solid #2563eb' : overflow ? '1.5px solid #dc2626' : guides ? '1px dashed rgba(37,99,235,0.55)' : '1px solid transparent'
  return (
    <div className="group absolute" style={{ left: `${z.x}mm`, top: `${z.y}mm`, width: `${z.w}mm`, height: `${z.h}mm`, zIndex: selected ? 20 : z.type === 'cover' ? 1 : 2 }}>
      <div ref={inner} className="absolute inset-0 cursor-move overflow-hidden" style={{ ...zoneBox(z, tpl), left: 0, top: 0, outline, outlineOffset: 0 }} onPointerDown={(e) => onStart(e, z, 'move')}>
        <ZoneContent zone={z} data={data} template={tpl} />
      </div>
      {(selected || overflow) && (
        <span className={`pointer-events-none absolute -top-5 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${overflow ? 'bg-red-600' : 'bg-blue-600'}`}>
          {ZONES[z.type].label}
          {overflow ? ' · too small for its content' : ''}
        </span>
      )}
      {selected &&
        (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as Handle[]).map((h) => (
          <span
            key={h}
            onPointerDown={(e) => onStart(e, z, h)}
            className="absolute z-30 h-2.5 w-2.5 rounded-sm border-2 border-blue-600 bg-white"
            style={{
              left: h.includes('w') ? -5 : h.includes('e') ? 'calc(100% - 5px)' : 'calc(50% - 5px)',
              top: h.includes('n') ? -5 : h.includes('s') ? 'calc(100% - 5px)' : 'calc(50% - 5px)',
              cursor: `${h}-resize`,
            }}
          />
        ))}
    </div>
  )
}

/** Letterhead with a draggable safe area for proposal content pages. */
function MarginCanvas({ tpl, onChange, snap, data }: { tpl: CustomTemplate; onChange: (m: NonNullable<CustomTemplate['margins']>) => void; snap: boolean; data: ZoneData }) {
  const m = tpl.margins ?? DEFAULT_MARGINS
  const pageRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ edge: keyof typeof m; start: number; orig: number; mmPerPx: number } | null>(null)
  function start(e: React.PointerEvent, edge: keyof typeof m) {
    e.preventDefault()
    const rect = pageRef.current!.getBoundingClientRect()
    drag.current = { edge, start: edge === 'top' || edge === 'bottom' ? e.clientY : e.clientX, orig: m[edge], mmPerPx: A4.w / rect.width }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  function move(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const pos = d.edge === 'top' || d.edge === 'bottom' ? e.clientY : e.clientX
    const delta = (pos - d.start) * d.mmPerPx * (d.edge === 'bottom' || d.edge === 'right' ? -1 : 1)
    const max = d.edge === 'top' || d.edge === 'bottom' ? 120 : 70
    onChange({ ...m, [d.edge]: clamp(snapTo(d.orig + delta, snap), 5, max) })
  }
  const sample = data.proposal?.blocks.find((b) => b.type === 'text')
  return (
    <div
      ref={pageRef}
      className="relative touch-none select-none overflow-hidden bg-white shadow-lg"
      style={{ width: '210mm', height: '297mm', fontFamily: fontStack(tpl.font), color: tpl.ink }}
      onPointerMove={move}
      onPointerUp={() => (drag.current = null)}
    >
      {tpl.pageBackground ? (
        <img src={tpl.pageBackground} alt="" className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-300">No letterhead — plain white pages</div>
      )}
      <div className="absolute border-2 border-blue-500 bg-blue-500/5" style={{ left: `${m.left}mm`, top: `${m.top}mm`, right: `${m.right}mm`, bottom: `${m.bottom}mm` }}>
        <div className="p-3 text-[13px] leading-relaxed opacity-60">
          <div className="mb-2 text-[20px] font-bold">{sample && 'heading' in sample ? sample.heading : 'About Us'}</div>
          {Array.from({ length: 14 }, (_, i) => (
            <div key={i} className="mb-2 h-2.5 rounded bg-current opacity-20" style={{ width: `${70 + ((i * 37) % 30)}%` }} />
          ))}
        </div>
        {(['top', 'bottom', 'left', 'right'] as const).map((edge) => (
          <span
            key={edge}
            onPointerDown={(e) => start(e, edge)}
            className="absolute flex items-center justify-center"
            style={{
              ...(edge === 'top' ? { top: -6, left: 0, right: 0, height: 12, cursor: 'ns-resize' } : {}),
              ...(edge === 'bottom' ? { bottom: -6, left: 0, right: 0, height: 12, cursor: 'ns-resize' } : {}),
              ...(edge === 'left' ? { left: -6, top: 0, bottom: 0, width: 12, cursor: 'ew-resize' } : {}),
              ...(edge === 'right' ? { right: -6, top: 0, bottom: 0, width: 12, cursor: 'ew-resize' } : {}),
            }}
          >
            <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white">{Math.round(m[edge])}mm</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function IconToggle({ on, onClick, label, icon }: { on: boolean; onClick: () => void; label: string; icon: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={on} onClick={onClick} className={`rounded-md p-1.5 ${on ? 'bg-white text-blue-600 shadow-xs' : 'text-zinc-400 hover:text-zinc-700'}`}>
      {icon}
    </button>
  )
}

function ZoneProps({ zone: z, tpl, onChange, onRemove, onDuplicate }: { zone: Zone; tpl: CustomTemplate; onChange: (p: Partial<Zone>) => void; onRemove: () => void; onDuplicate: () => void }) {
  const meta = ZONES[z.type]
  const isCover = z.type === 'cover'
  const [busy, setBusy] = useState(false)
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-zinc-900">{meta.label}</div>
          {meta.hint && <p className="mt-0.5 text-xs text-zinc-500">{meta.hint}</p>}
        </div>
        <div className="flex gap-1">
          <button type="button" aria-label="Duplicate field" onClick={onDuplicate} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <Copy className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Remove field" onClick={onRemove} className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {z.type === 'text' && (
        <Field label="Text">
          <textarea rows={3} className={inputCls} value={z.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} />
        </Field>
      )}

      {isCover ? (
        <div>
          <div className="mb-1.5 text-sm font-medium text-zinc-700">Fill color</div>
          <div className="flex items-center gap-2">
            <input type="color" aria-label="Fill color" className="h-9 w-11 cursor-pointer rounded-lg border border-zinc-200" value={z.fill ?? '#ffffff'} onChange={(e) => onChange({ fill: e.target.value })} />
            <Button
              variant="secondary"
              icon={Pipette}
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                // Sample just outside the box's top-left corner, where the plain background usually is.
                onChange({ fill: await sampleColor(tpl.background, Math.max(0, z.x - 1.5), Math.max(0, z.y - 1.5)) })
                setBusy(false)
              }}
            >
              Match background
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Text size">
              <input type="number" min={6} max={96} step={0.5} className={inputCls} value={z.fontSize} onChange={(e) => onChange({ fontSize: Number(e.target.value) || 12 })} />
            </Field>
            <div>
              <div className="mb-1.5 text-sm font-medium text-zinc-700">Color</div>
              <input type="color" aria-label="Text color" className="h-[42px] w-full cursor-pointer rounded-lg border border-zinc-200" value={z.color} onChange={(e) => onChange({ color: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-1">
            {(
              [
                ['left', AlignLeft],
                ['center', AlignCenter],
                ['right', AlignRight],
              ] as const
            ).map(([a, Icon]) => (
              <button
                key={a}
                type="button"
                aria-label={`Align ${a}`}
                onClick={() => onChange({ align: a })}
                className={`flex flex-1 justify-center rounded-md py-1.5 ${z.align === a ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500'}`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
            <button
              type="button"
              aria-label="Bold"
              aria-pressed={z.bold}
              onClick={() => onChange({ bold: !z.bold })}
              className={`flex flex-1 justify-center rounded-md py-1.5 ${z.bold ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500'}`}
            >
              <Bold className="h-4 w-4" />
            </button>
          </div>
          <Field label="Font">
            <select className={inputCls} value={z.font ?? ''} onChange={(e) => onChange({ font: (e.target.value || undefined) as FontId | undefined })}>
              <option value="">Same as design ({FONTS[tpl.font].label})</option>
              {(Object.entries(FONTS) as Array<[FontId, (typeof FONTS)[FontId]]>).map(([k, f]) => (
                <option key={k} value={k}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          {!['title', 'items', 'totals', 'logo', 'signature', 'text', 'proposalTitle', 'subtitle', 'words'].includes(z.type) && (
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={z.showLabel} onChange={(e) => onChange({ showLabel: e.target.checked })} />
              Show label (e.g. “Bill to”)
            </label>
          )}
          {z.type === 'items' && (
            <div>
              <div className="mb-1.5 text-sm font-medium text-zinc-700">Table header color</div>
              <input type="color" aria-label="Table header color" className="h-9 w-full cursor-pointer rounded-lg border border-zinc-200" value={z.fill ?? tpl.accent} onChange={(e) => onChange({ fill: e.target.value })} />
            </div>
          )}
        </>
      )}

      <div>
        <div className="mb-1.5 text-sm font-medium text-zinc-700">Position & size (mm)</div>
        <div className="grid grid-cols-4 gap-2">
          {(['x', 'y', 'w', 'h'] as const).map((k) => (
            <label key={k} className="text-center text-[11px] uppercase text-zinc-400">
              <input
                type="number"
                step={0.5}
                className={`${inputCls} px-1.5 py-1.5 text-center`}
                value={Math.round(z[k] * 10) / 10}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (Number.isNaN(v)) return
                  const limits = { x: [0, A4.w - z.w], y: [0, A4.h - z.h], w: [4, A4.w - z.x], h: [4, A4.h - z.y] }[k]
                  onChange({ [k]: clamp(v, limits[0], limits[1]) })
                }}
              />
              {k}
            </label>
          ))}
        </div>
      </div>
    </>
  )
}

function TemplateProps({
  tpl,
  face,
  onChange,
  onReplace,
}: {
  tpl: CustomTemplate
  face: 'cover' | 'pages'
  onChange: (p: Partial<CustomTemplate>) => void
  onReplace: (file: File | undefined, which: 'background' | 'pageBackground') => void
}) {
  const m = tpl.margins ?? DEFAULT_MARGINS
  return (
    <>
      <div>
        <div className="text-sm font-semibold text-zinc-900">Design settings</div>
        <p className="mt-0.5 text-xs text-zinc-500">Select a field on the page to edit it.</p>
      </div>
      <div className="space-y-2">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
          <ImagePlus className="h-4 w-4" /> Replace {face === 'pages' ? 'letterhead' : tpl.kind === 'proposal' ? 'cover image' : 'design'}
          <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onReplace(e.target.files?.[0], face === 'pages' ? 'pageBackground' : 'background')} />
        </label>
        {face === 'pages' && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" icon={FileImage} onClick={() => onChange({ pageBackground: tpl.background })}>
              Use cover
            </Button>
            <Button variant="secondary" onClick={() => onChange({ pageBackground: undefined })}>
              Plain white
            </Button>
          </div>
        )}
      </div>
      {face === 'pages' && (
        <div>
          <div className="mb-1.5 text-sm font-medium text-zinc-700">Safe area (mm from edge)</div>
          <div className="grid grid-cols-4 gap-2">
            {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
              <label key={k} className="text-center text-[11px] capitalize text-zinc-400">
                <input
                  type="number"
                  min={5}
                  max={120}
                  className={`${inputCls} px-1.5 py-1.5 text-center`}
                  value={Math.round(m[k])}
                  onChange={(e) => onChange({ margins: { ...m, [k]: clamp(Number(e.target.value) || 5, 5, 120) } })}
                />
                {k}
              </label>
            ))}
          </div>
        </div>
      )}
      <Field label="Font">
        <select className={inputCls} value={tpl.font} onChange={(e) => onChange({ font: e.target.value as FontId })}>
          {(Object.entries(FONTS) as Array<[FontId, (typeof FONTS)[FontId]]>).map(([k, f]) => (
            <option key={k} value={k}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1.5 text-sm font-medium text-zinc-700">{face === 'pages' ? 'Content text' : 'Field text'}</div>
          {face === 'pages' ? (
            <input
              type="color"
              aria-label="Content text color"
              className="h-9 w-full cursor-pointer rounded-lg border border-zinc-200"
              value={tpl.pageInk ?? '#3f3f46'}
              onChange={(e) => onChange({ pageInk: e.target.value })}
            />
          ) : (
            <input
              type="color"
              aria-label="Text color"
              className="h-9 w-full cursor-pointer rounded-lg border border-zinc-200"
              value={tpl.ink}
              onChange={(e) => onChange({ ink: e.target.value, zones: tpl.zones.map((z) => (z.color === tpl.ink ? { ...z, color: e.target.value } : z)) })}
            />
          )}
        </div>
        <div>
          <div className="mb-1.5 text-sm font-medium text-zinc-700">Accent</div>
          <input type="color" aria-label="Accent color" className="h-9 w-full cursor-pointer rounded-lg border border-zinc-200" value={tpl.accent} onChange={(e) => onChange({ accent: e.target.value })} />
        </div>
      </div>
      <div className="rounded-xl bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-500">
        <b className="text-zinc-700">Tips</b>
        <br />• Red outline = the field is too small for its content.
        <br />• Sample text in your design? Add a <b>Hide box</b> and click <b>Match background</b>.
        <br />• Make the items table tall enough for your longest invoice.
      </div>
    </>
  )
}
