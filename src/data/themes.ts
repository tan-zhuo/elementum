import type { Locale } from '../types/element'

export type ThemeKey = 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose' | 'graphite'

/**
 * The accent themes offered in the header. The palettes themselves live in
 * `src/index.css` under `[data-theme=...]`; this list only carries what the picker
 * needs to draw itself, with `swatch` matching that theme's `--accent`.
 */
export const THEMES: { key: ThemeKey; zh: string; en: string; swatch: string }[] = [
  { key: 'cyan', zh: '深空青', en: 'Deep space', swatch: '#22d3ee' },
  { key: 'violet', zh: '紫晶', en: 'Amethyst', swatch: '#a78bfa' },
  { key: 'emerald', zh: '翡翠', en: 'Emerald', swatch: '#34d399' },
  { key: 'amber', zh: '琥珀', en: 'Amber', swatch: '#fbbf24' },
  { key: 'rose', zh: '玫瑰', en: 'Rose', swatch: '#fb7185' },
  { key: 'graphite', zh: '石墨', en: 'Graphite', swatch: '#94a3b8' },
]

export const DEFAULT_THEME: ThemeKey = 'cyan'

export function themeName(key: ThemeKey, locale: Locale): string {
  const theme = THEMES.find((t) => t.key === key) ?? THEMES[0]
  return locale === 'zh' ? theme.zh : theme.en
}

export function themeSwatch(key: ThemeKey): string {
  return (THEMES.find((t) => t.key === key) ?? THEMES[0]).swatch
}
