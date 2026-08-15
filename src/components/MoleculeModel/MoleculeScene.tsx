import { useEffect, useMemo, useRef } from 'react'
import type { ComponentRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { Molecule, MoleculeStyle, Vec3 } from '../../types/molecule'
import { atomColor, atomRadii } from '../../data/molecules'
import { fitDistance, orbitPosition } from '../../lib/camera'

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>

/** Radius of a bond cylinder, in angstroms. */
const BOND_RADIUS = 0.09
/** Centre-to-centre separation between the lines of a multiple bond. */
const BOND_SPLIT = 0.26
/** Cylinder geometry is built along +Y; bonds are rotated from this. */
const CYLINDER_AXIS = new THREE.Vector3(0, 1, 0)

/** Sphere radius for an atom under the active drawing style. */
function atomRadiusFor(symbol: string, style: MoleculeStyle): number {
  const { covalent, vdw } = atomRadii(symbol)
  if (style === 'space-filling') return vdw
  if (style === 'stick') return BOND_RADIUS
  // Ball-and-stick: scaled-down covalent radii keep bonds visible between atoms.
  return Math.max(0.25, covalent * 0.42)
}

/**
 * Shared unit geometries and one material per element colour.
 *
 * Declaring `<sphereGeometry>` inside each mesh would allocate a fresh geometry per
 * atom, which C60 turns into 150 of them. Meshes instead reference these unit
 * primitives and carry their size in `scale`.
 */
function useSharedResources(molecule: Molecule, sphereSegments: number) {
  const resources = useMemo(() => {
    const sphere = new THREE.SphereGeometry(1, sphereSegments, sphereSegments)
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12, 1)
    const materials = new Map<string, THREE.MeshStandardMaterial>()
    for (const atom of molecule.atoms) {
      if (materials.has(atom.element)) continue
      materials.set(
        atom.element,
        new THREE.MeshStandardMaterial({
          color: atomColor(atom.element),
          roughness: 0.35,
          metalness: 0.2,
        }),
      )
    }
    return { sphere, cylinder, materials }
  }, [molecule, sphereSegments])

  // Passed by prop rather than declared as JSX, so three does not dispose them for
  // us when a mesh unmounts.
  useEffect(
    () => () => {
      resources.sphere.dispose()
      resources.cylinder.dispose()
      resources.materials.forEach((m) => m.dispose())
    },
    [resources],
  )

  return resources
}

interface StickProps {
  from: Vec3
  to: Vec3
  radius: number
  geometry: THREE.CylinderGeometry
  material: THREE.Material
}

/** A single cylinder spanning `from` -> `to`, sized entirely through `scale`. */
function Stick({ from, to, radius, geometry, material }: StickProps) {
  const { position, quaternion, height } = useMemo(() => {
    const start = new THREE.Vector3(...from)
    const end = new THREE.Vector3(...to)
    const direction = new THREE.Vector3().subVectors(end, start)
    return {
      position: new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        CYLINDER_AXIS,
        direction.clone().normalize(),
      ),
      height: direction.length(),
    }
  }, [from, to])

  return (
    <mesh
      position={position}
      quaternion={quaternion}
      scale={[radius, height, radius]}
      geometry={geometry}
      material={material}
    />
  )
}

interface BondProps {
  from: Vec3
  to: Vec3
  materialA: THREE.Material
  materialB: THREE.Material
  order: 1 | 2 | 3
  offset?: Vec3
  geometry: THREE.CylinderGeometry
}

/**
 * One chemical bond.
 *
 * Each line is split at the midpoint and coloured by the atom it touches, the
 * standard ball-and-stick convention — it makes the composition readable without
 * turning on labels. Bonds between two atoms of the same element skip the split and
 * draw as one cylinder, which halves the mesh count for C60 and the other
 * homonuclear cages. Double and triple bonds are drawn as parallel lines offset
 * along the perpendicular the data pipeline computed, which keeps the extra lines
 * inside the molecular plane for planar molecules like benzene.
 */
