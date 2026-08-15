import { useCallback, useEffect, useState } from 'react'
import {
  enterFullscreen,
  exitFullscreen,
  fullscreenSupported,
  isFullscreen,
  onFullscreenChange,
} from './fullscreen'

/**
 * Page-level fullscreen as React state.
 *
 * The browser is the source of truth: pressing Esc or leaving fullscreen from the
 * browser's own UI fires `fullscreenchange`, and the state follows that rather
 * than whatever the app last asked for.
 */
export function usePageFullscreen() {
  const [active, setActive] = useState(false)
  const [supported] = useState(fullscreenSupported)

  useEffect(() => onFullscreenChange(() => setActive(isFullscreen())), [])

  const toggle = useCallback(async () => {
    if (isFullscreen()) await exitFullscreen()
    else await enterFullscreen()
    setActive(isFullscreen())
  }, [])

  return { supported, active, toggle }
}
