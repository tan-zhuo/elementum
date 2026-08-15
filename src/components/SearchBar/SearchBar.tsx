import { useEffect, useRef } from 'react'
import { searchElements } from '../../data/elements'
import { searchMolecules } from '../../data/molecules'
import { useAppStore } from '../../stores/useAppStore'
import { translate } from '../../i18n'

export function SearchBar() {
  const locale = useAppStore((s) => s.locale)
  const query = useAppStore((s) => s.query)
  const setQuery = useAppStore((s) => s.setQuery)
  const select = useAppStore((s) => s.select)
  const selectMolecule = useAppStore((s) => s.selectMolecule)
  const view = useAppStore((s) => s.view)
  const inputRef = useRef<HTMLInputElement>(null)

  // "/" focuses search, the way it does in most reference sites. Ignored while the
  // user is already typing somewhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      event.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const submitTopMatch = () => {
    if (view === 'molecules') {
      const [topMolecule] = searchMolecules(query)
      if (topMolecule === undefined) return
      selectMolecule(topMolecule)
      inputRef.current?.blur()
      return
    }
    const [top] = searchElements(query)
    if (top === undefined) return
    select(top)
    // Hand focus back to the document. Left in the input, the next Escape would be
    // swallowed here to clear the query instead of closing the panel the user just
    // opened.
    inputRef.current?.blur()
  }

  const placeholderKey = view === 'molecules' ? 'moleculeSearchPlaceholder' : 'searchPlaceholder'

  return (
    <div className="relative w-full">
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
      >
        <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M13.5 13.5 L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>

      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submitTopMatch()
          if (e.key === 'Escape') {
            setQuery('')
            inputRef.current?.blur()
          }
        }}
        placeholder={translate(placeholderKey, locale)}
        aria-label={translate(placeholderKey, locale)}
        className="accent-focus w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-sm sm:pr-16 sm:text-sm text-slate-100 placeholder:text-slate-500 [&::-webkit-search-cancel-button]:appearance-none"
      />

      {query ? (
        <button
          type="button"
          onClick={() => {
            setQuery('')
            inputRef.current?.focus()
          }}
          aria-label={translate('clearFilters', locale)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-slate-200"
        >
          ✕
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-500 sm:block">
          /
        </kbd>
      )}
    </div>
  )
}
