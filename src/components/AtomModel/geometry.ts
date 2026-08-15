import { fitDistance } from '../../lib/camera'

/**
 * Pure geometry helpers for the Bohr-style atom scene. Kept out of AtomScene.tsx so
 * that file only exports components (and React Fast Refresh keeps working).
 */

/** Radius of the innermost shell, in world units. */
const FIRST_SHELL_RADIUS = 1.4
/** Distance between consecutive shells. */
const SHELL_SPACING = 0.85
/** Golden angle, used to spread shell orbital planes so no two coincide. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
/** Total spread of shell tilts, radians. Keeps shells countable but clearly 3D. */
const TILT_SPREAD = (70 * Math.PI) / 180

export function shellRadius(index: number): number {
  return FIRST_SHELL_RADIUS + index * SHELL_SPACING
}

/** Camera distance that frames every shell with a little margin. */
export function cameraDistance(shellCount: number, aspect = 1): number {
  // Pad past the orbit path so the electrons riding on it are not half cut off.
  return fitDistance(shellRadius(shellCount - 1) + 0.35, aspect)
}

/**
 * Orientation for a shell's orbital plane. Tilts fan out symmetrically around the
 * equator while azimuths follow the golden angle, so shells stay visually
 * concentric — you can still count them — without any two planes coinciding.
 */
export function shellOrientation(index: number, count: number): [number, number, number] {
  const t = count === 1 ? 0.5 : index / (count - 1)
  const tilt = (t - 0.5) * TILT_SPREAD
  return [tilt, index * GOLDEN_ANGLE, 0]
}

/** Points tracing a circle of `radius` in the XZ plane. */
export function circlePoints(radius: number, segments = 96): [number, number, number][] {
  const points: [number, number, number][] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    points.push([Math.cos(a) * radius, 0, Math.sin(a) * radius])
  }
  return points
}

/**
 * Nucleus radius for an atomic number. Kept well inside the K shell (radius 1.4) at
 * every atomic number, so the glow halo never crowds the innermost orbit.
 */
export function nucleusRadius(atomicNumber: number): number {
  return 0.3 + 0.22 * Math.cbrt(atomicNumber / 118)
}
