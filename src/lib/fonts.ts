import { useEffect } from 'react'
import type { FontId } from '../db'

export const FONTS: Record<FontId, { label: string; family: string; weights: string; group: 'Sans' | 'Serif' | 'Mono' | 'Bangla' }> = {
  jakarta: { label: 'Plus Jakarta Sans', family: 'Plus Jakarta Sans', weights: '400;500;600;700;800', group: 'Sans' },
  inter: { label: 'Inter', family: 'Inter', weights: '400;500;600;700;800', group: 'Sans' },
  poppins: { label: 'Poppins', family: 'Poppins', weights: '400;500;600;700;800', group: 'Sans' },
  manrope: { label: 'Manrope', family: 'Manrope', weights: '400;500;600;700;800', group: 'Sans' },
  dmsans: { label: 'DM Sans', family: 'DM Sans', weights: '400;500;600;700;800', group: 'Sans' },
  outfit: { label: 'Outfit', family: 'Outfit', weights: '400;500;600;700;800', group: 'Sans' },
  spacegrotesk: { label: 'Space Grotesk', family: 'Space Grotesk', weights: '400;500;600;700', group: 'Sans' },
  plex: { label: 'IBM Plex Sans', family: 'IBM Plex Sans', weights: '400;500;600;700', group: 'Sans' },
  worksans: { label: 'Work Sans', family: 'Work Sans', weights: '400;500;600;700;800', group: 'Sans' },
  lora: { label: 'Lora', family: 'Lora', weights: '400;500;600;700', group: 'Serif' },
  playfair: { label: 'Playfair Display', family: 'Playfair Display', weights: '400;500;600;700;800', group: 'Serif' },
  merriweather: { label: 'Merriweather', family: 'Merriweather', weights: '400;700;900', group: 'Serif' },
  libre: { label: 'Libre Baskerville', family: 'Libre Baskerville', weights: '400;700', group: 'Serif' },
  mono: { label: 'JetBrains Mono', family: 'JetBrains Mono', weights: '400;500;600;700;800', group: 'Mono' },
  hind: { label: 'Hind Siliguri (বাংলা)', family: 'Hind Siliguri', weights: '400;500;600;700', group: 'Bangla' },
  notobn: { label: 'Noto Sans Bengali (বাংলা)', family: 'Noto Sans Bengali', weights: '400;500;600;700;800', group: 'Bangla' },
}

const FALLBACK = { Sans: 'ui-sans-serif, system-ui, sans-serif', Serif: 'Georgia, serif', Mono: 'ui-monospace, monospace', Bangla: 'ui-sans-serif, system-ui, sans-serif' }

/** Injects the Google Fonts stylesheet for a font the first time it's needed. */
export function loadFont(id: FontId) {
  const f = FONTS[id]
  if (!f || typeof document === 'undefined') return
  const key = `font-${id}`
  if (document.getElementById(key)) return
  const link = document.createElement('link')
  link.id = key
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:wght@${f.weights}&display=swap`
  document.head.appendChild(link)
}

export function fontStack(id: FontId): string {
  const f = FONTS[id] ?? FONTS.jakarta
  return `"${f.family}", ${FALLBACK[f.group]}`
}

export function useFont(id: FontId) {
  useEffect(() => loadFont(id), [id])
  return fontStack(id)
}
