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
import { MOLECULE_USES } from './content/molecule-uses.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '../src/data/molecules.json')
// Coordinates live in their own file: they are 60% of the data and only the 3D
// viewer needs them, so keeping them separate keeps the gallery's bundle small.
const GEOMETRY_OUT = resolve(here, '../src/data/moleculeGeometry.json')
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
 * Walks a chain of atoms in the z = 0 plane, starting from two given atoms. Each
 * step turns by `angle` at the last atom placed; alternating `side` produces the
 * all-anti zigzag an extended chain adopts, and repeating a side produces the kink
 * of a cis double bond.
 */
function planarChain(first, second, steps) {
  const points = [first, second]
  for (const { angle, length, side } of steps) {
    const n = points.length
    points.push(inPlane(points[n - 1], points[n - 2], angle, length, [0, 0, 1], side))
  }
  return points
}

/**
 * Continues a chain from `c`, in the anti (180 degree dihedral) arrangement of
 * a-b-c that an extended chain prefers. `planarChain` does the same for chains
 * lying in the z = 0 plane; this one works in any orientation, which is what the
 * side chains hanging off a ring need.
 */
function extendAnti(a, b, c, angle, distance) {
  const planeNormal = cross(sub(b, a), sub(c, b))
  return furthestFrom(
    [1, -1].map((side) => inPlane(c, b, angle, distance, planeNormal, side)),
    a,
  )
}

/** Of two candidate positions, the one further from `reference`. */
function furthestFrom(options, reference) {
  return dist(options[0], reference) > dist(options[1], reference) ? options[0] : options[1]
}

/** Of two candidate positions, the one nearer `reference`. */
function nearestTo(options, reference) {
  return dist(options[0], reference) < dist(options[1], reference) ? options[0] : options[1]
}

/**
 * The direction left over at `centre` once its existing bonds are accounted for:
 * the reverse of the summed bond directions. That is the fourth bond of a carbon
 * that already has three, and the in-plane third bond of an sp2 centre.
 */
function openDirection(centre, neighbours) {
  const sum = neighbours.reduce((total, p) => add(total, norm(sub(p, centre))), [0, 0, 0])
  return mul(norm(sum), -1)
}

/**
 * The position that closes a ring: exactly `bondFrom` from `from` and `bondTo`
 * from `to`, taken in the plane through `near` and picked on that side. Both bond
 * lengths come out exact, which is what lets a ring survive having one of its
 * bonds shortened afterwards.
 */
function closeRing(from, to, bondFrom, bondTo, near) {
  const separation = dist(from, to)
  const axis = norm(sub(to, from))
  const reach = (separation ** 2 + bondFrom ** 2 - bondTo ** 2) / (2 * separation)
  const radiusSquared = bondFrom ** 2 - reach ** 2
  if (radiusSquared <= 0) throw new Error('closeRing: the two bonds cannot meet')
  const centre = add(from, mul(axis, reach))
  const towards = sub(near, centre)
  const perpendicular = norm(sub(towards, mul(axis, dot(towards, axis))))
  const radius = Math.sqrt(radiusSquared)
  return nearestTo([add(centre, mul(perpendicular, radius)), sub(centre, mul(perpendicular, radius))], near)
}

