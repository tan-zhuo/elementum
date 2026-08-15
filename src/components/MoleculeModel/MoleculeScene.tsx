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

/** A single cylinder spanning `from` -> `to`. */
function Stick({ from, to, color, radius }: { from: Vec3; to: Vec3; color: string; radius: number }) {
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
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, height, 12, 1]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.15} />
    </mesh>
  )
}

/**
 * One chemical bond.
 *
 * Each line is split at the midpoint and coloured by the atom it touches, the
 * standard ball-and-stick convention — it makes the composition readable without
 * turning on labels. Double and triple bonds are drawn as parallel lines offset
 * along the perpendicular the data pipeline computed, which keeps the extra lines
 * inside the molecular plane for planar molecules like benzene.
 */
function Bond({
  from,
  to,
  colorA,
  colorB,
  order,
  offset,
}: {
  from: Vec3
  to: Vec3
  colorA: string
  colorB: string
  order: 1 | 2 | 3
  offset?: Vec3
}) {
  const lines = useMemo(() => {
    if (order === 1 || !offset) return [0]
    if (order === 2) return [-BOND_SPLIT / 2, BOND_SPLIT / 2]
    return [-BOND_SPLIT, 0, BOND_SPLIT]
  }, [order, offset])

  // Thinner lines when a bond is drawn as two or three of them, so a triple bond
  // does not read as a single fat tube.
  const radius = lines.length === 1 ? BOND_RADIUS : BOND_RADIUS * 0.62

  return (
    <>
      {lines.map((shift, i) => {
        const displace: Vec3 = offset
          ? [offset[0] * shift, offset[1] * shift, offset[2] * shift]
          : [0, 0, 0]
        const a: Vec3 = [from[0] + displace[0], from[1] + displace[1], from[2] + displace[2]]
        const b: Vec3 = [to[0] + displace[0], to[1] + displace[1], to[2] + displace[2]]
        const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
        return (
          <group key={i}>
            <Stick from={a} to={mid} color={colorA} radius={radius} />
            <Stick from={mid} to={b} color={colorB} radius={radius} />
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

  // Space-filling spheres reach further out than the ball-and-stick ones, so the
  // framing radius follows the active style rather than a single stored extent.
  const radius = useMemo(() => {
    const reach = Math.max(
      ...molecule.atoms.map(
        (a) => Math.hypot(...a.position) + atomRadiusFor(a.element, style),
      ),
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

  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[6, 8, 10]} intensity={2.4} />
      <directionalLight position={[-8, -4, -6]} intensity={0.9} color="#7DD3FC" />

      {molecule.atoms.map((atom, i) => {
        const color = atomColor(atom.element)
        return (
          <mesh key={i} position={atom.position}>
            <sphereGeometry args={[atomRadiusFor(atom.element, style), 32, 32]} />
            <meshStandardMaterial
              color={color}
              roughness={0.35}
              metalness={0.2}
              // Space-filling spheres overlap heavily; a little transparency keeps
              // the shape of the interior readable.
              transparent={style === 'space-filling'}
              opacity={style === 'space-filling' ? 0.95 : 1}
            />
          </mesh>
        )
      })}

      {/* Space-filling has no visible gaps, so bonds would be hidden anyway. */}
      {style !== 'space-filling' &&
        molecule.bonds.map((bond, i) => (
          <Bond
            key={i}
            from={molecule.atoms[bond.a].position}
            to={molecule.atoms[bond.b].position}
            colorA={atomColor(molecule.atoms[bond.a].element)}
            colorB={atomColor(molecule.atoms[bond.b].element)}
            order={bond.order}
            offset={bond.offset}
          />
        ))}

      {showLabels &&
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
