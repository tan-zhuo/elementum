import { useCallback, useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import type { Molecule, MoleculeStyle } from '../../types/molecule'
import { atomColor, composition } from '../../data/molecules'
import { moleculeGeometry } from '../../data/moleculeGeometry'
import { useAppStore } from '../../stores/useAppStore'
import { translate } from '../../i18n'
import { CAMERA_FOV, fitDistance, orbitPosition } from '../../lib/camera'
import { supportsWebGL } from '../../lib/webgl'
import { ViewerButton } from '../viewer/ViewerButton'
import { MoleculeScene } from './MoleculeScene'

const STYLE_KEYS: MoleculeStyle[] = ['ball-stick', 'space-filling', 'stick']

const STYLE_LABELS: Record<MoleculeStyle, { zh: string; en: string }> = {
  'ball-stick': { zh: '球棍', en: 'Ball & stick' },
  'space-filling': { zh: '空间填充', en: 'Space filling' },
  stick: { zh: '棍状', en: 'Stick' },
}

export function MoleculeModel({ molecule }: { molecule: Molecule }) {
  const locale = useAppStore((s) => s.locale)
  const style = useAppStore((s) => s.moleculeStyle)
  const setStyle = useAppStore((s) => s.setMoleculeStyle)
  const showLabels = useAppStore((s) => s.moleculeLabels)
  const setShowLabels = useAppStore((s) => s.setMoleculeLabels)
  const autoRotate = useAppStore((s) => s.autoRotate)
  const setAutoRotate = useAppStore((s) => s.setAutoRotate)
  const autoplay = useAppStore((s) => s.autoplay)
  const setAutoplay = useAppStore((s) => s.setAutoplay)
  const fullscreen = useAppStore((s) => s.viewerFullscreen)
  const setFullscreen = useAppStore((s) => s.setViewerFullscreen)

  const t = useCallback((key: Parameters<typeof translate>[0]) => translate(key, locale), [locale])

  const [resetToken, setResetToken] = useState(0)
  const hasWebGL = useMemo(() => supportsWebGL(), [])
  const distance = fitDistance(molecule.extent, 1, 1.15, 4)
  const elements = useMemo(() => composition(molecule), [molecule])
  // Coordinates arrive with this chunk, not with the initial bundle.
  const geometry = useMemo(() => moleculeGeometry(molecule.id), [molecule.id])

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
        {/* Autoplay countdown, visible in both the panel and fullscreen. Keyed by
            molecule so the bar restarts with each one. */}
        {autoplay && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden">
            <div key={molecule.id} className="autoplay-progress h-full w-full" />
          </div>
        )}

        <Canvas
          camera={{ position: orbitPosition(distance), fov: CAMERA_FOV }}
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <MoleculeScene
            moleculeId={molecule.id}
            geometry={geometry}
            style={style}
            showLabels={showLabels}
            autoRotate={autoRotate}
            resetToken={resetToken}
          />
        </Canvas>

        <div className="pointer-events-none absolute left-3 top-3 select-none">
          <div className="text-2xl font-semibold text-white/90">{molecule.formulaDisplay}</div>
          <div className="text-xs text-slate-400">
            {geometry.atoms.length} {t('atoms')} · {geometry.bonds.length} {t('bonds')}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 select-none text-[11px] text-slate-500">
          {t('dragToRotate')}
        </div>
      </div>

      {/* Element legend: colours match the atom spheres (CPK convention). */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-white/5 px-3 py-2">
        {elements.map(({ symbol, count }) => (
          <span
            key={symbol}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-slate-300"
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: atomColor(symbol),
                boxShadow: `0 0 6px ${atomColor(symbol)}`,
              }}
            />
            <span className="font-medium text-slate-200">{symbol}</span>
            <span className="tabular-nums text-slate-400">×{count}</span>
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-white/5 px-3 py-2">
        {STYLE_KEYS.map((key) => (
          <ViewerButton key={key} active={style === key} onClick={() => setStyle(key)}>
            {STYLE_LABELS[key][locale]}
          </ViewerButton>
        ))}
        <ViewerButton active={showLabels} onClick={() => setShowLabels(!showLabels)}>
          {t('atomLabels')}
        </ViewerButton>
        <ViewerButton active={autoRotate} onClick={() => setAutoRotate(!autoRotate)}>
          {t('autoRotate')}
        </ViewerButton>
        <ViewerButton active={autoplay} onClick={() => setAutoplay(!autoplay)}>
          {t('autoplay')}
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

  // Deliberately NOT portalled: moving the canvas between two parents unmounts it,
  // which throws away the WebGL context on every fullscreen toggle — and remounting
  // it from a fullscreenchange handler (Esc) made react-three-fiber reconnect to a
  // detached node and throw. Going fullscreen is a class swap on the node that is
  // already there; the detail panel is the topmost stacking context, so a fixed,
  // z-50 child of it still covers the page.
  return viewer
}
