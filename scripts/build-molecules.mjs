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

/**
 * A bond direction at `angle` from `center`->`reference`, constrained to the plane
 * with the given normal. `side` (+1/-1) picks which way it bends.
 *
 * Preferred over `branch` for planar molecules: it pins the result to an explicit
 * plane instead of whatever frame `frame()` happens to derive from the axis.
 */
function inPlane(center, reference, angle, distance, planeNormal, side = 1) {
  const w = norm(sub(reference, center))
  const u = mul(norm(cross(norm(planeNormal), w)), side)
  const a = angle * DEG
  return add(center, mul(add(mul(w, Math.cos(a)), mul(u, Math.sin(a))), distance))
}

/** Ideal angle between a tetrahedral bond and the reverse of its axial partner. */
const TETRAHEDRAL_CONE = 70.5288

/**
 * Polar angle from the C3 axis for three equivalent bonds subtending `angle`,
 * as in ammonia or phosphine.
 */
function pyramidAxisAngle(angle) {
  return Math.asin(Math.sqrt((1 - Math.cos(angle * DEG)) / 1.5)) / DEG
}

/** The three hydrogens of a methyl group on `carbon`, pointing away from `attachedTo`. */
function methyl(carbon, attachedTo, distance, phase = 0) {
  return cone(carbon, sub(carbon, attachedTo), 3, TETRAHEDRAL_CONE, distance, phase)
}

/** Unit vectors to the corners of a regular tetrahedron. */
const TETRAHEDRON = [
  [1, 1, 1],
  [1, -1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
].map(norm)

/** Unit vectors to the corners of a regular octahedron. */
const OCTAHEDRON = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

/** Places atoms along the given unit directions at `distance` from `center`. */
function place(center, directions, distance) {
  return directions.map((d) => add(center, mul(norm(d), distance)))
}

/** `count` positions evenly spaced on a circle in the xy-plane. */
function ring(center, count, radius, phase = 0) {
  return Array.from({ length: count }, (_, i) => {
    const a = (phase + (360 / count) * i) * DEG
    return add(center, [Math.cos(a) * radius, Math.sin(a) * radius, 0])
  })
}

/**
 * Ring radius and half-height of a puckered S8-style crown: eight atoms alternating
 * above and below a circle. Solved from the bond length and bond angle rather than
 * transcribed, so the crown stays self-consistent.
 */
function crown8(bond, angle) {
  const step = 45 * DEG
  // For adjacent atoms: |d|^2 = k1*r^2 + h^2, and the dot product of the two bond
  // vectors at a vertex is k2*r^2 + h^2.
  const k1 = 2 - 2 * Math.cos(step)
  const k2 = (Math.cos(step) - 1) ** 2 - Math.sin(step) ** 2
  const c = Math.cos(angle * DEG)
  const m = (k2 - c * k1) / (c - 1)
  const rSquared = bond ** 2 / (k1 + m)
  return { radius: Math.sqrt(rSquared), height: Math.sqrt(m * rSquared) }
}

/**
 * The 60 vertices of a truncated icosahedron (buckminsterfullerene), as the cyclic
 * permutations of the standard coordinate triples. Edge length of the raw
 * construction is 2, so callers scale to the bond length they want.
 */
function truncatedIcosahedron(bond) {
  const phi = (1 + Math.sqrt(5)) / 2
  const seeds = [
    [0, 1, 3 * phi],
    [1, 2 + phi, 2 * phi],
    [2, 1 + 2 * phi, phi],
  ]
  const scale = bond / 2
  const points = []
  const seen = new Set()
  for (const seed of seeds) {
    for (let rot = 0; rot < 3; rot++) {
      const base = [seed[rot % 3], seed[(rot + 1) % 3], seed[(rot + 2) % 3]]
      for (const sx of [1, -1]) {
        for (const sy of [1, -1]) {
          for (const sz of [1, -1]) {
            // `|| 0` collapses -0 so the zero coordinate does not produce duplicates.
            const p = [(base[0] * sx) || 0, (base[1] * sy) || 0, (base[2] * sz) || 0]
            const key = p.map((v) => v.toFixed(6)).join(',')
            if (seen.has(key)) continue
            seen.add(key)
            points.push(mul(p, scale))
          }
        }
      }
    }
  }
  return points
}

/** Connects every pair of points at the shortest pairwise distance. */
function bondsByProximity(points, order = 1) {
  let shortest = Infinity
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      shortest = Math.min(shortest, dist(points[i], points[j]))
    }
  }
  const bonds = []
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (dist(points[i], points[j]) <= shortest * 1.05) {
        bonds.push({ a: i, b: j, order, length: Number(shortest.toFixed(4)) })
      }
    }
  }
  return bonds
}

// ------------------------------------------------------------- radii per symbol