/** `count` alternating-side steps of the same bond and angle: a saturated backbone. */
function zigzagSteps(count, length, angle, startSide = 1) {
  return Array.from({ length: count }, (_, i) => ({
    angle,
    length,
    side: i % 2 === 0 ? startSide : -startSide,
  }))
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

/** Rodrigues rotation of `p` about the unit axis through `origin`, in degrees. */
function rotateAbout(p, axis, origin, degrees) {
  const k = norm(axis)
  const v = sub(p, origin)
  const a = degrees * DEG
  const rotated = add(
    add(mul(v, Math.cos(a)), mul(cross(k, v), Math.sin(a))),
    mul(k, dot(k, v) * (1 - Math.cos(a))),
  )
  return add(origin, rotated)
}

/** Rotation about `origin` that swings direction `from` onto direction `to`. */
function rotateOnto(p, from, to, origin) {
  const a = norm(from)
  const b = norm(to)
  const axis = cross(a, b)
  if (len(axis) < 1e-9) return p
  return rotateAbout(p, axis, origin, Math.acos(Math.min(1, Math.max(-1, dot(a, b)))) / DEG)
}

/** Places atoms along the given unit directions at `distance` from `center`. */
function place(center, directions, distance) {
  return directions.map((d) => add(center, mul(norm(d), distance)))
}

/**
 * A regular polygon that starts at `vertex` and extends along `axis`, lying in the
 * plane that `axis` and `inPlane` span. Returns the vertices in order, the first
 * being `vertex` itself — for attaching a second ring to a molecule that is already
 * placed, where `ring()` (fixed at the origin, in the xy-plane) cannot help.
 */
function ringAtVertex(vertex, axis, inPlaneDirection, count, bond) {
  const radius = bond / (2 * Math.sin(Math.PI / count))
  const centre = add(vertex, mul(norm(axis), radius))
  const u = norm(sub(vertex, centre))
  const raw = sub(inPlaneDirection, mul(u, dot(inPlaneDirection, u)))
  const v = norm(raw)
  const step = (2 * Math.PI) / count
  return Array.from({ length: count }, (_, i) =>
    add(centre, mul(add(mul(u, Math.cos(i * step)), mul(v, Math.sin(i * step))), radius)),
  )
}

/** `count` positions evenly spaced on a circle in the xy-plane. */
function ring(center, count, radius, phase = 0) {
  return Array.from({ length: count }, (_, i) => {
    const a = (phase + (360 / count) * i) * DEG
    return add(center, [Math.cos(a) * radius, Math.sin(a) * radius, 0])
  })
}

/**
 * Ring radius and pucker height for a ring of `count` atoms alternating above and
 * below a circle: the S8 crown at count 8, the cyclohexane chair at count 6.
 *
 * Solved from the bond length and bond angle rather than transcribed, so the ring
 * stays self-consistent. `count` must be even for the alternation to close up.
 */
function puckeredRing(count, bond, angle) {
  if (count % 2 !== 0) throw new Error(`puckeredRing needs an even count, got ${count}`)
  const step = (360 / count) * DEG
  // For adjacent atoms: |d|^2 = k1*r^2 + h^2, and the dot product of the two bond
  // vectors at a vertex is k2*r^2 + h^2.
  const k1 = 2 - 2 * Math.cos(step)
  const k2 = (Math.cos(step) - 1) ** 2 - Math.sin(step) ** 2
  const c = Math.cos(angle * DEG)
  const m = (k2 - c * k1) / (c - 1)
  const rSquared = bond ** 2 / (k1 + m)
  return { radius: Math.sqrt(rSquared), height: Math.sqrt(m * rSquared) }
}

/** Positions of a puckered ring, atom `i` alternating above/below the xy-plane. */
function puckeredRingPositions(count, bond, angle) {
  const { radius, height } = puckeredRing(count, bond, angle)
  return Array.from({ length: count }, (_, i) => {
    const a = i * (360 / count) * DEG
    return [
      radius * Math.cos(a),
      radius * Math.sin(a),
      (i % 2 === 0 ? 1 : -1) * (height / 2),
    ]
  })
}

/** Unit direction vectors of a cone, so callers can place each at its own distance. */
function coneDirections(axis, count, angle, phase = 0) {
  const [u, v, w] = frame(axis)
  const a = angle * DEG
  return Array.from({ length: count }, (_, i) => {
    const phi = (phase + (360 / count) * i) * DEG
    return add(
      mul(w, Math.cos(a)),
      add(mul(u, Math.sin(a) * Math.cos(phi)), mul(v, Math.sin(a) * Math.sin(phi))),
    )
  })
}

/**
 * Two flat regular polygons sharing one edge, as in the purine skeleton (a fused
 * six- and five-membered ring).
 *
 * Returns the shared pair plus each ring's remaining vertices. Both polygons are
 * built with the same edge length, which is what lets them share an edge exactly —
 * an idealisation, since real fused rings have slightly unequal bonds.
 */
function fusedRings(bond, sizeA, sizeB) {
  const shared = [
    [0, bond / 2, 0],
    [0, -bond / 2, 0],
  ]
  const apothem = (n) => bond / (2 * Math.tan(Math.PI / n))

  // Rotating the first shared atom about a ring centre steps around that polygon.
  // Ring A sits at +x and steps positively; ring B sits at -x and steps negatively.
  const walk = (centre, count, direction) => {
    const step = ((2 * Math.PI) / count) * direction
    const dx = shared[0][0] - centre[0]
    const dy = shared[0][1] - centre[1]
    return Array.from({ length: count }, (_, i) => {
      const a = i * step
      return [
        centre[0] + dx * Math.cos(a) - dy * Math.sin(a),
        centre[1] + dx * Math.sin(a) + dy * Math.cos(a),
        0,
      ]
    })
  }

  const ringA = walk([apothem(sizeA), 0, 0], sizeA, 1)
  const ringB = walk([-apothem(sizeB), 0, 0], sizeB, -1)
  return { shared, ringA, ringB }
}

/**
 * Splits the two free tetrahedral directions of a ring carbon into axial and
 * equatorial. The ring lies around the z axis, so the axial bond is whichever of the
 * pair points more steeply along z.
 */
function axialEquatorial(centre, ringPrev, ringNext, angle, distance) {
  const [first, second] = completeSp3(centre, ringPrev, ringNext, angle, distance)
  const steepness = (p) => Math.abs(p[2] - centre[2])
  return steepness(first) > steepness(second)
    ? { axial: first, equatorial: second }
    : { axial: second, equatorial: first }
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
  Si: { covalent: 1.11, vdw: 2.1 },
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
      const { radius, height } = puckeredRing(8, bond, 108.0)
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
  // ---- 无机物（续二）----
  {
    id: 'h3po4',
    formula: 'H3PO4',
    name: 'Phosphoric acid',
    nameZh: '磷酸',
    category: 'inorganic',
    shape: 'tetrahedral',
    shapeZh: '四面体形',
    summaryZh: '磷居四面体中心，一个 P=O 较短，三个 P—OH 较长，可分三级电离。',
    summaryEn:
      'Phosphorus sits at the centre of a tetrahedron with one short P=O and three longer P-OH bonds, ionising in three stages.',
    build() {
      const po = 1.48
      const poh = 1.57
      const oh = 0.98
      const p = [0, 0, 0]
      const [d1, d2, d3, d4] = TETRAHEDRON
      const oDouble = add(p, mul(d1, po))
      const hydroxyls = [d2, d3, d4].map((d) => add(p, mul(d, poh)))
      return {
        atoms: [
          { element: 'P', position: p },
          { element: 'O', position: oDouble },
          ...hydroxyls.map((o) => ({ element: 'O', position: o })),
          ...hydroxyls.map((o) => ({ element: 'H', position: branch(o, p, 108, oh, 0) })),
        ],
        bonds: [
          { a: 0, b: 1, order: 2, length: po },
          { a: 0, b: 2, order: 1, length: poh },
          { a: 0, b: 3, order: 1, length: poh },
          { a: 0, b: 4, order: 1, length: poh },
          { a: 2, b: 5, order: 1, length: oh },
          { a: 3, b: 6, order: 1, length: oh },
          { a: 4, b: 7, order: 1, length: oh },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 109.47], [2, 0, 5, 108]] },
  },
  {
    id: 'n2h4',
    formula: 'N2H4',
    name: 'Hydrazine',
    nameZh: '肼',
    category: 'inorganic',
    shape: 'gauche',
    shapeZh: '邻位交叉形',
    summaryZh: '两个氮上的孤对电子互相排斥，使分子扭成邻位交叉构象，而不是像乙烷那样简单交错。',
    summaryEn:
      'The lone pairs on the two nitrogens repel each other, twisting the molecule into a gauche shape rather than the simple staggering of ethane.',
    build() {
      const nn = 1.449
      const nh = 1.021
      const axis = [0, 0, 1]
      const n1 = [0, 0, -nn / 2]
      const n2 = [0, 0, nn / 2]
      // 60.11° off the bisector reproduces the 107° H-N-H angle at 112° H-N-N.
      const spread = 60.11
      return {
        atoms: [
          { element: 'N', position: n1 },
          { element: 'N', position: n2 },
          { element: 'H', position: aroundAxis(n1, axis, 112, nh, -spread) },
          { element: 'H', position: aroundAxis(n1, axis, 112, nh, spread) },
          { element: 'H', position: aroundAxis(n2, axis, 180 - 112, nh, 91 - spread) },
          { element: 'H', position: aroundAxis(n2, axis, 180 - 112, nh, 91 + spread) },
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: nn },
          { a: 0, b: 2, order: 1, length: nh },
          { a: 0, b: 3, order: 1, length: nh },
          { a: 1, b: 4, order: 1, length: nh },
          { a: 1, b: 5, order: 1, length: nh },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 112], [0, 2, 3, 107], [1, 0, 4, 112]] },
  },
  {
    id: 'h2co3',
    formula: 'H2CO3',
    name: 'Carbonic acid',
    nameZh: '碳酸',
    category: 'inorganic',
    shape: 'planar',
    shapeZh: '平面三角形',
    summaryZh: '二氧化碳溶于水生成的弱酸，极不稳定，一减压就分解回二氧化碳 —— 这就是汽水开盖冒泡的原因。',
    summaryEn:
      'The weak acid formed when CO2 dissolves in water. It is so unstable that releasing the pressure breaks it straight back into CO2 — the fizz when you open a bottle.',
    build() {
      const co = 1.2
      const coh = 1.34
      const oh = 0.97
      const normal = [0, 0, 1]
      const c = [0, 0, 0]
      const oDouble = [0, co, 0]
      const o1 = inPlane(c, oDouble, 125, coh, normal, 1)
      const o2 = inPlane(c, oDouble, 125, coh, normal, -1)
      return {
        atoms: [
          { element: 'C', position: c },
          { element: 'O', position: oDouble },
          { element: 'O', position: o1 },
          { element: 'O', position: o2 },
          { element: 'H', position: inPlane(o1, c, 107, oh, normal, 1) },
          { element: 'H', position: inPlane(o2, c, 107, oh, normal, -1) },
        ],
        bonds: [
          { a: 0, b: 1, order: 2, length: co },
          { a: 0, b: 2, order: 1, length: coh },
          { a: 0, b: 3, order: 1, length: coh },
          { a: 2, b: 4, order: 1, length: oh },
          { a: 3, b: 5, order: 1, length: oh },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 125], [0, 2, 3, 110], [2, 0, 4, 107]], planar: true },
  },
  {
    id: 'hclo',
    formula: 'HClO',
    name: 'Hypochlorous acid',
    nameZh: '次氯酸',
    category: 'inorganic',
    shape: 'bent',
    shapeZh: '角形',
    summaryZh: '氯气溶于水生成的弱酸，才是漂白和消毒真正的活性成分 —— 中性分子能穿过细菌细胞膜。',
    summaryEn:
      'The weak acid formed when chlorine dissolves in water, and the species that actually bleaches and disinfects: being neutral, it can cross bacterial membranes.',
    build() {
      const ocl = 1.69
      const oh = 0.975
      const o = [0, 0, 0]
      const cl = [0, 0, ocl]
      return {
        atoms: [
          { element: 'O', position: o },
          { element: 'Cl', position: cl },
          { element: 'H', position: inPlane(o, cl, 103, oh, [0, 1, 0], 1) },
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: ocl },
          { a: 0, b: 2, order: 1, length: oh },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 103]] },
  },
  {
    id: 'sih4',
    formula: 'SiH4',
    name: 'Silane',
    nameZh: '硅烷',
    category: 'inorganic',
    shape: 'tetrahedral',
    shapeZh: '正四面体形',
    summaryZh: '甲烷的硅类似物，但遇空气会自燃。芯片和太阳能电池的硅薄膜就是靠它气相沉积出来的。',
    summaryEn:
      'The silicon analogue of methane, but it ignites in air. Silicon films for chips and solar cells are deposited from it.',
    build() {
      const d = 1.48
      const hs = place([0, 0, 0], TETRAHEDRON, d)
      return {
        atoms: [
          { element: 'Si', position: [0, 0, 0] },
          ...hs.map((p) => ({ element: 'H', position: p })),
        ],
        bonds: hs.map((_, i) => ({ a: 0, b: i + 1, order: 1, length: d })),
      }
    },
    checks: { angles: [[0, 1, 2, 109.47]] },
  },

  // ---- 有机物（续二）----
  {
    id: 'hcooh',
    formula: 'CH2O2',
    formulaDisplayOverride: 'HCOOH',
    name: 'Formic acid',
    nameZh: '甲酸',
    category: 'organic',
    shape: 'planar',
    shapeZh: '平面形',
    summaryZh: '最简单的羧酸。蚂蚁叮咬和荨麻刺痛的灼热感就来自它 —— 拉丁语 formica 正是"蚂蚁"。',
    summaryEn:
      'The simplest carboxylic acid. The sting of ant bites and nettles comes from it — Latin formica means "ant".',
    build() {
      const co = 1.202
      const coh = 1.343
      const ch = 1.097
      const oh = 0.972
      const normal = [0, 0, 1]
      const c = [0, 0, 0]
      const oDouble = [co, 0, 0]
      const oHydroxyl = inPlane(c, oDouble, 124.9, coh, normal, -1)
      return {
        atoms: [
          { element: 'C', position: c },
          { element: 'O', position: oDouble },
          { element: 'O', position: oHydroxyl },
          { element: 'H', position: inPlane(c, oDouble, 124.1, ch, normal, 1) },
          { element: 'H', position: inPlane(oHydroxyl, c, 106.3, oh, normal, 1) },
        ],
        bonds: [
          { a: 0, b: 1, order: 2, length: co },
          { a: 0, b: 2, order: 1, length: coh },
          { a: 0, b: 3, order: 1, length: ch },
          { a: 2, b: 4, order: 1, length: oh },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 124.9], [0, 1, 3, 124.1], [2, 0, 4, 106.3]], planar: true },
  },
  {
    id: 'ethyleneglycol',
    formula: 'C2H6O2',
    name: 'Ethylene glycol',
    nameZh: '乙二醇',
    category: 'organic',
    shape: 'chain',
    shapeZh: '链形',
    summaryZh: '两端各一个羟基，与水强烈氢键结合，能把冰点压到零下几十度 —— 汽车防冻液的主角。有甜味但剧毒。',
    summaryEn:
      'A hydroxyl at each end hydrogen-bonds strongly with water, pushing the freezing point tens of degrees below zero — the core of engine antifreeze. Sweet-tasting but highly toxic.',
    build() {
      const cc = 1.512
      const co = 1.423
      const ch = 1.09
      const oh = 0.97
      const axis = [0, 0, 1]
      const c1 = [0, 0, -cc / 2]
      const c2 = [0, 0, cc / 2]
      // Anti conformer: the two hydroxyls sit on opposite sides of the C-C axis.
      const o1 = aroundAxis(c1, axis, 110, co, 0)
      const o2 = aroundAxis(c2, axis, 180 - 110, co, 180)
      return {
        atoms: [
          { element: 'C', position: c1 },
          { element: 'C', position: c2 },
          { element: 'O', position: o1 },
          { element: 'O', position: o2 },
          ...completeSp3(c1, c2, o1, 108, ch).map((p) => ({ element: 'H', position: p })),
          ...completeSp3(c2, c1, o2, 108, ch).map((p) => ({ element: 'H', position: p })),
          { element: 'H', position: branch(o1, c1, 108, oh, 0) },
          { element: 'H', position: branch(o2, c2, 108, oh, 0) },
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: cc },
          { a: 0, b: 2, order: 1, length: co },
          { a: 1, b: 3, order: 1, length: co },
          { a: 0, b: 4, order: 1, length: ch },
          { a: 0, b: 5, order: 1, length: ch },
          { a: 1, b: 6, order: 1, length: ch },
          { a: 1, b: 7, order: 1, length: ch },
          { a: 2, b: 8, order: 1, length: oh },
          { a: 3, b: 9, order: 1, length: oh },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 110], [0, 4, 5, 108]] },
  },
  {
    id: 'glycerol',
    formula: 'C3H8O3',
    name: 'Glycerol',
    nameZh: '甘油',
    category: 'organic',
    shape: 'chain',
    shapeZh: '链形',
    summaryZh: '三个羟基让它极其吸湿，是护肤品最常用的保湿剂；也是所有油脂（甘油三酯）的骨架。',
    summaryEn:
      'Three hydroxyls make it strongly water-attracting, the most common humectant in skincare — and the backbone of every fat and oil.',
    build() {
      const cc = 1.52
      const co = 1.43
      const ch = 1.09
      const oh = 0.97
      const c2 = [0, 0, 0]
      const [c1, c3] = bent(c2, 112, cc)
      // The middle carbon keeps one hydroxyl and one hydrogen.
      const [oMiddle, hMiddle] = completeSp3(c2, c1, c3, 108, 1)
      const oMid = add(c2, mul(norm(sub(oMiddle, c2)), co))
      const hMid = add(c2, mul(norm(sub(hMiddle, c2)), ch))
      // Each end carbon: one hydroxyl and two hydrogens.
      const endGroup = (carbon) => {
        const dirs = coneDirections(sub(carbon, c2), 3, TETRAHEDRAL_CONE, 0)
        return {
          o: add(carbon, mul(dirs[0], co)),
          hs: [add(carbon, mul(dirs[1], ch)), add(carbon, mul(dirs[2], ch))],
        }
      }
      const end1 = endGroup(c1)
      const end3 = endGroup(c3)
      return {
        atoms: [
          { element: 'C', position: c2 },
          { element: 'C', position: c1 },
          { element: 'C', position: c3 },
          { element: 'O', position: oMid },
          { element: 'O', position: end1.o },
          { element: 'O', position: end3.o },
          { element: 'H', position: hMid },
          ...end1.hs.map((p) => ({ element: 'H', position: p })),
          ...end3.hs.map((p) => ({ element: 'H', position: p })),
          { element: 'H', position: branch(oMid, c2, 108, oh, 0) },
          { element: 'H', position: branch(end1.o, c1, 108, oh, 0) },
          { element: 'H', position: branch(end3.o, c3, 108, oh, 0) },
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: cc },
          { a: 0, b: 2, order: 1, length: cc },
          { a: 0, b: 3, order: 1, length: co },
          { a: 1, b: 4, order: 1, length: co },
          { a: 2, b: 5, order: 1, length: co },
          { a: 0, b: 6, order: 1, length: ch },
          { a: 1, b: 7, order: 1, length: ch },
          { a: 1, b: 8, order: 1, length: ch },
          { a: 2, b: 9, order: 1, length: ch },
          { a: 2, b: 10, order: 1, length: ch },
          { a: 3, b: 11, order: 1, length: oh },
          { a: 4, b: 12, order: 1, length: oh },
          { a: 5, b: 13, order: 1, length: oh },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 112]] },
  },
  {
    id: 'diethylether',
    formula: 'C4H10O',
    formulaDisplayOverride: '(C2H5)2O',
    name: 'Diethyl ether',
    nameZh: '乙醚',
    category: 'organic',
    shape: 'bent',
    shapeZh: '角形',
    summaryZh: '1846 年首次公开演示乙醚麻醉，外科手术从此不再是酷刑。今天主要作萃取溶剂，极易燃。',
    summaryEn:
      'The 1846 public demonstration of ether anaesthesia ended surgery as an ordeal. Today it is mainly an extraction solvent, and extremely flammable.',
    build() {
      const co = 1.41
      const cc = 1.52
      const ch = 1.09
      const o = [0, 0, 0]
      const [ca, cb] = bent(o, 112, co)
      const arm = (inner) => {
        const dirs = coneDirections(sub(inner, o), 3, TETRAHEDRAL_CONE, 0)
        return {
          terminal: add(inner, mul(dirs[0], cc)),
          hs: [add(inner, mul(dirs[1], ch)), add(inner, mul(dirs[2], ch))],
        }
      }
      const armA = arm(ca)
      const armB = arm(cb)
      return {
        atoms: [
          { element: 'O', position: o },
          { element: 'C', position: ca },
          { element: 'C', position: cb },
          { element: 'C', position: armA.terminal },
          { element: 'C', position: armB.terminal },
          ...armA.hs.map((p) => ({ element: 'H', position: p })),
          ...armB.hs.map((p) => ({ element: 'H', position: p })),
          ...methyl(armA.terminal, ca, ch).map((p) => ({ element: 'H', position: p })),
          ...methyl(armB.terminal, cb, ch).map((p) => ({ element: 'H', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: co },
          { a: 0, b: 2, order: 1, length: co },
          { a: 1, b: 3, order: 1, length: cc },
          { a: 2, b: 4, order: 1, length: cc },
          { a: 1, b: 5, order: 1, length: ch },
          { a: 1, b: 6, order: 1, length: ch },
          { a: 2, b: 7, order: 1, length: ch },
          { a: 2, b: 8, order: 1, length: ch },
          { a: 3, b: 9, order: 1, length: ch },
          { a: 3, b: 10, order: 1, length: ch },
          { a: 3, b: 11, order: 1, length: ch },
          { a: 4, b: 12, order: 1, length: ch },
          { a: 4, b: 13, order: 1, length: ch },
          { a: 4, b: 14, order: 1, length: ch },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 112]] },
  },
  {
    id: 'ethylacetate',
    formula: 'C4H8O2',
    formulaDisplayOverride: 'CH3COOC2H5',
    name: 'Ethyl acetate',
    nameZh: '乙酸乙酯',
    category: 'organic',
    shape: 'planar-sp2',
    shapeZh: '含平面酯基',
    summaryZh: '洗甲水和白胶那股果香就是它。低毒又易挥发，是咖啡低因处理和油墨工业的常用溶剂。',
    summaryEn:
      'The fruity smell of nail-polish remover and white glue. Low in toxicity and quick to evaporate, it decaffeinates coffee and thins printing inks.',
    build() {
      const cc = 1.5
      const co = 1.2
      const cEster = 1.34
      const oc = 1.44
      const ch = 1.09
      const normal = [0, 0, 1]
      const carbonyl = [0, 0, 0]
      const methylC = [-cc, 0, 0]
      const oDouble = inPlane(carbonyl, methylC, 125.6, co, normal, 1)
      const oEster = inPlane(carbonyl, methylC, 111.4, cEster, normal, -1)
      const ch2 = inPlane(oEster, carbonyl, 116.4, oc, normal, -1)
      const ch3End = add(ch2, mul(coneDirections(sub(ch2, oEster), 3, TETRAHEDRAL_CONE, 0)[0], cc))
      const ch2Hs = completeSp3(ch2, oEster, ch3End, 108, ch)
      return {
        atoms: [
          { element: 'C', position: carbonyl },
          { element: 'C', position: methylC },
          { element: 'O', position: oDouble },
          { element: 'O', position: oEster },
          { element: 'C', position: ch2 },
          { element: 'C', position: ch3End },
          ...methyl(methylC, carbonyl, ch).map((p) => ({ element: 'H', position: p })),
          ...ch2Hs.map((p) => ({ element: 'H', position: p })),
          ...methyl(ch3End, ch2, ch).map((p) => ({ element: 'H', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: cc },
          { a: 0, b: 2, order: 2, length: co },
          { a: 0, b: 3, order: 1, length: cEster },
          { a: 3, b: 4, order: 1, length: oc },
          { a: 4, b: 5, order: 1, length: cc },
          { a: 1, b: 6, order: 1, length: ch },
          { a: 1, b: 7, order: 1, length: ch },
          { a: 1, b: 8, order: 1, length: ch },
          { a: 4, b: 9, order: 1, length: ch },
          { a: 4, b: 10, order: 1, length: ch },
          { a: 5, b: 11, order: 1, length: ch },
          { a: 5, b: 12, order: 1, length: ch },
          { a: 5, b: 13, order: 1, length: ch },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 125.6], [3, 0, 4, 116.4]] },
  },
  {
    id: 'lacticacid',
    formula: 'C3H6O3',
    name: 'Lactic acid',
    nameZh: '乳酸',
    category: 'organic',
    shape: 'chain',
    shapeZh: '链形',
    summaryZh: '酸奶和泡菜的酸味来自它。肌肉剧烈运动时也会产生 —— 但现在认为它不是酸痛的原因，反而是备用燃料。',
    summaryEn:
      'It gives yoghurt and pickles their tang. Muscles make it during hard exercise — though it is now seen as spare fuel rather than the cause of soreness.',
    build() {
      const cc = 1.52
      const co = 1.21
      const coh = 1.34
      const oh = 0.97
      const ch = 1.09
      const cAlphaO = 1.43
      const normal = [0, 0, 1]
      const carboxyl = [0, 0, 0]
      const alpha = [-cc, 0, 0]
      const oDouble = inPlane(carboxyl, alpha, 125, co, normal, 1)
      const oAcid = inPlane(carboxyl, alpha, 112, coh, normal, -1)
      const dirs = coneDirections(sub(alpha, carboxyl), 3, TETRAHEDRAL_CONE, 0)
      const hydroxylO = add(alpha, mul(dirs[0], cAlphaO))
      const methylC = add(alpha, mul(dirs[1], cc))
      const alphaH = add(alpha, mul(dirs[2], ch))
      return {
        atoms: [
          { element: 'C', position: carboxyl },
          { element: 'C', position: alpha },
          { element: 'O', position: oDouble },
          { element: 'O', position: oAcid },
          { element: 'O', position: hydroxylO },
          { element: 'C', position: methylC },
          { element: 'H', position: alphaH },
          { element: 'H', position: inPlane(oAcid, carboxyl, 107, oh, normal, 1) },
          { element: 'H', position: branch(hydroxylO, alpha, 108, oh, 0) },
          ...methyl(methylC, alpha, ch).map((p) => ({ element: 'H', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: cc },
          { a: 0, b: 2, order: 2, length: co },
          { a: 0, b: 3, order: 1, length: coh },
          { a: 1, b: 4, order: 1, length: cAlphaO },
          { a: 1, b: 5, order: 1, length: cc },
          { a: 1, b: 6, order: 1, length: ch },
          { a: 3, b: 7, order: 1, length: oh },
          { a: 4, b: 8, order: 1, length: oh },
          { a: 5, b: 9, order: 1, length: ch },
          { a: 5, b: 10, order: 1, length: ch },
          { a: 5, b: 11, order: 1, length: ch },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 125], [1, 4, 5, 109.47]] },
  },
  {
    id: 'alanine',
    formula: 'C3H7NO2',
    name: 'Alanine',
    nameZh: '丙氨酸',
    category: 'organic',
    shape: 'chain',
    shapeZh: '链形',
    summaryZh: '第二简单的氨基酸。与甘氨酸只差一个甲基，但这个甲基让它有了手性 —— 生物体只用其中的 L 型。',
    summaryEn:
      'The second simplest amino acid: one methyl group more than glycine, and that group makes it chiral. Life uses only the L form.',
    build() {
      const cc = 1.52
      const co = 1.21
      const coh = 1.34
      const cn = 1.47
      const oh = 0.97
      const ch = 1.09
      const nh = 1.01
      const normal = [0, 0, 1]
      const carboxyl = [0, 0, 0]
      const alpha = [-cc, 0, 0]
      const oDouble = inPlane(carboxyl, alpha, 125, co, normal, 1)
      const oAcid = inPlane(carboxyl, alpha, 112, coh, normal, -1)
      const dirs = coneDirections(sub(alpha, carboxyl), 3, TETRAHEDRAL_CONE, 0)
      const nitrogen = add(alpha, mul(dirs[0], cn))
      const methylC = add(alpha, mul(dirs[1], cc))
      const alphaH = add(alpha, mul(dirs[2], ch))
      const amineHs = coneDirections(sub(nitrogen, alpha), 3, TETRAHEDRAL_CONE, 0)
        .slice(0, 2)
        .map((d) => add(nitrogen, mul(d, nh)))
      return {
        atoms: [
          { element: 'C', position: carboxyl },
          { element: 'C', position: alpha },
          { element: 'O', position: oDouble },
          { element: 'O', position: oAcid },
          { element: 'N', position: nitrogen },
          { element: 'C', position: methylC },
          { element: 'H', position: alphaH },
          { element: 'H', position: inPlane(oAcid, carboxyl, 107, oh, normal, 1) },
          ...amineHs.map((p) => ({ element: 'H', position: p })),
          ...methyl(methylC, alpha, ch).map((p) => ({ element: 'H', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: cc },
          { a: 0, b: 2, order: 2, length: co },
          { a: 0, b: 3, order: 1, length: coh },
          { a: 1, b: 4, order: 1, length: cn },
          { a: 1, b: 5, order: 1, length: cc },
          { a: 1, b: 6, order: 1, length: ch },
          { a: 3, b: 7, order: 1, length: oh },
          { a: 4, b: 8, order: 1, length: nh },
          { a: 4, b: 9, order: 1, length: nh },
          { a: 5, b: 10, order: 1, length: ch },
          { a: 5, b: 11, order: 1, length: ch },
          { a: 5, b: 12, order: 1, length: ch },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 125], [1, 4, 5, 109.47]] },
  },
  {
    id: 'vinylchloride',
    formula: 'C2H3Cl',
    name: 'Vinyl chloride',
    nameZh: '氯乙烯',
    category: 'organic',
    shape: 'planar',
    shapeZh: '平面形',
    summaryZh: 'PVC 的单体：把千万个它首尾相连，就得到水管、地板和人造革。本身是确认的致癌物。',
    summaryEn:
      'The monomer of PVC: link millions of them end to end and you get pipes, flooring and synthetic leather. The monomer itself is a confirmed carcinogen.',
    build() {
      const cc = 1.332
      const ccl = 1.726
      const ch = 1.08
      const normal = [0, 0, 1]
      const c1 = [-cc / 2, 0, 0]
      const c2 = [cc / 2, 0, 0]
      return {
        atoms: [
          { element: 'C', position: c1 },
          { element: 'C', position: c2 },
          { element: 'Cl', position: inPlane(c1, c2, 122, ccl, normal, 1) },
          { element: 'H', position: inPlane(c1, c2, 122, ch, normal, -1) },
          { element: 'H', position: inPlane(c2, c1, 120, ch, normal, 1) },
          { element: 'H', position: inPlane(c2, c1, 120, ch, normal, -1) },
        ],
        bonds: [
          { a: 0, b: 1, order: 2, length: cc },
          { a: 0, b: 2, order: 1, length: ccl },
          { a: 0, b: 3, order: 1, length: ch },
          { a: 1, b: 4, order: 1, length: ch },
          { a: 1, b: 5, order: 1, length: ch },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 122]], planar: true },
  },
  {
    id: 'propene',
    formula: 'C3H6',
    name: 'Propene',
    nameZh: '丙烯',
    category: 'organic',
    shape: 'planar-sp2',
    shapeZh: '含平面双键',
    summaryZh: '聚丙烯的单体，产量仅次于乙烯。保鲜盒、编织袋、口罩熔喷布和绝大多数塑料瓶盖都是聚丙烯。',
    summaryEn:
      'The monomer of polypropylene, second only to ethylene in output. Food containers, woven sacks, mask meltblown fabric and nearly every bottle cap are polypropylene.',
    build() {
      const cc2 = 1.336
      const cc1 = 1.501
      const ch = 1.09
      const normal = [0, 0, 1]
      const c1 = [-cc2 / 2, 0, 0]
      const c2 = [cc2 / 2, 0, 0]
      const c3 = inPlane(c2, c1, 124.3, cc1, normal, 1)
      return {
        atoms: [
          { element: 'C', position: c1 },
          { element: 'C', position: c2 },
          { element: 'C', position: c3 },
          { element: 'H', position: inPlane(c1, c2, 121, ch, normal, 1) },
          { element: 'H', position: inPlane(c1, c2, 121, ch, normal, -1) },
          { element: 'H', position: inPlane(c2, c1, 119, ch, normal, -1) },
          ...methyl(c3, c2, ch).map((p) => ({ element: 'H', position: p })),
        ],
        bonds: [
          { a: 0, b: 1, order: 2, length: cc2 },
          { a: 1, b: 2, order: 1, length: cc1 },
          { a: 0, b: 3, order: 1, length: ch },
          { a: 0, b: 4, order: 1, length: ch },
          { a: 1, b: 5, order: 1, length: ch },
          { a: 2, b: 6, order: 1, length: ch },
          { a: 2, b: 7, order: 1, length: ch },
          { a: 2, b: 8, order: 1, length: ch },
        ],
      }
    },
    checks: { angles: [[1, 0, 2, 124.3]] },
  },
  {
    id: 'tetrafluoroethylene',
    formula: 'C2F4',
    name: 'Tetrafluoroethylene',
    nameZh: '四氟乙烯',
    category: 'organic',
    shape: 'planar',
    shapeZh: '平面形',
    summaryZh: '聚合后就是聚四氟乙烯 —— 不粘锅涂层。氟原子把碳链严严实实裹住，几乎没有东西能粘附上去。',
    summaryEn:
      'Polymerised, it becomes PTFE — the non-stick coating. The fluorines wrap the carbon chain so completely that almost nothing can stick to it.',
    build() {
      const cc = 1.311
      const cf = 1.319
      const normal = [0, 0, 1]
      const c1 = [-cc / 2, 0, 0]
      const c2 = [cc / 2, 0, 0]
      return {
        atoms: [
          { element: 'C', position: c1 },
          { element: 'C', position: c2 },
          { element: 'F', position: inPlane(c1, c2, 123.8, cf, normal, 1) },
          { element: 'F', position: inPlane(c1, c2, 123.8, cf, normal, -1) },
          { element: 'F', position: inPlane(c2, c1, 123.8, cf, normal, 1) },
          { element: 'F', position: inPlane(c2, c1, 123.8, cf, normal, -1) },
        ],
        bonds: [
          { a: 0, b: 1, order: 2, length: cc },
          { a: 0, b: 2, order: 1, length: cf },
          { a: 0, b: 3, order: 1, length: cf },
          { a: 1, b: 4, order: 1, length: cf },
          { a: 1, b: 5, order: 1, length: cf },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 123.8], [0, 2, 3, 112.4]], planar: true },
  },
  {
    id: 'styrene',
    formula: 'C8H8',
    name: 'Styrene',
    nameZh: '苯乙烯',
    category: 'organic',
    shape: 'planar-ring',
    shapeZh: '苯环 + 乙烯基',
    summaryZh: '聚苯乙烯的单体。发泡后就是外卖餐盒和快递泡沫箱，透明硬质的则是一次性餐具和 CD 盒。',
    summaryEn:
      'The monomer of polystyrene: foamed it becomes takeaway boxes and packing foam, and as a clear rigid solid, disposable cutlery and CD cases.',
    build() {
      const cc = 1.397
      const chRing = 1.084
      const cVinyl = 1.47
      const cDouble = 1.331
      const chVinyl = 1.08
      const normal = [0, 0, 1]
      const atoms = []
      const bonds = []
      const ringCarbons = ring([0, 0, 0], 6, cc)
      ringCarbons.forEach((p) => atoms.push({ element: 'C', position: p }))
      for (let i = 0; i < 6; i++) {
        bonds.push({ a: i, b: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1, length: cc })
      }
      const alpha = mul(norm(ringCarbons[0]), cc + cVinyl)
      atoms.push({ element: 'C', position: alpha })
      bonds.push({ a: 0, b: 6, order: 1, length: cVinyl })
      const beta = inPlane(alpha, ringCarbons[0], 126, cDouble, normal, 1)
      atoms.push({ element: 'C', position: beta })
      bonds.push({ a: 6, b: 7, order: 2, length: cDouble })
      atoms.push({ element: 'H', position: inPlane(alpha, ringCarbons[0], 116, chVinyl, normal, -1) })
      bonds.push({ a: 6, b: 8, order: 1, length: chVinyl })
      atoms.push({ element: 'H', position: inPlane(beta, alpha, 121, chVinyl, normal, 1) })
      bonds.push({ a: 7, b: 9, order: 1, length: chVinyl })
      atoms.push({ element: 'H', position: inPlane(beta, alpha, 121, chVinyl, normal, -1) })
      bonds.push({ a: 7, b: 10, order: 1, length: chVinyl })
      for (let i = 1; i < 6; i++) {
        atoms.push({ element: 'H', position: mul(norm(ringCarbons[i]), cc + chRing) })
        bonds.push({ a: i, b: atoms.length - 1, order: 1, length: chRing })
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120], [6, 0, 7, 126]], planar: true },
  },
  {
    id: 'cfc12',
    formula: 'CCl2F2',
    name: 'Dichlorodifluoromethane',
    nameZh: '二氯二氟甲烷',
    category: 'organic',
    shape: 'tetrahedral',
    shapeZh: '四面体形',
    summaryZh: '曾经的"氟利昂-12"，无毒不燃，一度是完美的制冷剂 —— 直到人们发现它在平流层释放氯原子，撕开了臭氧空洞。',
    summaryEn:
      'Once "Freon-12": non-toxic, non-flammable and seemingly the perfect refrigerant — until it was found to release chlorine in the stratosphere and tear open the ozone hole.',
    build() {
      const ccl = 1.744
      const cf = 1.345
      const [d1, d2, d3, d4] = TETRAHEDRON
      const c = [0, 0, 0]
      return {
        atoms: [
          { element: 'C', position: c },
          { element: 'Cl', position: add(c, mul(d1, ccl)) },
          { element: 'Cl', position: add(c, mul(d2, ccl)) },
          { element: 'F', position: add(c, mul(d3, cf)) },
          { element: 'F', position: add(c, mul(d4, cf)) },
        ],
        bonds: [
          { a: 0, b: 1, order: 1, length: ccl },
          { a: 0, b: 2, order: 1, length: ccl },
          { a: 0, b: 3, order: 1, length: cf },
          { a: 0, b: 4, order: 1, length: cf },
        ],
      }
    },
    checks: { angles: [[0, 1, 2, 109.47], [0, 3, 4, 109.47]] },
  },
  {
    id: 'adenine',
    formula: 'C5H5N5',
    name: 'Adenine',
    nameZh: '腺嘌呤',
    category: 'organic',
    shape: 'fused-rings',
    shapeZh: '嘌呤并环',
    idealized: true,
    summaryZh: 'DNA 四种碱基之一（A），靠两个氢键与胸腺嘧啶配对；也是 ATP 的组成部分 —— 遗传与供能共用同一个骨架。',
    summaryEn:
      'One of DNA’s four bases (A), pairing with thymine through two hydrogen bonds; it is also part of ATP, so heredity and energy share one skeleton.',
    build() {
      const ring = 1.38
      const ch = 1.08
      const cn = 1.34
      const nh = 1.01
      const { shared, ringA, ringB } = fusedRings(ring, 6, 5)
      // shared = C4, C5. ringA (six) = C4, C5, C6, N1, C2, N3.
      // ringB (five) = C4, C5, N7, C8, N9.
      const [c4, c5] = shared
      const [, , c6, n1, c2, n3] = ringA
      const [, , n7, c8, n9] = ringB
      const sixCentre = [ringA.reduce((s, p) => s + p[0], 0) / 6, 0, 0]
      const fiveCentre = [ringB.reduce((s, p) => s + p[0], 0) / 5, 0, 0]
      const outward = (p, centre, distance) => add(p, mul(norm(sub(p, centre)), distance))
      const amine = outward(c6, sixCentre, cn)
      const atoms = [
        { element: 'C', position: c4 },
        { element: 'C', position: c5 },
        { element: 'C', position: c6 },
        { element: 'N', position: n1 },
        { element: 'C', position: c2 },
        { element: 'N', position: n3 },
        { element: 'N', position: n7 },
        { element: 'C', position: c8 },
        { element: 'N', position: n9 },
        { element: 'N', position: amine },
        { element: 'H', position: outward(c2, sixCentre, ch) },
        { element: 'H', position: outward(c8, fiveCentre, ch) },
        { element: 'H', position: outward(n9, fiveCentre, nh) },
        { element: 'H', position: inPlane(amine, c6, 120, nh, [0, 0, 1], 1) },
        { element: 'H', position: inPlane(amine, c6, 120, nh, [0, 0, 1], -1) },
      ]
      return {
        atoms,
        bonds: [
          { a: 0, b: 1, order: 1, length: ring },
          { a: 1, b: 2, order: 1, length: ring },
          { a: 2, b: 3, order: 2, length: ring },
          { a: 3, b: 4, order: 1, length: ring },
          { a: 4, b: 5, order: 2, length: ring },
          { a: 5, b: 0, order: 1, length: ring },
          { a: 1, b: 6, order: 2, length: ring },
          { a: 6, b: 7, order: 1, length: ring },
          { a: 7, b: 8, order: 2, length: ring },
          { a: 8, b: 0, order: 1, length: ring },
          { a: 2, b: 9, order: 1, length: cn },
          { a: 4, b: 10, order: 1, length: ch },
          { a: 7, b: 11, order: 1, length: ch },
          { a: 8, b: 12, order: 1, length: nh },
          { a: 9, b: 13, order: 1, length: nh },
          { a: 9, b: 14, order: 1, length: nh },
        ],
      }
    },
    checks: { angles: [[0, 1, 5, 120]], planar: true },
  },
  {
    id: 'caffeine',
    formula: 'C8H10N4O2',
    name: 'Caffeine',
    nameZh: '咖啡因',
    category: 'organic',
    shape: 'fused-rings',
    shapeZh: '嘌呤并环',
    idealized: true,
    summaryZh:
      '结构与腺苷相似，能占住大脑中的腺苷受体却不激活它 —— 于是"困了"的信号送不出去。这就是提神的原理。',
    summaryEn:
      'Shaped like adenosine, it occupies the brain’s adenosine receptors without activating them, so the "you are tired" signal never gets through. That is how it wakes you up.',
    build() {
      const ring = 1.38
      const co = 1.22
      const ncH3 = 1.47
      const ch = 1.08
      const chMethyl = 1.09
      const { shared, ringA, ringB } = fusedRings(ring, 6, 5)
      const [c4, c5] = shared
      const [, , c6, n1, c2, n3] = ringA
      const [, , n7, c8, n9] = ringB
      const sixCentre = [ringA.reduce((s, p) => s + p[0], 0) / 6, 0, 0]
      const fiveCentre = [ringB.reduce((s, p) => s + p[0], 0) / 5, 0, 0]
      const outward = (p, centre, distance) => add(p, mul(norm(sub(p, centre)), distance))
      const o6 = outward(c6, sixCentre, co)
      const o2 = outward(c2, sixCentre, co)
      const m1 = outward(n1, sixCentre, ncH3)
      const m3 = outward(n3, sixCentre, ncH3)
      const m7 = outward(n7, fiveCentre, ncH3)
      const atoms = [
        { element: 'C', position: c4 },
        { element: 'C', position: c5 },
        { element: 'C', position: c6 },
        { element: 'N', position: n1 },
        { element: 'C', position: c2 },
        { element: 'N', position: n3 },
        { element: 'N', position: n7 },
        { element: 'C', position: c8 },
        { element: 'N', position: n9 },
        { element: 'O', position: o6 },
        { element: 'O', position: o2 },
        { element: 'C', position: m1 },
        { element: 'C', position: m3 },
        { element: 'C', position: m7 },
        { element: 'H', position: outward(c8, fiveCentre, ch) },
      ]
      const bonds = [
        { a: 0, b: 1, order: 2, length: ring },
        { a: 1, b: 2, order: 1, length: ring },
        { a: 2, b: 3, order: 1, length: ring },
        { a: 3, b: 4, order: 1, length: ring },
        { a: 4, b: 5, order: 1, length: ring },
        { a: 5, b: 0, order: 1, length: ring },
        { a: 1, b: 6, order: 1, length: ring },
        { a: 6, b: 7, order: 1, length: ring },
        { a: 7, b: 8, order: 2, length: ring },
        { a: 8, b: 0, order: 1, length: ring },
        { a: 2, b: 9, order: 2, length: co },
        { a: 4, b: 10, order: 2, length: co },
        { a: 3, b: 11, order: 1, length: ncH3 },
        { a: 5, b: 12, order: 1, length: ncH3 },
        { a: 6, b: 13, order: 1, length: ncH3 },
        { a: 7, b: 14, order: 1, length: ch },
      ]
      for (const [carbon, attached] of [
        [11, n1],
        [12, n3],
        [13, n7],
      ]) {
        for (const h of methyl(atoms[carbon].position, attached, chMethyl)) {
          atoms.push({ element: 'H', position: h })
          bonds.push({ a: carbon, b: atoms.length - 1, order: 1, length: chMethyl })
        }
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120]] },
  },
  {
    id: 'aspirin',
    formula: 'C9H8O4',
    name: 'Aspirin',
    nameZh: '阿司匹林',
    category: 'organic',
    shape: 'planar-ring',
    shapeZh: '苯环 + 酯 + 羧基',
    idealized: true,
    summaryZh:
      '1897 年问世，至今仍是用量最大的药物之一。它不可逆地抑制环氧合酶，所以小剂量长期服用能抗血栓。',
    summaryEn:
      'Introduced in 1897 and still among the most-used drugs. It blocks cyclo-oxygenase irreversibly, which is why a small daily dose thins the blood.',
    build() {
      const cc = 1.397
      const chRing = 1.084
      const cCarboxyl = 1.48
      const co = 1.21
      const coh = 1.34
      const oh = 0.97
      const cEsterO = 1.4
      const esterC = 1.36
      const acylO = 1.2
      const acylC = 1.5
      const chMethyl = 1.09
      const normal = [0, 0, 1]
      const atoms = []
      const bonds = []
      const ringCarbons = ring([0, 0, 0], 6, cc)
      ringCarbons.forEach((p) => atoms.push({ element: 'C', position: p }))
      for (let i = 0; i < 6; i++) {
        bonds.push({ a: i, b: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1, length: cc })
      }
      // Carboxyl on ring position 0.
      const carboxylC = mul(norm(ringCarbons[0]), cc + cCarboxyl)
      atoms.push({ element: 'C', position: carboxylC })
      bonds.push({ a: 0, b: 6, order: 1, length: cCarboxyl })
      const oDouble = inPlane(carboxylC, ringCarbons[0], 122, co, normal, 1)
      const oAcid = inPlane(carboxylC, ringCarbons[0], 116, coh, normal, -1)
      atoms.push({ element: 'O', position: oDouble })
      bonds.push({ a: 6, b: 7, order: 2, length: co })
      atoms.push({ element: 'O', position: oAcid })
      bonds.push({ a: 6, b: 8, order: 1, length: coh })
      atoms.push({ element: 'H', position: inPlane(oAcid, carboxylC, 107, oh, normal, -1) })
      bonds.push({ a: 8, b: 9, order: 1, length: oh })
      // Acetyl ester on the neighbouring ring position (ortho to the carboxyl).
      // Its plane is taken perpendicular to the ring rather than coplanar with it:
      // built flat, the acetyl oxygen collides with the carboxyl hydroxyl 0.17 A
      // away. Real aspirin resolves the same strain the same way — the acetoxy
      // group twists out of the ring plane.
      const esterO = mul(norm(ringCarbons[1]), cc + cEsterO)
      atoms.push({ element: 'O', position: esterO })
      bonds.push({ a: 1, b: 10, order: 1, length: cEsterO })
      const outOfPlane = cross(normal, norm(ringCarbons[1]))
      const acylC2 = inPlane(esterO, ringCarbons[1], 118, esterC, outOfPlane, 1)
      atoms.push({ element: 'C', position: acylC2 })
      bonds.push({ a: 10, b: 11, order: 1, length: esterC })
      atoms.push({ element: 'O', position: inPlane(acylC2, esterO, 124, acylO, outOfPlane, 1) })
      bonds.push({ a: 11, b: 12, order: 2, length: acylO })
      const methylC = inPlane(acylC2, esterO, 111, acylC, outOfPlane, -1)
      atoms.push({ element: 'C', position: methylC })
      bonds.push({ a: 11, b: 13, order: 1, length: acylC })
      for (const h of methyl(methylC, acylC2, chMethyl)) {
        atoms.push({ element: 'H', position: h })
        bonds.push({ a: 13, b: atoms.length - 1, order: 1, length: chMethyl })
      }
      for (let i = 2; i < 6; i++) {
        atoms.push({ element: 'H', position: mul(norm(ringCarbons[i]), cc + chRing) })
        bonds.push({ a: i, b: atoms.length - 1, order: 1, length: chRing })
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120], [6, 7, 8, 122]] },
  },
  {
    id: 'paracetamol',
    formula: 'C8H9NO2',
    name: 'Paracetamol',
    nameZh: '对乙酰氨基酚',
    category: 'organic',
    shape: 'planar-ring',
    shapeZh: '苯环 + 羟基 + 酰胺',
    idealized: true,
    summaryZh:
      '最常用的退烧止痛药（扑热息痛）。安全窗口窄 —— 过量会直接损伤肝脏，是急性肝衰竭最常见的药物性原因。',
    summaryEn:
      'The most widely used fever and pain reliever. Its safety margin is narrow: an overdose damages the liver directly and is the leading drug cause of acute liver failure.',
    build() {
      const cc = 1.397
      const chRing = 1.084
      const co = 1.375
      const oh = 0.956
      const cn = 1.41
      const nh = 1.01
      const nc = 1.35
      const acylO = 1.23
      const acylC = 1.5
      const chMethyl = 1.09
      const normal = [0, 0, 1]
      const atoms = []
      const bonds = []
      const ringCarbons = ring([0, 0, 0], 6, cc)
      ringCarbons.forEach((p) => atoms.push({ element: 'C', position: p }))
      for (let i = 0; i < 6; i++) {
        bonds.push({ a: i, b: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1, length: cc })
      }
      // Hydroxyl on position 0, acetamido para to it on position 3.
      const phenolO = mul(norm(ringCarbons[0]), cc + co)
      atoms.push({ element: 'O', position: phenolO })
      bonds.push({ a: 0, b: 6, order: 1, length: co })
      atoms.push({ element: 'H', position: inPlane(phenolO, ringCarbons[0], 108.8, oh, normal, 1) })
      bonds.push({ a: 6, b: 7, order: 1, length: oh })
      const nitrogen = mul(norm(ringCarbons[3]), cc + cn)
      atoms.push({ element: 'N', position: nitrogen })
      bonds.push({ a: 3, b: 8, order: 1, length: cn })
      atoms.push({ element: 'H', position: inPlane(nitrogen, ringCarbons[3], 118, nh, normal, -1) })
      bonds.push({ a: 8, b: 9, order: 1, length: nh })
      const acylC2 = inPlane(nitrogen, ringCarbons[3], 126, nc, normal, 1)
      atoms.push({ element: 'C', position: acylC2 })
      bonds.push({ a: 8, b: 10, order: 1, length: nc })
      atoms.push({ element: 'O', position: inPlane(acylC2, nitrogen, 122, acylO, normal, 1) })
      bonds.push({ a: 10, b: 11, order: 2, length: acylO })
      const methylC = inPlane(acylC2, nitrogen, 115, acylC, normal, -1)
      atoms.push({ element: 'C', position: methylC })
      bonds.push({ a: 10, b: 12, order: 1, length: acylC })
      for (const h of methyl(methylC, acylC2, chMethyl)) {
        atoms.push({ element: 'H', position: h })
        bonds.push({ a: 12, b: atoms.length - 1, order: 1, length: chMethyl })
      }
      for (const i of [1, 2, 4, 5]) {
        atoms.push({ element: 'H', position: mul(norm(ringCarbons[i]), cc + chRing) })
        bonds.push({ a: i, b: atoms.length - 1, order: 1, length: chRing })
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120], [8, 3, 10, 126]] },
  },
  {
    id: 'glucose',
    formula: 'C6H12O6',
    name: 'Glucose',
    nameZh: '葡萄糖',
    category: 'organic',
    shape: 'chair-ring',
    shapeZh: '椅式六元环',
    idealized: true,
    summaryZh:
      '血糖就是它，也是细胞最直接的能量来源。β 型的所有羟基都处在平伏（equatorial）位置，这是它成为自然界最稳定糖类的原因。',
    summaryEn:
      'Blood sugar, and the most direct fuel a cell has. In the beta form every hydroxyl sits equatorial, which is why glucose is the most stable sugar in nature.',
    build() {
      const ringBond = 1.52
      const co = 1.42
      const ch = 1.09
      const oh = 0.97
      // Idealised symmetric chair; the ring oxygen therefore sits at the C-C distance.
      const positions = puckeredRingPositions(6, ringBond, 111.5)
      // Ring order: O5, C1, C2, C3, C4, C5.
      const atoms = [
        { element: 'O', position: positions[0] },
        { element: 'C', position: positions[1] },
        { element: 'C', position: positions[2] },
        { element: 'C', position: positions[3] },
        { element: 'C', position: positions[4] },
        { element: 'C', position: positions[5] },
      ]
      const bonds = []
      for (let i = 0; i < 6; i++) {
        bonds.push({ a: i, b: (i + 1) % 6, order: 1, length: ringBond })
      }
      // Every carbon takes a hydroxyl equatorial and a hydrogen axial — the
      // all-equatorial arrangement that defines beta-D-glucose. C5 carries the
      // CH2OH arm instead of a hydroxyl.
      for (const index of [1, 2, 3, 4, 5]) {
        const prev = positions[(index + 5) % 6]
        const next = positions[(index + 1) % 6]
        const { axial, equatorial } = axialEquatorial(positions[index], prev, next, 109.5, 1)
        const centre = positions[index]
        const along = (target, distance) =>
          add(centre, mul(norm(sub(target, centre)), distance))

        if (index === 5) {
          const c6 = along(equatorial, ringBond)
          atoms.push({ element: 'C', position: c6 })
          bonds.push({ a: 5, b: atoms.length - 1, order: 1, length: ringBond })
          const c6Index = atoms.length - 1
          const dirs = coneDirections(sub(c6, centre), 3, TETRAHEDRAL_CONE, 0)
          const o6 = add(c6, mul(dirs[0], co))
          atoms.push({ element: 'O', position: o6 })
          bonds.push({ a: c6Index, b: atoms.length - 1, order: 1, length: co })
          const o6Index = atoms.length - 1
          for (const d of dirs.slice(1)) {
            atoms.push({ element: 'H', position: add(c6, mul(d, ch)) })
            bonds.push({ a: c6Index, b: atoms.length - 1, order: 1, length: ch })
          }
          atoms.push({ element: 'H', position: branch(o6, c6, 108, oh, 0) })
          bonds.push({ a: o6Index, b: atoms.length - 1, order: 1, length: oh })
        } else {
          const o = along(equatorial, co)
          atoms.push({ element: 'O', position: o })
          bonds.push({ a: index, b: atoms.length - 1, order: 1, length: co })
          const oIndex = atoms.length - 1
          atoms.push({ element: 'H', position: branch(o, centre, 108, oh, 0) })
          bonds.push({ a: oIndex, b: atoms.length - 1, order: 1, length: oh })
        }
        atoms.push({ element: 'H', position: along(axial, ch) })
        bonds.push({ a: index, b: atoms.length - 1, order: 1, length: ch })
      }
      return { atoms, bonds }
    },
    checks: { angles: [[1, 0, 2, 111.5]] },
  },

  // ---- 生活中的其他分子 ----
  {
    id: 'h3bo3',
    formula: 'H3BO3',
    name: 'Boric acid',
    nameZh: '硼酸',
    category: 'inorganic',
    shape: 'trigonal-planar',
    shapeZh: '平面三角形',
    summaryZh:
      '完全平面的分子，三个羟基像风车一样绕硼排列。晶体里靠氢键连成片层，所以硼酸手感滑腻。',
    summaryEn:
      'A flat molecule with three hydroxyls arranged like a pinwheel around boron. In the crystal, hydrogen bonds link the molecules into sheets, which is why boric acid feels slippery.',
    build() {
      const bo = 1.365
      const oh = 0.97
      const normal = [0, 0, 1]
      const oxygens = ring([0, 0, 0], 3, bo)
      const atoms = [{ element: 'B', position: [0, 0, 0] }]
      const bonds = []
      oxygens.forEach((p, i) => {
        atoms.push({ element: 'O', position: p })
        bonds.push({ a: 0, b: i + 1, order: 1, length: bo })
      })
      // Same side every time, which is what makes the pinwheel.
      oxygens.forEach((p, i) => {
        atoms.push({ element: 'H', position: inPlane(p, [0, 0, 0], 114, oh, normal, 1) })
        bonds.push({ a: i + 1, b: atoms.length - 1, order: 1, length: oh })
      })
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 2, 120]], planar: true },
  },
  {
    id: 'c4h10',
    formula: 'C4H10',
    name: 'Butane',
    nameZh: '丁烷',
    category: 'organic',
    shape: 'zigzag-chain',
    shapeZh: '锯齿链',
    summaryZh:
      '打火机里晃动的液体就是它 —— 常温下稍加压即可液化，松开阀门立刻汽化。图中是能量最低的反式构象。',
    summaryEn:
      'The liquid sloshing in a cigarette lighter: a little pressure liquefies it at room temperature and it flashes back to gas at the valve. Shown in its lowest-energy anti conformation.',
    build() {
      const cc = 1.531
      const ch = 1.094
      const chMiddle = 1.096
      const [c1, c2, c3, c4] = planarChain([0, 0, 0], [cc, 0, 0], zigzagSteps(2, cc, 112.7))
      const atoms = [
        { element: 'C', position: c1 },
        { element: 'C', position: c2 },
        { element: 'C', position: c3 },
        { element: 'C', position: c4 },
      ]
      const bonds = [
        { a: 0, b: 1, order: 1, length: cc },
        { a: 1, b: 2, order: 1, length: cc },
        { a: 2, b: 3, order: 1, length: cc },
      ]
      const addAll = (positions, from, length) => {
        for (const p of positions) {
          atoms.push({ element: 'H', position: p })
          bonds.push({ a: from, b: atoms.length - 1, order: 1, length })
        }
      }
      addAll(methyl(c1, c2, ch), 0, ch)
      addAll(completeSp3(c2, c1, c3, 106.4, chMiddle), 1, chMiddle)
      addAll(completeSp3(c3, c2, c4, 106.4, chMiddle), 2, chMiddle)
      addAll(methyl(c4, c3, ch), 3, ch)
      return { atoms, bonds }
    },
    checks: { angles: [[1, 0, 2, 112.7]] },
  },
  {
    id: 'cyclohexane',
    formula: 'C6H12',
    name: 'Cyclohexane',
    nameZh: '环己烷',
    category: 'organic',
    shape: 'chair',
    shapeZh: '椅式',
    summaryZh:
      '六元环不是平面的：折成"椅式"后每个键角都回到 109.5°，完全没有张力。每个碳一个直立氢、一个平伏氢，转动模型就能看出两者的区别。',
    summaryEn:
      'The six-membered ring is not flat. Folded into a chair, every angle returns to 109.5° and the ring is strain-free; each carbon carries one axial and one equatorial hydrogen, easiest to tell apart by spinning the model.',
    build() {
      const cc = 1.536
      const ch = 1.096
      const positions = puckeredRingPositions(6, cc, 111.5)
      const atoms = positions.map((p) => ({ element: 'C', position: p }))
      const bonds = positions.map((_, i) => ({
        a: i,
        b: (i + 1) % 6,
        order: 1,
        length: cc,
      }))
      for (let i = 0; i < 6; i++) {
        const { axial, equatorial } = axialEquatorial(
          positions[i],
          positions[(i + 5) % 6],
          positions[(i + 1) % 6],
          107.5,
          ch,
        )
        for (const p of [axial, equatorial]) {
          atoms.push({ element: 'H', position: p })
          bonds.push({ a: i, b: atoms.length - 1, order: 1, length: ch })
        }
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 111.5]] },
  },
  {
    id: 'isopropanol',
    formula: 'C3H8O',
    formulaDisplayOverride: '(CH3)2CHOH',
    name: 'Isopropanol',
    nameZh: '异丙醇',
    category: 'organic',
    shape: 'tetrahedral',
    shapeZh: '四面体中心',
    summaryZh:
      '医用酒精棉片里的消毒成分。羟基长在中间的碳上，比乙醇更油溶，擦拭电子元件不留水痕。',
    summaryEn:
      'The disinfectant in an alcohol wipe. With the hydroxyl on the middle carbon it dissolves oils better than ethanol and evaporates without leaving water marks.',
    build() {
      const cc = 1.523
      const co = 1.432
      const ch = 1.1
      const chMethyl = 1.093
      const oh = 0.97
      const centre = [0, 0, 0]
      const [dO, dC1, dC2, dH] = TETRAHEDRON
      const o = mul(dO, co)
      const m1 = mul(dC1, cc)
      const m2 = mul(dC2, cc)
      const atoms = [
        { element: 'C', position: centre },
        { element: 'O', position: o },
        { element: 'C', position: m1 },
        { element: 'C', position: m2 },
        { element: 'H', position: mul(dH, ch) },
      ]
      const bonds = [
        { a: 0, b: 1, order: 1, length: co },
        { a: 0, b: 2, order: 1, length: cc },
        { a: 0, b: 3, order: 1, length: cc },
        { a: 0, b: 4, order: 1, length: ch },
      ]
      atoms.push({ element: 'H', position: branch(o, centre, 108.5, oh, 0) })
      bonds.push({ a: 1, b: atoms.length - 1, order: 1, length: oh })
      for (const [index, position] of [
        [2, m1],
        [3, m2],
      ]) {
        for (const h of methyl(position, centre, chMethyl)) {
          atoms.push({ element: 'H', position: h })
          bonds.push({ a: index, b: atoms.length - 1, order: 1, length: chMethyl })
        }
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 2, 3, 109.4712]] },
  },
  {
    id: 'propyleneglycol',
    formula: 'C3H8O2',
    name: 'Propylene glycol',
    nameZh: '丙二醇',
    category: 'organic',
    shape: 'zigzag-chain',
    shapeZh: '锯齿链',
    summaryZh:
      '两个羟基让它极其吸水，又几乎无毒无味 —— 于是成了食品、化妆品和药品里最常见的保湿剂与溶剂。',
    summaryEn:
      'Two hydroxyls make it strongly water-attracting while staying almost tasteless and non-toxic, which is why it turns up as the humectant and solvent in food, cosmetics and medicines.',
    build() {
      const cc = 1.523
      const co = 1.43
      const ch = 1.096
      const chMethyl = 1.093
      const oh = 0.97
      const [c1, c2, c3] = planarChain([0, 0, 0], [cc, 0, 0], zigzagSteps(1, cc, 112))
      const along = (from, target, distance) =>
        add(from, mul(norm(sub(target, from)), distance))
      const atoms = [
        { element: 'C', position: c1 },
        { element: 'C', position: c2 },
        { element: 'C', position: c3 },
      ]
      const bonds = [
        { a: 0, b: 1, order: 1, length: cc },
        { a: 1, b: 2, order: 1, length: cc },
      ]
      // C2 keeps a hydroxyl and a hydrogen; C3 keeps a hydroxyl and two hydrogens.
      const [dirO2, dirH2] = completeSp3(c2, c1, c3, 108, 1)
      const o2 = along(c2, dirO2, co)
      atoms.push({ element: 'O', position: o2 })
      bonds.push({ a: 1, b: 3, order: 1, length: co })
      atoms.push({ element: 'H', position: along(c2, dirH2, ch) })
      bonds.push({ a: 1, b: 4, order: 1, length: ch })
      atoms.push({ element: 'H', position: branch(o2, c2, 108, oh, 180) })
      bonds.push({ a: 3, b: 5, order: 1, length: oh })
      const o3 = aroundAxis(c3, sub(c3, c2), 70.5288, co, 0)
      atoms.push({ element: 'O', position: o3 })
      bonds.push({ a: 2, b: 6, order: 1, length: co })
      for (const p of completeSp3(c3, c2, o3, 108, ch)) {
        atoms.push({ element: 'H', position: p })
        bonds.push({ a: 2, b: atoms.length - 1, order: 1, length: ch })
      }
      atoms.push({ element: 'H', position: branch(o3, c3, 108, oh, 180) })
      bonds.push({ a: 6, b: atoms.length - 1, order: 1, length: oh })
      for (const h of methyl(c1, c2, chMethyl)) {
        atoms.push({ element: 'H', position: h })
        bonds.push({ a: 0, b: atoms.length - 1, order: 1, length: chMethyl })
      }
      return { atoms, bonds }
    },
    checks: { angles: [[1, 0, 2, 112]] },
  },
  {
    id: 'r134a',
    formula: 'C2H2F4',
    formulaDisplayOverride: 'CF3CH2F',
    name: '1,1,1,2-Tetrafluoroethane',
    nameZh: '四氟乙烷',
    category: 'organic',
    shape: 'staggered',
    shapeZh: '交错构象',
    summaryZh:
      '冰箱和汽车空调里的制冷剂 R-134a。它不含氯，不再破坏臭氧层，但仍是很强的温室气体，正逐步被替代。',
    summaryEn:
      'Refrigerant R-134a, in fridges and car air conditioning. Having no chlorine it spares the ozone layer, but it is still a potent greenhouse gas and is being phased down.',
    build() {
      const cc = 1.52
      const cf = 1.34
      const cfSingle = 1.37
      const ch = 1.09
      const c1 = [0, 0, 0]
      const c2 = [cc, 0, 0]
      const axis = sub(c2, c1)
      const atoms = [
        { element: 'C', position: c1 },
        { element: 'C', position: c2 },
      ]
      const bonds = [{ a: 0, b: 1, order: 1, length: cc }]
      // Both ends share one axis frame, so the 60 degree offset is a real
      // staggered conformation rather than whichever way each frame fell.
      for (const d of coneDirections(axis, 3, 180 - TETRAHEDRAL_CONE, 0)) {
        atoms.push({ element: 'F', position: add(c1, mul(d, cf)) })
        bonds.push({ a: 0, b: atoms.length - 1, order: 1, length: cf })
      }
      const far = coneDirections(axis, 3, TETRAHEDRAL_CONE, 60)
      atoms.push({ element: 'F', position: add(c2, mul(far[0], cfSingle)) })
      bonds.push({ a: 1, b: atoms.length - 1, order: 1, length: cfSingle })
      for (const d of far.slice(1)) {
        atoms.push({ element: 'H', position: add(c2, mul(d, ch)) })
        bonds.push({ a: 1, b: atoms.length - 1, order: 1, length: ch })
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 2, 3, 109.4712]] },
  },
  {
    id: 'butadiene',
    formula: 'C4H6',
    name: '1,3-Butadiene',
    nameZh: '1,3-丁二烯',
    category: 'organic',
    shape: 'planar-chain',
    shapeZh: '平面共轭链',
    summaryZh:
      '两个双键隔着一个单键共轭，整个分子被拉成平面。它是合成橡胶的第一原料 —— 轮胎的分子起点。',
    summaryEn:
      'Two double bonds conjugated across a single bond, which flattens the whole molecule. It is the first feedstock of synthetic rubber — where a tyre begins.',
    build() {
      const cd = 1.341
      const cs = 1.463
      const ch = 1.09
      const normal = [0, 0, 1]
      const c2 = [0, 0, 0]
      const c3 = [cs, 0, 0]
      const c1 = inPlane(c2, c3, 122.9, cd, normal, 1)
      const c4 = inPlane(c3, c2, 122.9, cd, normal, -1)
      const atoms = [
        { element: 'C', position: c1 },
        { element: 'C', position: c2 },
        { element: 'C', position: c3 },
        { element: 'C', position: c4 },
      ]
      const bonds = [
        { a: 0, b: 1, order: 2, length: cd },
        { a: 1, b: 2, order: 1, length: cs },
        { a: 2, b: 3, order: 2, length: cd },
      ]
      const addH = (position, from, side, reference, angle) => {
        atoms.push({ element: 'H', position: inPlane(position, reference, angle, ch, normal, side) })
        bonds.push({ a: from, b: atoms.length - 1, order: 1, length: ch })
      }
      addH(c1, 0, 1, c2, 121.5)
      addH(c1, 0, -1, c2, 121.5)
      addH(c2, 1, -1, c3, 119)
      addH(c4, 3, -1, c3, 121.5)
      addH(c4, 3, 1, c3, 121.5)
      addH(c3, 2, 1, c2, 119)
      return { atoms, bonds }
    },
    checks: { angles: [[1, 0, 2, 122.9]], planar: true },
  },
  {
    id: 'isoprene',
    formula: 'C5H8',
    name: 'Isoprene',
    nameZh: '异戊二烯',
    category: 'organic',
    shape: 'planar-chain',
    shapeZh: '共轭链 + 甲基',
    summaryZh:
      '天然橡胶就是几千个异戊二烯首尾相连的长链。植物每年向大气释放数亿吨异戊二烯，夏日树林里的清香有它一份。',
    summaryEn:
      'Natural rubber is thousands of isoprene units linked head to tail. Plants release hundreds of millions of tonnes of it a year — part of the smell of a wood in summer.',
    build() {
      const cd = 1.341
      const cs = 1.463
      const cMethyl = 1.51
      const ch = 1.09
      const chMethyl = 1.093
      const normal = [0, 0, 1]
      const c2 = [0, 0, 0]
      const c3 = [cs, 0, 0]
      const c1 = inPlane(c2, c3, 122.9, cd, normal, 1)
      const c4 = inPlane(c3, c2, 122.9, cd, normal, -1)
      const methylC = inPlane(c2, c3, 117, cMethyl, normal, -1)
      const atoms = [
        { element: 'C', position: c1 },
        { element: 'C', position: c2 },
        { element: 'C', position: c3 },
        { element: 'C', position: c4 },
        { element: 'C', position: methylC },
      ]
      const bonds = [
        { a: 0, b: 1, order: 2, length: cd },
        { a: 1, b: 2, order: 1, length: cs },
        { a: 2, b: 3, order: 2, length: cd },
        { a: 1, b: 4, order: 1, length: cMethyl },
      ]
      const addH = (position, from, side, reference, angle) => {
        atoms.push({ element: 'H', position: inPlane(position, reference, angle, ch, normal, side) })
        bonds.push({ a: from, b: atoms.length - 1, order: 1, length: ch })
      }
      addH(c1, 0, 1, c2, 121.5)
      addH(c1, 0, -1, c2, 121.5)
      addH(c4, 3, -1, c3, 121.5)
      addH(c4, 3, 1, c3, 121.5)
      addH(c3, 2, 1, c2, 119)
      for (const h of methyl(methylC, c2, chMethyl)) {
        atoms.push({ element: 'H', position: h })
        bonds.push({ a: 4, b: atoms.length - 1, order: 1, length: chMethyl })
      }
      return { atoms, bonds }
    },
    checks: { angles: [[1, 0, 2, 122.9]] },
  },
  {
    id: 'benzoicacid',
    formula: 'C7H6O2',
    formulaDisplayOverride: 'C6H5COOH',
    name: 'Benzoic acid',
    nameZh: '苯甲酸',
    category: 'organic',
    shape: 'planar-ring',
    shapeZh: '苯环 + 羧基',
    idealized: true,
    summaryZh:
      '最常用的食品防腐剂之一（常以苯甲酸钠的形式加入）。它在酸性饮料里才有效，因为只有未电离的分子能钻进霉菌细胞。',
    summaryEn:
      'One of the most common food preservatives, usually added as sodium benzoate. It only works in acidic drinks, because only the un-ionised molecule can get inside a mould cell.',
    build() {
      const cc = 1.397
      const chRing = 1.084
      const cCarboxyl = 1.484
      const co = 1.216
      const coh = 1.33
      const oh = 0.97
      const normal = [0, 0, 1]
      const atoms = []
      const bonds = []
      const ringCarbons = ring([0, 0, 0], 6, cc)
      ringCarbons.forEach((p) => atoms.push({ element: 'C', position: p }))
      for (let i = 0; i < 6; i++) {
        bonds.push({ a: i, b: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1, length: cc })
      }
      const carboxylC = mul(norm(ringCarbons[0]), cc + cCarboxyl)
      atoms.push({ element: 'C', position: carboxylC })
      bonds.push({ a: 0, b: 6, order: 1, length: cCarboxyl })
      atoms.push({ element: 'O', position: inPlane(carboxylC, ringCarbons[0], 122, co, normal, 1) })
      bonds.push({ a: 6, b: 7, order: 2, length: co })
      const oAcid = inPlane(carboxylC, ringCarbons[0], 116, coh, normal, -1)
      atoms.push({ element: 'O', position: oAcid })
      bonds.push({ a: 6, b: 8, order: 1, length: coh })
      atoms.push({ element: 'H', position: inPlane(oAcid, carboxylC, 107, oh, normal, -1) })
      bonds.push({ a: 8, b: 9, order: 1, length: oh })
      for (let i = 1; i < 6; i++) {
        atoms.push({ element: 'H', position: mul(norm(ringCarbons[i]), cc + chRing) })
        bonds.push({ a: i, b: atoms.length - 1, order: 1, length: chRing })
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120]], planar: true },
  },
  {
    id: 'terephthalicacid',
    formula: 'C8H6O4',
    name: 'Terephthalic acid',
    nameZh: '对苯二甲酸',
    category: 'organic',
    shape: 'planar-ring',
    shapeZh: '苯环 + 两个羧基',
    idealized: true,
    summaryZh:
      '两个羧基分处苯环两端，正好首尾相接聚合成长链 —— 这就是 PET：矿泉水瓶、涤纶衣服和食品托盘的分子骨架。',
    summaryEn:
      'A carboxyl at each end of the ring, so the molecules polymerise head to tail into long chains. That polymer is PET: water bottles, polyester clothing and food trays.',
    build() {
      const cc = 1.397
      const chRing = 1.084
      const cCarboxyl = 1.484
      const co = 1.216
      const coh = 1.33
      const oh = 0.97
      const normal = [0, 0, 1]
      const atoms = []
      const bonds = []
      const ringCarbons = ring([0, 0, 0], 6, cc)
      ringCarbons.forEach((p) => atoms.push({ element: 'C', position: p }))
      for (let i = 0; i < 6; i++) {
        bonds.push({ a: i, b: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1, length: cc })
      }
      for (const index of [0, 3]) {
        const anchor = ringCarbons[index]
        const carboxylC = mul(norm(anchor), cc + cCarboxyl)
        atoms.push({ element: 'C', position: carboxylC })
        const cIndex = atoms.length - 1
        bonds.push({ a: index, b: cIndex, order: 1, length: cCarboxyl })
        atoms.push({ element: 'O', position: inPlane(carboxylC, anchor, 122, co, normal, 1) })
        bonds.push({ a: cIndex, b: atoms.length - 1, order: 2, length: co })
        const oAcid = inPlane(carboxylC, anchor, 116, coh, normal, -1)
        atoms.push({ element: 'O', position: oAcid })
        const oIndex = atoms.length - 1
        bonds.push({ a: cIndex, b: oIndex, order: 1, length: coh })
        atoms.push({ element: 'H', position: inPlane(oAcid, carboxylC, 107, oh, normal, -1) })
        bonds.push({ a: oIndex, b: atoms.length - 1, order: 1, length: oh })
      }
      for (const index of [1, 2, 4, 5]) {
        atoms.push({ element: 'H', position: mul(norm(ringCarbons[index]), cc + chRing) })
        bonds.push({ a: index, b: atoms.length - 1, order: 1, length: chRing })
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120]], planar: true },
  },
  {
    id: 'salicylicacid',
    formula: 'C7H6O3',
    name: 'Salicylic acid',
    nameZh: '水杨酸',
    category: 'organic',
    shape: 'planar-ring',
    shapeZh: '苯环 + 羧基 + 羟基',
    idealized: true,
    summaryZh:
      '羟基与羧基相邻，酚羟基的氢正好指向羰基氧，形成分子内氢键 —— 这也是它偏酸、脂溶性强、能钻进毛孔的原因。柳树皮镇痛的成分就是它。',
    summaryEn:
      'The hydroxyl sits next to the carboxyl, and its hydrogen points straight at the carbonyl oxygen, forming an internal hydrogen bond. That is why it is acidic, fat-soluble and able to get into a pore. It is the painkiller in willow bark.',
    build() {
      const cc = 1.397
      const chRing = 1.084
      const cCarboxyl = 1.484
      const co = 1.216
      const coh = 1.33
      const cPhenolO = 1.36
      const oh = 0.97
      const normal = [0, 0, 1]
      const atoms = []
      const bonds = []
      const ringCarbons = ring([0, 0, 0], 6, cc)
      ringCarbons.forEach((p) => atoms.push({ element: 'C', position: p }))
      for (let i = 0; i < 6; i++) {
        bonds.push({ a: i, b: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1, length: cc })
      }
      // The carbonyl is turned towards ring position 1, where the hydroxyl sits.
      const carboxylC = mul(norm(ringCarbons[0]), cc + cCarboxyl)
      atoms.push({ element: 'C', position: carboxylC })
      bonds.push({ a: 0, b: 6, order: 1, length: cCarboxyl })
      atoms.push({ element: 'O', position: inPlane(carboxylC, ringCarbons[0], 122, co, normal, -1) })
      bonds.push({ a: 6, b: 7, order: 2, length: co })
      const oAcid = inPlane(carboxylC, ringCarbons[0], 116, coh, normal, 1)
      atoms.push({ element: 'O', position: oAcid })
      bonds.push({ a: 6, b: 8, order: 1, length: coh })
      atoms.push({ element: 'H', position: inPlane(oAcid, carboxylC, 107, oh, normal, 1) })
      bonds.push({ a: 8, b: 9, order: 1, length: oh })
      const phenolO = mul(norm(ringCarbons[1]), cc + cPhenolO)
      atoms.push({ element: 'O', position: phenolO })
      bonds.push({ a: 1, b: 10, order: 1, length: cPhenolO })
      // Aimed at the carbonyl oxygen: the intramolecular hydrogen bond.
      atoms.push({ element: 'H', position: inPlane(phenolO, ringCarbons[1], 107, oh, normal, 1) })
      bonds.push({ a: 10, b: 11, order: 1, length: oh })
      for (let i = 2; i < 6; i++) {
        atoms.push({ element: 'H', position: mul(norm(ringCarbons[i]), cc + chRing) })
        bonds.push({ a: i, b: atoms.length - 1, order: 1, length: chRing })
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120]], planar: true },
  },
  {
    id: 'methylsalicylate',
    formula: 'C8H8O3',
    name: 'Methyl salicylate',
    nameZh: '水杨酸甲酯',
    category: 'organic',
    shape: 'planar-ring',
    shapeZh: '苯环 + 酯 + 羟基',
    idealized: true,
    summaryZh:
      '冬青油的主要成分，风油精、清凉油和肌肉贴布那股穿透性的气味就来自它。皮肤吸收后水解成水杨酸消炎。',
    summaryEn:
      'The main component of oil of wintergreen — the piercing smell of muscle rubs and medicated patches. Absorbed through the skin, it hydrolyses back to salicylic acid.',
    build() {
      const cc = 1.397
      const chRing = 1.084
      const cCarboxyl = 1.484
      const co = 1.21
      const cEsterO = 1.34
      const oMethyl = 1.44
      const chMethyl = 1.09
      const cPhenolO = 1.36
      const oh = 0.97
      const normal = [0, 0, 1]
      const atoms = []
      const bonds = []
      const ringCarbons = ring([0, 0, 0], 6, cc)
      ringCarbons.forEach((p) => atoms.push({ element: 'C', position: p }))
      for (let i = 0; i < 6; i++) {
        bonds.push({ a: i, b: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1, length: cc })
      }
      const esterC = mul(norm(ringCarbons[0]), cc + cCarboxyl)
      atoms.push({ element: 'C', position: esterC })
      bonds.push({ a: 0, b: 6, order: 1, length: cCarboxyl })
      atoms.push({ element: 'O', position: inPlane(esterC, ringCarbons[0], 122, co, normal, -1) })
      bonds.push({ a: 6, b: 7, order: 2, length: co })
      const esterO = inPlane(esterC, ringCarbons[0], 116, cEsterO, normal, 1)
      atoms.push({ element: 'O', position: esterO })
      bonds.push({ a: 6, b: 8, order: 1, length: cEsterO })
      // Pointed away from the ring; turned the other way the methyl runs into the
      // ortho hydrogen.
      const methylC = inPlane(esterO, esterC, 116, oMethyl, normal, -1)
      atoms.push({ element: 'C', position: methylC })
      bonds.push({ a: 8, b: 9, order: 1, length: oMethyl })
      for (const h of methyl(methylC, esterO, chMethyl)) {
        atoms.push({ element: 'H', position: h })
        bonds.push({ a: 9, b: atoms.length - 1, order: 1, length: chMethyl })
      }
      const phenolO = mul(norm(ringCarbons[1]), cc + cPhenolO)
      atoms.push({ element: 'O', position: phenolO })
      const phenolIndex = atoms.length - 1
      bonds.push({ a: 1, b: phenolIndex, order: 1, length: cPhenolO })
      atoms.push({ element: 'H', position: inPlane(phenolO, ringCarbons[1], 107, oh, normal, 1) })
      bonds.push({ a: phenolIndex, b: atoms.length - 1, order: 1, length: oh })
      for (let i = 2; i < 6; i++) {
        atoms.push({ element: 'H', position: mul(norm(ringCarbons[i]), cc + chRing) })
        bonds.push({ a: i, b: atoms.length - 1, order: 1, length: chRing })
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120]] },
  },
  {
    id: 'vanillin',
    formula: 'C8H8O3',
    name: 'Vanillin',
    nameZh: '香草醛',
    category: 'organic',
    shape: 'planar-ring',
    shapeZh: '苯环 + 醛基',
    idealized: true,
    summaryZh:
      '香草味的来源。天然香草荚里含量不到 2%，价格昂贵，因此市售香草味绝大多数是人工合成的同一个分子 —— 分子层面并无区别。',
    summaryEn:
      'The smell of vanilla. A natural pod is under 2% vanillin and costly, so almost all vanilla flavour is the synthetic version of exactly the same molecule — chemically indistinguishable.',
    build() {
      const cc = 1.397
      const chRing = 1.084
      const cAldehyde = 1.47
      const co = 1.21
      const aldehydeH = 1.11
      const cPhenolO = 1.36
      const cMethoxyO = 1.37
      const oMethyl = 1.43
      const chMethyl = 1.09
      const oh = 0.97
      const normal = [0, 0, 1]
      const atoms = []
      const bonds = []
      const ringCarbons = ring([0, 0, 0], 6, cc)
      ringCarbons.forEach((p) => atoms.push({ element: 'C', position: p }))
      for (let i = 0; i < 6; i++) {
        bonds.push({ a: i, b: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1, length: cc })
      }
      // Aldehyde on 0, methoxy on 2, hydroxyl on 3: 4-hydroxy-3-methoxybenzaldehyde.
      const aldehydeC = mul(norm(ringCarbons[0]), cc + cAldehyde)
      atoms.push({ element: 'C', position: aldehydeC })
      bonds.push({ a: 0, b: 6, order: 1, length: cAldehyde })
      atoms.push({ element: 'O', position: inPlane(aldehydeC, ringCarbons[0], 124, co, normal, 1) })
      bonds.push({ a: 6, b: 7, order: 2, length: co })
      atoms.push({
        element: 'H',
        position: inPlane(aldehydeC, ringCarbons[0], 115, aldehydeH, normal, -1),
      })
      bonds.push({ a: 6, b: 8, order: 1, length: aldehydeH })
      const methoxyO = mul(norm(ringCarbons[2]), cc + cMethoxyO)
      atoms.push({ element: 'O', position: methoxyO })
      bonds.push({ a: 2, b: 9, order: 1, length: cMethoxyO })
      // Turned away from the neighbouring hydroxyl on ring position 3.
      const methylC = inPlane(methoxyO, ringCarbons[2], 118, oMethyl, normal, -1)
      atoms.push({ element: 'C', position: methylC })
      bonds.push({ a: 9, b: 10, order: 1, length: oMethyl })
      for (const h of methyl(methylC, methoxyO, chMethyl)) {
        atoms.push({ element: 'H', position: h })
        bonds.push({ a: 10, b: atoms.length - 1, order: 1, length: chMethyl })
      }
      const phenolO = mul(norm(ringCarbons[3]), cc + cPhenolO)
      atoms.push({ element: 'O', position: phenolO })
      const phenolIndex = atoms.length - 1
      bonds.push({ a: 3, b: phenolIndex, order: 1, length: cPhenolO })
      atoms.push({ element: 'H', position: inPlane(phenolO, ringCarbons[3], 108, oh, normal, -1) })
      bonds.push({ a: phenolIndex, b: atoms.length - 1, order: 1, length: oh })
      for (const index of [1, 4, 5]) {
        atoms.push({ element: 'H', position: mul(norm(ringCarbons[index]), cc + chRing) })
        bonds.push({ a: index, b: atoms.length - 1, order: 1, length: chRing })
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120]] },
  },
  {
    id: 'cinnamaldehyde',
    formula: 'C9H8O',
    name: 'Cinnamaldehyde',
    nameZh: '肉桂醛',
    category: 'organic',
    shape: 'planar-chain',
    shapeZh: '苯环 + 共轭链',
    idealized: true,
    summaryZh:
      '肉桂皮里约 90% 的挥发油都是它，桂皮和肉桂卷的味道就来自这一个分子。苯环与醛基之间的共轭双键让它显淡黄色。',
    summaryEn:
      'About 90% of the essential oil in cinnamon bark, and the entire smell of a cinnamon roll. The double bond conjugating the ring with the aldehyde is what gives it a pale yellow colour.',
    build() {
      const cc = 1.397
      const chRing = 1.084
      const cVinyl = 1.467
      const cd = 1.34
      const cAldehyde = 1.47
      const co = 1.21
      const ch = 1.09
      const aldehydeH = 1.11
      const normal = [0, 0, 1]
      const atoms = []
      const bonds = []
      const ringCarbons = ring([0, 0, 0], 6, cc)
      ringCarbons.forEach((p) => atoms.push({ element: 'C', position: p }))
      for (let i = 0; i < 6; i++) {
        bonds.push({ a: i, b: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1, length: cc })
      }
      const alpha = mul(norm(ringCarbons[0]), cc + cVinyl)
      const beta = inPlane(alpha, ringCarbons[0], 126, cd, normal, 1)
      const aldehydeC = inPlane(beta, alpha, 122, cAldehyde, normal, -1)
      atoms.push({ element: 'C', position: alpha })
      bonds.push({ a: 0, b: 6, order: 1, length: cVinyl })
      atoms.push({ element: 'C', position: beta })
      bonds.push({ a: 6, b: 7, order: 2, length: cd })
      atoms.push({ element: 'C', position: aldehydeC })
      bonds.push({ a: 7, b: 8, order: 1, length: cAldehyde })
      atoms.push({ element: 'O', position: inPlane(aldehydeC, beta, 124, co, normal, 1) })
      bonds.push({ a: 8, b: 9, order: 2, length: co })
      atoms.push({ element: 'H', position: inPlane(aldehydeC, beta, 115, aldehydeH, normal, -1) })
      bonds.push({ a: 8, b: 10, order: 1, length: aldehydeH })
      atoms.push({ element: 'H', position: inPlane(alpha, ringCarbons[0], 118, ch, normal, -1) })
      bonds.push({ a: 6, b: 11, order: 1, length: ch })
      atoms.push({ element: 'H', position: inPlane(beta, alpha, 119, ch, normal, 1) })
      bonds.push({ a: 7, b: 12, order: 1, length: ch })
      for (let i = 1; i < 6; i++) {
        atoms.push({ element: 'H', position: mul(norm(ringCarbons[i]), cc + chRing) })
        bonds.push({ a: i, b: atoms.length - 1, order: 1, length: chRing })
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120]], planar: true },
  },
  {
    id: 'oxalicacid',
    formula: 'C2H2O4',
    formulaDisplayOverride: 'HOOCCOOH',
    name: 'Oxalic acid',
    nameZh: '草酸',
    category: 'organic',
    shape: 'planar',
    shapeZh: '平面',
    summaryZh:
      '最简单的二元羧酸，两个羧基直接相连。菠菜、苦瓜、茶叶里的涩味有它一份；它与钙结合成难溶的草酸钙，正是常见肾结石的成分。',
    summaryEn:
      'The simplest dicarboxylic acid — two carboxyls bonded straight together. It contributes the astringency of spinach and tea, and with calcium it forms the insoluble oxalate of the commonest kidney stones.',
    build() {
      const cc = 1.544
      const co = 1.208
      const coh = 1.32
      const oh = 0.97
      const normal = [0, 0, 1]
      const c1 = [0, 0, 0]
      const c2 = [cc, 0, 0]
      const atoms = [
        { element: 'C', position: c1 },
        { element: 'C', position: c2 },
      ]
      const bonds = [{ a: 0, b: 1, order: 1, length: cc }]
      // Same construction at each end; because the reference direction reverses,
      // the two carboxyls come out anti to each other, as in the crystal.
      for (const [index, centre, anchor] of [
        [0, c1, c2],
        [1, c2, c1],
      ]) {
        atoms.push({ element: 'O', position: inPlane(centre, anchor, 123, co, normal, 1) })
        bonds.push({ a: index, b: atoms.length - 1, order: 2, length: co })
        const oAcid = inPlane(centre, anchor, 112, coh, normal, -1)
        atoms.push({ element: 'O', position: oAcid })
        const oIndex = atoms.length - 1
        bonds.push({ a: index, b: oIndex, order: 1, length: coh })
        atoms.push({ element: 'H', position: inPlane(oAcid, centre, 106, oh, normal, -1) })
        bonds.push({ a: oIndex, b: atoms.length - 1, order: 1, length: oh })
      }
      return { atoms, bonds }
    },
    checks: { planar: true },
  },
  {
    id: 'citricacid',
    formula: 'C6H8O7',
    name: 'Citric acid',
    nameZh: '柠檬酸',
    category: 'organic',
    shape: 'branched',
    shapeZh: '三羧基支链',
    summaryZh:
      '三个羧基加一个羟基，酸得干脆又能牢牢抓住金属离子。柠檬的酸味、汽水的酸味调节剂、除水垢的清洁剂都是它；细胞里的柠檬酸循环也以它命名。',
    summaryEn:
      'Three carboxyls plus a hydroxyl: sharply sour, and a firm grip on metal ions. It is the tang of a lemon, the acidity regulator in fizzy drinks and the descaler under the sink — and the citric acid cycle in your cells is named after it.',
    build() {
      const cc = 1.53
      const cCarboxyl = 1.52
      const co = 1.21
      const coh = 1.32
      const cOH = 1.42
      const ch = 1.09
      const oh = 0.97
      const centre = [0, 0, 0]
      const [dHydroxyl, dCarboxyl, dArmA, dArmB] = TETRAHEDRON
      const atoms = [{ element: 'C', position: centre }]
      const bonds = []
      const push = (element, position, from, length, order = 1) => {
        atoms.push({ element, position })
        bonds.push({ a: from, b: atoms.length - 1, order, length })
        return atoms.length - 1
      }
      /** A -COOH on `carbon`, opened out around the bond back to `anchor`. */
      const carboxyl = (carbonIndex, anchor) => {
        const carbon = atoms[carbonIndex].position
        const axis = sub(carbon, anchor)
        push('O', aroundAxis(carbon, axis, 60, co, 0), carbonIndex, co, 2)
        const oAcid = aroundAxis(carbon, axis, 60, coh, 180)
        const oIndex = push('O', oAcid, carbonIndex, coh)
        push('H', branch(oAcid, carbon, 106, oh, 0), oIndex, oh)
      }
      const hydroxylO = mul(dHydroxyl, cOH)
      const oIndex = push('O', hydroxylO, 0, cOH)
      push('H', branch(hydroxylO, centre, 108, oh, 0), oIndex, oh)
      const centralCarboxyl = mul(dCarboxyl, cCarboxyl)
      const centralIndex = push('C', centralCarboxyl, 0, cCarboxyl)
      carboxyl(centralIndex, centre)
      for (const direction of [dArmA, dArmB]) {
        const ch2 = mul(direction, cc)
        const ch2Index = push('C', ch2, 0, cc)
        // The arm's carboxyl continues outward, anti to the central carbon.
        const armCarbon = aroundAxis(ch2, sub(ch2, centre), TETRAHEDRAL_CONE, cCarboxyl, 0)
        const armIndex = push('C', armCarbon, ch2Index, cCarboxyl)
        for (const p of completeSp3(ch2, centre, armCarbon, 107, ch)) {
          push('H', p, ch2Index, ch)
        }
        carboxyl(armIndex, ch2)
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 3, 109.4712]] },
  },
  {
    id: 'ascorbicacid',
    formula: 'C6H8O6',
    name: 'Ascorbic acid',
    nameZh: '抗坏血酸',
    category: 'organic',
    shape: 'five-ring',
    shapeZh: '五元内酯环',
    idealized: true,
    summaryZh:
      '就是维生素 C。环上那对烯二醇羟基极易交出氢原子，所以它既能抗氧化，也能让人体合成胶原蛋白 —— 缺了它，血管和牙龈就出问题，这就是坏血病。',
    summaryEn:
      'Vitamin C. The pair of enediol hydroxyls on the ring gives up hydrogen atoms readily, which makes it both an antioxidant and the cofactor the body needs to build collagen. Without it, blood vessels and gums fail — scurvy.',
    build() {
      const ringBond = 1.4
      const co = 1.21
      const cOH = 1.36
      const cSide = 1.52
      const cChainO = 1.43
      const ch = 1.09
      const oh = 0.97
      const radius = ringBond / (2 * Math.sin(Math.PI / 5))
      // Ring order: C1, C2, C3, C4, O(ring), closing back to C1.
      const [c1, c2, c3, c4, oRing] = ring([0, 0, 0], 5, radius)
      const outward = (p, distance) => mul(norm(p), len(p) + distance)
      const atoms = [
        { element: 'C', position: c1 },
        { element: 'C', position: c2 },
        { element: 'C', position: c3 },
        { element: 'C', position: c4 },
        { element: 'O', position: oRing },
      ]
      const bonds = [
        { a: 0, b: 1, order: 1, length: ringBond },
        { a: 1, b: 2, order: 2, length: ringBond },
        { a: 2, b: 3, order: 1, length: ringBond },
        { a: 3, b: 4, order: 1, length: ringBond },
        { a: 4, b: 0, order: 1, length: ringBond },
      ]
      const push = (element, position, from, length, order = 1) => {
        atoms.push({ element, position })
        bonds.push({ a: from, b: atoms.length - 1, order, length })
        return atoms.length - 1
      }
      // The lactone carbonyl.
      push('O', outward(c1, co), 0, co, 2)
      // The two enediol hydroxyls, pointing straight out of the ring.
      for (const [index, position] of [
        [1, c2],
        [2, c3],
      ]) {
        const o = outward(position, cOH)
        const oIndex = push('O', o, index, cOH)
        push('H', branch(o, position, 107, oh, 0), oIndex, oh)
      }
      // C4 is sp3: the side chain goes above the ring, its hydrogen below.
      const [sideDirection, hDirection] = completeSp3(c4, c3, oRing, 109.5, 1)
      const along = (from, target, distance) =>
        add(from, mul(norm(sub(target, from)), distance))
      const c5 = along(c4, sideDirection, cSide)
      const c5Index = push('C', c5, 3, cSide)
      push('H', along(c4, hDirection, ch), 3, ch)
      // C5 carries a hydroxyl and a hydrogen; C6 is a CH2OH. Both continuations
      // are taken anti, so the tail extends away from the ring instead of
      // folding back onto the hydroxyls.
      const c6 = extendAnti(c3, c4, c5, 111.5, cSide)
      const c6Index = push('C', c6, c5Index, cSide)
      const [o5Direction, h5Direction] = completeSp3(c5, c4, c6, 108, 1)
      const o5 = along(c5, o5Direction, cChainO)
      const o5Index = push('O', o5, c5Index, cChainO)
      push('H', along(c5, h5Direction, ch), c5Index, ch)
      push('H', branch(o5, c5, 107, oh, 0), o5Index, oh)
      const o6 = extendAnti(c4, c5, c6, 109.5, cChainO)
      const o6Index = push('O', o6, c6Index, cChainO)
      for (const p of completeSp3(c6, c5, o6, 108, ch)) push('H', p, c6Index, ch)
      push('H', branch(o6, c6, 107, oh, 0), o6Index, oh)
      return { atoms, bonds }
    },
  },
  {
    id: 'xylitol',
    formula: 'C5H12O5',
    name: 'Xylitol',
    nameZh: '木糖醇',
    category: 'organic',
    shape: 'zigzag-chain',
    shapeZh: '锯齿链 + 五羟基',
    summaryZh:
      '五个碳、五个羟基的糖醇，甜度接近蔗糖但口腔细菌无法发酵它，所以无糖口香糖用它防蛀牙。溶解时吸热，含在嘴里有清凉感。',
    summaryEn:
      'A five-carbon, five-hydroxyl sugar alcohol: nearly as sweet as sugar, but mouth bacteria cannot ferment it, which is why sugar-free gum uses it against decay. Dissolving absorbs heat, so it feels cool on the tongue.',
    build() {
      const cc = 1.523
      const co = 1.43
      const ch = 1.096
      const oh = 0.97
      const carbons = planarChain([0, 0, 0], [cc, 0, 0], zigzagSteps(3, cc, 112))
      const atoms = carbons.map((p) => ({ element: 'C', position: p }))
      const bonds = carbons.slice(1).map((_, i) => ({
        a: i,
        b: i + 1,
        order: 1,
        length: cc,
      }))
      const push = (element, position, from, length) => {
        atoms.push({ element, position })
        bonds.push({ a: from, b: atoms.length - 1, order: 1, length })
        return atoms.length - 1
      }
      const along = (from, target, distance) =>
        add(from, mul(norm(sub(target, from)), distance))
      // Interior carbons: hydroxyl and hydrogen on opposite faces of the chain,
      // alternating which face takes the hydroxyl so neighbours stay clear.
      for (let i = 1; i < 4; i++) {
        const pair = completeSp3(carbons[i], carbons[i - 1], carbons[i + 1], 108, 1)
        const [oDirection, hDirection] = i % 2 === 0 ? pair : [pair[1], pair[0]]
        const o = along(carbons[i], oDirection, co)
        const oIndex = push('O', o, i, co)
        push('H', along(carbons[i], hDirection, ch), i, ch)
        push('H', branch(o, carbons[i], 108, oh, 0), oIndex, oh)
      }
      // Both ends are CH2OH, their hydroxyls continuing the chain outwards.
      for (const [index, neighbour] of [
        [0, 1],
        [4, 3],
      ]) {
        const carbon = carbons[index]
        const o = aroundAxis(carbon, sub(carbon, carbons[neighbour]), TETRAHEDRAL_CONE, co, 0)
        const oIndex = push('O', o, index, co)
        for (const p of completeSp3(carbon, carbons[neighbour], o, 108, ch)) {
          push('H', p, index, ch)
        }
        push('H', branch(o, carbon, 108, oh, 0), oIndex, oh)
      }
      return { atoms, bonds }
    },
    checks: { angles: [[1, 0, 2, 112]] },
  },
  {
    id: 'glutamicacid',
    formula: 'C5H9NO4',
    name: 'Glutamic acid',
    nameZh: '谷氨酸',
    category: 'organic',
    shape: 'zigzag-chain',
    shapeZh: '锯齿链 + 氨基',
    summaryZh:
      '"鲜味"的分子。它的钠盐就是味精，昆布、番茄、干酪、酱油之所以鲜，都是因为游离谷氨酸。它同时是大脑最主要的兴奋性神经递质。',
    summaryEn:
      'The molecule of savouriness. Its sodium salt is MSG, and the free amino acid is why kelp, tomato, cheese and soy sauce taste of umami. It is also the brain’s main excitatory neurotransmitter.',
    build() {
      const cc = 1.52
      const ccChain = 1.526
      const co = 1.214
      const coh = 1.31
      const cn = 1.47
      const nh = 1.01
      const ch = 1.095
      const oh = 0.97
      const normal = [0, 0, 1]
      const carbons = planarChain([0, 0, 0], [cc, 0, 0], zigzagSteps(3, ccChain, 112.7))
      const [c1, c2, c3, c4, c5] = carbons
      const atoms = carbons.map((p) => ({ element: 'C', position: p }))
      const bonds = [
        { a: 0, b: 1, order: 1, length: cc },
        { a: 1, b: 2, order: 1, length: ccChain },
        { a: 2, b: 3, order: 1, length: ccChain },
        { a: 3, b: 4, order: 1, length: ccChain },
      ]
      const push = (element, position, from, length, order = 1) => {
        atoms.push({ element, position })
        bonds.push({ a: from, b: atoms.length - 1, order, length })
        return atoms.length - 1
      }
      // A carboxyl at each end, drawn in the plane of the backbone.
      for (const [index, centre, anchor, side] of [
        [0, c1, c2, 1],
        [4, c5, c4, 1],
      ]) {
        push('O', inPlane(centre, anchor, 122, co, normal, side), index, co, 2)
        const oAcid = inPlane(centre, anchor, 114, coh, normal, -side)
        const oIndex = push('O', oAcid, index, coh)
        push('H', inPlane(oAcid, centre, 106, oh, normal, -side), oIndex, oh)
      }
      const along = (from, target, distance) =>
        add(from, mul(norm(sub(target, from)), distance))
      // The amino group on C2, its hydrogen on the opposite face.
      const [nDirection, hDirection] = completeSp3(c2, c1, c3, 108, 1)
      const nitrogen = along(c2, nDirection, cn)
      const nIndex = push('N', nitrogen, 1, cn)
      push('H', along(c2, hDirection, ch), 1, ch)
      for (const d of coneDirections(sub(nitrogen, c2), 2, 70, 0)) {
        push('H', add(nitrogen, mul(d, nh)), nIndex, nh)
      }
      for (const index of [2, 3]) {
        for (const p of completeSp3(carbons[index], carbons[index - 1], carbons[index + 1], 106.5, ch)) {
          push('H', p, index, ch)
        }
      }
      return { atoms, bonds }
    },
    checks: { angles: [[1, 0, 2, 112.7]] },
  },
  {
    id: 'stearicacid',
    formula: 'C18H36O2',
    name: 'Stearic acid',
    nameZh: '硬脂酸',
    category: 'organic',
    shape: 'zigzag-chain',
    shapeZh: '长锯齿链',
    summaryZh:
      '典型的饱和脂肪酸：一端亲水的羧基，一条十八个碳的疏水长尾 —— 肥皂去污、乳霜乳化、蜡烛成型，靠的都是这条"一头亲水一头亲油"的结构。',
    summaryEn:
      'The archetypal saturated fatty acid: a water-loving carboxyl at one end and an eighteen-carbon water-hating tail. That one-end-each structure is what makes soap clean, creams emulsify and candles hold their shape.',
    build() {
      const cc = 1.526
      const cSp2 = 1.52
      const co = 1.214
      const coh = 1.31
      const ch = 1.095
      const chMethyl = 1.094
      const oh = 0.97
      const normal = [0, 0, 1]
      const carbons = planarChain([0, 0, 0], [cSp2, 0, 0], zigzagSteps(16, cc, 112.7))
      const atoms = carbons.map((p) => ({ element: 'C', position: p }))
      const bonds = carbons.slice(1).map((_, i) => ({
        a: i,
        b: i + 1,
        order: 1,
        length: i === 0 ? cSp2 : cc,
      }))
      const push = (element, position, from, length, order = 1) => {
        atoms.push({ element, position })
        bonds.push({ a: from, b: atoms.length - 1, order, length })
        return atoms.length - 1
      }
      push('O', inPlane(carbons[0], carbons[1], 122, co, normal, 1), 0, co, 2)
      const oAcid = inPlane(carbons[0], carbons[1], 114, coh, normal, -1)
      const oIndex = push('O', oAcid, 0, coh)
      push('H', inPlane(oAcid, carbons[0], 106, oh, normal, -1), oIndex, oh)
      for (let i = 1; i < carbons.length - 1; i++) {
        for (const p of completeSp3(carbons[i], carbons[i - 1], carbons[i + 1], 106.5, ch)) {
          push('H', p, i, ch)
        }
      }
      const last = carbons.length - 1
      for (const p of methyl(carbons[last], carbons[last - 1], chMethyl)) {
        push('H', p, last, chMethyl)
      }
      return { atoms, bonds }
    },
    checks: { angles: [[1, 0, 2, 112.7]] },
  },
  {
    id: 'oleicacid',
    formula: 'C18H34O2',
    name: 'Oleic acid',
    nameZh: '油酸',
    category: 'organic',
    shape: 'kinked-chain',
    shapeZh: '含顺式弯折的长链',
    summaryZh:
      '与硬脂酸只差中间一个顺式双键，链却因此折出约 30° 的弯 —— 分子排不紧密，于是橄榄油在室温下是液体，而硬脂酸是硬块。饱和与不饱和脂肪的差别，看这一个折角就够了。',
    summaryEn:
      'It differs from stearic acid by one cis double bond, and that single kink kinks the chain by about 30°. The molecules can no longer pack tightly, so olive oil is liquid while stearic acid is a hard solid — the whole saturated-versus-unsaturated story in one bend.',
    build() {
      const cc = 1.526
      const cSp2 = 1.52
      const cd = 1.331
      const cAllylic = 1.5
      const co = 1.214
      const coh = 1.31
      const ch = 1.095
      const chVinyl = 1.09
      const chMethyl = 1.094
      const oh = 0.97
      const normal = [0, 0, 1]
      // Carbons 3..18. The two turns at the double bond repeat their side, which
      // is what makes it cis; everywhere else the sides alternate.
      const steps = []
      let side = 1
      const step = (angle, length) => {
        steps.push({ angle, length, side })
        side = -side
      }
      for (let n = 3; n <= 9; n++) step(112.7, cc)
      step(125, cd) // places C10 across the double bond
      side = -side // repeat the side: the cis kink
      step(125, cAllylic) // places C11
      for (let n = 12; n <= 18; n++) step(112.7, cc)
      const carbons = planarChain([0, 0, 0], [cSp2, 0, 0], steps)
      const atoms = carbons.map((p) => ({ element: 'C', position: p }))
      const bonds = carbons.slice(1).map((_, i) => ({
        a: i,
        b: i + 1,
        order: i === 8 ? 2 : 1,
        length: i === 0 ? cSp2 : steps[i - 1]?.length ?? cc,
      }))
      const push = (element, position, from, length, order = 1) => {
        atoms.push({ element, position })
        bonds.push({ a: from, b: atoms.length - 1, order, length })
        return atoms.length - 1
      }
      push('O', inPlane(carbons[0], carbons[1], 122, co, normal, 1), 0, co, 2)
      const oAcid = inPlane(carbons[0], carbons[1], 114, coh, normal, -1)
      const oIndex = push('O', oAcid, 0, coh)
      push('H', inPlane(oAcid, carbons[0], 106, oh, normal, -1), oIndex, oh)
      for (let i = 1; i < carbons.length - 1; i++) {
        if (i === 8 || i === 9) continue
        for (const p of completeSp3(carbons[i], carbons[i - 1], carbons[i + 1], 106.5, ch)) {
          push('H', p, i, ch)
        }
      }
      // The two alkene hydrogens sit in the chain plane, opposite the continuation.
      push('H', inPlane(carbons[8], carbons[7], 118, chVinyl, normal, -steps[7].side), 8, chVinyl)
      push('H', inPlane(carbons[9], carbons[8], 118, chVinyl, normal, -steps[8].side), 9, chVinyl)
      const last = carbons.length - 1
      for (const p of methyl(carbons[last], carbons[last - 1], chMethyl)) {
        push('H', p, last, chMethyl)
      }
      return { atoms, bonds }
    },
    checks: { angles: [[1, 0, 2, 112.7]] },
  },
  {
    id: 'theobromine',
    formula: 'C7H8N4O2',
    name: 'Theobromine',
    nameZh: '可可碱',
    category: 'organic',
    shape: 'fused-rings',
    shapeZh: '嘌呤并环',
    idealized: true,
    summaryZh:
      '巧克力里的主要生物碱，比咖啡因少一个甲基。它提神更温和、作用更久；但狗代谢它极慢，所以巧克力对狗有毒。',
    summaryEn:
      'The main alkaloid of chocolate, one methyl group short of caffeine. Its lift is gentler and longer-lasting — but dogs break it down very slowly, which is why chocolate poisons them.',
    build() {
      const ringBond = 1.38
      const co = 1.22
      const ncH3 = 1.47
      const ch = 1.08
      const chMethyl = 1.09
      const nh = 1.01
      const { shared, ringA, ringB } = fusedRings(ringBond, 6, 5)
      const [c4, c5] = shared
      const [, , c6, n1, c2, n3] = ringA
      const [, , n7, c8, n9] = ringB
      const sixCentre = [ringA.reduce((s, p) => s + p[0], 0) / 6, 0, 0]
      const fiveCentre = [ringB.reduce((s, p) => s + p[0], 0) / 5, 0, 0]
      const outward = (p, centre, distance) => add(p, mul(norm(sub(p, centre)), distance))
      const m3 = outward(n3, sixCentre, ncH3)
      const m7 = outward(n7, fiveCentre, ncH3)
      const atoms = [
        { element: 'C', position: c4 },
        { element: 'C', position: c5 },
        { element: 'C', position: c6 },
        { element: 'N', position: n1 },
        { element: 'C', position: c2 },
        { element: 'N', position: n3 },
        { element: 'N', position: n7 },
        { element: 'C', position: c8 },
        { element: 'N', position: n9 },
        { element: 'O', position: outward(c6, sixCentre, co) },
        { element: 'O', position: outward(c2, sixCentre, co) },
        { element: 'C', position: m3 },
        { element: 'C', position: m7 },
        { element: 'H', position: outward(c8, fiveCentre, ch) },
        // N1 keeps its hydrogen: that is the difference from caffeine.
        { element: 'H', position: outward(n1, sixCentre, nh) },
      ]
      const bonds = [
        { a: 0, b: 1, order: 2, length: ringBond },
        { a: 1, b: 2, order: 1, length: ringBond },
        { a: 2, b: 3, order: 1, length: ringBond },
        { a: 3, b: 4, order: 1, length: ringBond },
        { a: 4, b: 5, order: 1, length: ringBond },
        { a: 5, b: 0, order: 1, length: ringBond },
        { a: 1, b: 6, order: 1, length: ringBond },
        { a: 6, b: 7, order: 1, length: ringBond },
        { a: 7, b: 8, order: 2, length: ringBond },
        { a: 8, b: 0, order: 1, length: ringBond },
        { a: 2, b: 9, order: 2, length: co },
        { a: 4, b: 10, order: 2, length: co },
        { a: 5, b: 11, order: 1, length: ncH3 },
        { a: 6, b: 12, order: 1, length: ncH3 },
        { a: 7, b: 13, order: 1, length: ch },
        { a: 3, b: 14, order: 1, length: nh },
      ]
      for (const [carbon, attached] of [
        [11, n3],
        [12, n7],
      ]) {
        for (const h of methyl(atoms[carbon].position, attached, chMethyl)) {
          atoms.push({ element: 'H', position: h })
          bonds.push({ a: carbon, b: atoms.length - 1, order: 1, length: chMethyl })
        }
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120]] },
  },
  {
    id: 'uricacid',
    formula: 'C5H4N4O3',
    name: 'Uric acid',
    nameZh: '尿酸',
    category: 'organic',
    shape: 'fused-rings',
    shapeZh: '嘌呤并环',
    idealized: true,
    summaryZh:
      '人体分解嘌呤的终产物。人类缺少把它继续降解的尿酸酶，血中浓度一高就析出针状晶体扎在关节里 —— 这就是痛风发作的痛。',
    summaryEn:
      'The end product of purine breakdown. Humans lack the enzyme that would degrade it further, so once blood levels run high it crystallises into needles inside a joint — the pain of gout.',
    build() {
      const ringBond = 1.38
      const co = 1.22
      const nh = 1.01
      const { shared, ringA, ringB } = fusedRings(ringBond, 6, 5)
      const [c4, c5] = shared
      const [, , c6, n1, c2, n3] = ringA
      const [, , n7, c8, n9] = ringB
      const sixCentre = [ringA.reduce((s, p) => s + p[0], 0) / 6, 0, 0]
      const fiveCentre = [ringB.reduce((s, p) => s + p[0], 0) / 5, 0, 0]
      const outward = (p, centre, distance) => add(p, mul(norm(sub(p, centre)), distance))
      const atoms = [
        { element: 'C', position: c4 },
        { element: 'C', position: c5 },
        { element: 'C', position: c6 },
        { element: 'N', position: n1 },
        { element: 'C', position: c2 },
        { element: 'N', position: n3 },
        { element: 'N', position: n7 },
        { element: 'C', position: c8 },
        { element: 'N', position: n9 },
        { element: 'O', position: outward(c6, sixCentre, co) },
        { element: 'O', position: outward(c2, sixCentre, co) },
        { element: 'O', position: outward(c8, fiveCentre, co) },
        { element: 'H', position: outward(n1, sixCentre, nh) },
        { element: 'H', position: outward(n3, sixCentre, nh) },
        { element: 'H', position: outward(n7, fiveCentre, nh) },
        { element: 'H', position: outward(n9, fiveCentre, nh) },
      ]
      return {
        atoms,
        bonds: [
          { a: 0, b: 1, order: 2, length: ringBond },
          { a: 1, b: 2, order: 1, length: ringBond },
          { a: 2, b: 3, order: 1, length: ringBond },
          { a: 3, b: 4, order: 1, length: ringBond },
          { a: 4, b: 5, order: 1, length: ringBond },
          { a: 5, b: 0, order: 1, length: ringBond },
          { a: 1, b: 6, order: 1, length: ringBond },
          { a: 6, b: 7, order: 1, length: ringBond },
          { a: 7, b: 8, order: 1, length: ringBond },
          { a: 8, b: 0, order: 1, length: ringBond },
          { a: 2, b: 9, order: 2, length: co },
          { a: 4, b: 10, order: 2, length: co },
          { a: 7, b: 11, order: 2, length: co },
          { a: 3, b: 12, order: 1, length: nh },
          { a: 5, b: 13, order: 1, length: nh },
          { a: 6, b: 14, order: 1, length: nh },
          { a: 8, b: 15, order: 1, length: nh },
        ],
      }
    },
    checks: { angles: [[0, 1, 5, 120]], planar: true },
  },
  {
    id: 'dopamine',
    formula: 'C8H11NO2',
    name: 'Dopamine',
    nameZh: '多巴胺',
    category: 'organic',
    shape: 'planar-ring',
    shapeZh: '苯环 + 乙胺链',
    idealized: true,
    summaryZh:
      '大脑里负责奖赏与动机的神经递质 —— 它传递的与其说是"快乐"，不如说是"值得再来一次"。同一个分子在体外也能被氧化成黑色素，切开的苹果发褐与它同源。',
    summaryEn:
      'The neurotransmitter behind reward and motivation — it signals "worth doing again" rather than pleasure itself. Oxidised outside the body the same catechol turns into dark pigment, the chemistry that browns a cut apple.',
    build() {
      const cc = 1.397
      const chRing = 1.084
      const cChain = 1.51
      const ccChain = 1.526
      const cn = 1.47
      const cPhenolO = 1.37
      const ch = 1.09
      const nh = 1.01
      const oh = 0.97
      const normal = [0, 0, 1]
      const atoms = []
      const bonds = []
      const ringCarbons = ring([0, 0, 0], 6, cc)
      ringCarbons.forEach((p) => atoms.push({ element: 'C', position: p }))
      for (let i = 0; i < 6; i++) {
        bonds.push({ a: i, b: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1, length: cc })
      }
      const push = (element, position, from, length, order = 1) => {
        atoms.push({ element, position })
        bonds.push({ a: from, b: atoms.length - 1, order, length })
        return atoms.length - 1
      }
      // Ethylamine chain on ring position 0, extended away from the ring.
      const c1 = mul(norm(ringCarbons[0]), cc + cChain)
      const c1Index = push('C', c1, 0, cChain)
      const c2 = extendAnti(ringCarbons[1], ringCarbons[0], c1, 112, ccChain)
      const c2Index = push('C', c2, c1Index, ccChain)
      const nitrogen = extendAnti(ringCarbons[0], c1, c2, 111, cn)
      const nIndex = push('N', nitrogen, c2Index, cn)
      for (const p of completeSp3(c1, ringCarbons[0], c2, 107, ch)) push('H', p, c1Index, ch)
      for (const p of completeSp3(c2, c1, nitrogen, 107, ch)) push('H', p, c2Index, ch)
      for (const d of coneDirections(sub(nitrogen, c2), 2, 70, 0)) {
        push('H', add(nitrogen, mul(d, nh)), nIndex, nh)
      }
      // Catechol hydroxyls on ring positions 2 and 3, turned away from each other.
      for (const [index, side] of [
        [2, -1],
        [3, 1],
      ]) {
        const o = mul(norm(ringCarbons[index]), cc + cPhenolO)
        const oIndex = push('O', o, index, cPhenolO)
        push('H', inPlane(o, ringCarbons[index], 108, oh, normal, side), oIndex, oh)
      }
      for (const index of [1, 4, 5]) {
        push('H', mul(norm(ringCarbons[index]), cc + chRing), index, chRing)
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120]] },
  },
  {
    id: 'adrenaline',
    formula: 'C9H13NO3',
    name: 'Adrenaline',
    nameZh: '肾上腺素',
    category: 'organic',
    shape: 'planar-ring',
    shapeZh: '苯环 + 侧链',
    idealized: true,
    summaryZh:
      '"战或逃"的分子：心跳加快、瞳孔放大、支气管扩张、血糖上升，都在几秒内由它触发。过敏性休克的急救笔里装的就是它。',
    summaryEn:
      'The fight-or-flight molecule: faster heartbeat, wide pupils, open airways and a rise in blood sugar, all triggered within seconds. It is what an anaphylaxis auto-injector contains.',
    build() {
      const cc = 1.397
      const chRing = 1.084
      const cChain = 1.51
      const ccChain = 1.526
      const cn = 1.47
      const cPhenolO = 1.37
      const cAlcoholO = 1.43
      const ch = 1.09
      const chMethyl = 1.09
      const nh = 1.01
      const oh = 0.97
      const normal = [0, 0, 1]
      const atoms = []
      const bonds = []
      const ringCarbons = ring([0, 0, 0], 6, cc)
      ringCarbons.forEach((p) => atoms.push({ element: 'C', position: p }))
      for (let i = 0; i < 6; i++) {
        bonds.push({ a: i, b: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1, length: cc })
      }
      const push = (element, position, from, length, order = 1) => {
        atoms.push({ element, position })
        bonds.push({ a: from, b: atoms.length - 1, order, length })
        return atoms.length - 1
      }
      const along = (from, target, distance) =>
        add(from, mul(norm(sub(target, from)), distance))
      const c1 = mul(norm(ringCarbons[0]), cc + cChain)
      const c1Index = push('C', c1, 0, cChain)
      const c2 = extendAnti(ringCarbons[1], ringCarbons[0], c1, 112, ccChain)
      const c2Index = push('C', c2, c1Index, ccChain)
      const nitrogen = extendAnti(ringCarbons[0], c1, c2, 111, cn)
      const nIndex = push('N', nitrogen, c2Index, cn)
      // The benzylic carbon carries the hydroxyl that makes it adrenaline.
      const [oDirection, hDirection] = completeSp3(c1, ringCarbons[0], c2, 108, 1)
      const benzylicO = along(c1, oDirection, cAlcoholO)
      const benzylicIndex = push('O', benzylicO, c1Index, cAlcoholO)
      push('H', along(c1, hDirection, ch), c1Index, ch)
      push('H', branch(benzylicO, c1, 108, oh, 0), benzylicIndex, oh)
      for (const p of completeSp3(c2, c1, nitrogen, 107, ch)) push('H', p, c2Index, ch)
      const [methylDirection, nhDirection] = coneDirections(sub(nitrogen, c2), 2, 70, 0)
      const nMethyl = add(nitrogen, mul(methylDirection, cn))
      const methylIndex = push('C', nMethyl, nIndex, cn)
      push('H', add(nitrogen, mul(nhDirection, nh)), nIndex, nh)
      for (const h of methyl(nMethyl, nitrogen, chMethyl)) push('H', h, methylIndex, chMethyl)
      for (const [index, side] of [
        [2, -1],
        [3, 1],
      ]) {
        const o = mul(norm(ringCarbons[index]), cc + cPhenolO)
        const oIndex = push('O', o, index, cPhenolO)
        push('H', inPlane(o, ringCarbons[index], 108, oh, normal, side), oIndex, oh)
      }
      for (const index of [1, 4, 5]) {
        push('H', mul(norm(ringCarbons[index]), cc + chRing), index, chRing)
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120]] },
  },
  {
    id: 'ibuprofen',
    formula: 'C13H18O2',
    name: 'Ibuprofen',
    nameZh: '布洛芬',
    category: 'organic',
    shape: 'planar-ring',
    shapeZh: '苯环 + 支链 + 羧基',
    idealized: true,
    summaryZh:
      '家庭药箱里最常见的消炎止痛药。它抑制环氧合酶，切断前列腺素的合成 —— 于是痛、肿、发热一起降下来。空腹服用伤胃，也是同一个机制的代价。',
    summaryEn:
      'The anti-inflammatory painkiller in every medicine cabinet. It blocks cyclo-oxygenase and cuts off prostaglandin synthesis, so pain, swelling and fever all subside together — and the same mechanism is why it is hard on an empty stomach.',
    build() {
      const cc = 1.397
      const chRing = 1.084
      const cChain = 1.51
      const ccChain = 1.53
      const cCarboxyl = 1.52
      const co = 1.21
      const coh = 1.32
      const ch = 1.09
      const chMethyl = 1.09
      const oh = 0.97
      const atoms = []
      const bonds = []
      const ringCarbons = ring([0, 0, 0], 6, cc)
      ringCarbons.forEach((p) => atoms.push({ element: 'C', position: p }))
      for (let i = 0; i < 6; i++) {
        bonds.push({ a: i, b: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1, length: cc })
      }
      const push = (element, position, from, length, order = 1) => {
        atoms.push({ element, position })
        bonds.push({ a: from, b: atoms.length - 1, order, length })
        return atoms.length - 1
      }
      const along = (from, target, distance) =>
        add(from, mul(norm(sub(target, from)), distance))
      // Ring position 0: the propanoic acid arm.
      const alpha = mul(norm(ringCarbons[0]), cc + cChain)
      const alphaIndex = push('C', alpha, 0, cChain)
      const carboxylC = extendAnti(ringCarbons[1], ringCarbons[0], alpha, 111, cCarboxyl)
      const carboxylIndex = push('C', carboxylC, alphaIndex, cCarboxyl)
      const axis = sub(carboxylC, alpha)
      push('O', aroundAxis(carboxylC, axis, 60, co, 0), carboxylIndex, co, 2)
      const oAcid = aroundAxis(carboxylC, axis, 60, coh, 180)
      const oIndex = push('O', oAcid, carboxylIndex, coh)
      push('H', branch(oAcid, carboxylC, 106, oh, 0), oIndex, oh)
      const [methylDirection, hDirection] = completeSp3(alpha, ringCarbons[0], carboxylC, 108, 1)
      const alphaMethyl = along(alpha, methylDirection, ccChain)
      const alphaMethylIndex = push('C', alphaMethyl, alphaIndex, ccChain)
      push('H', along(alpha, hDirection, ch), alphaIndex, ch)
      for (const h of methyl(alphaMethyl, alpha, chMethyl)) {
        push('H', h, alphaMethylIndex, chMethyl)
      }
      // Ring position 3 (para): the isobutyl arm.
      const ch2 = mul(norm(ringCarbons[3]), cc + cChain)
      const ch2Index = push('C', ch2, 3, cChain)
      const isopropylC = extendAnti(ringCarbons[4], ringCarbons[3], ch2, 112, ccChain)
      const isopropylIndex = push('C', isopropylC, ch2Index, ccChain)
      for (const p of completeSp3(ch2, ringCarbons[3], isopropylC, 107, ch)) {
        push('H', p, ch2Index, ch)
      }
      // Rotated so the methyls swing clear of the ring hydrogens.
      const branches = coneDirections(sub(isopropylC, ch2), 3, TETRAHEDRAL_CONE, 180)
      for (const direction of branches.slice(0, 2)) {
        const carbon = add(isopropylC, mul(direction, ccChain))
        const index = push('C', carbon, isopropylIndex, ccChain)
        for (const h of methyl(carbon, isopropylC, chMethyl)) push('H', h, index, chMethyl)
      }
      push('H', add(isopropylC, mul(branches[2], ch)), isopropylIndex, ch)
      for (const index of [1, 2, 4, 5]) {
        push('H', mul(norm(ringCarbons[index]), cc + chRing), index, chRing)
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120]] },
  },
  {
    id: 'menthol',
    formula: 'C10H20O',
    name: 'Menthol',
    nameZh: '薄荷醇',
    category: 'organic',
    shape: 'chair',
    shapeZh: '椅式环 + 三取代',
    summaryZh:
      '它并不真的降温，而是直接打开皮肤和口腔里感知寒冷的 TRPM8 通道，大脑于是收到"冷"的信号。牙膏、口香糖、清凉油的凉意都是这样来的。三个取代基都取平伏位，是最稳定的构象。',
    summaryEn:
      'It does not cool anything: it opens TRPM8, the cold receptor in skin and mouth, so the brain simply receives "cold". That is the chill of toothpaste, chewing gum and muscle rub. All three substituents sit equatorial, the most stable arrangement.',
    build() {
      const cc = 1.53
      const ccChain = 1.53
      const co = 1.43
      const ch = 1.096
      const chMethyl = 1.09
      const oh = 0.97
      const positions = puckeredRingPositions(6, cc, 111.5)
      const atoms = positions.map((p) => ({ element: 'C', position: p }))
      const bonds = positions.map((_, i) => ({ a: i, b: (i + 1) % 6, order: 1, length: cc }))
      const push = (element, position, from, length, order = 1) => {
        atoms.push({ element, position })
        bonds.push({ a: from, b: atoms.length - 1, order, length })
        return atoms.length - 1
      }
      const along = (from, target, distance) =>
        add(from, mul(norm(sub(target, from)), distance))
      const substituents = new Map([
        [0, 'hydroxyl'],
        [1, 'isopropyl'],
        [4, 'methyl'],
      ])
      for (let i = 0; i < 6; i++) {
        const centre = positions[i]
        const { axial, equatorial } = axialEquatorial(
          centre,
          positions[(i + 5) % 6],
          positions[(i + 1) % 6],
          108,
          1,
        )
        const kind = substituents.get(i)
        if (!kind) {
          for (const direction of [axial, equatorial]) push('H', along(centre, direction, ch), i, ch)
          continue
        }
        // Substituents take the equatorial slot; the hydrogen takes the axial one.
        push('H', along(centre, axial, ch), i, ch)
        if (kind === 'hydroxyl') {
          const oxygen = along(centre, equatorial, co)
          const oIndex = push('O', oxygen, i, co)
          push('H', branch(oxygen, centre, 108, oh, 0), oIndex, oh)
        } else if (kind === 'methyl') {
          const carbon = along(centre, equatorial, ccChain)
          const index = push('C', carbon, i, ccChain)
          for (const h of methyl(carbon, centre, chMethyl)) push('H', h, index, chMethyl)
        } else {
          const carbon = along(centre, equatorial, ccChain)
          const index = push('C', carbon, i, ccChain)
          // Rotated away from the neighbouring hydroxyl.
          const branches = coneDirections(sub(carbon, centre), 3, TETRAHEDRAL_CONE, 180)
          for (const direction of branches.slice(0, 2)) {
            const methylC = add(carbon, mul(direction, ccChain))
            const methylIndex = push('C', methylC, index, ccChain)
            for (const h of methyl(methylC, carbon, chMethyl)) push('H', h, methylIndex, chMethyl)
          }
          push('H', add(carbon, mul(branches[2], ch)), index, ch)
        }
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 111.5]] },
  },
  {
    id: 'nicotine',
    formula: 'C10H14N2',
    name: 'Nicotine',
    nameZh: '尼古丁',
    category: 'organic',
    shape: 'two-rings',
    shapeZh: '吡啶环 + 吡咯烷环',
    idealized: true,
    summaryZh:
      '烟草里的成瘾成分。它的形状与乙酰胆碱相似，能骗过神经上的乙酰胆碱受体，几秒内到达大脑并释放多巴胺 —— 成瘾就是这么快建立的。烟草用它来毒杀啃食叶子的昆虫。',
    summaryEn:
      'The addictive component of tobacco. Shaped enough like acetylcholine to fool nicotinic receptors, it reaches the brain within seconds and releases dopamine — which is how the habit forms so fast. The plant makes it to poison insects that chew its leaves.',
    build() {
      const ringFive = 1.5
      const ringSix = 1.39
      const cLink = 1.51
      const nMethyl = 1.47
      const ch = 1.09
      const chRing = 1.084
      const chMethyl = 1.09
      // Pyrrolidine first, flat in the xy-plane: N1', C2', C3', C4', C5'.
      const radiusFive = ringFive / (2 * Math.sin(Math.PI / 5))
      const [n1, c2, c3, c4, c5] = ring([0, 0, 0], 5, radiusFive)
      const atoms = [
        { element: 'N', position: n1 },
        { element: 'C', position: c2 },
        { element: 'C', position: c3 },
        { element: 'C', position: c4 },
        { element: 'C', position: c5 },
      ]
      const bonds = [
        { a: 0, b: 1, order: 1, length: ringFive },
        { a: 1, b: 2, order: 1, length: ringFive },
        { a: 2, b: 3, order: 1, length: ringFive },
        { a: 3, b: 4, order: 1, length: ringFive },
        { a: 4, b: 0, order: 1, length: ringFive },
      ]
      const push = (element, position, from, length, order = 1) => {
        atoms.push({ element, position })
        bonds.push({ a: from, b: atoms.length - 1, order, length })
        return atoms.length - 1
      }
      const along = (from, target, distance) =>
        add(from, mul(norm(sub(target, from)), distance))
      // C2' carries the pyridine on one face and a hydrogen on the other.
      const [ringDirection, hDirection] = completeSp3(c2, n1, c3, 109.5, 1)
      const ipso = along(c2, ringDirection, cLink)
      const axis = norm(sub(ipso, c2))
      // The pyridine plane is taken through the pyrrolidine's normal, which puts
      // the two rings roughly perpendicular — the shape nicotine actually adopts.
      const upright = sub([0, 0, 1], mul(axis, dot([0, 0, 1], axis)))
      const pyridine = ringAtVertex(ipso, axis, upright, 6, ringSix)
      const pyridineCentre = mul(
        pyridine.reduce((s, p) => add(s, p), [0, 0, 0]),
        1 / 6,
      )
      const ipsoIndex = push('C', pyridine[0], 1, cLink)
      const pyridineIndices = [ipsoIndex]
      for (let i = 1; i < 6; i++) {
        // Position 2 of the walk is the ring nitrogen: a 3-pyridyl group.
        pyridineIndices.push(
          push(i === 2 ? 'N' : 'C', pyridine[i], pyridineIndices[i - 1], ringSix, i % 2 === 0 ? 2 : 1),
        )
      }
      bonds.push({ a: pyridineIndices[5], b: ipsoIndex, order: 2, length: ringSix })
      for (const i of [1, 3, 4, 5]) {
        push(
          'H',
          add(pyridine[i], mul(norm(sub(pyridine[i], pyridineCentre)), chRing)),
          pyridineIndices[i],
          chRing,
        )
      }
      push('H', along(c2, hDirection, ch), 1, ch)
      // The N-methyl points straight out of the five-ring.
      const methylC = mul(norm(n1), len(n1) + nMethyl)
      const methylIndex = push('C', methylC, 0, nMethyl)
      for (const h of methyl(methylC, n1, chMethyl)) push('H', h, methylIndex, chMethyl)
      for (const [index, previous, next] of [
        [2, c2, c4],
        [3, c3, c5],
        [4, c4, n1],
      ]) {
        for (const p of completeSp3(atoms[index].position, previous, next, 108, ch)) {
          push('H', p, index, ch)
        }
      }
      return { atoms, bonds }
    },
  },
  {
    id: 'fructose',
    formula: 'C6H12O6',
    name: 'Fructose',
    nameZh: '果糖',
    category: 'organic',
    shape: 'five-ring',
    shapeZh: '五元呋喃环',
    idealized: true,
    summaryZh:
      '水果和蜂蜜里的糖，也是最甜的天然糖 —— 甜度约为蔗糖的 1.7 倍。与葡萄糖是同分异构体，却几乎只在肝脏代谢，这也是果葡糖浆备受争议的原因。',
    summaryEn:
      'The sugar of fruit and honey, and the sweetest natural sugar — about 1.7 times sucrose. It is an isomer of glucose, yet it is metabolised almost entirely in the liver, which is what makes high-fructose syrup controversial.',
    build() {
      const ringBond = 1.43
      const co = 1.42
      const cc = 1.52
      const ch = 1.09
      const oh = 0.97
      const radius = ringBond / (2 * Math.sin(Math.PI / 5))
      // Ring: C2, C3, C4, C5, O(ring).
      const [c2, c3, c4, c5, oRing] = ring([0, 0, 0], 5, radius)
      const atoms = [
        { element: 'C', position: c2 },
        { element: 'C', position: c3 },
        { element: 'C', position: c4 },
        { element: 'C', position: c5 },
        { element: 'O', position: oRing },
      ]
      const bonds = [
        { a: 0, b: 1, order: 1, length: ringBond },
        { a: 1, b: 2, order: 1, length: ringBond },
        { a: 2, b: 3, order: 1, length: ringBond },
        { a: 3, b: 4, order: 1, length: ringBond },
        { a: 4, b: 0, order: 1, length: ringBond },
      ]
      const push = (element, position, from, length, order = 1) => {
        atoms.push({ element, position })
        bonds.push({ a: from, b: atoms.length - 1, order, length })
        return atoms.length - 1
      }
      const along = (from, target, distance) =>
        add(from, mul(norm(sub(target, from)), distance))
      /** Adds a -CH2OH arm on a ring carbon, extended away from the ring. */
      const hydroxymethyl = (index, centre, neighbour, direction) => {
        const carbon = along(centre, direction, cc)
        const carbonIndex = push('C', carbon, index, cc)
        const oxygen = extendAnti(neighbour, centre, carbon, 109.5, co)
        const oIndex = push('O', oxygen, carbonIndex, co)
        for (const p of completeSp3(carbon, centre, oxygen, 108, ch)) push('H', p, carbonIndex, ch)
        push('H', branch(oxygen, carbon, 108, oh, 0), oIndex, oh)
      }
      /** Adds a hydroxyl on a ring carbon. */
      const hydroxyl = (index, centre, direction) => {
        const oxygen = along(centre, direction, co)
        const oIndex = push('O', oxygen, index, co)
        push('H', branch(oxygen, centre, 108, oh, 0), oIndex, oh)
      }
      // C2 is the anomeric carbon: hydroxyl on one face, the C1 arm on the other.
      const c2Faces = completeSp3(c2, oRing, c3, 109.5, 1)
      hydroxyl(0, c2, c2Faces[0])
      hydroxymethyl(0, c2, c3, c2Faces[1])
      for (const [index, centre, previous, next] of [
        [1, c3, c2, c4],
        [2, c4, c3, c5],
      ]) {
        const faces = completeSp3(centre, previous, next, 109.5, 1)
        hydroxyl(index, centre, faces[index % 2])
        push('H', along(centre, faces[(index + 1) % 2], ch), index, ch)
      }
      const c5Faces = completeSp3(c5, c4, oRing, 109.5, 1)
      hydroxymethyl(3, c5, c4, c5Faces[0])
      push('H', along(c5, c5Faces[1], ch), 3, ch)
      return { atoms, bonds }
    },
  },
  {
    id: 'sucrose',
    formula: 'C12H22O11',
    name: 'Sucrose',
    nameZh: '蔗糖',
    category: 'organic',
    shape: 'two-rings',
    shapeZh: '六元环 + 五元环',
    idealized: true,
    summaryZh:
      '白砂糖。一个葡萄糖的六元环与一个果糖的五元环通过一个氧桥相连，而这个连接用掉了两边的还原性端 —— 所以蔗糖不还原、不易变质，也正因如此适合做糖果和保存食物。',
    summaryEn:
      'Table sugar: a six-membered glucose ring and a five-membered fructose ring joined through one oxygen. That link uses up the reducing end of both halves, so sucrose is non-reducing and keeps well — which is exactly why it works in sweets and preserves.',
    build() {
      const ringBond = 1.43
      const co = 1.42
      const cc = 1.52
      const ch = 1.1
      const oh = 0.97
      const glycosidic = 1.42
      const atoms = []
      const bonds = []
      const push = (element, position, from, length, order = 1) => {
        atoms.push({ element, position })
        if (from !== null) bonds.push({ a: from, b: atoms.length - 1, order, length })
        return atoms.length - 1
      }
      const along = (from, target, distance) =>
        add(from, mul(norm(sub(target, from)), distance))

      // ---- glucose half: a pyranose chair, ring atom 0 being the oxygen ----
      const pyranose = puckeredRingPositions(6, ringBond, 111.5)
      push('O', pyranose[0], null)
      for (let i = 1; i < 6; i++) push('C', pyranose[i], null)
      for (let i = 0; i < 6; i++) bonds.push({ a: i, b: (i + 1) % 6, order: 1, length: ringBond })
      let linkO = null
      let linkIndex = -1
      for (const index of [1, 2, 3, 4, 5]) {
        const centre = pyranose[index]
        const { axial, equatorial } = axialEquatorial(
          centre,
          pyranose[(index + 5) % 6],
          pyranose[(index + 1) % 6],
          109.5,
          1,
        )
        if (index === 1) {
          // The anomeric carbon. Alpha-D-glucose carries it axially, and here it
          // is the bridge to the fructose ring rather than a hydroxyl.
          linkO = along(centre, axial, glycosidic)
          linkIndex = push('O', linkO, index, glycosidic)
          push('H', along(centre, equatorial, ch), index, ch)
        } else if (index === 5) {
          const c6 = along(centre, equatorial, cc)
          const c6Index = push('C', c6, index, cc)
          const o6 = extendAnti(pyranose[4], centre, c6, 109.5, co)
          const o6Index = push('O', o6, c6Index, co)
          for (const p of completeSp3(c6, centre, o6, 108, ch)) push('H', p, c6Index, ch)
          push('H', branch(o6, c6, 108, oh, 0), o6Index, oh)
          push('H', along(centre, axial, ch), index, ch)
        } else {
          const o = along(centre, equatorial, co)
          const oIndex = push('O', o, index, co)
          push('H', branch(o, centre, 108, oh, 0), oIndex, oh)
          push('H', along(centre, axial, ch), index, ch)
        }
      }
      const glucoseAtoms = atoms.length

      // ---- fructose half, built at the origin and then moved into place ----
      const fragment = () => {
        const list = []
        const links = []
        const radius = ringBond / (2 * Math.sin(Math.PI / 5))
        const [c2, c3, c4, c5, oRing] = ring([0, 0, 0], 5, radius)
        for (const [element, position] of [
          ['C', c2],
          ['C', c3],
          ['C', c4],
          ['C', c5],
          ['O', oRing],
        ]) {
          list.push({ element, position })
        }
        for (let i = 0; i < 5; i++) {
          links.push({ a: i, b: (i + 1) % 5, order: 1, length: ringBond })
        }
        const add2 = (element, position, from, length) => {
          list.push({ element, position })
          links.push({ a: from, b: list.length - 1, order: 1, length })
          return list.length - 1
        }
        const arm = (index, centre, neighbour, direction) => {
          const carbon = along(centre, direction, cc)
          const carbonIndex = add2('C', carbon, index, cc)
          const oxygen = extendAnti(neighbour, centre, carbon, 109.5, co)
          const oxygenIndex = add2('O', oxygen, carbonIndex, co)
          for (const p of completeSp3(carbon, centre, oxygen, 108, ch)) add2('H', p, carbonIndex, ch)
          add2('H', branch(oxygen, carbon, 108, oh, 0), oxygenIndex, oh)
        }
        // C2 is the anomeric carbon: one face takes the bridge to glucose, the
        // other the C1 hydroxymethyl arm.
        const [bridgeFace, armFace] = completeSp3(c2, oRing, c3, 109.5, 1)
        arm(0, c2, c3, armFace)
        for (const [index, centre, previous, next] of [
          [1, c3, c2, c4],
          [2, c4, c3, c5],
        ]) {
          const faces = completeSp3(centre, previous, next, 109.5, 1)
          const oxygen = along(centre, faces[index % 2], co)
          const oxygenIndex = add2('O', oxygen, index, co)
          add2('H', branch(oxygen, centre, 108, oh, 0), oxygenIndex, oh)
          add2('H', along(centre, faces[(index + 1) % 2], ch), index, ch)
        }
        const c5Faces = completeSp3(c5, c4, oRing, 109.5, 1)
        arm(3, c5, c4, c5Faces[0])
        add2('H', along(c5, c5Faces[1], ch), 3, ch)
        return { list, links, anchor: c2, bridge: along(c2, bridgeFace, glycosidic) }
      }

      const frag = fragment()
      // Where the fructose anomeric carbon has to end up: one bond on from the
      // bridging oxygen, anti to the glucose ring.
      const target = extendAnti(pyranose[0], pyranose[1], linkO, 116, glycosidic)
      const toBridge = sub(linkO, target)
      const place = (spin) =>
        frag.list.map((atom) => {
          const moved = add(
            target,
            sub(
              rotateOnto(atom.position, sub(frag.bridge, frag.anchor), toBridge, frag.anchor),
              frag.anchor,
            ),
          )
          return { element: atom.element, position: rotateAbout(moved, toBridge, target, spin) }
        })
      // The bond to the bridging oxygen leaves the ring free to spin. Pick the
      // turn that keeps the two halves furthest apart rather than guessing one.
      let best = null
      for (let spin = 0; spin < 360; spin += 10) {
        const candidate = place(spin)
        let closest = Infinity
        for (const atom of candidate) {
          for (let i = 0; i < glucoseAtoms; i++) {
            closest = Math.min(closest, dist(atom.position, atoms[i].position))
          }
        }
        if (!best || closest > best.closest) best = { closest, candidate }
      }
      const offset = atoms.length
      for (const atom of best.candidate) atoms.push(atom)
      for (const link of frag.links) {
        bonds.push({ a: link.a + offset, b: link.b + offset, order: link.order, length: link.length })
      }
      bonds.push({ a: linkIndex, b: offset, order: 1, length: glycosidic })
      return { atoms, bonds }
    },
  },
  {
    id: 'benzaldehyde',
    formula: 'C7H6O',
    formulaDisplayOverride: 'C6H5CHO',
    name: 'Benzaldehyde',
    nameZh: '苯甲醛',
    category: 'organic',
    shape: 'planar-ring',
    shapeZh: '苯环 + 醛基',
    idealized: true,
    summaryZh:
      '苦杏仁的气味。杏仁、桃核、樱桃核里的苦杏仁苷水解会同时放出它和氰化氢 —— 香味与毒性来自同一个反应，所以生苦杏仁不能多吃。',
    summaryEn:
      'The smell of bitter almonds. Amygdalin in almond, peach and cherry kernels hydrolyses to release it together with hydrogen cyanide — the scent and the poison come from one and the same reaction.',
    build() {
      const cc = 1.397
      const chRing = 1.084
      const cAldehyde = 1.48
      const co = 1.212
      const aldehydeH = 1.11
      const normal = [0, 0, 1]
      const atoms = []
      const bonds = []
      const ringCarbons = ring([0, 0, 0], 6, cc)
      ringCarbons.forEach((p) => atoms.push({ element: 'C', position: p }))
      for (let i = 0; i < 6; i++) {
        bonds.push({ a: i, b: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1, length: cc })
      }
      const aldehydeC = mul(norm(ringCarbons[0]), cc + cAldehyde)
      atoms.push({ element: 'C', position: aldehydeC })
      bonds.push({ a: 0, b: 6, order: 1, length: cAldehyde })
      atoms.push({ element: 'O', position: inPlane(aldehydeC, ringCarbons[0], 124, co, normal, 1) })
      bonds.push({ a: 6, b: 7, order: 2, length: co })
      atoms.push({
        element: 'H',
        position: inPlane(aldehydeC, ringCarbons[0], 115, aldehydeH, normal, -1),
      })
      bonds.push({ a: 6, b: 8, order: 1, length: aldehydeH })
      for (let i = 1; i < 6; i++) {
        atoms.push({ element: 'H', position: mul(norm(ringCarbons[i]), cc + chRing) })
        bonds.push({ a: i, b: atoms.length - 1, order: 1, length: chRing })
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120]], planar: true },
  },
  {
    id: 'isoamylacetate',
    formula: 'C7H14O2',
    name: 'Isoamyl acetate',
    nameZh: '乙酸异戊酯',
    category: 'organic',
    shape: 'ester-chain',
    shapeZh: '酯 + 支链',
    summaryZh:
      '香蕉和梨的味道，俗称"香蕉水"。酯类普遍闻起来像水果，这是最典型的一个。它也是蜜蜂的报警信息素 —— 一只蜂蜇人后释放它，同伴便循味而来。',
    summaryEn:
      'The smell of banana and pear, and the classic example of why esters smell fruity. It doubles as a honeybee alarm pheromone: one sting releases it, and the rest of the hive follows the scent in.',
    build() {
      const cMethyl = 1.5
      const co = 1.21
      const cEsterO = 1.34
      const oAlkyl = 1.45
      const cc = 1.52
      const ch = 1.09
      const chMethyl = 1.09
      const normal = [0, 0, 1]
      // Backbone: CH3-C(=O)-O-CH2-CH2-CH(CH3)2, drawn extended in one plane.
      const [methylC, carbonylC, esterO, ch2a, ch2b, methine] = planarChain(
        [0, 0, 0],
        [cMethyl, 0, 0],
        [
          { angle: 111, length: cEsterO, side: 1 },
          { angle: 116, length: oAlkyl, side: -1 },
          { angle: 109, length: cc, side: 1 },
          { angle: 112, length: cc, side: -1 },
        ],
      )
      const atoms = [
        { element: 'C', position: methylC },
        { element: 'C', position: carbonylC },
        { element: 'O', position: esterO },
        { element: 'C', position: ch2a },
        { element: 'C', position: ch2b },
        { element: 'C', position: methine },
      ]
      const bonds = [
        { a: 0, b: 1, order: 1, length: cMethyl },
        { a: 1, b: 2, order: 1, length: cEsterO },
        { a: 2, b: 3, order: 1, length: oAlkyl },
        { a: 3, b: 4, order: 1, length: cc },
        { a: 4, b: 5, order: 1, length: cc },
      ]
      const push = (element, position, from, length, order = 1) => {
        atoms.push({ element, position })
        bonds.push({ a: from, b: atoms.length - 1, order, length })
        return atoms.length - 1
      }
      push('O', inPlane(carbonylC, methylC, 125, co, normal, -1), 1, co, 2)
      for (const h of methyl(methylC, carbonylC, chMethyl)) push('H', h, 0, chMethyl)
      for (const p of completeSp3(ch2a, esterO, ch2b, 108, ch)) push('H', p, 3, ch)
      for (const p of completeSp3(ch2b, ch2a, methine, 107, ch)) push('H', p, 4, ch)
      const branches = coneDirections(sub(methine, ch2b), 3, TETRAHEDRAL_CONE, 180)
      for (const direction of branches.slice(0, 2)) {
        const carbon = add(methine, mul(direction, cc))
        const index = push('C', carbon, 5, cc)
        for (const h of methyl(carbon, methine, chMethyl)) push('H', h, index, chMethyl)
      }
      push('H', add(methine, mul(branches[2], ch)), 5, ch)
      return { atoms, bonds }
    },
  },
  {
    id: 'adipicacid',
    formula: 'C6H10O4',
    name: 'Adipic acid',
    nameZh: '己二酸',
    category: 'organic',
    shape: 'zigzag-chain',
    shapeZh: '锯齿链 + 两端羧基',
    summaryZh:
      '与己二胺缩聚就是尼龙 66 —— 丝袜、伞布、安全带、牙刷毛都从这里来。食品工业也用它做酸味剂，泡打粉里那点酸就可能是它。',
    summaryEn:
      'Condensed with hexamethylenediamine it becomes nylon 66 — stockings, umbrella fabric, seat belts, toothbrush bristles. Food makers also use it as an acidulant; the sour part of some baking powders is this molecule.',
    build() {
      const cc = 1.526
      const cSp2 = 1.51
      const co = 1.214
      const coh = 1.31
      const ch = 1.095
      const oh = 0.97
      const normal = [0, 0, 1]
      const carbons = planarChain([0, 0, 0], [cSp2, 0, 0], [
        { angle: 112.7, length: cc, side: 1 },
        { angle: 112.7, length: cc, side: -1 },
        { angle: 112.7, length: cc, side: 1 },
        { angle: 112.7, length: cSp2, side: -1 },
      ])
      const atoms = carbons.map((p) => ({ element: 'C', position: p }))
      const bonds = carbons.slice(1).map((_, i) => ({
        a: i,
        b: i + 1,
        order: 1,
        length: i === 0 || i === 4 ? cSp2 : cc,
      }))
      const push = (element, position, from, length, order = 1) => {
        atoms.push({ element, position })
        bonds.push({ a: from, b: atoms.length - 1, order, length })
        return atoms.length - 1
      }
      for (const [index, centre, anchor] of [
        [0, carbons[0], carbons[1]],
        [5, carbons[5], carbons[4]],
      ]) {
        push('O', inPlane(centre, anchor, 122, co, normal, 1), index, co, 2)
        const oAcid = inPlane(centre, anchor, 114, coh, normal, -1)
        const oIndex = push('O', oAcid, index, coh)
        push('H', inPlane(oAcid, centre, 106, oh, normal, -1), oIndex, oh)
      }
      for (let i = 1; i < 5; i++) {
        for (const p of completeSp3(carbons[i], carbons[i - 1], carbons[i + 1], 106.5, ch)) {
          push('H', p, i, ch)
        }
      }
      return { atoms, bonds }
    },
    checks: { angles: [[1, 0, 2, 112.7]] },
  },
  {
    id: 'bisphenola',
    formula: 'C15H16O2',
    name: 'Bisphenol A',
    nameZh: '双酚 A',
    category: 'organic',
    shape: 'two-rings',
    shapeZh: '双苯环 + 季碳',
    idealized: true,
    summaryZh:
      '聚碳酸酯和环氧树脂的原料：水壶、眼镜片、罐头内涂层、热敏纸小票都可能含它。它的形状与雌激素有几分相似，能弱结合雌激素受体，因此婴幼儿用品普遍改用"不含 BPA"的替代材料。',
    summaryEn:
      'The feedstock of polycarbonate and epoxy resin — bottles, lens blanks, tin-can linings, till receipts. Its shape is close enough to oestrogen to bind the receptor weakly, which is why baby products moved to BPA-free alternatives.',
    build() {
      const cc = 1.397
      const chRing = 1.084
      const cAryl = 1.53
      const cMethyl = 1.54
      const cPhenolO = 1.37
      const chMethyl = 1.09
      const oh = 0.97
      const centre = [0, 0, 0]
      const [dRingA, dRingB, dMethylA, dMethylB] = TETRAHEDRON
      const atoms = [{ element: 'C', position: centre }]
      const bonds = []
      const push = (element, position, from, length, order = 1) => {
        atoms.push({ element, position })
        bonds.push({ a: from, b: atoms.length - 1, order, length })
        return atoms.length - 1
      }
      // Both rings are hung in the plane spanned by their own bond and the normal
      // shared by the two aryl bonds: the propeller shape that keeps the ortho
      // hydrogens of the two rings apart.
      const shared = cross(dRingA, dRingB)
      for (const direction of [dRingA, dRingB]) {
        const ipso = mul(direction, cAryl)
        const vertices = ringAtVertex(ipso, direction, shared, 6, cc)
        const ringCentre = mul(
          vertices.reduce((s, p) => add(s, p), [0, 0, 0]),
          1 / 6,
        )
        const first = push('C', vertices[0], 0, cAryl)
        const indices = [first]
        for (let i = 1; i < 6; i++) {
          indices.push(push('C', vertices[i], indices[i - 1], cc, i % 2 === 0 ? 2 : 1))
        }
        bonds.push({ a: indices[5], b: first, order: 2, length: cc })
        const outward = (p, distance) => add(p, mul(norm(sub(p, ringCentre)), distance))
        const oxygen = outward(vertices[3], cPhenolO)
        const oIndex = push('O', oxygen, indices[3], cPhenolO)
        push('H', inPlane(oxygen, vertices[3], 108, oh, shared, 1), oIndex, oh)
        for (const i of [1, 2, 4, 5]) {
          push('H', outward(vertices[i], chRing), indices[i], chRing)
        }
      }
      for (const direction of [dMethylA, dMethylB]) {
        const carbon = mul(direction, cMethyl)
        const index = push('C', carbon, 0, cMethyl)
        for (const h of methyl(carbon, centre, chMethyl)) push('H', h, index, chMethyl)
      }
      return { atoms, bonds }
    },
  },
  {
    id: 'capsaicin',
    formula: 'C18H27NO3',
    name: 'Capsaicin',
    nameZh: '辣椒素',
    category: 'organic',
    shape: 'ring-and-tail',
    shapeZh: '苯环 + 酰胺长尾',
    idealized: true,
    summaryZh:
      '辣其实不是味觉，而是痛觉：辣椒素直接打开 TRPV1 通道 —— 这个通道本来是用来感知 43°C 以上高温的，于是大脑收到"烫"的信号。它不溶于水，所以喝水没用，喝牛奶或吃油脂才有效。',
    summaryEn:
      'Heat from chilli is not a taste but a pain signal: capsaicin opens TRPV1, the channel that normally reports temperatures above 43°C, so the brain is told you are being burnt. It does not dissolve in water, which is why water does not help and milk or fat does.',
    build() {
      const cc = 1.397
      const chRing = 1.084
      const cBenzyl = 1.51
      const cn = 1.46
      const amideC = 1.34
      const amideO = 1.23
      const ccChain = 1.526
      const cAllylic = 1.5
      const cd = 1.33
      const cPhenolO = 1.36
      const cMethoxyO = 1.37
      const oMethyl = 1.43
      const ch = 1.09
      const chMethyl = 1.09
      const nh = 1.01
      const oh = 0.97
      const normal = [0, 0, 1]
      const atoms = []
      const bonds = []
      const ringCarbons = ring([0, 0, 0], 6, cc)
      ringCarbons.forEach((p) => atoms.push({ element: 'C', position: p }))
      for (let i = 0; i < 6; i++) {
        bonds.push({ a: i, b: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1, length: cc })
      }
      const push = (element, position, from, length, order = 1) => {
        atoms.push({ element, position })
        bonds.push({ a: from, b: atoms.length - 1, order, length })
        return atoms.length - 1
      }
      // Vanillyl head: benzylic CH2 on 0, methoxy on 2, hydroxyl on 3.
      const benzylic = mul(norm(ringCarbons[0]), cc + cBenzyl)
      const benzylicIndex = push('C', benzylic, 0, cBenzyl)
      const nitrogen = extendAnti(ringCarbons[1], ringCarbons[0], benzylic, 112, cn)
      const nIndex = push('N', nitrogen, benzylicIndex, cn)
      const carbonyl = extendAnti(ringCarbons[0], benzylic, nitrogen, 122, amideC)
      const carbonylIndex = push('C', carbonyl, nIndex, amideC)
      const amidePlane = cross(sub(nitrogen, benzylic), sub(carbonyl, nitrogen))
      // A trans amide: the tail leaves anti to the benzylic carbon, so the
      // carbonyl oxygen takes the other side and the N-H faces the oxygen.
      const c2 = extendAnti(benzylic, nitrogen, carbonyl, 116, ccChain)
      const c2Index = push('C', c2, carbonylIndex, ccChain)
      const oxygen = furthestFrom(
        [1, -1].map((side) => inPlane(carbonyl, nitrogen, 122, amideO, amidePlane, side)),
        c2,
      )
      push('O', oxygen, carbonylIndex, amideO, 2)
      push(
        'H',
        furthestFrom(
          [1, -1].map((side) => inPlane(nitrogen, carbonyl, 118, nh, amidePlane, side)),
          benzylic,
        ),
        nIndex,
        nh,
      )
      for (const p of completeSp3(benzylic, ringCarbons[0], nitrogen, 107, ch)) {
        push('H', p, benzylicIndex, ch)
      }
      // The nonenamide tail, walked one carbon at a time: four CH2, a trans
      // double bond, then the isopropyl end.
      const tail = [c2]
      let back2 = nitrogen
      let back1 = carbonyl
      let head = c2
      let headIndex = c2Index
      const extend = (angle, length, order = 1) => {
        const position = extendAnti(back2, back1, head, angle, length)
        const index = push('C', position, headIndex, length, order)
        back2 = back1
        back1 = head
        head = position
        headIndex = index
        tail.push(position)
        return index
      }
      const tailIndices = [
        c2Index,
        extend(112, ccChain), // C3
        extend(112, ccChain), // C4
        extend(112, ccChain), // C5
        extend(112, cAllylic), // C6
        extend(125, cd, 2), // C7, across the double bond
        extend(125, cAllylic), // C8
        extend(112, ccChain), // C9
      ]
      for (let i = 0; i < 4; i++) {
        const before = i === 0 ? carbonyl : tail[i - 1]
        for (const p of completeSp3(tail[i], before, tail[i + 1], 107, ch)) {
          push('H', p, tailIndices[i], ch)
        }
      }
      push('H', extendAnti(tail[5], tail[3], tail[4], 118, ch), tailIndices[4], ch)
      push('H', extendAnti(tail[4], tail[6], tail[5], 118, ch), tailIndices[5], ch)
      const [methylDirection, hDirection] = completeSp3(tail[6], tail[5], tail[7], 108, 1)
      const along = (from, target, distance) =>
        add(from, mul(norm(sub(target, from)), distance))
      const extraMethyl = along(tail[6], methylDirection, ccChain)
      const extraIndex = push('C', extraMethyl, tailIndices[6], ccChain)
      push('H', along(tail[6], hDirection, ch), tailIndices[6], ch)
      for (const h of methyl(extraMethyl, tail[6], chMethyl)) push('H', h, extraIndex, chMethyl)
      for (const h of methyl(tail[7], tail[6], chMethyl)) push('H', h, tailIndices[7], chMethyl)
      // Methoxy on ring position 2, turned away from the neighbouring hydroxyl.
      const methoxyO = mul(norm(ringCarbons[2]), cc + cMethoxyO)
      const methoxyIndex = push('O', methoxyO, 2, cMethoxyO)
      const methoxyC = inPlane(methoxyO, ringCarbons[2], 118, oMethyl, normal, -1)
      const methoxyCIndex = push('C', methoxyC, methoxyIndex, oMethyl)
      for (const h of methyl(methoxyC, methoxyO, chMethyl)) push('H', h, methoxyCIndex, chMethyl)
      const phenolO = mul(norm(ringCarbons[3]), cc + cPhenolO)
      const phenolIndex = push('O', phenolO, 3, cPhenolO)
      push('H', inPlane(phenolO, ringCarbons[3], 108, oh, normal, -1), phenolIndex, oh)
      for (const index of [1, 4, 5]) {
        push('H', mul(norm(ringCarbons[index]), cc + chRing), index, chRing)
      }
      return { atoms, bonds }
    },
    checks: { angles: [[0, 1, 5, 120]] },
  },
  {
    id: 'cholesterol',
    formula: 'C27H46O',
    name: 'Cholesterol',
    nameZh: '胆固醇',
    category: 'organic',
    shape: 'fused-rings',
    shapeZh: '甾体四环 + 侧链',
    idealized: true,
    summaryZh:
      '四个稠合环组成一块几乎刚性的平板，一端是羟基、一端是烃链 —— 它就这样插在细胞膜的磷脂之间，让膜既不过硬也不过软。人体的雌激素、睾酮、皮质醇和维生素 D 全都由这块骨架改造而来。',
    summaryEn:
      'Four fused rings make an almost rigid plate with a hydroxyl at one end and a hydrocarbon tail at the other, and it wedges between the phospholipids of a membrane to keep it neither too stiff nor too fluid. Oestrogen, testosterone, cortisol and vitamin D are all rebuilt from this same skeleton.',
    build() {
      const cc = 1.53
      const cd = 1.33
      const cAllylic = 1.505
      const co = 1.43
      const oh = 0.97
      const ch = 1.096
      const chMethyl = 1.09

      // Ring A is an ideal chair. Trans-fused rings are centrosymmetric about the
      // bond they share, so rings B and C follow by inverting the previous ring
      // through the midpoint of that bond — they inherit its exact bonds and
      // angles rather than being fitted by hand.
      const [c1, c2, c3, c4, c5, c10] = puckeredRingPositions(6, cc, 111.5)
      const invert = (p, a, b) => sub(add(a, b), p)
      const c6Chair = invert(c1, c5, c10)
      const c7Chair = invert(c2, c5, c10)
      const c8 = invert(c3, c5, c10)
      const c9 = invert(c4, c5, c10)
      const c11 = invert(c7Chair, c8, c9)
      const c12 = invert(c6Chair, c8, c9)
      const c13 = invert(c5, c8, c9)
      const c14 = invert(c10, c8, c9)
      // Ring B carries the 5,6 double bond: C6 is pulled in to a real C=C length
      // and C7 re-placed so the ring still closes on its declared bonds.
      const c6 = add(c5, mul(norm(sub(c6Chair, c5)), cd))
      const c7 = closeRing(c6, c8, cAllylic, cc, c7Chair)

      // Ring D is a five-ring, so inversion cannot produce it. It is fitted onto
      // the C13-C14 bond instead — same bond length, free to turn about that axis
      // — and the turn is chosen to bring both fusion angles back to tetrahedral,
      // which is what makes the C13 and C14 centres come out sane.
      const flat = ring([0, 0, 0], 5, cc / (2 * Math.sin(Math.PI / 5)))
      const placeRingD = (spin) =>
        flat.map((p) => {
          const aligned = rotateOnto(p, sub(flat[1], flat[0]), sub(c14, c13), flat[0])
          return rotateAbout(add(aligned, sub(c13, flat[0])), sub(c14, c13), c13, spin)
        })
      const angleBetween = (vertex, a, b) =>
        Math.acos(
          Math.min(1, Math.max(-1, dot(norm(sub(a, vertex)), norm(sub(b, vertex))))),
        ) / DEG
      let bestRingD = null
      for (let spin = 0; spin < 360; spin += 1) {
        const candidate = placeRingD(spin)
        const error =
          (angleBetween(c13, c12, candidate[4]) - 110) ** 2 +
          (angleBetween(c14, c8, candidate[2]) - 110) ** 2
        if (!bestRingD || error < bestRingD.error) bestRingD = { error, candidate }
      }
      const [, , c15, c16, c17] = bestRingD.candidate

      const atoms = []
      const bonds = []
      const index = {}
      const put = (name, element, position) => {
        atoms.push({ element, position })
        index[name] = atoms.length - 1
        return atoms.length - 1
      }
      const at = (name) => atoms[index[name]].position
      const link = (a, b, length, order = 1) =>
        bonds.push({ a: index[a], b: index[b], order, length })
      const hang = (element, name, position, parent, length) => {
        put(name, element, position)
        link(parent, name, length)
      }
      const along = (from, target, distance) =>
        add(from, mul(norm(sub(target, from)), distance))

      const skeleton = {
        c1, c2, c3, c4, c5, c6, c7, c8, c9, c10,
        c11, c12, c13, c14, c15, c16, c17,
      }
      for (const [name, position] of Object.entries(skeleton)) put(name, 'C', position)
      for (const [a, b] of [
        ['c1', 'c2'], ['c2', 'c3'], ['c3', 'c4'], ['c4', 'c5'], ['c5', 'c10'], ['c10', 'c1'],
        ['c6', 'c7'], ['c7', 'c8'], ['c8', 'c9'], ['c9', 'c10'],
        ['c9', 'c11'], ['c11', 'c12'], ['c12', 'c13'], ['c13', 'c14'], ['c14', 'c8'],
        ['c14', 'c15'], ['c15', 'c16'], ['c16', 'c17'], ['c17', 'c13'],
      ]) {
        link(a, b, a === 'c6' ? cAllylic : cc)
      }
      link('c5', 'c6', cd, 2)

      // The two angular methyls sit on the leftover tetrahedral direction of each
      // quaternary carbon, which puts them axial — the beta face of the steroid.
      const c19 = add(c10, mul(openDirection(c10, [c1, c5, c9]), cc))
      hang('C', 'c19', c19, 'c10', cc)
      const c18 = add(c13, mul(openDirection(c13, [c12, c14, c17]), cc))
      hang('C', 'c18', c18, 'c13', cc)

      // The side chain leaves C17 on the same face as those methyls.
      const c17Faces = completeSp3(c17, c13, c16, 108, 1)
      const sideDirection = nearestTo(c17Faces, c18)
      const otherFace = sideDirection === c17Faces[0] ? c17Faces[1] : c17Faces[0]
      const c20 = along(c17, sideDirection, cc)
      hang('C', 'c20', c20, 'c17', cc)
      hang('H', 'h17', along(c17, otherFace, ch), 'c17', ch)
      const c22 = extendAnti(c13, c17, c20, 113, cc)
      hang('C', 'c22', c22, 'c20', cc)
      const [c21Direction, h20Direction] = completeSp3(c20, c17, c22, 108, 1)
      const c21 = along(c20, c21Direction, cc)
      hang('C', 'c21', c21, 'c20', cc)
      hang('H', 'h20', along(c20, h20Direction, ch), 'c20', ch)
      const c23 = extendAnti(c17, c20, c22, 112, cc)
      hang('C', 'c23', c23, 'c22', cc)
      const c24 = extendAnti(c20, c22, c23, 112, cc)
      hang('C', 'c24', c24, 'c23', cc)
      const c25 = extendAnti(c22, c23, c24, 112, cc)
      hang('C', 'c25', c25, 'c24', cc)
      const tailBranches = coneDirections(sub(c25, c24), 3, TETRAHEDRAL_CONE, 180)
      const c26 = add(c25, mul(tailBranches[0], cc))
      hang('C', 'c26', c26, 'c25', cc)
      const c27 = add(c25, mul(tailBranches[1], cc))
      hang('C', 'c27', c27, 'c25', cc)
      hang('H', 'h25', add(c25, mul(tailBranches[2], ch)), 'c25', ch)

      // The 3-hydroxyl is equatorial; every other ring position takes hydrogens.
      const { axial: c3Axial, equatorial: c3Equatorial } = axialEquatorial(c3, c2, c4, 109.5, 1)
      const oxygen = along(c3, c3Equatorial, co)
      hang('O', 'o3', oxygen, 'c3', co)
      hang('H', 'ho3', branch(oxygen, c3, 108, oh, 0), 'o3', oh)
      hang('H', 'h3', along(c3, c3Axial, ch), 'c3', ch)
      let counter = 0
      for (const [name, previous, next] of [
        ['c1', c2, c10], ['c2', c1, c3], ['c4', c3, c5], ['c7', c6, c8],
        ['c11', c9, c12], ['c12', c11, c13], ['c15', c14, c16], ['c16', c15, c17],
        ['c22', c20, c23], ['c23', c22, c24], ['c24', c23, c25],
      ]) {
        for (const p of completeSp3(at(name), previous, next, 107, ch)) {
          hang('H', `h${counter++}`, p, name, ch)
        }
      }
      for (const [name, neighbours] of [
        ['c8', [c7, c9, c14]],
        ['c9', [c8, c10, c11]],
        ['c14', [c8, c13, c15]],
        ['c6', [c5, c7]],
      ]) {
        hang('H', `h${counter++}`, add(at(name), mul(openDirection(at(name), neighbours), ch)), name, ch)
      }
      // Five methyls in a crowded molecule: each one is turned to whichever
      // rotation keeps its hydrogens furthest from everything already placed,
      // rather than left on an arbitrary phase.
      for (const [name, anchor] of [
        ['c18', c13], ['c19', c10], ['c21', c20], ['c26', c25], ['c27', c25],
      ]) {
        const parent = index[name]
        let best = null
        for (let phase = 0; phase < 120; phase += 5) {
          const hydrogens = methyl(at(name), anchor, chMethyl, phase)
          let closest = Infinity
          for (const hydrogen of hydrogens) {
            atoms.forEach((other, i) => {
              if (i === parent) return
              closest = Math.min(closest, dist(hydrogen, other.position))
            })
          }
          if (!best || closest > best.closest) best = { closest, hydrogens }
        }
        for (const p of best.hydrogens) hang('H', `h${counter++}`, p, name, chMethyl)
      }
      return { atoms, bonds }
    },
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

/** One entry per distinct bond kind, in the order the bonds appear. */
function distinctBondTypes(atoms, bonds) {
  const seen = new Map()
  for (const bond of bonds) {
    const a = atoms[bond.a].element
    const b = atoms[bond.b].element
    const key = `${a}-${b}-${bond.order}`
    if (!seen.has(key)) seen.set(key, { a, b, order: bond.order, length: bond.length })
  }
  return [...seen.values()]
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

  const uses = MOLECULE_USES[def.id]
  if (!uses) problems.push(`${def.id}: missing uses content`)

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
    // What the molecule is for, and where it shows up in daily life.
    usesZh: uses?.zh ?? '',
    usesEn: uses?.en ?? '',
    everydayZh: uses?.itemsZh ?? [],
    everydayEn: uses?.itemsEn ?? [],
    molarMass: Number(mass.toFixed(3)),
    // Everything the gallery, the search and the readout need is summarised here,
    // so only the 3D viewer has to pull in the coordinates themselves.
    atomCount: centred.length,
    bondCounts: {
      single: enrichedBonds.filter((b) => b.order === 1).length,
      double: enrichedBonds.filter((b) => b.order === 2).length,
      triple: enrichedBonds.filter((b) => b.order === 3).length,
    },
    composition: [...composition(centred)].map(([symbol, count]) => ({ symbol, count })),
    bondTypes: distinctBondTypes(centred, enrichedBonds),
    extent: Number(extent.toFixed(3)),
    geometry: { atoms: centred, bonds: enrichedBonds },
  }
})

