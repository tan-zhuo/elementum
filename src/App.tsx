import { useEffect } from 'react'
import type { View } from './stores/useAppStore'
import { getElement } from './data/elements'
import { getMolecule } from './data/molecules'
import { useAppStore } from './stores/useAppStore'
import { translate } from './i18n'
import { PeriodicTable } from './components/PeriodicTable/PeriodicTable'
import { SearchBar } from './components/SearchBar/SearchBar'
import { CategoryFilter } from './components/CategoryFilter/CategoryFilter'
import { ElementDetail } from './components/ElementDetail/ElementDetail'
import { ComparePanel } from './components/ComparePanel/ComparePanel'
import { MoleculeGallery } from './components/MoleculeGallery/MoleculeGallery'
import { MoleculeDetail } from './components/MoleculeDetail/MoleculeDetail'

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
      <span className={locale === 'zh' ? 'text-cyan-300' : ''}>中</span>
      <span className="mx-1 text-slate-600">/</span>
      <span className={locale === 'en' ? 'text-cyan-300' : ''}>EN</span>
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
              ? 'bg-cyan-400/15 text-cyan-200'
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
      <header className="sticky top-0 z-20 border-b border-white/8 bg-[#05080f]/85 backdrop-blur">
        <div className="mx-auto flex max-w-[100rem] flex-col gap-3 px-3 py-3 sm:px-5">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex shrink-0 items-center gap-2.5">
              <span
                aria-hidden
                className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10"
              >
                <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.9)]" />
                <span className="absolute inset-0.5 rounded-md border border-cyan-300/25" />
                <span className="absolute inset-1.5 rotate-45 rounded-sm border border-cyan-300/20" />
              </span>
              <div className="hidden leading-tight xl:block">
                <h1 className="text-sm font-semibold text-slate-100">
                  {translate('appTitle', locale)}
                </h1>
                <p className="text-[10px] text-slate-500">{translate('appSubtitle', locale)}</p>
              </div>
            </div>

            <ViewSwitcher />

            <div className="min-w-0 flex-1">
              <SearchBar />
            </div>

            <LocaleToggle />
          </div>

          {/* Category and heat-map controls only apply to the periodic table. */}
          {view === 'elements' && <CategoryFilter />}
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
              <p className="text-xs text-slate-500">{translate('moleculeSubtitle', locale)}</p>
            </div>
            <MoleculeGallery />
          </>
        )}
      </main>

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
            className="fixed inset-y-0 right-0 z-40 w-full max-w-[64rem] border-l border-white/10 bg-[#05080f] shadow-2xl"
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
