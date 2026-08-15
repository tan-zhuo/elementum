import type { Element, HeatmapKey, Locale } from '../types/element'
import raw from './elements.json'

// The JSON is generated and validated by scripts/build-data.mjs, so the structural
// widening TypeScript infers from the literal (string vs. CategoryKey) is not worth
// re-proving here.
export const ELEMENTS = raw as unknown as Element[]

/** Index by atomic number for O(1) lookup; atomic numbers are 1-based. */
const BY_NUMBER = new Map(ELEMENTS.map((el) => [el.number, el]))

const BY_SYMBOL = new Map(ELEMENTS.map((el) => [el.symbol, el]))

export function getElement(number: number): Element | undefined {
  return BY_NUMBER.get(number)
}

export function getElementBySymbol(symbol: string): Element | undefined {
  return BY_SYMBOL.get(symbol)
}

/** Display name in the active locale. */
export function elementName(el: Element, locale: Locale): string {
  return locale === 'zh' ? el.nameZh : el.name
}

export function categoryName(el: Element, locale: Locale): string {
  return locale === 'zh' ? el.categoryZh : el.categoryEn
}

export function elementUses(el: Element, locale: Locale): string {
  return locale === 'zh' ? el.usesZh : el.usesEn
}

/** Everyday applications; empty for the synthetics that genuinely have none. */
export function elementEveryday(el: Element, locale: Locale): string[] {
  return locale === 'zh' ? el.everydayZh : el.everydayEn
}

/**
 * Matches an element against a free-text query across symbol, both names and the
 * atomic number. Scored so that the most literal interpretation of a short query
 * wins — typing "c" should surface carbon before calcium or actinium.
 */
function score(el: Element, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0

  const symbol = el.symbol.toLowerCase()
  const name = el.name.toLowerCase()

  if (symbol === q) return 100
  if (String(el.number) === q) return 95
  if (el.nameZh === query.trim()) return 90
  if (name === q) return 90

  if (symbol.startsWith(q)) return 70
  if (name.startsWith(q)) return 60
  if (el.nameZh.startsWith(query.trim())) return 60

  if (name.includes(q)) return 40
  if (el.nameZh.includes(query.trim())) return 40
  // Substring on the atomic number, so "11" also finds 110 and 111.
  if (String(el.number).includes(q)) return 20

  return 0
}

/**
 * Atomic numbers matching `query`, best match first. An empty query matches
 * everything, in atomic-number order.
 */
export function searchElements(query: string): number[] {
  if (!query.trim()) return ELEMENTS.map((el) => el.number)
  return ELEMENTS.map((el) => ({ el, s: score(el, query) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.el.number - b.el.number)
    .map((r) => r.el.number)
}

/** Properties whose values span orders of magnitude and need a log scale. */
const LOG_SCALED: ReadonlySet<HeatmapKey> = new Set<HeatmapKey>(['density'])

export interface HeatmapScale {
  min: number
  max: number
  /** Maps a raw property value to 0-1. Returns null when the element has no value. */
  normalize: (value: number | null) => number | null
}

/** Builds a 0-1 scale over every element that has a value for `key`. */
export function buildHeatmapScale(key: HeatmapKey): HeatmapScale {
  const values = ELEMENTS.map((el) => el[key]).filter((v): v is number => v !== null)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const log = LOG_SCALED.has(key)

  // Density bottoms out at ~9e-5 g/cm³ (hydrogen gas), so shift into positive
  // territory before taking logs.
  const project = (v: number) => (log ? Math.log10(Math.max(v, 1e-6)) : v)
  const lo = project(min)
  const hi = project(max)
  const span = hi - lo

  return {
    min,
    max,
    normalize: (value) => {
      if (value === null) return null
      if (span === 0) return 0.5
      return (project(value) - lo) / span
    },
  }
}

/** Low-to-high colour ramp for the heat map. */
const RAMP = ['#1E3A8A', '#0EA5E9', '#22D3EE', '#4ADE80', '#FACC15', '#FB923C', '#EF4444']

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Samples the ramp at `t` (0-1) with linear RGB interpolation between stops. */
export function heatmapColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t))
  const pos = clamped * (RAMP.length - 1)
  const i = Math.min(RAMP.length - 2, Math.floor(pos))
  const f = pos - i
  const [r1, g1, b1] = hexToRgb(RAMP[i])
  const [r2, g2, b2] = hexToRgb(RAMP[i + 1])
  const mix = (a: number, b: number) => Math.round(a + (b - a) * f)
  return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`
}

export const HEATMAP_RAMP = RAMP

/**
 * Most abundant isotope's neutron count, approximated by rounding the standard
 * atomic weight. Good enough for a "protons / neutrons" readout and correct for the
 * overwhelming majority of elements.
 */
export function neutronCount(el: Element): number {
  return Math.round(el.atomicMass) - el.number
}

/** Formats a numeric property for display, or the locale's "no data" string. */
export function formatValue(value: number | null, unit: string, fallback: string): string {
  if (value === null || Number.isNaN(value)) return fallback
  const abs = Math.abs(value)
  let text: string
  if (abs !== 0 && (abs < 0.001 || abs >= 1e6)) {
    text = value.toExponential(3)
  } else if (Number.isInteger(value)) {
    text = String(value)
  } else {
    // Keep more decimals for small magnitudes so electronegativity stays useful.
    text = value.toFixed(abs < 1 ? 4 : abs < 100 ? 3 : 2).replace(/\.?0+$/, '')
  }
  return unit ? `${text} ${unit}` : text
}
