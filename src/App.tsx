import { useEffect } from 'react'
import type { View } from './stores/useAppStore'
import { getElement } from './data/elements'
import { MOLECULES, getMolecule } from './data/molecules'
import { useAppStore } from './stores/useAppStore'
import { translate } from './i18n'
import { afterFirstPaint, dismissSplash } from './lib/splash'
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
            <div className="mb-4 px-1">
              <h2 className="text-sm font-semibold text-slate-200">
                {translate('moleculeTitle', locale)}
              </h2>
              <p className="text-xs text-slate-500">
                {MOLECULES.length} {translate('moleculeCount', locale)} ·{' '}
                {translate('moleculeSubtitle', locale)}
              </p>
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
