/** Cached so the probe context is only ever created once. */
let supported: boolean | null = null

/** Whether this browser can give us a WebGL context at all. */
export function supportsWebGL(): boolean {
  if (supported !== null) return supported
  try {
    const canvas = document.createElement('canvas')
    supported = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    supported = false
  }
  return supported
}
