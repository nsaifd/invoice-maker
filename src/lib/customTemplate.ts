import type { CustomTemplate, FontId, Zone, ZoneType } from '../db'
import { uid } from './invoice'

export const A4 = { w: 210, h: 297 }

type ZoneMeta = { label: string; w: number; h: number; fontSize: number; bold?: boolean; align?: Zone['align']; hint?: string }

export const ZONES: Record<ZoneType, ZoneMeta> = {
  title: { label: 'Document title', w: 70, h: 14, fontSize: 28, bold: true },
  number: { label: 'Invoice number', w: 60, h: 8, fontSize: 12 },
  issueDate: { label: 'Issue date', w: 50, h: 8, fontSize: 12 },
  dueDate: { label: 'Due date', w: 50, h: 8, fontSize: 12 },
  client: { label: 'Client (bill to)', w: 80, h: 30, fontSize: 12 },
  business: { label: 'Your business', w: 80, h: 28, fontSize: 12 },
  items: { label: 'Items table', w: 180, h: 70, fontSize: 11.5, hint: 'Lists every item. Make it tall enough for your longest invoice.' },
  totals: { label: 'Totals', w: 80, h: 30, fontSize: 12, align: 'right' },
  amountDue: { label: 'Amount due (big)', w: 70, h: 14, fontSize: 22, bold: true, align: 'right' },
  words: { label: 'Amount in words', w: 180, h: 8, fontSize: 11 },
  notes: { label: 'Notes', w: 110, h: 16, fontSize: 11 },
  terms: { label: 'Terms', w: 110, h: 14, fontSize: 10 },
  payment: { label: 'Payment details', w: 85, h: 30, fontSize: 11 },
  proposalTitle: { label: 'Proposal title', w: 170, h: 30, fontSize: 36, bold: true },
  subtitle: { label: 'Subtitle', w: 150, h: 14, fontSize: 15 },
  preparedFor: { label: 'Prepared for', w: 80, h: 22, fontSize: 12 },
  preparedBy: { label: 'Prepared by', w: 80, h: 22, fontSize: 12 },
  date: { label: 'Date', w: 50, h: 12, fontSize: 12 },
  validUntil: { label: 'Valid until', w: 50, h: 12, fontSize: 12 },
  proposalNumber: { label: 'Proposal number', w: 50, h: 8, fontSize: 12 },
  proposalTotal: { label: 'Total investment', w: 70, h: 14, fontSize: 20, bold: true },
  logo: { label: 'Logo', w: 40, h: 18, fontSize: 12 },
  signature: { label: 'Signature', w: 60, h: 26, fontSize: 11, align: 'center' },
  text: { label: 'Custom text', w: 80, h: 10, fontSize: 12 },
  cover: { label: 'Hide box', w: 60, h: 12, fontSize: 12, hint: 'Covers sample text in your design. Set its color to match the background.' },
}

export const INVOICE_ZONES: ZoneType[] = ['title', 'number', 'issueDate', 'dueDate', 'client', 'business', 'items', 'totals', 'amountDue', 'words', 'notes', 'terms', 'payment', 'logo', 'signature', 'text', 'cover']
export const COVER_ZONES: ZoneType[] = ['proposalTitle', 'subtitle', 'preparedFor', 'preparedBy', 'date', 'validUntil', 'proposalNumber', 'proposalTotal', 'logo', 'text', 'cover']

export function newZone(type: ZoneType, at: Partial<Zone> = {}, ink = '#18181b'): Zone {
  const m = ZONES[type]
  return {
    id: uid(),
    type,
    x: 15,
    y: 15,
    w: m.w,
    h: m.h,
    fontSize: m.fontSize,
    color: ink,
    align: m.align ?? 'left',
    bold: !!m.bold,
    showLabel: !['title', 'items', 'totals', 'logo', 'signature', 'text', 'cover', 'proposalTitle', 'subtitle', 'amountDue', 'proposalTotal'].includes(type),
    fill: type === 'cover' ? '#ffffff' : undefined,
    text: type === 'text' ? 'Your text' : undefined,
    ...at,
  }
}

/**
 * A sensible starting layout. Most designs keep the header (logo, brand) at the top and the
 * footer at the bottom, so fields go into the middle band; the user then drags them into place.
 */
