import type { Locale } from '../types/element'

/**
 * Flat key -> {zh, en} dictionary. Small enough that a full i18n library would be
 * more ceremony than it is worth.
 */
const STRINGS = {
  appTitle: { zh: '元素周期表', en: 'Periodic Table' },
  appSubtitle: { zh: '3D 交互式原子结构', en: '3D Interactive Atomic Structure' },
  searchPlaceholder: {
    zh: '搜索元素：符号 / 中文名 / 英文名 / 原子序数',
    en: 'Search: symbol, name, or atomic number',
  },
  searchNoResults: { zh: '没有匹配的元素', en: 'No matching elements' },
  searchHint: { zh: '按 / 聚焦搜索', en: 'Press / to search' },
  clearFilters: { zh: '清除筛选', en: 'Clear filters' },
  filterCategories: { zh: '分类', en: 'Categories' },
  colorMode: { zh: '着色', en: 'Color by' },
  colorByCategory: { zh: '按类别', en: 'Category' },

  // Detail panel
  overview: { zh: '概览', en: 'Overview' },
  atomicNumber: { zh: '原子序数', en: 'Atomic number' },
  symbol: { zh: '元素符号', en: 'Symbol' },
  atomicMass: { zh: '相对原子质量', en: 'Atomic mass' },
  category: { zh: '类别', en: 'Category' },
  period: { zh: '周期', en: 'Period' },
  group: { zh: '族', en: 'Group' },
  block: { zh: '区', en: 'Block' },
  phase: { zh: '常温状态', en: 'Phase at STP' },
  appearance: { zh: '外观', en: 'Appearance' },
  discoveredBy: { zh: '发现者', en: 'Discovered by' },
  namedBy: { zh: '命名者', en: 'Named by' },

  electronStructure: { zh: '电子结构', en: 'Electron structure' },
  electronConfiguration: { zh: '电子排布式', en: 'Electron configuration' },
  electronConfigurationShort: { zh: '简写式', en: 'Shorthand' },
  shellDistribution: { zh: '分层电子数', en: 'Electrons per shell' },
  shell: { zh: '电子层', en: 'Shell' },
  electrons: { zh: '电子', en: 'electrons' },
  protons: { zh: '质子', en: 'protons' },
  neutrons: { zh: '中子', en: 'neutrons' },

  properties: { zh: '物理化学性质', en: 'Properties' },
  density: { zh: '密度', en: 'Density' },
  melt: { zh: '熔点', en: 'Melting point' },
  boil: { zh: '沸点', en: 'Boiling point' },
  molarHeat: { zh: '摩尔热容', en: 'Molar heat' },
  electronegativity: { zh: '电负性', en: 'Electronegativity' },
  electronAffinity: { zh: '电子亲和能', en: 'Electron affinity' },
  ionizationEnergy: { zh: '第一电离能', en: 'First ionization energy' },
  atomicRadius: { zh: '原子半径', en: 'Atomic radius' },
  summary: { zh: '简介', en: 'Summary' },
  uses: { zh: '作用与用途', en: 'What it is used for' },
  everyday: { zh: '生活中的应用', en: 'In everyday life' },
  noKnownUse: {
    zh: '目前没有任何实际应用',
    en: 'No practical applications at present',
  },
  readMore: { zh: '在维基百科上阅读', en: 'Read on Wikipedia' },
  noData: { zh: '暂无数据', en: 'No data' },

  // 3D viewer
  atomModel: { zh: '3D 原子结构', en: '3D Atomic Structure' },
  autoRotate: { zh: '自动旋转', en: 'Auto-rotate' },
  animateElectrons: { zh: '电子运动', en: 'Animate electrons' },
  electronCloud: { zh: '电子云', en: 'Electron cloud' },
  resetView: { zh: '重置视角', en: 'Reset view' },
  fullscreen: { zh: '全屏', en: 'Fullscreen' },
  exitFullscreen: { zh: '退出全屏', en: 'Exit fullscreen' },
  dragToRotate: { zh: '拖拽旋转 · 滚轮缩放', en: 'Drag to rotate · scroll to zoom' },

  // Comparison
  compare: { zh: '对比', en: 'Compare' },
  compareTitle: { zh: '元素对比', en: 'Element comparison' },
  addToCompare: { zh: '加入对比', en: 'Add to compare' },
  removeFromCompare: { zh: '移出对比', en: 'Remove from compare' },
  compareEmpty: {
    zh: '选择 2-3 个元素进行对比',
    en: 'Pick 2-3 elements to compare',
  },
  compareFull: { zh: '最多对比 3 个元素', en: 'Up to 3 elements' },
  clearCompare: { zh: '清空对比', en: 'Clear' },

  // Misc UI
  close: { zh: '关闭', en: 'Close' },
  previousElement: { zh: '上一个元素', en: 'Previous element' },
  nextElement: { zh: '下一个元素', en: 'Next element' },
  copyInfo: { zh: '复制信息', en: 'Copy info' },
  copied: { zh: '已复制', en: 'Copied' },
  language: { zh: '语言', en: 'Language' },
  keyboardHints: {
    zh: '← → 切换 · Esc 关闭',
    en: '← → to switch · Esc to close',
  },
  previousItem: { zh: '上一个', en: 'Previous' },
  nextItem: { zh: '下一个', en: 'Next' },
  keyboardHintsMolecule: {
    zh: '← → 切换 · P 播放 · Esc 关闭',
    en: '← → to switch · P to play · Esc to close',
  },
  // Molecules
  viewElements: { zh: '元素周期表', en: 'Periodic table' },
  viewMolecules: { zh: '分子', en: 'Molecules' },
  moleculeTitle: { zh: '常见分子', en: 'Common molecules' },
  moleculeSubtitle: {
    zh: '点击任意分子查看真实三维结构',
    en: 'Pick a molecule to see its real 3D structure',
  },
  moleculeSearchPlaceholder: {
    zh: '搜索分子：化学式 / 中文名 / 英文名',
    en: 'Search molecules: formula or name',
  },
  moleculeNoResults: { zh: '没有匹配的分子', en: 'No matching molecules' },
  molarMass: { zh: '摩尔质量', en: 'Molar mass' },
  shape: { zh: '空间构型', en: 'Shape' },
  composition: { zh: '组成', en: 'Composition' },
  atoms: { zh: '原子', en: 'atoms' },
  bonds: { zh: '化学键', en: 'bonds' },
  bondSingle: { zh: '单键', en: 'Single' },
  bondDouble: { zh: '双键', en: 'Double' },
  bondTriple: { zh: '三键', en: 'Triple' },
  bondLengths: { zh: '键长', en: 'Bond lengths' },
  atomLabels: { zh: '原子标签', en: 'Atom labels' },
  moleculeStructure: { zh: '3D 分子结构', en: '3D Molecular Structure' },
  viewElementDetail: { zh: '查看元素', en: 'View element' },
  idealizedGeometry: { zh: '理想化几何', en: 'Idealised geometry' },
  idealizedNote: {
    zh: '坐标由理想多边形构造，实际键长略有差异',
    en: 'Built from idealised polygons; real bond lengths vary slightly',
  },
  moleculeCount: { zh: '个分子', en: 'molecules' },

  // Theme
  theme: { zh: '主题配色', en: 'Theme' },

  // Fullscreen and autoplay
  // Distinct from the 3D viewer's own fullscreen, which only maximises the canvas.
  enterPageFullscreen: { zh: '整页全屏', en: 'Fullscreen page' },
  exitPageFullscreen: { zh: '退出整页全屏', en: 'Exit fullscreen page' },
  autoplay: { zh: '自动播放', en: 'Autoplay' },
  autoplayStart: { zh: '自动播放', en: 'Play all' },
  autoplayStop: { zh: '停止播放', en: 'Stop' },
  autoplayHint: {
    zh: '每 6 秒切换到下一个分子',
    en: 'Advances to the next molecule every 6 seconds',
  },

  // Footer
  blog: { zh: '博客', en: 'Blog' },
  sourceCode: { zh: '开源地址', en: 'Source code' },
  footerTagline: {
    zh: '纯前端的化学可视化：元素、分子与它们在生活中的位置。',
    en: 'A pure front-end chemistry visualisation: elements, molecules, and where they show up in daily life.',
  },
  footerSections: { zh: '板块', en: 'Explore' },
  footerProject: { zh: '项目', en: 'Project' },
  footerData: { zh: '数据来源', en: 'Data sources' },
  footerElementData: { zh: '元素数据', en: 'Element data' },
  footerGeometryData: { zh: '键长与键角', en: 'Bond lengths & angles' },
  footerRadiiData: { zh: '原子半径', en: 'Atomic radii' },
  footerSummaryData: { zh: '元素英文简介', en: 'Element summaries' },
  footerBuiltWith: { zh: '技术栈', en: 'Built with' },
  elementCount: { zh: '个元素', en: 'elements' },
  footerNoBackend: {
    zh: '无后端 · 无追踪 · 数据全部内置，离线可用',
    en: 'No backend, no tracking, all data bundled — works offline',
  },
  footerDisclaimer: {
    zh: '内容仅供学习参考，不作为化学操作或医疗建议',
    en: 'For learning and reference only — not chemical or medical advice',
  },
  footerReadme: { zh: '项目说明', en: 'README' },
  footerIssues: { zh: '问题反馈', en: 'Issues' },

  lanthanides: { zh: '镧系', en: 'Lanthanides' },
  actinides: { zh: '锕系', en: 'Actinides' },
  loading3d: { zh: '正在加载 3D 视图…', en: 'Loading 3D view…' },
  webglError: {
    zh: '无法初始化 3D 视图，你的浏览器可能不支持 WebGL。',
    en: 'Could not start the 3D view — your browser may not support WebGL.',
  },
} as const

export type StringKey = keyof typeof STRINGS

export function translate(key: StringKey, locale: Locale): string {
  return STRINGS[key][locale]
}

/** Heat map property labels, reused for the axis legend and the selector. */
export const HEATMAP_LABELS = {
  atomicMass: { zh: '相对原子质量', en: 'Atomic mass' },
  density: { zh: '密度', en: 'Density' },
  melt: { zh: '熔点', en: 'Melting point' },
  boil: { zh: '沸点', en: 'Boiling point' },
  electronegativity: { zh: '电负性', en: 'Electronegativity' },
  ionizationEnergy: { zh: '第一电离能', en: 'Ionization energy' },
  electronAffinity: { zh: '电子亲和能', en: 'Electron affinity' },
  atomicRadius: { zh: '原子半径', en: 'Atomic radius' },
} as const

/** Units are locale-independent; kept beside the labels for the same reason. */
export const PROPERTY_UNITS = {
  atomicMass: 'u',
  density: 'g/cm³',
  melt: 'K',
  boil: 'K',
  electronegativity: '',
  ionizationEnergy: 'kJ/mol',
  electronAffinity: 'kJ/mol',
  atomicRadius: 'pm',
  molarHeat: 'J/(mol·K)',
} as const