for (const id of Object.keys(MOLECULE_USES)) {
  if (!DEFINITIONS.some((d) => d.id === id)) {
    problems.push(`uses content for unknown molecule id "${id}"`)
  }
}
for (const m of molecules) {
  if (!m.usesZh.trim() || !m.usesEn.trim()) problems.push(`${m.id}: empty uses text`)
  if (m.everydayZh.length !== m.everydayEn.length) {
    problems.push(`${m.id}: ${m.everydayZh.length} zh items vs ${m.everydayEn.length} en`)
  }
}

const CATEGORY_ORDER = ['element', 'inorganic', 'organic']
molecules.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))

if (problems.length) {
  console.error('Molecule validation failed:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

const metadata = molecules.map((m) => {
  const record = { ...m }
  delete record.geometry
  return record
})
const geometry = Object.fromEntries(molecules.map((m) => [m.id, m.geometry]))
writeFileSync(OUT, `${JSON.stringify(metadata)}\n`)
writeFileSync(GEOMETRY_OUT, `${JSON.stringify(geometry)}\n`)
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
    `  ${m.formulaDisplay.padEnd(8)} ${m.nameZh.padEnd(6)} ${String(m.atomCount).padStart(2)} atoms, ` +
      `${String(m.geometry.bonds.length).padStart(2)} bonds, ${m.molarMass} g/mol`,
  )
}