export function autoPlace(kind: CustomTemplate['kind'], ink: string): Zone[] {
  const z = (type: ZoneType, x: number, y: number, extra: Partial<Zone> = {}) => newZone(type, { x, y, ...extra }, ink)
  if (kind === 'proposal')
    return [
      z('proposalTitle', 20, 110),
      z('subtitle', 20, 142),
      z('preparedFor', 20, 215),
      z('preparedBy', 110, 215),
      z('date', 20, 245),
      z('validUntil', 110, 245),
    ]
  return [
    z('title', 15, 48),
    z('number', 135, 50, { align: 'right' }),
    z('issueDate', 135, 58, { align: 'right' }),
    z('dueDate', 135, 66, { align: 'right' }),
    z('client', 15, 68),
    z('items', 15, 104, { h: 80 }),
    z('totals', 115, 188),
    z('words', 15, 222),
    z('notes', 15, 232),
    z('payment', 15, 250),
    z('signature', 135, 252),
  ]
}

export const DEFAULT_MARGINS = { top: 38, right: 18, bottom: 30, left: 18 }

// ---------- uploads ----------

const MAX_PX = 1240 // A4 at ~150 dpi: sharp in print, small enough to share

async function canvasToDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  // JPEG keeps shared documents small; designs rarely need transparency on a white page.
  return canvas.toDataURL('image/jpeg', 0.86)
}

function drawToA4Canvas(src: CanvasImageSource, sw: number, sh: number, fit: 'stretch' | 'contain'): HTMLCanvasElement {
  const w = MAX_PX
  const h = Math.round((MAX_PX * A4.h) / A4.w)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  if (fit === 'stretch') ctx.drawImage(src, 0, 0, w, h)
  else {
    const scale = Math.min(w / sw, h / sh)
    const dw = sw * scale
    const dh = sh * scale
    ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh)
  }
  return c
}

export interface UploadResult {
  pages: string[]
  /** True when the upload isn't A4-shaped (more than 4% off). */
  mismatched: boolean
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/** Turns an uploaded PNG/JPG/PDF into A4 page images (PDF: up to `maxPages` pages). */
export async function readDesign(file: File, fit: 'stretch' | 'contain' = 'contain', maxPages = 2): Promise<UploadResult> {
  const a4Ratio = A4.h / A4.w
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    // The legacy build includes polyfills, so PDFs also open in older browsers.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
    const pages: string[] = []
    let mismatched = false
    for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
      const page = await pdf.getPage(i)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: (MAX_PX * 1.5) / base.width })
      const c = document.createElement('canvas')
      c.width = Math.round(viewport.width)
      c.height = Math.round(viewport.height)
      await page.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport }).promise
      mismatched ||= Math.abs(c.height / c.width - a4Ratio) / a4Ratio > 0.04
      pages.push(await canvasToDataUrl(drawToA4Canvas(c, c.width, c.height, fit)))
    }
    return { pages, mismatched }
  }
  if (!file.type.startsWith('image/')) throw new Error('Please upload a PNG, JPG or PDF file.')
  const img = await loadImage(file)
  const mismatched = Math.abs(img.naturalHeight / img.naturalWidth - a4Ratio) / a4Ratio > 0.04
  return { pages: [await canvasToDataUrl(drawToA4Canvas(img, img.naturalWidth, img.naturalHeight, fit))], mismatched }
}

/** Average color of the image's top-left corner area: a good default for "Hide" boxes. */
export async function sampleColor(dataUrl: string, xMm: number, yMm: number): Promise<string> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const px = Math.round((xMm / A4.w) * c.width)
  const py = Math.round((yMm / A4.h) * c.height)
  const d = ctx.getImageData(Math.max(0, px - 2), Math.max(0, py - 2), 5, 5).data
  let r = 0
  let g = 0
  let b = 0
  for (let i = 0; i < d.length; i += 4) {
    r += d[i]
    g += d[i + 1]
    b += d[i + 2]
  }
  const n = d.length / 4
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

export function blankTemplate(kind: CustomTemplate['kind'], background: string, font: FontId, accent: string): CustomTemplate {
  const ink = '#18181b'
  return {
    kind,
    name: kind === 'invoice' ? 'My invoice design' : 'My proposal design',
    background,
    zones: autoPlace(kind, ink),
    pageBackground: kind === 'proposal' ? background : undefined,
    margins: kind === 'proposal' ? { ...DEFAULT_MARGINS } : undefined,
    ink,
    font,
    accent,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}