function Bond({ from, to, materialA, materialB, order, offset, geometry }: BondProps) {
  const lines = useMemo(() => {
    if (order === 1 || !offset) return [0]
    if (order === 2) return [-BOND_SPLIT / 2, BOND_SPLIT / 2]
    return [-BOND_SPLIT, 0, BOND_SPLIT]
  }, [order, offset])

  // Thinner lines when a bond is drawn as two or three of them, so a triple bond
  // does not read as a single fat tube.
  const radius = lines.length === 1 ? BOND_RADIUS : BOND_RADIUS * 0.62
  const uniform = materialA === materialB

  return (
    <>
      {lines.map((shift, i) => {
        const displace: Vec3 = offset
          ? [offset[0] * shift, offset[1] * shift, offset[2] * shift]
          : [0, 0, 0]
        const a: Vec3 = [from[0] + displace[0], from[1] + displace[1], from[2] + displace[2]]
        const b: Vec3 = [to[0] + displace[0], to[1] + displace[1], to[2] + displace[2]]
        if (uniform) {
          return (
            <Stick key={i} from={a} to={b} radius={radius} geometry={geometry} material={materialA} />
          )
        }
        const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
        return (
          <group key={i}>
            <Stick from={a} to={mid} radius={radius} geometry={geometry} material={materialA} />
            <Stick from={mid} to={b} radius={radius} geometry={geometry} material={materialB} />
          </group>
        )
      })}
    </>
  )
}

export interface MoleculeSceneProps {
  molecule: Molecule
  style: MoleculeStyle
  showLabels: boolean
  autoRotate: boolean
  /** Bumping this value snaps the camera back to its framing distance. */
  resetToken: number
}

export function MoleculeScene({
  molecule,
  style,
  showLabels,
  autoRotate,
  resetToken,
}: MoleculeSceneProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const size = useThree((state) => state.size)

  // Fewer segments once there are enough atoms for the vertex count to matter.
  const sphereSegments = molecule.atoms.length > 30 ? 20 : 32
  const { sphere, cylinder, materials } = useSharedResources(molecule, sphereSegments)

  // Space-filling spheres reach further out than the ball-and-stick ones, so the
  // framing radius follows the active style rather than a single stored extent.
  const radius = useMemo(() => {
    const reach = Math.max(
      ...molecule.atoms.map((a) => Math.hypot(...a.position) + atomRadiusFor(a.element, style)),
    )
    return reach + 0.3
  }, [molecule, style])

  const distance = fitDistance(radius, size.width / size.height, 1.15, 4)
  const distanceRef = useRef(distance)
  distanceRef.current = distance

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    controls.object.position.set(...orbitPosition(distanceRef.current))
    controls.target.set(0, 0, 0)
    controls.update()
  }, [molecule.id, style, resetToken])

  // Labels would be unreadable stacked 60 deep on a fullerene.
  const labelsWorthShowing = showLabels && molecule.atoms.length <= 24

  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[6, 8, 10]} intensity={2.4} />
      <directionalLight position={[-8, -4, -6]} intensity={0.9} color="#7DD3FC" />

      {molecule.atoms.map((atom, i) => (
        <mesh
          key={i}
          position={atom.position}
          scale={atomRadiusFor(atom.element, style)}
          geometry={sphere}
          material={materials.get(atom.element)}
        />
      ))}

      {/* Space-filling has no visible gaps, so bonds would be hidden anyway. */}
      {style !== 'space-filling' &&
        molecule.bonds.map((bond, i) => (
          <Bond
            key={i}
            from={molecule.atoms[bond.a].position}
            to={molecule.atoms[bond.b].position}
            materialA={materials.get(molecule.atoms[bond.a].element)!}
            materialB={materials.get(molecule.atoms[bond.b].element)!}
            order={bond.order}
            offset={bond.offset}
            geometry={cylinder}
          />
        ))}

      {labelsWorthShowing &&
        molecule.atoms.map((atom, i) => (
          <Html
            key={i}
            position={atom.position}
            center
            zIndexRange={[10, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <span className="select-none rounded bg-black/70 px-1 py-px text-[10px] font-semibold text-white">
              {atom.element}
              <span className="ml-0.5 font-normal text-slate-400">{i + 1}</span>
            </span>
          </Html>
        ))}

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        autoRotate={autoRotate}
        autoRotateSpeed={1.1}
        minDistance={distance * 0.3}
        maxDistance={distance * 2.6}
      />
    </>
  )
}
