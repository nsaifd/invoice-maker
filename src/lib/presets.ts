import type { DocStyle, FontId, TemplateId } from '../db'

export const LAYOUTS: Record<TemplateId, { label: string; description: string }> = {
  minimal: { label: 'Minimal', description: 'Clean, airy and neutral' },
  classic: { label: 'Classic', description: 'Brand bar and colored table header' },
  bold: { label: 'Bold', description: 'Full brand-color header band' },
  sidebar: { label: 'Sidebar', description: 'Colored side panel with your details' },
  split: { label: 'Split', description: 'Two-tone header block' },
  elegant: { label: 'Elegant', description: 'Centered, refined, great with serif fonts' },
  cards: { label: 'Cards', description: 'Soft tinted page with rounded cards' },
  receipt: { label: 'Receipt', description: 'Compact shop-style receipt' },
  corporate: { label: 'Corporate', description: 'Boxed, bordered, formal tax invoice' },
  gradient: { label: 'Gradient', description: 'Vivid gradient header' },
}

export interface Preset {
  id: string
  name: string
  template: TemplateId
  accent: string
  accent2: string
  font: FontId
  table: DocStyle['tableStyle']
  radius: DocStyle['radius']
  title?: string
}

const p = (id: string, name: string, template: TemplateId, accent: string, accent2: string, font: FontId, table: Preset['table'], radius: Preset['radius'], title?: string): Preset => ({
  id,
  name,
  template,
  accent,
  accent2,
  font,
  table,
  radius,
  title,
})

export const PRESETS: Preset[] = [
  p('minimal-ink', 'Ink', 'minimal', '#18181b', '#a1a1aa', 'jakarta', 'lines', 'sm'),
  p('minimal-azure', 'Azure', 'minimal', '#2563eb', '#93c5fd', 'inter', 'lines', 'sm'),
  p('minimal-sage', 'Sage', 'minimal', '#4f7a55', '#c9dcc8', 'dmsans', 'plain', 'lg'),
  p('minimal-blush', 'Blush', 'minimal', '#be185d', '#fbcfe8', 'outfit', 'striped', 'lg'),

  p('classic-blue', 'Classic Blue', 'classic', '#1d4ed8', '#dbeafe', 'jakarta', 'lines', 'sm'),
  p('classic-emerald', 'Emerald', 'classic', '#047857', '#d1fae5', 'plex', 'striped', 'sm'),
  p('classic-crimson', 'Crimson', 'classic', '#b91c1c', '#fee2e2', 'worksans', 'lines', 'none'),
  p('classic-slate', 'Slate', 'classic', '#334155', '#e2e8f0', 'manrope', 'grid', 'none'),

  p('bold-royal', 'Royal', 'bold', '#4338ca', '#c7d2fe', 'poppins', 'striped', 'lg'),
  p('bold-tangerine', 'Tangerine', 'bold', '#ea580c', '#fed7aa', 'outfit', 'lines', 'lg'),
  p('bold-lagoon', 'Lagoon', 'bold', '#0f766e', '#99f6e4', 'manrope', 'striped', 'sm'),
  p('bold-noir', 'Noir', 'bold', '#0a0a0a', '#a3a3a3', 'spacegrotesk', 'lines', 'none'),

  p('sidebar-navy', 'Navy Panel', 'sidebar', '#1e3a8a', '#60a5fa', 'jakarta', 'lines', 'sm'),
  p('sidebar-forest', 'Forest', 'sidebar', '#14532d', '#4ade80', 'dmsans', 'striped', 'sm'),
  p('sidebar-plum', 'Plum', 'sidebar', '#581c87', '#d8b4fe', 'poppins', 'lines', 'lg'),
  p('sidebar-charcoal', 'Charcoal', 'sidebar', '#27272a', '#f59e0b', 'inter', 'plain', 'none'),

  p('split-ocean', 'Ocean', 'split', '#0369a1', '#38bdf8', 'poppins', 'striped', 'lg'),
  p('split-coral', 'Coral', 'split', '#e11d48', '#fda4af', 'outfit', 'lines', 'lg'),
  p('split-olive', 'Olive', 'split', '#3f6212', '#bef264', 'worksans', 'lines', 'sm'),

  p('elegant-ivory', 'Ivory', 'elegant', '#78350f', '#d6b98c', 'playfair', 'lines', 'none'),
  p('elegant-midnight', 'Midnight', 'elegant', '#1e293b', '#94a3b8', 'lora', 'lines', 'none'),
  p('elegant-bordeaux', 'Bordeaux', 'elegant', '#7f1d1d', '#e7c6c6', 'libre', 'lines', 'none'),
  p('elegant-gilded', 'Gilded', 'elegant', '#92400e', '#fcd34d', 'merriweather', 'plain', 'none'),

  p('cards-lavender', 'Lavender', 'cards', '#7c3aed', '#f3efff', 'jakarta', 'plain', 'lg'),
  p('cards-mint', 'Mint', 'cards', '#059669', '#ecfdf5', 'dmsans', 'plain', 'lg'),
  p('cards-sky', 'Sky', 'cards', '#0284c7', '#eff8ff', 'outfit', 'striped', 'lg'),

  p('receipt-mono', 'Receipt', 'receipt', '#18181b', '#a1a1aa', 'mono', 'plain', 'none', 'Cash Memo'),
  p('receipt-shop', 'Shop Receipt', 'receipt', '#c2410c', '#fdba74', 'mono', 'plain', 'sm', 'Receipt'),

  p('corporate-steel', 'Corporate', 'corporate', '#1e40af', '#1e3a8a', 'plex', 'grid', 'none', 'Tax Invoice'),
  p('corporate-bangladesh', 'Bangladesh', 'corporate', '#006a4e', '#f42a41', 'hind', 'grid', 'none', 'Tax Invoice'),
  p('corporate-graphite', 'Graphite', 'corporate', '#3f3f46', '#18181b', 'inter', 'grid', 'none'),

  p('gradient-sunset', 'Sunset', 'gradient', '#f97316', '#db2777', 'poppins', 'striped', 'lg'),
  p('gradient-aurora', 'Aurora', 'gradient', '#06b6d4', '#8b5cf6', 'outfit', 'lines', 'lg'),
  p('gradient-dusk', 'Dusk', 'gradient', '#1e3a8a', '#9333ea', 'spacegrotesk', 'lines', 'lg'),
  p('gradient-citrus', 'Citrus', 'gradient', '#16a34a', '#eab308', 'dmsans', 'striped', 'lg'),
  p('gradient-bangla', 'Bangla Modern', 'gradient', '#006a4e', '#10b981', 'notobn', 'lines', 'lg'),
]

export const presetById = (id: string) => PRESETS.find((x) => x.id === id)

/** Applies a preset's look while keeping the user's content choices (toggles, footer, title unless the preset sets one). */
export function applyPreset(base: DocStyle, preset: Preset): DocStyle {
  return {
    ...base,
    preset: preset.id,
    template: preset.template,
    accentColor: preset.accent,
    accent2: preset.accent2,
    font: preset.font,
    tableStyle: preset.table,
    radius: preset.radius,
    docTitle: preset.title ?? (['Cash Memo', 'Receipt', 'Tax Invoice'].includes(base.docTitle) ? 'Invoice' : base.docTitle),
  }
}
