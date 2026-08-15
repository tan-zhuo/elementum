import { useEffect } from 'react'
import { getElement } from './data/elements'
import { useAppStore } from './stores/useAppStore'
import { translate } from './i18n'
import { PeriodicTable } from './components/PeriodicTable/PeriodicTable'
import { SearchBar } from './components/SearchBar/SearchBar'
import { CategoryFilter } from './components/CategoryFilter/CategoryFilter'
import { ElementDetail } from './components/ElementDetail/ElementDetail'
import { ComparePanel } from './components/ComparePanel/ComparePanel'

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

export default function App() {
  const locale = useAppStore((s) => s.locale)
  const selected = useAppStore((s) => s.selected)
  const select = useAppStore((s) => s.select)
  const element = selected !== null ? getElement(selected) : undefined

  // Keep the document language in sync so browsers pick the right font and
  // hyphenation rules for the two locales.
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    document.title =
      `${translate('appTitle', locale)} · ${translate('appSubtitle', locale)}`
  }, [locale])

  // The detail panel scrolls internally; locking the body avoids a second
  // scrollbar and the scroll-chaining that comes with it.
  useEffect(() => {
    if (!element) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [element])

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-[#05080f]/85 backdrop-blur">
        <div className="mx-auto flex max-w-[100rem] flex-col gap-3 px-3 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex shrink-0 items-center gap-2.5">
              <span
                aria-hidden
                className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10"
              >
                <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.9)]" />
                <span className="absolute inset-0.5 rounded-md border border-cyan-300/25" />
                <span className="absolute inset-1.5 rotate-45 rounded-sm border border-cyan-300/20" />
              </span>
              <div className="hidden leading-tight sm:block">
                <h1 className="text-sm font-semibold text-slate-100">
                  {translate('appTitle', locale)}
                </h1>
                <p className="text-[10px] text-slate-500">{translate('appSubtitle', locale)}</p>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <SearchBar />
            </div>

            <LocaleToggle />
          </div>

          <CategoryFilter />
        </div>
      </header>

      <main className="mx-auto max-w-[100rem] px-2 py-4 sm:px-5">
        <PeriodicTable />
      </main>

      <ComparePanel />

      {/* Detail drawer */}
      {element && (
        <>
          <div
            role="presentation"
            onClick={() => select(null)}
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={locale === 'zh' ? element.nameZh : element.name}
            className="fixed inset-y-0 right-0 z-40 w-full max-w-[64rem] border-l border-white/10 bg-[#05080f] shadow-2xl"
          >
            <ElementDetail element={element} />
          </div>
        </>
      )}
    </div>
  )
}
