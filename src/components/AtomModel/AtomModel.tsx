import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Canvas } from '@react-three/fiber'
import type { Element } from '../../types/element'
import { SHELL_COLORS, SHELL_LABELS } from '../../data/categories'
import { useAppStore } from '../../stores/useAppStore'
import { translate } from '../../i18n'
import { dampBright } from '../../lib/color'
import { supportsWebGL } from '../../lib/webgl'
import { ViewerButton } from '../viewer/ViewerButton'
import { AtomScene } from './AtomScene'
import { cameraDistance } from './geometry'
import { CAMERA_FOV, orbitPosition } from '../../lib/camera'

interface AtomModelProps {
  element: Element
}

export function AtomModel({ element }: AtomModelProps) {
  const locale = useAppStore((s) => s.locale)
  const autoRotate = useAppStore((s) => s.autoRotate)
  const animateElectrons = useAppStore((s) => s.animateElectrons)
  const showCloud = useAppStore((s) => s.showCloud)
  const fullscreen = useAppStore((s) => s.viewerFullscreen)
  const setAutoRotate = useAppStore((s) => s.setAutoRotate)
  const setAnimateElectrons = useAppStore((s) => s.setAnimateElectrons)
  const setShowCloud = useAppStore((s) => s.setShowCloud)
  const setFullscreen = useAppStore((s) => s.setViewerFullscreen)

  const t = useCallback((key: Parameters<typeof translate>[0]) => translate(key, locale), [locale])

  // Incrementing this re-frames the camera without remounting the canvas.
  const [resetToken, setResetToken] = useState(0)
  const hasWebGL = useMemo(() => supportsWebGL(), [])

  // CPK colour where the data has one, damped so near-white elements (H, He, F)
  // do not render as a blown-out disc.
  const nucleusColor = dampBright(element.cpkHex ? `#${element.cpkHex}` : '#CBD5E1')
  const distance = cameraDistance(element.shells.length)

  // Escape leaves fullscreen. Capture phase so it wins over the detail panel's own
  // Escape handler, which would otherwise close the panel underneath.
  useEffect(() => {
    if (!fullscreen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [fullscreen, setFullscreen])

  if (!hasWebGL) {
    return (
      <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-slate-400">
        {t('webglError')}
      </div>
    )
  }

  const viewer = (
    <div
      className={
        fullscreen
          ? 'surface-deep-solid fixed inset-0 z-50 flex flex-col'
          : 'relative flex h-full min-h-[20rem] flex-col overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(ellipse_at_center,rgba(30,58,138,0.18),transparent_70%)]'
      }
    >
      <div className="relative flex-1">
        <Canvas
          // Remounting per element would drop the WebGL context on every click; the
          // scene swaps its own contents instead.
          // Starting distance assumes a square canvas; AtomScene re-frames against
          // the real aspect ratio as soon as it knows the viewport size.
          camera={{ position: orbitPosition(distance), fov: CAMERA_FOV }}
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <AtomScene
            shells={element.shells}
            atomicNumber={element.number}
            color={nucleusColor}
            autoRotate={autoRotate}
            animateElectrons={animateElectrons}
            showCloud={showCloud}
            resetToken={resetToken}
          />
        </Canvas>

        <div className="pointer-events-none absolute left-3 top-3 select-none">
          <div className="text-2xl font-semibold text-white/90">{element.symbol}</div>
          <div className="text-xs text-slate-400">
            {element.number} · {element.shells.length} {t('shell')}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 select-none text-[11px] text-slate-500">
          {t('dragToRotate')}
        </div>
      </div>

      {/* Shell legend: colours match the orbit rings in the scene. */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-white/5 px-3 py-2">
        {element.shells.map((count, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-slate-300"
            title={`${SHELL_LABELS[i]} ${t('shell')}: ${count} ${t('electrons')}`}
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: SHELL_COLORS[i % SHELL_COLORS.length],
                boxShadow: `0 0 6px ${SHELL_COLORS[i % SHELL_COLORS.length]}`,
              }}
            />
            <span className="font-medium text-slate-200">{SHELL_LABELS[i]}</span>
            <span className="tabular-nums text-slate-400">{count}</span>
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-white/5 px-3 py-2">
        <ViewerButton active={autoRotate} onClick={() => setAutoRotate(!autoRotate)}>
          {t('autoRotate')}
        </ViewerButton>
        <ViewerButton
          active={animateElectrons}
          onClick={() => setAnimateElectrons(!animateElectrons)}
        >
          {t('animateElectrons')}
        </ViewerButton>
        <ViewerButton active={showCloud} onClick={() => setShowCloud(!showCloud)}>
          {t('electronCloud')}
        </ViewerButton>
        <ViewerButton active={false} onClick={() => setResetToken((n) => n + 1)}>
          {t('resetView')}
        </ViewerButton>
        <ViewerButton active={fullscreen} onClick={() => setFullscreen(!fullscreen)}>
          {fullscreen ? t('exitFullscreen') : t('fullscreen')}
        </ViewerButton>
      </div>
    </div>
  )

  // Portalled to the body so the fixed overlay is never trapped by an ancestor's
  // transform or overflow.
  return fullscreen ? createPortal(viewer, document.body) : viewer
}
