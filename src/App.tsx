import { useEffect, useRef } from 'react'
import type { View } from './stores/useAppStore'
import { getElement } from './data/elements'
import { MOLECULES, getMolecule, visibleMoleculeIds } from './data/molecules'
import { AUTOPLAY_INTERVAL_MS, useAppStore } from './stores/useAppStore'
import { translate } from './i18n'
import { afterFirstPaint, dismissSplash } from './lib/splash'
import { enterFullscreen, exitFullscreen, isFullscreen } from './lib/fullscreen'
import { usePageFullscreen } from './lib/useFullscreen'
import { PeriodicTable } from './components/PeriodicTable/PeriodicTable'
import { SearchBar } from './components/SearchBar/SearchBar'
import { CategoryFilter } from './components/CategoryFilter/CategoryFilter'
import { ElementDetail } from './components/ElementDetail/ElementDetail'
import { ComparePanel } from './components/ComparePanel/ComparePanel'
import { MoleculeGallery } from './components/MoleculeGallery/MoleculeGallery'
import { MoleculeFilter } from './components/MoleculeGallery/MoleculeFilter'
import { MoleculeDetail } from './components/MoleculeDetail/MoleculeDetail'
import { Footer } from './components/Footer/Footer'
import { ThemePicker } from './components/ThemePicker/ThemePicker'

function LocaleToggle() {
  const locale = useAppStore((s) => s.locale)
  const toggleLocale = useAppStore((s) => s.toggleLocale)
  return (
    <button
      type="button"
      onClick={toggleLocale}
      aria-label={translate('language', locale)}
      className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-white/30 hover:text-slate-50"
    >
      <span className={locale === 'zh' ? 'accent-text' : ''}>中</span>
      <span className="mx-1 text-slate-600">/</span>
      <span className={locale === 'en' ? 'accent-text' : ''}>EN</span>
    </button>
  )
}

/** Page-level fullscreen, for presenting the table or a molecule on a big screen. */
function FullscreenToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const locale = useAppStore((s) => s.locale)
  const label = translate(active ? 'exitPageFullscreen' : 'enterPageFullscreen', locale)
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={label}
      title={`${label} · F`}
      className="hidden h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-400 transition-colors hover:border-white/30 hover:text-slate-100 sm:flex"
    >
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {active ? (
          <path d="M6.5 2v4.5H2M9.5 14V9.5H14M14 6.5H9.5V2M2 9.5h4.5V14" />
        ) : (
          <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
        )}
      </svg>
    </button>
  )
}

/** Opens the first molecule on screen and hands it to the autoplay timer. */
function AutoplayStarter() {
  const locale = useAppStore((s) => s.locale)
  const query = useAppStore((s) => s.query)
  const activeCategories = useAppStore((s) => s.activeMoleculeCategories)
  const selectMolecule = useAppStore((s) => s.selectMolecule)
  const setAutoplay = useAppStore((s) => s.setAutoplay)

  const start = () => {
    const ids = visibleMoleculeIds(query, activeCategories)
    if (ids.length === 0) return
    selectMolecule(ids[0])
    setAutoplay(true)
  }

  return (
    <button
      type="button"
      onClick={start}
      title={translate('autoplayHint', locale)}
      className="accent-hover inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-300 transition-colors"
    >
      <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor">
        <path d="M3.2 1.8 10 6l-6.8 4.2z" />
      </svg>
      {translate('autoplayStart', locale)}
    </button>
  )
}

const VIEWS: { key: View; label: 'viewElements' | 'viewMolecules' }[] = [
  { key: 'elements', label: 'viewElements' },
  { key: 'molecules', label: 'viewMolecules' },
]

function ViewSwitcher() {
  const locale = useAppStore((s) => s.locale)
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)

  return (
    <div
      role="tablist"
      aria-label={translate('appTitle', locale)}
      className="flex shrink-0 items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.04] p-0.5"
    >
      {VIEWS.map(({ key, label }) => (
        <button
          key={key}
          role="tab"
          type="button"
          aria-selected={view === key}
          onClick={() => setView(key)}
          className={`rounded-[7px] px-2.5 py-1.5 text-xs font-medium transition-colors ${
            view === key
              ? 'accent-bg accent-text'
              : 'text-slate-400 hover:text-slate-100'
          }`}
        >
          {translate(label, locale)}
        </button>
      ))}
    </div>
  )
}

