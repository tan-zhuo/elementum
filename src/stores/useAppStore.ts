import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CategoryKey, HeatmapKey, Locale } from '../types/element'

export const MAX_COMPARE = 3

interface AppState {
  locale: Locale
  /** Atomic number of the element whose detail panel is open, or null. */
  selected: number | null
  query: string
  /** Empty means "no category filter". */
  activeCategories: CategoryKey[]
  /** Null means colour by category. */
  heatmap: HeatmapKey | null
  /** Atomic numbers queued for side-by-side comparison, max `MAX_COMPARE`. */
  compare: number[]

  // 3D viewer preferences, persisted so they survive a reload.
  autoRotate: boolean
  animateElectrons: boolean
  showCloud: boolean
  /**
   * Whether the 3D viewer is maximised. Lives here rather than inside the viewer so
   * the detail panel's Escape handler knows to defer — Escape should leave
   * fullscreen before it closes the panel.
   */
  viewerFullscreen: boolean

  setLocale: (locale: Locale) => void
  toggleLocale: () => void
  select: (number: number | null) => void
  setQuery: (query: string) => void
  toggleCategory: (category: CategoryKey) => void
  setHeatmap: (key: HeatmapKey | null) => void
  toggleCompare: (number: number) => void
  clearCompare: () => void
  clearFilters: () => void
  setAutoRotate: (value: boolean) => void
  setAnimateElectrons: (value: boolean) => void
  setShowCloud: (value: boolean) => void
  setViewerFullscreen: (value: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      locale: 'zh',
      selected: null,
      query: '',
      activeCategories: [],
      heatmap: null,
      compare: [],
      autoRotate: true,
      animateElectrons: true,
      showCloud: false,
      viewerFullscreen: false,

      setLocale: (locale) => set({ locale }),
      toggleLocale: () => set((s) => ({ locale: s.locale === 'zh' ? 'en' : 'zh' })),
      // Closing the panel must also drop out of fullscreen, or the maximised viewer
      // would be left orphaned over an empty page.
      select: (selected) =>
        set(selected === null ? { selected, viewerFullscreen: false } : { selected }),
      setQuery: (query) => set({ query }),

      toggleCategory: (category) =>
        set((s) => ({
          activeCategories: s.activeCategories.includes(category)
            ? s.activeCategories.filter((c) => c !== category)
            : [...s.activeCategories, category],
        })),

      setHeatmap: (heatmap) => set({ heatmap }),

      toggleCompare: (number) =>
        set((s) => {
          if (s.compare.includes(number)) {
            return { compare: s.compare.filter((n) => n !== number) }
          }
          // Silently ignore additions past the cap; the button is disabled anyway.
          if (s.compare.length >= MAX_COMPARE) return s
          return { compare: [...s.compare, number] }
        }),

      clearCompare: () => set({ compare: [] }),
      clearFilters: () => set({ query: '', activeCategories: [], heatmap: null }),
      setAutoRotate: (autoRotate) => set({ autoRotate }),
      setAnimateElectrons: (animateElectrons) => set({ animateElectrons }),
      setShowCloud: (showCloud) => set({ showCloud }),
      setViewerFullscreen: (viewerFullscreen) => set({ viewerFullscreen }),
    }),
    {
      name: 'elementum-prefs',
      // Only preferences persist. Selection and filters are per-visit state.
      partialize: (s) => ({
        locale: s.locale,
        autoRotate: s.autoRotate,
        animateElectrons: s.animateElectrons,
        showCloud: s.showCloud,
      }),
    },
  ),
)
