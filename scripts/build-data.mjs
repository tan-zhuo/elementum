/**
 * Builds src/data/elements.json from the upstream Bowserinator Periodic-Table-JSON
 * dump, enriching it with Chinese names, canonical categories, superscript electron
 * configurations and empirical atomic radii.
 *
 * Usage: node scripts/build-data.mjs
 *
 * The upstream dump is vendored at scripts/source/PeriodicTableJSON.json so the
 * build stays fully offline and reproducible.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SOURCE = resolve(here, 'source/PeriodicTableJSON.json')
const OUT = resolve(here, '../src/data/elements.json')

/** Chinese names, indexed by atomic number. */
const ZH_NAMES = {
  1: '氢', 2: '氦', 3: '锂', 4: '铍', 5: '硼', 6: '碳', 7: '氮', 8: '氧', 9: '氟', 10: '氖',
  11: '钠', 12: '镁', 13: '铝', 14: '硅', 15: '磷', 16: '硫', 17: '氯', 18: '氩', 19: '钾', 20: '钙',
  21: '钪', 22: '钛', 23: '钒', 24: '铬', 25: '锰', 26: '铁', 27: '钴', 28: '镍', 29: '铜', 30: '锌',
  31: '镓', 32: '锗', 33: '砷', 34: '硒', 35: '溴', 36: '氪', 37: '铷', 38: '锶', 39: '钇', 40: '锆',
  41: '铌', 42: '钼', 43: '锝', 44: '钌', 45: '铑', 46: '钯', 47: '银', 48: '镉', 49: '铟', 50: '锡',
  51: '锑', 52: '碲', 53: '碘', 54: '氙', 55: '铯', 56: '钡', 57: '镧', 58: '铈', 59: '镨', 60: '钕',
  61: '钷', 62: '钐', 63: '铕', 64: '钆', 65: '铽', 66: '镝', 67: '钬', 68: '铒', 69: '铥', 70: '镱',
  71: '镥', 72: '铪', 73: '钽', 74: '钨', 75: '铼', 76: '锇', 77: '铱', 78: '铂', 79: '金', 80: '汞',
  81: '铊', 82: '铅', 83: '铋', 84: '钋', 85: '砹', 86: '氡', 87: '钫', 88: '镭', 89: '锕', 90: '钍',
  91: '镤', 92: '铀', 93: '镎', 94: '钚', 95: '镅', 96: '锔', 97: '锫', 98: '锎', 99: '锿', 100: '镄',
  101: '钔', 102: '锘', 103: '铹', 104: '𬬻', 105: '𬭊', 106: '𬭳', 107: '𬭛', 108: '𬭶', 109: '鿏', 110: '𫟼',
  111: '𬬭', 112: '鿔', 113: '鿭', 114: '𫓧', 115: '镆', 116: '𫟷', 117: '鿬', 118: '鿫',
}

/**
 * Empirical atomic radii in picometres (Slater, 1964), with the conventional
 * calculated values used for the noble gases. Deliberately null past element 96 —
 * no measured radii exist for those, and inventing them would poison the heat map.
 */
const ATOMIC_RADIUS = {
  1: 25, 2: 31, 3: 145, 4: 105, 5: 85, 6: 70, 7: 65, 8: 60, 9: 50, 10: 38,
  11: 180, 12: 150, 13: 125, 14: 110, 15: 100, 16: 100, 17: 100, 18: 71, 19: 220, 20: 180,
  21: 160, 22: 140, 23: 135, 24: 140, 25: 140, 26: 140, 27: 135, 28: 135, 29: 135, 30: 135,
  31: 130, 32: 125, 33: 115, 34: 115, 35: 115, 36: 88, 37: 235, 38: 200, 39: 180, 40: 155,
  41: 145, 42: 145, 43: 135, 44: 130, 45: 135, 46: 140, 47: 160, 48: 155, 49: 155, 50: 145,
  51: 145, 52: 140, 53: 140, 54: 108, 55: 260, 56: 215, 57: 195, 58: 185, 59: 185, 60: 185,
  61: 185, 62: 185, 63: 185, 64: 180, 65: 175, 66: 175, 67: 175, 68: 175, 69: 175, 70: 175,
  71: 175, 72: 155, 73: 145, 74: 135, 75: 135, 76: 130, 77: 135, 78: 135, 79: 135, 80: 150,
  81: 190, 82: 180, 83: 160, 84: 190, 85: 127, 86: 120, 87: 260, 88: 215, 89: 195, 90: 180,
  91: 180, 92: 175, 93: 175, 94: 175, 95: 175, 96: 176,
}

/** Canonical category keys -> Chinese label. Drives colouring, filtering and the legend. */
const CATEGORY_ZH = {
  'alkali-metal': '碱金属',
  'alkaline-earth-metal': '碱土金属',
  'transition-metal': '过渡金属',
  'post-transition-metal': '后过渡金属',
  metalloid: '准金属',
  nonmetal: '非金属',
  halogen: '卤素',
  'noble-gas': '稀有气体',
  lanthanide: '镧系',
  actinide: '锕系',
  unknown: '性质未知',
}

const CATEGORY_EN = {
  'alkali-metal': 'Alkali metal',
  'alkaline-earth-metal': 'Alkaline earth metal',
  'transition-metal': 'Transition metal',
  'post-transition-metal': 'Post-transition metal',
  metalloid: 'Metalloid',
  nonmetal: 'Nonmetal',
  halogen: 'Halogen',
  'noble-gas': 'Noble gas',
  lanthanide: 'Lanthanide',
  actinide: 'Actinide',
  unknown: 'Unknown',
}

