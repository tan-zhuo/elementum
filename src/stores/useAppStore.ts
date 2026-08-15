import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CategoryKey, HeatmapKey, Locale } from '../types/element'
import type { MoleculeCategory, MoleculeStyle } from '../types/molecule'

/** Top-level section of the app. */
export type View = 'elements' | 'molecules'

export const MAX_COMPARE = 3

interface AppState {
  locale: Locale
  /** Which top-level section is showing. */
  view: View
  /** Id of the molecule whose detail panel is open, or null. */
  selectedMolecule: string | null
  /** Atomic number of the element whose detail panel is open, or null. */
  selected: number | null
  query: string
  /** Empty means "no category filter". */
  activeCategories: CategoryKey[]
  /** Empty means "no molecule category filter". */
  activeMoleculeCategories: MoleculeCategory[]
  /** Null means colour by category. */
  heatmap: HeatmapKey | null
  /** Atomic numbers queued for side-by-side comparison, max `MAX_COMPARE`. */
  compare: number[]

  // 3D viewer preferences, persisted so they survive a reload.
  autoRotate: boolean
  animateElectrons: boolean
  showCloud: boolean
  moleculeStyle: MoleculeStyle
  moleculeLabels: boolean
  /**
   * Whether the 3D viewer is maximised. Lives here rather than inside the viewer so
   * the detail panel's Escape handler knows to defer — Escape should leave
   * fullscreen before it closes the panel.
   */
  viewerFullscreen: boolean

  setLocale: (locale: Locale) => void
  toggleLocale: () => void
  setView: (view: View) => void
  selectMolecule: (id: string | null) => void
  select: (number: number | null) => void
  setQuery: (query: string) => void
  toggleCategory: (category: CategoryKey) => void
  toggleMoleculeCategory: (category: MoleculeCategory) => void
  setHeatmap: (key: HeatmapKey | null) => void
  toggleCompare: (number: number) => void
  clearCompare: () => void
  clearFilters: () => void
  setAutoRotate: (value: boolean) => void
  setAnimateElectrons: (value: boolean) => void
  setShowCloud: (value: boolean) => void
  setMoleculeStyle: (value: MoleculeStyle) => void
  setMoleculeLabels: (value: boolean) => void
  setViewerFullscreen: (value: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      locale: 'zh',
      view: 'elements',
      selectedMolecule: null,
      selected: null,
      query: '',
      activeCategories: [],
      activeMoleculeCategories: [],
      heatmap: null,
      compare: [],
      autoRotate: true,
      animateElectrons: true,
      showCloud: false,
      moleculeStyle: 'ball-stick',
      moleculeLabels: false,
      viewerFullscreen: false,

      setLocale: (locale) => set({ locale }),
      toggleLocale: () => set((s) => ({ locale: s.locale === 'zh' ? 'en' : 'zh' })),

      // Switching sections closes whatever detail panel was open, so the drawer
      // never outlives the view it belongs to.
      // Switching sections also clears the query, since the two searches index
      // completely different things.
      setView: (view) =>
        set({
          view,
          selected: null,
          selectedMolecule: null,
          viewerFullscreen: false,
          query: '',
          activeCategories: [],
          activeMoleculeCategories: [],
        }),

      selectMolecule: (selectedMolecule) =>
        set(
          selectedMolecule === null
            ? { selectedMolecule, viewerFullscreen: false }
            : { selectedMolecule },
        ),
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

      toggleMoleculeCategory: (category) =>
        set((s) => ({
          activeMoleculeCategories: s.activeMoleculeCategories.includes(category)
            ? s.activeMoleculeCategories.filter((c) => c !== category)
            : [...s.activeMoleculeCategories, category],
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
      clearFilters: () =>
        set({ query: '', activeCategories: [], activeMoleculeCategories: [], heatmap: null }),
      setAutoRotate: (autoRotate) => set({ autoRotate }),
      setAnimateElectrons: (animateElectrons) => set({ animateElectrons }),
      setShowCloud: (showCloud) => set({ showCloud }),
      setMoleculeStyle: (moleculeStyle) => set({ moleculeStyle }),
      setMoleculeLabels: (moleculeLabels) => set({ moleculeLabels }),
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
        moleculeStyle: s.moleculeStyle,
        moleculeLabels: s.moleculeLabels,
      }),
    },
  ),
)