/** Covalent radii (Cordero 2008) and van der Waals radii (Bondi / Alvarez). */
const RADII = {
  H: { covalent: 0.31, vdw: 1.1 },
  B: { covalent: 0.84, vdw: 1.92 },
  C: { covalent: 0.76, vdw: 1.7 },
  N: { covalent: 0.71, vdw: 1.55 },
  O: { covalent: 0.66, vdw: 1.52 },
  F: { covalent: 0.57, vdw: 1.47 },
  P: { covalent: 1.07, vdw: 1.8 },
  S: { covalent: 1.05, vdw: 1.8 },
  Cl: { covalent: 1.02, vdw: 1.75 },
  Br: { covalent: 1.2, vdw: 1.85 },
  I: { covalent: 1.39, vdw: 1.98 },
  Xe: { covalent: 1.4, vdw: 2.16 },
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
  // ---- 单质（续） ----
  {
    id: 'f2',
    formula: 'F2',
    name: 'Fluorine',
    nameZh: '氟气',
    category: 'element',
    shape: 'linear',
    shapeZh: '直线形',
    summaryZh: '淡黄色气体，已知氧化性最强的单质，几乎能与所有元素反应。',
    summaryEn:
      'A pale yellow gas and the strongest elemental oxidiser known, reacting with almost every other element.',
    build() {
      const d = 1.412
      return {
        atoms: [
          { element: 'F', position: [-d / 2, 0, 0] },
          { element: 'F', position: [d / 2, 0, 0] },
        ],
        bonds: [{ a: 0, b: 1, order: 1, length: d }],
      }
    },
  },
  {
    id: 'br2',
    formula: 'Br2',
    name: 'Bromine',
    nameZh: '溴',
    category: 'element',
    shape: 'linear',
    shapeZh: '直线形',
    summaryZh: '常温下唯一的液态非金属单质，深红棕色，易挥发。',
    summaryEn:
      'The only nonmetal that is liquid at room temperature: a dark red-brown liquid that evaporates readily.',
    build() {
      const d = 2.281
      return {
        atoms: [
          { element: 'Br', position: [-d / 2, 0, 0] },
          { element: 'Br', position: [d / 2, 0, 0] },
        ],
        bonds: [{ a: 0, b: 1, order: 1, length: d }],
      }
    },
  },
  {
    id: 'i2',
    formula: 'I2',
    name: 'Iodine',
    nameZh: '碘',
    category: 'element',
    shape: 'linear',
    shapeZh: '直线形',
    summaryZh: '紫黑色固体，受热直接升华为紫色蒸气。遇淀粉显蓝色。',
    summaryEn:
      'A violet-black solid that sublimes straight to a purple vapour, and turns starch deep blue.',
    build() {
      const d = 2.666
      return {
        atoms: [
          { element: 'I', position: [-d / 2, 0, 0] },
          { element: 'I', position: [d / 2, 0, 0] },
        ],
        bonds: [{ a: 0, b: 1, order: 1, length: d }],
      }
    },
  },
  {
    id: 'p4',
    formula: 'P4',
    name: 'White phosphorus',
    nameZh: '白磷',
    category: 'element',
    shape: 'tetrahedral',
    shapeZh: '正四面体形',
    summaryZh:
      '四个磷原子构成正四面体，每个键角只有 60°，张力极大 —— 这正是白磷能在空气中自燃的原因。',
    summaryEn:
      'Four phosphorus atoms at the corners of a tetrahedron. The 60° bond angles are hugely strained, which is why white phosphorus ignites spontaneously in air.',
    build() {
      const edge = 2.21
      // Vertices of a regular tetrahedron are 1.632 circumradii apart.
      const positions = place([0, 0, 0], TETRAHEDRON, edge / 1.632993)
      const bonds = []
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) bonds.push({ a: i, b: j, order: 1, length: edge })
      }
      return { atoms: positions.map((p) => ({ element: 'P', position: p })), bonds }
    },
    checks: { angles: [[0, 1, 2, 60]] },
  },
  {
    id: 's8',
    formula: 'S8',
    name: 'Sulfur',
    nameZh: '硫',
    category: 'element',
    shape: 'crown',
    shapeZh: '八元皇冠形',
    summaryZh: '常见的斜方硫由 S₈ 环组成，八个硫原子上下交错形成"皇冠"，并非平面环。',
    summaryEn:
      'Ordinary sulfur is built from S8 rings. The eight atoms alternate above and below the mean plane, forming a crown rather than a flat ring.',
    build() {
      const bond = 2.055
      const { radius, height } = crown8(bond, 108.0)
      const atoms = Array.from({ length: 8 }, (_, i) => {
        const a = i * 45 * DEG
        return {
          element: 'S',
          position: [
            radius * Math.cos(a),
            radius * Math.sin(a),
            (i % 2 === 0 ? 1 : -1) * (height / 2),
          ],
        }
      })
      const bonds = Array.from({ length: 8 }, (_, i) => ({
        a: i,
        b: (i + 1) % 8,
        order: 1,
        length: bond,
      }))
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 7, 108.0]] },
  },
  {
    id: 'c60',
    formula: 'C60',
    name: 'Buckminsterfullerene',
    nameZh: '富勒烯',
    category: 'element',
    shape: 'truncated-icosahedron',
    shapeZh: '截角二十面体',
    idealized: true,
    summaryZh:
      '60 个碳原子构成 20 个六边形和 12 个五边形，形状与足球完全一致。每个碳只与三个碳相连。',
    summaryEn:
      'Sixty carbons forming 20 hexagons and 12 pentagons, exactly the shape of a football. Every carbon bonds to just three others.',
    build() {
      const bond = 1.43
      const points = truncatedIcosahedron(bond)
      return {
        atoms: points.map((p) => ({ element: 'C', position: p })),
        bonds: bondsByProximity(points),
      }
    },
    // 3-regular with 90 edges is what distinguishes a true truncated icosahedron from a
    // mis-generated point cloud, so assert it rather than trusting the construction.
    checks: { degree: 3, bondCount: 90 },
  },

  // ---- 无机物（续） ----
  {
    id: 'hf',
    formula: 'HF',
    name: 'Hydrogen fluoride',
    nameZh: '氟化氢',
    category: 'inorganic',
    shape: 'linear',
    shapeZh: '直线形',
    summaryZh: '极性极强，分子间氢键很强，因此沸点远高于同族的 HCl。水溶液能腐蚀玻璃。',
    summaryEn:
      'Extremely polar with strong hydrogen bonding, so it boils far higher than HCl. Its solution etches glass.',
    build() {
      const d = 0.917
      return {
        atoms: [
          { element: 'H', position: [-d / 2, 0, 0] },
          { element: 'F', position: [d / 2, 0, 0] },
        ],
        bonds: [{ a: 0, b: 1, order: 1, length: d }],
      }
    },
  },
  {
    id: 'hcn',
    formula: 'HCN',
    name: 'Hydrogen cyanide',
    nameZh: '氰化氢',
    category: 'inorganic',
    shape: 'linear',
    shapeZh: '直线形',
    summaryZh: '剧毒，有苦杏仁味。三个原子严格共线，碳氮之间是三键。',
    summaryEn:
      'Highly toxic, smelling of bitter almonds. All three atoms are collinear, with a triple bond between carbon and nitrogen.',
    build() {
      const ch = 1.064
      const cn = 1.156
      return {
        atoms: [
          { element: 'C', position: [0, 0, 0] },
          { element: 'H', position: [-ch, 0, 0] },
          { element: 'N', position: [cn, 0, 0] },
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: ch },
          { a: 0, b: 2, order: 3, length: cn },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 180]] },
  },
  {
    id: 'no',
    formula: 'NO',
    name: 'Nitric oxide',
    nameZh: '一氧化氮',
    category: 'inorganic',
    shape: 'linear',
    shapeZh: '直线形',
    summaryZh: '含奇数电子的自由基，在人体内是重要的信号分子。画作双键，实际键级约 2.5。',
    summaryEn:
      'An odd-electron radical and an important signalling molecule in the body. Drawn as a double bond, though its true bond order is about 2.5.',
    build() {
      const d = 1.154
      return {
        atoms: [
          { element: 'N', position: [-d / 2, 0, 0] },
          { element: 'O', position: [d / 2, 0, 0] },
        ],
        bonds: [{ a: 0, b: 1, order: 2, length: d }],
      }
    },
  },
  {
    id: 'no2',
    formula: 'NO2',
    name: 'Nitrogen dioxide',
    nameZh: '二氧化氮',
    category: 'inorganic',
    shape: 'bent',
    shapeZh: '角形',
    summaryZh:
      '红棕色有毒气体，光化学烟雾的成因之一。氮上的单电子使键角张开到 134°。两个 N—O 实际等长。',
    summaryEn:
      'A red-brown toxic gas and a driver of photochemical smog. The single electron on nitrogen widens the angle to 134°. Both N-O bonds are in fact equal.',
    build() {
      const d = 1.197
      const [o1, o2] = bent([0, 0, 0], 134.1, d)
      return {
        atoms: [
          { element: 'N', position: [0, 0, 0] },
          { element: 'O', position: o1 },
          { element: 'O', position: o2 },
        ],
        bonds: [
          { a: 0, b: 1, order: 2, length: d },
          { a: 0, b: 2, order: 1, length: d },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 134.1]] },
  },
  {
    id: 'n2o',
    formula: 'N2O',
    name: 'Nitrous oxide',
    nameZh: '一氧化二氮',
    category: 'inorganic',
    shape: 'linear',
    shapeZh: '直线形',
    summaryZh: '俗称笑气，早期用作麻醉剂。原子顺序是 N—N—O 而非对称排列。',
    summaryEn:
      'Laughing gas, once used as an anaesthetic. The atoms run N-N-O rather than symmetrically.',
    build() {
      const nn = 1.128
      const no = 1.184
      return {
        atoms: [
          { element: 'N', position: [0, 0, 0] },
          { element: 'N', position: [-nn, 0, 0] },
          { element: 'O', position: [no, 0, 0] },
        ],
        bonds: [
          { a: 0, b: 1, order: 3, length: nn },
          { a: 0, b: 2, order: 1, length: no },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 180]] },
  },
  {
    id: 'so3',
    formula: 'SO3',
    name: 'Sulfur trioxide',
    nameZh: '三氧化硫',
    category: 'inorganic',
    shape: 'trigonal-planar',
    shapeZh: '平面三角形',
    summaryZh: '硫上没有孤对电子，三个氧完全对称地摊在一个平面上。溶于水生成硫酸。',
    summaryEn:
      'With no lone pair on sulfur, the three oxygens spread symmetrically in one plane. Dissolving it in water gives sulfuric acid.',
    build() {
      const d = 1.42
      const os = ring([0, 0, 0], 3, d)
      return {
        atoms: [
          { element: 'S', position: [0, 0, 0] },
          ...os.map((p) => ({ element: 'O', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 2, length: d },
          { a: 0, b: 2, order: 2, length: d },
          { a: 0, b: 3, order: 2, length: d },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 120]], planar: true },
  },
  {
    id: 'bf3',
    formula: 'BF3',
    name: 'Boron trifluoride',
    nameZh: '三氟化硼',
    category: 'inorganic',
    shape: 'trigonal-planar',
    shapeZh: '平面三角形',
    summaryZh: '硼只有 6 个价电子，未达八隅体，因此是强路易斯酸，极易接受电子对。',
    summaryEn:
      'Boron carries only six valence electrons instead of an octet, making BF3 a strong Lewis acid that readily accepts an electron pair.',
    build() {
      const d = 1.313
      const fs = ring([0, 0, 0], 3, d)
      return {
        atoms: [
          { element: 'B', position: [0, 0, 0] },
          ...fs.map((p) => ({ element: 'F', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: d },
          { a: 0, b: 2, order: 1, length: d },
          { a: 0, b: 3, order: 1, length: d },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 120]], planar: true },
  },
  {
    id: 'ph3',
    formula: 'PH3',
    name: 'Phosphine',
    nameZh: '膦',
    category: 'inorganic',
    shape: 'trigonal-pyramidal',
    shapeZh: '三角锥形',
    summaryZh: '剧毒气体。键角只有 93.5°，比氨小得多 —— 磷几乎不发生轨道杂化。',
    summaryEn:
      'A highly toxic gas. Its 93.5° angle is far tighter than ammonia because phosphorus barely hybridises its orbitals.',
    build() {
      const d = 1.42
      const hs = cone([0, 0, 0], [0, 0, -1], 3, pyramidAxisAngle(93.5), d)
      return {
        atoms: [
          { element: 'P', position: [0, 0, 0] },
          ...hs.map((p) => ({ element: 'H', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: d },
          { a: 0, b: 2, order: 1, length: d },
          { a: 0, b: 3, order: 1, length: d },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 93.5]] },
  },
  {
    id: 'sf6',
    formula: 'SF6',
    name: 'Sulfur hexafluoride',
    nameZh: '六氟化硫',
    category: 'inorganic',
    shape: 'octahedral',
    shapeZh: '正八面体形',
    summaryZh:
      '六个氟严格对称包围硫，极其稳定惰性，常用作高压电气设备的绝缘气体。也是强效温室气体。',
    summaryEn:
      'Six fluorines wrap sulfur in perfect symmetry, giving a very inert gas used as insulation in high-voltage equipment. Also a potent greenhouse gas.',
    build() {
      const d = 1.564
      const fs = place([0, 0, 0], OCTAHEDRON, d)
      return {
        atoms: [
          { element: 'S', position: [0, 0, 0] },
          ...fs.map((p) => ({ element: 'F', position: p })),
        ],
        bonds: fs.map((_, i) => ({ a: 0, b: i + 1, order: 1, length: d })),
      }
    },
    checks: { angles: [[0, 1, 3, 90], [0, 1, 2, 180]] },
  },
  {
    id: 'pcl5',
    formula: 'PCl5',
    name: 'Phosphorus pentachloride',
    nameZh: '五氯化磷',
    category: 'inorganic',
    shape: 'trigonal-bipyramidal',
    shapeZh: '三角双锥形',
    summaryZh:
      '罕见的五配位分子：三个氯在赤道面上呈 120°，两个氯在轴向。轴向键比赤道键更长也更弱。',
    summaryEn:
      'A rare five-coordinate molecule: three chlorines at 120° around the equator and two on the axis. The axial bonds are longer and weaker than the equatorial ones.',
    build() {
      const equatorial = 2.02
      const axial = 2.124
      const eq = ring([0, 0, 0], 3, equatorial)
      return {
        atoms: [
          { element: 'P', position: [0, 0, 0] },
          ...eq.map((p) => ({ element: 'Cl', position: p })),
          { element: 'Cl', position: [0, 0, axial] },
          { element: 'Cl', position: [0, 0, -axial] },
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: equatorial },
          { a: 0, b: 2, order: 1, length: equatorial },
          { a: 0, b: 3, order: 1, length: equatorial },
          { a: 0, b: 4, order: 1, length: axial },
          { a: 0, b: 5, order: 1, length: axial },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 120], [0, 4, 5, 180], [0, 1, 4, 90]] },
  },
  {
    id: 'xef4',
    formula: 'XeF4',
    name: 'Xenon tetrafluoride',
    nameZh: '四氟化氙',
    category: 'inorganic',
    shape: 'square-planar',
    shapeZh: '平面正方形',
    summaryZh:
      '稀有气体并非绝对不反应 —— 这是最早合成的氙化合物之一。氙上的两对孤对电子分居上下，把四个氟压成平面正方形。',
    summaryEn:
      'Noble gases are not entirely inert: this was among the first xenon compounds made. Two lone pairs sit above and below, flattening the four fluorines into a square.',
    build() {
      const d = 1.953
      const fs = ring([0, 0, 0], 4, d)
      return {
        atoms: [
          { element: 'Xe', position: [0, 0, 0] },
          ...fs.map((p) => ({ element: 'F', position: p })),
        ],
        bonds: fs.map((_, i) => ({ a: 0, b: i + 1, order: 1, length: d })),
      }
    },
    checks: { angles: [[0, 1, 2, 90], [0, 1, 3, 180]], planar: true },
  },
  {
    id: 'h2so4',
    formula: 'H2SO4',
    name: 'Sulfuric acid',
    nameZh: '硫酸',
    category: 'inorganic',
    shape: 'tetrahedral',
    shapeZh: '四面体形',
    summaryZh:
      '产量最大的工业化学品。硫居四面体中心，两个 S=O 较短，两个 S—OH 较长，可电离出两个质子。',
    summaryEn:
      'The most-produced industrial chemical. Sulfur sits at the centre of a tetrahedron with two short S=O bonds and two longer S-OH bonds, releasing two protons.',
    build() {
      const so = 1.422
      const soh = 1.574
      const oh = 0.97
      const s = [0, 0, 0]
      const [d1, d2, d3, d4] = TETRAHEDRON
      const od1 = add(s, mul(d1, so))
      const od2 = add(s, mul(d2, so))
      const oh1 = add(s, mul(d3, soh))
      const oh2 = add(s, mul(d4, soh))
      return {
        atoms: [
          { element: 'S', position: s },
          { element: 'O', position: od1 },
          { element: 'O', position: od2 },
          { element: 'O', position: oh1 },
          { element: 'O', position: oh2 },
          { element: 'H', position: branch(oh1, s, 108.5, oh, 0) },
          { element: 'H', position: branch(oh2, s, 108.5, oh, 0) },
        ],
        bonds: [
          { a: 0, b: 1, order: 2, length: so },
          { a: 0, b: 2, order: 2, length: so },
          { a: 0, b: 3, order: 1, length: soh },
          { a: 0, b: 4, order: 1, length: soh },
          { a: 3, b: 5, order: 1, length: oh },
          { a: 4, b: 6, order: 1, length: oh },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 109.47], [3, 0, 5, 108.5]] },
  },
  {
    id: 'hno3',
    formula: 'HNO3',
    name: 'Nitric acid',
    nameZh: '硝酸',
    category: 'inorganic',
    shape: 'planar',
    shapeZh: '平面形',
    summaryZh: '强氧化性酸。整个分子共平面，氮周围三个氧的夹角并不相等。',
    summaryEn:
      'A strongly oxidising acid. The whole molecule is planar, and the three oxygens around nitrogen are not evenly spaced.',
    build() {
      const n = [0, 0, 0]
      const normal = [0, 0, 1]
      const od = [1.211, 0, 0]
      // Angles around nitrogen sum to 360°, which is what makes the centre planar.
      const oMid = inPlane(n, od, 130.3, 1.199, normal, 1)
      const ohO = inPlane(n, od, 115.9, 1.406, normal, -1)
      return {
        atoms: [
          { element: 'N', position: n },
          { element: 'O', position: od },
          { element: 'O', position: oMid },
          { element: 'O', position: ohO },
          { element: 'H', position: inPlane(ohO, n, 102.2, 0.964, normal, 1) },
        ],
        bonds: [
          { a: 0, b: 1, order: 2, length: 1.211 },
          { a: 0, b: 2, order: 2, length: 1.199 },
          { a: 0, b: 3, order: 1, length: 1.406 },
          { a: 3, b: 4, order: 1, length: 0.964 },
        ],
      }
    },
    checks: {
      angles: [[0, 1, 2, 130.3], [0, 1, 3, 115.9], [3, 0, 4, 102.2]],
      planar: true,
    },
  },

  // ---- 有机物（续） ----
  {
    id: 'c2h6',
    formula: 'C2H6',
    name: 'Ethane',
    nameZh: '乙烷',
    category: 'organic',
    shape: 'staggered',
    shapeZh: '交错式',
    summaryZh:
      '天然气的第二大成分。两端甲基呈交错式（相差 60°），这是能量最低的构象 —— 单键可自由旋转。',
    summaryEn:
      'The second biggest component of natural gas. The two methyl groups sit staggered by 60°, the lowest-energy conformation, since single bonds rotate freely.',
    build() {
      const cc = 1.535
      const ch = 1.094
      const axis = [0, 0, 1]
      const c1 = [0, 0, -cc / 2]
      const c2 = [0, 0, cc / 2]
      // Both ends are placed against the same axis so the 60° stagger is exact.
      const h1 = [0, 120, 240].map((phi) => aroundAxis(c1, axis, 111.2, ch, phi))
      const h2 = [60, 180, 300].map((phi) => aroundAxis(c2, axis, 180 - 111.2, ch, phi))
      return {
        atoms: [
          { element: 'C', position: c1 },
          { element: 'C', position: c2 },
          ...h1.map((p) => ({ element: 'H', position: p })),
          ...h2.map((p) => ({ element: 'H', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: cc },
          { a: 0, b: 2, order: 1, length: ch },
          { a: 0, b: 3, order: 1, length: ch },
          { a: 0, b: 4, order: 1, length: ch },
          { a: 1, b: 5, order: 1, length: ch },
          { a: 1, b: 6, order: 1, length: ch },
          { a: 1, b: 7, order: 1, length: ch },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 111.2]], dihedrals: [[2, 0, 1, 5, 60]] },
  },
  {
    id: 'c3h8',
    formula: 'C3H8',
    name: 'Propane',
    nameZh: '丙烷',
    category: 'organic',
    shape: 'bent-chain',
    shapeZh: '折线链',
    summaryZh: '液化石油气的主要成分。碳链并非直线，C—C—C 夹角约 112°。',
    summaryEn:
      'The main component of LPG. The carbon chain is not straight: the C-C-C angle is about 112°.',
    build() {
      const cc = 1.532
      const ch = 1.094
      const c2 = [0, 0, 0]
      const [c1, c3] = bent(c2, 112.4, cc)
      return {
        atoms: [
          { element: 'C', position: c2 },
          { element: 'C', position: c1 },
          { element: 'C', position: c3 },
          ...completeSp3(c2, c1, c3, 106.1, 1.096).map((p) => ({ element: 'H', position: p })),
          ...methyl(c1, c2, ch).map((p) => ({ element: 'H', position: p })),
          ...methyl(c3, c2, ch).map((p) => ({ element: 'H', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: cc },
          { a: 0, b: 2, order: 1, length: cc },
          { a: 0, b: 3, order: 1, length: 1.096 },
          { a: 0, b: 4, order: 1, length: 1.096 },
          { a: 1, b: 5, order: 1, length: ch },
          { a: 1, b: 6, order: 1, length: ch },
          { a: 1, b: 7, order: 1, length: ch },
          { a: 2, b: 8, order: 1, length: ch },
          { a: 2, b: 9, order: 1, length: ch },
          { a: 2, b: 10, order: 1, length: ch },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 112.4], [0, 3, 4, 106.1]] },
  },
  {
    id: 'ch3cl',
    formula: 'CH3Cl',
    name: 'Chloromethane',
    nameZh: '氯甲烷',
    category: 'organic',
    shape: 'tetrahedral',
    shapeZh: '四面体形',
    summaryZh: '甲烷的一个氢被氯取代。氯的体积和电负性都远大于氢，分子因此有明显极性。',
    summaryEn:
      'Methane with one hydrogen swapped for chlorine. Chlorine is both far bigger and far more electronegative, so the molecule is distinctly polar.',
    build() {
      const ccl = 1.785
      const ch = 1.087
      const c = [0, 0, 0]
      const cl = [0, 0, ccl]
      const hs = cone(c, [0, 0, 1], 3, 108.6, ch)
      return {
        atoms: [
          { element: 'C', position: c },
          { element: 'Cl', position: cl },
          ...hs.map((p) => ({ element: 'H', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: ccl },
          { a: 0, b: 2, order: 1, length: ch },
          { a: 0, b: 3, order: 1, length: ch },
          { a: 0, b: 4, order: 1, length: ch },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 108.6]] },
  },
  {
    id: 'chcl3',
    formula: 'CHCl3',
    name: 'Chloroform',
    nameZh: '三氯甲烷',
    category: 'organic',
    shape: 'tetrahedral',
    shapeZh: '四面体形',
    summaryZh: '俗称氯仿，早期用作吸入麻醉剂，现主要作溶剂。',
    summaryEn:
      'Chloroform: once used as an inhaled anaesthetic, now mostly a laboratory solvent.',
    build() {
      const ccl = 1.758
      const ch = 1.1
      const c = [0, 0, 0]
      const h = [0, 0, ch]
      const cls = cone(c, [0, 0, 1], 3, 107.6, ccl)
      return {
        atoms: [
          { element: 'C', position: c },
          { element: 'H', position: h },
          ...cls.map((p) => ({ element: 'Cl', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: ch },
          { a: 0, b: 2, order: 1, length: ccl },
          { a: 0, b: 3, order: 1, length: ccl },
          { a: 0, b: 4, order: 1, length: ccl },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 107.6]] },
  },
  {
    id: 'ccl4',
    formula: 'CCl4',
    name: 'Carbon tetrachloride',
    nameZh: '四氯化碳',
    category: 'organic',
    shape: 'tetrahedral',
    shapeZh: '正四面体形',
    summaryZh: '完美的正四面体，四个 C—Cl 极性彼此抵消，整体无极性。曾用作灭火剂，因毒性已淘汰。',
    summaryEn:
      'A perfect tetrahedron whose four polar C-Cl bonds cancel, leaving the molecule non-polar. Once used in fire extinguishers, now retired for its toxicity.',
    build() {
      const d = 1.767
      const cls = place([0, 0, 0], TETRAHEDRON, d)
      return {
        atoms: [
          { element: 'C', position: [0, 0, 0] },
          ...cls.map((p) => ({ element: 'Cl', position: p })),
        ],
        bonds: cls.map((_, i) => ({ a: 0, b: i + 1, order: 1, length: d })),
      }
    },
    checks: { angles: [[0, 1, 2, 109.47]] },
  },
  {
    id: 'ch3cho',
    formula: 'C2H4O',
    formulaDisplayOverride: 'CH3CHO',
    name: 'Acetaldehyde',
    nameZh: '乙醛',
    category: 'organic',
    shape: 'planar-sp2',
    shapeZh: '含平面三角中心',
    summaryZh: '酒精在体内的第一步代谢产物，也是宿醉和脸红的元凶。醛基部分是平面的。',
    summaryEn:
      'The first product of alcohol metabolism, and the cause of hangovers and flushing. The aldehyde group is planar.',
    build() {
      const cc = 1.501
      const co = 1.216
      const chAldehyde = 1.106
      const chMethyl = 1.086
      const normal = [0, 0, 1]
      const c2 = [0, 0, 0]
      const c1 = [-cc, 0, 0]
      return {
        atoms: [
          { element: 'C', position: c2 },
          { element: 'C', position: c1 },
          { element: 'O', position: inPlane(c2, c1, 124.1, co, normal, 1) },
          { element: 'H', position: inPlane(c2, c1, 115.3, chAldehyde, normal, -1) },
          ...methyl(c1, c2, chMethyl).map((p) => ({ element: 'H', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: cc },
          { a: 0, b: 2, order: 2, length: co },
          { a: 0, b: 3, order: 1, length: chAldehyde },
          { a: 1, b: 4, order: 1, length: chMethyl },
          { a: 1, b: 5, order: 1, length: chMethyl },
          { a: 1, b: 6, order: 1, length: chMethyl },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 124.1], [0, 2, 3, 120.6]] },
  },
  {
    id: 'acetone',
    formula: 'C3H6O',
    formulaDisplayOverride: 'CH3COCH3',
    name: 'Acetone',
    nameZh: '丙酮',
    category: 'organic',
    shape: 'planar-sp2',
    shapeZh: '含平面三角中心',
    summaryZh: '最简单的酮，常见的洗甲水和溶剂。羰基碳与相连的三个原子严格共面。',
    summaryEn:
      'The simplest ketone, familiar as nail-polish remover and solvent. The carbonyl carbon is exactly coplanar with its three neighbours.',
    build() {
      const cc = 1.507
      const co = 1.222
      const ch = 1.086
      const normal = [0, 0, 1]
      const c = [0, 0, 0]
      const o = [0, co, 0]
      const c1 = inPlane(c, o, 122.0, cc, normal, 1)
      const c3 = inPlane(c, o, 122.0, cc, normal, -1)
      return {
        atoms: [
          { element: 'C', position: c },
          { element: 'O', position: o },
          { element: 'C', position: c1 },
          { element: 'C', position: c3 },
          ...methyl(c1, c, ch).map((p) => ({ element: 'H', position: p })),
          ...methyl(c3, c, ch).map((p) => ({ element: 'H', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 2, length: co },
          { a: 0, b: 2, order: 1, length: cc },
          { a: 0, b: 3, order: 1, length: cc },
          { a: 2, b: 4, order: 1, length: ch },
          { a: 2, b: 5, order: 1, length: ch },
          { a: 2, b: 6, order: 1, length: ch },
          { a: 3, b: 7, order: 1, length: ch },
          { a: 3, b: 8, order: 1, length: ch },
          { a: 3, b: 9, order: 1, length: ch },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 122.0], [0, 2, 3, 116.0]] },
  },
  {
    id: 'ch3cooh',
    formula: 'C2H4O2',
    formulaDisplayOverride: 'CH3COOH',
    name: 'Acetic acid',
    nameZh: '乙酸',
    category: 'organic',
    shape: 'planar-sp2',
    shapeZh: '含平面三角中心',
    summaryZh: '食醋的酸味来源。羧基中的 C=O 比 C—O 明显更短，这是判断羧酸结构的关键。',
    summaryEn:
      'What makes vinegar sour. Within the carboxyl group the C=O is clearly shorter than the C-O, the giveaway of a carboxylic acid.',
    build() {
      const cc = 1.52
      const co = 1.214
      const coh = 1.364
      const oh = 0.97
      const ch = 1.09
      const normal = [0, 0, 1]
      const carboxyl = [0, 0, 0]
      const methylC = [-cc, 0, 0]
      const oDouble = inPlane(carboxyl, methylC, 126.6, co, normal, 1)
      const oHydroxyl = inPlane(carboxyl, methylC, 111.5, coh, normal, -1)
      return {
        atoms: [
          { element: 'C', position: carboxyl },
          { element: 'C', position: methylC },
          { element: 'O', position: oDouble },
          { element: 'O', position: oHydroxyl },
          // Syn conformer: the hydroxyl H points back toward the carbonyl oxygen.
          { element: 'H', position: inPlane(oHydroxyl, carboxyl, 107.0, oh, normal, 1) },
          ...methyl(methylC, carboxyl, ch).map((p) => ({ element: 'H', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: cc },
          { a: 0, b: 2, order: 2, length: co },
          { a: 0, b: 3, order: 1, length: coh },
          { a: 3, b: 4, order: 1, length: oh },
          { a: 1, b: 5, order: 1, length: ch },
          { a: 1, b: 6, order: 1, length: ch },
          { a: 1, b: 7, order: 1, length: ch },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 126.6], [0, 1, 3, 111.5], [3, 0, 4, 107.0]] },
  },
  {
    id: 'ch3och3',
    formula: 'C2H6O',
    formulaDisplayOverride: 'CH3OCH3',
    name: 'Dimethyl ether',
    nameZh: '二甲醚',
    category: 'organic',
    shape: 'bent',
    shapeZh: '角形',
    summaryZh:
      '与乙醇分子式完全相同（C₂H₆O）却是不同的物质 —— 经典的同分异构体。没有羟基，所以沸点低得多。',
    summaryEn:
      'Same formula as ethanol (C2H6O) but a different substance: the classic pair of structural isomers. With no hydroxyl group it boils far lower.',
    build() {
      const co = 1.41
      const ch = 1.091
      const o = [0, 0, 0]
      const [c1, c2] = bent(o, 111.7, co)
      return {
        atoms: [
          { element: 'O', position: o },
          { element: 'C', position: c1 },
          { element: 'C', position: c2 },
          ...methyl(c1, o, ch).map((p) => ({ element: 'H', position: p })),
          ...methyl(c2, o, ch).map((p) => ({ element: 'H', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: co },
          { a: 0, b: 2, order: 1, length: co },
          { a: 1, b: 3, order: 1, length: ch },
          { a: 1, b: 4, order: 1, length: ch },
          { a: 1, b: 5, order: 1, length: ch },
          { a: 2, b: 6, order: 1, length: ch },
          { a: 2, b: 7, order: 1, length: ch },
          { a: 2, b: 8, order: 1, length: ch },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 111.7]] },
  },
  {
    id: 'toluene',
    formula: 'C7H8',
    name: 'Toluene',
    nameZh: '甲苯',
    category: 'organic',
    shape: 'planar-ring',
    shapeZh: '苯环 + 甲基',
    summaryZh: '苯环上接一个甲基，是最常用的有机溶剂之一。苯环仍然完全平面，甲基可自由旋转。',
    summaryEn:
      'A benzene ring carrying one methyl group, and one of the most widely used organic solvents. The ring stays perfectly flat while the methyl spins freely.',
    build() {
      const cc = 1.397
      const chRing = 1.084
      const cMethyl = 1.524
      const chMethyl = 1.09
      const atoms = []
      const bonds = []
      const ringCarbons = ring([0, 0, 0], 6, cc)
      ringCarbons.forEach((p) => atoms.push({ element: 'C', position: p }))
      for (let i = 0; i < 6; i++) {
        bonds.push({ a: i, b: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1, length: cc })
      }
      // Ring position 0 carries the methyl; the other five carry hydrogens.
      const methylCarbon = mul(norm(ringCarbons[0]), cc + cMethyl)
      atoms.push({ element: 'C', position: methylCarbon })
      bonds.push({ a: 0, b: 6, order: 1, length: cMethyl })
      for (let i = 1; i < 6; i++) {
        atoms.push({ element: 'H', position: mul(norm(ringCarbons[i]), cc + chRing) })
        bonds.push({ a: i, b: atoms.length - 1, order: 1, length: chRing })
      }
      for (const h of methyl(methylCarbon, ringCarbons[0], chMethyl, 90)) {
        atoms.push({ element: 'H', position: h })
        bonds.push({ a: 6, b: atoms.length - 1, order: 1, length: chMethyl })
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120], [0, 1, 6, 120]] },
  },
  {
    id: 'phenol',
    formula: 'C6H6O',
    formulaDisplayOverride: 'C6H5OH',
    name: 'Phenol',
    nameZh: '苯酚',
    category: 'organic',
    shape: 'planar-ring',
    shapeZh: '苯环 + 羟基',
    summaryZh:
      '羟基直接连在苯环上。苯环的吸电子作用使它的酸性远强于普通的醇，因此曾叫"石炭酸"。',
    summaryEn:
      'A hydroxyl bonded straight onto a benzene ring. The ring pulls electron density away, making phenol far more acidic than an ordinary alcohol.',
    build() {
      const cc = 1.397
      const chRing = 1.084
      const co = 1.375
      const oh = 0.956
      const normal = [0, 0, 1]
      const atoms = []
      const bonds = []
      const ringCarbons = ring([0, 0, 0], 6, cc)
      ringCarbons.forEach((p) => atoms.push({ element: 'C', position: p }))
      for (let i = 0; i < 6; i++) {
        bonds.push({ a: i, b: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1, length: cc })
      }
      const oxygen = mul(norm(ringCarbons[0]), cc + co)
      atoms.push({ element: 'O', position: oxygen })
      bonds.push({ a: 0, b: 6, order: 1, length: co })
      // Pinned to the ring plane; phenol's hydroxyl is coplanar with the ring.
      atoms.push({ element: 'H', position: inPlane(oxygen, ringCarbons[0], 108.8, oh, normal, 1) })
      bonds.push({ a: 6, b: 7, order: 1, length: oh })
      for (let i = 1; i < 6; i++) {
        atoms.push({ element: 'H', position: mul(norm(ringCarbons[i]), cc + chRing) })
        bonds.push({ a: i, b: atoms.length - 1, order: 1, length: chRing })
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120], [6, 0, 7, 108.8]], planar: true },
  },
  {
    id: 'naphthalene',
    formula: 'C10H8',
    name: 'Naphthalene',
    nameZh: '萘',
    category: 'organic',
    shape: 'fused-rings',
    shapeZh: '并环平面',
    idealized: true,
    summaryZh:
      '两个苯环共用一条边，全部十个碳共面。传统樟脑丸的成分。此处按正六边形理想化，实际各 C—C 键长略有差异。',
    summaryEn:
      'Two benzene rings sharing an edge, with all ten carbons in one plane. The old-fashioned mothball. Idealised here as regular hexagons; the real C-C lengths vary slightly.',
    build() {
      const cc = 1.4
      const ch = 1.09
      const apothem = (cc * Math.sqrt(3)) / 2
      const centreRight = [apothem, 0, 0]
      const centreLeft = [-apothem, 0, 0]
      // Flat-topped hexagons: vertices at 30°, 90°, ... so the shared edge is vertical.
      const right = ring(centreRight, 6, cc, 30)
      const left = ring(centreLeft, 6, cc, 30)
      // right[2]/right[3] and left[0]/left[5] are the same two atoms — the shared
      // edge sits at x = 0 — so the left ring contributes only left[1..4].
      const atoms = [
        { element: 'C', position: right[0] },
        { element: 'C', position: right[1] },
        { element: 'C', position: right[2] },
        { element: 'C', position: right[3] },
        { element: 'C', position: right[4] },
        { element: 'C', position: right[5] },
        { element: 'C', position: left[1] },
        { element: 'C', position: left[2] },
        { element: 'C', position: left[3] },
        { element: 'C', position: left[4] },
      ]
      // A Kekule structure: every carbon carries exactly one double bond.
      const bonds = [
        { a: 0, b: 1, order: 2, length: cc },
        { a: 1, b: 2, order: 1, length: cc },
        { a: 2, b: 3, order: 2, length: cc },
        { a: 3, b: 4, order: 1, length: cc },
        { a: 4, b: 5, order: 2, length: cc },
        { a: 5, b: 0, order: 1, length: cc },
        { a: 2, b: 6, order: 1, length: cc },
        { a: 6, b: 7, order: 2, length: cc },
        { a: 7, b: 8, order: 1, length: cc },
        { a: 8, b: 9, order: 2, length: cc },
        { a: 9, b: 3, order: 1, length: cc },
      ]
      // The two fusion carbons (indices 2 and 3) carry no hydrogen.
      const hydrogenOn = [
        [0, centreRight],
        [1, centreRight],
        [4, centreRight],
        [5, centreRight],
        [6, centreLeft],
        [7, centreLeft],
        [8, centreLeft],
        [9, centreLeft],
      ]
      for (const [index, centre] of hydrogenOn) {
        const outward = norm(sub(atoms[index].position, centre))
        atoms.push({ element: 'H', position: add(atoms[index].position, mul(outward, ch)) })
        bonds.push({ a: index, b: atoms.length - 1, order: 1, length: ch })
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120]], planar: true },
  },
  {
    id: 'urea',
    formula: 'CH4N2O',
    formulaDisplayOverride: 'CO(NH2)2',
    name: 'Urea',
    nameZh: '尿素',
    category: 'organic',
    shape: 'planar',
    shapeZh: '平面形',
    idealized: true,
    summaryZh:
      '1828 年维勒由无机物合成尿素，第一次打破"有机物只能来自生命"的观念。也是最重要的氮肥。',
    summaryEn:
      'Wohler made urea from inorganic materials in 1828, breaking the idea that organic compounds could only come from living things. It is also the leading nitrogen fertiliser.',
    build() {
      const co = 1.221
      const cn = 1.368
      const nh = 1.005
      const normal = [0, 0, 1]
      const c = [0, 0, 0]
      const o = [0, co, 0]
      const n1 = inPlane(c, o, 122.85, cn, normal, 1)
      const n2 = inPlane(c, o, 122.85, cn, normal, -1)
      return {
        atoms: [
          { element: 'C', position: c },
          { element: 'O', position: o },
          { element: 'N', position: n1 },
          { element: 'N', position: n2 },
          { element: 'H', position: inPlane(n1, c, 119.0, nh, normal, 1) },
          { element: 'H', position: inPlane(n1, c, 119.0, nh, normal, -1) },
          { element: 'H', position: inPlane(n2, c, 119.0, nh, normal, 1) },
          { element: 'H', position: inPlane(n2, c, 119.0, nh, normal, -1) },
        ],
        bonds: [
          { a: 0, b: 1, order: 2, length: co },
          { a: 0, b: 2, order: 1, length: cn },
          { a: 0, b: 3, order: 1, length: cn },
          { a: 2, b: 4, order: 1, length: nh },
          { a: 2, b: 5, order: 1, length: nh },
          { a: 3, b: 6, order: 1, length: nh },
          { a: 3, b: 7, order: 1, length: nh },
        ],
      }
    },
    checks: { angles: [[0, 2, 3, 114.3], [2, 4, 5, 122.0]], planar: true },
  },
  {
    id: 'glycine',
    formula: 'C2H5NO2',
    formulaDisplayOverride: 'NH2CH2COOH',
    name: 'Glycine',
    nameZh: '甘氨酸',
    category: 'organic',
    shape: 'chain',
    shapeZh: '链形',
    idealized: true,
    summaryZh:
      '最简单的氨基酸，也是唯一没有手性的氨基酸。一端是氨基，另一端是羧基 —— 蛋白质就靠这两端相连成链。',
    summaryEn:
      'The simplest amino acid and the only one without chirality. An amino group at one end, a carboxyl at the other: proteins are chains linked through exactly these two ends.',
    build() {
      const cc = 1.516
      const cn = 1.467
      const co = 1.211
      const coh = 1.343
      const oh = 0.972
      const ch = 1.09
      const nh = 1.011
      const normal = [0, 0, 1]
      const carboxyl = [0, 0, 0]
      const alpha = [-cc, 0, 0]
      const oDouble = inPlane(carboxyl, alpha, 125.3, co, normal, 1)
      const oHydroxyl = inPlane(carboxyl, alpha, 111.6, coh, normal, -1)
      const nitrogen = inPlane(alpha, carboxyl, 111.0, cn, normal, 1)
      const alphaHydrogens = completeSp3(alpha, carboxyl, nitrogen, 107.0, ch)
      // Two of the three tetrahedral positions around N; the third is the lone pair.
      const amineHydrogens = cone(nitrogen, sub(nitrogen, alpha), 3, TETRAHEDRAL_CONE, nh).slice(0, 2)
      return {
        atoms: [
          { element: 'C', position: carboxyl },
          { element: 'C', position: alpha },
          { element: 'O', position: oDouble },
          { element: 'O', position: oHydroxyl },
          { element: 'H', position: inPlane(oHydroxyl, carboxyl, 106.3, oh, normal, 1) },
          { element: 'N', position: nitrogen },
          ...alphaHydrogens.map((p) => ({ element: 'H', position: p })),
          ...amineHydrogens.map((p) => ({ element: 'H', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: cc },
          { a: 0, b: 2, order: 2, length: co },
          { a: 0, b: 3, order: 1, length: coh },
          { a: 3, b: 4, order: 1, length: oh },
          { a: 1, b: 5, order: 1, length: cn },
          { a: 1, b: 6, order: 1, length: ch },
          { a: 1, b: 7, order: 1, length: ch },
          { a: 5, b: 8, order: 1, length: nh },
          { a: 5, b: 9, order: 1, length: nh },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 125.3], [1, 0, 5, 111.0], [1, 6, 7, 107.0]] },
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
  // Cages built by proximity (C60) are only correct if the connectivity comes out
  // right; the coordinates alone would look plausible either way.
  if (def.checks?.bondCount !== undefined && bonds.length !== def.checks.bondCount) {
    problems.push(`${def.id}: expected ${def.checks.bondCount} bonds, built ${bonds.length}`)
  }
  if (def.checks?.degree !== undefined) {
    const degrees = new Array(atoms.length).fill(0)
    for (const bond of bonds) {
      degrees[bond.a]++
      degrees[bond.b]++
    }
    const wrong = degrees.filter((d) => d !== def.checks.degree).length
    if (wrong > 0) {
      problems.push(
        `${def.id}: ${wrong} atom(s) do not have exactly ${def.checks.degree} bonds`,
      )
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
    // True when the coordinates come from idealised polygons rather than measured
    // values, so the UI can say so instead of implying experimental precision.
    idealized: def.idealized === true,
    summaryZh: def.summaryZh,
    summaryEn: def.summaryEn,
    molarMass: Number(mass.toFixed(3)),
    atoms: centred,
    bonds: enrichedBonds,
    extent: Number(extent.toFixed(3)),
  }
})

const CATEGORY_ORDER = ['element', 'inorganic', 'organic']
molecules.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))

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

const byCategory = CATEGORY_ORDER.map(
  (c) => `${c} ${molecules.filter((m) => m.category === c).length}`,
).join(', ')
console.log(`Wrote ${molecules.length} molecules (${byCategory}) -> ${OUT}`)
for (const m of molecules) {
  console.log(
    `  ${m.formulaDisplay.padEnd(8)} ${m.nameZh.padEnd(6)} ${String(m.atoms.length).padStart(2)} atoms, ` +
      `${String(m.bonds.length).padStart(2)} bonds, ${m.molarMass} g/mol`,
  )
}
