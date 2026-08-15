import type { CategoryKey } from '../types/element'

/**
 * Category accent colours, tuned to stay distinguishable from each other on the
 * near-black background while remaining bright enough to read as text.
 */
export const CATEGORY_COLORS: Record<CategoryKey, string> = {
  'alkali-metal': '#FF6B5B',
  'alkaline-earth-metal': '#FFA34D',
  'transition-metal': '#5EEAD4',
  'post-transition-metal': '#7DD3FC',
  metalloid: '#C4B5FD',
  nonmetal: '#86EFAC',
  halogen: '#FDE047',
  'noble-gas': '#F0ABFC',
  lanthanide: '#818CF8',
  actinide: '#FB7185',
  unknown: '#94A3B8',
}

/** Legend order, roughly following the table left-to-right then the f-block. */
export const CATEGORY_ORDER: CategoryKey[] = [
  'alkali-metal',
  'alkaline-earth-metal',
  'transition-metal',
  'post-transition-metal',
  'metalloid',
  'nonmetal',
  'halogen',
  'noble-gas',
  'lanthanide',
  'actinide',
]

export const CATEGORY_LABELS: Record<CategoryKey, { zh: string; en: string }> = {
  'alkali-metal': { zh: '碱金属', en: 'Alkali metal' },
  'alkaline-earth-metal': { zh: '碱土金属', en: 'Alkaline earth' },
  'transition-metal': { zh: '过渡金属', en: 'Transition metal' },
  'post-transition-metal': { zh: '后过渡金属', en: 'Post-transition' },
  metalloid: { zh: '准金属', en: 'Metalloid' },
  nonmetal: { zh: '非金属', en: 'Nonmetal' },
  halogen: { zh: '卤素', en: 'Halogen' },
  'noble-gas': { zh: '稀有气体', en: 'Noble gas' },
  lanthanide: { zh: '镧系', en: 'Lanthanide' },
  actinide: { zh: '锕系', en: 'Actinide' },
  unknown: { zh: '性质未知', en: 'Unknown' },
}

/** Shell (K, L, M, ...) colours for the 3D atom, indexed by shell position. */
export const SHELL_COLORS = [
  '#5EEAD4',
  '#7DD3FC',
  '#818CF8',
  '#C4B5FD',
  '#F0ABFC',
  '#FB7185',
  '#FDE047',
  '#86EFAC',
]

export const SHELL_LABELS = ['K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R']
