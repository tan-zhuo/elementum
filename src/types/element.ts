/** Canonical category keys. Drives colouring, filtering and the legend. */
export type CategoryKey =
  | 'alkali-metal'
  | 'alkaline-earth-metal'
  | 'transition-metal'
  | 'post-transition-metal'
  | 'metalloid'
  | 'nonmetal'
  | 'halogen'
  | 'noble-gas'
  | 'lanthanide'
  | 'actinide'
  | 'unknown'

export type Phase = 'Solid' | 'Liquid' | 'Gas'

export interface Element {
  number: number
  symbol: string
  /** English name. */
  name: string
  /** Chinese name. */
  nameZh: string
  atomicMass: number
  category: CategoryKey
  categoryZh: string
  categoryEn: string
  period: number
  group: number
  /** s / p / d / f */
  block: string
  /** Column, 1-18, in the standard 18-wide layout. */
  xpos: number
  /** Row, 1-10. Rows 9 and 10 hold the lanthanides and actinides. */
  ypos: number
  /** Electrons per shell, K outwards. Always sums to `number`. */
  shells: number[]
  /** Full configuration with superscripts, e.g. "1s² 2s² 2p⁶". */
  electronConfiguration: string
  /** Noble-gas shorthand, e.g. "[Ne] 3s² 3p⁵". */
  electronConfigurationShort: string
  /** CPK colour as a bare hex triplet, no leading '#'. Null for a few synthetics. */
  cpkHex: string | null
  phase: Phase
  /** g/cm³ for solids and liquids, g/L for gases. */
  density: number | null
  /** Melting point, K. */
  melt: number | null
  /** Boiling point, K. */
  boil: number | null
  /** J/(mol·K) */
  molarHeat: number | null
  /** Pauling scale. */
  electronegativity: number | null
  /** kJ/mol */
  electronAffinity: number | null
  /** First ionization energy, kJ/mol. */
  ionizationEnergy: number | null
  /** Empirical radius, pm. Null past element 96 — no measured values exist. */
  atomicRadius: number | null
  appearance: string | null
  discoveredBy: string | null
  namedBy: string | null
  summary: string
  /** Wikipedia URL. */
  source: string
  /** One or two sentences on what the element is actually for. */
  usesZh: string
  usesEn: string
  /**
   * Concrete places it shows up in daily life. Deliberately empty for the synthetic
   * elements that genuinely have no applications.
   */
  everydayZh: string[]
  everydayEn: string[]
}

/** Numeric properties that can drive the heat map. */
export type HeatmapKey =
  | 'atomicMass'
  | 'density'
  | 'melt'
  | 'boil'
  | 'electronegativity'
  | 'ionizationEnergy'
  | 'electronAffinity'
  | 'atomicRadius'

export type Locale = 'zh' | 'en'
