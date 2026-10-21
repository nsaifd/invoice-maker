import type { CoverStyle, FontId, HeadingStyle, Proposal, ProposalTheme, Settings } from '../db'

export const COVERS: Record<CoverStyle, { label: string; description: string }> = {
  classic: { label: 'Classic', description: 'Title in the middle, details at the bottom' },
  band: { label: 'Side band', description: 'Bold color band down the left side' },
  fullbleed: { label: 'Full color', description: 'Whole cover in your brand color' },
  centered: { label: 'Centered', description: 'Symmetrical and refined' },
  gradient: { label: 'Gradient', description: 'Vivid gradient top half' },
  minimal: { label: 'Minimal', description: 'Big type, lots of white space' },
}

export const HEADINGS: Record<HeadingStyle, { label: string }> = {
  bar: { label: 'Accent bar' },
  number: { label: 'Numbered (01, 02…)' },
  underline: { label: 'Underlined' },
  pill: { label: 'Label pill' },
}

export interface ThemePreset extends Omit<ProposalTheme, 'customTemplateId' | 'preset'> {
  id: string
  name: string
}

const t = (id: string, name: string, cover: CoverStyle, heading: HeadingStyle, accent: string, accent2: string, font: FontId, headingFont: FontId = font): ThemePreset => ({
  id,
  name,
  cover,
  heading,
  accent,
  accent2,
  font,
  headingFont,
})

export const THEMES: ThemePreset[] = [
  t('p-classic-blue', 'Classic Blue', 'classic', 'bar', '#2563eb', '#93c5fd', 'jakarta'),
  t('p-classic-ink', 'Ink', 'classic', 'underline', '#18181b', '#a1a1aa', 'inter'),
  t('p-classic-emerald', 'Emerald', 'classic', 'number', '#047857', '#6ee7b7', 'dmsans'),
  t('p-band-navy', 'Navy Band', 'band', 'number', '#1e3a8a', '#60a5fa', 'manrope'),
  t('p-band-plum', 'Plum', 'band', 'bar', '#6b21a8', '#d8b4fe', 'poppins'),
  t('p-band-forest', 'Forest', 'band', 'pill', '#14532d', '#86efac', 'worksans'),
  t('p-full-royal', 'Royal', 'fullbleed', 'number', '#4338ca', '#a5b4fc', 'poppins'),
  t('p-full-noir', 'Noir', 'fullbleed', 'underline', '#0a0a0a', '#a3a3a3', 'spacegrotesk'),
  t('p-full-crimson', 'Crimson', 'fullbleed', 'bar', '#b91c1c', '#fca5a5', 'outfit'),
  t('p-full-teal', 'Lagoon', 'fullbleed', 'pill', '#0f766e', '#5eead4', 'dmsans'),
  t('p-centered-ivory', 'Ivory', 'centered', 'underline', '#78350f', '#d6b98c', 'lora', 'playfair'),
  t('p-centered-midnight', 'Midnight', 'centered', 'number', '#1e293b', '#94a3b8', 'inter', 'libre'),
  t('p-centered-bordeaux', 'Bordeaux', 'centered', 'underline', '#7f1d1d', '#e7c6c6', 'lora', 'merriweather'),
  t('p-gradient-sunset', 'Sunset', 'gradient', 'pill', '#f97316', '#db2777', 'poppins'),
  t('p-gradient-aurora', 'Aurora', 'gradient', 'number', '#06b6d4', '#8b5cf6', 'outfit'),
  t('p-gradient-dusk', 'Dusk', 'gradient', 'bar', '#1e3a8a', '#9333ea', 'spacegrotesk'),
  t('p-minimal-mono', 'Studio', 'minimal', 'number', '#18181b', '#e4e4e7', 'spacegrotesk', 'mono'),
  t('p-minimal-sage', 'Sage', 'minimal', 'underline', '#4f7a55', '#c9dcc8', 'dmsans', 'playfair'),
  t('p-minimal-coral', 'Coral', 'minimal', 'pill', '#e11d48', '#fecdd3', 'jakarta'),
  t('p-band-bangla', 'Bangla', 'band', 'bar', '#006a4e', '#f42a41', 'hind', 'notobn'),
]

export const themeById = (id: string) => THEMES.find((x) => x.id === id)

export function applyTheme(base: ProposalTheme, preset: ThemePreset): ProposalTheme {
  const { id, name: _name, ...rest } = preset
  return { ...base, ...rest, preset: id, customTemplateId: undefined }
}

/** The theme a proposal is rendered with. */
export function themeOf(p: Pick<Proposal, 'theme'>, s: Settings): ProposalTheme {
  return p.theme ?? s.proposalTheme
}
