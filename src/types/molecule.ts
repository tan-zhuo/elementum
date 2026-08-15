export type MoleculeCategory = 'element' | 'inorganic' | 'organic' | 'aminoacid'

export type Vec3 = [number, number, number]

export interface MoleculeAtom {
  /** Element symbol, e.g. "O". */
  element: string
  /** Position in angstroms, centred on the molecule's bounding box. */
  position: Vec3
}

export interface MoleculeBond {
  /** Index into `Molecule.atoms`. */
  a: number
  b: number
  /** 1 single, 2 double, 3 triple. */
  order: 1 | 2 | 3
  /** Reference bond length in angstroms. */
  length: number
  /**
   * Unit vector perpendicular to the bond, along which the extra lines of a double
   * or triple bond are offset. Chosen at build time to lie in the plane shared with
   * a neighbouring bond, so multi-bonds in planar molecules split within the
   * molecular plane. Absent on single bonds.
   */
  offset?: Vec3
}

export interface Molecule {
  id: string
  /** Plain formula, e.g. "C2H6O". */
  formula: string
  /** Formula with Unicode subscripts, in the form chemists write it (C₂H₅OH). */
  formulaDisplay: string
  name: string
  nameZh: string
  category: MoleculeCategory
  /** VSEPR-style shape key. */
  shape: string
  shapeZh: string
  /**
   * True when the coordinates come from idealised polygons (regular hexagons, a
   * perfect truncated icosahedron) rather than measured values. Surfaced in the UI
   * so the model never implies experimental precision it does not have.
   */
  idealized: boolean
  summaryZh: string
  summaryEn: string
  /** One or two sentences on what the molecule is actually for. */
  usesZh: string
  usesEn: string
  /** Concrete places it shows up in daily life. */
  everydayZh: string[]
  everydayEn: string[]
  /** g/mol, summed from the standard atomic weights. */
  molarMass: number
  /**
   * Everything below is derived from the coordinates at build time, so the gallery,
   * the search and the readout never have to load them. The coordinates themselves
   * live in `MoleculeGeometry`, keyed by id in a separate file.
   */
  atomCount: number
  bondCounts: { single: number; double: number; triple: number }
  composition: { symbol: string; count: number }[]
  /** One entry per distinct bond kind, for the bond-length readout. */
  bondTypes: { a: string; b: string; order: 1 | 2 | 3; length: number }[]
  /** Distance from the centre to the outermost atom surface — used to frame the camera. */
  extent: number
}

/** Coordinates for one molecule, loaded only when a 3D view opens. */
export interface MoleculeGeometry {
  atoms: MoleculeAtom[]
  bonds: MoleculeBond[]
}

/** How the molecule is drawn. */
export type MoleculeStyle = 'ball-stick' | 'space-filling' | 'stick'
