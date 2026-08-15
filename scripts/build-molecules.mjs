/**
 * Builds src/data/molecules.json — 3D geometry for common molecules.
 *
 * Usage: node scripts/build-molecules.mjs
 *
 * Atom positions are *constructed* from published bond lengths and bond angles
 * rather than transcribed as raw coordinates, so a typo produces a geometry that
 * fails validation instead of a plausible-looking but wrong molecule. Every bond is
 * declared with its reference length and re-measured against the built coordinates
 * at the end; the formula is likewise re-derived from the atom list.
 *
 * Units are angstroms throughout. Sources are standard experimental values
 * (CCCBDB / NIST, Allen et al. covalent radii, Bondi van der Waals radii).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '../src/data/molecules.json')
const ELEMENTS = JSON.parse(readFileSync(resolve(here, '../src/data/elements.json'), 'utf8'))
const MASS = new Map(ELEMENTS.map((e) => [e.symbol, e.atomicMass]))

const DEG = Math.PI / 180

// ---------------------------------------------------------------- vector maths

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
const len = (a) => Math.hypot(a[0], a[1], a[2])
const norm = (a) => mul(a, 1 / len(a))
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const dist = (a, b) => len(sub(a, b))

/** Orthonormal frame whose third axis is `axis`. */
function frame(axis) {
  const w = norm(axis)
  const ref = Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const u = norm(cross(ref, w))
  return [u, cross(w, u), w]
}

/**
 * `count` positions spaced evenly on a cone of half-angle `angle` around `axis`,
 * at `distance` from `apex`. Covers methyl groups, ammonia, and the non-axial
 * bonds of a tetrahedron.
 */
function cone(apex, axis, count, angle, distance, phase = 0) {
  const [u, v, w] = frame(axis)
  const a = angle * DEG
  return Array.from({ length: count }, (_, i) => {
    const phi = (phase + (360 / count) * i) * DEG
    const dir = add(
      mul(w, Math.cos(a)),
      add(mul(u, Math.sin(a) * Math.cos(phi)), mul(v, Math.sin(a) * Math.sin(phi))),
    )
    return add(apex, mul(dir, distance))
  })
}

/** Two atoms bonded to `center` at `angle`, symmetric about +z, lying in the xz-plane. */
function bent(center, angle, distance) {
  const half = (angle / 2) * DEG
  const dx = Math.sin(half) * distance
  const dz = Math.cos(half) * distance
  return [add(center, [dx, 0, dz]), add(center, [-dx, 0, dz])]
}

/**
 * Completes an sp3 centre that already has two bonds, returning the two remaining
 * directions. They sit symmetrically about the reflex bisector, in the plane
 * perpendicular to the existing pair.
 */
function completeSp3(center, neighbourA, neighbourB, angle, distance) {
  const a = norm(sub(neighbourA, center))
  const b = norm(sub(neighbourB, center))
  const bisector = norm(add(a, b))
  const normal = norm(cross(a, b))
  const half = (angle / 2) * DEG
  const base = mul(bisector, -Math.cos(half))
  return [
    add(center, mul(add(base, mul(normal, Math.sin(half))), distance)),
    add(center, mul(sub(base, mul(normal, Math.sin(half))), distance)),
  ]
}

/**
 * A bond direction making `angle` with `center`->`reference`, rotated `azimuth`
 * degrees about that axis.
 *
 * The azimuth is measured in a frame derived from the axis itself, so it is only
 * comparable between calls that share the same `center` and `reference`. That is
 * enough to place symmetric pairs (the two hydrogens of formaldehyde at 0 and 180),
 * but NOT to set a dihedral between substituents on two different atoms — reversing
 * the axis flips the frame, which silently negates the angle. Use `aroundAxis` for
 * those.
 */
function branch(center, reference, angle, distance, azimuth = 0) {
  return aroundAxis(center, sub(reference, center), angle, distance, azimuth)
}

/**
 * Like `branch`, but the axis is given explicitly, so several calls can share one
 * frame and their azimuths become directly comparable — which is what a dihedral
 * angle actually is.
 */
function aroundAxis(origin, axis, angle, distance, azimuth = 0) {
  const [u, v, w] = frame(axis)
  const a = angle * DEG
  const d = azimuth * DEG
  const dir = add(
    mul(w, Math.cos(a)),
    add(mul(u, Math.sin(a) * Math.cos(d)), mul(v, Math.sin(a) * Math.sin(d))),
  )
  return add(origin, mul(dir, distance))
}