export default function App() {
  const locale = useAppStore((s) => s.locale)
  const theme = useAppStore((s) => s.theme)
  const view = useAppStore((s) => s.view)
  const selected = useAppStore((s) => s.selected)
  const selectedMolecule = useAppStore((s) => s.selectedMolecule)
  const select = useAppStore((s) => s.select)
  const selectMolecule = useAppStore((s) => s.selectMolecule)

  const viewerFullscreen = useAppStore((s) => s.viewerFullscreen)
  const setViewerFullscreen = useAppStore((s) => s.setViewerFullscreen)
  const fullscreen = usePageFullscreen()
  // Remembers whether the browser is in fullscreen because the 3D viewer asked,
  // so leaving the viewer does not yank someone out of a fullscreen they opened
  // themselves.
  const viewerOpenedFullscreen = useRef(false)
  const wasFullscreen = useRef(false)

  const element = selected !== null ? getElement(selected) : undefined
  const molecule = selectedMolecule !== null ? getMolecule(selectedMolecule) : undefined
  const panelOpen = Boolean(element ?? molecule)

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    document.title = `${translate('appTitle', locale)} · ${translate('appSubtitle', locale)}`
  }, [locale])

  // The whole palette hangs off this one attribute. The browser chrome colour is
  // kept in step so a themed page does not sit under a mismatched status bar.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
    const meta = document.querySelector('meta[name="theme-color"]')
    if (surface && meta) meta.setAttribute('content', surface)
  }, [theme])

  // Hand off from the inlined splash once the table is genuinely on screen. The
  // splash enforces its own minimum play time from here.
  useEffect(() => {
    afterFirstPaint(dismissSplash)
  }, [])

  // One source of truth for the autoplay interval, shared with the progress bar's
  // CSS animation.
  useEffect(() => {
    document.documentElement.style.setProperty('--autoplay-duration', `${AUTOPLAY_INTERVAL_MS}ms`)
  }, [])

  // The 3D viewer's own fullscreen is a CSS overlay; pairing it with real browser
  // fullscreen is what makes it fill the display during a presentation.
  useEffect(() => {
    if (viewerFullscreen) {
      if (!isFullscreen()) {
        viewerOpenedFullscreen.current = true
        void enterFullscreen()
      }
      return
    }
    if (viewerOpenedFullscreen.current) {
      viewerOpenedFullscreen.current = false
      void exitFullscreen()
    }
  }, [viewerFullscreen])

  // Leaving browser fullscreen from outside the app (Esc, the browser's own
  // control) has to collapse the overlay too, or the page stays in a maximised
  // layout inside a normal window.
  //
  // This watches the true -> false transition rather than the current value:
  // `requestFullscreen` resolves asynchronously, so right after the viewer asks
  // for fullscreen the flag is still false, and reading it directly would read
  // that as "the user just left" and close the overlay we had only just opened.
  useEffect(() => {
    const left = wasFullscreen.current && !fullscreen.active
    wasFullscreen.current = fullscreen.active
    if (left && viewerFullscreen) {
      viewerOpenedFullscreen.current = false
      setViewerFullscreen(false)
    }
  }, [fullscreen.active, viewerFullscreen, setViewerFullscreen])

  // F toggles fullscreen anywhere outside a text field.
  useEffect(() => {
    if (!fullscreen.supported) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'f' && event.key !== 'F') return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      void fullscreen.toggle()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fullscreen])

  // The detail panel scrolls internally; locking the body avoids a second
  // scrollbar and the scroll-chaining that comes with it.
  useEffect(() => {
    if (!panelOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [panelOpen])

  const closePanel = () => {
    select(null)
    selectMolecule(null)
  }

  return (
    <div className="min-h-full">
      <header className="surface-veil sticky top-0 z-20 border-b border-white/8 backdrop-blur">
        <div className="mx-auto flex max-w-[100rem] flex-col gap-3 px-3 py-3 sm:px-5">
          {/* Below `sm` the search drops to its own line: at 390px it would
              otherwise be squeezed to less than its own padding. */}
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
            <div className="flex shrink-0 items-center gap-2.5">
              <span
                aria-hidden
                className="accent-border accent-bg relative flex h-8 w-8 items-center justify-center rounded-lg border"
              >
                <span className="accent-dot h-2 w-2 rounded-full" />
                <span className="accent-border absolute inset-0.5 rounded-md border" />
                <span className="accent-border absolute inset-1.5 rotate-45 rounded-sm border" />
              </span>
              <div className="hidden leading-tight xl:block">
                <h1 className="text-sm font-semibold text-slate-100">
                  {translate('appTitle', locale)}
                </h1>
                <p className="text-[10px] text-slate-500">{translate('appSubtitle', locale)}</p>
              </div>
            </div>

            <ViewSwitcher />

            <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
              <SearchBar />
            </div>

            {fullscreen.supported && (
              <FullscreenToggle active={fullscreen.active} onToggle={fullscreen.toggle} />
            )}
            <ThemePicker />
            <LocaleToggle />
          </div>

          {/* Each view brings its own filter row. */}
          {view === 'elements' ? <CategoryFilter /> : <MoleculeFilter />}
        </div>
      </header>

      <main className="mx-auto max-w-[100rem] px-2 py-4 sm:px-5">
        {view === 'elements' ? (
          <PeriodicTable />
        ) : (
          <>
            <div className="mb-4 flex items-end justify-between gap-3 px-1">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">
                  {translate('moleculeTitle', locale)}
                </h2>
                <p className="text-xs text-slate-500">
                  {MOLECULES.length} {translate('moleculeCount', locale)} ·{' '}
                  {translate('moleculeSubtitle', locale)}
                </p>
              </div>
              <AutoplayStarter />
            </div>
            <MoleculeGallery />
          </>
        )}
      </main>

      <Footer />

      {view === 'elements' && <ComparePanel />}

      {/* Detail drawer, shared by both views. */}
      {panelOpen && (
        <>
          <div
            role="presentation"
            onClick={closePanel}
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              element
                ? locale === 'zh'
                  ? element.nameZh
                  : element.name
                : molecule
                  ? locale === 'zh'
                    ? molecule.nameZh
                    : molecule.name
                  : undefined
            }
            className="surface-solid fixed inset-y-0 right-0 z-40 w-full max-w-[64rem] border-l border-white/10 shadow-2xl"
          >
            {element ? (
              <ElementDetail element={element} />
            ) : molecule ? (
              <MoleculeDetail molecule={molecule} />
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
