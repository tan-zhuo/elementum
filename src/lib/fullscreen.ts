/**
 * Browser fullscreen, with the WebKit-prefixed fallbacks Safari still needs.
 *
 * Every call is best-effort. iOS Safari refuses `requestFullscreen` on anything
 * that is not a <video>, and any browser rejects a request that is not tied to a
 * user gesture — so callers treat failure as "stay windowed" rather than as an
 * error worth surfacing.
 */

type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

export function fullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false
  const element = document.documentElement as WebkitElement
  return Boolean(element.requestFullscreen ?? element.webkitRequestFullscreen)
}

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false
  const doc = document as WebkitDocument
  return Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement)
}

export async function enterFullscreen(
  target: HTMLElement = document.documentElement,
): Promise<boolean> {
  const element = target as WebkitElement
  try {
    if (element.requestFullscreen) await element.requestFullscreen()
    else if (element.webkitRequestFullscreen) await element.webkitRequestFullscreen()
    else return false
    return true
  } catch {
    return false
  }
}

export async function exitFullscreen(): Promise<void> {
  if (!isFullscreen()) return
  const doc = document as WebkitDocument
  try {
    if (document.exitFullscreen) await document.exitFullscreen()
    else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen()
  } catch {
    /* Already out, or the browser declined; either way there is nothing to do. */
  }
}

/** Subscribes to fullscreen changes from any source, including the Esc key. */
export function onFullscreenChange(handler: () => void): () => void {
  document.addEventListener('fullscreenchange', handler)
  document.addEventListener('webkitfullscreenchange', handler)
  return () => {
    document.removeEventListener('fullscreenchange', handler)
    document.removeEventListener('webkitfullscreenchange', handler)
  }
}