/** Maps a raw upstream category string onto a canonical key. */
function baseCategory(raw) {
  const c = raw.toLowerCase()
  if (c.includes('lanthanide')) return 'lanthanide'
  if (c.includes('actinide')) return 'actinide'
  if (c.includes('noble gas')) return 'noble-gas'
  if (c.includes('alkaline earth')) return 'alkaline-earth-metal'
  if (c.includes('alkali metal')) return 'alkali-metal'
  if (c.includes('post-transition')) return 'post-transition-metal'
  if (c.includes('transition metal')) return 'transition-metal'
  if (c.includes('metalloid')) return 'metalloid'
  if (c.includes('nonmetal')) return 'nonmetal'
  return 'unknown'
}

/**
 * Group membership beats the upstream free-text category: it promotes the halogens
 * out of "diatomic nonmetal" (the spec asks for a halogen legend entry) and gives the
 * superheavy elements, whose upstream category is a hedge like "unknown, probably
 * post-transition metal", the placement chemists actually use.
 */
function canonicalCategory(el) {
  const { number, group } = el
  if (number >= 57 && number <= 71) return 'lanthanide'
  if (number >= 89 && number <= 103) return 'actinide'
  if (group === 18) return 'noble-gas'
  if (group === 17) return 'halogen'
  if (group === 1 && number !== 1) return 'alkali-metal'
  if (group === 2) return 'alkaline-earth-metal'
  return baseCategory(el.category)
}

const SUPER = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }

/** "1s2 2s2 2p6" -> "1s² 2s² 2p⁶" */
function toSuperscript(config) {
  return config.replace(/([spdf])(\d+)/g, (_, orbital, count) =>
    orbital + [...count].map((d) => SUPER[d]).join(''),
  )
}

/**
 * The upstream `electron_configuration_semantic` field is inconsistently formatted —
 * it carries stray asterisks and missing separators (e.g. "*[Rn] 5f14 6d10", "[Xe] 5d16s2").
 * Rebuilding the noble-gas shorthand from the full configuration gives a uniform result.
 */
const NOBLE_GAS_CORES = [
  [86, 'Rn', '1s2 2s2 2p6 3s2 3p6 4s2 3d10 4p6 5s2 4d10 5p6 6s2 4f14 5d10 6p6'],
  [54, 'Xe', '1s2 2s2 2p6 3s2 3p6 4s2 3d10 4p6 5s2 4d10 5p6'],
  [36, 'Kr', '1s2 2s2 2p6 3s2 3p6 4s2 3d10 4p6'],
  [18, 'Ar', '1s2 2s2 2p6 3s2 3p6'],
  [10, 'Ne', '1s2 2s2 2p6'],
  [2, 'He', '1s2'],
]

function toShorthand(config, number) {
  const orbitals = config.split(/\s+/)
  for (const [coreNumber, symbol, corePrefix] of NOBLE_GAS_CORES) {
    if (number <= coreNumber) continue
    const coreOrbitals = corePrefix.split(/\s+/)
    const matches = coreOrbitals.every((o, i) => orbitals[i] === o)
    if (!matches) continue
    const rest = orbitals.slice(coreOrbitals.length).join(' ')
    return `[${symbol}] ${toSuperscript(rest)}`
  }
  return toSuperscript(config)
}

const source = JSON.parse(readFileSync(SOURCE, 'utf8'))

const elements = source.elements
  // The dump includes a speculative element 119; the spec scopes this to 1-118.
  .filter((el) => el.number <= 118)
  .map((el) => {
    const category = canonicalCategory(el)
    const nameZh = ZH_NAMES[el.number]
    if (!nameZh) throw new Error(`Missing Chinese name for element ${el.number}`)

    return {
      number: el.number,
      symbol: el.symbol,
      name: el.name,
      nameZh,
      atomicMass: el.atomic_mass,
      category,
      categoryZh: CATEGORY_ZH[category],
      categoryEn: CATEGORY_EN[category],
      period: el.period,
      group: el.group,
      block: el.block,
      xpos: el.xpos,
      ypos: el.ypos,
      shells: el.shells,
      electronConfiguration: toSuperscript(el.electron_configuration),
      electronConfigurationShort: toShorthand(el.electron_configuration, el.number),
      cpkHex: el['cpk-hex'] ?? null,
      phase: el.phase,
      density: el.density ?? null,
      melt: el.melt ?? null,
      boil: el.boil ?? null,
      molarHeat: el.molar_heat ?? null,
      electronegativity: el.electronegativity_pauling ?? null,
      electronAffinity: el.electron_affinity ?? null,
      ionizationEnergy: el.ionization_energies?.[0] ?? null,
      atomicRadius: ATOMIC_RADIUS[el.number] ?? null,
      appearance: el.appearance ?? null,
      discoveredBy: el.discovered_by ?? null,
      namedBy: el.named_by ?? null,
      summary: el.summary,
      source: el.source,
    }
  })

// Fail loudly rather than shipping a table that silently renders a wrong atom.
if (elements.length !== 118) {
  throw new Error(`Expected 118 elements, got ${elements.length}`)
}
for (const el of elements) {
  const total = el.shells.reduce((a, b) => a + b, 0)
  if (total !== el.number) {
    throw new Error(`Element ${el.number} (${el.symbol}): shells sum to ${total}`)
  }
  if (el.shells.some((n) => n <= 0)) {
    throw new Error(`Element ${el.number} (${el.symbol}): non-positive shell occupancy`)
  }
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(elements)}\n`)

const missingRadius = elements.filter((e) => e.atomicRadius === null).length
console.log(`Wrote ${elements.length} elements -> ${OUT}`)
console.log(`  ${elements.filter((e) => e.cpkHex === null).length} without CPK colour`)
console.log(`  ${missingRadius} without atomic radius (expected 22: elements 97-118)`)