// ------------------------------------------------------------- radii per symbol

/** Covalent radii (Cordero 2008) and van der Waals radii (Bondi / Alvarez). */
const RADII = {
  H: { covalent: 0.31, vdw: 1.1 },
  C: { covalent: 0.76, vdw: 1.7 },
  N: { covalent: 0.71, vdw: 1.55 },
  O: { covalent: 0.66, vdw: 1.52 },
  S: { covalent: 1.05, vdw: 1.8 },
  Cl: { covalent: 1.02, vdw: 1.75 },
}

// ------------------------------------------------------------------- molecules

/**
 * Each entry builds its atoms from geometry primitives and declares every bond
 * with the reference length that geometry is supposed to reproduce.
 */
const DEFINITIONS = [
  // ---- 单质 ----
  {
    id: 'h2',
    formula: 'H2',
    name: 'Hydrogen',
    nameZh: '氢气',
    category: 'element',
    shape: 'linear',
    shapeZh: '直线形',
    summaryZh: '最轻的分子，两个氢原子以单键结合。宇宙中丰度最高的分子。',
    summaryEn:
      'The lightest molecule: two hydrogen atoms joined by a single bond, and the most abundant molecule in the universe.',
    build() {
      const d = 0.741
      return {
        atoms: [
          { element: 'H', position: [-d / 2, 0, 0] },
          { element: 'H', position: [d / 2, 0, 0] },
        ],
        bonds: [{ a: 0, b: 1, order: 1, length: d }],
      }
    },
  },
  {
    id: 'o2',
    formula: 'O2',
    name: 'Oxygen',
    nameZh: '氧气',
    category: 'element',
    shape: 'linear',
    shapeZh: '直线形',
    summaryZh: '空气中约占 21%，以双键结合。基态为三重态双自由基，因此具有顺磁性。',
    summaryEn:
      'About 21% of air, held by a double bond. Its triplet ground state makes it a diradical, which is why oxygen is paramagnetic.',
    build() {
      const d = 1.208
      return {
        atoms: [
          { element: 'O', position: [-d / 2, 0, 0] },
          { element: 'O', position: [d / 2, 0, 0] },
        ],
        bonds: [{ a: 0, b: 1, order: 2, length: d }],
      }
    },
  },
  {
    id: 'n2',
    formula: 'N2',
    name: 'Nitrogen',
    nameZh: '氮气',
    category: 'element',
    shape: 'linear',
    shapeZh: '直线形',
    summaryZh: '空气的主要成分（约 78%）。氮氮三键键能极高，使氮气非常稳定。',
    summaryEn:
      'The main component of air (~78%). Its nitrogen-nitrogen triple bond is one of the strongest known, making N2 very unreactive.',
    build() {
      const d = 1.098
      return {
        atoms: [
          { element: 'N', position: [-d / 2, 0, 0] },
          { element: 'N', position: [d / 2, 0, 0] },
        ],
        bonds: [{ a: 0, b: 1, order: 3, length: d }],
      }
    },
  },
  {
    id: 'cl2',
    formula: 'Cl2',
    name: 'Chlorine',
    nameZh: '氯气',
    category: 'element',
    shape: 'linear',
    shapeZh: '直线形',
    summaryZh: '黄绿色有毒气体，氧化性强，常用于自来水消毒。',
    summaryEn:
      'A yellow-green toxic gas and strong oxidiser, widely used to disinfect drinking water.',
    build() {
      const d = 1.988
      return {
        atoms: [
          { element: 'Cl', position: [-d / 2, 0, 0] },
          { element: 'Cl', position: [d / 2, 0, 0] },
        ],
        bonds: [{ a: 0, b: 1, order: 1, length: d }],
      }
    },
  },
  {
    id: 'o3',
    formula: 'O3',
    name: 'Ozone',
    nameZh: '臭氧',
    category: 'element',
    shape: 'bent',
    shapeZh: '角形',
    summaryZh:
      '平流层臭氧层吸收紫外线。图中画的是一种路易斯结构，实际两个 O—O 键完全等长，为共振离域。',
    summaryEn:
      'Stratospheric ozone absorbs ultraviolet light. One Lewis structure is drawn here; in reality both O-O bonds are identical, delocalised by resonance.',
    build() {
      const d = 1.278
      const [o1, o2] = bent([0, 0, 0], 116.8, d)
      return {
        atoms: [
          { element: 'O', position: [0, 0, 0] },
          { element: 'O', position: o1 },
          { element: 'O', position: o2 },
        ],
        bonds: [
          { a: 0, b: 1, order: 2, length: d },
          { a: 0, b: 2, order: 1, length: d },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 116.8]] },
  },

  // ---- 无机物 ----
  {
    id: 'h2o',
    formula: 'H2O',
    name: 'Water',
    nameZh: '水',
    category: 'inorganic',
    shape: 'bent',
    shapeZh: '角形',
    summaryZh:
      '键角 104.5°，小于理想四面体角，因为氧上的两对孤对电子排斥更强。极性使水成为优良溶剂。',
    summaryEn:
      'The 104.5° angle is narrower than a perfect tetrahedron because the two lone pairs on oxygen repel more strongly. Its polarity makes water an excellent solvent.',
    build() {
      const d = 0.9584
      const [h1, h2] = bent([0, 0, 0], 104.5, d)
      return {
        atoms: [
          { element: 'O', position: [0, 0, 0] },
          { element: 'H', position: h1 },
          { element: 'H', position: h2 },
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: d },
          { a: 0, b: 2, order: 1, length: d },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 104.5]] },
  },
  {
    id: 'h2o2',
    formula: 'H2O2',
    name: 'Hydrogen peroxide',
    nameZh: '过氧化氢',
    category: 'inorganic',
    shape: 'skew',
    shapeZh: '扭曲形',
    summaryZh:
      '两个 O—H 不共面，二面角约 111.5°，是典型的非平面分子 —— 旋转模型最能看清这一点。',
    summaryEn:
      'The two O-H bonds are not coplanar: the dihedral angle is about 111.5°. Rotating the model is the clearest way to see this.',
    build() {
      const oo = 1.475
      const oh = 0.95
      const o1 = [0, 0, -oo / 2]
      const o2 = [0, 0, oo / 2]
      // Both hydrogens are placed against the same O1->O2 axis so their azimuths
      // share a frame and differ by exactly the dihedral angle. The second is taken
      // at 180 - 94.8 because it leans away from O1 rather than toward it.
      const axis = [0, 0, 1]
      return {
        atoms: [
          { element: 'O', position: o1 },
          { element: 'O', position: o2 },
          { element: 'H', position: aroundAxis(o1, axis, 94.8, oh, 0) },
          { element: 'H', position: aroundAxis(o2, axis, 180 - 94.8, oh, 111.5) },
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: oo },
          { a: 0, b: 2, order: 1, length: oh },
          { a: 1, b: 3, order: 1, length: oh },
        ],
      }
    },
    checks: {
      angles: [
        [0, 1, 2, 94.8],
        [1, 0, 3, 94.8],
      ],
      dihedrals: [[2, 0, 1, 3, 111.5]],
    },
  },
  {
    id: 'h2s',
    formula: 'H2S',
    name: 'Hydrogen sulfide',
    nameZh: '硫化氢',
    category: 'inorganic',
    shape: 'bent',
    shapeZh: '角形',
    summaryZh: '臭鸡蛋气味的剧毒气体。键角仅 92.1°，远小于水，因为硫更少发生轨道杂化。',
    summaryEn:
      'A highly toxic gas smelling of rotten eggs. Its 92.1° angle is far narrower than water because sulfur hybridises much less.',
    build() {
      const d = 1.336
      const [h1, h2] = bent([0, 0, 0], 92.1, d)
      return {
        atoms: [
          { element: 'S', position: [0, 0, 0] },
          { element: 'H', position: h1 },
          { element: 'H', position: h2 },
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: d },
          { a: 0, b: 2, order: 1, length: d },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 92.1]] },
  },
  {
    id: 'co',
    formula: 'CO',
    name: 'Carbon monoxide',
    nameZh: '一氧化碳',
    category: 'inorganic',
    shape: 'linear',
    shapeZh: '直线形',
    summaryZh: '无色无味剧毒气体。与血红蛋白结合力约为氧气的 200 倍，因而导致煤气中毒。',
    summaryEn:
      'A colourless, odourless and highly toxic gas. It binds haemoglobin roughly 200 times more strongly than oxygen does.',
    build() {
      const d = 1.128
      return {
        atoms: [
          { element: 'C', position: [-d / 2, 0, 0] },
          { element: 'O', position: [d / 2, 0, 0] },
        ],
        bonds: [{ a: 0, b: 1, order: 3, length: d }],
      }
    },
  },
  {
    id: 'co2',
    formula: 'CO2',
    name: 'Carbon dioxide',
    nameZh: '二氧化碳',
    category: 'inorganic',
    shape: 'linear',
    shapeZh: '直线形',
    summaryZh: '直线形分子，两个 C=O 极性相互抵消，整体无极性。主要的温室气体之一。',
    summaryEn:
      'Linear, so the two polar C=O bonds cancel and the molecule as a whole is non-polar. One of the principal greenhouse gases.',
    build() {
      const d = 1.163
      return {
        atoms: [
          { element: 'C', position: [0, 0, 0] },
          { element: 'O', position: [-d, 0, 0] },
          { element: 'O', position: [d, 0, 0] },
        ],
        bonds: [
          { a: 0, b: 1, order: 2, length: d },
          { a: 0, b: 2, order: 2, length: d },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 180]], planar: true },
  },
  {
    id: 'so2',
    formula: 'SO2',
    name: 'Sulfur dioxide',
    nameZh: '二氧化硫',
    category: 'inorganic',
    shape: 'bent',
    shapeZh: '角形',
    summaryZh: '刺激性气味气体，是酸雨的主要成因之一。硫上有一对孤对电子，使分子呈角形。',
    summaryEn:
      'A pungent gas and a major cause of acid rain. A lone pair on sulfur bends the molecule instead of leaving it linear.',
    build() {
      const d = 1.431
      const [o1, o2] = bent([0, 0, 0], 119.0, d)
      return {
        atoms: [
          { element: 'S', position: [0, 0, 0] },
          { element: 'O', position: o1 },
          { element: 'O', position: o2 },
        ],
        bonds: [
          { a: 0, b: 1, order: 2, length: d },
          { a: 0, b: 2, order: 2, length: d },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 119.0]] },
  },
  {
    id: 'nh3',
    formula: 'NH3',
    name: 'Ammonia',
    nameZh: '氨',
    category: 'inorganic',
    shape: 'trigonal-pyramidal',
    shapeZh: '三角锥形',
    summaryZh: '三角锥形，氮上的孤对电子占据第四个顶点。工业上由哈伯法合成，是化肥的基础。',
    summaryEn:
      'Trigonal pyramidal, with the lone pair on nitrogen occupying the fourth vertex. Made industrially by the Haber process and the basis of fertiliser.',
    build() {
      const d = 1.012
      // 67.86° from the C3 axis reproduces the 106.7° H-N-H angle.
      const hs = cone([0, 0, 0], [0, 0, -1], 3, 67.86, d)
      return {
        atoms: [{ element: 'N', position: [0, 0, 0] }, ...hs.map((p) => ({ element: 'H', position: p }))],
        bonds: [
          { a: 0, b: 1, order: 1, length: d },
          { a: 0, b: 2, order: 1, length: d },
          { a: 0, b: 3, order: 1, length: d },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 106.7], [0, 2, 3, 106.7], [0, 1, 3, 106.7]] },
  },
  {
    id: 'hcl',
    formula: 'HCl',
    name: 'Hydrogen chloride',
    nameZh: '氯化氢',
    category: 'inorganic',
    shape: 'linear',
    shapeZh: '直线形',
    summaryZh: '强极性分子，溶于水即为盐酸。',
    summaryEn: 'A strongly polar molecule; dissolved in water it becomes hydrochloric acid.',
    build() {
      const d = 1.275
      return {
        atoms: [
          { element: 'H', position: [-d / 2, 0, 0] },
          { element: 'Cl', position: [d / 2, 0, 0] },
        ],
        bonds: [{ a: 0, b: 1, order: 1, length: d }],
      }
    },
  },

  // ---- 有机物 ----
  {
    id: 'ch4',
    formula: 'CH4',
    name: 'Methane',
    nameZh: '甲烷',
    category: 'organic',
    shape: 'tetrahedral',
    shapeZh: '正四面体形',
    summaryZh: '天然气主要成分。正四面体，键角 109.5°，是 sp3 杂化最标准的例子。',
    summaryEn:
      'The main component of natural gas. A perfect tetrahedron with 109.5° angles, the textbook example of sp3 hybridisation.',
    build() {
      const d = 1.087
      const axial = [0, 0, d]
      // The three remaining bonds sit 70.53° off the -z axis, giving 109.47° overall.
      const rest = cone([0, 0, 0], [0, 0, -1], 3, 70.53, d)
      return {
        atoms: [
          { element: 'C', position: [0, 0, 0] },
          { element: 'H', position: axial },
          ...rest.map((p) => ({ element: 'H', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: d },
          { a: 0, b: 2, order: 1, length: d },
          { a: 0, b: 3, order: 1, length: d },
          { a: 0, b: 4, order: 1, length: d },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 109.47], [0, 2, 3, 109.47], [0, 3, 4, 109.47]] },
  },
  {
    id: 'ch2o',
    formula: 'CH2O',
    name: 'Formaldehyde',
    nameZh: '甲醛',
    category: 'organic',
    shape: 'trigonal-planar',
    shapeZh: '平面三角形',
    summaryZh: '平面三角形，sp2 杂化。装修材料释放的甲醛是常见室内污染物。',
    summaryEn:
      'Trigonal planar and sp2 hybridised. Released by some building materials, it is a common indoor air pollutant.',
    build() {
      const co = 1.208
      const ch = 1.116
      const o = [0, 0, co]
      const h1 = branch([0, 0, 0], o, 121.75, ch, 0)
      const h2 = branch([0, 0, 0], o, 121.75, ch, 180)
      return {
        atoms: [
          { element: 'C', position: [0, 0, 0] },
          { element: 'O', position: o },
          { element: 'H', position: h1 },
          { element: 'H', position: h2 },
        ],
        bonds: [
          { a: 0, b: 1, order: 2, length: co },
          { a: 0, b: 2, order: 1, length: ch },
          { a: 0, b: 3, order: 1, length: ch },
        ],
      }
    },
    checks: { angles: [[0, 2, 3, 116.5], [0, 1, 2, 121.75]], planar: true },
  },
  {
    id: 'c2h2',
    formula: 'C2H2',
    name: 'Acetylene',
    nameZh: '乙炔',
    category: 'organic',
    shape: 'linear',
    shapeZh: '直线形',
    summaryZh: 'sp 杂化，四个原子完全共线。氧炔焰温度可达约 3300 °C，用于焊接切割。',
    summaryEn:
      'sp hybridised, with all four atoms exactly collinear. An oxyacetylene flame reaches about 3300 °C, hot enough for welding and cutting.',
    build() {
      const cc = 1.203
      const ch = 1.061
      return {
        atoms: [
          { element: 'C', position: [-cc / 2, 0, 0] },
          { element: 'C', position: [cc / 2, 0, 0] },
          { element: 'H', position: [-cc / 2 - ch, 0, 0] },
          { element: 'H', position: [cc / 2 + ch, 0, 0] },
        ],
        bonds: [
          { a: 0, b: 1, order: 3, length: cc },
          { a: 0, b: 2, order: 1, length: ch },
          { a: 1, b: 3, order: 1, length: ch },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 180], [1, 0, 3, 180]], planar: true },
  },
  {
    id: 'c2h4',
    formula: 'C2H4',
    name: 'Ethylene',
    nameZh: '乙烯',
    category: 'organic',
    shape: 'planar',
    shapeZh: '平面形',
    summaryZh: '所有原子共面，C=C 双键无法自由旋转。植物激素，可催熟果实。',
    summaryEn:
      'All six atoms lie in one plane, and the C=C double bond cannot rotate freely. It is also a plant hormone that ripens fruit.',
    build() {
      const cc = 1.339
      const ch = 1.087
      const c1 = [-cc / 2, 0, 0]
      const c2 = [cc / 2, 0, 0]
      return {
        atoms: [
          { element: 'C', position: c1 },
          { element: 'C', position: c2 },
          { element: 'H', position: branch(c1, c2, 121.3, ch, 0) },
          { element: 'H', position: branch(c1, c2, 121.3, ch, 180) },
          { element: 'H', position: branch(c2, c1, 121.3, ch, 0) },
          { element: 'H', position: branch(c2, c1, 121.3, ch, 180) },
        ],
        bonds: [
          { a: 0, b: 1, order: 2, length: cc },
          { a: 0, b: 2, order: 1, length: ch },
          { a: 0, b: 3, order: 1, length: ch },
          { a: 1, b: 4, order: 1, length: ch },
          { a: 1, b: 5, order: 1, length: ch },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 121.3], [0, 2, 3, 117.4]], planar: true },
  },
  {
    id: 'ch3oh',
    formula: 'CH4O',
    formulaDisplayOverride: 'CH3OH',
    name: 'Methanol',
    nameZh: '甲醇',
    category: 'organic',
    shape: 'tetrahedral',
    shapeZh: '四面体形',
    summaryZh: '最简单的醇。有毒，误饮可致失明，不可与乙醇混淆。',
    summaryEn:
      'The simplest alcohol. It is toxic and can cause blindness if swallowed, and must not be confused with ethanol.',
    build() {
      const co = 1.427
      const ch = 1.094
      const oh = 0.956
      const c = [0, 0, 0]
      const o = [0, 0, co]
      const hs = cone(c, [0, 0, -1], 3, 70.53, ch, 180)
      return {
        atoms: [
          { element: 'C', position: c },
          { element: 'O', position: o },
          { element: 'H', position: branch(o, c, 108.5, oh, 0) },
          ...hs.map((p) => ({ element: 'H', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: co },
          { a: 1, b: 2, order: 1, length: oh },
          { a: 0, b: 3, order: 1, length: ch },
          { a: 0, b: 4, order: 1, length: ch },
          { a: 0, b: 5, order: 1, length: ch },
        ],
      }
    },
    checks: { angles: [[1, 0, 2, 108.5], [0, 3, 4, 109.47]] },
  },
  {
    id: 'c2h5oh',
    formula: 'C2H6O',
    formulaDisplayOverride: 'C2H5OH',
    name: 'Ethanol',
    nameZh: '乙醇',
    category: 'organic',
    shape: 'tetrahedral',
    shapeZh: '四面体链',
    summaryZh: '酒精。羟基使其能与水以任意比例互溶，同时保留可溶解油脂的烃基部分。',
    summaryEn:
      'Drinking alcohol. The hydroxyl group lets it mix with water in any proportion, while the hydrocarbon end still dissolves oils.',
    build() {
      const cc = 1.512
      const co = 1.431
      const ch = 1.094
      const oh = 0.971
      const c1 = [0, 0, 0]
      const c2 = [0, 0, cc]
      const o = branch(c2, c1, 107.8, co, 0)
      const methyl = cone(c1, [0, 0, -1], 3, 70.53, ch, 180)
      const methylene = completeSp3(c2, c1, o, 107.0, ch)
      return {
        atoms: [
          { element: 'C', position: c1 },
          { element: 'C', position: c2 },
          { element: 'O', position: o },
          { element: 'H', position: branch(o, c2, 108.5, oh, 0) },
          ...methyl.map((p) => ({ element: 'H', position: p })),
          ...methylene.map((p) => ({ element: 'H', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: cc },
          { a: 1, b: 2, order: 1, length: co },
          { a: 2, b: 3, order: 1, length: oh },
          { a: 0, b: 4, order: 1, length: ch },
          { a: 0, b: 5, order: 1, length: ch },
          { a: 0, b: 6, order: 1, length: ch },
          { a: 1, b: 7, order: 1, length: ch },
          { a: 1, b: 8, order: 1, length: ch },
        ],
      }
    },
    checks: { angles: [[1, 0, 2, 107.8], [2, 1, 3, 108.5], [1, 7, 8, 107.0]] },
  },
  {
    id: 'c6h6',
    formula: 'C6H6',
    name: 'Benzene',
    nameZh: '苯',
    category: 'organic',
    shape: 'planar-ring',
    shapeZh: '平面六元环',
    summaryZh:
      '完全平面的正六边形。图中画的是凯库勒式（单双键交替），实际六个 C—C 键完全等长，π 电子离域。',
    summaryEn:
      'A perfectly flat regular hexagon. The Kekule structure with alternating bonds is drawn here; in reality all six C-C bonds are identical and the pi electrons are delocalised.',
    build() {
      const cc = 1.39
      const ch = 1.09
      const atoms = []
      const bonds = []
      for (let i = 0; i < 6; i++) {
        const a = i * 60 * DEG
        atoms.push({ element: 'C', position: [cc * Math.cos(a), cc * Math.sin(a), 0] })
      }
      for (let i = 0; i < 6; i++) {
        const a = i * 60 * DEG
        const r = cc + ch
        atoms.push({ element: 'H', position: [r * Math.cos(a), r * Math.sin(a), 0] })
        // Alternating orders give the Kekule structure.
        bonds.push({ a: i, b: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1, length: cc })
        bonds.push({ a: i, b: 6 + i, order: 1, length: ch })
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120], [1, 0, 7, 120]], planar: true },
  },
]

// ------------------------------------------------------------------- pipeline

const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' }
const toSubscript = (s) => s.replace(/\d/g, (d) => SUB[d])

/** Element -> count from a formula string such as "C2H6O". */
function parseFormula(formula) {
  const counts = new Map()
  const pattern = /([A-Z][a-z]?)(\d*)/g
  let match
  let consumed = 0
  while ((match = pattern.exec(formula)) !== null) {
    if (match[0] === '') break
    consumed += match[0].length
    counts.set(match[1], (counts.get(match[1]) ?? 0) + (match[2] === '' ? 1 : Number(match[2])))
  }
  if (consumed !== formula.length) throw new Error(`Unparsable formula: ${formula}`)
  return counts
}

/** Element -> count from the built atom list. */
function composition(atoms) {
  const counts = new Map()
  for (const a of atoms) counts.set(a.element, (counts.get(a.element) ?? 0) + 1)
  return counts
}

/**
 * Compares composition rather than formula text. The declared formulas use the
 * conventional forms chemists write (SO2, NH3); strict Hill notation would order
 * those as O2S and H3N, so a string comparison would reject correct data.
 */
function compositionMismatch(declared, atoms) {
  const want = parseFormula(declared)
  const got = composition(atoms)
  const symbols = new Set([...want.keys(), ...got.keys()])
  const diffs = []
  for (const s of symbols) {
    const w = want.get(s) ?? 0
    const g = got.get(s) ?? 0
    if (w !== g) diffs.push(`${s}: declared ${w}, built ${g}`)
  }
  return diffs
}

/** Angle at `vertex` between the bonds to `a` and `b`, degrees. */
function angleAt(positions, vertex, a, b) {
  const u = sub(positions[a], positions[vertex])
  const v = sub(positions[b], positions[vertex])
  const cosine = dot(u, v) / (len(u) * len(v))
  return Math.acos(Math.min(1, Math.max(-1, cosine))) / DEG
}

/** Dihedral a-b-c-d, degrees, unsigned. */
function dihedralAt(positions, a, b, c, d) {
  const axis = sub(positions[c], positions[b])
  const n1 = cross(sub(positions[a], positions[b]), axis)
  const n2 = cross(sub(positions[d], positions[c]), axis)
  const cosine = dot(n1, n2) / (len(n1) * len(n2))
  return Math.acos(Math.min(1, Math.max(-1, cosine))) / DEG
}

/** Largest distance of any atom from the plane through the first three. */
function outOfPlane(positions) {
  const normal = cross(sub(positions[1], positions[0]), sub(positions[2], positions[0]))
  const magnitude = len(normal)
  if (magnitude < 1e-6) return 0
  return Math.max(
    ...positions.map((p) => Math.abs(dot(sub(p, positions[0]), normal)) / magnitude),
  )
}

const problems = []
const molecules = DEFINITIONS.map((def) => {
  const { atoms, bonds } = def.build()

  // Re-derive the composition from what was actually built.
  for (const diff of compositionMismatch(def.formula, atoms)) {
    problems.push(`${def.id}: composition mismatch — ${diff}`)
  }

  // Re-measure every bond against the length its geometry was meant to reproduce.
  for (const bond of bonds) {
    const actual = dist(atoms[bond.a].position, atoms[bond.b].position)
    if (Math.abs(actual - bond.length) > 0.002) {
      problems.push(
        `${def.id}: bond ${bond.a}-${bond.b} measures ${actual.toFixed(4)} A, expected ${bond.length}`,
      )
    }
  }

  // Re-measure the declared bond angles, dihedrals and planarity. Bond lengths
  // alone would not have caught the H2O2 dihedral being built as its supplement.
  const positions = atoms.map((a) => a.position)
  for (const [vertex, a, b, expected] of def.checks?.angles ?? []) {
    const actual = angleAt(positions, vertex, a, b)
    if (Math.abs(actual - expected) > 0.05) {
      problems.push(
        `${def.id}: angle ${a}-${vertex}-${b} measures ${actual.toFixed(2)}°, expected ${expected}°`,
      )
    }
  }
  for (const [a, b, c, d, expected] of def.checks?.dihedrals ?? []) {
    const actual = dihedralAt(positions, a, b, c, d)
    if (Math.abs(actual - expected) > 0.05) {
      problems.push(
        `${def.id}: dihedral ${a}-${b}-${c}-${d} measures ${actual.toFixed(2)}°, expected ${expected}°`,
      )
    }
  }
  if (def.checks?.planar) {
    const deviation = outOfPlane(positions)
    if (deviation > 1e-3) {
      problems.push(`${def.id}: expected planar, but an atom sits ${deviation.toFixed(4)} A off`)
    }
  }

  // Nothing non-bonded should be closer than a real bond.
  const bonded = new Set(bonds.map((b) => `${Math.min(b.a, b.b)}-${Math.max(b.a, b.b)}`))
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      if (bonded.has(`${i}-${j}`)) continue
      const d = dist(atoms[i].position, atoms[j].position)
      if (d < 1.2) {
        problems.push(`${def.id}: non-bonded atoms ${i}/${j} only ${d.toFixed(3)} A apart`)
      }
    }
  }

  // Centre on the bounding box so the model spins around its visual middle.
  const axes = [0, 1, 2].map((k) => {
    const values = atoms.map((a) => a.position[k])
    return (Math.min(...values) + Math.max(...values)) / 2
  })
  const centred = atoms.map((a) => ({
    element: a.element,
    position: a.position.map((v, k) => Number((v - axes[k]).toFixed(4))),
  }))

  // Offset direction for drawing the extra lines of double and triple bonds. Taken
  // in the plane shared with a neighbouring bond so multi-bonds in planar molecules
  // (benzene, ethylene) split within the molecular plane rather than out of it.
  const enrichedBonds = bonds.map((bond) => {
    const base = { a: bond.a, b: bond.b, order: bond.order, length: bond.length }
    if (bond.order === 1) return base
    const axis = norm(sub(centred[bond.b].position, centred[bond.a].position))
    const neighbour = bonds
      .filter((o) => o !== bond)
      .map((o) => {
        if (o.a === bond.a || o.a === bond.b) return o.b
        if (o.b === bond.a || o.b === bond.b) return o.a
        return null
      })
      .find((idx) => idx !== null && idx !== undefined)
    let offset
    if (neighbour !== undefined && neighbour !== null) {
      const toNeighbour = sub(centred[neighbour].position, centred[bond.a].position)
      const normal = cross(axis, toNeighbour)
      offset = len(normal) > 1e-4 ? norm(cross(normal, axis)) : null
    }
    if (!offset) {
      const [u] = frame(axis)
      offset = u
    }
    return { ...base, offset: offset.map((v) => Number(v.toFixed(4))) }
  })

  const mass = atoms.reduce((sum, a) => {
    const m = MASS.get(a.element)
    if (m === undefined) problems.push(`${def.id}: unknown element ${a.element}`)
    return sum + (m ?? 0)
  }, 0)

  const extent = Math.max(
    ...centred.map((a) => len(a.position) + (RADII[a.element]?.vdw ?? 1.5)),
  )

  return {
    id: def.id,
    formula: def.formula,
    formulaDisplay: toSubscript(def.formulaDisplayOverride ?? def.formula),
    name: def.name,
    nameZh: def.nameZh,
    category: def.category,
    shape: def.shape,
    shapeZh: def.shapeZh,
    summaryZh: def.summaryZh,
    summaryEn: def.summaryEn,
    molarMass: Number(mass.toFixed(3)),
    atoms: centred,
    bonds: enrichedBonds,
    extent: Number(extent.toFixed(3)),
  }
})

if (problems.length) {
  console.error('Molecule validation failed:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

writeFileSync(OUT, `${JSON.stringify(molecules)}\n`)
writeFileSync(
  resolve(here, '../src/data/atomRadii.json'),
  `${JSON.stringify(RADII)}\n`,
)

console.log(`Wrote ${molecules.length} molecules -> ${OUT}`)
for (const m of molecules) {
  console.log(
    `  ${m.formulaDisplay.padEnd(8)} ${m.nameZh.padEnd(6)} ${String(m.atoms.length).padStart(2)} atoms, ` +
      `${String(m.bonds.length).padStart(2)} bonds, ${m.molarMass} g/mol`,
  )
}
