import type { Locale } from '../types/element'
import type { Molecule, MoleculeCategory } from '../types/molecule'
import raw from './molecules.json'
import radii from './atomRadii.json'
import { getElementBySymbol } from './elements'

// Generated and validated by scripts/build-molecules.mjs.
export const MOLECULES = raw as unknown as Molecule[]

const BY_ID = new Map(MOLECULES.map((m) => [m.id, m]))

export function getMolecule(id: string): Molecule | undefined {
  return BY_ID.get(id)
}

export function moleculeName(m: Molecule, locale: Locale): string {
  return locale === 'zh' ? m.nameZh : m.name
}

export function moleculeSummary(m: Molecule, locale: Locale): string {
  return locale === 'zh' ? m.summaryZh : m.summaryEn
}

export function moleculeUses(m: Molecule, locale: Locale): string {
  return locale === 'zh' ? m.usesZh : m.usesEn
}

export function moleculeEveryday(m: Molecule, locale: Locale): string[] {
  return locale === 'zh' ? m.everydayZh : m.everydayEn
}

export function moleculeShape(m: Molecule, locale: Locale): string {
  return locale === 'zh' ? m.shapeZh : m.shape.replace(/-/g, ' ')
}

interface Radii {
  covalent: number
  vdw: number
}

const RADII = radii as Record<string, Radii>

/** Falls back to carbon-ish values for any element the table does not cover. */
export function atomRadii(symbol: string): Radii {
  return RADII[symbol] ?? { covalent: 0.76, vdw: 1.7 }
}

/** CPK colour for an element symbol, as `#rrggbb`. */
export function atomColor(symbol: string): string {
  const element = getElementBySymbol(symbol)
  return element?.cpkHex ? `#${element.cpkHex}` : '#C0C0C0'
}

export const MOLECULE_CATEGORY_ORDER: MoleculeCategory[] = ['element', 'inorganic', 'organic']

export const MOLECULE_CATEGORY_COLORS: Record<MoleculeCategory, string> = {
  element: '#5EEAD4',
  inorganic: '#7DD3FC',
  organic: '#C4B5FD',
}

export const MOLECULE_CATEGORY_LABELS: Record<MoleculeCategory, { zh: string; en: string }> = {
  element: { zh: '单质', en: 'Element' },
  inorganic: { zh: '无机物', en: 'Inorganic' },
  organic: { zh: '有机物', en: 'Organic' },
}

/** Element symbol -> atom count, in the order the atoms appear. */
export function composition(m: Molecule): { symbol: string; count: number }[] {
  return m.composition
}

/** Bond counts by order, for the detail readout. */
export function bondSummary(m: Molecule): { single: number; double: number; triple: number } {
  return m.bondCounts
}

/** Total number of bonds, however they are drawn. */
export function bondCount(m: Molecule): number {
  return m.bondCounts.single + m.bondCounts.double + m.bondCounts.triple
}

/**
 * Matches a molecule against a free-text query across formula, both names and the
 * constituent element symbols, so searching "O" surfaces every oxygen-containing
 * molecule.
 */
function score(m: Molecule, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0

  const formula = m.formula.toLowerCase()
  const display = m.formulaDisplay.toLowerCase()
  const name = m.name.toLowerCase()

  if (formula === q || display === q) return 100
  if (m.nameZh === query.trim()) return 95
  if (name === q) return 90
  if (formula.startsWith(q)) return 70
  if (name.startsWith(q)) return 60
  if (m.nameZh.startsWith(query.trim())) return 60
  if (name.includes(q) || formula.includes(q)) return 40
  if (m.nameZh.includes(query.trim())) return 40
  if (m.composition.some((c) => c.symbol.toLowerCase() === q)) return 20

  return 0
}

/** Molecule ids matching `query`, best match first. Empty query matches everything. */
export function searchMolecules(query: string): string[] {
  if (!query.trim()) return MOLECULES.map((m) => m.id)
  return MOLECULES.map((m) => ({ m, s: score(m, query) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((r) => r.m.id)
}
