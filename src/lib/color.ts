/** Parses `#rrggbb` (or a bare `rrggbb`) into RGB components. */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const n = parseInt(clean, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** `#rrggbb` -> `rgba(r, g, b, alpha)`. Computed rather than using color-mix so the
 *  output works in any browser that can run the rest of the app. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Relative luminance per WCAG. Used to decide whether text over a heat-map colour
 * should be black or white.
 */
export function luminance(hex: string): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Blends two hex colours; `t` of 0 returns `a`, 1 returns `b`. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  const lerp = (x: number, y: number) => Math.round(x + (y - x) * t)
  const value = (lerp(r1, r2) << 16) | (lerp(g1, g2) << 8) | lerp(b1, b2)
  return `#${value.toString(16).padStart(6, '0')}`
}

/**
 * Pulls very light colours down toward a cool slate.
 *
 * Several elements (hydrogen, helium, fluorine) have near-white CPK colours. Used
 * raw on an emissive nucleus wrapped in additive glow, they clip to a featureless
 * white disc, so bright inputs get mixed down until the sphere reads as a shaded
 * object again.
 */
export function dampBright(hex: string, maxLuminance = 0.72): string {
  const lum = luminance(hex)
  if (lum <= maxLuminance) return hex
  const excess = (lum - maxLuminance) / (1 - maxLuminance)
  return mix(hex, '#1E293B', Math.min(0.45, excess * 0.45))
}

/** Parses the `rgb(r, g, b)` strings produced by the heat-map ramp. */
export function rgbStringToHex(rgb: string): string {
  const match = rgb.match(/\d+/g)
  if (!match) return '#000000'
  const [r, g, b] = match.map(Number)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
