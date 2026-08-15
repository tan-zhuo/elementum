/**
 * Dismissal for the splash screen defined in index.html.
 *
 * The markup, styles and hide logic live in index.html so the splash paints on the
 * first frame, before this bundle has downloaded. All this module does is decide
 * *when* to call the hide function the page already installed.
 */

declare global {
  interface Window {
    /** Timestamp recorded as the splash markup was parsed. */
    __splashStart?: number
    /** Minimum time the splash stays up, in milliseconds. */
    __SPLASH_MIN_MS?: number
    /** Installed by index.html; idempotent. */
    __hideSplash?: () => void
  }
}

/** Fallback if index.html did not run (e.g. a test harness mounting App directly). */
const FALLBACK_MIN_MS = 2200

/**
 * Hides the splash once BOTH conditions hold: the app has painted, and the minimum
 * play time has elapsed. Called after the first paint, so the only thing left to
 * wait on is the clock.
 */
export function dismissSplash(): void {
  const hide = window.__hideSplash
  if (!hide) return

  const start = window.__splashStart ?? Date.now()
  const minimum = window.__SPLASH_MIN_MS ?? FALLBACK_MIN_MS
  const remaining = Math.max(0, minimum - (Date.now() - start))

  if (remaining === 0) {
    hide()
    return
  }
  window.setTimeout(hide, remaining)
}

/**
 * Runs `callback` after the browser has actually painted the current frame.
 *
 * A single rAF fires *before* the paint that follows it, so one more frame is
 * needed to know the app is genuinely on screen rather than merely committed to
 * the DOM.
 */
export function afterFirstPaint(callback: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(callback))
}
