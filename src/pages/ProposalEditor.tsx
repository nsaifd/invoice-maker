import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Calendar, ChevronDown, ChevronUp, Copy, GripVertical, Hash, Plus, Trash2, X } from 'lucide-react'
import { bumpCounter, db, suggestNumber, useSettings, type Currency, type Product, type Proposal, type ProposalBlock, type Settings } from '../db'
import { CURRENCIES, uid } from '../lib/invoice'
import { BLOCKS, PRESETS, blockTitle, newProposal } from '../lib/proposal'
import { COVERS, THEMES, applyTheme, themeById } from '../lib/proposalThemes'
import { ClientFields, ClientPicker } from '../components/ClientFields'
import { LineItemsEditor, ProductPicker } from '../components/LineItemsEditor'
import { ProposalDocument } from '../components/ProposalDocument'
import { ScaledFrame } from '../components/doc'
import { Button, Field, IconInput, PageHeader, SectionTitle, Toggle, inputCls } from '../components/ui'

const PREVIEW_KEY = 'invoicekit.showPreview'

export default function ProposalEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const clients = useLiveQuery(() => db.clients.orderBy('name').toArray(), []) ?? []
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), []) ?? []
  const uploads = useLiveQuery(() => db.templates.where('kind').equals('proposal').toArray(), []) ?? []
  const [doc, setDoc] = useState<Proposal | null>(null)
  const [saveClient, setSaveClient] = useState(true)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [showPreview, setShowPreview] = useState(() => {
    try {
      return localStorage.getItem(PREVIEW_KEY) !== '0'
    } catch {
      return true
    }
  })
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  useEffect(() => {
    if (!settings || doc) return
    if (id) db.proposals.get(id).then((found) => (found ? setDoc(found) : navigate('/proposals', { replace: true })))
    else {
      const fresh = newProposal(settings)
      setDoc(fresh)
      suggestNumber('proposal').then((number) => setDoc((v) => (v && !v.id && v.number === fresh.number ? { ...v, number } : v)))
    }
  }, [id, settings, doc, navigate])

  if (!settings || !doc) return null

  const set = (patch: Partial<Proposal>) => setDoc((v) => v && { ...v, ...patch })
  const setBlock = (bid: string, patch: Partial<ProposalBlock>) =>
    setDoc((v) => v && { ...v, blocks: v.blocks.map((b) => (b.id === bid ? ({ ...b, ...patch } as ProposalBlock) : b)) })
  const locked = doc.status === 'accepted'

  function togglePreview(v: boolean) {
    setShowPreview(v)
    try {
      localStorage.setItem(PREVIEW_KEY, v ? '1' : '0')
    } catch {
      /* preference only */
    }
  }

  function addBlock(make: (s: Settings) => ProposalBlock) {
    const block = make(settings!)
    set({ blocks: [...doc!.blocks, block] })
    setOpen((o) => ({ ...o, [block.id]: true }))
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return
    const from = doc!.blocks.findIndex((b) => b.id === e.active.id)
    const to = doc!.blocks.findIndex((b) => b.id === e.over!.id)
    set({ blocks: arrayMove(doc!.blocks, from, to) })
  }

  async function save() {
    if (!doc) return
    if (!doc.client.name.trim()) return alert('Please enter the client name.')
    if (!doc.title.trim()) return alert('Please enter a proposal title.')
    setSaving(true)
    let savedId = doc.id
    await db.transaction('rw', db.proposals, db.clients, db.settings, async () => {
      let clientId = doc.clientId
      if (!clientId && saveClient) clientId = await db.clients.add({ ...doc.client, createdAt: Date.now() })
      const record: Proposal = { ...doc, clientId, updatedAt: Date.now() }
      if (doc.id) await db.proposals.put(record)
      else savedId = await db.proposals.add(record)
      await bumpCounter('proposal', record.number)
    })
    navigate(`/proposals/${savedId}`)
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Proposals', to: '/proposals' }, { label: doc.id ? 'Edit Proposal' : 'New Proposal' }]}
        title={doc.id ? `Edit ${doc.number}` : 'New Proposal'}
        subtitle="Build your proposal from blocks — drag the handle to reorder."
        actions={
          <>
            <Toggle label="Show Preview" checked={showPreview} onChange={togglePreview} />
            <Button variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              Save Proposal
            </Button>
          </>
        }
      />

      {locked && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This proposal has been signed by the client. You can still edit your copy, but the shared link stays as it was signed.
        </div>
      )}

      <div className={`grid items-start gap-6 ${showPreview ? 'xl:grid-cols-[minmax(0,1fr)_minmax(0,540px)] 2xl:grid-cols-2' : ''}`}>
        <div className={`min-w-0 space-y-6 ${showPreview ? '' : 'mx-auto w-full max-w-3xl'}`}>
          <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
            <section className="p-6">
              <SectionTitle title="Proposal Details" subtitle="Title, number and validity." />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Title" className="sm:col-span-2">
                  <input className={inputCls} value={doc.title} onChange={(e) => set({ title: e.target.value })} />
                </Field>
                <Field label="Proposal Number">
                  <IconInput icon={Hash} value={doc.number} onChange={(e) => set({ number: e.target.value })} />
                </Field>
                <Field label="Currency">
                  <select className={inputCls} value={doc.currency} onChange={(e) => set({ currency: e.target.value as Currency })}>
                    {Object.entries(CURRENCIES).map(([code, c]) => (
                      <option key={code} value={code}>
                        {c.symbol} {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Date">
                  <IconInput icon={Calendar} type="date" value={doc.date} onChange={(e) => set({ date: e.target.value })} />
                </Field>
                <Field label="Valid Until">
                  <IconInput icon={Calendar} type="date" value={doc.validUntil} onChange={(e) => set({ validUntil: e.target.value })} />
                </Field>
              </div>
            </section>
            <section className="p-6">
              <SectionTitle
                title="Client Details"
                subtitle="Who is this proposal for?"
                action={<ClientPicker clients={clients} clientId={doc.clientId} client={doc.client} onSelect={(clientId, client) => set({ clientId, client })} />}
              />
              <ClientFields value={doc.client} onChange={(client) => set({ client })} />
              {!doc.clientId && (
                <label className="mt-4 flex items-center gap-2 text-sm text-zinc-600">
                  <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={saveClient} onChange={(e) => setSaveClient(e.target.checked)} />
                  Save this client for future documents
                </label>
              )}
            </section>
            <section className="p-6">
              <SectionTitle
                title="Theme"
                subtitle="Use your default theme, or pick one for this proposal."
                action={
                  <Link to="/templates?tab=proposal" className="text-sm font-medium text-blue-600 hover:underline">
                    Browse themes →
                  </Link>
                }
              />
              <select
                className={inputCls}
                value={doc.theme ? (doc.theme.customTemplateId ? `custom:${doc.theme.customTemplateId}` : doc.theme.preset) : ''}
                onChange={(e) => {
                  const v = e.target.value
                  if (!v) return set({ theme: undefined })
                  if (v.startsWith('custom:')) return set({ theme: { ...settings.proposalTheme, preset: 'custom', customTemplateId: v.slice(7) } })
                  const t = themeById(v)
                  if (t) set({ theme: applyTheme(settings.proposalTheme, t) })
                }}
              >
                <option value="">
                  Default theme (
                  {settings.proposalTheme.customTemplateId
                    ? (uploads.find((u) => u.id === settings.proposalTheme.customTemplateId)?.name ?? 'Your design')
                    : (themeById(settings.proposalTheme.preset)?.name ?? 'Custom')}
                  )
                </option>
                {uploads.length > 0 && (
                  <optgroup label="My uploads">
                    {uploads.map((u) => (
                      <option key={u.id} value={`custom:${u.id}`}>
                        {u.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {Object.entries(COVERS).map(([cover, c]) => (
                  <optgroup key={cover} label={`${c.label} cover`}>
                    {THEMES.filter((t) => t.cover === cover).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {doc.theme && !doc.theme.customTemplateId && !themeById(doc.theme.preset) && <option value={doc.theme.preset}>Custom</option>}
              </select>
            </section>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-900">Blocks</h2>
              <button
                type="button"
                className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
                onClick={() => setOpen(Object.fromEntries(doc.blocks.map((b) => [b.id, !doc.blocks.every((x) => open[x.id])])))}
              >
                {doc.blocks.every((b) => open[b.id]) ? 'Collapse all' : 'Expand all'}
              </button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={doc.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {doc.blocks.map((b) => (
                    <SortableBlock
                      key={b.id}
                      block={b}
                      open={!!open[b.id]}
                      onToggle={() => setOpen((o) => ({ ...o, [b.id]: !o[b.id] }))}
                      onRemove={() => confirm(`Remove "${blockTitle(b)}"?`) && set({ blocks: doc.blocks.filter((x) => x.id !== b.id) })}
                      onDuplicate={() => {
                        const copy = { ...structuredClone(b), id: uid() }
                        const i = doc.blocks.findIndex((x) => x.id === b.id)
                        set({ blocks: [...doc.blocks.slice(0, i + 1), copy, ...doc.blocks.slice(i + 1)] })
                      }}
                    >
                      <BlockFields block={b} onChange={(patch) => setBlock(b.id, patch)} settings={settings} currency={doc.currency} products={products} />
                    </SortableBlock>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <AddBlockMenu onAdd={addBlock} />
          </div>
        </div>

        {showPreview && (
          <div className="min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:rounded-2xl">
            <ScaledFrame header={<span className="text-lg font-semibold text-zinc-900">Preview</span>}>
              <ProposalDocument proposal={doc} settings={settings} acceptance={doc.acceptance} />
            </ScaledFrame>
          </div>
        )}
      </div>
    </>
  )
}

function SortableBlock({
  block,
  open,
  onToggle,
  onRemove,
  onDuplicate,
  children,
}: {
  block: ProposalBlock
  open: boolean
  onToggle: () => void
  onRemove: () => void
  onDuplicate: () => void
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const meta = BLOCKS[block.type]
  const Icon = meta.icon
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-2xl border bg-white ${isDragging ? 'relative z-10 border-blue-300 shadow-lg' : 'border-zinc-200'}`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder ${blockTitle(block)}`}
          className="cursor-grab touch-none rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
          <Icon className="h-4 w-4" />
        </span>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold text-zinc-900">{blockTitle(block)}</span>
          <span className="block text-xs text-zinc-500">{meta.label}</span>
        </button>
        <button type="button" aria-label="Duplicate block" onClick={onDuplicate} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
          <Copy className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Remove block" onClick={onRemove} className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600">
          <Trash2 className="h-4 w-4" />
        </button>
        <button type="button" aria-label={open ? 'Collapse' : 'Expand'} onClick={onToggle} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {open && <div className="border-t border-zinc-100 p-4">{children}</div>}
    </div>
  )
}

function BlockFields({
  block: b,
  onChange,
  settings,
  currency,
  products,
}: {
  block: ProposalBlock
  onChange: (patch: Partial<ProposalBlock>) => void
  settings: Settings
  currency: Currency
  products: Product[]
}) {
  const heading = 'heading' in b && (
    <Field label="Heading">
      <input className={inputCls} value={b.heading} onChange={(e) => onChange({ heading: e.target.value })} />
    </Field>
  )
  switch (b.type) {
    case 'cover':
      return (
        <div className="grid gap-4">
          <p className="text-xs text-zinc-500">The cover shows the proposal title, client and dates from Proposal Details.</p>
          <Field label="Subtitle">
            <textarea rows={2} className={inputCls} placeholder="One line about the project" value={b.subtitle} onChange={(e) => onChange({ subtitle: e.target.value })} />
          </Field>
        </div>
      )
    case 'text':
    case 'signature':
      return (
        <div className="grid gap-4">
          {heading}
          <Field label="Text">
            <textarea rows={b.type === 'text' ? 6 : 3} className={inputCls} value={b.body} onChange={(e) => onChange({ body: e.target.value })} />
          </Field>
          <p className="-mt-2 text-xs text-zinc-500">Start a line with "- " to make a bullet point.</p>
        </div>
      )
    case 'scope':
      return (
        <div className="grid gap-4">
          {heading}
          <ListEditor
            items={b.items}
            placeholder="Deliverable"
            onChange={(items) => onChange({ items })}
            addLabel="Add deliverable"
          />
        </div>
      )
    case 'pricing':
      return (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-48 flex-1">{heading}</div>
            <ProductPicker products={products} currency={currency} settings={settings} items={b.items} onAdd={(items) => onChange({ items })} />
          </div>
          <LineItemsEditor value={b} onChange={(patch) => onChange(patch)} currency={currency} settings={settings} totalLabel="Total" />
        </div>
      )
    case 'timeline':
      return (
        <div className="grid gap-4">
          {heading}
          <div className="space-y-3">
            {b.milestones.map((m, i) => (
              <div key={m.id} className="grid gap-2 rounded-xl border border-zinc-200 p-3 sm:grid-cols-[1fr_140px_32px]">
                <input className={inputCls} placeholder="Milestone" value={m.title} onChange={(e) => onChange({ milestones: b.milestones.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                <input className={inputCls} placeholder="When (e.g. Week 2)" value={m.when} onChange={(e) => onChange({ milestones: b.milestones.map((x, j) => (j === i ? { ...x, when: e.target.value } : x)) })} />
                <button
                  type="button"
                  aria-label="Remove milestone"
                  className="flex h-[42px] items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600"
                  onClick={() => onChange({ milestones: b.milestones.filter((_, j) => j !== i) })}
                >
                  <X className="h-4 w-4" />
                </button>
                <input
                  className={`${inputCls} sm:col-span-2`}
                  placeholder="Description (optional)"
                  value={m.description}
                  onChange={(e) => onChange({ milestones: b.milestones.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })}
                />
              </div>
            ))}
          </div>
          <Button variant="secondary" icon={Plus} className="justify-self-start" onClick={() => onChange({ milestones: [...b.milestones, { id: uid(), title: '', when: '', description: '' }] })}>
            Add milestone
          </Button>
        </div>
      )
  }
}

function ListEditor({ items, onChange, placeholder, addLabel }: { items: string[]; onChange: (v: string[]) => void; placeholder: string; addLabel: string }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <input className={inputCls} placeholder={placeholder} value={item} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" aria-label="Remove" className="rounded-lg px-2.5 text-zinc-400 hover:bg-red-50 hover:text-red-600" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button variant="secondary" icon={Plus} onClick={() => onChange([...items, ''])}>
        {addLabel}
      </Button>
    </div>
  )
}

function AddBlockMenu({ onAdd }: { onAdd: (make: (s: Settings) => ProposalBlock) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div ref={ref} className="relative mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 py-3.5 text-sm font-medium text-zinc-600 hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-700"
      >
        <Plus className="h-4 w-4" /> Add block
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 grid gap-1 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl sm:grid-cols-2">
          {PRESETS.map((p) => {
            const Icon = BLOCKS[p.type].icon
            return (
              <button
                key={p.key}
                type="button"
                className="flex items-center gap-3 rounded-xl p-2.5 text-left hover:bg-zinc-50"
                onClick={() => {
                  onAdd(p.make)
                  setOpen(false)
                }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-zinc-900">{p.label}</span>
                  <span className="block text-xs text-zinc-500">{BLOCKS[p.type].description}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
