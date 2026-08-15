/** Vertical field of view used by every 3D viewer in the app, degrees. */
export const CAMERA_FOV = 45

/**
 * Camera distance that fits a sphere of `radius` on screen.
 *
 * `fov` is the *vertical* field of view, so a portrait canvas sees a much narrower
 * slice horizontally. Dividing by `min(1, aspect)` fits whichever axis is tighter —
 * without it, tall narrow panels clip the model at the left and right edges.
 */
export function fitDistance(radius: number, aspect = 1, margin = 1.12, minimum = 6): number {
  const halfFov = (CAMERA_FOV / 2) * (Math.PI / 180)
  const fit = radius / (Math.tan(halfFov) * Math.min(1, aspect))
  return Math.max(minimum, fit * margin)
}

/** Standard three-quarter view position at `distance` from the origin. */
export function orbitPosition(distance: number): [number, number, number] {
  return [distance * 0.35, distance * 0.42, distance * 0.84]
}
