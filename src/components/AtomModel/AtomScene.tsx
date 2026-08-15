import { useEffect, useMemo, useRef } from 'react'
import type { ComponentRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { SHELL_COLORS } from '../../data/categories'
import {
  cameraDistance,
  circlePoints,
  nucleusRadius,
  shellOrientation,
  shellRadius,
} from './geometry'
import { orbitPosition } from '../../lib/camera'

/** Derived from the component so this does not depend on drei's transitive
 *  three-stdlib package being hoisted. */
type OrbitControlsImpl = ComponentRef<typeof OrbitControls>

interface ShellProps {
  index: number
  count: number
  electrons: number
  electronRadius: number
  sphereSegments: number
  animate: boolean
}

/**
 * One electron shell: an orbit path plus its electrons.
 *
 * The electrons are a single InstancedMesh whose per-instance matrices are written
 * once. Animation rotates the parent group instead of rewriting matrices every
 * frame, which keeps a 118-electron atom at one draw call per shell.
 */
function Shell({ index, count, electrons, electronRadius, sphereSegments, animate }: ShellProps) {
  const spinRef = useRef<THREE.Group>(null)
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const radius = shellRadius(index)
  const color = SHELL_COLORS[index % SHELL_COLORS.length]
  const points = useMemo(() => circlePoints(radius), [radius])

  // Inner shells orbit faster, echoing the Bohr model's v ∝ 1/n.
  const speed = 0.45 / (index + 1)

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const matrix = new THREE.Matrix4()
    for (let i = 0; i < electrons; i++) {
      const angle = (i / electrons) * Math.PI * 2
      matrix.setPosition(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
      mesh.setMatrixAt(i, matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    // Without an explicit bounding sphere three culls the instances, because the
    // untransformed geometry sits at the origin.
    mesh.computeBoundingSphere()
  }, [electrons, radius])

  useFrame((_, delta) => {
    if (animate && spinRef.current) {
      // Alternate direction by shell so neighbouring orbits stay visually distinct.
      spinRef.current.rotation.y += speed * delta * (index % 2 === 0 ? 1 : -1)
    }
  })

  return (
    <group rotation={shellOrientation(index, count)}>
      <Line
        points={points}
        color={color}
        lineWidth={1.2}
        transparent
        opacity={0.35}
        depthWrite={false}
      />
      <group ref={spinRef}>
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, electrons]}
          frustumCulled={false}
        >
          <sphereGeometry args={[electronRadius, sphereSegments, sphereSegments]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={1.6}
            roughness={0.35}
            metalness={0.1}
          />
        </instancedMesh>
      </group>
    </group>
  )
}

/**
 * The nucleus: a solid core wrapped in two additive shells that fake a bloom glow
 * without pulling in a postprocessing pass.
 */
function Nucleus({ radius, color }: { radius: number; color: string }) {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.8}
          roughness={0.25}
          metalness={0.2}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[radius * 1.35, 24, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[radius * 1.9, 24, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.07}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

/** Translucent shell suggesting the outer electron cloud boundary. */
function ElectronCloud({ radius, color }: { radius: number; color: string }) {
  return (
    <mesh>
      <sphereGeometry args={[radius, 48, 48]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.07}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  )
}

export interface AtomSceneProps {
  shells: number[]
  atomicNumber: number
  /** Nucleus colour; the element's CPK colour when it has one. */
  color: string
  autoRotate: boolean
  animateElectrons: boolean
  showCloud: boolean
  /** Bumping this value snaps the camera back to its framing distance. */
  resetToken: number
}

export function AtomScene({
  shells,
  atomicNumber,
  color,
  autoRotate,
  animateElectrons,
  showCloud,
  resetToken,
}: AtomSceneProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const size = useThree((state) => state.size)
  const distance = cameraDistance(shells.length, size.width / size.height)

  // Read inside the re-framing effect without making a resize re-frame the camera —
  // that would yank the view out from under someone dragging the window edge.
  const distanceRef = useRef(distance)
  distanceRef.current = distance

  const totalElectrons = atomicNumber
  // Shrink electrons on crowded shells so a 32-electron shell does not read as a
  // solid ring, and drop sphere detail once there are enough of them to matter.
  const busiest = Math.max(...shells)
  const electronRadius = busiest > 24 ? 0.1 : busiest > 12 ? 0.12 : 0.15
  const sphereSegments = totalElectrons > 60 ? 8 : totalElectrons > 20 ? 10 : 14
  const coreRadius = nucleusRadius(atomicNumber)

  // Re-frame whenever the element (and so the shell count) changes, or the user
  // asks for a reset.
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    controls.object.position.set(...orbitPosition(distanceRef.current))
    controls.target.set(0, 0, 0)
    controls.update()
  }, [shells.length, resetToken])

  return (
    <>
      <ambientLight intensity={0.55} />
      <pointLight position={[10, 10, 10]} intensity={120} distance={60} decay={2} />
      <pointLight position={[-10, -6, -8]} intensity={60} color="#7DD3FC" distance={60} decay={2} />

      <Nucleus radius={coreRadius} color={color} />

      {shells.map((electrons, i) => (
        <Shell
          key={i}
          index={i}
          count={shells.length}
          electrons={electrons}
          electronRadius={electronRadius}
          sphereSegments={sphereSegments}
          animate={animateElectrons}
        />
      ))}

      {showCloud && <ElectronCloud radius={shellRadius(shells.length - 1) + 0.6} color={color} />}

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        autoRotate={autoRotate}
        autoRotateSpeed={0.8}
        minDistance={distance * 0.35}
        maxDistance={distance * 2.4}
      />
    </>
  )
}
